import { cors } from "./lib/cors.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(auth);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { imageBase64, buildingType, projectName } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "Missing image" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "Anthropic API key not configured" });

  try {
    // Step 1: Claude analyzes the drawing
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = imageBase64.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";

    const descResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Clean } },
            { type: "text", text: `You are an architectural visualization expert. Describe this architectural drawing in vivid detail for a photorealistic rendering. Include:
- Building shape, massing, and proportions (exact number of stories, width-to-height ratio)
- Roof type and profile
- Window patterns (size, spacing, style)
- Exterior materials and finishes (brick, glass, metal panel, stucco, stone, wood, etc.)
- Architectural style
- Entry features (doors, canopy, signage area)
- Any unique features visible

This is ${buildingType ? `a ${buildingType}` : "a commercial"} building${projectName ? ` called "${projectName}"` : ""}.
Respond with ONLY the visual description. Be extremely specific about materials and proportions. No preamble.` },
          ],
        }],
      }),
    });

    if (!descResponse.ok) {
      const errText = await descResponse.text();
      throw new Error(`Drawing analysis failed: ${errText.slice(0, 200)}`);
    }

    const descJson = await descResponse.json();
    const description = descJson.content?.[0]?.text || "";
    if (!description) throw new Error("Could not analyze drawing");

    // Step 2: DALL-E 3 generates the photorealistic rendering
    const genResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Photorealistic architectural exterior visualization render of: ${description}.

Professional architectural photography style. Eye-level street perspective. Natural golden hour daylight. Clear blue sky with light clouds. Manicured landscaping with trees and pedestrian walkways. Clean concrete sidewalks. Photorealistic materials and textures. No people. Sharp focus, high detail, 8K quality. This should look like a real photograph of a completed building.`,
        n: 1,
        size: "1792x1024",
        quality: "hd",
        response_format: "b64_json",
      }),
    });

    if (!genResponse.ok) {
      const genErr = await genResponse.text();
      throw new Error(`Image generation failed: ${genErr.slice(0, 200)}`);
    }

    const genJson = await genResponse.json();
    const imageData = genJson.data?.[0]?.b64_json;
    if (!imageData) throw new Error("No image data returned");

    return res.status(200).json({
      image: `data:image/png;base64,${imageData}`,
      description: description.slice(0, 300),
    });

  } catch (err) {
    console.error("[generate-rendering]", err);
    return res.status(500).json({ error: `${err.message}` });
  }
}
