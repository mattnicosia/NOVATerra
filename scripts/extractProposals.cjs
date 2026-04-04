#!/usr/bin/env node
// ============================================================================
// NOVA Batch Proposal Extractor
// Reads PDFs from Proposals directory, classifies with Haiku, extracts with
// Sonnet, outputs structured JS for ROM calibration.
//
// Usage:
//   node scripts/extractProposals.cjs [options]
//
// Options:
//   --folder gc|sub|vendor   Process only one subfolder (default: gc)
//   --limit N                Process only first N files
//   --dry-run                Classify only, skip extraction
//   --resume                 Skip already-processed files (reads state file)
//   --concurrency N          Parallel API calls (default: 1)
//
// Requires:
//   ANTHROPIC_API_KEY env var
//   npm install pdf-parse    (run from repo root)
// ============================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Config ──────────────────────────────────────────────────────────────────
const PROPOSALS_ROOT = path.join(__dirname, "..", "Proposals");
const OUTPUT_FILE = path.join(__dirname, "..", "app", "src", "data", "extracted-proposals.js");
const STATE_FILE = path.join(__dirname, ".extract-state.json");

const FOLDER_MAP = {
  gc: "GC PROPOSALS",
  sub: "SUB PROPOSALS",
  vendor: "VENDOR QUOTES",
};

const HAIKU_MODEL = "claude-sonnet-4-20250514"; // Using Sonnet for both — Haiku model access may vary
const SONNET_MODEL = "claude-sonnet-4-20250514";
const API_BASE = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

const DELAY_MS = 1000;        // Delay between API calls
const MAX_RETRIES = 3;        // Retries per file on failure
const MAX_TEXT_CHARS = 80000;  // Truncate huge PDFs to keep costs sane

// ── CLI Args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] || defaultVal;
}
const hasFlag = (name) => args.includes(`--${name}`);

const folderKey = getArg("folder", "gc");
const limit = parseInt(getArg("limit", "999999"), 10);
const dryRun = hasFlag("dry-run");
const resume = hasFlag("resume");
const concurrency = parseInt(getArg("concurrency", "1"), 10);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: Set ANTHROPIC_API_KEY environment variable");
  console.error("  export ANTHROPIC_API_KEY=sk-ant-...");
  process.exit(1);
}

// ── PDF Text Extraction ─────────────────────────────────────────────────────
let pdfParse;
try {
  pdfParse = require("pdf-parse");
} catch {
  console.error("ERROR: pdf-parse not installed. Run:");
  console.error("  cd /Users/mattnicosia/Desktop/BLDG\\ Estimator && npm install pdf-parse@1.1.1");
  process.exit(1);
}

async function extractPdfText(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    let text = data.text || "";
    const pages = data.numpages || 0;
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS) + "\n\n[TRUNCATED — original was " + text.length + " chars]";
    }
    return { text, pages, ok: true };
  } catch (err) {
    return { text: "", pages: 0, ok: false, error: err.message };
  }
}

// ── Anthropic API Call ──────────────────────────────────────────────────────
function callAnthropic(model, systemPrompt, userMessage, maxTokens = 2048) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`API error (${res.statusCode}): ${parsed.error.type}: ${parsed.error.message}`));
            return;
          }
          const text = parsed.content?.[0]?.text || "";
          resolve({
            text,
            inputTokens: parsed.usage?.input_tokens || 0,
            outputTokens: parsed.usage?.output_tokens || 0,
          });
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nRaw: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Request timeout (120s)"));
    });
    req.write(body);
    req.end();
  });
}

// ── Pass 1: Classify ────────────────────────────────────────────────────────
const CLASSIFY_SYSTEM = `You are a construction document classifier. You analyze text extracted from PDFs and determine if they contain cost proposal data suitable for estimating calibration. Respond with valid JSON only, no markdown fences.`;

