/**
 * revisionAnnotator — AI-powered description of changes between drawing revisions.
 *
 * Uses Haiku vision model (~$0.01-0.03/call) to compare two drawing canvases
 * and generate human-readable change descriptions.
 */

import { callAnthropic, SCAN_MODEL } from "@/utils/ai";

/**
 * Resize a canvas to max dimension for cost control.
 */
function resizeCanvas(canvas, maxDim = 1024) {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;
  const offscreen = document.createElement("canvas");
  offscreen.width = Math.round(canvas.width * scale);
  offscreen.height = Math.round(canvas.height * scale);
  const ctx = offscreen.getContext("2d");
  ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
  return offscreen;
}

/**
 * Convert canvas to base64 JPEG.
 */
function canvasToBase64(canvas) {
  return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

/**
 * Annotate differences between two drawing revisions using AI vision.
 *
 * @param {HTMLCanvasElement} canvasA — Previous revision
 * @param {HTMLCanvasElement} canvasB — Current revision
 * @param {object} drawingA — Drawing metadata (label, sheetNumber, etc.)
 * @param {object} drawingB — Drawing metadata
 * @returns {Promise<{ bullets: string[], summary: string }>}
 */
export async function annotateRevisionDelta(canvasA, canvasB, drawingA, drawingB) {
  const smallA = resizeCanvas(canvasA, 1024);
  const smallB = resizeCanvas(canvasB, 1024);
  const b64A = canvasToBase64(smallA);
  const b64B = canvasToBase64(smallB);

  const sheetInfo = drawingB.label || drawingB.sheetNumber || "drawing";
  const revA = drawingA.revision || drawingA.addendumNumber || "previous";
  const revB = drawingB.revision || drawingB.addendumNumber || "current";

  const response = await callAnthropic({
    model: SCAN_MODEL,
    max_tokens: 500,
    system: `You are analyzing construction drawing revisions for a commercial estimating application. Compare Image A (revision ${revA}) with Image B (revision ${revB}) of sheet ${sheetInfo}. Be specific about locations and elements. Output ONLY a JSON object with: { "bullets": ["change 1", "change 2", ...], "summary": "one sentence overall" }. Max 5 bullets. Focus on changes that affect cost estimates: added/removed rooms, walls, doors, windows, equipment, dimensions, annotations.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64A },
          },
          { type: "text", text: "Image A (previous revision):" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: b64B },
          },
          { type: "text", text: "Image B (current revision). List the specific changes between these two revisions." },
        ],
      },
    ],
  });

  try {
    const text = response?.content?.[0]?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 5) : [],
        summary: parsed.summary || "",
      };
    }
  } catch {
    // Fallback: treat entire response as summary
  }
  return {
    bullets: [],
    summary: response?.content?.[0]?.text?.slice(0, 200) || "Unable to analyze changes.",
  };
}
