/* global AbortSignal */
// NOVATerra AI Core — Anthropic API layer (Powered by NOVA)
// Routes all AI calls through server-side proxy (/api/ai) which uses the
// platform ANTHROPIC_API_KEY — no user-managed API keys needed.
// Supports: system messages, tool use, temperature, abort, retry, batching, image optimization

import { supabase } from "./supabase";

const PROXY_URL = "/api/ai";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
// ── Tiered model routing ──
// Haiku: fast/cheap — schedule detection, OCR, data extraction, subdivision math
// Sonnet: judgment — scope interpretation, narrative, coordination analysis
export const SCAN_MODEL = "claude-haiku-4-5-20251001";       // ~$0.01-0.03/page
export const INTERPRET_MODEL = "claude-sonnet-4-20250514";   // ~$0.10-0.15/page
export const NARRATIVE_MODEL = "claude-sonnet-4-20250514";   // ~$0.10/call

// Get the Supabase auth token for server-side proxy authentication.
// Uses getSession() first (fast, cached), then falls back to refreshSession()
// if the token looks expired (Supabase JWTs expire after ~1 hour).
async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;

  // Check if token is close to expiry (within 5 min) — refresh if so
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000; // convert to ms
    if (Date.now() > expiresAt - 300_000) {
      // Token expired or within 5 min of expiry — force refresh
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) console.warn("[AI] Token refresh failed:", error.message);
      return refreshed?.session?.access_token || null; // don't return expired token
    }
  } catch {
    // If we can't parse the JWT, just use it as-is and let the server decide
  }
  return token;
}

// Force-refresh the Supabase session and return a new token.
// Called on 401 retry to get a definitely-fresh token.
async function forceRefreshToken() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn("[AI] Force refresh failed:", error.message);
      return null;
    }
    return data?.session?.access_token || null;
  } catch (err) {
    console.warn("[AI] Force refresh error:", err.message);
    return null;
  }
}

// ─── TOKEN USAGE TRACKING ────────────────────────────────────────
let _sessionUsage = { input: 0, output: 0, calls: 0 };
function _trackUsage(input, output) {
  _sessionUsage.input += input || 0;
  _sessionUsage.output += output || 0;
  _sessionUsage.calls += 1;
}
export function getSessionUsage() {
  return { ..._sessionUsage };
}
export function resetSessionUsage() {
  _sessionUsage = { input: 0, output: 0, calls: 0 };
}

// ─── ABORT CONTROLLER FACTORY ────────────────────────────────────
export function createAIAbort() {
  return new AbortController();
}

