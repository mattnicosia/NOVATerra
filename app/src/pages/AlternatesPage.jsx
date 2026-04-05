import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useItemsStore, DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, fmt, uid } from "@/utils/format";
import { callAnthropic } from "@/utils/ai";

export default function AlternatesPage() {
  const C = useTheme();
  const T = C.T;
  const alternates = useAlternatesStore(s => s.alternates);
  const setAlternates = useAlternatesStore(s => s.setAlternates);
  const addAlternate = useAlternatesStore(s => s.addAlternate);
  const updateAlternate = useAlternatesStore(s => s.updateAlternate);
  const removeAlternate = useAlternatesStore(s => s.removeAlternate);
  const addAlternateItem = useAlternatesStore(s => s.addAlternateItem);
  const updateAlternateItem = useAlternatesStore(s => s.updateAlternateItem);
  const removeAlternateItem = useAlternatesStore(s => s.removeAlternateItem);
  const getAltTotal = useAlternatesStore(s => s.getAltTotal);
  const getAltTotalWithMarkup = useAlternatesStore(s => s.getAltTotalWithMarkup);
  const linkAlternateItem = useAlternatesStore(s => s.linkAlternateItem);

  const items = useItemsStore(s => s.items);
  const markup = useItemsStore(s => s.markup);
  const markupOrder = useItemsStore(s => s.markupOrder) || DEFAULT_MARKUP_ORDER;
  const customMarkups = useItemsStore(s => s.customMarkups);
  const specs = useDocumentManagementStore(s => s.specs);
  const project = useProjectStore(s => s.project);

  const veLoading = useUiStore(s => s.veLoading);
  const setVeLoading = useUiStore(s => s.setVeLoading);
  const veSuggestions = useUiStore(s => s.veSuggestions);
  const setVeSuggestions = useUiStore(s => s.setVeSuggestions);
  const showToast = useUiStore(s => s.showToast);

  // Compute totals — ordered markup with per-item compound
  const totals = useMemo(() => {
    let material = 0,
      labor = 0,
      equipment = 0,
      sub = 0;
    items.forEach(it => {
      const q = nn(it.quantity);
      material += q * nn(it.material);
      labor += q * nn(it.labor);
      equipment += q * nn(it.equipment);
      sub += q * nn(it.subcontractor);
    });
    const direct = material + labor + equipment + sub;

    // Ordered markup calculation
    let running = direct;
    markupOrder.forEach(mo => {
      const pct = nn(markup[mo.key]);
      if (pct === 0) return;
      const base = mo.compound ? running : direct;
      running += (base * pct) / 100;
    });
    let grand = running;

    customMarkups.forEach(cm => {
      if (cm.type === "pct") grand *= 1 + nn(cm.value) / 100;
      else grand += nn(cm.value);
    });
    grand *= 1 + nn(markup.bond) / 100;
    grand *= 1 + nn(markup.tax) / 100;

    const altTotals = alternates.map(alt => {
      const direct = getAltTotal(alt);
      const { grand: altGrand, markupAmount } = getAltTotalWithMarkup(alt);
      return {
        ...alt,
        directTotal: alt.type === "deduct" ? -direct : direct,
        total: alt.type === "deduct" ? -altGrand : altGrand,
        markupAmount: alt.type === "deduct" ? -markupAmount : markupAmount,
      };
    });
    const acceptedAltTotal = altTotals.filter(a => a.accepted).reduce((s, a) => s + a.total, 0);
    return { grand, altTotals, acceptedAltTotal, grandWithAlts: grand + acceptedAltTotal };
  }, [items, markup, markupOrder, customMarkups, alternates, getAltTotal, getAltTotalWithMarkup]);

  const runVE = async () => {
    setVeLoading(true);
    setVeSuggestions([]);
    try {
      const specSummary = specs.map(s => `${s.section} ${s.title}: ${s.summary}`).join("\n");
      const itemSummary = items
        .slice(0, 60)
        .map(
          i =>
            `${i.code || ""} ${i.description} (${i.quantity} ${i.unit}) M:$${i.material} L:$${i.labor} E:$${i.equipment} S:$${i.subcontractor}`,
        )
        .join("\n");
      const prompt = `You are a construction value engineer. Analyze these specifications and estimate line items for a ${project.jobType || "construction"} project. Suggest 5-8 deduct alternates that could save money while maintaining code compliance and structural integrity.\n\nFor each suggestion, provide:\n- original: what's currently specified\n- suggestion: the value-engineered alternative\n- savings_pct: estimated % savings on that scope item\n- reasoning: why this is viable\n\nSPECIFICATIONS:\n${specSummary || "No specs uploaded"}\n\nESTIMATE LINE ITEMS:\n${itemSummary || "No items"}\n\nPROJECT: ${project.name} | Type: ${project.jobType} | SF: ${project.projectSF || "unknown"}\n\nRespond ONLY with a JSON array of objects with keys: original, suggestion, savings_pct, reasoning`;
      const text = await callAnthropic({ max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setVeSuggestions(parsed.map(s => ({ ...s, id: uid(), accepted: false })));
      showToast(`${parsed.length} VE suggestions generated`);
    } catch (e) {
      showToast("VE analysis failed", "error");
      console.error(e);
    }
    setVeLoading(false);
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1100 }}>
        <p style={{ color: C.textMuted, fontSize: 12, marginBottom: 16 }}>
          Define add and deduct alternates for your proposal. Mark alternates as accepted to include them in project
          totals.
        </p>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className="accent-btn"
            onClick={() => addAlternate("deduct")}
            style={bt(C, { background: C.green, color: "#fff", padding: "8px 16px" })}
          >
            <Ic d={I.plus} size={13} color="#fff" sw={2} /> Deduct Alternate
          </button>
          <button
            className="accent-btn"
            onClick={() => addAlternate("add")}
            style={bt(C, { background: C.blue, color: "#fff", padding: "8px 16px" })}
          >
            <Ic d={I.plus} size={13} color="#fff" sw={2} /> Add Alternate
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="accent-btn"
            disabled={veLoading || (items.length === 0 && specs.length === 0)}
            onClick={runVE}
            style={bt(C, {
              background: C.purple,
              color: "#fff",
              padding: "8px 16px",
              opacity: veLoading || (items.length === 0 && specs.length === 0) ? 0.5 : 1,
            })}
          >
            <Ic d={I.ai} size={13} color="#fff" sw={2} /> {veLoading ? "Analyzing..." : "AI Value Engineering"}
          </button>
        </div>

        {/* VE Suggestions */}
        {veSuggestions.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background: "rgba(160,120,255,0.04)",
              borderRadius: 8,
              border: `1px solid ${C.purple}40`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.purple,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 10,
              }}
            >
              AI Value Engineering Suggestions
            </div>
            {veSuggestions.map(s => (
              <div
                key={s.id}
                style={{
                  padding: "8px 12px",
                  marginBottom: 6,
                  background: s.accepted ? "rgba(76,175,125,0.06)" : C.bg1,
                  borderRadius: 6,
                  border: `1px solid ${s.accepted ? C.green + "40" : C.border}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 2 }}>
                      Currently: <strong style={{ color: C.text }}>{s.original}</strong>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 2 }}>
                      {"\u2192"} {s.suggestion}
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.4 }}>{s.reasoning}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.green,
                        fontFamily: T.font.sans,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ~{s.savings_pct}% savings
                    </div>
                    <button
                      className="ghost-btn"
                      onClick={() => {
                        const newAlt = {
                          id: uid(),
                          name: s.suggestion,
                          type: "deduct",
                          description: `VE: Replace ${s.original} with ${s.suggestion}. ${s.reasoning}`,
                          items: [
                            {
                              id: uid(),
                              description: s.suggestion,
                              unit: "LS",
                              quantity: 1,
                              material: 0,
                              labor: 0,
                              equipment: 0,
                              subcontractor: 0,
                            },
                          ],
                          accepted: false,
                        };
                        setAlternates([...alternates, newAlt]);
                        setVeSuggestions(veSuggestions.map(vs => (vs.id === s.id ? { ...vs, accepted: true } : vs)));
                        showToast("Alternate created \u2014 add pricing");
                      }}
                      disabled={s.accepted}
                      style={bt(C, {
                        fontSize: 10,
                        padding: "4px 10px",
                        background: s.accepted ? C.bg2 : C.green,
                        color: s.accepted ? C.textDim : "#fff",
                        border: "none",
                      })}
                    >
                      {s.accepted ? "Added" : "\u2192 Create Alternate"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alternates List */}
        {alternates.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: T.space[10],
              border: `1px dashed ${C.border}`,
              borderRadius: T.radius.md,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: T.radius.full,
                margin: "0 auto",
                marginBottom: T.space[3],
                background: `linear-gradient(135deg, ${C.accent}20, ${C.accent}08)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.change} size={28} color={C.accent} sw={1.7} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.lg,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[1],
              }}
            >
              No alternates yet
            </div>
            <div style={{ fontSize: T.fontSize.base, color: C.textMuted, maxWidth: 320, margin: "0 auto" }}>
              Add deduct alternates to offer cost savings, or add alternates for scope upgrades.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {alternates.map((alt, altIdx) => {
              const altDirect = getAltTotal(alt);
              const { grand: altGrand, markupAmount } = getAltTotalWithMarkup(alt);
              return (
                <div
                  key={alt.id}
                  style={{
                    border: `1px solid ${alt.accepted ? "rgba(76,175,125,0.4)" : C.border}`,
                    borderLeft: `3px solid ${alt.type === "deduct" ? C.green : C.blue}`,
                    borderRadius: T.radius.md,
                    overflow: "hidden",
                    background: alt.accepted ? "rgba(76,175,125,0.03)" : "transparent",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      padding: "10px 14px",
                      background: C.bg1,
                      borderBottom: `1px solid ${C.border}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        color: alt.type === "deduct" ? C.green : C.blue,
                        background: alt.type === "deduct" ? "rgba(76,175,125,0.12)" : "rgba(91,141,239,0.12)",
                        border: `1px solid ${alt.type === "deduct" ? C.green : C.blue}33`,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {alt.type === "deduct" ? "Deduct" : "Add"} #{altIdx + 1}
                    </span>
                    <input
                      value={alt.name}
                      onChange={e => updateAlternate(alt.id, "name", e.target.value)}
                      placeholder="Alternate name..."
                      style={inp(C, { flex: 1, fontWeight: 600, fontSize: 13, padding: "5px 10px" })}
                    />
                    <div style={{ textAlign: "right", minWidth: 140 }}>
                      <div
                        style={{
                          fontFamily: T.font.sans,
                          fontSize: 14,
                          fontWeight: 700,
                          color: alt.type === "deduct" ? C.green : C.blue,
                        }}
                      >
                        {alt.type === "deduct" ? "\u2212" : "+"}
                        {fmt(altGrand)}
                      </div>
                      {markupAmount > 0 && (
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: T.font.sans }}>
                          direct {fmt(altDirect)} + markup {fmt(markupAmount)}
                        </div>
                      )}
                    </div>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        cursor: "pointer",
                        padding: "4px 10px",
                        borderRadius: 4,
                        background: alt.accepted ? "rgba(76,175,125,0.15)" : "transparent",
                        border: `1px solid ${alt.accepted ? C.green : C.border}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={alt.accepted}
                        onChange={e => updateAlternate(alt.id, "accepted", e.target.checked)}
                        style={{ accentColor: C.green }}
                      />
                      <span style={{ fontSize: 10, fontWeight: 600, color: alt.accepted ? C.green : C.textDim }}>
                        Accepted
                      </span>
                    </label>
                    <button
                      className="icon-btn"
                      onClick={() => removeAlternate(alt.id)}
                      style={{
                        width: 24,
                        height: 24,
                        border: "none",
                        background: "transparent",
                        color: C.red,
                        borderRadius: 3,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <Ic d={I.trash} size={12} />
                    </button>
                  </div>

                  {/* Description */}
                  <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}` }}>
                    <input
                      value={alt.description}
                      onChange={e => updateAlternate(alt.id, "description", e.target.value)}
                      placeholder="Description of this alternate (shown on proposals)..."
                      style={inp(C, { width: "100%", fontSize: 11, padding: "5px 10px" })}
                    />
                  </div>

                  {/* Line Items */}
                  <div style={{ padding: "8px 14px" }}>
                    {alt.items.length > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 1.2fr .5fr .5fr .7fr .7fr .7fr .7fr .8fr auto",
                          gap: 6,
                          marginBottom: 6,
                          fontSize: 8,
                          fontWeight: 600,
                          color: C.textDim,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        <span>Description</span>
                        <span>Linked Item</span>
                        <span>Qty</span>
                        <span>Unit</span>
                        <span style={{ textAlign: "right" }}>Material</span>
                        <span style={{ textAlign: "right" }}>Labor</span>
                        <span style={{ textAlign: "right" }}>Equip</span>
                        <span style={{ textAlign: "right" }}>Sub</span>
                        <span style={{ textAlign: "right" }}>Total</span>
                        <span></span>
                      </div>
                    )}
                    {alt.items.map(ai => {
                      const q = nn(ai.quantity);
                      const t = (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * q;
                      const _linkedItem = ai.linkedItemId ? items.find(it => it.id === ai.linkedItemId) : null;
                      return (
                        <div
                          key={ai.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.5fr 1.2fr .5fr .5fr .7fr .7fr .7fr .7fr .8fr auto",
                            gap: 6,
                            marginBottom: 4,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {ai.linkedItemId && alt.accepted && (
                              <span
                                style={{
                                  fontSize: 7,
                                  fontWeight: 700,
                                  color: C.orange || "#F59E0B",
                                  background: "rgba(245,158,11,0.12)",
                                  padding: "1px 4px",
                                  borderRadius: 3,
                                  flexShrink: 0,
                                }}
                              >
                                REPLACES
                              </span>
                            )}
                            <input
                              value={ai.description}
                              onChange={e => updateAlternateItem(alt.id, ai.id, "description", e.target.value)}
                              placeholder="Line item..."
                              style={inp(C, { fontSize: 11, padding: "4px 8px", flex: 1 })}
                            />
                          </div>
                          <select
                            value={ai.linkedItemId || ""}
                            onChange={e => linkAlternateItem(alt.id, ai.id, e.target.value || null)}
                            style={inp(C, {
                              fontSize: 10,
                              padding: "4px 4px",
                              color: ai.linkedItemId ? C.text : C.textDim,
                            })}
                          >
                            <option value="">— None —</option>
                            {items.map(it => (
                              <option key={it.id} value={it.id}>
                                {it.code ? `${it.code} ` : ""}
                                {it.description || "Unnamed item"}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={ai.quantity}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "quantity", e.target.value)}
                            style={nInp(C, { fontSize: 11, padding: "4px 6px", textAlign: "center" })}
                          />
                          <select
                            value={ai.unit}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "unit", e.target.value)}
                            style={inp(C, { fontSize: 10, padding: "4px 4px" })}
                          >
                            {["LS", "SF", "LF", "EA", "SY", "CY", "CF", "GAL", "TON", "HR", "DAY", "MO", "VLF"].map(
                              u => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ),
                            )}
                          </select>
                          <input
                            type="number"
                            value={ai.material}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "material", e.target.value)}
                            placeholder="0"
                            style={nInp(C, { fontSize: 11, padding: "4px 6px", textAlign: "right" })}
                          />
                          <input
                            type="number"
                            value={ai.labor}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "labor", e.target.value)}
                            placeholder="0"
                            style={nInp(C, { fontSize: 11, padding: "4px 6px", textAlign: "right" })}
                          />
                          <input
                            type="number"
                            value={ai.equipment}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "equipment", e.target.value)}
                            placeholder="0"
                            style={nInp(C, { fontSize: 11, padding: "4px 6px", textAlign: "right" })}
                          />
                          <input
                            type="number"
                            value={ai.subcontractor}
                            onChange={e => updateAlternateItem(alt.id, ai.id, "subcontractor", e.target.value)}
                            placeholder="0"
                            style={nInp(C, { fontSize: 11, padding: "4px 6px", textAlign: "right" })}
                          />
                          <div
                            style={{
                              fontFamily: T.font.sans,
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.text,
                              textAlign: "right",
                            }}
                          >
                            {fmt(t)}
                          </div>
                          <button
                            className="icon-btn"
                            onClick={() => removeAlternateItem(alt.id, ai.id)}
                            style={{
                              width: 20,
                              height: 20,
                              border: "none",
                              background: "transparent",
                              color: C.red,
                              borderRadius: 3,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Ic d={I.x} size={9} />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      className="ghost-btn"
                      onClick={() => addAlternateItem(alt.id)}
                      style={bt(C, {
                        background: "transparent",
                        border: `1px dashed ${C.border}`,
                        color: C.accent,
                        padding: "5px 12px",
                        fontSize: 10,
                        marginTop: 4,
                      })}
                    >
                      <Ic d={I.plus} size={10} color={C.accent} /> Add Line Item
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {alternates.length > 0 && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: C.bg1,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              Alternates Summary
            </div>
            {totals.altTotals.map(alt => (
              <div
                key={alt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  borderBottom: `1px solid ${C.bg2}`,
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: alt.type === "deduct" ? C.green : C.blue }}>
                    {alt.type === "deduct" ? "DEDUCT" : "ADD"}
                  </span>
                  <span style={{ fontSize: 12, color: C.text }}>{alt.name}</span>
                  {alt.accepted && (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: C.green,
                        background: "rgba(76,175,125,0.12)",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}
                    >
                      ACCEPTED
                    </span>
                  )}
                  {alt.items && alt.items.some(it => it.linkedItemId) && alt.accepted && (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: C.orange || "#F59E0B",
                        background: "rgba(245,158,11,0.10)",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}
                    >
                      SWAPS ITEMS
                    </span>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontFamily: T.font.sans,
                      fontSize: 12,
                      fontWeight: 600,
                      color: alt.total < 0 ? C.green : C.blue,
                    }}
                  >
                    {alt.total < 0 ? "\u2212" : "+"}
                    {fmt(Math.abs(alt.total))}
                  </span>
                  {alt.markupAmount !== 0 && (
                    <div style={{ fontSize: 9, color: C.textDim, fontFamily: T.font.sans }}>
                      incl. {fmt(Math.abs(alt.markupAmount))} markup
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0 4px",
                borderTop: `2px solid ${C.accent}`,
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Base Bid</span>
              <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: C.accent }}>
                {fmt(totals.grand)}
              </span>
            </div>
            {totals.acceptedAltTotal !== 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>Accepted Alternates</span>
                <span
                  style={{
                    fontFamily: T.font.sans,
                    fontSize: 13,
                    fontWeight: 600,
                    color: totals.acceptedAltTotal < 0 ? C.green : C.blue,
                  }}
                >
                  {totals.acceptedAltTotal < 0 ? "\u2212" : "+"}
                  {fmt(Math.abs(totals.acceptedAltTotal))}
                </span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0 2px",
                borderTop: `1px solid ${C.border}`,
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>Contract Total</span>
              <span style={{ fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, color: C.purple }}>
                {fmt(totals.grandWithAlts)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
