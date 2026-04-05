// ModuleInstanceBlock — renders a single multi-instance block (header + specs + results)
// Extracted from ModulePanel.jsx
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { getDrivingQty } from "@/utils/moduleCalc";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { InstanceSpecsForm } from "@/components/takeoffs/ModuleSpecsForm";
import ModuleResultRow from "@/components/takeoffs/ModuleResultRow";

// Material color map
const MATERIAL_COLORS = {
  Wood: "#B45309", "Wood Framing": "#B45309", "Wood Trusses": "#CA8A04", "Wood Rafters": "#B45309",
  "Metal Stud": "#6366F1", "Steel Deck": "#6366F1", "Steel Joist/Deck": "#6366F1",
  CMU: "#DC2626", Concrete: "#6B7280", "Concrete on Deck": "#6B7280", "Precast/Concrete": "#6B7280",
  ICF: "#0891B2", "Tilt-Up": "#0EA5E9", Precast: "#8B5CF6", "Precast Plank": "#8B5CF6",
  SIP: "#D97706", "SIP Panels": "#D97706", "3D Printed": "#22C55E", CLT: "#78350F",
  "Asphalt Shingles": "#DC2626", "Standing Seam Metal": "#6366F1", TPO: "#0891B2",
  EPDM: "#1E293B", "Built-Up": "#6B7280", "Modified Bitumen": "#78350F",
  "Clay Tile": "#DC2626", "Concrete Tile": "#6B7280", Slate: "#475569",
  'K-Style 5" Aluminum': "#6B7280", 'K-Style 6" Aluminum': "#6B7280",
  'Half-Round 6" Copper': "#B45309", "Commercial Scupper": "#475569",
  "W-Shapes (Beams/Columns)": "#6366F1", "HSS Tubes": "#8B5CF6",
  "Channels/Angles": "#0EA5E9", "Built-Up Plate Girders": "#475569",
  "K-Series": "#6366F1", "LH-Series": "#8B5CF6", "DLH-Series": "#0EA5E9",
  '1.5" B 22ga': "#6366F1", '1.5" B 20ga': "#6366F1", '2" W 20ga': "#8B5CF6",
  '3" N 20ga': "#0EA5E9", '3" N 18ga': "#0891B2",
  Lintels: "#6B7280", "Embed Plates": "#475569", Stairs: "#DC2626",
  Railings: "#D97706", Grating: "#6366F1",
};

function computeAutoLabel(cat, catInst) {
  if (catInst.label && catInst.label.trim()) return catInst.label;
  const dimKeys = ["Width", "Depth", "Length", "Height", "Diameter", "Size", "StudSize"];
  const dims = [];
  const specs = cat.specs || [];
  for (const s of specs) {
    if (dimKeys.some(k => s.id.endsWith(k) || s.id === k)) {
      const val = catInst.specs?.[s.id] ?? s.default;
      if (val != null && val !== "") dims.push(String(val));
    }
  }
  const matVal = catInst.specs?.Material;
  if (dims.length > 0) {
    const dimStr = dims.join("\u00d7");
    return matVal ? `${dimStr} ${matVal}` : dimStr;
  }
  if (matVal) return matVal;
  return cat.name;
}

