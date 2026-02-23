// BLDG Omni AI Engine — Anthropic API layer (Powered by NOVA)
// Supports: system messages, tool use, temperature, abort, retry, batching, image optimization

import { supabase } from './supabase';

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const HEADERS = (apiKey) => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

// ─── CORE: Non-streaming call ────────────────────────────────────
export async function callAnthropic({
  apiKey, model = DEFAULT_MODEL, max_tokens = 1000, messages,
  system, temperature, tools, tool_choice, signal,
}) {
  if (!apiKey) throw new Error("No API key configured. Add your Anthropic API key in Settings.");

  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: HEADERS(apiKey),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      if (resp.status === 429) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, wait));
        lastError = new Error("Rate limited — retrying...");
        continue;
      }
      if (!resp.ok) {
        const status = resp.status;
        if (status === 401) throw new Error("Invalid API key — check Settings");
        if (status === 413) throw new Error("Request too large for API");
        let errMsg = `API error (${status})`;
        try { const errBody = await resp.json(); errMsg = errBody?.error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const data = await resp.json();

      // Track token usage
      if (data.usage) _trackUsage(data.usage.input_tokens, data.usage.output_tokens);

      // If tool use response, return full content blocks
      if (tools && data.content?.some(c => c.type === "tool_use")) {
        return { content: data.content, stop_reason: data.stop_reason };
      }

      return (data.content || []).map(c => c.text || "").join("").trim();
    } catch (err) {
      if (err.name === "AbortError") throw err;
      lastError = err;
      if (attempt < 2 && err.message?.includes("retrying")) continue;
      throw err;
    }
  }
  throw lastError;
}

// ─── CORE: Streaming call ────────────────────────────────────────
export async function callAnthropicStream({
  apiKey, model = DEFAULT_MODEL, max_tokens = 1000, messages,
  system, temperature, onText, signal,
}) {
  if (!apiKey) throw new Error("No API key configured. Add your Anthropic API key in Settings.");

  const body = { model, max_tokens, messages, stream: true };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: HEADERS(apiKey),
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!resp.ok) {
    const status = resp.status;
    if (status === 401) throw new Error("Invalid API key — check Settings");
    if (status === 413) throw new Error("Request too large for API");
    if (status === 429) throw new Error("Rate limited — try again shortly");
    throw new Error(`API error (${status})`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          fullText += parsed.delta.text;
          if (onText) onText(fullText);
        }
      } catch { /* skip unparseable SSE lines */ }
    }
  }
  return fullText;
}

// ─── IMAGE UTILITIES ─────────────────────────────────────────────

// Resize images before sending to API (max 1568px per Anthropic, target 1200px for speed)
export function optimizeImageForAI(dataUrl, maxDim = 1200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w <= maxDim && h <= maxDim) {
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve({ base64, width: w, height: h });
        return;
      }
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const resized = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ base64: resized.split(",")[1], width: w, height: h });
    };
    img.onerror = () => {
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve({ base64, width: 0, height: 0 });
    };
    img.src = dataUrl;
  });
}

// Crop a region from a drawing image and return base64
export function cropImageRegion(dataUrl, x, y, w, h, outputSize = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize; canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, x, y, w, h, 0, 0, outputSize, outputSize);
      const cropped = canvas.toDataURL("image/jpeg", 0.9);
      resolve(cropped.split(",")[1]);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Build an image content block for Anthropic API
export function imageBlock(base64, mediaType = "image/jpeg") {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
}

// Build a document (PDF) content block
export function pdfBlock(base64) {
  return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
}

