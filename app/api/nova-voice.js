// Vercel Serverless Function — ElevenLabs TTS proxy
// Keeps API key server-side. Client POSTs { text, stability?, similarity_boost?, style? }
// Returns audio/mpeg stream.

import { verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { allowed, retryAfter } = await checkRateLimit(`ai_${user.id}`);
  if (!allowed) {
    return res.status(429).json({ error: "Rate limited — too many voice requests", retryAfter });
  }

  const { text, stability, similarity_boost, style } = req.body || {};

  if (!text || typeof text !== "string" || text.length > 1000) {
    return res.status(400).json({ error: "Invalid text" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return res.status(500).json({ error: "Voice not configured" });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: stability ?? 0.78,
          similarity_boost: similarity_boost ?? 0.72,
          style: style ?? 0.15,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs error:", response.status, errorText);
      return res.status(502).json({ error: "Voice generation failed" });
    }

    // Stream audio bytes back to client
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");

    const arrayBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Voice API error:", error);
    return res.status(503).json({ error: "Voice service unavailable" });
  }
}