const CLASSIFY_PROMPT = `Given this construction document text, classify it. Return JSON:
{
  "isCostProposal": true/false,
  "format": "proest-report" | "clipper-budget" | "manual-proposal" | "budget-comparison" | "spreadsheet-export" | "other",
  "projectName": "string",
  "approximateTotal": number or null,
  "skipReason": "string or null"
}

Classification rules:
- isCostProposal = true if the document contains line-item or division-level cost breakdowns with dollar amounts
- ProEst reports: have "ProEst" branding, division numbers in left column, formatted cost tables
- Clipper budgets: have "Clipper" or "Budget" in header, division-organized
- Manual proposals: trade-by-trade or line-item breakdowns on letterhead
- Budget comparisons: side-by-side cost comparison of multiple scopes
- Spreadsheet exports: tabular data that looks like it came from Excel
- If this is NOT a cost proposal (bid form, SOW, drawings, material spec, leveling sheet, scope narrative, transmittal, insurance cert, contract), set isCostProposal=false and provide skipReason

Document text (first 15000 chars):
`;

async function classifyDocument(text, fileName) {
  const truncated = text.slice(0, 15000);
  const response = await callAnthropic(
    HAIKU_MODEL,
    CLASSIFY_SYSTEM,
    CLASSIFY_PROMPT + truncated,
    512
  );

  try {
    // Strip any markdown fences
    let cleaned = response.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to find JSON in the response
    const match = response.text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {
      isCostProposal: false,
      format: "unknown",
      projectName: fileName,
      approximateTotal: null,
      skipReason: "Classification returned invalid JSON",
    };
  }
}

// ── Pass 2: Extract ─────────────────────────────────────────────────────────
const EXTRACT_SYSTEM = `You are a construction cost data extractor. You parse proposal/estimate documents and output structured JSON. Respond with valid JSON only, no markdown fences. Be precise with numbers — do not round.`;

const EXTRACT_PROMPT = `Extract cost data from this construction proposal/estimate. Return JSON:
{
  "projectName": "string",
  "client": "string or null",
  "architect": "string or null",
  "totalCost": number,
  "projectSF": number or null,
  "jobType": "residential-single | commercial-office | retail | restaurant | healthcare | education | industrial | residential-multi | hospitality | mixed-use | government | religious | parking | automotive | entertainment | institutional",
  "workType": "new-construction | renovation | tenant-improvement | addition | sitework | demolition",
  "laborType": "open_shop | prevailing | union",
  "address": "string or null",
  "date": "YYYY-MM-DD or null",
  "divisions": {
    "01": cost_number,
    "02": cost_number
  },
  "confidence": "high | medium | low",
  "notes": "any caveats about the data quality"
}

CSI Division mapping:
01=General Requirements/Conditions/GC Overhead, 02=Existing Conditions/Demo/Abatement, 03=Concrete/Foundations, 04=Masonry, 05=Metals/Structural Steel/Misc Iron, 06=Wood/Plastics/Carpentry/Millwork, 07=Thermal/Moisture/Roofing/Waterproofing/Insulation, 08=Openings/Doors/Windows/Hardware, 09=Finishes/Drywall/Paint/Tile/Flooring, 10=Specialties/Accessories, 11=Equipment/Kitchen Equipment/Appliances, 12=Furnishings/Casework, 14=Conveying/Elevators, 21=Fire Suppression/Sprinkler, 22=Plumbing, 23=HVAC/Mechanical, 26=Electrical, 27=Communications/Low Voltage/AV, 28=Electronic Safety/Fire Alarm/Security, 31=Earthwork/Excavation/Grading, 32=Exterior/Sitework/Paving/Landscaping, 33=Utilities/Underground

Extraction rules:
- Map every line item to the closest CSI division code
- Sum all costs within each division
- If SF isn't explicitly stated, return null (don't guess)
- If labor type isn't clear, default to "open_shop"
- For ProEst reports: division codes are typically in the leftmost column
- For Clipper budgets: look for "Division" or "CSI" headers
- For manual proposals: map trade names to divisions (e.g., Electrical -> 26, Plumbing -> 22, HVAC -> 23, Drywall -> 09, Roofing -> 07)
- Include markups (GC overhead, profit, insurance, bonds) in totalCost but NOT in individual divisions
- Only include division keys that have non-zero costs
- If the total doesn't match the sum of divisions + markups, note the discrepancy
- confidence: "high" if clean tabular data with clear divisions, "medium" if some interpretation needed, "low" if significant guesswork

Document text:
`;

