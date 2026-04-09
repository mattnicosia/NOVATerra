// ifcToTakeoff.js — Converts parsed IFC elements into estimate takeoff items.
// Groups identical elements, extracts quantities from IFC properties,
// maps trades to CSI codes, and links generated items back to 3D elements.

import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";

// ── Trade → CSI division mapping ────────────────────────────────────
const TRADE_TO_CSI = {
  concrete:   { div: "03", code: "03.300", label: "Concrete" },
  framing:    { div: "06", code: "06.110", label: "Wood Framing" },
  steel:      { div: "05", code: "05.120", label: "Structural Steel" },
  doors:      { div: "08", code: "08.110", label: "Doors" },
  windows:    { div: "08", code: "08.500", label: "Windows" },
  roofing:    { div: "07", code: "07.500", label: "Roofing" },
  finishCarp: { div: "06", code: "06.200", label: "Finish Carpentry" },
};

// ── IFC type → preferred quantity field + unit ──────────────────────
const TYPE_QUANTITY_MAP = {
  wall:         { fields: ["NetSideArea", "NetArea", "GrossArea"], unit: "SF", fallbackCalc: "lengthTimesHeight" },
  slab:         { fields: ["NetArea", "GrossArea"], unit: "SF", fallbackCalc: "area" },
  door:         { fields: [], unit: "EA", fallbackCalc: "count" },
  window:       { fields: [], unit: "EA", fallbackCalc: "count" },
  column:       { fields: ["Length", "Height"], unit: "LF", fallbackCalc: "height" },
  beam:         { fields: ["Length"], unit: "LF", fallbackCalc: "length" },
  roof:         { fields: ["NetArea", "GrossArea"], unit: "SF", fallbackCalc: "area" },
  stair:        { fields: [], unit: "EA", fallbackCalc: "count" },
  "stair flight": { fields: [], unit: "EA", fallbackCalc: "count" },
  railing:      { fields: ["Length"], unit: "LF", fallbackCalc: "length" },
  "curtain wall": { fields: ["NetSideArea", "NetArea", "GrossArea"], unit: "SF", fallbackCalc: "lengthTimesHeight" },
  plate:        { fields: ["NetArea", "GrossArea"], unit: "SF", fallbackCalc: "area" },
  member:       { fields: ["Length"], unit: "LF", fallbackCalc: "length" },
  footing:      { fields: ["NetVolume", "GrossVolume"], unit: "CY", fallbackCalc: "volume" },
  pile:         { fields: ["Length"], unit: "LF", fallbackCalc: "length" },
};

// Meters → feet/SF/CY conversion
const M_TO_FT = 3.28084;
const M2_TO_SF = 10.7639;
const M3_TO_CY = 1.30795;

// ── Extract quantity from IFC element properties ────────────────────
function extractQuantity(element) {
  const typeMap = TYPE_QUANTITY_MAP[element.type] || { fields: [], unit: "EA", fallbackCalc: "count" };
  const allProps = element.ifcProperties || {};

  // Search all property sets for the preferred quantity fields
  for (const field of typeMap.fields) {
    for (const pset of Object.values(allProps)) {
      if (typeof pset === "object" && pset[field] != null) {
        let val = parseFloat(pset[field]);
        if (isNaN(val) || val <= 0) continue;

        // Convert from metric (IFC default) to imperial
        if (typeMap.unit === "SF") val *= M2_TO_SF;
        else if (typeMap.unit === "LF") val *= M_TO_FT;
        else if (typeMap.unit === "CY") val *= M3_TO_CY;

        return { qty: Math.round(val * 100) / 100, unit: typeMap.unit };
      }
    }
  }

  // Fallback calculations from geometry/basic properties
  const fb = typeMap.fallbackCalc;
  if (fb === "count") return { qty: 1, unit: "EA" };

  // Try to find Length, Width, Height from any property set
  let len = 0, wid = 0, ht = 0;
  for (const pset of Object.values(allProps)) {
    if (typeof pset !== "object") continue;
    if (pset.Length) len = parseFloat(pset.Length) || 0;
    if (pset.Width) wid = parseFloat(pset.Width) || 0;
    if (pset.Height) ht = parseFloat(pset.Height) || 0;
  }

  if (fb === "lengthTimesHeight" && len > 0 && ht > 0) {
    return { qty: Math.round(len * ht * M2_TO_SF * 100) / 100, unit: "SF" };
  }
  if (fb === "area" && len > 0 && wid > 0) {
    return { qty: Math.round(len * wid * M2_TO_SF * 100) / 100, unit: "SF" };
  }
  if (fb === "height" && ht > 0) {
    return { qty: Math.round(ht * M_TO_FT * 100) / 100, unit: "LF" };
  }
  if (fb === "length" && len > 0) {
    return { qty: Math.round(len * M_TO_FT * 100) / 100, unit: "LF" };
  }
  if (fb === "volume" && len > 0 && wid > 0 && ht > 0) {
    return { qty: Math.round(len * wid * ht * M3_TO_CY * 100) / 100, unit: "CY" };
  }

  return { qty: 1, unit: "EA" };
}

