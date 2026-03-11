import { useMemo } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// ═══════════════════════════════════════════════════════════════════════════════
// BuildingSketch — Isometric 2.5D architectural sketch of the building
// Renders from real outline polygons (Tier 1), generated rectangles (Tier 2),
// or a minimal placeholder (Tier 3) based on available data.
// ═══════════════════════════════════════════════════════════════════════════════

const ISO_COS = 0.866; // cos(30°)
const ISO_SIN = 0.5; // sin(30°)

/** Project 3D point (x = width, y = up, z = depth) → 2D isometric SVG coords */
function iso(x, y, z) {
  return { sx: (x - z) * ISO_COS, sy: (x + z) * ISO_SIN - y };
}

/** Convert array of iso-projected points to SVG path string */
function toPath(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ") + " Z";
}

/** Compute signed area of a 2D polygon — positive = CW, negative = CCW */
function signedArea(poly) {
  let area = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  return area / 2;
}

/** Aspect ratio heuristics by building type */
const ASPECT = {
  "residential-single": 1.6,
  "residential-multi": 2.0,
  "commercial-office": 1.4,
  industrial: 2.5,
  retail: 2.0,
  healthcare: 1.5,
  education: 1.8,
  hospitality: 1.6,
  restaurant: 1.3,
  parking: 2.2,
};

/** Vertical scale factor — shrink feet → SVG so building isn't too tall */
const Y_SCALE = 0.6;

