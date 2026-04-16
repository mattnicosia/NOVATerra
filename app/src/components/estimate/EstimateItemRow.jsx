import { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { UNITS } from "@/constants/units";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, moneyCell } from "@/utils/styles";
import { nn, fmt, formatCurrency } from "@/utils/format";
import { hasAllowance, hasExclusion, isFullyExcluded, resolveColumnStatus } from "@/utils/allowances";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import { useGroupsStore } from "@/stores/groupsStore";

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
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const [section, setSection] = useState(null);
    const menuRef = useRef(null);
    const itemStatus = item.status || "firm";
    const fullyExcluded = isFullyExcluded(item);
    const anyAllowance = hasAllowance(item);
    const anyExclusion = hasExclusion(item);
    const isInAlt = (item.bidContext || "base") !== "base";
    const isExcludedOrAllow = itemStatus === "excluded" || itemStatus === "allowance";
    const hasAnyColAllow = ["material","labor","equipment","subcontractor"].some(c => resolveColumnStatus(item, c) === "allowance");
    const hasAnyColExcl = ["material","labor","equipment","subcontractor"].some(c => resolveColumnStatus(item, c) === "excluded");

    useEffect(() => {
      if (!menuOpen) return;
      const handler = e => {
        if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest("[data-est-action-toggle]")) {
          setMenuOpen(false); setSection(null);
        }
      };
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }, [menuOpen]);

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
          opacity: isDragging ? 0.4 : fullyExcluded ? 0.5 : 1,
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
          {fullyExcluded && (
            <span style={{ fontSize: 9, color: C.red || "#e05252", fontWeight: T.fontWeight.bold, marginLeft: 4 }}>EXCL</span>
          )}
          {!fullyExcluded && anyAllowance && (
            <span style={{ fontSize: 9, color: C.orange, fontWeight: T.fontWeight.bold, marginLeft: 4 }}>ALLOW</span>
          )}
          {!fullyExcluded && anyExclusion && !anyAllowance && (
            <span style={{ fontSize: 9, color: C.red || "#e05252", fontWeight: T.fontWeight.bold, marginLeft: 4, opacity: 0.7 }}>PARTIAL</span>
          )}
          {item.source?.category === "nova-scope" && (
            <span
              title={`From NOVA scope review (${Math.round((item.source.confidence || 0) * 100)}% confidence)`}
              style={{
                fontSize: 8,
                color: C.accent,
                fontWeight: T.fontWeight.bold,
                marginLeft: 4,
                padding: "1px 4px",
                borderRadius: 3,
                background: `${C.accent}12`,
              }}
            >
              NOVA
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
        {/* Action chevron pill — A/E/Alt menu */}
        {(() => {
          const COLS = [
            { key: "material", label: "Matl" },
            { key: "labor", label: "Labor" },
            { key: "equipment", label: "Equip" },
            { key: "subcontractor", label: "Sub" },
          ];
          const colBadge = (letter, color, active) => ({
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            height: 22, padding: "0 6px", borderRadius: 4, fontSize: 8, fontWeight: 800,
            letterSpacing: 0.3, cursor: "pointer", transition: "all 0.12s",
            background: active ? `${color}25` : "transparent",
            color: active ? color : C.textDim,
            border: active ? `1.5px solid ${color}` : `1px solid ${C.border}`,
          });
          const switchToNotes = (notesTab) => {
            useUiStore.getState().setNotesTabHint(notesTab);
            useUiStore.getState().setRequestLeftPanelTab("notes");
          };
          const handleColToggle = (col, targetStatus) => {
            const current = resolveColumnStatus(item, col);
            const next = current === targetStatus ? "firm" : targetStatus;
            useItemsStore.getState().setColumnStatus(item.id, col, next);
            if (next !== "firm") switchToNotes(targetStatus === "allowance" ? "allowances" : "exclusions");
          };
          const handleAllToggle = (targetStatus) => {
            const next = itemStatus === targetStatus ? "firm" : targetStatus;
            useItemsStore.getState().setItemStatus(item.id, next);
            if (next !== "firm") switchToNotes(targetStatus === "allowance" ? "allowances" : "exclusions");
          };
          const handleAlternate = () => {
            const name = item.description || "Untitled";
            const newGroupId = useGroupsStore.getState().addGroup(`Alt: ${name}`, "deduct", null);
            useItemsStore.getState().updateItem(item.id, "bidContext", newGroupId);
            useUiStore.getState().showToast(`Moved to Alternate: ${name}`);
            useUiStore.getState().setRequestLeftPanelTab("scenarios");
            setMenuOpen(false); setSection(null);
          };
          const handleReintroduce = () => {
            if (isInAlt) {
              const prevContext = item.bidContext;
              useItemsStore.getState().updateItem(item.id, "bidContext", "base");
              const remaining = useItemsStore.getState().items.filter(i => (i.bidContext || "base") === prevContext);
              if (remaining.length === 0) useGroupsStore.getState().removeGroup(prevContext);
              useUiStore.getState().showToast("Returned to Base Bid");
            } else {
              useItemsStore.getState().setItemStatus(item.id, "firm");
            }
            setMenuOpen(false); setSection(null);
          };
          const red = C.red || "#e05252";
          return (
            <>
              <button
                data-est-action-toggle="true"
                onClick={e => {
                  e.stopPropagation();
                  if (menuOpen) { setMenuOpen(false); setSection(null); } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                    if (itemStatus === "allowance" || hasAnyColAllow) setSection("allowance");
                    else if (itemStatus === "excluded" || hasAnyColExcl) setSection("exclusion");
                    else setSection(null);
                    setMenuOpen(true);
                  }
                }}
                title="Status & actions"
                style={{
                  width: 24, height: 22, flexShrink: 0,
                  border: menuOpen ? `1px solid ${C.accent}50` : `1px solid ${C.accent}20`,
                  background: menuOpen ? `${C.accent}20` : `${C.accent}08`, borderRadius: 5,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.accent + "18"; }}
                onMouseLeave={e => { e.currentTarget.style.background = menuOpen ? C.accent + "20" : C.accent + "08"; }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke={menuOpen ? C.accent : C.accent + "80"} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {menuOpen && createPortal(
                <div ref={menuRef} style={{ position: "fixed", top: menuPos?.top || 0, right: menuPos?.right || 0, zIndex: 100010, minWidth: 220, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: T.shadow.lg, padding: "6px 0" }} onClick={e => e.stopPropagation()}>
                  {/* ── Allowance ── */}
                  {(() => {
                    const isActive = itemStatus === "allowance" || hasAnyColAllow;
                    const isOpen = section === "allowance";
                    return (<>
                      <div onClick={() => setSection(isOpen ? null : "allowance")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400, fontSize: 12, transition: "background 80ms" }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${C.orange}08`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ ...colBadge("A", C.orange, isActive), width: 20, height: 18, padding: 0 }}>A</span>
                        <span>Allowance</span>
                        {isActive && <span style={{ marginLeft: "auto", fontSize: 8, color: C.orange }}>●</span>}
                        <svg width="8" height="8" viewBox="0 0 10 10" style={{ marginLeft: isActive ? 4 : "auto", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M2 3.5L5 6.5L8 3.5" stroke={C.textDim} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                      {isOpen && (
                        <div style={{ display: "flex", gap: 4, padding: "2px 12px 8px 38px", flexWrap: "wrap" }}>
                          <span onClick={() => handleAllToggle("allowance")} style={colBadge("A", C.orange, itemStatus === "allowance")}>All</span>
                          {COLS.map(c => <span key={c.key} onClick={() => handleColToggle(c.key, "allowance")} style={colBadge("A", C.orange, resolveColumnStatus(item, c.key) === "allowance")}>{c.label}</span>)}
                        </div>
                      )}
                    </>);
                  })()}
                  {/* ── Exclusion ── */}
                  {(() => {
                    const isActive = itemStatus === "excluded" || hasAnyColExcl;
                    const isOpen = section === "exclusion";
                    return (<>
                      <div onClick={() => setSection(isOpen ? null : "exclusion")}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: isActive ? red : C.text, fontWeight: isActive ? 600 : 400, fontSize: 12, transition: "background 80ms" }}
                        onMouseEnter={e => (e.currentTarget.style.background = `${red}08`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{ ...colBadge("E", red, isActive), width: 20, height: 18, padding: 0 }}>E</span>
                        <span>Exclusion</span>
                        {isActive && <span style={{ marginLeft: "auto", fontSize: 8, color: red }}>●</span>}
                        <svg width="8" height="8" viewBox="0 0 10 10" style={{ marginLeft: isActive ? 4 : "auto", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><path d="M2 3.5L5 6.5L8 3.5" stroke={C.textDim} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                      {isOpen && (
                        <div style={{ display: "flex", gap: 4, padding: "2px 12px 8px 38px", flexWrap: "wrap" }}>
                          <span onClick={() => handleAllToggle("excluded")} style={colBadge("E", red, itemStatus === "excluded")}>All</span>
                          {COLS.map(c => <span key={c.key} onClick={() => handleColToggle(c.key, "excluded")} style={colBadge("E", red, resolveColumnStatus(item, c.key) === "excluded")}>{c.label}</span>)}
                        </div>
                      )}
                    </>);
                  })()}
                  {/* ── Alternate ── */}
                  {!isInAlt && (<>
                    <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                    <div onClick={handleAlternate}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: C.accent, fontSize: 12, transition: "background 80ms" }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}08`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ ...colBadge("Alt", C.accent, false), padding: "0 4px" }}>Alt</span>
                      <span>Move to Alternate</span>
                    </div>
                  </>)}
                  {/* ── Reintroduce ── */}
                  {(isExcludedOrAllow || isInAlt) && (<>
                    <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                    <div onClick={handleReintroduce}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", cursor: "pointer", color: C.green, fontSize: 11, transition: "background 80ms" }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.green}10`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      <span>{isInAlt ? "Return to Base Bid" : "Reintroduce to Bid"}</span>
                    </div>
                  </>)}
                  {/* ── Delete ── */}
                  {onDelete && (<>
                    <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                    <div onClick={e => { e.stopPropagation(); onDelete(item.id); setMenuOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", cursor: "pointer", color: red, fontSize: 11, transition: "background 80ms" }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${red}10`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <Ic d={I.trash} size={10} color={red} />
                      <span>Delete</span>
                    </div>
                  </>)}
                  {/* ── Done ── */}
                  <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                  <div onClick={() => { setMenuOpen(false); setSection(null); }}
                    style={{ textAlign: "center", padding: "5px 12px", cursor: "pointer", color: C.textDim, fontSize: 10, transition: "background 80ms" }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >Done</div>
                </div>,
                document.body,
              )}
            </>
          );
        })()}
        {/* Delete button — visible when selected (kept as quick-access) */}
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
    prev.C === next.C &&
    prev.item?.status === next.item?.status &&
    prev.item?.columnStatus === next.item?.columnStatus,
);

export default EstimateItemRow;
