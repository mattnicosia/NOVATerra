import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';
import { fmt, fmt2, nn } from '@/utils/format';
import { callAnthropicStream, buildProjectContext } from '@/utils/ai';

export default function BidIntelModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const specs = useSpecsStore(s => s.specs);
  const showToast = useUiStore(s => s.showToast);

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [streaming, setStreaming] = useState(false);

  const totals = getTotals();
  const sf = nn(project.projectSF);
  const costPerSF = sf > 0 ? totals.grand / sf : 0;

  // Quick stats
  const divisions = {};
  items.forEach(it => {
    const div = (it.division || "Unassigned").split(" - ")[0];
    if (!divisions[div]) divisions[div] = { count: 0, total: 0 };
    divisions[div].count++;
    const q = nn(it.quantity);
    divisions[div].total += q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
  });

  const runAnalysis = async () => {
    setLoading(true); setAnalysis(""); setStreaming(true);
    try {
      const context = buildProjectContext({ project, items, takeoffs, specs });
      const fullText = await callAnthropicStream({
        max_tokens: 2500,
        system: `You are a senior estimating director reviewing a bid before submission. You have 25+ years of commercial construction estimating experience and deep knowledge of RS Means cost data and regional pricing.

Your analysis should be direct, actionable, and specific to this project. Reference actual line items, quantities, and costs from the estimate data. Flag anything that looks wrong.`,
        messages: [{ role: "user", content: `Perform a Bid Day Intelligence analysis on this estimate.

${context}

ESTIMATE SUMMARY:
- Grand Total: $${Math.round(totals.grand).toLocaleString()}
- Direct Costs: $${Math.round(totals.direct).toLocaleString()}
- Material: $${Math.round(totals.material).toLocaleString()} | Labor: $${Math.round(totals.labor).toLocaleString()} | Equipment: $${Math.round(totals.equipment).toLocaleString()} | Sub: $${Math.round(totals.sub).toLocaleString()}
- Project SF: ${sf || "Not specified"}
${sf > 0 ? `- Cost/SF: $${costPerSF.toFixed(2)}` : ""}
- Job Type: ${project.jobType || "Not specified"}

Analyze and report:

1. **COST BENCHMARK** — How does $${costPerSF.toFixed(2)}/SF compare to industry averages for this building type? Is it in range, high, or low?

2. **DIVISION ANALYSIS** — Which divisions look over/under-priced vs. typical percentage breakdowns? Flag outliers.

3. **RISK FLAGS** — Any items with $0 pricing, missing quantities, or suspicious unit costs?

4. **SCOPE GAPS** — Based on the spec sections and building type, what scope items might be missing?

5. **BID STRATEGY** — Given the analysis, what's your recommendation? Are we competitive? Where can we tighten?

Be specific — reference actual line items and numbers from the estimate.` }],
        onText: (t) => setAnalysis(t),
      });
      setAnalysis(fullText);
    } catch (err) {
      showToast(`Analysis error: ${err.message}`, "error");
    } finally { setLoading(false); setStreaming(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 900, animation: "backdropFadeIn 250ms ease-out both" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 700, maxWidth: "95vw", maxHeight: "85vh",
        background: C.bg, borderRadius: 12, border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.08)'}`,
        boxShadow: `0 24px 64px rgba(0,0,0,0.3), 0 0 40px rgba(0,0,0,0.15)`, zIndex: 901,
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: `linear-gradient(135deg, ${C.accent}08, ${C.purple || C.accent}08)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple || C.accent})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 8px ${C.accent}30`,
            }}>
              <Ic d={I.ai} size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Bid Day Intelligence</div>
              <div style={{ fontSize: 11, color: C.textDim }}>{project.name} • {fmt(totals.grand)}{sf > 0 ? ` • ${fmt2(costPerSF)}/SF` : ""}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
            <Ic d={I.x} size={18} color={C.textMuted} />
          </button>
        </div>

        {/* Quick Stats Bar */}
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Grand Total", value: fmt(totals.grand), color: C.text },
            { label: "Material", value: fmt(totals.material), color: C.blue },
            { label: "Labor", value: fmt(totals.labor), color: C.green },
            { label: "Equipment", value: fmt(totals.equipment), color: C.orange },
            { label: "Subs", value: fmt(totals.sub), color: C.purple },
            ...(sf > 0 ? [{ label: "Cost/SF", value: fmt2(costPerSF), color: C.accent }] : []),
          ].map((s, i) => (
            <div key={i} style={{ padding: "4px 10px", background: `${s.color}08`, borderRadius: 6, border: `1px solid ${s.color}15` }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: s.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: "'DM Sans',sans-serif" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {!analysis && !loading && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, margin: "0 auto 14px",
                background: `linear-gradient(135deg, ${C.accent}15, ${C.purple || C.accent}15)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Ic d={I.ai} size={28} color={C.accent} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                Ready to analyze your estimate
              </div>
              <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 400, margin: "0 auto 20px" }}>
                AI will benchmark your costs against industry averages, flag pricing outliers, identify scope gaps, and provide bid strategy recommendations.
              </div>
              <button onClick={runAnalysis}
                style={bt(C, {
                  padding: "12px 32px", fontSize: 14, fontWeight: 700,
                  background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple || C.accent})`,
                  color: "#fff", boxShadow: `0 4px 16px ${C.accent}40`,
                })}>
                <Ic d={I.ai} size={16} color="#fff" /> Run Analysis
              </button>
            </div>
          )}

          {(analysis || loading) && (
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {analysis.split("\n").map((line, i) => {
                if (line.startsWith("## ")) return <div key={i} style={{ fontSize: 15, fontWeight: 800, color: C.accent, marginTop: 16, marginBottom: 4 }}>{line.slice(3)}</div>;
                if (line.startsWith("**") && line.endsWith("**")) return <div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 12 }}>{line.replace(/\*\*/g, "")}</div>;
                if (line.startsWith("- ") || line.startsWith("• ")) return (
                  <div key={i} style={{ display: "flex", gap: 6, marginLeft: 8, marginTop: 2 }}>
                    <span style={{ color: C.accent, fontWeight: 700 }}>•</span>
                    <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, `<code style="background:${C.accent}12;padding:1px 4px;border-radius:3px;font-size:0.9em;color:${C.accent}">$1</code>`) }} />
                  </div>
                );
                if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
                return <div key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, `<code style="background:${C.accent}12;padding:1px 4px;border-radius:3px;font-size:0.9em;color:${C.accent}">$1</code>`) }} />;
              })}
              {streaming && <span style={{ display: "inline-block", width: 4, height: 14, background: C.accent, borderRadius: 1, animation: "pulse 0.8s infinite", verticalAlign: "text-bottom", marginLeft: 2 }} />}
            </div>
          )}
        </div>

        {/* Footer */}
        {analysis && !loading && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { navigator.clipboard.writeText(analysis); showToast("Analysis copied"); }}
              style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 14px", fontSize: 11 })}>
              <Ic d={I.copy} size={11} /> Copy
            </button>
            <button onClick={runAnalysis}
              style={bt(C, { background: C.accent, color: "#fff", padding: "6px 14px", fontSize: 11, fontWeight: 600 })}>
              <Ic d={I.refresh} size={11} color="#fff" /> Re-analyze
            </button>
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </>
  );
}
