// Public AI proxy for free ROM scans — no auth required
// Uses IP-based rate limiting (5 requests per minute) instead of JWT auth.
// Only allows Haiku model (cheapest) to control costs.

import { cors } from "./lib/cors.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB (smaller than auth'd proxy)
const ALLOWED_MODELS = ["claude-haiku-4-5-20251001"];
const MODEL_REMAP = {
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-haiku-3-5-20241022": "claude-haiku-4-5-20251001",
  "claude-3-haiku-20240307": "claude-haiku-4-5-20251001",
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") { resolve(req.body); return; }
    const chunks = [];
    let totalBytes = 0;
    req.on("data", chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) { reject(new Error("Request too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
      catch (err) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown";
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // IP-based rate limit: 5 requests per minute per IP
  const ip = getClientIp(req);
  const { allowed, retryAfter } = checkRateLimit(`rom_${ip}`, { maxRequests: 5, windowMs: 60_000 });
  if (!allowed) {
    return res.status(429).json({ error: "Too many requests — please wait", retryAfter });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/"/g, "").trim();
  if (!apiKey) return res.status(500).json({ error: "AI service not configured" });

  let parsed;
  try { parsed = await readRawBody(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  const { model, max_tokens, messages, system, temperature, stream } = parsed;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages required" });

  // Force Haiku model only — prevent abuse of expensive models
  const remapped = MODEL_REMAP[model] || model;
  const safeModel = ALLOWED_MODELS.includes(remapped) ? remapped : "claude-haiku-4-5-20251001";

  const body = { model: safeModel, max_tokens: Math.min(max_tokens || 1000, 2000), messages };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (stream) body.stream = true;

  console.log(`[rom-ai] ip=${ip} model=${safeModel} msgs=${messages.length} stream=${!!stream}`);

  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    // ─── Streaming: pipe SSE directly to client ───
    if (stream) {
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = errBody?.error?.message || resp.statusText;
        console.error(`[rom-ai] Anthropic stream error ${resp.status}:`, msg);
        return res.status(resp.status === 401 ? 502 : resp.status).json({ error: msg });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        console.warn("[rom-ai] Stream error:", streamErr.message);
      } finally {
        res.end();
      }
      return;
    }

    // ─── Non-streaming: forward JSON response ───
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`[rom-ai] Anthropic error ${resp.status}:`, data?.error?.message);
      return res.status(resp.status === 401 ? 502 : resp.status).json({ error: data?.error?.message || "AI error" });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("[rom-ai] Error:", err);
    return res.status(500).json({ error: "AI proxy error" });
  }
}

export const config = { api: { bodyParser: false } };
