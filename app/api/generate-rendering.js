import { cors } from "./lib/cors.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(auth);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { imageBase64, buildingType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "Missing image" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return res.status(500).json({ error: "OpenAI API key not configured" });

  try {
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mediaType = imageBase64.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png";

    // Use OpenAI Responses API — sends the actual drawing as input + generates image output
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: `data:${mediaType};base64,${base64Clean}`,
              },
              {
                type: "input_text",
                text: `Transform this architectural drawing into a photorealistic exterior rendering. This is ${buildingType ? `a ${buildingType}` : "a commercial"} building.

You MUST maintain the EXACT building geometry, proportions, window placement, roof shape, and all architectural details from this drawing. Do not change the design at all.

Add:
- Realistic exterior materials and textures appropriate for this building type
- Natural golden hour lighting with soft shadows
- Clear blue sky with light clouds
- Landscaping with trees, shrubs, and grass
- Sidewalks and realistic street context
- Photorealistic depth of field

Do NOT include any text, signage, logos, lettering, or brand names anywhere in the image.

Output a single photorealistic architectural visualization photograph at eye-level street perspective.`,
              },
            ],
          },
        ],
        tools: [{ type: "image_generation", size: "1536x1024", quality: "high" }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-rendering] Responses API error:", errText);

      // Parse error for better message
      let errMsg = "Image generation failed";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {}

      // If Responses API not available, fall back to Claude + DALL-E
      if (response.status === 404 || errMsg.includes("not found")) {
        return await fallbackRender(res, base64Clean, mediaType, buildingType, OPENAI_API_KEY);
      }

      throw new Error(errMsg);
    }

    const json = await response.json();

    // Extract generated image from response output
    const imageOutput = json.output?.find(o => o.type === "image_generation_call");
    if (imageOutput?.result) {
      return res.status(200).json({
        image: `data:image/png;base64,${imageOutput.result}`,
        method: "responses-api",
      });
    }

    // Try alternate response format
    const contentOutput = json.output?.find(o => o.type === "message");
    const imgContent = contentOutput?.content?.find(c => c.type === "image");
    if (imgContent?.image_url) {
      return res.status(200).json({ image: imgContent.image_url, method: "responses-api" });
    }

    // If no image found, fall back
    console.log("[generate-rendering] No image in response, falling back. Output:", JSON.stringify(json.output?.map(o => o.type)));
    return await fallbackRender(res, base64Clean, mediaType, buildingType, OPENAI_API_KEY);

  } catch (err) {
    console.error("[generate-rendering]", err);
    return res.status(500).json({ error: `${err.message}` });
  }
}

// Fallback: Claude describes → DALL-E 3 generates
async function fallbackRender(res, base64Clean, mediaType, buildingType, OPENAI_API_KEY) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error("Fallback requires Anthropic API key");

  // Claude analyzes the drawing with extreme detail
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
          { type: "text", text: `Describe this architectural drawing in EXTREME detail for a rendering. Be obsessively specific about:
- EXACT building shape, width, height, number of stories, overall massing
- EXACT roof shape, pitch, overhangs
- EXACT window count per floor, sizes, spacing, style (single/double hung, casement, storefront, etc.)
- EXACT door locations, sizes, styles, any vestibules or canopies
- Materials for EVERY surface (be specific: "running bond red brick", "gray EIFS with reveals", "dark bronze aluminum storefront", etc.)
- Columns, cornices, parapets, any projections or recesses
This is ${buildingType ? `a ${buildingType}` : "a commercial"} building.
ONLY the description. No commentary. No mentioning signage or brand names.` },
        ],
      }],
    }),
  });

  if (!descResponse.ok) throw new Error("Drawing analysis failed");
  const descJson = await descResponse.json();
  const description = descJson.content?.[0]?.text || "";
  if (!description) throw new Error("Could not analyze drawing");

  // DALL-E 3 generates from description
  const genResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `Photorealistic architectural exterior rendering of EXACTLY this building (do not deviate): ${description}

Eye-level street perspective. Golden hour lighting. Blue sky. Landscaping. Photorealistic materials and textures.
CRITICAL: Do NOT include ANY text, signage, logos, lettering, words, or brand names anywhere. Leave sign areas as blank material.`,
      n: 1,
      size: "1792x1024",
      quality: "hd",
      response_format: "b64_json",
    }),
  });

  if (!genResponse.ok) {
    const genErr = await genResponse.text();
    throw new Error(`Rendering failed: ${genErr.slice(0, 200)}`);
  }

  const genJson = await genResponse.json();
  const imageData = genJson.data?.[0]?.b64_json;
  if (!imageData) throw new Error("No image data returned");

  return res.status(200).json({
    image: `data:image/png;base64,${imageData}`,
    method: "fallback-dalle3",
  });
}
