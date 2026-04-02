#!/usr/bin/env node
// Batch Proposal Ingestion Script
// Reads local PDFs, classifies via Haiku, parses via Sonnet, stores in Supabase
// Usage: node scripts/batch-ingest.js [--folder gc|sub|vendor] [--limit N] [--dry-run]

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── Config ──
const API_URL = "https://app-nova-42373ca7.vercel.app/api/batch-parse";
const PROPOSALS_DIR = path.join(__dirname, "..", "Proposals");
const STATE_FILE = path.join(__dirname, ".batch-state.json");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Parse CLI args
const args = process.argv.slice(2);
const folderFilter = args.includes("--folder") ? args[args.indexOf("--folder") + 1] : null;
const limit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1]) : Infinity;
const dryRun = args.includes("--dry-run");
let token = args.includes("--token") ? args[args.indexOf("--token") + 1] : process.env.SUPABASE_TOKEN;
const email = args.includes("--email") ? args[args.indexOf("--email") + 1] : null;
const password = args.includes("--password") ? args[args.indexOf("--password") + 1] : null;

const SUPABASE_URL = "https://pgmefhgbygkqfzcvwxqv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnbWVmaGdieWdrcWZ6Y3Z3eHF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzg2MzIsImV4cCI6MjA4Njk1NDYzMn0._SE4dwGPYoPS1ZetA7VaXaXciqdT5cnAatyBGytjFs8";

async function getToken() {
  if (token) return token;
  if (!email || !password) {
    console.error("ERROR: Pass --email <email> --password <pwd> OR --token <jwt>");
    process.exit(1);
  }
  // Sign in via Supabase REST API
  const data = JSON.stringify({ email, password });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "pgmefhgbygkqfzcvwxqv.supabase.co",
      path: "/auth/v1/token?grant_type=password",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        apikey: SUPABASE_ANON_KEY,
      },
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (json.access_token) {
            console.log("  Authenticated as:", json.user?.email);
            resolve(json.access_token);
          } else {
            reject(new Error("Auth failed: " + (json.error_description || json.msg || body)));
          }
        } catch { reject(new Error("Auth parse error")); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

if (!token && !email && !dryRun) {
  console.error("ERROR: Pass --email <email> --password <pwd> OR --token <jwt>");
  process.exit(1);
}

// ── State management (resumable) ──
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return { processed: {}, stats: { classified: 0, parsed: 0, skipped: 0, errors: 0, cost: 0 } }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Discover files ──
function discoverFiles() {
  const folders = [
    { dir: path.join(PROPOSALS_DIR, "GC PROPOSALS"), type: "gc" },
    { dir: path.join(PROPOSALS_DIR, "SUB PROPOSALS"), type: "sub" },
    { dir: path.join(PROPOSALS_DIR, "VENDOR QUOTES"), type: "vendor" },
  ];

  const files = [];
  for (const { dir, type } of folders) {
    if (folderFilter && type !== folderFilter) continue;
    if (!fs.existsSync(dir)) { console.warn(`Folder not found: ${dir}`); continue; }

    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }

        const ext = path.extname(entry.name).toLowerCase();
        if (![".pdf", ".xlsx", ".docx", ".doc"].includes(ext)) continue;

        const stat = fs.statSync(full);
        if (stat.size > MAX_FILE_SIZE) { console.log(`  SKIP (too large): ${entry.name} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`); continue; }
        if (stat.size < 100) continue; // Skip empty/tiny files

        files.push({
          path: full,
          name: entry.name,
          size: stat.size,
          folderType: type,
          fileId: `local:${type}:${entry.name}`, // Unique ID for state tracking
        });
      }
    };
    walk(dir);
  }

  return files;
}

// ── API call helper ──
function callAPI(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(API_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        Authorization: `Bearer ${token}`,
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: { raw: body } }); }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.write(data);
    req.end();
  });
}