// ─── CORE: Non-streaming call ────────────────────────────────────
export async function callAnthropic({
  apiKey: _apiKey,
  model = DEFAULT_MODEL,
  max_tokens = 1000,
  messages,
  system,
  temperature,
  tools,
  tool_choice,
  signal,
  _publicProxy = false, // internal: use /api/rom-ai without auth
}) {
  // Public proxy mode: no auth needed, uses /api/rom-ai
  if (_publicProxy) {
    const body = { model, max_tokens, messages };
    if (system) body.system = system;
    if (temperature !== undefined) body.temperature = temperature;
    const resp = await fetch("/api/rom-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal || AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || `Public AI error ${resp.status}`);
    }
    const data = await resp.json();
    return data?.content?.[0]?.text || data;
  }

  // apiKey param is now ignored — kept for backwards compat so callers don't break
  const token = await getAuthToken();
  if (!token) throw new Error("Please sign in to use AI features.");

  const body = { model, max_tokens, messages };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;

  // Pre-flight: log body size and check for empty document content
  const bodyJson = JSON.stringify(body);
  const bodySizeMB = (bodyJson.length / 1024 / 1024).toFixed(1);
  const docBlocks = body.messages?.[0]?.content?.filter?.(c => c.type === "document") || [];
  for (const doc of docBlocks) {
    const b64Len = doc?.source?.data?.length || 0;
    if (b64Len < 100) {
      console.error(`[AI] Document block has empty/tiny base64 (${b64Len} chars). Body size: ${bodySizeMB} MB`);
    }
  }
  if (parseFloat(bodySizeMB) > 4.0) {
    console.warn(`[AI] Request body is ${bodySizeMB} MB — may exceed Vercel's 4.5 MB limit`);
  }

  // Default timeout: 2 minutes per request to prevent pipeline stalls.
  // If the caller provides their own signal, use that instead.
  const effectiveSignal = signal || AbortSignal.timeout(120_000);

  let activeToken = token;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: bodyJson,
        signal: effectiveSignal,
      });
      if (resp.status === 429) {
        const wait = Math.min(2000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, wait));
        lastError = new Error("Rate limited — retrying...");
        continue;
      }
      // 401 = auth failed — try refreshing token ONCE before giving up
      if (resp.status === 401 && attempt === 0) {
        console.warn("[AI] Got 401, refreshing session and retrying...");
        const freshToken = await forceRefreshToken();
        if (freshToken) {
          activeToken = freshToken;
          continue; // retry with fresh token
        }
        // Refresh failed — user needs to sign in again
        throw new Error("Session expired — please sign in again.");
      }
      if (!resp.ok) {
        const status = resp.status;
        let errBody = null;
        try {
          errBody = await resp.json();
        } catch {
          /* non-critical */
        }
        const serverMsg = errBody?.error?.message || errBody?.error || "";
        const errType = errBody?.error?.type || "";
        console.error(`[AI] HTTP ${status} ${errType}:`, serverMsg, errBody);
        if (status === 401) throw new Error("Session expired — please sign in again.");
        if (status === 413) throw new Error(`Request too large (${status}): file may exceed API size limit`);
        if (status === 400) throw new Error(`Bad request (${status}): ${serverMsg || "check content format"}`);
        throw new Error(`API error ${status}: ${serverMsg || resp.statusText || "unknown"}`);
      }
      const data = await resp.json();

      // Track token usage
      if (data.usage) _trackUsage(data.usage.input_tokens, data.usage.output_tokens);

      // If tool use response, return full content blocks
      if (tools && data.content?.some(c => c.type === "tool_use")) {
        return { content: data.content, stop_reason: data.stop_reason };
      }

      return (data.content || [])
        .map(c => c.text || "")
        .join("")
        .trim();
    } catch (err) {
      if (err.name === "AbortError") throw err;
      if (err.name === "TimeoutError") throw new Error("AI request timed out (2 min) — server may be slow");
      if (err instanceof TypeError) throw new Error(`Network error: ${err.message} (check connection)`);
      lastError = err;
      if (attempt < 2 && err.message?.includes("retrying")) continue;
      throw err;
    }
  }
  throw lastError;
}

