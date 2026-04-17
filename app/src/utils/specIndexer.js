// specIndexer — User-uploaded spec book ingestion.
//
// Parses a construction spec book PDF (CSI MasterFormat 2016+) into sections,
// embeds each section, and stores in the `embeddings` table with kind='spec'.
// NOVA's search_specs tool then queries these for grounded spec answers.
//
// Section chunking: MasterFormat sections look like "SECTION 03 30 00 - CAST-IN-PLACE CONCRETE".
// We split on these headers and keep the full section body (Part 1/2/3) as one chunk.
// Long sections (>8k chars) are split by Part (1=GENERAL, 2=PRODUCTS, 3=EXECUTION).
//
// Source ID convention: `${specBookId}:${sectionNumber.replace(/\s/g, "")}`

import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { loadPdfJs } from "@/utils/pdf";
import { uid } from "@/utils/format";

const MAX_CHARS_PER_CHUNK = 8000;
const EMBED_BATCH = 50;
const SECTION_HEADER_RE = /SECTION\s+(\d{2}\s+\d{2}\s+\d{2}(?:\.\d+)?)\s*[-–—]?\s*([A-Z][A-Z0-9 ,\-\/\(\)'&\.]+)/gm;
const DIVISION_FROM_SECTION = sec => {
  const m = String(sec || "").match(/^(\d{2})/);
  return m ? `${m[1]} - ${csiDivisionName(m[1])}` : "";
};

function csiDivisionName(code) {
  const map = {
    "00": "Procurement & Contracting", "01": "General Requirements", "02": "Existing Conditions",
    "03": "Concrete", "04": "Masonry", "05": "Metals", "06": "Wood, Plastics, Composites",
    "07": "Thermal & Moisture Protection", "08": "Openings", "09": "Finishes",
    "10": "Specialties", "11": "Equipment", "12": "Furnishings", "13": "Special Construction",
    "14": "Conveying Equipment", "21": "Fire Suppression", "22": "Plumbing",
    "23": "HVAC", "25": "Integrated Automation", "26": "Electrical", "27": "Communications",
    "28": "Electronic Safety & Security", "31": "Earthwork", "32": "Exterior Improvements",
    "33": "Utilities", "34": "Transportation",
  };
  return map[code] || "Unknown";
}

// ─── Token helpers ───────────────────────────────────────────────
async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

// ─── PDF → text ──────────────────────────────────────────────────
async function extractPdfText(file) {
  await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    // Join with single space; preserve newlines at item-level via y-coord groups
    let lastY = null;
    const line = [];
    const out = [];
    for (const item of textContent.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out.push(line.join(" "));
        line.length = 0;
      }
      line.push(item.str);
      lastY = y;
    }
    if (line.length) out.push(line.join(" "));
    pages.push({ page: p, text: out.join("\n") });
  }
  return pages;
}

// ─── Text → sections ─────────────────────────────────────────────
export function parseSpecSections(pagesText) {
  // Combine all pages with page markers for page-range metadata
  const combined = pagesText.map(p => `\n[[PAGE:${p.page}]]\n${p.text}`).join("\n");

  const headers = [];
  let m;
  SECTION_HEADER_RE.lastIndex = 0;
  while ((m = SECTION_HEADER_RE.exec(combined)) !== null) {
    headers.push({ index: m.index, sectionNumber: m[1].trim(), sectionTitle: (m[2] || "").trim() });
  }

  if (headers.length === 0) {
    // No CSI headers — fall back to "one section per 6000 chars"
    const raw = combined.replace(/\[\[PAGE:\d+\]\]/g, "").trim();
    if (raw.length < 200) return [];
    return [{
      sectionNumber: "00 00 00",
      sectionTitle: "Untitled Spec Book",
      text: raw,
      division: "00 - Procurement & Contracting",
      pageStart: 1,
      pageEnd: pagesText.length,
    }];
  }

  const sections = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : combined.length;
    const slab = combined.slice(start, end);

    // Extract page range from page markers inside the section
    const pageMatches = [...slab.matchAll(/\[\[PAGE:(\d+)\]\]/g)].map(m => Number(m[1]));
    const pageStart = pageMatches[0] || 0;
    const pageEnd = pageMatches[pageMatches.length - 1] || pageStart;

    // Clean text: remove page markers, collapse whitespace
    const cleanText = slab
      .replace(/\[\[PAGE:\d+\]\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanText.length < 100) continue;

    sections.push({
      sectionNumber: headers[i].sectionNumber,
      sectionTitle: headers[i].sectionTitle,
      text: cleanText,
      division: DIVISION_FROM_SECTION(headers[i].sectionNumber),
      pageStart,
      pageEnd,
    });
  }
  return sections;
}

// Split a long section into Part 1/2/3 chunks when it exceeds the token budget.
function splitIfLong(section) {
  if (section.text.length <= MAX_CHARS_PER_CHUNK) return [section];
  const parts = [];
  const partRe = /PART\s+([123])\s*[-–—]?\s*(GENERAL|PRODUCTS|EXECUTION)/gi;
  const matches = [...section.text.matchAll(partRe)];
  if (matches.length < 2) {
    // Fall back to char-based splits
    const chunks = [];
    let start = 0;
    let idx = 1;
    while (start < section.text.length) {
      const end = Math.min(start + MAX_CHARS_PER_CHUNK, section.text.length);
      chunks.push({ ...section, sectionTitle: `${section.sectionTitle} (${idx})`, text: section.text.slice(start, end) });
      start = end;
      idx++;
    }
    return chunks;
  }
  for (let i = 0; i < matches.length; i++) {
    const partStart = matches[i].index;
    const partEnd = i + 1 < matches.length ? matches[i + 1].index : section.text.length;
    const partNum = matches[i][1];
    const partName = matches[i][2].toUpperCase();
    parts.push({
      ...section,
      sectionTitle: `${section.sectionTitle} — Part ${partNum} ${partName}`,
      text: section.text.slice(partStart, partEnd),
      partNumber: partNum,
    });
  }
  return parts;
}

