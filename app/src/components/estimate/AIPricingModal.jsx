import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";
import { callAnthropic } from "@/utils/ai";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { supabase } from "@/utils/supabase";

export default function AIPricingModal() {
  const C = useTheme();
  const item = useUiStore(s => s.pricingModal);
  const setPricingModal = useUiStore(s => s.setPricingModal);
  const updateItem = useItemsStore(s => s.updateItem);
  const elements = useDatabaseStore(s => s.elements);
  const project = useProjectStore(s => s.project);
  const showToast = useUiStore(s => s.showToast);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({ material: true, labor: true, equipment: true, subcontractor: true });
  const [tradeIndex, setTradeIndex] = useState(null); // Data from trade_pricing_index

  // DB matches
  const dbMatches = item
    ? elements
        .filter(e => {
          const codeMatch = item.code && e.code && e.code.startsWith(item.code.split(".").slice(0, 2).join("."));
          const nameMatch =
            item.description && e.name && e.name.toLowerCase().includes(item.description.toLowerCase().split(" ")[0]);
          return codeMatch || nameMatch;
        })
        .slice(0, 5)
    : [];

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setTradeIndex(null);

    const csiDiv = (item.code || "").substring(0, 2);
    const unit = (item.unit || "EA").toUpperCase();

    // Step 1: Check trade pricing index from Supabase (YOUR data first)
    const fetchTradeIndex = supabase
      .from("trade_pricing_index")
      .select("*")
      .eq("csi_division", csiDiv)
      .then(({ data }) => {
        if (data?.length) {
          // Find best match: same unit > any unit rate > lump sum
          const exactMatch = data.find(d => d.metric_type === "unit_rate" && d.unit === unit);
          const anyUnitRate = data.find(d => d.metric_type === "unit_rate");
          const lumpSum = data.find(d => d.metric_type === "lump_sum_per_sf");
          setTradeIndex(exactMatch || anyUnitRate || lumpSum || null);
          return exactMatch || anyUnitRate || lumpSum;
        }
        return null;
      })
      .catch(() => null);

    // Step 2: Call Claude with your data context injected
    fetchTradeIndex.then(tpi => {
      const loc = project.address || "NYC metro area";
      const dir = item.directive || "";

      // Build data context from trade pricing index
      let dataContext = "";
      if (tpi) {
        dataContext = `\n\nIMPORTANT — USER'S HISTORICAL DATA for Division ${csiDiv}:
- Metric: ${tpi.metric_type} ${tpi.unit ? `(${tpi.unit})` : ""}
- Median: $${tpi.median} | Mean: $${tpi.mean}
- Range: $${tpi.p25} (25th pct) to $${tpi.p75} (75th pct)
- Based on ${tpi.sample_count} real proposals from this user's portfolio
ANCHOR your pricing to this data. Adjust for the specific item but stay within reasonable range of the user's historical pricing.`;
      }

      // Build DB match context
      let dbContext = "";
      if (dbMatches.length > 0) {
        const top3 = dbMatches.slice(0, 3).map(e => {
          const total = (e.material || 0) + (e.labor || 0) + (e.equipment || 0) + (e.subcontractor || 0);
          return `"${e.name}" — $${total.toFixed(2)}/${e.unit} (M:$${e.material || 0} L:$${e.labor || 0} E:$${e.equipment || 0})`;
        });
        dbContext = `\n\nUSER'S COST DATABASE MATCHES:\n${top3.join("\n")}
Consider these as reference points.`;
      }

      // Correction context
      const corrCtx = useCorrectionStore.getState().buildCorrectionContext("pricing", 500);

      const prompt = `You are a construction cost estimator. Provide unit pricing for this scope item.

Item: ${item.description}
CSI Code: ${item.code || "N/A"}
Unit: ${item.unit || "EA"}
Directive: ${dir || "N/A"}
Location: ${loc}
${dir === "F/O" ? "This is Furnish Only — set labor to 0." : ""}
${dir === "I/O" ? "This is Install Only — set material to 0." : ""}${dataContext}${dbContext}${corrCtx ? "\n\n" + corrCtx : ""}

Return ONLY valid JSON (no markdown): { "material": number, "labor": number, "equipment": number, "subcontractor": number, "confidence": "high"|"medium"|"low", "source": "string describing pricing basis", "subNote": "whether typically self-performed or subcontracted", "alternatives": [{ "name": "string", "material": number, "labor": number, "equipment": number }] }

Base pricing on the user's historical data when available, supplemented by RS Means / industry data. Apply locality adjustment if needed.`;

      return callAnthropic({ max_tokens: 800, messages: [{ role: "user", content: prompt }] });
    })
      .then(text => {
        try {
          const json = JSON.parse(
            text
              .replace(/```json?\n?/g, "")
              .replace(/```/g, "")
              .trim(),
          );
          setResult(json);
        } catch {
          setError("Could not parse AI response");
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) return null;

  const toggleField = f => setSelected(s => ({ ...s, [f]: !s[f] }));

  const handleApply = () => {
    if (!result) return;
    const fields = ["material", "labor", "equipment", "subcontractor"];
    const { logCorrection } = useCorrectionStore.getState();

    // Log which pricing components were accepted/rejected
    fields.forEach(f => {
      if (result[f] != null && result[f] > 0) {
        if (!selected[f]) {
          // User rejected this component — log it
          logCorrection("pricing:adjust", {
            context: `Rejected AI ${f} for "${item.description || "item"}"`,
            original: result[f],
            corrected: 0,
            field: f,
            scheduleType: item.code || "",
          });
        } else {
          // Log acceptance so NOVA learns what pricing users agree with
          logCorrection("pricing:adjust", {
            context: `Accepted AI ${f} for "${item.description || "item"}"`,
            original: item[f] || 0,
            corrected: result[f],
            field: f,
            scheduleType: item.code || "",
          });
          updateItem(item.id, f, result[f]);
        }
      }
    });

    showToast("AI pricing applied");
    setPricingModal(null);
  };

  const handleApplyDb = el => {
    updateItem(item.id, "material", el.material || 0);
    updateItem(item.id, "labor", el.labor || 0);
    updateItem(item.id, "equipment", el.equipment || 0);

    // Log that user preferred DB match over AI — teaches NOVA to match DB items
    if (result) {
      useCorrectionStore.getState().logCorrection("pricing:source", {
        context: `Chose DB "${el.name}" over AI for "${item.description}"`,
        original: { m: result.material, l: result.labor, e: result.equipment },
        corrected: { m: el.material, l: el.labor, e: el.equipment, source: el.name },
        field: item.code,
      });
    }

    showToast(`Applied "${el.name}" pricing`);
    setPricingModal(null);
  };

  const handleApplyAlt = alt => {
    // Log alternative selection
    if (result) {
      useCorrectionStore.getState().logCorrection("pricing:adjust", {
        context: `Chose alternative "${alt.name}" over primary for "${item.description}"`,
        original: { m: result.material, l: result.labor, e: result.equipment },
        corrected: { m: alt.material, l: alt.labor, e: alt.equipment, name: alt.name },
        field: item.code,
      });
    }
    if (alt.name) updateItem(item.id, "description", alt.name);
    updateItem(item.id, "material", alt.material || 0);
    updateItem(item.id, "labor", alt.labor || 0);
    updateItem(item.id, "equipment", alt.equipment || 0);
    showToast("Alternative applied");
    setPricingModal(null);
  };

  const cards = [
    { key: "material", label: "Material", color: C.green },
    { key: "labor", label: "Labor", color: C.blue },
    { key: "equipment", label: "Equipment", color: C.orange },
    { key: "subcontractor", label: "Sub", color: C.purple },
  ];

  const selectedTotal = result ? cards.reduce((s, c) => s + (selected[c.key] ? nn(result[c.key]) : 0), 0) : 0;

  return (
    <Modal onClose={() => setPricingModal(null)} wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
            <Ic d={I.ai} size={16} color={C.accent} /> AI Pricing Lookup
          </h3>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
            {item.description}
            {item.code && <span style={{ color: C.purple, marginLeft: 6 }}>{item.code}</span>}
            {item.unit && <span style={{ marginLeft: 6 }}>({item.unit})</span>}
          </div>
        </div>
        <button
          onClick={() => setPricingModal(null)}
          style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
        >
          <Ic d={I.x} size={16} />
        </button>
      </div>

      {/* Current values */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          padding: "6px 8px",
          background: C.bg2,
          borderRadius: 4,
          fontSize: 12,
          color: C.textDim,
        }}
      >
        <span>Current: M={fmt2(nn(item.material))}</span>
        <span>L={fmt2(nn(item.labor))}</span>
        <span>E={fmt2(nn(item.equipment))}</span>
        <span>S={fmt2(nn(item.subcontractor))}</span>
      </div>

      {/* Your Data — Trade Pricing Index */}
      {tradeIndex && (
        <div style={{
          padding: "8px 10px", marginBottom: 10, borderRadius: 6,
          background: `${C.accent}12`, border: `1px solid ${C.accent}30`,
          fontSize: 11,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: C.accent, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              Your Data — {tradeIndex.trade_name} ({tradeIndex.sample_count} proposals)
              <span style={{
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 600,
                background: tradeIndex.sample_count >= 8 ? `${C.green}18` :
                            tradeIndex.sample_count >= 3 ? `${C.orange}18` : `${C.red}18`,
                color: tradeIndex.sample_count >= 8 ? C.green :
                       tradeIndex.sample_count >= 3 ? C.orange : C.red,
              }}>
                {tradeIndex.sample_count >= 8 ? "HIGH" : tradeIndex.sample_count >= 3 ? "MEDIUM" : "LOW"} confidence
              </span>
            </div>
            <button
              onClick={() => {
                const median = parseFloat(tradeIndex.median);
                if (!median || !item.unit) return;
                const splits = { m: 0.40, l: 0.35, e: 0.05, s: 0.20 };
                updateItem(item.id, "material", Math.round(median * splits.m * 100) / 100);
                updateItem(item.id, "labor", Math.round(median * splits.l * 100) / 100);
                updateItem(item.id, "equipment", Math.round(median * splits.e * 100) / 100);
                updateItem(item.id, "subcontractor", Math.round(median * splits.s * 100) / 100);
                useCorrectionStore.getState().logCorrection("pricing:source", {
                  context: `Applied trade index median for "${item.description}"`,
                  original: { m: item.material, l: item.labor, e: item.equipment, s: item.subcontractor },
                  corrected: { median, source: "trade_pricing_index", samples: tradeIndex.sample_count },
                  field: item.code,
                });
                showToast(`Applied your median pricing ($${median})`);
                setPricingModal(null);
              }}
              style={bt(C, {
                background: `${C.accent}15`,
                border: `1px solid ${C.accent}40`,
                color: C.accent,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
              })}
            >
              Apply Your Median
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, color: C.text }}>
            <span>Median: <b>${parseFloat(tradeIndex.median).toLocaleString()}</b>{tradeIndex.unit ? `/${tradeIndex.unit}` : ""}</span>
            <span style={{ color: C.textDim }}>Range: ${parseFloat(tradeIndex.p25).toLocaleString()} – ${parseFloat(tradeIndex.p75).toLocaleString()}</span>
            <span style={{ color: C.textDim }}>Mean: ${parseFloat(tradeIndex.mean).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, marginBottom: 8 }}>Analyzing pricing...</div>
          <div
            style={{
              width: 24,
              height: 24,
              border: `2px solid ${C.border}`,
              borderTopColor: C.accent,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto",
            }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 12,
            background: `${C.red}10`,
            border: `1px solid ${C.red}30`,
            borderRadius: 4,
            fontSize: 12,
            color: C.red,
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {cards.map(c => {
              const val = nn(result[c.key]);
              return (
                <div
                  key={c.key}
                  onClick={() => toggleField(c.key)}
                  style={{
                    flex: 1,
                    padding: "8px 6px",
                    borderRadius: 6,
                    border: `1px solid ${selected[c.key] ? c.color : C.border}`,
                    background: selected[c.key] ? `${c.color}10` : C.bg2,
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: c.color,
                      textTransform: "uppercase",
                      marginBottom: 3,
                    }}
                  >
                    {c.label}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: selected[c.key] ? c.color : C.textDim,
                      fontFeatureSettings: "'tnum'",
                    }}
                  >
                    {fmt2(val)}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                    {selected[c.key] ? "selected" : "click to add"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confidence + source */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                fontWeight: 600,
                background:
                  result.confidence === "high"
                    ? `${C.green}18`
                    : result.confidence === "medium"
                      ? `${C.orange}18`
                      : `${C.red}18`,
                color: result.confidence === "high" ? C.green : result.confidence === "medium" ? C.orange : C.red,
              }}
            >
              {(result.confidence || "medium").toUpperCase()}
            </span>
            {result.source && <span style={{ color: C.textDim, lineHeight: 1.4 }}>{result.source}</span>}
          </div>

          {/* Deviation warning: AI vs user historical data */}
          {tradeIndex && (() => {
            const aiTotal = (result.material || 0) + (result.labor || 0) + (result.equipment || 0) + (result.subcontractor || 0);
            const userMedian = parseFloat(tradeIndex.median) || 0;
            if (userMedian <= 0 || aiTotal <= 0) return null;
            const deviation = ((aiTotal - userMedian) / userMedian) * 100;
            if (Math.abs(deviation) < 15) return null;
            const severe = Math.abs(deviation) > 30;
            const warnColor = severe ? C.red : C.orange;
            return (
              <div style={{
                padding: "6px 10px",
                background: `${warnColor}10`,
                border: `1px solid ${warnColor}30`,
                borderRadius: 4,
                fontSize: 11,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}>
                <span style={{ color: warnColor, fontWeight: 600 }}>
                  {deviation > 0 ? "\u25B2" : "\u25BC"} AI is {Math.abs(Math.round(deviation))}% {deviation > 0 ? "above" : "below"} your historical median
                </span>
                <span style={{ color: C.textDim }}>
                  (Your: ${userMedian.toFixed(2)} vs AI: ${aiTotal.toFixed(2)})
                </span>
              </div>
            );
          })()}

          {result.subNote && (
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontStyle: "italic" }}>
              {result.subNote}
            </div>
          )}

          {/* Selected total + apply */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              background: `${C.accent}08`,
              borderRadius: 4,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, color: C.textMuted }}>
              Selected Total:{" "}
              <strong style={{ color: C.accent, fontSize: 14, fontFeatureSettings: "'tnum'" }}>
                {fmt2(selectedTotal)}
              </strong>
            </span>
            <button
              onClick={handleApply}
              style={bt(C, {
                background: C.gradient || C.accent,
                color: "#fff",
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 700,
              })}
            >
              Apply Selected
            </button>
          </div>

          {/* Alternatives */}
          {result.alternatives && result.alternatives.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div
                style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}
              >
                Alternatives
              </div>
              {result.alternatives.map((alt, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 8px",
                    background: C.bg2,
                    borderRadius: 4,
                    marginBottom: 3,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: C.text }}>{alt.name}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: C.textDim, fontFeatureSettings: "'tnum'" }}>
                      {fmt2(nn(alt.material) + nn(alt.labor) + nn(alt.equipment))}
                    </span>
                    <button
                      onClick={() => handleApplyAlt(alt)}
                      style={bt(C, {
                        background: "transparent",
                        border: `1px solid ${C.accent}40`,
                        color: C.accent,
                        padding: "2px 8px",
                        fontSize: 11,
                      })}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DB matches */}
      {dbMatches.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}>
            Database Matches
          </div>
          {dbMatches.map(el => (
            <div
              key={el.id || el.code}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px",
                background: C.bg2,
                borderRadius: 4,
                marginBottom: 3,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: C.purple, fontWeight: 600 }}>{el.code}</span>
                <span style={{ color: C.text, marginLeft: 6 }}>{el.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: C.textDim, fontFeatureSettings: "'tnum'" }}>
                  {fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}
                </span>
                <button
                  onClick={() => handleApplyDb(el)}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.green}40`,
                    color: C.green,
                    padding: "2px 8px",
                    fontSize: 11,
                  })}
                >
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
