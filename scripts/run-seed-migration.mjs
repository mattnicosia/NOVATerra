#!/usr/bin/env node
/**
 * Seed Embeddings Migration Script
 *
 * Reads SEED_ELEMENTS and SEED_ASSEMBLIES from the constants file,
 * then POSTs them to the production /api/seed-embeddings endpoint
 * in batches to avoid serverless function timeouts.
 *
 * Usage: node scripts/run-seed-migration.mjs
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://app-nova-42373ca7.vercel.app';
const ADMIN_SECRET = 'b9d02944105b1ec7530f3b13796c97f6020bab89fec772776662c6a8c608df1a';
const CLIENT_BATCH_SIZE = 100; // Elements per request (server also batches internally at 100)

// Read the seed data file
const seedFile = readFileSync(resolve(__dirname, '../src/constants/seedAssemblies.js'), 'utf-8');

// Extract JS array from source using Function constructor
function extractArray(source, varName) {
  const startPattern = new RegExp(`export\\s+const\\s+${varName}\\s*=\\s*\\[`);
  const match = source.match(startPattern);
  if (!match) {
    console.error(`Could not find ${varName} in source`);
    return [];
  }

  const startIdx = source.indexOf('[', match.index);
  let depth = 0;
  let endIdx = startIdx;

  for (let i = startIdx; i < source.length; i++) {
    if (source[i] === '[') depth++;
    if (source[i] === ']') depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  const arrayStr = source.slice(startIdx, endIdx).replace(/\/\/[^\n]*/g, '');

  try {
    const fn = new Function(`return ${arrayStr}`);
    return fn();
  } catch (err) {
    console.error(`Failed to parse ${varName}:`, err.message);
    return [];
  }
}

const elements = extractArray(seedFile, 'SEED_ELEMENTS');
const assemblies = extractArray(seedFile, 'SEED_ASSEMBLIES');

console.log(`Found ${elements.length} SEED_ELEMENTS`);
console.log(`Found ${assemblies.length} SEED_ASSEMBLIES`);

if (elements.length === 0) {
  console.error('No elements found — aborting');
  process.exit(1);
}

// Send elements in client-side batches to avoid serverless timeout
let totalEmbedded = 0;
let totalErrors = [];

const numBatches = Math.ceil(elements.length / CLIENT_BATCH_SIZE);
console.log(`\nSending ${numBatches} batches of ~${CLIENT_BATCH_SIZE} elements to ${PROD_URL}...\n`);

for (let i = 0; i < elements.length; i += CLIENT_BATCH_SIZE) {
  const batch = elements.slice(i, i + CLIENT_BATCH_SIZE);
  const batchNum = Math.floor(i / CLIENT_BATCH_SIZE) + 1;

  process.stdout.write(`  Batch ${batchNum}/${numBatches} (${batch.length} elements)... `);

  try {
    const resp = await fetch(`${PROD_URL}/api/seed-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        action: 'seed',
        elements: batch,
        assemblies: [], // Only send assemblies with last batch
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.log(`❌ HTTP ${resp.status}`);
      totalErrors.push(`Batch ${batchNum}: HTTP ${resp.status} — ${text.slice(0, 200)}`);
      continue;
    }

    const data = await resp.json();
    totalEmbedded += data.totalEmbedded || 0;

    if (data.errors && data.errors.length > 0) {
      console.log(`⚠️  ${data.totalEmbedded} embedded, ${data.errors.length} errors`);
      totalErrors.push(...data.errors);
    } else {
      console.log(`✅ ${data.totalEmbedded} embedded`);
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
    totalErrors.push(`Batch ${batchNum}: ${err.message}`);
  }
}

// Send assemblies separately
if (assemblies.length > 0) {
  process.stdout.write(`  Assemblies (${assemblies.length})... `);
  try {
    const resp = await fetch(`${PROD_URL}/api/seed-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        action: 'seed',
        elements: [],  // Empty — no elements in this request
        assemblies,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.log(`❌ HTTP ${resp.status}`);
      totalErrors.push(`Assemblies: HTTP ${resp.status} — ${text.slice(0, 200)}`);
    } else {
      const data = await resp.json();
      totalEmbedded += data.totalEmbedded || 0;
      if (data.errors && data.errors.length > 0) {
        console.log(`⚠️  ${data.totalEmbedded} embedded, ${data.errors.length} errors`);
        totalErrors.push(...data.errors);
      } else {
        console.log(`✅ ${data.totalEmbedded} embedded`);
      }
    }
  } catch (err) {
    console.log(`❌ ${err.message}`);
    totalErrors.push(`Assemblies: ${err.message}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Total embedded: ${totalEmbedded}`);
if (totalErrors.length > 0) {
  console.log(`Errors: ${totalErrors.length}`);
  totalErrors.forEach(e => console.log(`  - ${e}`));
} else {
  console.log('✅ All seed data embedded successfully!');
}