async function extractProposal(text, classification) {
  const response = await callAnthropic(
    SONNET_MODEL,
    EXTRACT_SYSTEM,
    EXTRACT_PROMPT + text,
    4096
  );

  try {
    let cleaned = response.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const data = JSON.parse(cleaned);

    // Validate required fields
    if (!data.totalCost || typeof data.totalCost !== "number") {
      data.notes = (data.notes || "") + " WARNING: totalCost missing or invalid.";
      data.confidence = "low";
    }
    if (!data.divisions || Object.keys(data.divisions).length === 0) {
      data.notes = (data.notes || "") + " WARNING: No division data extracted.";
      data.confidence = "low";
    }

    // Clean division values — ensure all are numbers
    if (data.divisions) {
      for (const [k, v] of Object.entries(data.divisions)) {
        if (typeof v !== "number") {
          const parsed = parseFloat(String(v).replace(/[,$]/g, ""));
          data.divisions[k] = isNaN(parsed) ? 0 : parsed;
        }
        // Remove zero-value divisions
        if (data.divisions[k] === 0) delete data.divisions[k];
      }
    }

    return { ...data, _tokens: { input: response.inputTokens, output: response.outputTokens } };
  } catch {
    // Try to find JSON in response
    const match = response.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

// ── State Management ────────────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { processed: {}, skipped: {}, failed: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatCost(n) {
  if (n == null) return "N/A";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function isProcessableFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".pdf";
}

// ── Output Writer ───────────────────────────────────────────────────────────
function writeOutput(proposals, skipped, failed, folder) {
  const date = new Date().toISOString().split("T")[0];
  const folderName = FOLDER_MAP[folder] || folder;

  let code = `// Auto-extracted from ${proposals.length} proposal PDFs on ${date}\n`;
  code += `// Source: Proposals/${folderName}\n`;
  code += `// Extracted by NOVA batch processor using Claude AI\n`;
  code += `// Review and correct any misclassified entries before importing\n\n`;
  code += `export const EXTRACTED_PROPOSALS = [\n`;

  for (const p of proposals) {
    code += `  {\n`;
    code += `    projectName: ${JSON.stringify(p.projectName || "Unknown")},\n`;
    code += `    client: ${JSON.stringify(p.client || null)},\n`;
    code += `    architect: ${JSON.stringify(p.architect || null)},\n`;
    code += `    totalCost: ${p.totalCost || 0},\n`;
    code += `    projectSF: ${p.projectSF || null},\n`;
    code += `    jobType: ${JSON.stringify(p.jobType || "unknown")},\n`;
    code += `    workType: ${JSON.stringify(p.workType || "unknown")},\n`;
    code += `    laborType: ${JSON.stringify(p.laborType || "open_shop")},\n`;
    code += `    address: ${JSON.stringify(p.address || null)},\n`;
    code += `    date: ${JSON.stringify(p.date || null)},\n`;
    code += `    divisions: {\n`;
    if (p.divisions) {
      const entries = Object.entries(p.divisions)
        .filter(([, v]) => v > 0)
        .sort(([a], [b]) => a.localeCompare(b));
      for (const [div, cost] of entries) {
        code += `      ${JSON.stringify(div)}: ${cost},\n`;
      }
    }
    code += `    },\n`;
    code += `    source: "pdf",\n`;
    code += `    sourceFileName: ${JSON.stringify(p.sourceFileName)},\n`;
    code += `    extractionConfidence: ${JSON.stringify(p.confidence || "medium")},\n`;
    code += `    extractionNotes: ${JSON.stringify(p.notes || "")},\n`;
    code += `  },\n`;
  }

  code += `];\n`;

  // Append skipped files as comments
  if (Object.keys(skipped).length > 0) {
    code += `\n// ── Skipped files (not cost proposals) ──\n`;
    for (const [file, reason] of Object.entries(skipped)) {
      code += `// - ${file}: ${JSON.stringify(reason)}\n`;
    }
  }

  // Append failed files as comments
  if (Object.keys(failed).length > 0) {
    code += `\n// ── Failed files (extraction errors) ──\n`;
    for (const [file, reason] of Object.entries(failed)) {
      code += `// - ${file}: ${JSON.stringify(reason)}\n`;
    }
  }

  // Ensure output directory exists
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, code, "utf-8");
  console.log(`\nOutput written to: ${OUTPUT_FILE}`);
}

