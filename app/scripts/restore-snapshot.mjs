// Restore a local JSON snapshot into a Supabase project.
//
// USE WITH EXTREME CARE — this UPSERTs rows. Pointing it at production with
// a stale snapshot would overwrite newer data. Designed for restoring into a
// fresh/scratch project after disaster, not for routine production use.
//
// Usage (from app/):
//   node scripts/restore-snapshot.mjs --file=<path> --dry           # dry-run (parse + validate, no writes)
//   node scripts/restore-snapshot.mjs --file=<path> --target=scratch  # future: restore to scratch project
//   node scripts/restore-snapshot.mjs --file=<path> --force           # actually restore to target in env
//
// Default target is the project in .env.vercel-prod — which is PRODUCTION.
// --force is required to write. --dry is the default safe mode.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.vercel-prod");
  if (!fs.existsSync(envPath)) { console.error("[restore] .env.vercel-prod not found"); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const args = process.argv.slice(2);
const fileArg = args.find(a => a.startsWith("--file="))?.slice(7);
const dry = !args.includes("--force");

if (!fileArg) {
  console.error("Usage: node scripts/restore-snapshot.mjs --file=<snapshot.json> [--force]");
  console.error("  Default is dry-run. --force required to actually write.");
  process.exit(1);
}

const env = loadEnv();
const filePath = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) { console.error(`[restore] File not found: ${filePath}`); process.exit(1); }

const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (!snapshot.tables || !snapshot._meta) { console.error("[restore] Not a valid snapshot file"); process.exit(1); }

console.log(`[restore] Mode: ${dry ? "DRY-RUN (no writes)" : "FORCE (will write!)"}`);
console.log(`[restore] Source: ${filePath}`);
console.log(`[restore] Target: ${env.SUPABASE_URL}`);
console.log(`[restore] Snapshot created: ${snapshot._meta.createdAt}`);
console.log();

if (!dry) {
  console.log("[restore] ⚠️  FORCE mode — you have 5 seconds to abort (Ctrl+C)");
  await new Promise(r => setTimeout(r, 5000));
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Restore order matters for FKs: orgs first, then user-scoped, then children
const RESTORE_ORDER = [
  "organizations",
  "org_members",
  "org_invitations",
  "company_profiles",
  "contacts",
  "user_data",
  "user_estimates",
  "bid_packages",
  "bid_invitations",
  "living_proposals",
  "living_proposal_versions",
  "living_proposal_views",
  "living_proposal_comments",
];

// Conflict key per table — upsert on this column(s) so restore is idempotent
const CONFLICT_KEY = {
  user_estimates: "user_id,estimate_id",
  user_data: "user_id,key",
  // default: primary key id
};

let totalPlanned = 0, totalWritten = 0, errors = 0;

for (const t of RESTORE_ORDER) {
  const rows = snapshot.tables[t];
  if (!Array.isArray(rows)) {
    console.log(`  ${t.padEnd(28)} — skipped (no data in snapshot)`);
    continue;
  }
  if (rows.length === 0) {
    console.log(`  ${t.padEnd(28)} — 0 rows (nothing to restore)`);
    continue;
  }

  totalPlanned += rows.length;

  if (dry) {
    // Validate structure: check each row has required columns by inspecting first row
    const sample = rows[0];
    const keys = Object.keys(sample);
    const idLike = keys.find(k => k === "id" || k.endsWith("_id"));
    console.log(`  ${t.padEnd(28)} DRY  ${rows.length.toString().padStart(6)} rows — ${keys.length} cols, id-like: ${idLike || "(none)"}`);
    continue;
  }

  // Real restore: upsert in batches of 500
  const onConflict = CONFLICT_KEY[t] || "id";
  let written = 0, batchErr = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from(t).upsert(batch, { onConflict });
    if (error) {
      batchErr++;
      console.warn(`    ${t}: batch ${i}..${i + batch.length} failed — ${error.message}`);
    } else {
      written += batch.length;
    }
  }
  totalWritten += written;
  errors += batchErr;
  console.log(`  ${t.padEnd(28)} ${batchErr ? "⚠ " : "✓ "}${written}/${rows.length} rows written${batchErr ? ` (${batchErr} batch errors)` : ""}`);
}

console.log();
if (dry) {
  console.log(`[restore] DRY-RUN complete. ${totalPlanned} rows validated across ${RESTORE_ORDER.length} tables.`);
  console.log(`[restore] To actually restore, re-run with --force`);
} else {
  console.log(`[restore] ${errors === 0 ? "✓" : "⚠"} Wrote ${totalWritten}/${totalPlanned} rows${errors ? `, ${errors} batch errors` : ""}`);
}