// ─── BATCH PROCESSING ────────────────────────────────────────────
// Process multiple items in parallel with concurrency limit
export async function batchAI(items, processFn, concurrency = 3) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await processFn(items[i], i); }
      catch (err) { results[i] = { error: err.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ─── TOKEN USAGE TRACKING ────────────────────────────────────────
let _sessionUsage = { input: 0, output: 0, calls: 0 };
function _trackUsage(input, output) {
  _sessionUsage.input += input || 0;
  _sessionUsage.output += output || 0;
  _sessionUsage.calls += 1;
}
export function getSessionUsage() { return { ..._sessionUsage }; }
export function resetSessionUsage() { _sessionUsage = { input: 0, output: 0, calls: 0 }; }

// ─── ABORT CONTROLLER FACTORY ────────────────────────────────────
export function createAIAbort() { return new AbortController(); }

// ─── PROJECT CONTEXT BUILDER ─────────────────────────────────────
// Builds a rich context string from all project state for AI features
export function buildProjectContext({ project, items, takeoffs, specs, drawings }) {
  const parts = [];
  if (project) {
    parts.push(`PROJECT: "${project.name}" | Type: ${project.jobType || "N/A"} | ${project.projectSF || "?"} SF`);
    if (project.address) parts.push(`Location: ${project.address}`);
    if (project.client) parts.push(`Client: ${project.client}`);
    if (project.architect) parts.push(`Architect: ${project.architect}`);
  }
  if (items?.length) {
    parts.push(`\nESTIMATE (${items.length} items):`);
    items.slice(0, 80).forEach(it => {
      const costs = [it.material && `M:$${it.material}`, it.labor && `L:$${it.labor}`, it.equipment && `E:$${it.equipment}`, it.subcontractor && `S:$${it.subcontractor}`].filter(Boolean).join(" ");
      parts.push(`  ${it.code || "—"} ${it.description} | ${it.quantity} ${it.unit} | ${costs}`);
    });
    if (items.length > 80) parts.push(`  ... and ${items.length - 80} more items`);
  }
  if (takeoffs?.length) {
    parts.push(`\nTAKEOFFS (${takeoffs.length} items):`);
    takeoffs.forEach(t => parts.push(`  ${t.code || "—"} ${t.description} | ${t.quantity} ${t.unit}`));
  }
  if (specs?.length) {
    parts.push(`\nSPECIFICATIONS (${specs.length} sections):`);
    specs.forEach(sp => parts.push(`  ${sp.section} ${sp.title}${sp.summary ? ` — ${sp.summary}` : ""}`));
  }
  if (drawings?.length) {
    parts.push(`\nDRAWINGS (${drawings.length} sheets):`);
    drawings.forEach(d => parts.push(`  ${d.sheetNumber || "?"} — ${d.sheetTitle || d.label || "Untitled"}`));
  }
  return parts.join("\n");
}

// ─── OCR — Google Cloud Vision Preprocessing ──────────────────────────

/**
 * Run OCR on a drawing image via Google Cloud Vision.
 * Returns extracted text and block-level results.
 *
 * @param {string} base64Image — Base64 image data (with or without data: prefix)
 * @param {string|null} storagePath — Supabase Storage path for large images (>3MB)
 * @returns {{ text: string, blocks: Array<{text: string, confidence: number}> }}
 */
export async function runOCR(base64Image, storagePath = null) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { text: '', blocks: [] };

    const body = storagePath
      ? { storagePath }
      : { image: base64Image };

    const resp = await fetch('/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.warn('[OCR] Failed:', resp.status);
      return { text: '', blocks: [] }; // Graceful fallback — scan works without OCR
    }

    return resp.json();
  } catch (err) {
    console.warn('[OCR] Error:', err.message);
    return { text: '', blocks: [] }; // Never block scan on OCR failure
  }
}

// ─── SEGMENTED OCR — Quadrant Tiling for High-Res Text Extraction ────

/**
 * Deduplicate OCR text from overlapping quadrants.
 * Normalizes lines and removes duplicates while preserving reading order (TL→TR→BL→BR).
 *
 * @param {string[]} quadrantTexts — Array of 4 OCR text strings from overlapping quadrants
 * @returns {string} — Deduplicated merged text
 */
export function deduplicateOCRText(quadrantTexts) {
  const seen = new Set();
  const result = [];

  for (const qText of quadrantTexts) {
    if (!qText) continue;
    const lines = qText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Normalize: collapse whitespace, lowercase for comparison key
      const key = trimmed.replace(/\s+/g, ' ').toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(trimmed); // Preserve original casing
      }
    }
  }

  return result.join('\n');
}

