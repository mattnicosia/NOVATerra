// geometryBuilder.js — Converts takeoff measurements into 3D building geometry
// Takes takeoffs + drawings + module specs → produces element descriptors for Three.js

import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useModuleStore } from "@/stores/moduleStore";
import { nn } from "@/utils/format";
import { cleanPath } from "@/utils/geometrySnapping";
import { generateBuildingEnvelope } from "@/utils/envelopeBuilder";

// ── Scale conversion (mirrors TakeoffsPage logic) ──────────────────
const ARCH_MAP = {
  full: 1,
  half: 0.5,
  "3-8": 3 / 8,
  quarter: 1 / 4,
  "3-16": 3 / 16,
  eighth: 1 / 8,
  "3-32": 3 / 32,
  sixteenth: 1 / 16,
};

function scaleCodeToPxPerFoot(code, dpi) {
  if (ARCH_MAP[code] !== undefined) return dpi * ARCH_MAP[code];
  const engMatch = code.match(/^eng(\d+)$/);
  if (engMatch) return dpi / parseInt(engMatch[1]);
  const metricMatch = code.match(/^1:(\d+)$/);
  if (metricMatch) return ((dpi / 25.4) * 1000) / parseInt(metricMatch[1]);
  return null;
}

export function getPxPerFoot(drawingId) {
  const { drawingScales, drawingDpi } = useDrawingsStore.getState();
  const { tkCalibrations } = useTakeoffsStore.getState();
  const cal = tkCalibrations[drawingId];
  if (cal?.p1 && cal?.p2 && cal?.realDist) {
    const calPxDist = Math.sqrt((cal.p2.x - cal.p1.x) ** 2 + (cal.p2.y - cal.p1.y) ** 2);
    if (calPxDist > 0) return calPxDist / nn(cal.realDist);
  }
  const scaleCode = drawingScales[drawingId];
  const dpi = drawingDpi[drawingId] || 96;
  if (scaleCode && scaleCode !== "custom") return scaleCodeToPxPerFoot(scaleCode, dpi);
  return null;
}

function _pxToFeet(drawingId, pxDist) {
  const ppf = getPxPerFoot(drawingId);
  return ppf ? pxDist / ppf : null;
}

// Convert pixel point to feet coordinates (origin at top-left of sheet)
function _pointToFeet(pt, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf) return null;
  return { x: pt.x / ppf, y: pt.y / ppf };
}

// ── Trade color palette ──────────────────────────────────────────
const TRADE_COLORS = {
  general: "#6B7280",
  demo: "#EF4444",
  sitework: "#92400E",
  concrete: "#9CA3AF",
  masonry: "#B45309",
  steel: "#3B82F6",
  framing: "#F59E0B",
  finishCarp: "#D97706",
  insulation: "#EC4899",
  roofing: "#7C3AED",
  doors: "#10B981",
  windows: "#06B6D4",
  drywall: "#F3F4F6",
  tile: "#8B5CF6",
  act: "#A78BFA",
  flooring: "#84CC16",
  painting: "#FB923C",
  specialties: "#14B8A6",
  elevator: "#6366F1",
  fireSuppression: "#DC2626",
  plumbing: "#2563EB",
  hvac: "#059669",
  electrical: "#EAB308",
  unassigned: "#6B7280",
};

export function getTradeColor(tradeKey) {
  return TRADE_COLORS[tradeKey] || TRADE_COLORS.unassigned;
}

// ── Spec resolution from module store ────────────────────────────
function getSpecValue(takeoff, specId) {
  const moduleState = useModuleStore.getState();
  // Search all module instances for a spec matching this takeoff
  for (const [_modId, inst] of Object.entries(moduleState.moduleInstances || {})) {
    // Check if takeoff is linked to this module instance
    const tIds = inst.itemTakeoffIds || {};
    const isLinked = Object.values(tIds).includes(takeoff.id);
    if (isLinked && inst.specs?.[specId] !== undefined) return nn(inst.specs[specId]);

    // Check category instances (multi-instance like wall types)
    for (const [_catId, instances] of Object.entries(inst.categoryInstances || {})) {
      for (const catInst of instances) {
        const catTIds = catInst.itemTakeoffIds || {};
        if (Object.values(catTIds).includes(takeoff.id) && catInst.specs?.[specId] !== undefined) {
          return nn(catInst.specs[specId]);
        }
      }
    }
  }
  return null;
}