export default function BuildingSketch({ outlines, floorAssignments, floors, project, C, T }) {
  const data = useMemo(() => {
    const entries = Object.entries(outlines || {});
    const floorData = floors.length > 0 ? floors : [];
    const fc = parseInt(project.floorCount) || floorData.length || 1;

    // ── Determine base polygon [{x, z}] in feet ──
    let basePoly;

    if (entries.length > 0) {
      // Tier 1: real outline
      const preferred = entries.find(([id]) => {
        const fa = (floorAssignments || {})[id];
        return fa && (fa.floor === 0 || fa.floor === 1 || fa.label === "Floor 1");
      });
      basePoly = (preferred || entries[0])[1].polygon;
      if (!basePoly || basePoly.length < 3) basePoly = null;
    }

    if (!basePoly && project.buildingFootprintSF) {
      // Tier 2: generated rectangle from footprint SF
      const sf = parseFloat(project.buildingFootprintSF);
      if (sf > 0) {
        const ratio = ASPECT[project.buildingType] || ASPECT[project.jobType] || 1.3;
        const depth = Math.sqrt(sf / ratio);
        const width = sf / depth;
        basePoly = [
          { x: 0, z: 0 },
          { x: width, z: 0 },
          { x: width, z: depth },
          { x: 0, z: depth },
        ];
      }
    }

    if (!basePoly && project.projectSF && fc > 0) {
      // Tier 2 fallback: total SF / floor count
      const sf = parseFloat(project.projectSF) / fc;
      if (sf > 0) {
        const ratio = ASPECT[project.buildingType] || ASPECT[project.jobType] || 1.3;
        const depth = Math.sqrt(sf / ratio);
        const width = sf / depth;
        basePoly = [
          { x: 0, z: 0 },
          { x: width, z: 0 },
          { x: width, z: depth },
          { x: 0, z: depth },
        ];
      }
    }

    if (!basePoly && fc > 0) {
      // Tier 2 last resort: generate default footprint from building type
      const defaults = {
        "residential-single": 1800,
        "residential-multi": 4000,
        "commercial-office": 5000,
        industrial: 8000,
        retail: 3500,
        healthcare: 6000,
        education: 5000,
        hospitality: 4000,
        restaurant: 2000,
        parking: 10000,
      };
      const sf = defaults[project.buildingType] || defaults[project.jobType] || 2000;
      const ratio = ASPECT[project.buildingType] || ASPECT[project.jobType] || 1.3;
      const depth = Math.sqrt(sf / ratio);
      const width = sf / depth;
      basePoly = [
        { x: 0, z: 0 },
        { x: width, z: 0 },
        { x: width, z: depth },
        { x: 0, z: depth },
      ];
    }

    if (!basePoly) return { tier: 3 };

    // ── Normalize winding to CW ──
    if (signedArea(basePoly) < 0) basePoly = [...basePoly].reverse();

    // ── Center polygon ──
    const xs = basePoly.map(p => p.x);
    const zs = basePoly.map(p => p.z);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const cx = (minX + maxX) / 2,
      cz = (minZ + maxZ) / 2;
    const centered = basePoly.map(p => ({ x: p.x - cx, z: p.z - cz }));
    const polyW = maxX - minX;
    const polyD = maxZ - minZ;

    // ── Floor elevations ──
    const elevs = [0];
    for (let i = 0; i < fc; i++) {
      const h = (floorData[i]?.height || 12) * Y_SCALE;
      elevs.push(elevs[elevs.length - 1] + h);
    }
    const totalH = elevs[elevs.length - 1];
    const realH = elevs.reduce((_, __, idx) => {
      if (idx === 0) return 0;
      return _ + (floorData[idx - 1]?.height || 12);
    }, 0);

    // ── Project all floor polygons to isometric ──
    const n = centered.length;
    const floorPolys = elevs.map(elev => centered.map(p => iso(p.x, elev, p.z)));

    // ── Compute viewBox ──
    const allPts = floorPolys.flat();
    const pad = 40;
    const svgMinX = Math.min(...allPts.map(p => p.sx)) - pad;
    const svgMinY = Math.min(...allPts.map(p => p.sy)) - pad;
    const svgMaxX = Math.max(...allPts.map(p => p.sx)) + pad;
    const svgMaxY = Math.max(...allPts.map(p => p.sy)) + pad;
    const vb = `${svgMinX.toFixed(0)} ${svgMinY.toFixed(0)} ${(svgMaxX - svgMinX).toFixed(0)} ${(svgMaxY - svgMinY).toFixed(0)}`;

    // ── Build faces ──
    const topFace = toPath(floorPolys[floorPolys.length - 1]);
    const bottomFace = toPath(floorPolys[0]);

    const frontFaces = [];
    const backEdges = [];
    const vertEdges = [];
    const floorLines = [];
    const floorLabels = [];

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = centered[j].x - centered[i].x;
      const dz = centered[j].z - centered[i].z;
      // Outward normal (rotate CW edge 90°)
      const nx = dz,
        nz = -dx;
      // Viewer direction in iso: (1, 0, 1)
      const dot = nx + nz;

      const b0 = floorPolys[0][i],
        b1 = floorPolys[0][j];
      const t0 = floorPolys[floorPolys.length - 1][i];
      const t1 = floorPolys[floorPolys.length - 1][j];

      if (dot > 0) {
        // Front-facing side quad
        frontFaces.push(
          `M${b0.sx.toFixed(1)},${b0.sy.toFixed(1)} ` +
            `L${b1.sx.toFixed(1)},${b1.sy.toFixed(1)} ` +
            `L${t1.sx.toFixed(1)},${t1.sy.toFixed(1)} ` +
            `L${t0.sx.toFixed(1)},${t0.sy.toFixed(1)} Z`,
        );
        // Vertical edge at start vertex
        vertEdges.push({ x1: b0.sx, y1: b0.sy, x2: t0.sx, y2: t0.sy });

        // Floor separation lines on this visible face
        for (let fi = 1; fi < elevs.length - 1; fi++) {
          const p0 = floorPolys[fi][i],
            p1 = floorPolys[fi][j];
          floorLines.push({ x1: p0.sx, y1: p0.sy, x2: p1.sx, y2: p1.sy });
        }
      } else {
        // Back edge (hidden)
        backEdges.push({ x1: b0.sx, y1: b0.sy, x2: b1.sx, y2: b1.sy });
        backEdges.push({ x1: t0.sx, y1: t0.sy, x2: t1.sx, y2: t1.sy });
      }
    }

    // Last visible corner closing vertical edge
    if (vertEdges.length > 0) {
      // Find the last front-facing edge's end vertex
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = centered[j].x - centered[i].x;
        const dz = centered[j].z - centered[i].z;
        const dot = dz - dx; // nx + nz
        const prevI = (i - 1 + n) % n;
        const pdx = centered[i].x - centered[prevI].x;
        const pdz = centered[i].z - centered[prevI].z;
        const prevDot = pdz - pdx;
        // If this edge is back-facing but previous was front-facing, add closing vert
        if (dot <= 0 && prevDot > 0) {
          const b = floorPolys[0][i],
            t = floorPolys[floorPolys.length - 1][i];
          vertEdges.push({ x1: b.sx, y1: b.sy, x2: t.sx, y2: t.sy });
        }
      }
    }

    // ── Floor labels (on the leftmost visible edge) ──
    for (let fi = 0; fi < fc; fi++) {
      const midElev = (elevs[fi] + elevs[fi + 1]) / 2;
      // Use leftmost polygon point
      let leftIdx = 0;
      for (let i = 1; i < n; i++) {
        const pi = iso(centered[i].x, midElev, centered[i].z);
        const pl = iso(centered[leftIdx].x, midElev, centered[leftIdx].z);
        if (pi.sx < pl.sx) leftIdx = i;
      }
      const pt = iso(centered[leftIdx].x - 3, midElev, centered[leftIdx].z);
      floorLabels.push({
        x: pt.sx - 4,
        y: pt.sy,
        text: floorData[fi]?.label || `Floor ${fi + 1}`,
      });
    }

    // ── Dimension labels ──
    const dims = [];

    // Width — along the bottom front edge (find longest front-facing bottom edge)
    let bestFrontEdge = null,
      bestLen = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = centered[j].x - centered[i].x;
      const dz = centered[j].z - centered[i].z;
      if (dz - dx > 0) {
        // front-facing
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > bestLen) {
          bestLen = len;
          bestFrontEdge = [i, j];
        }
      }
    }
    if (bestFrontEdge) {
      const [a, b] = bestFrontEdge;
      const p0 = iso(centered[a].x, -4 * Y_SCALE, centered[a].z);
      const p1 = iso(centered[b].x, -4 * Y_SCALE, centered[b].z);
      const edgeLen = Math.sqrt((centered[b].x - centered[a].x) ** 2 + (centered[b].z - centered[a].z) ** 2);
      dims.push({
        x1: p0.sx,
        y1: p0.sy,
        x2: p1.sx,
        y2: p1.sy,
        tx: (p0.sx + p1.sx) / 2,
        ty: (p0.sy + p1.sy) / 2 + 10,
        label: `${Math.round(edgeLen)}'`,
      });
    }

    // Height — along the rightmost visible vertical edge
    if (vertEdges.length > 0) {
      const rightVert = vertEdges.reduce((best, e) => (e.x1 > best.x1 ? e : best), vertEdges[0]);
      dims.push({
        x1: rightVert.x1 + 6,
        y1: rightVert.y1,
        x2: rightVert.x2 + 6,
        y2: rightVert.y2,
        tx: rightVert.x1 + 14,
        ty: (rightVert.y1 + rightVert.y2) / 2,
        label: `${Math.round(realH)}'`,
      });
    }

    // Depth — along the longest left-receding bottom edge (back-facing, going into depth)
    let bestDepthEdge = null,
      bestDepthLen = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = centered[j].x - centered[i].x;
      const dz = centered[j].z - centered[i].z;
      if (dz - dx <= 0) {
        // back-facing / left-receding edge
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > bestDepthLen) {
          bestDepthLen = len;
          bestDepthEdge = [i, j];
        }
      }
    }
    if (bestDepthEdge) {
      const [a, b] = bestDepthEdge;
      const p0 = iso(centered[a].x, -4 * Y_SCALE, centered[a].z);
      const p1 = iso(centered[b].x, -4 * Y_SCALE, centered[b].z);
      const edgeLen = Math.sqrt((centered[b].x - centered[a].x) ** 2 + (centered[b].z - centered[a].z) ** 2);
      dims.push({
        x1: p0.sx - 6,
        y1: p0.sy,
        x2: p1.sx - 6,
        y2: p1.sy,
        tx: (p0.sx + p1.sx) / 2 - 14,
        ty: (p0.sy + p1.sy) / 2 + 2,
        label: `${Math.round(edgeLen)}'`,
      });
    }

    const tier = entries.length > 0 ? 1 : 2;

    return {
      tier,
      vb,
      topFace,
      bottomFace,
      frontFaces,
      backEdges,
      vertEdges,
      floorLines,
      floorLabels,
      dims,
      polyW: Math.round(polyW),
      polyD: Math.round(polyD),
    };
  }, [outlines, floorAssignments, floors, project]);

  // ── Tier 3: Placeholder ──
  if (data.tier === 3) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: T.space[5],
          width: "100%",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: T.radius.md,
            background: `${C.textDim}08`,
            border: `2px dashed ${C.textDim}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: T.space[2],
          }}
        >
          <Ic d={I.cube} size={22} color={C.textDim} />
        </div>
        <div style={{ fontSize: 10, color: C.textDim, textAlign: "center", maxWidth: 200 }}>
          Upload plans for building visualization
        </div>
      </div>
    );
  }

  // ── Tier 1 & 2: Isometric SVG ──
  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* Tier badge */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontSize: 8,
          fontWeight: 600,
          color: C.textDim,
          padding: "2px 6px",
          borderRadius: T.radius.sm,
          background: `${C.textDim}08`,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {data.tier === 1 ? "From Plans" : "Estimated"}
      </div>

      <svg
        viewBox={data.vb}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", maxHeight: 280, display: "block" }}
      >
        <defs>
          {/* Cross-hatch pattern for side faces */}
          <pattern id="bldg-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={C.textDim} strokeWidth="0.4" strokeOpacity="0.12" />
          </pattern>
          {/* Lighter hatch for back faces */}
          <pattern
            id="bldg-hatch-light"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.textDim} strokeWidth="0.3" strokeOpacity="0.06" />
          </pattern>
        </defs>

        {/* Back edges (hidden lines) */}
        {data.backEdges.map((e, i) => (
          <line
            key={`be-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={C.textDim}
            strokeWidth={0.4}
            strokeDasharray="2 3"
            strokeOpacity={0.2}
          />
        ))}

        {/* Bottom face */}
        <path d={data.bottomFace} fill="none" stroke={C.textDim} strokeWidth={0.4} strokeOpacity={0.15} />

        {/* Side faces with cross-hatching */}
        {data.frontFaces.map((d, i) => (
          <path
            key={`sf-${i}`}
            d={d}
            fill="url(#bldg-hatch)"
            stroke={C.textDim}
            strokeWidth={0.8}
            strokeOpacity={0.5}
          />
        ))}

        {/* Top face — subtle accent fill */}
        <path d={data.topFace} fill={`${C.accent}10`} stroke={C.textDim} strokeWidth={1} strokeOpacity={0.6} />

        {/* Floor separation lines */}
        {data.floorLines.map((l, i) => (
          <line
            key={`fl-${i}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={C.textDim}
            strokeWidth={0.5}
            strokeDasharray="4 3"
            strokeOpacity={0.35}
          />
        ))}

        {/* Vertical edges */}
        {data.vertEdges.map((e, i) => (
          <line
            key={`ve-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={C.textDim}
            strokeWidth={1}
            strokeOpacity={0.6}
          />
        ))}

        {/* Floor labels */}
        {data.floorLabels.map((l, i) => (
          <text
            key={`lbl-${i}`}
            x={l.x}
            y={l.y}
            fill={C.textDim}
            fontSize={7}
            fontFamily="'Switzer', sans-serif"
            fontWeight={500}
            textAnchor="end"
            dominantBaseline="middle"
            opacity={0.6}
          >
            {l.text}
          </text>
        ))}

        {/* Dimension lines & labels */}
        {data.dims.map((d, i) => (
          <g key={`dim-${i}`}>
            {/* Extension line */}
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={C.accent} strokeWidth={0.5} strokeOpacity={0.4} />
            {/* Small ticks at each end */}
            <circle cx={d.x1} cy={d.y1} r={1.2} fill={C.accent} fillOpacity={0.4} />
            <circle cx={d.x2} cy={d.y2} r={1.2} fill={C.accent} fillOpacity={0.4} />
            {/* Label */}
            <text
              x={d.tx}
              y={d.ty}
              fill={C.accent}
              fontSize={8}
              fontFamily="'Switzer', sans-serif"
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
              opacity={0.7}
            >
              {d.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Footprint annotation below */}
      {(data.polyW > 0 || data.polyD > 0) && (
        <div
          style={{
            textAlign: "center",
            fontSize: 9,
            color: C.textDim,
            marginTop: 4,
            fontFamily: "'Switzer', sans-serif",
            fontWeight: 500,
          }}
        >
          {data.polyW > 0 && data.polyD > 0
            ? `${data.polyW}' × ${data.polyD}' footprint`
            : project.buildingFootprintSF
              ? `${parseFloat(project.buildingFootprintSF).toLocaleString()} SF footprint`
              : null}
        </div>
      )}
    </div>
  );
}
