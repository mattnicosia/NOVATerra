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
                text: `Apply realistic colors and materials directly to this architectural drawing. Do NOT recreate or redraw the building — keep the EXACT same drawing, lines, layout, and perspective. Only add:

- Realistic material colors and textures (brick, glass, metal, wood, concrete, etc.) applied to the existing surfaces
- A sky background behind the building
- Ground plane with simple landscaping
- Subtle shadows for depth

Keep the architectural drawing style. This should look like the same drawing but with colors and materials applied — like an architectural watercolor or colored elevation render. Do NOT generate a new building or change the geometry in any way.`,
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

      // Parse error for better fallback diagnostics
      let errMsg = "Image generation failed";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {
        errMsg = errText || errMsg;
      }

      // Fall back to Claude + DALL-E 3 on any Responses API failure
      console.log("[generate-rendering] Responses API failed, falling back. Status:", response.status, "Message:", errMsg);
      return await fallbackRender(res, base64Clean, mediaType, buildingType, OPENAI_API_KEY);
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
          { type: "text", text: `Describe this architectural elevation drawing in EXTREME detail so an image generator can apply colors and materials to a building matching this EXACT design. Include:
- EXACT building shape, proportions, number of stories
- EXACT roof profile
- EXACT window count, sizes, and placement on each facade
- EXACT door locations and styles
- What materials should be applied to each surface (be specific: "running bond red brick", "gray stucco", "dark bronze storefront glazing", etc.)
- Any canopies, columns, overhangs, or architectural details
This is ${buildingType ? `a ${buildingType}` : "a commercial"} building.
ONLY the description. No commentary.` },
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
      prompt: `Architectural colored elevation render of this EXACT building design (do not change the geometry): ${description}

Apply realistic material colors and textures to the drawing. Keep the same perspective and proportions. Add a sky background and simple ground plane with landscaping. This should look like a professional colored architectural elevation — NOT a photograph, but the drawing itself with materials applied. Clean, crisp, architectural illustration style.`,
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
