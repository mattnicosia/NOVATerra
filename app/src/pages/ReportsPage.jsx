import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore, DEFAULT_MARKUP_ORDER } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAlternatesStore } from '@/stores/alternatesStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useReportsStore } from '@/stores/reportsStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import Sec from '@/components/shared/Sec';
import SumRow from '@/components/shared/SumRow';
import { bt } from '@/utils/styles';
import { nn, fmt, fmt2, pct, today } from '@/utils/format';
import ProposalSection from '@/components/proposal/ProposalSection';
import ProposalBuilder from '@/components/proposal/ProposalBuilder';
import { getTradeLabel, getTradeSortOrder } from '@/constants/tradeGroupings';
import SendProposalModal from '@/components/reports/SendProposalModal';
import { exportEstimateXlsx } from '@/utils/exportXlsx';
import { buildProposalStyles, loadProposalFont } from '@/constants/proposalStyles';

export default function ReportsPage() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const markup = useItemsStore(s => s.markup);
  const markupOrder = useItemsStore(s => s.markupOrder) || DEFAULT_MARKUP_ORDER;
  const customMarkups = useItemsStore(s => s.customMarkups);
  const changeOrders = useItemsStore(s => s.changeOrders);
  const project = useProjectStore(s => s.project);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const activeCodes = getActiveCodes();
  const alternates = useAlternatesStore(s => s.alternates);
  const exclusions = useSpecsStore(s => s.exclusions);
  const clarifications = useSpecsStore(s => s.clarifications);
  const masterData = useMasterDataStore(s => s.masterData);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const reportType = useReportsStore(s => s.reportType);
  const setReportType = useReportsStore(s => s.setReportType);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const sectionOrder = useReportsStore(s => s.sectionOrder);
  const sectionVisibility = useReportsStore(s => s.sectionVisibility);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const sovMode = useReportsStore(s => s.sovMode);
  const setSovMode = useReportsStore(s => s.setSovMode);
  const sovSort = useReportsStore(s => s.sovSort);
  const setSovSort = useReportsStore(s => s.setSovSort);
  const proposalDesign = useReportsStore(s => s.proposalDesign);

  // Build proposal design system from user preferences
  const PS = useMemo(() => buildProposalStyles(proposalDesign), [proposalDesign]);

  // Load the selected Google Font when it changes
  useEffect(() => {
    loadProposalFont(proposalDesign.fontId);
  }, [proposalDesign.fontId]);

  // Resolve company info: project-selected profile or default
  const companyInfo = getCompanyInfo(project.companyProfileId);

  // Totals computation — ordered markup with per-item compound
  const totals = useMemo(() => {
    let material = 0, labor = 0, equipment = 0, sub = 0;
    items.forEach(it => {
      const q = nn(it.quantity);
      material += q * nn(it.material); labor += q * nn(it.labor);
      equipment += q * nn(it.equipment); sub += q * nn(it.subcontractor);
    });
    const direct = material + labor + equipment + sub;

    // Ordered markup calculation
    let running = direct;
    const markupAmounts = {};
    markupOrder.forEach(mo => {
      const pct = nn(markup[mo.key]);
      if (pct === 0) { markupAmounts[mo.key] = 0; return; }
      const base = mo.compound ? running : direct;
      const amt = base * pct / 100;
      markupAmounts[mo.key] = amt;
      running += amt;
    });
    const subtotal = running;

    let afterCustom = subtotal;
    const customAmounts = customMarkups.map(cm => {
      let amt = 0;
      if (cm.type === "pct") { amt = afterCustom * nn(cm.value) / 100; afterCustom += amt; }
      else { amt = nn(cm.value); afterCustom += amt; }
      return { id: cm.id, label: cm.label, type: cm.type, value: cm.value, amount: amt };
    });
    const customTotal = customAmounts.reduce((s, a) => s + a.amount, 0);
    const bd = afterCustom * nn(markup.bond) / 100;
    const tx = (afterCustom + bd) * nn(markup.tax) / 100;
    const grand = afterCustom + bd + tx;
    const coT = changeOrders.reduce((s, co) => s + nn(co.amount), 0);
    const revised = grand + coT;
    return { material, labor, equipment, sub, direct, markupAmounts, subtotal, customAmounts, customTotal, afterCustom, bd, tx, grand, coT, revised };
  }, [items, markup, markupOrder, customMarkups, changeOrders]);

  // Division breakdown — normalize raw codes to "XX - Name" format
  const { usedDivisions, divTotals } = useMemo(() => {
    const dt = {};
    items.forEach(it => {
      const raw = it.division || "Unassigned";
      const div = raw.includes(" - ") ? raw : (divFromCode(raw) || raw);
      if (!dt[div]) dt[div] = { total: 0, count: 0 };
      const q = nn(it.quantity);
      dt[div].total += q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
      dt[div].count++;
    });
    const used = Object.keys(dt).sort();
    return { usedDivisions: used, divTotals: dt };
  }, [items, divFromCode]);

  // Trade breakdown
  const tradeBreakdown = useMemo(() => {
    const trades = {};
    items.forEach(it => {
      const label = getTradeLabel(it);
      const sort = getTradeSortOrder(it);
      if (!trades[label]) trades[label] = { total: 0, count: 0, sort };
      const q = nn(it.quantity);
      trades[label].total += q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
      trades[label].count++;
    });
    return Object.entries(trades)
      .sort(([, a], [, b]) => a.sort - b.sort)
      .map(([label, data]) => ({ label, ...data }));
  }, [items]);

  // Allowance items
  const allowanceItems = useMemo(() => items.filter(it => it.allowanceOf), [items]);
  const allowanceGrandTotal = useMemo(() => allowanceItems.reduce((s, it) => {
    const q = nn(it.quantity);
    const col = it.allowanceOf;
    return s + q * nn(it[col]);
  }, 0), [allowanceItems]);

  const generateAllowanceNote = (item) => {
    const col = item.allowanceOf;
    const amt = nn(item[col]) * nn(item.quantity);
    return `${item.description}: $${fmt2(amt).replace("$", "")} allowance for ${col} (${item.quantity} ${item.unit})`;
  };

  const getTotal = (item) => {
    const q = nn(item.quantity);
    return q * (nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor));
  };

  const exportCSV = () => {
    const rows = [["Division", "Code", "Description", "Qty", "Unit", "Material", "Labor", "Equipment", "Subcontractor", "Total"]];
    items.forEach(it => {
      rows.push([it.division, it.code, it.description, it.quantity, it.unit, nn(it.material), nn(it.labor), nn(it.equipment), nn(it.subcontractor), getTotal(it)]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.name || "estimate"}_export.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF download handler ──
  // ── PDF generation (shared by download + preview) ──
  const buildPDF = async (mode = "save") => {
    const el = document.getElementById("proposal-print");
    if (!el) return null;
    const { proposalDesign: pd } = useReportsStore.getState();
    const isLandscape = pd?.orientation === "landscape";

    // Hide no-print elements before html2pdf capture
    const noPrintEls = el.querySelectorAll(".no-print");
    noPrintEls.forEach(e => (e._prevDisplay = e.style.display, e.style.display = "none"));

    const html2pdf = (await import("html2pdf.js")).default;
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Proposal_${(project.projectName || project.name || "Project").replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: {
        unit: "mm",
        format: isLandscape ? [279, 216] : "letter",
        orientation: isLandscape ? "landscape" : "portrait",
      },
      pagebreak: { mode: ["css", "legacy"] },
    };

    let result = null;
    if (mode === "save") {
      await html2pdf().set(opt).from(el).save();
    } else if (mode === "blob") {
      result = await html2pdf().set(opt).from(el).outputPdf("blob");
    }

    // Restore no-print elements
    noPrintEls.forEach(e => (e.style.display = e._prevDisplay || ""));
    return result;
  };

  const handleDownloadPDF = () => buildPDF("save");

  const [previewUrl, setPreviewUrl] = useState(null);
  const handlePreviewPDF = async () => {
    const blob = await buildPDF("blob");
    if (blob) {
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    }
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }}>
      {/* Print-only logo header — repeats on every printed page via position:fixed */}
      {reportType !== "sov" && (
        <div className="print-header" style={{ display: "none" }}>
          {companyInfo?.logo ? (
            <img src={companyInfo.logo} alt="" />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", fontFamily: T.font.sans }}>{companyInfo?.name || ""}</div>
          )}
        </div>
      )}
      <div style={{ maxWidth: 1000 }}>
        {/* Report tabs */}
        <div className="no-print" style={{ display: "inline-flex", gap: 0, marginBottom: T.space[4], background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
          {[{ k: "proposal", l: "Proposal" }, { k: "bidForm", l: "Bid Form" }].map(tab => (
            <button key={tab.k} onClick={() => setReportType(tab.k)}
              style={bt(C, { background: reportType === tab.k ? C.accent : "transparent", color: reportType === tab.k ? "#fff" : C.textMuted, padding: "6px 14px", fontSize: 11, border: "none", borderRadius: T.radius.sm })}>{tab.l}</button>
          ))}
        </div>

        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "flex-end" }}>
          <button className="accent-btn" onClick={handlePreviewPDF} style={bt(C, { background: C.accent, color: "#fff", padding: "7px 14px", fontSize: 11 })}>
            <Ic d={I.eye || I.search} size={13} color="#fff" sw={1.5} /> Preview PDF
          </button>
          <button className="accent-btn" onClick={handleDownloadPDF} style={bt(C, { background: C.blue, color: "#fff", padding: "7px 14px", fontSize: 11 })}>
            <Ic d={I.download} size={13} color="#fff" sw={1.5} /> Download PDF
          </button>
          <button className="accent-btn" onClick={() => {
            const totals = useItemsStore.getState().getTotals();
            exportEstimateXlsx(project, items, totals, markup);
          }} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "7px 14px", fontSize: 11 })}>
            <Ic d={I.download} size={13} color={C.textMuted} sw={1.5} /> XLSX
          </button>
          {(reportType === "proposal" || reportType === "sov") && (
            <button className="accent-btn" onClick={() => setSendModalOpen(true)} style={bt(C, { background: C.green, color: "#fff", padding: "7px 14px", fontSize: 11 })}>
              <Ic d={I.send} size={13} color="#fff" sw={1.5} /> Email
            </button>
          )}
        </div>

        {/* PDF Preview Modal */}
        {previewUrl && (
          <div
            onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
            style={{
              position: "fixed", inset: 0, zIndex: 10000,
              background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: "90%", maxWidth: 900, height: "90vh", background: "#fff", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>PDF Preview</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleDownloadPDF} style={bt(C, { background: C.blue, color: "#fff", padding: "5px 12px", fontSize: 11 })}>Download</button>
                  <button onClick={() => setSendModalOpen(true)} style={bt(C, { background: C.green, color: "#fff", padding: "5px 12px", fontSize: 11 })}>Email</button>
                  <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "5px 12px", fontSize: 11 })}>Close</button>
                </div>
              </div>
              <iframe src={previewUrl} style={{ flex: 1, border: "none", width: "100%" }} title="PDF Preview" />
            </div>
          </div>
        )}

        {/* COST SUMMARY */}
        {reportType === "summary" && (<>
          <Sec title="Cost Summary">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["Materials", totals.material], ["Labor", totals.labor], ["Equipment", totals.equipment], ["Subcontractors", totals.sub]].map(([l, v]) => <SumRow key={l} label={l} value={fmt(v)} />)}
              <SumRow label="Direct Cost" value={fmt(totals.direct)} bold border />
              {markupOrder.map(mo => {
                const amt = totals.markupAmounts[mo.key];
                if (amt === 0 && nn(markup[mo.key]) === 0) return null;
                return <SumRow key={mo.key} label={`${mo.label} (${markup[mo.key]}%)${mo.compound ? " \u2605" : ""}`} value={fmt(amt)} />;
              })}
              {markupOrder.some(mo => mo.compound) && <div style={{ fontSize: 9, color: C.textDim, fontStyle: "italic", padding: "2px 0" }}>{"\u2605"} Compounded (calculated on running subtotal)</div>}
              <SumRow label="Subtotal" value={fmt(totals.subtotal)} border />
              {totals.customAmounts?.filter(ca => ca.amount !== 0).map(ca => <SumRow key={ca.id} label={`${ca.label || "Custom"} (${ca.type === "pct" ? ca.value + "%" : "$" + ca.value})`} value={fmt(ca.amount)} />)}
              {totals.customTotal !== 0 && <SumRow label="After Custom Markups" value={fmt(totals.afterCustom)} border />}
              {nn(markup.bond) > 0 && <SumRow label={`Bond (${markup.bond}%)`} value={fmt(totals.bd)} />}
              <SumRow label={`Tax (${markup.tax}%)`} value={fmt(totals.tx)} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 6px", borderTop: `2px solid ${C.accent}`, marginTop: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>GRAND TOTAL</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.accent, fontFamily: T.font.mono }}>{fmt(totals.grand)}</span>
              </div>
              {totals.coT !== 0 && (<>
                <SumRow label={`Change Orders (${changeOrders.length})`} value={fmt(totals.coT)} color={totals.coT > 0 ? C.red : C.green} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.purple }}>REVISED TOTAL</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.purple, fontFamily: T.font.mono }}>{fmt(totals.revised)}</span>
                </div>
              </>)}
            </div>
          </Sec>
          <Sec title="Trade Bundle Breakdown">
            {tradeBreakdown.map(trade => {
              const p = totals.direct > 0 ? (trade.total / totals.direct * 100) : 0;
              return (
                <div key={trade.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.bg}` }}>
                  <div style={{ width: 220, minWidth: 120 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{trade.label}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{trade.count} items</div>
                  </div>
                  <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(p, 0.5)}%`, background: `linear-gradient(90deg,${C.accent},${C.accentDim})`, borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 50, textAlign: "right", fontFamily: T.font.mono, fontSize: 11, color: C.textMuted }}>{pct(p)}</div>
                  <div style={{ width: 100, textAlign: "right", fontFamily: T.font.mono, fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(trade.total)}</div>
                </div>
              );
            })}
          </Sec>
          {nn(project.projectSF) > 0 && (
            <div style={{ padding: "10px 14px", background: C.bg1, borderRadius: T.radius.sm, border: `1px solid ${C.border}`, marginTop: 8, boxShadow: T.shadow.sm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>Cost per SF ({project.projectSF} SF)</span>
                <span style={{ fontFamily: T.font.mono, fontSize: 14, fontWeight: 700, color: C.accent }}>{fmt2(totals.grand / nn(project.projectSF))}/SF</span>
              </div>
            </div>
          )}
        </>)}

        {/* SCHEDULE OF VALUES */}
        {reportType === "sov" && (() => {
          // Font stacks from design tokens
          const sovFont = T.font.sans;
          const sovMono = T.font.mono;

          // Compute total markup multiplier for "wrapped" mode
          // For wrapped mode, we compute the effective multiplier from direct to grand
          const wrappedMultiplier = totals.direct > 0 ? totals.grand / totals.direct : 1;
          const customFixed = customMarkups.filter(cm => cm.type !== "pct").reduce((s, cm) => s + nn(cm.value), 0);

          // Build markup rows in order (only non-zero)
          const markupRows = [];
          markupOrder.forEach(mo => {
            const amt = totals.markupAmounts[mo.key];
            if (nn(markup[mo.key]) > 0) markupRows.push({ label: `${mo.label} (${markup[mo.key]}%)${mo.compound ? " ★" : ""}`, value: amt });
          });
          (totals.customAmounts || []).filter(ca => ca.amount !== 0).forEach(ca => {
            markupRows.push({ label: `${ca.label || "Custom"} (${ca.type === "pct" ? ca.value + "%" : "$" + ca.value})`, value: ca.amount });
          });
          if (nn(markup.bond) > 0) markupRows.push({ label: `Bond (${markup.bond}%)`, value: totals.bd });
          if (nn(markup.tax) > 0) markupRows.push({ label: `Tax (${markup.tax}%)`, value: totals.tx });

          // Build SOV rows based on sort mode
          let sovRows = [];
          let rowNum = 0;
          if (sovSort === "trade") {
            tradeBreakdown.forEach(trade => {
              rowNum++;
              const value = sovMode === "wrapped" ? trade.total * wrappedMultiplier + (totals.direct > 0 ? customFixed * (trade.total / totals.direct) : 0) : trade.total;
              sovRows.push({ num: rowNum, label: trade.label, value });
            });
          } else if (sovSort === "subdivision") {
            // Group by subdivision cost code (e.g. "03.31")
            const subGroups = {};
            items.forEach(item => {
              const code = item.code || "";
              const sk = code.includes(".") ? code.split(".").slice(0, 2).join(".") : (item.division || "Unassigned").split(" - ")[0] || "00";
              const subKey = sk.includes(".") ? sk : `${sk}.00`;
              if (!subGroups[subKey]) subGroups[subKey] = { total: 0 };
              const q = nn(item.quantity);
              subGroups[subKey].total += q * (nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor));
            });
            Object.entries(subGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([sk, data]) => {
              if (data.total === 0) return;
              rowNum++;
              const dc = sk.split(".")[0];
              const subName = activeCodes[dc]?.subs?.[sk] || "";
              const label = `${sk} ${subName}`.trim();
              const value = sovMode === "wrapped" ? data.total * wrappedMultiplier + (totals.direct > 0 ? customFixed * (data.total / totals.direct) : 0) : data.total;
              sovRows.push({ num: rowNum, label, value });
            });
          } else {
            usedDivisions.forEach(div => {
              const dt = divTotals[div]; if (!dt) return;
              rowNum++;
              const value = sovMode === "wrapped" ? dt.total * wrappedMultiplier + (totals.direct > 0 ? customFixed * (dt.total / totals.direct) : 0) : dt.total;
              sovRows.push({ num: rowNum, label: div, value });
            });
          }

          // Logo header component for print
          const LogoHeader = () => (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 14, borderBottom: "2px solid #1a1a2e" }}>
              <div>
                {companyInfo?.logo ? (
                  <img src={companyInfo.logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 180, marginBottom: 4 }} />
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", letterSpacing: 0.5, fontFamily: sovFont }}>{companyInfo?.name || "YOUR COMPANY"}</div>
                )}
                <div style={{ fontSize: 9, color: "#888", fontFamily: sovFont }}>{companyInfo?.address}{companyInfo?.city ? `, ${companyInfo.city}` : ""}{companyInfo?.state ? `, ${companyInfo.state}` : ""} {companyInfo?.zip || ""}</div>
                <div style={{ fontSize: 9, color: "#888", fontFamily: sovFont }}>{companyInfo?.phone}{companyInfo?.email ? ` \u2022 ${companyInfo.email}` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: "#1a1a2e", fontFamily: sovFont }}>SCHEDULE OF VALUES</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2, fontFamily: sovFont }}>{project.date || today()}</div>
              </div>
            </div>
          );

          return (
            <div>
              {/* Controls (no-print) */}
              <div className="no-print" style={{ display: "flex", gap: T.space[4], marginBottom: T.space[3], alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: T.space[2], alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Markups:</span>
                  <div style={{ display: "inline-flex", gap: 0, background: C.bg2, borderRadius: T.radius.sm, padding: 2 }}>
                    {[{ k: "below", l: "Separate" }, { k: "wrapped", l: "Wrapped In" }].map(m => (
                      <button key={m.k} onClick={() => setSovMode(m.k)}
                        style={bt(C, { background: sovMode === m.k ? C.accent : "transparent", color: sovMode === m.k ? "#fff" : C.textMuted, padding: "4px 12px", fontSize: 10, border: "none", borderRadius: T.radius.sm - 1 })}>{m.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: T.space[2], alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Group by:</span>
                  <div style={{ display: "inline-flex", gap: 0, background: C.bg2, borderRadius: T.radius.sm, padding: 2 }}>
                    {[{ k: "trade", l: "Trade Bundle" }, { k: "division", l: "Division" }, { k: "subdivision", l: "Subdivision" }].map(m => (
                      <button key={m.k} onClick={() => setSovSort(m.k)}
                        style={bt(C, { background: sovSort === m.k ? C.accent : "transparent", color: sovSort === m.k ? "#fff" : C.textMuted, padding: "4px 12px", fontSize: 10, border: "none", borderRadius: T.radius.sm - 1 })}>{m.l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Document */}
              <div className="sov-doc" style={{ background: "#fff", color: "#1a1a2e", padding: "36px 44px", borderRadius: T.radius.lg, border: `1px solid ${C.border}`, fontFamily: sovFont, boxShadow: T.shadow.lg, lineHeight: 1.5 }}>
                <table className="sov-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  {/* Repeating header on every printed page */}
                  <thead className="sov-thead">
                    <tr><td colSpan={3} style={{ padding: 0 }}>
                      <LogoHeader />
                      {/* Project info */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{project.name || "[Project Name]"}</div>
                        {project.address && <div style={{ fontSize: 10, color: "#888" }}>{project.address}</div>}
                        {project.client && <div style={{ fontSize: 10, color: "#888" }}>Owner: {project.client}</div>}
                      </div>
                      {/* Column headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, paddingBottom: 8, marginBottom: 2, borderBottom: "1.5px solid #1a1a2e", fontSize: 9, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: sovFont }}>
                        <span>No.</span>
                        <span>Description of Work</span>
                        <span style={{ textAlign: "right" }}>Scheduled Value</span>
                      </div>
                    </td></tr>
                  </thead>
                  <tbody className="sov-tbody">
                    {/* SOV line items */}
                    {sovRows.map((row, i) => (
                      <tr key={i} className="sov-row"><td colSpan={3} style={{ padding: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee", alignItems: "center" }}>
                          <span style={{ fontFamily: sovMono, fontSize: 10, color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{String(row.num).padStart(3, "0")}</span>
                          <div>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "#222", fontFamily: sovFont }}>{row.label}</span>
                            {row.sublabel && <span style={{ fontSize: 9, color: "#aaa", marginLeft: 8, fontFamily: sovFont }}>{row.sublabel}</span>}
                          </div>
                          <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 12, fontWeight: 600, color: "#222", fontVariantNumeric: "tabular-nums" }}>{fmt(row.value)}</span>
                        </div>
                      </td></tr>
                    ))}

                    {/* Subtotal before markups (Separate mode only) */}
                    {sovMode === "below" && (
                      <tr className="sov-row"><td colSpan={3} style={{ padding: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "10px 0 8px", borderTop: "1.5px solid #ccc", marginTop: 2 }}>
                          <span />
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#444", fontFamily: sovFont }}>SUBTOTAL (Direct Cost)</span>
                          <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 13, fontWeight: 700, color: "#444", fontVariantNumeric: "tabular-nums" }}>{fmt(totals.direct)}</span>
                        </div>
                      </td></tr>
                    )}

                    {/* Markup rows (Separate mode, only non-zero) */}
                    {sovMode === "below" && markupRows.map((mr, i) => (
                      <tr key={`m${i}`} className="sov-row"><td colSpan={3} style={{ padding: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "6px 0", borderBottom: "1px solid #f5f5f5", alignItems: "center" }}>
                          <span />
                          <span style={{ fontSize: 11, color: "#777", fontStyle: "italic", fontFamily: sovFont }}>{mr.label}</span>
                          <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 11, fontWeight: 500, color: "#555", fontVariantNumeric: "tabular-nums" }}>{fmt(mr.value)}</span>
                        </div>
                      </td></tr>
                    ))}

                    {/* Grand Total */}
                    <tr className="sov-row"><td colSpan={3} style={{ padding: 0 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "14px 0 8px", borderTop: "2.5px solid #1a1a2e", marginTop: 6 }}>
                        <span />
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e", fontFamily: sovFont }}>TOTAL CONTRACT SUM</span>
                        <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 16, fontWeight: 800, color: "#1a1a2e", fontVariantNumeric: "tabular-nums" }}>{fmt(totals.grand)}</span>
                      </div>
                    </td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* PROPOSAL LETTER */}
        {reportType === "proposal" && (() => {
          const proposalData = { project, masterData, companyInfo, totals, usedDivisions, divTotals, alternates, exclusions, clarifications, allowanceItems, allowanceGrandTotal, generateAllowanceNote, activeEstimateId, items, T, C };
          const conditionalEmpty = {
            alternates: alternates.length === 0,
            exclusions: exclusions.length === 0,
            allowances: allowanceItems.length === 0,
            clarifications: clarifications.length === 0,
          };
          const visibleSections = sectionOrder
            .filter(id => sectionVisibility[id])
            .filter(id => !conditionalEmpty[id]);
          let sectionCounter = 0;
          const NUMBERED_SECTIONS = new Set(["scope", "baseBid", "sov", "alternates", "exclusions", "allowances", "clarifications", "qualifications", "acceptance"]);
          return (
            <div style={{ display: "flex", gap: 0 }}>
              <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
                <div id="proposal-print" style={{ position: "relative", background: "#fff", color: "#1a1a2e", padding: PS.page.padding, maxWidth: PS.page.maxWidth, width: "100%", borderRadius: T.radius.lg, border: `1px solid ${C.border}`, fontFamily: PS.font.body, lineHeight: 1.6, boxShadow: T.shadow.lg, ...(proposalDesign.orientation === "landscape" ? { maxWidth: "none" } : {}) }}>
                  {/* Draft watermark overlay */}
                  {proposalDesign.showDraftWatermark && (
                    <div style={{
                      position: "absolute", top: "50%", left: "50%",
                      transform: "translate(-50%, -50%) rotate(-35deg)",
                      fontSize: 80, fontWeight: 900, color: "#00000008",
                      letterSpacing: 20, pointerEvents: "none", userSelect: "none",
                      zIndex: 0, whiteSpace: "nowrap",
                    }}>
                      DRAFT
                    </div>
                  )}
                  {/* Accent bar */}
                  {proposalDesign.showAccentBar && (
                    <div style={PS.section.accentBar} />
                  )}
                  {visibleSections.map((id, visIdx) => {
                    // Track section number — only increment for sections that display a numbered header
                    const isSpecial = id.startsWith("pageBreak_") || id.startsWith("spacer_") || id.startsWith("doc_");
                    if (!isSpecial && NUMBERED_SECTIONS.has(id)) sectionCounter++;
                    const sectionNumber = (!isSpecial && proposalDesign.showSectionNumbers && NUMBERED_SECTIONS.has(id)) ? sectionCounter : null;

                    // Auto page break before major sections (skip first section and non-numbered sections)
                    const AUTO_BREAK_SECTIONS = new Set(["scope", "baseBid", "sov", "qualifications", "acceptance"]);
                    const shouldBreak = visIdx > 0 && !isSpecial && AUTO_BREAK_SECTIONS.has(id);

                    // Insert project summary card after letterhead
                    const showSummaryHere = id === "letterhead" && proposalDesign.showProjectSummary;
                    return (
                      <div key={id} style={shouldBreak ? { pageBreakBefore: "always" } : undefined}>
                        <ProposalSection sectionId={id} data={proposalData} proposalStyles={PS} sectionNumber={sectionNumber} />
                        {showSummaryHere && (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr 1fr",
                            gap: 12,
                            padding: "12px 16px",
                            background: PS.color.bgSubtle,
                            border: `1px solid ${PS.color.borderLight}`,
                            borderRadius: 4,
                            marginBottom: PS.space.section,
                            ...PS.type.caption,
                            fontFamily: PS.font.body,
                          }}>
                            <div><span style={{ color: PS.color.textMuted, ...PS.type.label }}>Project</span><br/>{project?.projectName || project?.name || "\u2014"}</div>
                            <div><span style={{ color: PS.color.textMuted, ...PS.type.label }}>Client</span><br/>{project?.client || "\u2014"}</div>
                            <div><span style={{ color: PS.color.textMuted, ...PS.type.label }}>Size</span><br/>{project?.projectSF ? `${Number(project.projectSF).toLocaleString()} SF` : "\u2014"}</div>
                            <div><span style={{ color: PS.color.textMuted, ...PS.type.label }}>Bid Date</span><br/>{project?.bidDate || "\u2014"}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Proposal footer */}
                  {proposalDesign.showPageNumbers && (
                    <div className="proposal-footer" style={{
                      ...PS.footer,
                      marginTop: PS.space.xl,
                      display: "flex",
                      justifyContent: "space-between",
                    }}>
                      <span>{companyInfo?.name || ""}</span>
                      <span>{project?.name || ""} {project?.client ? `\u2022 ${project.client}` : ""}</span>
                      <span>Confidential</span>
                    </div>
                  )}
                </div>
              </div>
              <ProposalBuilder conditionalEmpty={conditionalEmpty} />
            </div>
          );
        })()}

        {/* BID FORM */}
        {reportType === "bidForm" && (
          <div className="report-doc" style={{ background: "#fff", color: "#1a1a2e", padding: "40px 48px", borderRadius: T.radius.lg, border: `1px solid ${C.border}`, fontFamily: T.font.sans, boxShadow: T.shadow.lg, lineHeight: 1.5 }}>
            {/* Letterhead — matching SOV professional style */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 14, borderBottom: "2px solid #1a1a2e" }}>
              <div>
                {companyInfo?.logo ? (
                  <img src={companyInfo.logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 180, marginBottom: 4 }} />
                ) : (
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", letterSpacing: 0.5 }}>{companyInfo?.name || "YOUR COMPANY"}</div>
                )}
                <div style={{ fontSize: 9, color: "#888" }}>{companyInfo?.address}{companyInfo?.city ? `, ${companyInfo.city}` : ""}{companyInfo?.state ? `, ${companyInfo.state}` : ""} {companyInfo?.zip || ""}</div>
                <div style={{ fontSize: 9, color: "#888" }}>{companyInfo?.phone}{companyInfo?.email ? ` \u2022 ${companyInfo.email}` : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: "#1a1a2e" }}>BID FORM</div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{new Date().toLocaleDateString()}</div>
              </div>
            </div>

            {/* Project info */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#222" }}>{project.name || "[Project Name]"}</div>
              {project.address && <div style={{ fontSize: 10, color: "#888" }}>{project.address}</div>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div><div style={{ fontSize: 9, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>From</div><div style={{ fontSize: 12, fontWeight: 600 }}>{companyInfo?.name || "[Your Company]"}</div><div style={{ fontSize: 10, color: "#666" }}>{companyInfo?.address} {companyInfo?.city}, {companyInfo?.state} {companyInfo?.zip}</div></div>
              <div><div style={{ fontSize: 9, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>To</div><div style={{ fontSize: 12, fontWeight: 600 }}>{project.client || "[Owner/Client]"}</div><div style={{ fontSize: 10, color: "#666" }}>{project.architect ? `Architect: ${project.architect}` : ""}</div></div>
            </div>

            <div style={{ fontSize: 11, marginBottom: 16, color: "#444", lineHeight: 1.6 }}>
              Having examined the plans, specifications, and addenda for the above project, the undersigned proposes to furnish all labor, materials, and equipment required for the complete performance of the work as follows:
            </div>

            {/* Base Bid — dark gradient accent */}
            <div style={{ padding: "18px 24px", background: "linear-gradient(135deg, #1a1a2e, #2d2b55)", borderRadius: 6, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 1, textTransform: "uppercase" }}>Base Bid</div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.font.mono, color: "#fff" }}>{fmt(totals.grand)}</div>
            </div>

            {/* Alternates with accent border */}
            {alternates.map((alt, i) => {
              const t = alt.items.reduce((s, ai) => (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * nn(ai.quantity) + s, 0);
              return (
                <div key={alt.id} style={{ padding: "12px 20px", background: "#fafafa", borderRadius: 4, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "3px solid #1a1a2e" }}>
                  <div><div style={{ fontSize: 11, fontWeight: 600 }}>Alternate #{i + 1}: {alt.name}</div><div style={{ fontSize: 10, color: "#666" }}>{alt.description} ({alt.type})</div></div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.mono }}>{alt.type === "deduct" ? "\u2212" : "+"}{fmt(t)}</div>
                </div>
              );
            })}

            {/* Addenda + Time of Completion */}
            <div style={{ marginTop: 16, padding: "12px 20px", border: "1px solid #ddd", borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Addenda Acknowledged</div>
              <div style={{ fontSize: 11, color: "#666" }}>No. _______ through No. _______</div>
            </div>
            <div style={{ marginTop: 12, padding: "12px 20px", border: "1px solid #ddd", borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Time of Completion</div>
              <div style={{ fontSize: 11, color: "#666" }}>_____ calendar days from Notice to Proceed</div>
            </div>

            {/* Professional attestation + signature block */}
            <div style={{ marginTop: 24, padding: "16px 20px", background: "#fafafa", borderRadius: 4, border: "1px solid #eee" }}>
              <div style={{ fontSize: 10, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>
                The undersigned hereby certifies that this bid is submitted in good faith, without collusion or fraud, and that the bidder has carefully examined the contract documents and site conditions. This bid shall remain valid for a period of sixty (60) days from the date of submission.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div><div style={{ borderBottom: "1px solid #999", height: 30 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Company Name</div></div>
                <div><div style={{ borderBottom: "1px solid #999", height: 30 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Date</div></div>
                <div><div style={{ borderBottom: "1px solid #999", height: 30 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Authorized Signature</div></div>
                <div><div style={{ borderBottom: "1px solid #999", height: 30 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Printed Name & Title</div></div>
              </div>
            </div>
          </div>
        )}

        {/* DETAILED ESTIMATE */}
        {reportType === "detailed" && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: C.textMuted }}>Print-ready line-item breakdown by CSI division. All quantities, unit prices, and extensions shown.</div>
            {usedDivisions.map(div => {
              const divItems = items.filter(i => {
                const raw = i.division || "Unassigned";
                const norm = raw.includes(" - ") ? raw : (divFromCode(raw) || raw);
                return norm === div;
              }); if (divItems.length === 0) return null;
              const dt = divTotals[div];
              return (
                <Sec key={div} title={`${div}`} compact>
                  {/* Division summary line */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${C.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
                    <span style={{ fontSize: 10, color: C.textDim }}>{divItems.length} item{divItems.length !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 12, fontWeight: T.fontWeight.bold, fontFamily: T.font.mono, color: C.text }}>{fmt(dt?.total || 0)}</span>
                  </div>
                  {/* Column headers — lighter weight */}
                  <div style={{ display: "grid", gridTemplateColumns: "60px 2fr .5fr .4fr .7fr .7fr .7fr .7fr .8fr", gap: 6, marginBottom: 4, padding: "0 4px", fontSize: 8, fontWeight: T.fontWeight.medium, color: C.textDim, textTransform: "uppercase", letterSpacing: T.tracking.wider }}>
                    <span>Code</span><span>Description</span><span style={{ textAlign: "right" }}>Qty</span><span>Unit</span><span style={{ textAlign: "right" }}>Matl</span><span style={{ textAlign: "right" }}>Labor</span><span style={{ textAlign: "right" }}>Equip</span><span style={{ textAlign: "right" }}>Sub</span><span style={{ textAlign: "right" }}>Total</span>
                  </div>
                  {/* Item rows — breathing room + alternating */}
                  {divItems.map((item, idx) => {
                    const q = nn(item.quantity);
                    const t = getTotal(item);
                    const isOdd = idx % 2 === 1;
                    return (
                      <div key={item.id} style={{ display: "grid", gridTemplateColumns: "60px 2fr .5fr .4fr .7fr .7fr .7fr .7fr .8fr", gap: 6, padding: "8px 4px", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", fontSize: 11, background: isOdd ? (C.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.018)') : "transparent", borderRadius: 2 }}>
                        <span style={{ fontFamily: T.font.mono, fontSize: 9, color: C.purple }}>{item.code}</span>
                        <span style={{ color: C.text }}>{item.description}</span>
                        <span style={{ textAlign: "right", fontFamily: T.font.mono }}>{q}</span>
                        <span style={{ color: C.textDim, fontSize: 10 }}>{item.unit}</span>
                        <span style={{ textAlign: "right", fontFamily: T.font.mono, color: C.textMuted }}>{nn(item.material) ? fmt2(nn(item.material)) : ""}</span>
                        <span style={{ textAlign: "right", fontFamily: T.font.mono, color: C.textMuted }}>{nn(item.labor) ? fmt2(nn(item.labor)) : ""}</span>
                        <span style={{ textAlign: "right", fontFamily: T.font.mono, color: C.textMuted }}>{nn(item.equipment) ? fmt2(nn(item.equipment)) : ""}</span>
                        <span style={{ textAlign: "right", fontFamily: T.font.mono, color: C.textMuted }}>{nn(item.subcontractor) ? fmt2(nn(item.subcontractor)) : ""}</span>
                        <span style={{ textAlign: "right", fontWeight: T.fontWeight.semibold, fontFamily: T.font.mono, color: C.text }}>{fmt(t)}</span>
                      </div>
                    );
                  })}
                  {/* Division subtotal */}
                  <div style={{ display: "grid", gridTemplateColumns: "60px 2fr .5fr .4fr .7fr .7fr .7fr .7fr .8fr", gap: 6, padding: "10px 4px 6px", borderTop: `1.5px solid ${C.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, marginTop: 4 }}>
                    <span /><span style={{ fontSize: 10, fontWeight: T.fontWeight.semibold, color: C.textDim }}>Subtotal</span>
                    <span /><span /><span /><span /><span /><span />
                    <span style={{ textAlign: "right", fontFamily: T.font.mono, fontWeight: T.fontWeight.bold, fontSize: 12, color: C.text }}>{fmt(dt?.total || 0)}</span>
                  </div>
                </Sec>
              );
            })}
          </div>
        )}

        {/* ALTERNATES REPORT */}
        {reportType === "alternates" && (
          <div>
            {alternates.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>No alternates defined. Go to Alternates page to create them.</div>
            ) : (
              alternates.map((alt, i) => {
                const t = alt.items.reduce((s, ai) => (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * nn(ai.quantity) + s, 0);
                return (
                  <Sec key={alt.id} title={`Alternate #${i + 1}: ${alt.name} (${alt.type === "deduct" ? "DEDUCT" : "ADD"})`}>
                    {alt.description && <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>{alt.description}</div>}
                    {alt.items.map(ai => {
                      const q = nn(ai.quantity); const it = (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * q;
                      return (
                        <div key={ai.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.bg2}`, fontSize: 11 }}>
                          <span>{ai.description || "Unnamed item"}</span>
                          <span style={{ fontFamily: T.font.mono, fontWeight: 600 }}>{fmt(it)}</span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                      <span style={{ fontWeight: 700, color: alt.type === "deduct" ? C.green : C.blue }}>Alternate #{i + 1} Total</span>
                      <span style={{ fontFamily: T.font.mono, fontWeight: 700, color: alt.type === "deduct" ? C.green : C.blue }}>{alt.type === "deduct" ? "\u2212" : "+"}{fmt(t)}</span>
                    </div>
                  </Sec>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Send Proposal Modal */}
      {sendModalOpen && (
        <SendProposalModal onClose={() => setSendModalOpen(false)} totals={totals} reportType={reportType} />
      )}
    </div>
  );
}
