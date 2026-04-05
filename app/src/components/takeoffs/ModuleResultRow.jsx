// ModuleResultRow — renders a single derived or manual item row in ModulePanel
// Extracted from ModulePanel.jsx
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function ModuleResultRow({
  item,
  cat,
  catInst,
  derived,
  inst,
  takeoffs,
  handleManualQty,
  toggleExclude,
  updateTakeoff,
  removeTakeoff,
}) {
  const C = useTheme();
  const T = C.T;

  const statusMap = catInst ? catInst.itemStatus : inst.itemStatus;
  const takeoffIdsMap = catInst ? catInst.itemTakeoffIds : inst.itemTakeoffIds;
  const derivedKey = catInst ? `${catInst.id}:${item.id}` : item.id;

  const status = statusMap?.[item.id];
  const isExcluded = status === "excluded";
  const toId = takeoffIdsMap?.[item.id];
  const isDerived = item.type === "derived";
  const isManual = item.type === "manual";
  const conditionMet = isDerived ? derived[derivedKey]?.active !== false : true;

  let qty = 0;
  if (isDerived) qty = derived[derivedKey]?.qty || 0;
  else if (isManual) qty = toId ? (takeoffs.find(t => t.id === toId)?.quantity || 0) : 0;
  const hasQty = qty > 0;

  if (isDerived && !conditionMet && !hasQty && !isExcluded) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px 3px 20px",
        opacity: isExcluded ? 0.4 : conditionMet ? 1 : 0.5,
        borderBottom: `1px solid ${C.border}08`,
      }}
    >
      <span
        style={{ fontSize: 9, color: hasQty ? C.green : C.textDimmer, flexShrink: 0, width: 10, textAlign: "center" }}
      >
        {isExcluded ? "\u2014" : hasQty ? "\u2713" : "\u2192"}
      </span>
      {/* Color dot */}
      {toId && hasQty && !isExcluded ? (
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            flexShrink: 0,
            cursor: "pointer",
            position: "relative",
            background: takeoffs.find(t => t.id === toId)?.color || C.accent,
          }}
          onClick={e => {
            e.stopPropagation();
            e.currentTarget.querySelector("input")?.click();
          }}
        >
          <input
            type="color"
            value={takeoffs.find(t => t.id === toId)?.color || "#2563eb"}
            onChange={e => {
              e.stopPropagation();
              updateTakeoff(toId, "color", e.target.value);
            }}
            onClick={e => e.stopPropagation()}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }}
          />
        </div>
      ) : (
        <div style={{ width: 10, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: isExcluded ? C.textDim : hasQty ? C.text : C.textDim,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </div>
      </div>
      {isManual && !isExcluded ? (
        <input
          type="number"
          value={qty || ""}
          onChange={e => handleManualQty(item, cat, e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="0"
          style={{
            width: 45,
            textAlign: "right",
            fontSize: 11,
            fontFamily: T.font.sans,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            padding: "2px 4px",
            color: C.text,
            outline: "none",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: 11,
            fontFamily: T.font.sans,
            color: hasQty ? C.text : C.textDimmer,
            fontFeatureSettings: "'tnum'",
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {hasQty ? (qty >= 1000 ? Math.round(qty).toLocaleString() : Math.round(qty * 100) / 100) : "\u2014"}
        </span>
      )}
      <span style={{ fontSize: 9, color: C.textMuted, width: 28, textAlign: "left", flexShrink: 0 }}>
        {item.unit}
      </span>
      {/* Delete linked takeoff */}
      {toId && hasQty && !isExcluded && (
        <button
          onClick={e => {
            e.stopPropagation();
            removeTakeoff(toId);
          }}
          title="Delete takeoff"
          style={{
            width: 20,
            height: 20,
            border: "none",
            background: "transparent",
            color: C.red,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            borderRadius: 3,
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          <Ic d={I.xCircle} size={11} />
        </button>
      )}
      <button
        onClick={e => {
          e.stopPropagation();
          toggleExclude(item, catInst);
        }}
        title={isExcluded ? "Restore" : "Exclude"}
        style={{
          width: 14,
          height: 14,
          border: "none",
          background: "transparent",
          color: C.textDimmer,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          borderRadius: 3,
          flexShrink: 0,
          opacity: 0.5,
        }}
      >
        <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          {isExcluded ? (
            <>
              <path d="M1 5h8" />
              <path d="M5 1v8" />
            </>
          ) : (
            <path d="M2 2l6 6M8 2l-6 6" />
          )}
        </svg>
      </button>
    </div>
  );
}