export default function ModuleInstanceBlock({
  cat,
  catInst,
  catInstances,
  activeModule,
  inst,
  derived,
  takeoffs,
  scaleCtx,
  collapsedInstances,
  toggleInstanceCollapse,
  selectedDrawingId,
  handleInstanceDrivingClick,
  handleInstanceSpecChange,
  toggleExclude,
  updateTakeoff,
  removeTakeoff,
  removeCategoryInstance,
  renameCategoryInstance,
}) {
  const C = useTheme();
  const T = C.T;
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);

  const drivingItem = cat.items.find(i => i.id === cat.drivingItemId);
  const drivingToId = drivingItem ? catInst.itemTakeoffIds?.[drivingItem.id] : null;
  const drivingQty = drivingItem
    ? getDrivingQty(drivingItem.id, catInst.itemTakeoffIds || {}, takeoffs, scaleCtx)
    : 0;
  const isMeasuring = drivingToId && tkActiveTakeoffId === drivingToId;
  const derivedItems = cat.items.filter(i => i.type !== "driving");
  const isCollapsed = collapsedInstances.has(catInst.id);
  const displayLabel = computeAutoLabel(cat, catInst);

  const materialSpec = cat.specs?.find(s => s.id === "Material");
  const materialVal = catInst.specs?.Material || materialSpec?.default || "";
  const matColor = MATERIAL_COLORS[materialVal] || C.accent;

  return (
    <div
      style={{ borderLeft: `3px solid ${isMeasuring ? C.accent : matColor}90`, marginLeft: 6, marginBottom: 4 }}
    >
      {/* Instance header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 8px",
          background: isMeasuring ? `${C.accent}08` : `${matColor}08`,
          cursor: "pointer",
        }}
        onClick={() => toggleInstanceCollapse(catInst.id)}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: matColor, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 8,
            color: C.textDim,
            transition: "transform 0.15s",
            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          &#9660;
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}>
          <input
            value={catInst.label}
            placeholder={displayLabel}
            onChange={e => renameCategoryInstance(activeModule, cat.id, catInst.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            title="Click to name this type"
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: 140,
              fontSize: 11,
              fontWeight: 700,
              color: catInst.label ? matColor : C.textDim,
              background: "transparent",
              border: `1px dashed ${catInst.label ? "transparent" : `${C.border}`}`,
              borderRadius: 3,
              outline: "none",
              padding: "1px 4px",
            }}
          />
          {!catInst.label && <Ic d={I.edit} size={8} color={C.textDim} />}
        </div>
        {drivingItem && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.textMuted,
              background: `${C.text}10`,
              padding: "1px 4px",
              borderRadius: 2,
            }}
          >
            {drivingItem.unit}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {drivingQty > 0 && (
          <span style={{ fontSize: 11, fontFamily: T.font.sans, fontWeight: 600, color: C.text }}>
            {drivingQty >= 1000 ? Math.round(drivingQty).toLocaleString() : Math.round(drivingQty * 100) / 100}
          </span>
        )}
        {drivingItem && (
          <button
            onClick={e => {
              e.stopPropagation();
              handleInstanceDrivingClick(drivingItem, cat, catInst);
            }}
            disabled={!selectedDrawingId}
            style={{
              border: "none",
              borderRadius: 3,
              cursor: selectedDrawingId ? "pointer" : "not-allowed",
              padding: "2px 6px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 0.3,
              background: isMeasuring ? C.accent : drivingQty > 0 ? `${C.green}20` : `${C.accent}15`,
              color: isMeasuring ? "#fff" : drivingQty > 0 ? C.green : C.accent,
              opacity: selectedDrawingId ? 1 : 0.4,
            }}
          >
            {isMeasuring ? "MEASURING" : drivingQty > 0 ? "RE-MEASURE" : "MEASURE"}
          </button>
        )}
        {drivingToId && drivingQty > 0 && !isMeasuring && (
          <button
            onClick={e => {
              e.stopPropagation();
              removeTakeoff(drivingToId);
            }}
            title="Delete measurement"
            style={{
              width: 22,
              height: 22,
              border: "none",
              background: "transparent",
              color: C.red,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: 0.6,
            }}
          >
            <Ic d={I.xCircle} size={12} />
          </button>
        )}
        {catInstances.length > 1 && (
          <button
            onClick={e => {
              e.stopPropagation();
              cat.items.forEach(item => {
                const toId = catInst.itemTakeoffIds?.[item.id];
                if (toId) removeTakeoff(toId);
              });
              removeCategoryInstance(activeModule, cat.id, catInst.id);
            }}
            title="Remove type"
            style={{
              width: 22,
              height: 22,
              border: "none",
              background: "transparent",
              color: C.red,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: 0.6,
            }}
          >
            <Ic d={I.xCircle} size={12} />
          </button>
        )}
      </div>

      {/* Collapsible body */}
      {!isCollapsed && (
        <>
          <InstanceSpecsForm
            specs={cat.specs}
            catId={cat.id}
            catInst={catInst}
            templates={cat.templates}
            onSpecChange={handleInstanceSpecChange}
          />

          {/* Stud length warning */}
          {(() => {
            const material = catInst.specs?.Material ?? cat.specs?.find(s => s.id === "Material")?.default ?? "";
            const studSize = catInst.specs?.StudSize ?? cat.specs?.find(s => s.id === "StudSize")?.default ?? "";
            const wallHt = parseFloat(
              catInst.specs?.WallHeight ?? cat.specs?.find(s => s.id === "WallHeight")?.default ?? 0,
            );
            const isStdLumber = studSize.startsWith("2x");
            if (material !== "Wood" || !isStdLumber || wallHt <= 20) return null;
            const depthMap = {
              "2x4": [{ id: "LVL 1-3/4x5-1/2", note: "min LVL (deeper wall)" }],
              "2x6": [{ id: "LVL 1-3/4x5-1/2" }, { id: "PSL 3-1/2x5-1/2" }],
              "2x8": [{ id: "LVL 1-3/4x7-1/4" }, { id: "PSL 3-1/2x7-1/4" }],
              "2x10": [{ id: "LVL 1-3/4x9-1/4" }, { id: "LVL 1-3/4x9-1/2" }],
              "2x12": [{ id: "LVL 1-3/4x11-7/8" }],
            };
            const suggestions = depthMap[studSize] || [{ id: "LVL 1-3/4x5-1/2" }];
            return (
              <div
                style={{
                  margin: "2px 8px 4px",
                  padding: "6px 8px",
                  background: `${C.orange || "#f59e0b"}12`,
                  border: `1px solid ${C.orange || "#f59e0b"}40`,
                  borderRadius: 5,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.orange || "#f59e0b",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>&#9888;</span> {studSize} studs not available over 20'
                </div>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 4 }}>
                  LVL/PSL can be ordered to exact {wallHt}' length -- zero waste:
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {suggestions.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => handleInstanceSpecChange(cat.id, catInst.id, "StudSize", s.id)}
                      style={{
                        padding: "2px 6px",
                        fontSize: 9,
                        fontWeight: 600,
                        border: `1px solid ${C.accent}50`,
                        background: i === 0 ? `${C.accent}15` : "transparent",
                        color: C.accent,
                        borderRadius: 3,
                        cursor: "pointer",
                      }}
                    >
                      {s.id}
                      {i === 0 ? " \u2605" : ""}
                      {s.note ? ` (${s.note})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Derived result rows */}
          {derivedItems.length > 0 && (
            <div style={{ padding: "2px 0 4px" }}>
              {derivedItems.map(item => (
                <ModuleResultRow
                  key={`${catInst.id}:${item.id}`}
                  item={item}
                  cat={cat}
                  catInst={catInst}
                  derived={derived}
                  inst={inst}
                  takeoffs={takeoffs}
                  handleManualQty={() => {}}
                  toggleExclude={toggleExclude}
                  updateTakeoff={updateTakeoff}
                  removeTakeoff={removeTakeoff}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
