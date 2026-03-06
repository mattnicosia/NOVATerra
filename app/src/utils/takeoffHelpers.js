// ─── Takeoff Helper Utilities ─────────────────────────────────────────
// Pure functions / constants extracted from TakeoffsPage.jsx for maintainability.
// Zero component dependencies — safe to import anywhere.

import { callAnthropic, buildProjectContext } from "@/utils/ai";

// Takeoff color palette
export const TO_COLORS = ["#E53E3E", "#38A169", "#3182CE", "#DD6B20", "#805AD5", "#D53F8C", "#2B6CB0", "#C53030"];

// ─── NOVA Prefetch + Session Cache ──────────────────────────────────────
export const _novaCache = new Map(); // key (lowercase trimmed) → { result | error, timestamp }

export function _novaCacheEvict() {
  if (_novaCache.size <= 10) return;
  let oldest = null,
    oldestKey = null;
  _novaCache.forEach((v, k) => {
    if (!oldest || v.timestamp < oldest) {
      oldest = v.timestamp;
      oldestKey = k;
    }
  });
  if (oldestKey) _novaCache.delete(oldestKey);
}

export const NOVA_SYSTEM_PROMPT = `You are a construction cost estimator. Given an item description, return a JSON object with CSI code, description, unit, and unit pricing.

Determine if the item is a SINGLE item or MULTI-PART scope item:
- SINGLE: Items with a single unit rate (e.g., "fire extinguisher cabinet", "black metal siding", "carpet tile")
- MULTI: Items that are typically composed of multiple sub-components (e.g., "drywall partition" = studs + GWB + taping + insulation)

Return ONLY valid JSON (no markdown fences, no explanation):

For SINGLE items:
{ "type": "single", "code": "07.46.23", "description": "Black Metal Siding - 24ga Standing Seam", "unit": "SF", "division": "07 - Thermal & Moisture Protection", "material": 8.50, "labor": 4.25, "equipment": 0.50, "subcontractor": 0 }

For MULTI-PART items:
{ "type": "multi", "groupName": "Drywall Partition", "items": [
  { "code": "09.22.16", "description": "Metal Studs 3-5/8\\" 25ga", "unit": "SF", "division": "09 - Finishes", "material": 1.85, "labor": 2.10, "equipment": 0, "subcontractor": 0 },
  { "code": "09.29.10", "description": "5/8\\" Type X GWB Both Sides", "unit": "SF", "division": "09 - Finishes", "material": 1.20, "labor": 1.50, "equipment": 0, "subcontractor": 0 }
]}

Rules:
- Use standard CSI MasterFormat codes (XX.XX.XX format)
- Include division name as "XX - Name"
- Be specific in descriptions
- Base pricing on current US market UNIT rates (cost per unit)
- Set subcontractor > 0 for trades typically subbed out (electrical, plumbing, HVAC, fire protection)
- For multi-part, include 2-6 component items
- Return ONLY the JSON object, nothing else`;

import { nn } from "@/utils/format";

export function buildNovaUserMsg(inputText, project) {
  const contextLines = [
    project.name && project.name !== "New Estimate" && `Project: ${project.name}`,
    project.client && `Client: ${project.client}`,
    project.buildingType && `Building Type: ${project.buildingType}`,
    project.workType && `Work Type: ${project.workType}`,
    project.projectSF && `Project SF: ${nn(project.projectSF).toLocaleString()}`,
    project.floorCount && `Floors: ${project.floorCount}`,
    project.jobType && `Job Type: ${project.jobType}`,
    project.address && `Location: ${project.address}`,
    project.zipCode && `Zip: ${project.zipCode}`,
  ].filter(Boolean);
  return inputText.trim() + (contextLines.length > 0 ? "\n\nProject context:\n" + contextLines.join("\n") : "");
}

export function parseNovaResponse(text) {
  const clean = text.replace(/```json\n?|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (parsed.type === "single" && parsed.code && parsed.description) return { result: parsed };
  if (parsed.type === "multi" && Array.isArray(parsed.items) && parsed.items.length > 0) return { result: parsed };
  return { error: "NOVA couldn't identify this item" };
}

// Parse complete JSON objects from a partial/streaming JSON array string
export function parsePartialJsonArray(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const objects = [];
  let depth = 0,
    inString = false,
    escape = false,
    objStart = -1;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          objects.push(JSON.parse(clean.slice(objStart, i + 1)));
        } catch {
          /* incomplete */
        }
        objStart = -1;
      }
    }
  }
  return objects;
}

// Load pdf.js from CDN
export const loadPdfJs = () =>
  new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("PDF.js timeout")), 15000);
  });
