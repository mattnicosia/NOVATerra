#!/usr/bin/env node
/* global process, console */
/**
 * Dead File Audit — finds orphaned .js/.jsx files never imported by any other file.
 *
 * Usage:
 *   node scripts/audit-dead-files.js          # report only
 *   node scripts/audit-dead-files.js --ci     # exit code 1 if dead files found
 *   node scripts/audit-dead-files.js --json   # output JSON
 */
import fs from "fs";
import path from "path";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(APP_DIR, "src");

// ── Collect all source files ────────────────────────────────────────
function getAllFiles(dir, ext = [".js", ".jsx"]) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "__tests__", ".git"].includes(entry.name)) continue;
      results.push(...getAllFiles(full, ext));
    } else if (ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

// ── Parse imports from a file ───────────────────────────────────────
function parseImports(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const imports = new Set();

  // Static imports: import X from "path", import { X } from "path"
  const staticRe = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = staticRe.exec(content))) imports.add(m[1]);

  // Side-effect imports: import "path"
  const sideRe = /import\s+['"]([^'"]+)['"]/g;
  while ((m = sideRe.exec(content))) imports.add(m[1]);

  // Dynamic imports: import("path")
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(content))) imports.add(m[1]);

  // require(): require("path")
  const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reqRe.exec(content))) imports.add(m[1]);

  return imports;
}

// ── Resolve an import specifier to an absolute file path ────────────
function resolveImport(specifier, fromFile) {
  // Skip node_modules / bare specifiers
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;

  // Resolve @/ alias
  let resolved;
  if (specifier.startsWith("@/")) {
    resolved = path.join(SRC_DIR, specifier.slice(2));
  } else {
    resolved = path.resolve(path.dirname(fromFile), specifier);
  }

  // Try exact, with extensions, and as directory index
  const candidates = [
    resolved,
    resolved + ".js",
    resolved + ".jsx",
    resolved + ".ts",
    resolved + ".tsx",
    path.join(resolved, "index.js"),
    path.join(resolved, "index.jsx"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────
const allFiles = getAllFiles(SRC_DIR);
const allFilesSet = new Set(allFiles);
const referenced = new Set();

// Entry points are always "alive"
const entryPoints = ["src/main.jsx", "src/App.jsx"].map(p => path.join(APP_DIR, p));
for (const ep of entryPoints) {
  if (fs.existsSync(ep)) referenced.add(ep);
}

// Build import graph
for (const file of allFiles) {
  const imports = parseImports(file);
  for (const spec of imports) {
    const resolved = resolveImport(spec, file);
    if (resolved && allFilesSet.has(resolved)) {
      referenced.add(resolved);
    }
  }
}

// Find dead files (unreferenced and not entry points)
const deadFiles = allFiles
  .filter(f => !referenced.has(f))
  .filter(f => !f.includes("__tests__"))
  .filter(f => !f.includes("test-setup"))
  .filter(f => !f.endsWith(".test.js") && !f.endsWith(".test.jsx"))
  .map(f => ({
    path: path.relative(APP_DIR, f),
    size: fs.statSync(f).size,
  }))
  .sort((a, b) => b.size - a.size);

const totalBytes = deadFiles.reduce((sum, f) => sum + f.size, 0);
const isCI = process.argv.includes("--ci");
const isJSON = process.argv.includes("--json");

if (isJSON) {
  console.log(JSON.stringify({ deadFiles, totalBytes, count: deadFiles.length }, null, 2));
} else {
  console.log("\n═══════════════════════════════════════════");
  console.log("  Dead File Audit");
  console.log("═══════════════════════════════════════════\n");

  if (deadFiles.length === 0) {
    console.log("  ✅ No dead files found!\n");
  } else {
    console.log(`  Found ${deadFiles.length} potentially unused files:\n`);
    for (const f of deadFiles) {
      const kb = (f.size / 1024).toFixed(1);
      console.log(`    ${f.path.padEnd(60)} ${kb} KB`);
    }
    console.log(`\n  Total: ${deadFiles.length} files, ${(totalBytes / 1024).toFixed(1)} KB of dead code`);
    console.log("\n  Note: Verify no dynamic imports reference these files.");
    console.log("  Some files may be entry points for Vercel serverless functions.\n");
  }
}

if (isCI && deadFiles.length > 0) {
  process.exit(1);
}
