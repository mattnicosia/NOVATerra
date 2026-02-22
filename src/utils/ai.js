// NOVA AI Engine — Upgraded Anthropic API layer
// Supports: system messages, tool use, temperature, abort, retry, batching, image optimization

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
