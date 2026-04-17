// novaPdfAttach.js — PDF attachment helpers for NOVA Chat (Phase 1)
// When the user references a drawing (e.g. "what's on A101?") we look up the
// raw PDF, base64-encode it, and attach as an Anthropic document block with
// prompt cache_control. This lets Claude read dimensions, callouts, and
// schedule text verbatim instead of guessing from a compressed JPEG.

import { loadPdfRawFromIDB } from "@/utils/uploadPipeline";

const PER_PDF_KB_CAP = 8000;     // 8 MB per PDF — keeps total request under ~24 MB
const MAX_PDFS_PER_QUERY = 3;    // also matches Anthropic's 4-breakpoint cache limit (1 system + 3 docs)

// ── Feature flag ─────────────────────────────────────────────────
export function isPdfModeEnabled() {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem("nova_pdf_mode") !== "off";
}

// ── Convert an ArrayBuffer to base64 in chunks (avoids stack overflow) ──
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

// ── Get raw PDF base64 for a drawing using the same lookup chain as vectorExtractor ──
// Returns { base64, sizeKB, source } or null.
export async function getDrawingPdfBase64(drawing) {
  if (!drawing) return null;

  // 1. Drawing.data if it's already PDF
  if (typeof drawing.data === "string") {
    if (drawing.data.startsWith("data:application/pdf")) {
      const b = drawing.data.split(",")[1];
      return { base64: b, sizeKB: Math.round((b.length * 0.75) / 1024), source: "drawing.data" };
    }
    if (drawing.data.startsWith("JVBERi")) {
      return { base64: drawing.data, sizeKB: Math.round((drawing.data.length * 0.75) / 1024), source: "drawing.data(raw)" };
    }
  }

  // 2. Drawing-level PDF fields
  for (const field of ["sourceFileData", "pdfData"]) {
    const v = drawing[field];
    if (typeof v === "string" && v.length > 100) {
      const b = v.startsWith("data:") ? v.split(",")[1] : v;
      return { base64: b, sizeKB: Math.round((b.length * 0.75) / 1024), source: `drawing.${field}` };
    }
  }

  // 3. IndexedDB raw PDF store (the canonical location)
  const fileName = drawing.fileName || drawing.sourceFileName || drawing.name;
  if (fileName) {
    try {
      const arrayBuffer = await loadPdfRawFromIDB(fileName);
      if (arrayBuffer && arrayBuffer.byteLength > 100) {
        return {
          base64: arrayBufferToBase64(arrayBuffer),
          sizeKB: Math.round(arrayBuffer.byteLength / 1024),
          source: "idb",
        };
      }
    } catch (err) {
      console.warn("[novaPdfAttach] IDB lookup failed:", err?.message || err);
    }
  }

  return null;
}

// ── Detect drawing references in a user query ──
// Matches sheet numbers (A101, A-101, S2.1, MEP-3, M101, etc.) against the drawings
// list and returns matched drawing objects.
export function detectDrawingReferences(text, drawings) {
  if (!text || !Array.isArray(drawings) || drawings.length === 0) return [];

  // Normalize: strip dashes/dots/spaces, lowercase
  const norm = s => String(s || "").toLowerCase().replace(/[\s\-\.]/g, "");

  // Pattern: 1-3 letters + optional separator + 1-3 digits + optional .digits
  const sheetPattern = /\b([A-Z]{1,3}[-\.\s]?\d{1,3}(?:\.\d{1,2})?[A-Z]?)\b/gi;
  const referenced = new Set(
    [...text.matchAll(sheetPattern)].map(m => norm(m[1])),
  );

  if (referenced.size === 0) return [];

  const matched = [];
  const seen = new Set();
  for (const d of drawings) {
    if (seen.has(d.id)) continue;
    const sheetNorms = [d.sheetNumber, d.label, d.sheetTitle].filter(Boolean).map(norm);
    if (sheetNorms.some(sn => sn && referenced.has(sn))) {
      matched.push(d);
      seen.add(d.id);
    }
  }
  return matched;
}

// ── Build a content array for an Anthropic user message with PDF attachments ──
// Documents go first per Anthropic's recommendation — text last so the question
// references the documents above. Each PDF gets cache_control: ephemeral so
// follow-up questions about the same sheet hit the cache.
export function buildUserContentWithPdfs(text, pdfAttachments) {
  if (!pdfAttachments?.length) return text;
  const blocks = [];
  for (const { drawing, pdf } of pdfAttachments) {
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
      title: `Sheet ${drawing.sheetNumber || drawing.label || drawing.id.slice(0, 6)}${drawing.sheetTitle ? ` — ${drawing.sheetTitle}` : ""}`,
      cache_control: { type: "ephemeral" },
    });
  }
  blocks.push({ type: "text", text });
  return blocks;
}

// ── Strip document blocks from older user messages ──
// PDFs are sent only with the current turn. This keeps the request payload
// small (Vercel 50MB cap) and avoids re-encoding huge PDFs every iteration.
// Anthropic's prompt cache still hits if the user asks a follow-up within 5 min.
export function stripPdfBlocksFromHistory(messages) {
  return messages.map(msg => {
    if (msg.role !== "user" || !Array.isArray(msg.content)) return msg;
    const filtered = msg.content.filter(c => c.type !== "document");
    if (filtered.length === 0) return msg;
    if (filtered.length === 1 && filtered[0].type === "text") {
      return { ...msg, content: filtered[0].text };
    }
    return { ...msg, content: filtered };
  });
}

// ── High-level: detect references → fetch PDFs → return ready attachments ──
export async function attachReferencedPdfs(userText, drawings) {
  if (!isPdfModeEnabled()) return [];
  const matches = detectDrawingReferences(userText, drawings);
  if (matches.length === 0) return [];

  const attachments = [];
  for (const drawing of matches.slice(0, MAX_PDFS_PER_QUERY)) {
    try {
      const pdf = await getDrawingPdfBase64(drawing);
      if (pdf && pdf.sizeKB > 0 && pdf.sizeKB < PER_PDF_KB_CAP) {
        attachments.push({ drawing, pdf });
      } else if (pdf) {
        console.warn(`[novaPdfAttach] Skipping ${drawing.sheetNumber} — too large (${pdf.sizeKB}KB > ${PER_PDF_KB_CAP}KB)`);
      }
    } catch (err) {
      console.warn(`[novaPdfAttach] Fetch failed for ${drawing.sheetNumber}:`, err?.message || err);
    }
  }
  return attachments;
}
