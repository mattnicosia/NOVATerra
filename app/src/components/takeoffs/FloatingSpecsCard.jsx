import { useTheme } from "@/hooks/useTheme";
import { useModuleStore } from "@/stores/moduleStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { MODULES } from "@/constants/modules";
import { evalCondition } from "@/utils/moduleCalc";

export default function FloatingSpecsCard({ detectedReferences, setDetailOverlay }) {
  const C = useTheme();
  const T = C.T;

  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const tkActiveTakeoffId = useDrawingPipelineStore(s => s.tkActiveTakeoffId);
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const activeModule = useModuleStore(s => s.activeModule);
  const moduleInstances = useModuleStore(s => s.moduleInstances);
  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const sheetIndex = useDrawingPipelineStore(s => s.sheetIndex);

  let cat = null;
  let ci = null;
  let accentColor = C.accent;

  if (tkMeasureState === "measuring" && tkActiveTakeoffId) {
    const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to?.linkedItemId) return null;
    accentColor = to.color || C.accent;
    for (const modId of Object.keys(moduleInstances)) {
      const inst = moduleInstances[modId];
      const mod = MODULES[modId];
      if (!mod || !inst) continue;
      for (const c of mod.categories) {
        if (!c.multiInstance) continue;
        const catInstances = inst.categoryInstances?.[c.id] || [];
        for (const cInst of catInstances) {
          const linked = cInst.itemTakeoffIds || {};
          if (Object.values(linked).includes(to.id)) {
            cat = c;
            ci = cInst;
            break;
          }
        }
        if (ci) break;
      }
      if (ci) break;
    }
  } else if (activeModule && tkMeasureState === "paused") {
    // Only show when measuring is paused (between segments) — not when idle
    const mod = MODULES[activeModule];
    const inst = moduleInstances[activeModule];
    if (mod && inst) {
      for (const c of mod.categories) {
        if (!c.multiInstance) continue;
        const catInstances = inst.categoryInstances?.[c.id] || [];
        if (catInstances.length > 0) {
          cat = c;
          ci = catInstances[0];
          break;
        }
      }
    }
  }

  if (!cat || !ci) return null;

  const material = ci.specs?.Material || cat.specs?.find(s => s.id === "Material")?.default || "";
  const keySpecs = cat.specs
    .filter(
      s =>
        s.id !== "Material" &&
        (!s.condition ||
          (() => {
            const ctx = { ...ci.specs };
            cat.specs.forEach(ss => {
              if (ctx[ss.id] === undefined) ctx[ss.id] = ss.default;
            });
            return evalCondition(s.condition, ctx);
          })()),
    )
    .slice(0, 4)
    .map(s => ({ label: s.label, value: ci.specs?.[s.id] || s.default, unit: s.unit }));

  const refs = selectedDrawingId ? detectedReferences[selectedDrawingId] || [] : [];
  const typeColors = { section: "#10B981", elevation: "#6366F1", detail: "#F59E0B" };

  return (
    <div
      style={{
        position: "absolute",
        top: 10,
        left: 10,
        zIndex: 30,
        width: 210,
        background: `${C.bg1}E8`,
        backdropFilter: "blur(8px)",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        padding: "8px 10px",
        pointerEvents: "auto",
        transition: "opacity 0.2s",
        fontSize: 9,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }}
        />
        <span
          style={{
            fontWeight: 700,
            color: C.text,
            fontSize: 10,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ci.label || cat.name}
        </span>
        {material && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: "#fff",
              background: accentColor,
              padding: "1px 5px",
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            {material}
          </span>
        )}
      </div>

      {/* Key specs */}
      {keySpecs.map((s, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "2px 0",
            borderTop: i === 0 ? `1px solid ${C.border}40` : "none",
          }}
        >
          <span style={{ color: C.textDim, fontSize: 8 }}>{s.label}</span>
          <span style={{ fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
            {s.value}
            {s.unit ? ` ${s.unit}` : ""}
          </span>
        </div>
      ))}

      {/* Drawing references */}
      {refs.length > 0 && (
        <div style={{ marginTop: 6, borderTop: `1px solid ${C.border}40`, paddingTop: 5 }}>
          <div
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: C.textDim,
              marginBottom: 4,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            References
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 90, overflowY: "auto" }}
          >
            {refs.slice(0, 5).map((ref, ri) => {
              const targetDId =
                sheetIndex[ref.targetSheet] || sheetIndex[ref.targetSheet?.replace(/[-\s]/g, "")];
              const targetDrawing = targetDId ? drawings.find(d => d.id === targetDId) : null;
              const thumbSrc = targetDrawing
                ? targetDrawing.type === "pdf"
                  ? pdfCanvases[targetDrawing.id]
                  : targetDrawing.data
                : null;
              const badgeColor = typeColors[ref.type] || C.accent;
              return (
                <div
                  key={ri}
                  onClick={e => {
                    e.stopPropagation();
                    if (targetDId) {
                      setDetailOverlay({ drawingId: targetDId });
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    cursor: targetDId ? "pointer" : "default",
                    padding: "2px 4px",
                    borderRadius: 4,
                    background: `${badgeColor}10`,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: badgeColor,
                      flexShrink: 0,
                    }}
                  />
                  {thumbSrc && (
                    <img
                      src={thumbSrc}
                      alt=""
                      style={{
                        width: 24,
                        height: 18,
                        objectFit: "cover",
                        borderRadius: 2,
                        border: `1px solid ${C.border}`,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 8,
                        fontWeight: 600,
                        color: C.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ref.label}
                    </div>
                    <div style={{ fontSize: 7, color: C.textDim }}>
                      {ref.type} → {ref.targetSheet || "?"}
                    </div>
                  </div>
                </div>
              );
            })}
            {refs.length > 5 && (
              <div style={{ fontSize: 7, color: C.textDim, textAlign: "center" }}>
                +{refs.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
