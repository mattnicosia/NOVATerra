import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useUiStore } from "@/stores/uiStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { UNITS, BASE_UNITS, CONVERSIONS } from "@/constants/units";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, fmt, fmt2, formatCurrency } from "@/utils/format";
import { evalFormula } from "@/utils/formula";
import { callAnthropic } from "@/utils/ai";
import { CARBON_TRADE_DEFAULTS } from "@/constants/embodiedCarbonDb";
import { formatCarbon } from "@/utils/carbonEngine";
import ComputationChain from "@/components/estimate/ComputationChain";

const CO2E_TRADE = {
  "03": "concrete",
  "04": "masonry",
  "05": "metals",
  "06": "carpentry",
  "07": "insulation",
  "08": "doors",
  "09": "finishes",
  10: "specialties",
  15: "hvac",
  16: "electrical",
  21: "fireSuppression",
  22: "plumbing",
  23: "hvac",
  26: "electrical",
  31: "sitework",
  32: "sitework",
  33: "sitework",
};
function getItemCO2e(item) {
  const div = (item.code || "").substring(0, 2);
  const trade = CO2E_TRADE[div] || "general";
  const factor = CARBON_TRADE_DEFAULTS[trade] || 0.04;
  return nn(item.material) * nn(item.quantity) * factor;
}

function computeDirective(item) {
  const mat = nn(item.material);
  const lab = nn(item.labor);
  const sub = nn(item.subcontractor);
  const hasMat = mat > 0;
  const hasLabor = lab > 0 || sub > 0;
  if (hasMat && hasLabor) return "F/I";
  if (hasMat && !hasLabor) return "F/O";
  if (!hasMat && hasLabor) return "I/O";
  return "";
}

function Section({ title, icon, defaultOpen = false, children, color, C }) {
  const [open, setOpen] = useState(defaultOpen);
  const T = C.T;
  return (
    <div style={{ borderBottom: `1px solid ${C.border}30` }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: `${T.space[3]}px ${T.space[4]}px`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: T.fontSize.xs,
          fontWeight: 700,
          color: color || C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontFamily: T.font.sans,
          transition: T.transition.fast,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = `${C.text}06`)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {icon && <Ic d={icon} size={12} color={color || C.textDim} />}
        <span style={{ flex: 1, textAlign: "left" }}>{title}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke={C.textDim}
          strokeWidth="2"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}
        >
          <path d="M3 1l4 4-4 4" />
        </svg>
      </button>
      {open && <div style={{ padding: `0 ${T.space[4]}px ${T.space[3]}px` }}>{children}</div>}
    </div>
  );
}

