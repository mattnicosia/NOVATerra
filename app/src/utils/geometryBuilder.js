// geometryBuilder.js — Converts takeoff measurements into 3D building geometry
// Takes takeoffs + drawings + module specs → produces element descriptors for Three.js

import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useProjectStore } from "@/stores/projectStore";
import { nn } from "@/utils/format";
import { cleanPath } from "@/utils/geometrySnapping";
import { generateBuildingEnvelope } from "@/utils/envelopeBuilder";
import { pointInPolygon } from "@/utils/coverageGrid";
import { calculateLevelMiters } from "@/utils/pascalWallMitering";
import { detectSpacesForLevel } from "@/utils/pascalSpaceDetection";

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
  const { drawingScales, drawingDpi } = useDrawingPipelineStore.getState();
  const { tkCalibrations } = useDrawingPipelineStore.getState();
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

// ── Room polygon conversion + containment ────────────────────────
// Convert pixel-space room polygons to feet-space for a given drawing
function _roomsToFeetSpace(rooms, drawingId) {
  const ppf = getPxPerFoot(drawingId);
  if (!ppf || !rooms?.length) return [];
  return rooms.map(r => ({
    ...r,
    feetPolygon: r.polygon.map(p => ({ x: p.x / ppf, z: p.y / ppf })),
    feetCentroid: { x: r.centroid.x / ppf, z: r.centroid.y / ppf },
  }));
}

// Find which room a point belongs to (feet-space)
function _findContainingRoom(px, pz, feetRooms) {
  for (const room of feetRooms) {
    if (pointInPolygon(px, pz, room.feetPolygon)) return room;
  }
  return null;
}

// ── Build 3D elements from takeoffs ──────────────────────────────
// floorAssignments: optional map of drawingId → { floor, elevation, label, height }
// from floorAssignment.js buildFloorMap(). When provided, elements use real
// floor elevations instead of the fallback drawing-order heuristic.
// roomGeometry: optional map of drawingId → { rooms[], roomLabels[] }
// from geometryEngine. When provided, elements get roomId/roomLabel tags.
export function generateElementsFromTakeoffs(floorAssignments, roomGeometry) {
  const { takeoffs } = useDrawingPipelineStore.getState();
  const { drawings } = useDrawingPipelineStore.getState();
  const items = useItemsStore.getState().items;
  const getItemTotal = useItemsStore.getState().getItemTotal;

  const elements = [];
  const drawingLevels = {}; // sheetId → level index (fallback)

  // Assign levels based on drawing order (fallback when no floorAssignments)
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

      // Use smart floor assignment if available, fall back to drawing order
      const fa = floorAssignments?.[sheetId];
      const levelIdx = fa ? fa.floor : (drawingLevels[sheetId] || 0);
      const elevation = fa ? fa.elevation : levelIdx * 12;

      // Room containment: convert rooms to feet-space and find which room this measurement is in
      let roomId = null;
      let roomLabel = null;
      if (roomGeometry?.[sheetId]?.rooms) {
        const feetRooms = _roomsToFeetSpace(roomGeometry[sheetId].rooms, sheetId);
        // Compute measurement centroid in feet-space
        const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length / ppf;
        const cz = m.points.reduce((s, p) => s + p.y, 0) / m.points.length / ppf;
        const containingRoom = _findContainingRoom(cx, cz, feetRooms);
        if (containingRoom) {
          roomId = containingRoom.id;
          // Find room label from roomLabels array
          const labels = roomGeometry[sheetId].roomLabels || [];
          const label = labels.find(l => l.roomId === containingRoom.id);
          roomLabel = label?.label || label?.tag || containingRoom.id;
        }
      }

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
          sheetId,
          trade,
          division,
          description,
          cost,
          linkedItemId: to.linkedItemId,
          color: getTradeColor(trade),
          level: levelIdx,
          roomId,
          roomLabel,
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
          sheetId,
          trade,
          division,
          description,
          cost,
          linkedItemId: to.linkedItemId,
          color: getTradeColor(trade),
          level: levelIdx,
          roomId,
          roomLabel,
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
            sheetId,
            trade,
            division,
            description,
            cost: cost / Math.max(m.points.length, 1), // split cost per point
            linkedItemId: to.linkedItemId,
            color: getTradeColor(trade),
            level: levelIdx,
            roomId,
            roomLabel,
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

  // ── Pascal post-processing: wall mitering + space detection ──
  applyPascalAlgorithms(elements);

  return elements;
}

/**
 * Applies Pascal Editor algorithms to generated elements:
 * 1. Wall mitering — proper junction geometry at L/T junctions
 * 2. Space detection — auto-detect rooms from wall enclosures
 *
 * Mutates elements in-place (adds miterData to wall geometry).
 */
