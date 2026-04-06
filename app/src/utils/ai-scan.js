// NOVATerra AI Scan — OCR, segmented tiling, sheet reference detection
// Used by: scanRunner, scheduleParser, useTakeoffAnalysis, useTakeoffCanvasHandlers

import { callAnthropic } from "./ai-core";

// Re-export getAuthToken indirectly through a local wrapper for OCR auth
import { supabase } from "./supabase";

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000;
    if (Date.now() > expiresAt - 300_000) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) console.warn("[AI] Token refresh failed:", error.message);
      return refreshed?.session?.access_token || null;
    }
  } catch { /* use as-is */ }
  return token;
}

async function forceRefreshToken() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data?.session?.access_token || null;
  } catch { return null; }
}

// ─── BATCH PROCESSING ────────────────────────────────────────────
// Process multiple items in parallel with concurrency limit
export async function batchAI(items, processFn, concurrency = 3) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await processFn(items[i], i);
      } catch (err) {
        console.warn(`[batchAI] Item ${i}/${items.length} failed:`, err.message);
        results[i] = { error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  const failures = results.filter(r => r?.error);
  if (failures.length > 0) console.warn(`[batchAI] ${failures.length}/${items.length} items failed`);
  return results;
}

// ─── OCR — Google Cloud Vision Preprocessing ──────────────────────────

// ─── OCR Circuit Breaker ─────────────────────────────────────
let _ocrConsecutiveFailures = 0;
let _ocrCircuitOpenUntil = 0;
const OCR_CIRCUIT_OPEN_AFTER = 3; // consecutive failures before stopping
const OCR_CIRCUIT_RESET_MS = 30000; // try again after 30s

export async function runOCR(base64Image, storagePath = null) {
  // Circuit breaker: skip if too many recent failures
  if (Date.now() < _ocrCircuitOpenUntil) {
    console.warn("[OCR] Circuit open — skipping until", new Date(_ocrCircuitOpenUntil).toLocaleTimeString());
    return { text: "", blocks: [] };
  }

  try {
    let token = await getAuthToken();
    if (!token) return { text: "", blocks: [] };

    const body = storagePath ? { storagePath } : { image: base64Image };

    let resp = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    // 401 retry: refresh session and try once more
    if (resp.status === 401) {
      const freshToken = await forceRefreshToken();
      if (freshToken) {
        token = freshToken;
        resp = await fetch("/api/ocr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!resp.ok) {
      console.warn("[OCR] Failed:", resp.status);
      _ocrConsecutiveFailures++;
      if (_ocrConsecutiveFailures >= OCR_CIRCUIT_OPEN_AFTER) {
        _ocrCircuitOpenUntil = Date.now() + OCR_CIRCUIT_RESET_MS;
        console.error(`[OCR] Circuit opened after ${_ocrConsecutiveFailures} failures — pausing for 30s`);
      }
      return { text: "", blocks: [] };
    }

    _ocrConsecutiveFailures = 0; // reset on success
    return resp.json();
  } catch (err) {
    console.warn("[OCR] Error:", err.message);
    _ocrConsecutiveFailures++;
    if (_ocrConsecutiveFailures >= OCR_CIRCUIT_OPEN_AFTER) {
      _ocrCircuitOpenUntil = Date.now() + OCR_CIRCUIT_RESET_MS;
      console.error(`[OCR] Circuit opened after ${_ocrConsecutiveFailures} failures — pausing for 30s`);
    }
    return { text: "", blocks: [] };
  }
}

// ─── SEGMENTED OCR — Quadrant Tiling for High-Res Text Extraction ────

export function deduplicateOCRText(quadrantTexts) {
  const linesByQuadrant = new Map();
  const allLines = [];

  for (let qi = 0; qi < quadrantTexts.length; qi++) {
    const qText = quadrantTexts[qi];
    if (!qText) continue;
    const lines = qText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const key = trimmed.replace(/\s+/g, " ").toLowerCase();
      allLines.push({ key, original: trimmed, qi });
      if (!linesByQuadrant.has(key)) linesByQuadrant.set(key, new Set());
      linesByQuadrant.get(key).add(qi);
    }
  }

  const emittedCrossQuadrant = new Set();
  const result = [];
  for (const { key, original, qi: _qi } of allLines) {
    const quadrants = linesByQuadrant.get(key);
    if (quadrants.size > 1) {
      if (!emittedCrossQuadrant.has(key)) {
        emittedCrossQuadrant.add(key);
        result.push(original);
      }
    } else {
      result.push(original);
    }
  }

  return result.join("\n");
}

export async function segmentedOCR(base64Image, imgWidth, imgHeight) {
  const QUADRANT_OUTPUT_SIZE = 1000;
  const OVERLAP = 0.1;

  const halfW = Math.ceil(imgWidth / 2);
  const halfH = Math.ceil(imgHeight / 2);
  const overlapW = Math.ceil(imgWidth * OVERLAP);
  const overlapH = Math.ceil(imgHeight * OVERLAP);

  const quadrants = [
    { x: 0, y: 0, w: halfW + overlapW, h: halfH + overlapH, label: "TL" },
    { x: Math.max(0, halfW - overlapW), y: 0, w: imgWidth - halfW + overlapW, h: halfH + overlapH, label: "TR" },
    { x: 0, y: Math.max(0, halfH - overlapH), w: halfW + overlapW, h: imgHeight - halfH + overlapH, label: "BL" },
    {
      x: Math.max(0, halfW - overlapW),
      y: Math.max(0, halfH - overlapH),
      w: imgWidth - halfW + overlapW,
      h: imgHeight - halfH + overlapH,
      label: "BR",
    },
  ];

  quadrants.forEach(q => {
    q.w = Math.min(q.w, imgWidth - q.x);
    q.h = Math.min(q.h, imgHeight - q.y);
  });

  function cropQuadrant(q) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = QUADRANT_OUTPUT_SIZE / Math.max(q.w, q.h);
        canvas.width = Math.round(q.w * scale);
        canvas.height = Math.round(q.h * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, q.x, q.y, q.w, q.h, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = () => resolve(null);
      img.src = base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  try {
    console.log(`[OCR-SEG] Tiling ${imgWidth}x${imgHeight} image into 4 quadrants...`);

    const croppedImages = await Promise.all(quadrants.map(q => cropQuadrant(q)));

    const ocrResults = [];
    for (let i = 0; i < croppedImages.length; i++) {
      if (!croppedImages[i]) {
        ocrResults.push({ text: "", blocks: [] });
        continue;
      }
      console.log(`[OCR-SEG] Running OCR on quadrant ${quadrants[i].label}...`);
      ocrResults.push(await runOCR(croppedImages[i]));
    }

    const quadrantTexts = ocrResults.map(r => r.text || "");
    const allBlocks = ocrResults.flatMap(r => r.blocks || []);

    const mergedText = deduplicateOCRText(quadrantTexts);

    const totalChars = quadrantTexts.reduce((sum, t) => sum + t.length, 0);
    console.log(`[OCR-SEG] Extracted ${totalChars} raw chars → ${mergedText.length} chars after dedup`);

    return { text: mergedText, quadrantTexts, blocks: allBlocks };
  } catch (err) {
    console.warn("[OCR-SEG] Segmented OCR failed, falling back to single OCR:", err.message);
    const fallback = await runOCR(base64Image);
    return { text: fallback.text, quadrantTexts: [fallback.text], blocks: fallback.blocks };
  }
}

// ── Sheet Reference Detection ─────────────────────────────────────
export async function detectSheetReferences(base64ImageData) {
  const isDataUrl = base64ImageData.startsWith("data:");
  const mediaType = isDataUrl ? base64ImageData.match(/data:([^;]+)/)?.[1] || "image/jpeg" : "image/jpeg";
  const rawB64 = isDataUrl ? base64ImageData.split(",")[1] : base64ImageData;
  const resp = await callAnthropic({
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: rawB64 },
          },
          {
            type: "text",
            text: `Find cross-reference markers on this construction drawing. Return [] if none found. Accuracy is critical — returning [] is ALWAYS better than a false positive.

THE ONE RULE: A real cross-reference marker has a CIRCLE DIVIDED BY A HORIZONTAL LINE into two halves. Top half = ID (letter/number). Bottom half = SHEET NUMBER (like "A3", "S2", "A5.1"). If you cannot read a sheet number in the bottom half, it is NOT a cross-reference.

THREE TYPES TO FIND:
- SECTION: Divided circle at the end of a dashed cut line crossing the drawing. Has directional arrow.
- DETAIL: Divided circle connected by a leader line to a dashed boundary around an area.
- ELEVATION: Divided circle with an arrow pointing toward a building face.

NOT CROSS-REFERENCES (ignore all of these):
- Grid bubbles: circles with ONE letter/number, NO dividing line, sitting on grid lines
- View titles, drawing titles, any text below a drawing
- Door/window tags, wall type tags, room tags, keynotes
- North arrows, spot elevations, revision deltas, break lines
- Title block text, legend items, scale notations
- ANY circle that does not have a horizontal dividing line with a sheet number below it

Return JSON array. Each object: "label" (e.g. "A/A3"), "targetSheet" (e.g. "A3"), "type" ("section"/"detail"/"elevation"), "xPct" (0-100), "yPct" (0-100).

JSON array only, no other text. Default to [].`,
          },
        ],
      },
    ],
  });

  const text = (typeof resp === "string" ? resp : resp?.content?.[0]?.text) || "[]";
  try {
    const clean = text
      .replace(/```json?\s*/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[detectSheetReferences] Failed to parse:", text.substring(0, 200));
    return [];
  }
}