// ── Generate grouping key for identical elements ────────────────────
function groupKey(el) {
  // Group by: type + material + trade + level
  const mat = el.material || "unknown";
  const layers = (el.materialLayers || []).map(l => `${l.name}:${l.thickness}`).join("|");
  return `${el.type}::${mat}::${layers}::${el.trade}::${el.level || ""}`;
}

// ── Main: generate takeoff items from IFC elements ──────────────────
export function generateTakeoffsFromIFC() {
  const elements = useDrawingPipelineStore.getState().ifcElements || [];
  if (elements.length === 0) {
    useUiStore.getState().showToast("No IFC elements found", "warning");
    return { items: 0, linked: 0 };
  }

  const addElement = useItemsStore.getState().addElement;
  const existingItems = useItemsStore.getState().items;

  // Check if IFC takeoffs already exist
  const existingIfcItems = existingItems.filter(i => i.source?.category === "ifc");
  if (existingIfcItems.length > 0) {
    useUiStore.getState().showToast(
      `${existingIfcItems.length} BIM items already exist — remove them first to regenerate`,
      "warning"
    );
    return { items: 0, linked: 0 };
  }

  // ── Group identical elements ──
  const groups = {};
  for (const el of elements) {
    const key = groupKey(el);
    if (!groups[key]) {
      groups[key] = { elements: [], type: el.type, trade: el.trade, material: el.material, level: el.level, materialLayers: el.materialLayers };
    }
    groups[key].elements.push(el);
  }

  // ── Generate takeoff items from groups ──
  const itemLinks = []; // { elementIds, itemId }
  let totalItems = 0;
  let totalLinked = 0;

  for (const [, group] of Object.entries(groups)) {
    const csi = TRADE_TO_CSI[group.trade] || { div: "01", code: "01.000", label: "General" };
    const firstEl = group.elements[0];

    // Extract quantity: sum quantities for count-based, use first for area/length
    const qInfo = extractQuantity(firstEl);
    let totalQty;
    if (qInfo.unit === "EA") {
      totalQty = group.elements.length;
    } else {
      // Sum quantities across all elements in group
      totalQty = group.elements.reduce((sum, el) => {
        const q = extractQuantity(el);
        return sum + q.qty;
      }, 0);
      totalQty = Math.round(totalQty * 100) / 100;
    }

    // Build description
    const typeName = firstEl.type.charAt(0).toUpperCase() + firstEl.type.slice(1);
    const matDesc = group.material && group.material !== "unknown" ? ` - ${group.material}` : "";
    const levelDesc = group.level ? ` (${group.level})` : "";
    const layerDesc = (group.materialLayers || []).length > 0
      ? ` [${group.materialLayers.map(l => l.name).join(" + ")}]`
      : "";
    const description = `${typeName}${matDesc}${layerDesc}${levelDesc}`;

    // Add to estimate
    const division = `${csi.div} - ${csi.label}`;
    const preset = {
      code: csi.code,
      name: description,
      quantity: totalQty,
      unit: qInfo.unit,
      trade: group.trade,
      source: { category: "ifc", label: "BIM Import" },
    };

    addElement(division, preset, "base");
    totalItems++;

    // Track linking — find the item we just created
    const newItems = useItemsStore.getState().items;
    const justAdded = newItems[newItems.length - 1];
    if (justAdded) {
      itemLinks.push({
        elementIds: group.elements.map(e => e.id),
        itemId: justAdded.id,
      });
      totalLinked += group.elements.length;
    }
  }

  // ── Link elements back to items in drawingPipelineStore ──
  const currentElements = useDrawingPipelineStore.getState().ifcElements;
  const linkedElements = currentElements.map(el => {
    const link = itemLinks.find(l => l.elementIds.includes(el.id));
    if (link) return { ...el, linkedItemId: link.itemId };
    return el;
  });
  useDrawingPipelineStore.getState().setIfcElements(linkedElements);
  useDrawingPipelineStore.getState().setElements(linkedElements);

  useUiStore.getState().showToast(
    `Generated ${totalItems} takeoff items from ${totalLinked} BIM elements`,
    "success"
  );

  return { items: totalItems, linked: totalLinked };
}