// ── Cost Estimator ──────────────────────────────────────────────────────────
function estimateCost(classifiedCount, extractCount) {
  // Haiku: ~$0.25/M input, ~$1.25/M output. Avg ~3K input, ~200 output per classify
  const haikuCost = classifiedCount * (3000 * 0.25 / 1e6 + 200 * 1.25 / 1e6);
  // Sonnet: ~$3/M input, ~$15/M output. Avg ~20K input, ~1K output per extract
  const sonnetCost = extractCount * (20000 * 3 / 1e6 + 1000 * 15 / 1e6);
  return { haiku: haikuCost, sonnet: sonnetCost, total: haikuCost + sonnetCost };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const folderName = FOLDER_MAP[folderKey];
  if (!folderName) {
    console.error(`Unknown folder: ${folderKey}. Use: gc, sub, or vendor`);
    process.exit(1);
  }

  const proposalsDir = path.join(PROPOSALS_ROOT, folderName);
  if (!fs.existsSync(proposalsDir)) {
    console.error(`Proposals directory not found: ${proposalsDir}`);
    process.exit(1);
  }

  // Get file list
  const allFiles = fs.readdirSync(proposalsDir).filter(isProcessableFile);
  const files = allFiles.slice(0, limit);

  console.log(`\n========================================`);
  console.log(`  NOVA Batch Proposal Extractor`);
  console.log(`========================================`);
  console.log(`Folder:      ${folderName}`);
  console.log(`PDF files:   ${files.length} of ${allFiles.length}`);
  console.log(`Mode:        ${dryRun ? "DRY RUN (classify only)" : "Full extraction"}`);
  console.log(`Resume:      ${resume ? "Yes (skipping processed)" : "No"}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`========================================\n`);

  // Load state for resume
  const state = resume ? loadState() : { processed: {}, skipped: {}, failed: {} };

  const results = [];
  const skippedFiles = { ...state.skipped };
  const failedFiles = { ...state.failed };
  let extractedCount = 0;
  let skippedCount = Object.keys(skippedFiles).length;
  let failedCount = Object.keys(failedFiles).length;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(proposalsDir, fileName);
    const idx = `[${i + 1}/${files.length}]`;

    // Resume: skip already processed
    if (resume && (state.processed[fileName] || state.skipped[fileName] || state.failed[fileName])) {
      if (state.processed[fileName]) {
        results.push(state.processed[fileName]);
        extractedCount++;
      }
      continue;
    }

    // ── Step 1: Extract PDF text ──
    process.stdout.write(`${idx} Reading: ${fileName}... `);
    const { text, pages, ok, error } = await extractPdfText(filePath);

    if (!ok || text.length < 50) {
      const reason = error || "No text extracted (possibly scanned/encrypted)";
      console.log(`FAIL (${reason})`);
      failedFiles[fileName] = reason;
      failedCount++;
      state.failed[fileName] = reason;
      saveState(state);
      continue;
    }
    console.log(`${text.length} chars, ${pages} pages`);

    // ── Step 2: Classify ──
    process.stdout.write(`${idx} Classifying: ${fileName}... `);
    let classification;
    try {
      classification = await classifyDocument(text, fileName);
    } catch (err) {
      console.log(`CLASSIFY ERROR: ${err.message}`);
      failedFiles[fileName] = `Classification error: ${err.message}`;
      failedCount++;
      state.failed[fileName] = failedFiles[fileName];
      saveState(state);
      await sleep(DELAY_MS);
      continue;
    }

    if (!classification.isCostProposal) {
      const reason = classification.skipReason || "Not a cost proposal";
      console.log(`SKIP (${reason})`);
      skippedFiles[fileName] = reason;
      skippedCount++;
      state.skipped[fileName] = reason;
      saveState(state);
      await sleep(DELAY_MS);
      continue;
    }

    const format = classification.format || "unknown";
    const approxTotal = formatCost(classification.approximateTotal);
    console.log(`PROPOSAL (${format}, ~${approxTotal})`);

    if (dryRun) {
      await sleep(DELAY_MS);
      continue;
    }

    // ── Step 3: Extract ──
    process.stdout.write(`${idx} Extracting: ${fileName}... `);
    let extracted = null;
    let retries = 0;

    while (retries < MAX_RETRIES && !extracted) {
      try {
        extracted = await extractProposal(text, classification);
      } catch (err) {
        retries++;
        if (retries < MAX_RETRIES) {
          process.stdout.write(`retry ${retries}/${MAX_RETRIES}... `);
          await sleep(DELAY_MS * 2);
        } else {
          console.log(`EXTRACT ERROR: ${err.message}`);
          failedFiles[fileName] = `Extraction error after ${MAX_RETRIES} retries: ${err.message}`;
          failedCount++;
          state.failed[fileName] = failedFiles[fileName];
          saveState(state);
        }
      }
    }

    if (extracted) {
      const divCount = extracted.divisions ? Object.keys(extracted.divisions).length : 0;
      const total = formatCost(extracted.totalCost);
      const jType = extracted.jobType || "unknown";
      console.log(`${divCount} divisions, ${total}, ${jType}`);

      if (extracted._tokens) {
        totalInputTokens += extracted._tokens.input;
        totalOutputTokens += extracted._tokens.output;
      }

      const record = {
        ...extracted,
        sourceFileName: fileName,
        sourceFormat: format,
      };
      delete record._tokens;

      results.push(record);
      extractedCount++;
      state.processed[fileName] = record;
      saveState(state);
    }

    await sleep(DELAY_MS);
  }

  // ── Write output ──
  if (!dryRun && results.length > 0) {
    writeOutput(results, skippedFiles, failedFiles, folderKey);
  }

  // ── Summary ──
  console.log(`\n========================================`);
  console.log(`  Extraction Complete`);
  console.log(`========================================`);
  console.log(`Extracted:   ${extractedCount} proposals`);
  console.log(`Skipped:     ${skippedCount} files`);
  console.log(`Failed:      ${failedCount} files`);
  console.log(`Total:       ${extractedCount + skippedCount + failedCount}`);

  if (totalInputTokens > 0) {
    console.log(`\nToken usage (Sonnet extraction only):`);
    console.log(`  Input:  ${totalInputTokens.toLocaleString()} tokens`);
    console.log(`  Output: ${totalOutputTokens.toLocaleString()} tokens`);
  }

  const costEst = estimateCost(files.length, extractedCount);
  console.log(`\nEstimated cost:`);
  console.log(`  Haiku (classify):  $${costEst.haiku.toFixed(2)}`);
  console.log(`  Sonnet (extract):  $${costEst.sonnet.toFixed(2)}`);
  console.log(`  Total:             $${costEst.total.toFixed(2)}`);

  if (!dryRun && results.length > 0) {
    console.log(`\nOutput: ${OUTPUT_FILE}`);
  }

  if (dryRun) {
    console.log(`\n(Dry run — no extraction performed. Remove --dry-run to extract.)`);
  }

  console.log(`State saved: ${STATE_FILE}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