// ── Build 3D elements from takeoffs ──────────────────────────────
export function generateElementsFromTakeoffs() {
  const { takeoffs } = useTakeoffsStore.getState();
  const { drawings } = useDrawingsStore.getState();
  const items = useItemsStore.getState().items;
  const getItemTotal = useItemsStore.getState().getItemTotal;

  const elements = [];
  const drawingLevels = {}; // sheetId → level index

  // Assign levels based on drawing order (simple heuristic)
  drawings.forEach((d, i) => {
    drawingLevels[d.id] = i;
  });

  takeoffs.forEach(to => {
    if (!to.measurements || to.measurements.length === 0) return;

    // Resolve cost from linked item
    let cost = 0;
    let trade = "unassigned";
    let division = "";
    let description = to.description;

    if (to.linkedItemId && to.linkedItemId !== "grouped") {
      const item = items.find(it => it.id === to.linkedItemId);
      if (item) {
        cost = getItemTotal(item);
        trade = item.trade || "unassigned";
        division = item.division || "";
        description = item.description || to.description;
      }
    }

    // Resolve height from module specs
    const wallHeight = getSpecValue(to, "WallHeight") || 10; // default 10'
    const thickness = getSpecValue(to, "FtgWidth") || getSpecValue(to, "WallThick") || 6; // default 6"
    const thicknessFt = thickness > 3 ? thickness / 12 : thickness; // if > 3, assume inches → convert

    to.measurements.forEach(m => {
      if (!m.points || m.points.length === 0) return;
      const sheetId = m.sheetId || drawings[0]?.id;
      const ppf = getPxPerFoot(sheetId);
      if (!ppf) return; // no scale → can't convert to real coords

      const levelIdx = drawingLevels[sheetId] || 0;
      const elevation = levelIdx * 12; // 12' per story default

      if ((m.type === "linear" || to.unit === "LF") && m.points.length >= 2) {
        // LINEAR → extruded wall/footing/beam
        const rawPath = m.points.map(p => ({
          x: p.x / ppf,
          z: p.y / ppf, // Y in 2D → Z in 3D (depth axis)
        }));
        const pathFt = cleanPath(rawPath);

        // Skip if snapping collapsed the path to < 2 points
        if (pathFt.length < 2) return;

        elements.push({
          id: `${to.id}-${m.id}`,
          type: "wall",
          takeoffId: to.id,
          measurementId: m.id,
          trade,
          division,
          description,
          cost,
          linkedItemId: to.linkedItemId,
          color: getTradeColor(trade),
          level: levelIdx,
          geometry: {
            kind: "extrudedPath",
            path: pathFt,
            rawPath,
            height: wallHeight,
            thickness: thicknessFt,
            elevation,
          },
        });
      } else if ((m.type === "area" || to.unit === "SF") && m.points.length >= 3) {
        // AREA → flat polygon (slab/ceiling/floor)
        const rawPoly = m.points.map(p => ({
          x: p.x / ppf,
          z: p.y / ppf,
        }));
        const polyFt = cleanPath(rawPoly);

        // Skip if snapping collapsed the polygon to < 3 points
        if (polyFt.length < 3) return;

        elements.push({
          id: `${to.id}-${m.id}`,
          type: "slab",
          takeoffId: to.id,
          measurementId: m.id,
          trade,
          division,
          description,
          cost,
          linkedItemId: to.linkedItemId,
          color: getTradeColor(trade),
          level: levelIdx,
          geometry: {
            kind: "polygon",
            points: polyFt,
            rawPoints: rawPoly,
            thickness: 0.5, // 6" slab default
            elevation,
          },
        });
      } else if ((m.type === "count" || to.unit === "EA") && m.points.length >= 1) {
        // COUNT → placed boxes/markers
        const widthFt = (getSpecValue(to, "SpreadLength") || 36) / 12;
        const depthFt = (getSpecValue(to, "SpreadWidth") || 36) / 12;
        const heightFt = getSpecValue(to, "FtgDepth") ? getSpecValue(to, "FtgDepth") / 12 : 2;

        m.points.forEach((p, pi) => {
          const ptFt = { x: p.x / ppf, z: p.y / ppf };
          elements.push({
            id: `${to.id}-${m.id}-${pi}`,
            type: "object",
            takeoffId: to.id,
            measurementId: m.id,
            trade,
            division,
            description,
            cost: cost / Math.max(m.points.length, 1), // split cost per point
            linkedItemId: to.linkedItemId,
            color: getTradeColor(trade),
            level: levelIdx,
            geometry: {
              kind: "box",
              position: ptFt,
              width: widthFt,
              depth: depthFt,
              height: heightFt,
              elevation,
            },
          });
        });
      }
    });
  });

  return elements;
}

// ── Building envelope from scan outline + project floors ─────────
// Reads outline polygon from modelStore and floor data from projectStore,
// then delegates to the pure envelopeBuilder function.
// Returns envelope elements that can be merged with takeoff elements.

export function generateEnvelopeFromStores() {
  // Lazy import to avoid circular dependency (modelStore → geometryBuilder → modelStore)
  const { useModelStore } = require("@/stores/modelStore");
  const { useProjectStore } = require("@/stores/projectStore");

  const { outlines, floorHeights } = useModelStore.getState();
  const { project } = useProjectStore.getState();

  // Get the best available outline (first entry)
  const outlineEntry = Object.values(outlines)[0];
  if (!outlineEntry?.polygon || outlineEntry.polygon.length < 3) return [];

  // Get floor definitions — fall back to sensible defaults
  let floors = project.floors;
  if (!floors || floors.length === 0) {
    const count = parseInt(project.floorCount) || 1;
    const hasBasement = parseInt(project.basementCount) > 0;
    floors = [];
    if (hasBasement) {
      for (let i = parseInt(project.basementCount); i >= 1; i--) {
        floors.push({ label: `Basement ${i > 1 ? i : ""}`.trim(), height: 10 });
      }
    }
    for (let i = 1; i <= count; i++) {
      floors.push({ label: `Level ${i}`, height: i === 1 ? 14 : 12 });
    }
  }

  return generateBuildingEnvelope(outlineEntry.polygon, floors, floorHeights);
}
