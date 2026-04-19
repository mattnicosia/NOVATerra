// Snapshot critical Supabase tables to a local timestamped JSON file.
//
// Usage (from app/):
//   node scripts/backup-snapshot.mjs           # writes to ../backups/
//   node scripts/backup-snapshot.mjs --verify  # also dry-run restores from the file
//
// Critical tables (fully dumped):
//   user_estimates   — the actual estimates (JSONB blob + normalized columns)
//   user_data        — settings / profiles / other user-scoped data
//   company_profiles, contacts
//   bid_packages, bid_invitations
//   organizations, org_members, org_invitations
//   living_proposals, living_proposal_versions
//
// Skipped (regenerable or platform-managed):
//   embeddings       — regenerate via scripts/backfill-history.mjs
//   recompute_log, estimate_locks, estimate_presence (transient)
//
// Schema is NOT captured — this is a data dump, not a DDL dump. Restoring
// requires the target DB to have the same schema (apply migrations first).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.vercel-prod
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.vercel-prod");
  if (!fs.existsSync(envPath)) { console.error("[backup] .env.vercel-prod not found"); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  "user_estimates",
  "user_data",
  "company_profiles",
  "contacts",
  "bid_packages",
  "bid_invitations",
  "organizations",
  "org_members",
  "org_invitations",
  "living_proposals",
  "living_proposal_versions",
  "living_proposal_views",
  "living_proposal_comments",
];

async function fetchTable(name) {
  // Paginate to handle tables larger than the default 1000-row limit
  const PAGE = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(name).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  const verify = process.argv.includes("--verify");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(__dirname, "..", "..", "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `novaterra-${ts}.json`);

  console.log(`[backup] Dumping ${TABLES.length} tables to ${outFile}`);
  const start = Date.now();
  const snapshot = {
    _meta: {
      createdAt: new Date().toISOString(),
      supabaseUrl: env.SUPABASE_URL,
      generator: "scripts/backup-snapshot.mjs",
      schemaVersion: "pre-2026-04-19",
    },
    tables: {},
  };

  let totalRows = 0;
  for (const t of TABLES) {
    try {
      const rows = await fetchTable(t);
      snapshot.tables[t] = rows;
      totalRows += rows.length;
      console.log(`  ${t.padEnd(28)} ${rows.length.toString().padStart(6)} rows`);
    } catch (err) {
      console.warn(`  ${t.padEnd(28)} FAILED: ${err.message}`);
      snapshot.tables[t] = { error: err.message };
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
  const bytes = fs.statSync(outFile).size;
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n[backup] ✓ Wrote ${totalRows} rows across ${TABLES.length} tables — ${mb} MB in ${seconds}s`);
  console.log(`[backup]   File: ${outFile}`);

  if (verify) {
    console.log("\n[backup] --verify: sanity-checking the dump is restorable...");
    const reloaded = JSON.parse(fs.readFileSync(outFile, "utf8"));
    let ok = true;
    for (const t of TABLES) {
      const raw = snapshot.tables[t];
      const back = reloaded.tables[t];
      if (Array.isArray(raw) && Array.isArray(back) && raw.length === back.length) {
        console.log(`  ${t.padEnd(28)} ✓ ${raw.length} rows match on re-read`);
      } else if (!Array.isArray(raw)) {
        console.log(`  ${t.padEnd(28)} ⚠ skipped (no data)`);
      } else {
        console.log(`  ${t.padEnd(28)} ✗ MISMATCH raw=${raw?.length} back=${back?.length}`);
        ok = false;
      }
    }
    console.log(ok ? "[backup] ✓ Snapshot verified readable" : "[backup] ✗ Snapshot verification FAILED");
  }

  console.log(`\nTo restore (dry-run steps — apply schema migrations first in target DB):`);
  console.log(`  1. jq '.tables.user_estimates' ${path.basename(outFile)} > restore-user-estimates.json`);
  console.log(`  2. Use Supabase dashboard → SQL editor → COPY ... FROM STDIN, OR`);
  console.log(`  3. Use a restore script (scripts/restore-snapshot.mjs — write when needed).`);
}

main().catch(err => { console.error("[backup] Fatal:", err); process.exit(1); });
