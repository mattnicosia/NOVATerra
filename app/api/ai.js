// Server-side Anthropic AI proxy
// Authenticates users via Supabase JWT, forwards requests to Anthropic using server ANTHROPIC_API_KEY.
// Eliminates the need for users to manage their own API keys.

import { cors } from './lib/cors.js';
import { verifyUser } from './lib/supabaseAdmin.js';

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Authenticate user
  const authHeader = req.headers.authorization || '';
  const user = await verifyUser(req);
  if (!user) {
    console.error("[ai-proxy] Auth failed. Header present:", !!authHeader, "Header prefix:", authHeader.slice(0, 15));
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/"/g, '').trim();
  if (!apiKey) return res.status(500).json({ error: "AI service not configured" });

  const { model, max_tokens, messages, system, temperature, tools, tool_choice, stream } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages is required" });
  }

  const body = { model: model || "claude-sonnet-4-20250514", max_tokens: max_tokens || 1000, messages };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
  if (stream) body.stream = true;

  // Detect PDF/document content blocks -> add required beta header
  const hasPdf = messages.some(m =>
    Array.isArray(m.content) && m.content.some(c => c.type === "document")
  );

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (hasPdf) headers["anthropic-beta"] = "pdfs-2024-09-25";

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
        // Don't forward Anthropic 401/403 as 401 — would confuse client auth
        const clientStatus = (anthropicResp.status === 401 || anthropicResp.status === 403) ? 502 : anthropicResp.status;
        if (anthropicResp.status === 401 || anthropicResp.status === 403) {
          console.error("[ai-proxy] Anthropic API key rejected (stream):", anthropicResp.status, msg);
        }
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
        // Client may have disconnected — that's okay
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
      // IMPORTANT: Don't forward Anthropic's 401 as 401 — the client would
      // misinterpret it as a Supabase session expiry.  Return 502 instead.
      const clientStatus = (status === 401 || status === 403) ? 502 : status;
      if (status === 401 || status === 403) {
        console.error("[ai-proxy] Anthropic API key rejected:", status, msg);
      }
      return res.status(clientStatus).json({ error: { message: msg, type: errType } });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("[ai-proxy] Error:", err);
    return res.status(500).json({ error: "AI proxy error: " + err.message });
  }
}
