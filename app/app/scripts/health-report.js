#!/usr/bin/env node
/* global process, console */
/**
 * Code Health Report — generates metrics summary for CI or local review.
 *
 * Usage:
 *   node scripts/health-report.js             # markdown table
 *   node scripts/health-report.js --json      # JSON output
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: APP_DIR, encoding: "utf-8", timeout: 30000 }).trim();
  } catch {
    return "";
  }
}

function countFiles(dir, ext = [".js", ".jsx"], opts = {}) {
  const skipDirs = opts.skipDirs || ["node_modules", "dist", ".git"];
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue;
      count += countFiles(full, ext, opts);
    } else if (ext.some(e => entry.name.endsWith(e))) {
      if (opts.testOnly) {
        if (entry.name.endsWith(".test.js") || entry.name.endsWith(".test.jsx")) count++;
      } else if (!opts.excludeTests || !entry.name.match(/\.test\.(js|jsx)$/)) {
        count++;
      }
    }
  }
  return count;
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, "utf-8").split("\n").length;
}

// ── Gather metrics ──────────────────────────────────────────────────
const metrics = {};

// Source file count (excluding test files)
const srcDir = path.join(APP_DIR, "src");
metrics.sourceFiles = countFiles(srcDir, [".js", ".jsx"], { excludeTests: true });

// Test file count
metrics.testFiles = countFiles(srcDir, [".js", ".jsx"], { testOnly: true });

// Test count (parse vitest output)
const testOutput = run("npx vitest run --reporter=verbose 2>&1");
// Match the summary line: "Tests  679 passed (679)" — last occurrence of "N passed"
const allTestMatches = [...testOutput.matchAll(/(\d+) passed/g)];
const testMatch = allTestMatches.length > 0 ? allTestMatches[allTestMatches.length - 1] : null;
metrics.testsTotal = testMatch ? parseInt(testMatch[1]) : 0;
const testFileMatch = testOutput.match(/Test Files\s+(\d+) passed/);
metrics.testFilesRun = testFileMatch ? parseInt(testFileMatch[1]) : 0;

// ESLint warnings
const eslintOutput = run("npx eslint src/ --max-warnings 99999 2>&1 || true");
const warnCount = (eslintOutput.match(/warning/g) || []).length;
const errCount = (eslintOutput.match(/\berror\b/g) || []).length;
metrics.eslintWarnings = warnCount;
metrics.eslintErrors = errCount;

// God component sizes
metrics.takeoffsPageLines = countLines(path.join(APP_DIR, "src/pages/TakeoffsPage.jsx"));
metrics.estimatePageLines = countLines(path.join(APP_DIR, "src/pages/EstimatePage.jsx"));
metrics.planRoomPageLines = countLines(path.join(APP_DIR, "src/pages/PlanRoomPage.jsx"));

// Dead files
const deadOutput = run("node scripts/audit-dead-files.js --json 2>&1");
try {
  const dead = JSON.parse(deadOutput);
  metrics.deadFiles = dead.count;
  metrics.deadFileKB = (dead.totalBytes / 1024).toFixed(1);
} catch {
  metrics.deadFiles = "?";
  metrics.deadFileKB = "?";
}

// Bundle size (if dist exists)
const distDir = path.join(APP_DIR, "dist/assets");
if (fs.existsSync(distDir)) {
  let totalJS = 0;
  for (const f of fs.readdirSync(distDir)) {
    if (f.endsWith(".js")) totalJS += fs.statSync(path.join(distDir, f)).size;
  }
  metrics.bundleSizeMB = (totalJS / 1048576).toFixed(1);
} else {
  metrics.bundleSizeMB = "N/A (run build first)";
}

// Test-to-source ratio
metrics.testToSourceRatio =
  metrics.sourceFiles > 0 ? ((metrics.testFiles / metrics.sourceFiles) * 100).toFixed(1) : "0.0";

// Reliability score (out of 100)
function computeReliabilityScore(m) {
  let score = 0;
  // Lint (20 pts): 20 if 0 warnings+errors, -1 per warning, -3 per error
  score += Math.max(0, 20 - m.eslintWarnings - m.eslintErrors * 3);
  // Tests (30 pts): 1 pt per 30 tests, capped at 30
  score += Math.min(30, Math.floor(m.testsTotal / 30));
  // Dead code (15 pts): 15 if 0 dead files, -3 per dead file
  const deadCount = typeof m.deadFiles === "number" ? m.deadFiles : 0;
  score += Math.max(0, 15 - deadCount * 3);
  // Test file coverage (15 pts): ratio of test files to source files
  const ratio = m.sourceFiles > 0 ? m.testFiles / m.sourceFiles : 0;
  score += Math.min(15, Math.round(ratio * 300)); // 5% ratio = 15 pts
  // Build (10 pts): 10 if bundle exists
  score += m.bundleSizeMB !== "N/A (run build first)" ? 10 : 0;
  // God components (10 pts): penalty for files over 1000 lines
  const godPenalty = [m.takeoffsPageLines, m.estimatePageLines, m.planRoomPageLines].filter(l => l > 1000).length;
  score += Math.max(0, 10 - godPenalty * 3);
  return Math.min(100, score);
}
metrics.reliabilityScore = computeReliabilityScore(metrics);

metrics.date = new Date().toISOString().split("T")[0];

// ── Output ──────────────────────────────────────────────────────────
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  console.log(`
## Code Health Report — ${metrics.date}

| Metric | Value |
|--------|-------|
| **Reliability Score** | **${metrics.reliabilityScore}/100** |
| Source files | ${metrics.sourceFiles} |
| Test files | ${metrics.testFiles} |
| Tests passing | ${metrics.testsTotal} |
| Test / source ratio | ${metrics.testToSourceRatio}% |
| ESLint warnings | ${metrics.eslintWarnings} |
| ESLint errors | ${metrics.eslintErrors} |
| Dead files | ${metrics.deadFiles} (${metrics.deadFileKB} KB) |
| Bundle size (JS) | ${metrics.bundleSizeMB} MB |
| TakeoffsPage.jsx | ${metrics.takeoffsPageLines} lines |
| EstimatePage.jsx | ${metrics.estimatePageLines} lines |
| PlanRoomPage.jsx | ${metrics.planRoomPageLines} lines |
`);
}