function applyPascalAlgorithms(elements) {
  // Group wall elements by floor elevation
  const wallsByFloor = {};
  for (const el of elements) {
    if (el.type !== "wall" || el.geometry?.kind !== "extrudedPath") continue;
    const path = el.geometry.path;
    if (!path || path.length < 2) continue;

    const elev = Math.round(el.geometry.elevation ?? 0);
    if (!wallsByFloor[elev]) wallsByFloor[elev] = [];

    // Convert extrudedPath to Pascal wall format: { id, start:[x,z], end:[x,z], thickness }
    wallsByFloor[elev].push({
      id: el.id,
      start: [path[0].x, path[0].z],
      end: [path[path.length - 1].x, path[path.length - 1].z],
      thickness: el.geometry.thickness ?? 0.5,
      _element: el, // back-reference for mutation
    });
  }

  // Run mitering per floor
  for (const [elev, walls] of Object.entries(wallsByFloor)) {
    if (walls.length < 2) continue;

    try {
      const { junctionData } = calculateLevelMiters(walls);

      // Store miter data on each wall element for the renderer to use
      for (const [_jKey, wallIntersections] of junctionData) {
        for (const [wallId, miterPoints] of wallIntersections) {
          const wall = walls.find(w => w.id === wallId);
          if (wall?._element?.geometry) {
            if (!wall._element.geometry.miterData) wall._element.geometry.miterData = [];
            wall._element.geometry.miterData.push(miterPoints);
          }
        }
      }

      // Run space detection for this floor
      const { spaces, wallUpdates } = detectSpacesForLevel(`floor-${elev}`, walls, 0.5);

      // Store wall side classifications
      for (const update of wallUpdates) {
        const wall = walls.find(w => w.id === update.wallId);
        if (wall?._element?.geometry) {
          wall._element.geometry.wallSide = {
            front: update.frontSide,
            back: update.backSide,
          };
        }
      }

      // Add detected rooms as slab elements
      for (const space of spaces) {
        if (space.isExterior) continue;
        elements.push({
          id: `pascal-room-${space.id}`,
          type: "pascal-room",
          trade: "Rooms",
          description: `Detected Room (${Math.round(space.area)} SF)`,
          color: "#2196F3",
          level: parseInt(elev) || 0,
          geometry: {
            kind: "polygon",
            points: space.polygon.map(([x, z]) => ({ x, z })),
            thickness: 0.05, // thin floor marker
            elevation: parseFloat(elev) || 0,
          },
        });
      }
    } catch (err) {
      console.warn(`[Pascal] Mitering/space detection failed for floor ${elev}:`, err);
    }
  }
}

// ── Generate 3D room outline elements from geometry analysis ─────
// Converts pixel-space room polygons into feet-space room outlines
// that can be rendered as subtle boundary lines in the 3D scene.
export function generateRoomElements(roomGeometry, floorAssignments) {
  const elements = [];
  if (!roomGeometry) return elements;

  for (const [drawingId, { rooms, roomLabels }] of Object.entries(roomGeometry)) {
    if (!rooms?.length) continue;
    const feetRooms = _roomsToFeetSpace(rooms, drawingId);
    if (!feetRooms.length) continue;

    const fa = floorAssignments?.[drawingId];
    const levelIdx = fa ? fa.floor : 0;
    const elevation = fa ? fa.elevation : 0;
    const height = fa ? fa.height : 12;

    feetRooms.forEach(room => {
      if (!room.feetPolygon || room.feetPolygon.length < 3) return;

      // Find label for this room
      const labels = roomLabels || [];
      const labelEntry = labels.find(l => l.roomId === room.id);
      const label = labelEntry?.label || labelEntry?.tag || room.id;

      elements.push({
        id: `room-outline-${drawingId}-${room.id}`,
        type: "roomOutline",
        roomId: room.id,
        drawingId,
        label,
        level: levelIdx,
        color: "#F0ECE6", // warm paper-white, matches FloorShell
        geometry: {
          kind: "roomOutline",
          points: room.feetPolygon,
          centroid: room.feetCentroid,
          elevation,
          height,
          area: room.area, // px² — for reference
          confidence: room.confidence,
        },
      });
    });
  }

  return elements;
}

// ── Building envelope from scan outline + project floors ─────────
// Reads outline polygon from modelStore and floor data from projectStore,
// then delegates to the pure envelopeBuilder function.
// Returns envelope elements that can be merged with takeoff elements.

export function generateEnvelopeFromStores() {
  const { outlines, floorHeights } = useDrawingPipelineStore.getState();
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