export default function ItemDetailPanel({ itemId, onClose, onNavigate, panelWidth = 380 }) {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const updateItem = useItemsStore(s => s.updateItem);
  const batchUpdateItem = useItemsStore(s => s.batchUpdateItem);
  const removeItem = useItemsStore(s => s.removeItem);
  const duplicateItem = useItemsStore(s => s.duplicateItem);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const addSubItem = useItemsStore(s => s.addSubItem);
  const updateSubItem = useItemsStore(s => s.updateSubItem);
  const removeSubItem = useItemsStore(s => s.removeSubItem);
  const setPickerForItemId = useDatabaseStore(s => s.setPickerForItemId);
  const setPricingModal = useUiStore(s => s.setPricingModal);
  const showToast = useUiStore(s => s.showToast);

  const item = items.find(i => i.id === itemId);
  const panelRef = useRef(null);
  const [focusedField, setFocusedField] = useState(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = e => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigate(-1);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigate(1);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, onNavigate]);

  if (!item) return null;

  const lt = getItemTotal(item);
  const unitTotal = nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor);
  const autoDir = computeDirective(item);
  const displayDir = item.directiveOverride ? item.directive || "" : autoDir;
  const co2 = getItemCO2e(item);
  const sItemList = item.subItems || [];
  const subItemTotal = sItemList.reduce((s, si) => s + (nn(si.m) + nn(si.l) + nn(si.e)) * nn(si.factor || 1), 0);
  const computedQty = item.formula?.trim()
    ? evalFormula(
        item.formula,
        (item.variables || []).filter(v => v.key),
        nn(item.quantity),
      )
    : nn(item.quantity);

  const toggleAllowance = field => {
    let ao = item.allowanceOf;
    if (typeof ao === "string" || !ao) {
      ao = { material: false, labor: false, equipment: false, subcontractor: false };
      if (typeof item.allowanceOf === "string" && item.allowanceOf) ao[item.allowanceOf] = true;
    } else {
      ao = { ...ao };
    }
    ao[field] = !ao[field];
    const anyActive = ao.material || ao.labor || ao.equipment || ao.subcontractor;
    updateItem(item.id, "allowanceOf", anyActive ? ao : "");
  };

  const excludeItem = () => {
    const excText = item.directive ? `${item.directive} of ${item.description}` : item.description || "";
    useDocumentManagementStore.getState().addExclusion({
      text: excText,
      aiText: "",
      code: item.code,
      division: item.division,
      description: item.description,
      source: "estimate",
    });
    removeItem(item.id);
    showToast("Item excluded");
    onClose();
    useDocumentManagementStore.getState().setAiExclusionLoading(true);
    callAnthropic({
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Write a professional construction exclusion clause (one concise sentence, under 15 words) for: ${item.description}${item.code ? ` (${item.code})` : ""}`,
        },
      ],
    })
      .then(text => {
        const exs = useDocumentManagementStore.getState().exclusions;
        const last = exs[exs.length - 1];
        if (last) useDocumentManagementStore.getState().setExclusions(exs.map(x => (x.id === last.id ? { ...x, aiText: text } : x)));
      })
      .catch(() => {})
      .finally(() => useDocumentManagementStore.getState().setAiExclusionLoading(false));
  };

  const costField = (label, field) => {
    const ao = item.allowanceOf;
    const isAllowance = ao && (typeof ao === "string" ? ao === field : ao[field]);
    const cellKey = `${item.id}-${field}`;
    const isFocused = focusedField === cellKey;
    const rawVal = item[field];
    const displayVal = isFocused ? rawVal : nn(rawVal) ? formatCurrency(rawVal) : rawVal;
    return (
      <div key={field} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{ width: 70, fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim, textTransform: "capitalize" }}
        >
          {label}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={displayVal}
          onFocus={() => setFocusedField(cellKey)}
          onBlur={() => setFocusedField(null)}
          onChange={e => updateItem(item.id, field, e.target.value.replace(/[$,]/g, ""))}
          placeholder="0.00"
          style={nInp(C, {
            flex: 1,
            padding: "5px 8px",
            fontSize: T.fontSize.sm,
            background: isAllowance ? `${C.orange}12` : undefined,
            border: isAllowance ? `1px solid ${C.orange}30` : undefined,
          })}
        />
        <button
          onClick={() => toggleAllowance(field)}
          title={`${isAllowance ? "Remove" : "Flag"} ${field} allowance`}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 9,
            fontWeight: 800,
            textAlign: "center",
            lineHeight: "20px",
            padding: 0,
            background: isAllowance ? `linear-gradient(180deg, ${C.orange}, ${C.orange}CC)` : `${C.text}08`,
            color: isAllowance ? "#fff" : C.orange,
            border: isAllowance ? `1px solid ${C.orange}` : `1px solid ${C.text}12`,
            boxShadow: isAllowance ? `0 2px 4px ${C.orange}40` : "none",
          }}
        >
          A
        </button>
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      style={{
        width: panelWidth,
        borderLeft: `1px solid ${C.border}`,
        background: C.glassBg || "rgba(18,21,28,0.55)",
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        boxShadow: `-4px 0 24px rgba(0,0,0,0.25)`,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        animation: "slideInRight 0.2s ease-out",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${T.space[4]}px ${T.space[4]}px ${T.space[3]}px`,
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={item.description}
              onChange={e => updateItem(item.id, "description", e.target.value)}
              placeholder="Description..."
              style={inp(C, {
                background: "transparent",
                border: "1px solid transparent",
                padding: "2px 0",
                fontSize: T.fontSize.md,
                fontWeight: 600,
              })}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: `1px solid ${C.border}`,
              background: "transparent",
              borderRadius: T.radius.sm,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            <Ic d={I.x} size={12} color={C.textMuted} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setPickerForItemId(item.id)}
            style={{
              padding: "3px 8px",
              fontSize: T.fontSize.sm,
              fontWeight: 600,
              color: item.code ? C.accent : C.textDim,
              background: `${C.accent}08`,
              border: `1px solid ${C.accent}30`,
              borderRadius: T.radius.sm,
              cursor: "pointer",
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
            }}
          >
            {item.code || "Pick Code..."}
          </button>
          <span
            style={{
              fontSize: T.fontSize.xs,
              color: C.textDim,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.division || ""}
          </span>
          {displayDir && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.text,
                background: C.bg2,
                padding: "1px 6px",
                borderRadius: 3,
              }}
            >
              {displayDir}
            </span>
          )}
        </div>
      </div>

      {/* Quantity + Unit section */}
      <div style={{ padding: `${T.space[3]}px ${T.space[4]}px`, borderBottom: `1px solid ${C.border}30` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: T.fontSize.xs,
              fontWeight: 600,
              color: C.textDim,
              width: 70,
              textTransform: "uppercase",
            }}
          >
            Qty
          </span>
          <input
            type="number"
            value={item.quantity}
            onChange={e => updateItem(item.id, "quantity", e.target.value)}
            placeholder="0"
            style={nInp(C, { flex: 1, padding: "5px 8px", fontSize: T.fontSize.base })}
          />
        </div>

        {/* Base unit chips */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 78 }}>
          {BASE_UNITS.map(u => {
            const isBase = item.unit === u && !item._conversionKey;
            const isConvFrom = CONVERSIONS[u]?.some(c => c.label === item._conversionKey);
            const active = isBase || isConvFrom;
            return (
              <button
                key={u}
                onClick={() => {
                  if (isBase) return;
                  batchUpdateItem(item.id, { unit: u, formula: "", variables: [], _conversionKey: "" });
                }}
                style={{
                  padding: "4px 12px",
                  fontSize: T.fontSize.sm,
                  fontWeight: 700,
                  fontFamily: T.font.sans,
                  border: `1.5px solid ${active ? C.accent : C.border}`,
                  background: active ? `${C.accent}15` : "transparent",
                  color: active ? C.accent : C.textDim,
                  borderRadius: 6,
                  cursor: isBase ? "default" : "pointer",
                  transition: "all 0.12s",
                }}
              >
                {u}
              </button>
            );
          })}
          {/* Fallback for non-base units (shows current unit if not EA/SF/LF and no conversion active) */}
          {!BASE_UNITS.includes(item.unit) && !item._conversionKey && (
            <select
              value={item.unit}
              onChange={e =>
                batchUpdateItem(item.id, { unit: e.target.value, formula: "", variables: [], _conversionKey: "" })
              }
              style={inp(C, { padding: "4px 8px", fontSize: T.fontSize.sm, borderRadius: 6 })}
            >
              {UNITS.filter(u => !BASE_UNITS.includes(u)).map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Conversion chips — only show for LF and SF */}
        {(() => {
          const baseUnit = item._conversionKey
            ? Object.keys(CONVERSIONS).find(k => CONVERSIONS[k].some(c => c.label === item._conversionKey))
            : BASE_UNITS.includes(item.unit)
              ? item.unit
              : null;
          const convs = baseUnit ? CONVERSIONS[baseUnit] : null;
          if (!convs || convs.length === 0) return null;
          return (
            <div style={{ display: "flex", gap: 6, marginTop: 6, paddingLeft: 78 }}>
              {convs.map(c => {
                const active = item._conversionKey === c.label;
                return (
                  <button
                    key={c.label}
                    onClick={() => {
                      if (active) {
                        // Deselect — revert to base unit, clear formula
                        batchUpdateItem(item.id, { unit: baseUnit, formula: "", variables: [], _conversionKey: "" });
                      } else {
                        // Apply conversion
                        batchUpdateItem(item.id, {
                          unit: c.target,
                          formula: c.formula,
                          variables: c.vars.map(v => ({ ...v })),
                          _conversionKey: c.label,
                        });
                      }
                    }}
                    style={{
                      padding: "3px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: T.font.sans,
                      border: `1px solid ${active ? C.cyan || C.accent : C.border}40`,
                      background: active ? `${C.cyan || C.accent}12` : `${C.text}04`,
                      color: active ? C.cyan || C.accent : C.textMuted,
                      borderRadius: 5,
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {item.formula && item.formula.trim() && (
          <div style={{ marginTop: 6, paddingLeft: 78, fontSize: T.fontSize.xs, color: C.accent, fontWeight: 600 }}>
            = {Math.round(computedQty * 100) / 100} {item.unit}
          </div>
        )}
      </div>

      {/* Pricing section */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          borderBottom: `1px solid ${C.border}30`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: T.fontSize.xs,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 2,
          }}
        >
          Pricing (per unit)
        </div>
        {costField("Material", "material")}
        {costField("Labor", "labor")}
        {costField("Equipment", "equipment")}
        {costField("Sub", "subcontractor")}
        <div
          style={{
            borderTop: `1px solid ${C.border}30`,
            paddingTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: T.fontSize.sm }}>
            <span style={{ color: C.textDim }}>Unit Total</span>
            <span
              style={{
                fontWeight: 600,
                color: C.text,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
              }}
            >
              {fmt2(unitTotal)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: T.fontSize.md }}>
            <span style={{ fontWeight: 600, color: C.text }}>Line Total</span>
            <span
              style={{
                fontWeight: 700,
                color: C.accent,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
                fontSize: T.fontSize.lg,
              }}
            >
              {fmt(lt)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          borderBottom: `1px solid ${C.border}30`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        <button
          onClick={() => setPricingModal(item)}
          style={bt(C, {
            padding: "7px 10px",
            background: `${C.accent}12`,
            border: `1px solid ${C.accent}30`,
            color: C.accent,
            justifyContent: "center",
          })}
        >
          <Ic d={I.ai} size={12} /> AI Price
        </button>
        <button
          onClick={() => {
            useUiStore.getState()._setSendToDbItem?.(item);
            // Open via external state - we emit a custom event
            window.dispatchEvent(new CustomEvent("openSendToDb", { detail: item }));
          }}
          style={bt(C, {
            padding: "7px 10px",
            background: `${C.green}12`,
            border: `1px solid ${C.green}30`,
            color: C.green,
            justifyContent: "center",
          })}
        >
          <Ic d={I.send} size={12} /> Send to DB
        </button>
        <button
          onClick={() => {
            duplicateItem(item.id);
            showToast("Item duplicated");
          }}
          style={bt(C, {
            padding: "7px 10px",
            background: `${C.text}08`,
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            justifyContent: "center",
          })}
        >
          <Ic d={I.copy} size={12} /> Duplicate
        </button>
        <button
          onClick={excludeItem}
          style={bt(C, {
            padding: "7px 10px",
            background: `${C.orange}12`,
            border: `1px solid ${C.orange}30`,
            color: C.orange,
            justifyContent: "center",
          })}
        >
          Exclude
        </button>
      </div>

      {/* Collapsible sections */}

      {/* Sub-items */}
      <Section
        title={`Sub-items (${sItemList.length})`}
        icon={I.assembly}
        color={sItemList.length > 0 ? C.accent : undefined}
        defaultOpen={sItemList.length > 0}
        C={C}
      >
        {sItemList.length > 0 && (
          <div
            style={{
              fontSize: T.fontSize.xs,
              color: subItemTotal > 0 && Math.abs(subItemTotal - unitTotal) > 0.01 ? C.orange : C.green,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Sub: {fmt2(subItemTotal)} vs Scope: {fmt2(unitTotal)}
          </div>
        )}
        {sItemList.map(si => {
          const siTotal = (nn(si.m) + nn(si.l) + nn(si.e)) * nn(si.factor || 1);
          return (
            <div
              key={si.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                padding: "6px 0",
                borderBottom: `1px solid ${C.border}20`,
              }}
            >
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={si.desc}
                  onChange={e => updateSubItem(item.id, si.id, "desc", e.target.value)}
                  placeholder="Description..."
                  style={inp(C, {
                    flex: 1,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px 4px",
                    fontSize: 11,
                  })}
                />
                <button
                  onClick={() => removeSubItem(item.id, si.id)}
                  style={{
                    width: 18,
                    height: 18,
                    border: "none",
                    background: "transparent",
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Ic d={I.x} size={9} color={C.red} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="number"
                  value={si.factor || 1}
                  onChange={e => updateSubItem(item.id, si.id, "factor", parseFloat(e.target.value) || 1)}
                  placeholder="1"
                  style={nInp(C, {
                    width: 40,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px",
                    fontSize: 10,
                    textAlign: "center",
                  })}
                />
                <input
                  value={si.unit}
                  onChange={e => updateSubItem(item.id, si.id, "unit", e.target.value)}
                  style={inp(C, {
                    width: 36,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px",
                    fontSize: 10,
                    textAlign: "center",
                  })}
                />
                <input
                  type="number"
                  value={si.m}
                  onChange={e => updateSubItem(item.id, si.id, "m", parseFloat(e.target.value) || 0)}
                  placeholder="M"
                  style={nInp(C, {
                    flex: 1,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px",
                    fontSize: 10,
                  })}
                />
                <input
                  type="number"
                  value={si.l}
                  onChange={e => updateSubItem(item.id, si.id, "l", parseFloat(e.target.value) || 0)}
                  placeholder="L"
                  style={nInp(C, {
                    flex: 1,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px",
                    fontSize: 10,
                  })}
                />
                <input
                  type="number"
                  value={si.e}
                  onChange={e => updateSubItem(item.id, si.id, "e", parseFloat(e.target.value) || 0)}
                  placeholder="E"
                  style={nInp(C, {
                    flex: 1,
                    background: "transparent",
                    border: "1px solid transparent",
                    padding: "2px",
                    fontSize: 10,
                  })}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: C.text,
                    fontFamily: T.font.sans,
                    minWidth: 44,
                    textAlign: "right",
                  }}
                >
                  {fmt2(siTotal)}
                </span>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => addSubItem(item.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 0",
            background: "transparent",
            color: C.accent,
            cursor: "pointer",
            fontSize: 10,
            fontWeight: 600,
            border: "none",
            marginTop: 4,
          }}
        >
          <Ic d={I.plus} size={10} color={C.accent} sw={2.5} /> Add Sub-Item
        </button>
      </Section>

      {/* Spec text */}
      <Section title="Specification" icon={I.plans} color={item.specText ? C.purple : undefined} C={C}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div
              style={{
                fontSize: T.fontSize.xs,
                color: C.textDim,
                fontWeight: 600,
                marginBottom: 2,
                textTransform: "uppercase",
              }}
            >
              Spec Section
            </div>
            <input
              value={item.specSection || ""}
              onChange={e => updateItem(item.id, "specSection", e.target.value)}
              placeholder="e.g. 07 61 00"
              style={inp(C, { fontSize: T.fontSize.sm, padding: "4px 8px" })}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: T.fontSize.xs,
                color: C.textDim,
                fontWeight: 600,
                marginBottom: 2,
                textTransform: "uppercase",
              }}
            >
              Written Specification
            </div>
            <textarea
              value={item.specText || ""}
              onChange={e => updateItem(item.id, "specText", e.target.value)}
              placeholder="e.g. 24ga Galvalume, PVDF finish, Pac-Clad or equal"
              rows={2}
              style={inp(C, { fontSize: T.fontSize.sm, padding: "4px 8px", resize: "vertical", minHeight: 36 })}
            />
          </div>
        </div>
      </Section>

      {/* Computation chain */}
      {(item.formula || item.variables?.length > 0) && (
        <Section title="Computation Chain" icon={I.layers} color={C.cyan || C.accent} C={C}>
          <ComputationChain item={item} />
        </Section>
      )}

      {/* Metadata */}
      <Section title="Metadata" icon={I.settings} C={C}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Directive */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 70, fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim }}>Directive</span>
            <select
              value={displayDir}
              onChange={e => {
                updateItem(item.id, "directive", e.target.value);
                updateItem(item.id, "directiveOverride", true);
              }}
              style={inp(C, { flex: 1, padding: "4px 8px", fontSize: T.fontSize.sm })}
            >
              <option value="">Auto ({autoDir || "\u2014"})</option>
              <option value="F/I">F/I</option>
              <option value="F/O">F/O</option>
              <option value="I/O">I/O</option>
            </select>
          </div>
          {/* Location Lock */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 70, fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim }}>Location</span>
            <button
              onClick={() => updateItem(item.id, "locationLocked", !item.locationLocked)}
              style={bt(C, {
                padding: "4px 10px",
                fontSize: T.fontSize.xs,
                background: item.locationLocked ? `${C.orange}15` : `${C.green}12`,
                border: `1px solid ${item.locationLocked ? C.orange : C.green}30`,
                color: item.locationLocked ? C.orange : C.green,
              })}
            >
              {item.locationLocked ? "Locked (raw costs)" : "Adjusted"}
            </button>
          </div>
          {/* CO2e */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 70, fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim }}>CO\u2082e</span>
            <span
              style={{
                fontSize: T.fontSize.sm,
                color: co2 > 0 ? C.green : C.textDim,
                fontFamily: T.font.sans,
              }}
            >
              {co2 > 0 ? formatCarbon(co2) : "\u2014"}
            </span>
          </div>
          {/* Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim }}>Notes</span>
            <textarea
              value={item.notes || ""}
              onChange={e => updateItem(item.id, "notes", e.target.value)}
              placeholder="Add item notes..."
              rows={2}
              style={inp(C, { resize: "vertical", fontSize: T.fontSize.sm, lineHeight: 1.4 })}
            />
          </div>
        </div>
      </Section>

      {/* Delete */}
      <div style={{ padding: `${T.space[4]}px`, marginTop: "auto" }}>
        <button
          onClick={() => {
            removeItem(item.id);
            onClose();
            showToast("Item deleted");
          }}
          style={bt(C, {
            width: "100%",
            padding: "8px",
            justifyContent: "center",
            background: `${C.red}12`,
            border: `1px solid ${C.red}30`,
            color: C.red,
          })}
        >
          <Ic d={I.trash} size={12} /> Delete Item
        </button>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