// ── Process one file ──
async function processFile(file, state) {
  // Skip if already processed
  if (state.processed[file.fileId]) {
    return state.processed[file.fileId];
  }

  const pdfBase64 = fs.readFileSync(file.path).toString("base64");

  // Step 1: Classify
  console.log(`  [classify] ${file.name} (${(file.size / 1024).toFixed(0)}KB, ${file.folderType})`);

  if (dryRun) {
    state.processed[file.fileId] = "dry-run";
    return "dry-run";
  }

  try {
    const classifyRes = await callAPI({
      action: "classify",
      fileId: file.fileId,
      filename: file.name,
      filePath: file.path,
      fileSize: file.size,
      folderType: file.folderType,
      pdfBase64,
    });

    if (classifyRes.status !== 200) {
      console.log(`    ERROR: ${classifyRes.data?.error || classifyRes.status}`);
      state.stats.errors++;
      state.processed[file.fileId] = "error";
      return "error";
    }

    state.stats.cost += 0.01;

    if (classifyRes.data.status === "already_processed") {
      console.log(`    Already processed`);
      state.processed[file.fileId] = "already";
      return "already";
    }

    const cl = classifyRes.data.classification;
    console.log(`    → ${cl?.documentType} | ${cl?.companyName || "?"} | $${cl?.totalBid?.toLocaleString() || "?"} | parse: ${cl?.worthFullParse}`);

    if (!cl?.worthFullParse) {
      state.stats.skipped++;
      state.processed[file.fileId] = "skipped";
      saveState(state);
      return "skipped";
    }

    state.stats.classified++;

    // Step 2: Full parse
    console.log(`  [parse] ${file.name}`);
    const parseRes = await callAPI({
      action: "parse",
      fileId: file.fileId,
      pdfBase64,
      docType: cl.documentType,
      folderType: file.folderType,
    });

    state.stats.cost += 0.15;

    if (parseRes.status !== 200) {
      console.log(`    PARSE ERROR: ${parseRes.data?.error || parseRes.status}`);
      state.stats.errors++;
      state.processed[file.fileId] = "parse-error";
      saveState(state);
      return "parse-error";
    }

    const pd = parseRes.data.parsedData;
    console.log(`    → $${pd?.totalBid?.toLocaleString() || "?"} | ${pd?.lineItems?.length || 0} items | confidence: ${pd?.confidence}`);

    state.stats.parsed++;
    state.processed[file.fileId] = "parsed";
    saveState(state);
    return "parsed";

  } catch (err) {
    console.log(`    EXCEPTION: ${err.message}`);
    state.stats.errors++;
    state.processed[file.fileId] = "error";
    saveState(state);
    return "error";
  }
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  BLDG Batch Proposal Ingestion");
  console.log("═══════════════════════════════════════════════════");

  if (!dryRun) {
    token = await getToken();
  }

  const files = discoverFiles();
  const state = loadState();

  const pending = files.filter(f => !state.processed[f.fileId]);
  const toProcess = pending.slice(0, limit);

  console.log(`\nFiles found: ${files.length}`);
  console.log(`Already processed: ${files.length - pending.length}`);
  console.log(`To process: ${toProcess.length}${limit < Infinity ? ` (limited to ${limit})` : ""}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Estimated cost: ~$${(toProcess.length * 0.08).toFixed(2)} (avg classify + ~50% parse rate)`);
  console.log("");

  if (toProcess.length === 0) {
    console.log("Nothing to process. All files already handled.");
    return;
  }

  let count = 0;
  for (const file of toProcess) {
    count++;
    console.log(`\n[${count}/${toProcess.length}] ──────────────────────`);
    await processFile(file, state);

    // Rate limit: 1.5s between files
    if (count < toProcess.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  saveState(state);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Classified: ${state.stats.classified}`);
  console.log(`  Parsed:     ${state.stats.parsed}`);
  console.log(`  Skipped:    ${state.stats.skipped}`);
  console.log(`  Errors:     ${state.stats.errors}`);
  console.log(`  Est. Cost:  ~$${state.stats.cost.toFixed(2)}`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
