// Server-side Anthropic AI proxy
// Authenticates users via Supabase JWT, forwards requests to Anthropic using server ANTHROPIC_API_KEY.
// Eliminates the need for users to manage their own API keys.

import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

// Remap deprecated model names to current equivalents
const MODEL_REMAP = {
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-haiku-3-5-20241022": "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-5-sonnet-20240620": "claude-sonnet-4-6",
  "claude-3-opus-20240229": "claude-sonnet-4-6",
  "claude-3-haiku-20240307": "claude-haiku-4-5-20251001",
  "claude-3-sonnet-20240229": "claude-sonnet-4-6",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
};

// Read the raw request body manually (bypasses Vercel's default ~5 MB body parser limit)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    // If Vercel already parsed the body, use it directly
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    req.on("data", chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error(`Request body too large (>${MAX_BODY_BYTES / 1024 / 1024} MB)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body: " + err.message));
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Authenticate user
  const authHeader = req.headers.authorization || "";
  const user = await verifyUser(req);
  if (!user) {
    console.error("[ai-proxy] Auth failed. Header present:", !!authHeader, "Header prefix:", authHeader.slice(0, 15));
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Rate limit per user
  const { allowed, retryAfter } = checkRateLimit(`ai_${user.id}`);
  if (!allowed) {
    return res.status(429).json({ error: "Rate limited — too many AI requests", retryAfter });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || "")
    .replace(/\\n/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/"/g, "")
    .trim();
  if (!apiKey) return res.status(500).json({ error: "AI service not configured" });

  // Parse body — handles both pre-parsed (small) and raw stream (large PDFs)
  let parsed;
  try {
    parsed = await readRawBody(req);
  } catch (err) {
    console.error("[ai-proxy] Body parse error:", err.message);
    return res.status(400).json({ error: err.message });
  }

  const { model, max_tokens, messages, system, temperature, tools, tool_choice, stream, thinking } = parsed;

  if (!messages || !Array.isArray(messages)) {
    console.error("[ai-proxy] Missing messages. Body keys:", Object.keys(parsed || {}));
    return res.status(400).json({ error: "messages is required" });
  }

  // Log request shape for debugging (no content — just structure)
  const contentTypes = messages[0]?.content?.map?.(c => c.type) || [];
  const bodySize = JSON.stringify(parsed).length;
  console.log(
    `[ai-proxy] model=${model || "default"} content=[${contentTypes}] bodySize=${(bodySize / 1024 / 1024).toFixed(1)}MB`,
  );

  const resolvedModel = MODEL_REMAP[model] || model || "claude-sonnet-4-6";
  const body = { model: resolvedModel, max_tokens: max_tokens || 1000, messages };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  if (stream) body.stream = true;
  if (thinking) body.thinking = thinking;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "prompt-caching-2024-07-31",
  };

  try {
    const anthropicResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // ─── Streaming: pipe SSE directly to client ───
    if (stream) {
      if (!anthropicResp.ok) {
        const errBody = await anthropicResp.json().catch(() => ({}));
        const msg = errBody?.error?.message || anthropicResp.statusText;
        const clientStatus = anthropicResp.status === 401 || anthropicResp.status === 403 ? 502 : anthropicResp.status;
        console.error(`[ai-proxy] Anthropic stream error ${anthropicResp.status}:`, msg);
        return res.status(clientStatus).json({ error: msg });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = anthropicResp.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        console.warn("[ai-proxy] Stream error:", streamErr.message);
      } finally {
        res.end();
      }
      return;
    }

    // ─── Non-streaming: forward JSON response ───
    const status = anthropicResp.status;
    const data = await anthropicResp.json().catch(() => ({}));

    if (!anthropicResp.ok) {
      const msg = data?.error?.message || anthropicResp.statusText || "Unknown error";
      const errType = data?.error?.type || "";
      const clientStatus = status === 401 || status === 403 ? 502 : status;
      // Log ALL errors (not just 401/403) for debugging
      console.error(`[ai-proxy] Anthropic error ${status} ${errType}: ${msg}`);
      return res.status(clientStatus).json({ error: { message: msg, type: errType } });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-proxy] Error:", err);
    return res.status(500).json({ error: "AI proxy error: " + err.message });
  }
}

// Disable Vercel's built-in body parser so we can handle large PDFs manually
// (Vercel's default limit is ~5MB which is too small for base64-encoded PDFs)
export const config = {
  api: {
    bodyParser: false,
  },
};