// ─── CORE: Streaming call ────────────────────────────────────────
export async function callAnthropicStream({
  apiKey: _apiKey,
  model = DEFAULT_MODEL,
  max_tokens = 1000,
  messages,
  system,
  temperature,
  onText,
  signal,
}) {
  // apiKey param is now ignored — kept for backwards compat
  const token = await getAuthToken();
  if (!token) throw new Error("Please sign in to use AI features.");

  const body = { model, max_tokens, messages, stream: true };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;

  let activeToken = token;

  // Try the request — on 401, refresh token and retry once
  let resp = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${activeToken}`,
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  // 401 retry: refresh session and try once more
  if (resp.status === 401) {
    console.warn("[AI-stream] Got 401, refreshing session and retrying...");
    const freshToken = await forceRefreshToken();
    if (freshToken) {
      activeToken = freshToken;
      resp = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    }
  }

  if (!resp.ok) {
    const status = resp.status;
    let errBody = null;
    try {
      errBody = await resp.json();
    } catch {
      /* non-critical */
    }
    const serverMsg = errBody?.error?.message || errBody?.error || "";
    if (status === 401) throw new Error("Session expired — please sign in again.");
    if (status === 413) throw new Error(`Request too large (${status}): file may exceed API size limit`);
    if (status === 429) throw new Error("Rate limited — try again shortly");
    throw new Error(`API error ${status}: ${serverMsg || resp.statusText || "unknown"}`);
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
      } catch {
        /* skip unparseable SSE lines */
      }
    }
  }
  return fullText;
}

// ─── PUBLIC STREAMING (no auth, uses /api/rom-ai) ────────────────

const PUBLIC_PROXY_URL = "/api/rom-ai";

export async function callAnthropicStreamPublic({
  model = SCAN_MODEL,
  max_tokens = 1000,
  messages,
  system,
  temperature,
  onText,
  signal,
}) {
  const body = { model, max_tokens, messages, stream: true };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;

  const resp = await fetch(PUBLIC_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!resp.ok) {
    let errBody = null;
    try { errBody = await resp.json(); } catch { /* non-critical */ }
    const serverMsg = errBody?.error?.message || errBody?.error || "";
    if (resp.status === 429) throw new Error("Rate limited — try again shortly");
    throw new Error(`API error ${resp.status}: ${serverMsg || resp.statusText || "unknown"}`);
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
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width,
        h = img.height;
      if (w <= maxDim && h <= maxDim) {
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        resolve({ base64, width: w, height: h });
        return;
      }
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const resized = canvas.toDataURL("image/jpeg", 0.92);
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
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
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

// ─── PROJECT CONTEXT BUILDER ─────────────────────────────────────
// Builds a rich context string from all project state for AI features
export function buildProjectContext({ project, items, takeoffs, specs, drawings }) {
  const parts = [];
  if (project) {
    parts.push(`PROJECT: "${project.name}" | Type: ${project.jobType || "N/A"} | ${project.projectSF || "?"} SF`);
    if (project.address) parts.push(`Location: ${project.address}`);
    if (project.client) parts.push(`Client: ${project.client}`);
    if (project.architect) parts.push(`Architect: ${project.architect}`);

    // Building parameters
    if (project.floorCount) {
      const basements = project.basementCount
        ? ` + ${project.basementCount} basement level${project.basementCount > 1 ? "s" : ""}`
        : "";
      parts.push(`Building: ${project.floorCount} stories${basements}`);
    }
    if (project.floors?.length) {
      const floorDetails = project.floors.map(f => `${f.label}: ${f.height}ft`).join(", ");
      parts.push(`Floor heights: ${floorDetails}`);
      const totalH = project.floors.reduce((s, f) => s + (f.height || 12), 0);
      parts.push(`Total building height: ${totalH}ft`);
    }
    if (project.buildingFootprintSF) parts.push(`Footprint: ${project.buildingFootprintSF} SF/floor`);

    // Room counts
    const rooms = project.roomCounts || {};
    const roomParts = Object.entries(rooms)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`);
    if (roomParts.length) parts.push(`Rooms: ${roomParts.join(", ")}`);
  }
  if (items?.length) {
    // Sort: unassigned items first so NOVA can act on them, then assigned items for reference
    const sorted = [...items].sort((a, b) => {
      const aUn = !a.division || a.division === "";
      const bUn = !b.division || b.division === "";
      if (aUn && !bUn) return -1;
      if (!aUn && bUn) return 1;
      return 0;
    });
    const unassignedCount = sorted.filter(i => !i.division || i.division === "").length;
    const MAX_ITEMS = 250;

    parts.push(`\nESTIMATE (${items.length} items${unassignedCount ? `, ${unassignedCount} unassigned` : ""}):`);
    sorted.slice(0, MAX_ITEMS).forEach(it => {
      const costs = [
        it.material && `M:$${it.material}`,
        it.labor && `L:$${it.labor}`,
        it.equipment && `E:$${it.equipment}`,
        it.subcontractor && `S:$${it.subcontractor}`,
      ]
        .filter(Boolean)
        .join(" ");
      const q = it.quantity || 1;
      const lineTotal = q * ((it.material || 0) + (it.labor || 0) + (it.equipment || 0) + (it.subcontractor || 0));
      const div = it.division ? ` [${it.division}]` : " [UNASSIGNED]";
      parts.push(
        `  [id:${it.id}] ${it.code || "—"} ${it.description}${div} | ${q} ${it.unit} | ${costs} | Total:$${lineTotal.toFixed(2)}`,
      );
    });
    if (items.length > MAX_ITEMS) parts.push(`  ... and ${items.length - MAX_ITEMS} more items`);
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

  // ── Estimate Summary Totals ──
  if (items?.length) {
    const itemTotal = items.reduce((s, i) => {
      const unit = (i.material || 0) + (i.labor || 0) + (i.equipment || 0) + (i.subcontractor || 0);
      return s + unit * (i.quantity || 0);
    }, 0);
    parts.push(`\n[Estimate Summary]`);
    parts.push(`Total Items: ${items.length}`);
    parts.push(`Subtotal: $${Math.round(itemTotal).toLocaleString()}`);
    if (project?.projectSF > 0) {
      parts.push(`Cost per SF: $${(itemTotal / project.projectSF).toFixed(2)}/SF`);
    }

    // Division coverage (lightweight — no heavy deps)
    const divisionsCovered = new Set(items.filter(i => i.division).map(i => i.division.substring(0, 2)));
    parts.push(`Divisions with scope: ${divisionsCovered.size}`);
  }

  // ── Drawing Sheet Index — for NOVA to cite by sheet number ──
  if (drawings?.length) {
    parts.push(`\n[Drawing Sheets — reference these by sheet number in your responses]`);
    drawings.slice(0, 30).forEach(d => {
      parts.push(`Sheet ${d.sheetNumber || d.label}: ${d.sheetTitle || d.label} [drawingId:${d.id}]`);
    });
    if (drawings.length > 30) parts.push(`  ... and ${drawings.length - 30} more sheets`);
  }

  return parts.join("\n");
}