/**
 * Segment a drawing image into 4 overlapping quadrants, OCR each at higher
 * effective resolution, then merge and deduplicate results.
 *
 * Construction drawings are 30x42" dense documents — a single 1400px OCR pass
 * misses small text. Splitting into quadrants gives ~2x effective resolution
 * on each region while quadrant overlap (10%) captures text at boundaries.
 *
 * @param {string} base64Image — Full drawing image as base64 (no data: prefix)
 * @param {number} imgWidth — Image width in pixels
 * @param {number} imgHeight — Image height in pixels
 * @returns {{ text: string, quadrantTexts: string[], blocks: Array }}
 */
export async function segmentedOCR(base64Image, imgWidth, imgHeight) {
  const QUADRANT_OUTPUT_SIZE = 1000; // Each quadrant rendered at ~1000px for clear OCR
  const OVERLAP = 0.10; // 10% overlap on each edge

  // Define quadrant crop regions [x, y, w, h] in source pixel coords
  const halfW = Math.ceil(imgWidth / 2);
  const halfH = Math.ceil(imgHeight / 2);
  const overlapW = Math.ceil(imgWidth * OVERLAP);
  const overlapH = Math.ceil(imgHeight * OVERLAP);

  const quadrants = [
    // Top-left (extends right/down by overlap)
    { x: 0, y: 0, w: halfW + overlapW, h: halfH + overlapH, label: 'TL' },
    // Top-right (extends left/down by overlap)
    { x: Math.max(0, halfW - overlapW), y: 0, w: imgWidth - halfW + overlapW, h: halfH + overlapH, label: 'TR' },
    // Bottom-left (extends right/up by overlap)
    { x: 0, y: Math.max(0, halfH - overlapH), w: halfW + overlapW, h: imgHeight - halfH + overlapH, label: 'BL' },
    // Bottom-right (extends left/up by overlap)
    { x: Math.max(0, halfW - overlapW), y: Math.max(0, halfH - overlapH), w: imgWidth - halfW + overlapW, h: imgHeight - halfH + overlapH, label: 'BR' },
  ];

  // Clamp quadrant dimensions to image bounds
  quadrants.forEach(q => {
    q.w = Math.min(q.w, imgWidth - q.x);
    q.h = Math.min(q.h, imgHeight - q.y);
  });

  // Crop each quadrant to a canvas and get base64
  function cropQuadrant(q) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Scale to QUADRANT_OUTPUT_SIZE while maintaining aspect ratio
        const scale = QUADRANT_OUTPUT_SIZE / Math.max(q.w, q.h);
        canvas.width = Math.round(q.w * scale);
        canvas.height = Math.round(q.h * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, q.x, q.y, q.w, q.h, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve(dataUrl.split(',')[1]); // Return base64 only
      };
      img.onerror = () => resolve(null);
      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  try {
    console.log(`[OCR-SEG] Tiling ${imgWidth}x${imgHeight} image into 4 quadrants...`);

    // Crop all 4 quadrants in parallel
    const croppedImages = await Promise.all(quadrants.map(q => cropQuadrant(q)));

    // OCR all 4 quadrants in parallel
    const ocrResults = await Promise.all(
      croppedImages.map((b64, i) => {
        if (!b64) return Promise.resolve({ text: '', blocks: [] });
        console.log(`[OCR-SEG] Running OCR on quadrant ${quadrants[i].label}...`);
        return runOCR(b64);
      })
    );

    const quadrantTexts = ocrResults.map(r => r.text || '');
    const allBlocks = ocrResults.flatMap(r => r.blocks || []);

    // Merge and deduplicate
    const mergedText = deduplicateOCRText(quadrantTexts);

    const totalChars = quadrantTexts.reduce((sum, t) => sum + t.length, 0);
    console.log(`[OCR-SEG] Extracted ${totalChars} raw chars → ${mergedText.length} chars after dedup`);

    return { text: mergedText, quadrantTexts, blocks: allBlocks };
  } catch (err) {
    console.warn('[OCR-SEG] Segmented OCR failed, falling back to single OCR:', err.message);
    // Graceful fallback to single-image OCR
    const fallback = await runOCR(base64Image);
    return { text: fallback.text, quadrantTexts: [fallback.text], blocks: fallback.blocks };
  }
}
