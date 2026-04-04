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
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Use gpt-image-1 with the drawing as input — it sees the actual geometry
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `Transform this architectural drawing into a photorealistic exterior rendering. This is ${buildingType ? `a ${buildingType}` : "a commercial"} building.

CRITICAL: Maintain the EXACT building geometry, proportions, window placement, roof shape, and architectural details from the input drawing. Do not change the building design — only add:
- Realistic exterior materials and textures (appropriate for the building type)
- Natural golden hour lighting with soft shadows
- Blue sky with light clouds
- Landscaping (trees, shrubs, grass)
- Sidewalks and street context
- Photorealistic depth of field

IMPORTANT: Do NOT include any text, signage, logos, lettering, words, or brand names on the building or anywhere in the image. Leave sign areas blank or as plain material.

Style: Professional architectural visualization photograph. Eye-level street perspective. High detail, 8K quality.`,
        image: {
          type: "base64",
          data: base64Clean,
        },
        n: 1,
        size: "1536x1024",
        quality: "high",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = "Image generation failed";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {}

      // If gpt-image-1 fails (maybe not available), fall back to DALL-E 3 with Claude description
      if (response.status === 404 || response.status === 400) {
        console.log("[generate-rendering] gpt-image-1 not available, falling back to Claude + DALL-E 3");
        return await fallbackRender(req, res, base64Clean, imageBase64, buildingType, projectName, OPENAI_API_KEY);
      }

      throw new Error(errMsg);
    }

    const json = await response.json();
    // gpt-image-1 returns b64_json in data array
    const imageData = json.data?.[0]?.b64_json || json.data?.[0]?.url;
    if (!imageData) throw new Error("No image data returned");

    const resultImage = imageData.startsWith("http")
      ? imageData // URL format
      : `data:image/png;base64,${imageData}`; // base64 format

    return res.status(200).json({ image: resultImage });

  } catch (err) {
    console.error("[generate-rendering]", err);
    return res.status(500).json({ error: `${err.message}` });
  }
}

// Fallback: Claude describes → DALL-E 3 generates
async function fallbackRender(req, res, base64Clean, imageBase64, buildingType, projectName, OPENAI_API_KEY) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error("Anthropic API key not configured for fallback");

  const mediaType = imageBase64.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";

  // Claude analyzes the drawing
  const descResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Clean } },
          { type: "text", text: `You are an architectural visualization expert. Describe this architectural drawing in EXTREME detail for a photorealistic rendering. Be obsessively specific about:
- EXACT building shape, width, height, number of stories
- EXACT roof shape and pitch
- EXACT window count, size, placement pattern on each facade
- EXACT door locations, sizes, and styles
- Materials for each surface (be specific: red brick, gray stucco, glass curtain wall, standing seam metal, etc.)
- Any overhangs, canopies, columns, or projections
- Signage areas or unique features

This is ${buildingType ? `a ${buildingType}` : "a commercial"} building${projectName ? ` called "${projectName}"` : ""}.
Respond with ONLY the description. No commentary.` },
        ],
      }],
    }),
  });

  if (!descResponse.ok) throw new Error("Drawing analysis failed");
  const descJson = await descResponse.json();
  const description = descJson.content?.[0]?.text || "";
  if (!description) throw new Error("Could not analyze drawing");

  // DALL-E 3 generates from the description
  const genResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `Create a photorealistic architectural exterior rendering based on this EXACT description. Do NOT deviate from the described building: ${description}

Eye-level street perspective. Golden hour natural lighting. Blue sky. Landscaping. Photorealistic materials. No people. IMPORTANT: Do NOT include any text, signage, logos, lettering, words, or brand names anywhere in the image. Leave all sign areas blank. Professional architectural visualization photograph.`,
      n: 1,
      size: "1792x1024",
      quality: "hd",
      response_format: "b64_json",
    }),
  });

  if (!genResponse.ok) {
    const genErr = await genResponse.text();
    throw new Error(`Fallback rendering failed: ${genErr.slice(0, 200)}`);
  }

  const genJson = await genResponse.json();
  const imageData = genJson.data?.[0]?.b64_json;
  if (!imageData) throw new Error("No image data returned");

  return res.status(200).json({
    image: `data:image/png;base64,${imageData}`,
    method: "fallback",
    description: description.slice(0, 300),
  });
}