// ─── Embed + store ───────────────────────────────────────────────
async function embedTexts(texts) {
  const token = await getAuthToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ texts }),
  });
  if (!resp.ok) throw new Error(`Embed API ${resp.status}`);
  const data = await resp.json();
  return data.embeddings;
}

// ─── Public: index a spec book PDF ───────────────────────────────
// Returns: { specBookId, sectionCount, chunkCount, sections: [{number, title, chars}] }
export async function indexSpecBook(file, meta = {}, onProgress = null) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not signed in");
  if (!file || file.type !== "application/pdf") throw new Error("PDF file required");

  const specBookId = meta.specBookId || uid();
  const specBookName = meta.name || file.name || "Untitled Spec Book";

  onProgress?.({ phase: "parsing", progress: 5 });
  const pagesText = await extractPdfText(file);
  onProgress?.({ phase: "parsing", progress: 30, pages: pagesText.length });

  const rawSections = parseSpecSections(pagesText);
  if (rawSections.length === 0) throw new Error("No spec sections detected — PDF may not be a spec book");

  // Split long sections into Part 1/2/3
  const chunks = [];
  for (const sec of rawSections) {
    for (const chunk of splitIfLong(sec)) chunks.push(chunk);
  }

  onProgress?.({ phase: "embedding", progress: 40, chunks: chunks.length });

  // Build texts + metadata for each chunk
  const texts = chunks.map(c => `${c.sectionNumber} ${c.sectionTitle}\n\n${c.text}`.slice(0, 6000));
  const metadatas = chunks.map(c => ({
    specBookId,
    specBookName,
    sectionNumber: c.sectionNumber,
    sectionTitle: c.sectionTitle,
    division: c.division,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    partNumber: c.partNumber || null,
    uploadedAt: new Date().toISOString(),
  }));

  // Embed in batches of 50
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const vecs = await embedTexts(batch);
    allEmbeddings.push(...vecs);
    const pct = 40 + Math.round(((i + batch.length) / texts.length) * 50);
    onProgress?.({ phase: "embedding", progress: pct, done: i + batch.length, total: texts.length });
  }

  // Build records
  const records = texts.map((text, i) => ({
    kind: "spec",
    source_id: `${specBookId}:${metadatas[i].sectionNumber.replace(/\s/g, "")}${metadatas[i].partNumber ? `:p${metadatas[i].partNumber}` : ""}`,
    user_id: userId,
    content: text,
    metadata: metadatas[i],
    embedding: `[${allEmbeddings[i].join(",")}]`,
  }));

  onProgress?.({ phase: "storing", progress: 92 });

  // Replace any existing embeddings for this specBookId, then insert fresh
  await supabase
    .from("embeddings")
    .delete()
    .eq("kind", "spec")
    .eq("user_id", userId)
    .like("source_id", `${specBookId}:%`);

  // Insert in batches (Supabase has a ~1000-row limit per insert)
  const INSERT_BATCH = 200;
  for (let i = 0; i < records.length; i += INSERT_BATCH) {
    const { error } = await supabase.from("embeddings").insert(records.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  }

  onProgress?.({ phase: "done", progress: 100 });

  return {
    specBookId,
    specBookName,
    sectionCount: rawSections.length,
    chunkCount: records.length,
    sections: rawSections.map(s => ({ number: s.sectionNumber, title: s.sectionTitle, chars: s.text.length })),
  };
}

// ─── Remove a spec book's embeddings ─────────────────────────────
export async function removeSpecBook(specBookId) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !specBookId) return { removed: 0 };
  const { error, count } = await supabase
    .from("embeddings")
    .delete({ count: "exact" })
    .eq("kind", "spec")
    .eq("user_id", userId)
    .like("source_id", `${specBookId}:%`);
  if (error) throw new Error(error.message);
  return { removed: count || 0 };
}

// ─── List the user's indexed spec books ──────────────────────────
export async function listSpecBooks() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("embeddings")
    .select("metadata")
    .eq("kind", "spec")
    .eq("user_id", userId)
    .limit(2000);
  if (error) return [];
  const byBook = new Map();
  for (const row of data || []) {
    const m = row.metadata || {};
    const id = m.specBookId;
    if (!id) continue;
    if (!byBook.has(id)) {
      byBook.set(id, {
        specBookId: id,
        name: m.specBookName || "Untitled",
        uploadedAt: m.uploadedAt,
        sectionCount: 0,
        divisions: new Set(),
      });
    }
    const book = byBook.get(id);
    book.sectionCount += 1;
    if (m.division) book.divisions.add(m.division);
  }
  return [...byBook.values()].map(b => ({ ...b, divisions: [...b.divisions] }));
}

// Expose to console for manual indexing during MVP — `await window.__novaIndexSpec(file)`
if (typeof window !== "undefined") {
  window.__novaIndexSpec = (file, onProgress) =>
    indexSpecBook(
      file,
      {},
      onProgress || (p => console.log(`[specIndex] ${p.phase} ${p.progress}%`, p)),
    );
  window.__novaListSpecs = () => listSpecBooks();
  window.__novaRemoveSpec = id => removeSpecBook(id);
}
