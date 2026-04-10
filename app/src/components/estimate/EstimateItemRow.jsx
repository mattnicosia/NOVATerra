import { memo } from "react";
import { UNITS } from "@/constants/units";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, moneyCell } from "@/utils/styles";
import { nn, fmt, formatCurrency } from "@/utils/format";
import { hasAllowance } from "@/utils/allowances";

// ── Memoized item row — prevents re-rendering all 200+ rows on each keystroke ──
const EstimateItemRow = memo(
  function EstimateItemRow({
    item,
    _rowIdx,
    globalIndex,
    lineTotal,
    animKey,
    isSelected,
    isDragging,
    isOddRow,
    isPricing,
    focusedField,
    C,
    T,
    updateItem,
    onDragStart,
    onDragEnd,
    onRowClick,
    onFocusCostCell,
    onBlurCostCell,
    subFromCode,
    onCodeClick,
    onDelete,
    hasSubItems,
  }) {
    const isZeroTotal = lineTotal === 0 || lineTotal === null || lineTotal === undefined;

    return (
      <div
        className="est-row"
        data-item-id={item.id}
        onClick={() => onRowClick(item.id)}
        onMouseEnter={e => {
          if (!isDragging && !isSelected) {
            if (C.estRowHoverShadow) {
              e.currentTarget.style.boxShadow = C.estRowHoverShadow;
              e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            } else {
              e.currentTarget.style.background = `${C.accent}08`;
            }
          }
        }}
        onMouseLeave={e => {
          if (!isSelected) {
            e.currentTarget.style.boxShadow = "none";
            const oddBg = C.estRowOddBg || (C.isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)");
            e.currentTarget.style.background = isOddRow ? oddBg : "transparent";
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "7px 8px 7px 10px",
          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
          background: isSelected
            ? C.estRowSelectedBg || `${C.accent}12`
            : isOddRow
              ? C.estRowOddBg || (C.isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)")
              : "transparent",
          borderLeft: isSelected
            ? `3px solid ${C.accent}`
            : `3px solid ${isZeroTotal ? "transparent" : C.accent + "20"}`,
          boxShadow: isSelected ? C.estRowSelectedShadow || "none" : "none",
          opacity: isDragging ? 0.4 : 1,
          transition: "background 150ms ease-out, box-shadow 200ms ease-out",
          cursor: "pointer",
        }}
      >
        {/* Drag handle + index */}
        <div
          className="est-col"
          draggable
          onDragStart={e => {
            e.stopPropagation();
            onDragStart(item.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", item.id);
          }}
          onDragEnd={onDragEnd}
          onClick={e => e.stopPropagation()}
          style={{
            width: 32,
            fontSize: T.fontSize.sm,
            color: C.textDim,
            fontFeatureSettings: "'tnum'",
            cursor: "grab",
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
          title="Drag to reorder"
        >
          <Ic d={I.move} size={9} color={C.textDim} />
          <span>{globalIndex}</span>
        </div>
        {/* Code — clickable to reassign division */}
        <div
          className="est-col"
          onClick={e => {
            e.stopPropagation();
            if (onCodeClick) onCodeClick(item.id);
          }}
          style={{
            width: 82,
            fontSize: T.fontSize.sm,
            fontWeight: T.fontWeight.semibold,
            color: item.code ? C.text : C.textDim,
            fontFeatureSettings: "'tnum'",
            cursor: "pointer",
          }}
          title={item.code ? `${subFromCode(item.code)} — click to change` : "Click to assign code"}
        >
          {item.code || (
            <span style={{ fontSize: 9, opacity: 0.5 }}>+ code</span>
          )}
          {item.code && (
            <div
              style={{
                fontSize: 8,
                fontWeight: 400,
                color: C.textDim,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 82,
              }}
            >
              {subFromCode(item.code)}
            </div>
          )}
        </div>
        {/* Description */}
        <div className="est-col" style={{ flex: 1, minWidth: 160 }}>
          <input
            value={item.description}
            onChange={e => {
              e.stopPropagation();
              updateItem(item.id, "description", e.target.value);
            }}
            onClick={e => e.stopPropagation()}
            placeholder="Description..."
            style={inp(C, {
              background: "transparent",
              border: "1px solid transparent",
              padding: "3px 4px",
              fontSize: T.fontSize.sm,
            })}
          />
          {hasAllowance(item) && (
            <span
              style={{
                fontSize: 9,
                color: C.orange,
                fontWeight: T.fontWeight.bold,
                marginLeft: 4,
              }}
            >
              ALLOW
            </span>
          )}
        </div>
        {/* Qty */}
        <div className="est-col" style={{ width: 60 }}>
          <input
            type="number"
            value={item.quantity}
            onChange={e => {
              e.stopPropagation();
              updateItem(item.id, "quantity", e.target.value);
            }}
            onClick={e => e.stopPropagation()}
            placeholder="0"
            style={nInp(C, {
              background: "transparent",
              border: "1px solid transparent",
              padding: "3px 2px",
              fontSize: T.fontSize.sm,
            })}
          />
        </div>
        {/* Unit */}
        <div className="est-col" style={{ width: 42 }}>
          <select
            value={item.unit}
            onChange={e => {
              e.stopPropagation();
              updateItem(item.id, "unit", e.target.value);
            }}
            onClick={e => e.stopPropagation()}
            style={inp(C, {
              background: "transparent",
              border: "1px solid transparent",
              padding: "3px 0",
              fontSize: T.fontSize.sm,
            })}
          >
            {UNITS.map(u => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        {/* Pricing columns */}
        {isPricing &&
          ["material", "labor", "equipment", "subcontractor"].map(f => {
            const isFocused = focusedField === f;
            const rawVal = item[f];
            const displayVal = isFocused ? rawVal : nn(rawVal) ? formatCurrency(rawVal) : rawVal;
            return (
              <div className="est-col" key={f} style={{ width: 72, textAlign: "right" }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={displayVal}
                  onFocus={() => onFocusCostCell(`${item.id}-${f}`)}
                  onBlur={onBlurCostCell}
                  onChange={e => updateItem(item.id, f, e.target.value.replace(/[$,]/g, ""))}
                  onClick={e => e.stopPropagation()}
                  placeholder="0.00"
                  style={nInp(C, {
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "3px 2px",
                    fontSize: T.fontSize.sm,
                    textAlign: "right",
                  })}
                />
              </div>
            );
          })}
        {/* Total */}
        <div
          key={`${item.id}-t-${animKey}`}
          className="est-col"
          style={moneyCell(C, lineTotal, {
            width: 90,
            paddingTop: 2,
            fontSize: T.fontSize.base,
            animation: animKey > 0 ? "lineFlash 400ms ease-out" : "none",
          })}
        >
          {fmt(lineTotal)}
        </div>
        {/* Sub-items indicator */}
        {hasSubItems && (
          <div
            title="Click row to see what's included"
            style={{
              fontSize: 9,
              color: isSelected ? C.accent : C.textDim,
              whiteSpace: "nowrap",
              padding: "0 4px",
              opacity: isSelected ? 1 : 0.6,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Ic d={I.layers} size={9} color={isSelected ? C.accent : C.textDim} />
          </div>
        )}
        {/* Delete button — visible when selected */}
        {isSelected && onDelete && (
          <div
            onClick={e => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            title="Remove item"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              borderRadius: 4,
              color: C.red || "#e05252",
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.red || "#e05252"}18`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Ic d={I.trash} size={12} color={C.red || "#e05252"} />
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.lineTotal === next.lineTotal &&
    prev.animKey === next.animKey &&
    prev.isSelected === next.isSelected &&
    prev.isDragging === next.isDragging &&
    prev.focusedField === next.focusedField &&
    prev.isPricing === next.isPricing &&
    prev.globalIndex === next.globalIndex &&
    prev.hasSubItems === next.hasSubItems &&
    prev.C === next.C,
);

export default EstimateItemRow;
