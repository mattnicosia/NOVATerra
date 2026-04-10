import { useState } from "react";
import DOMPurify from "dompurify";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { bt } from "@/utils/styles";

/* ────────────────────────────────────────────────────────
   PdfExport — Generates a PDF snapshot of the Resources
   Gantt chart / workload data using html2pdf.js.
   ──────────────────────────────────────────────────────── */

export default function PdfExport({ workload }) {
  const C = useTheme();
  const T = C.T;
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      // Build a print-optimized HTML string
      const { estimatorRows, unassignedEstimates, effectiveHoursPerDay, warnings } = workload;
      const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const estimatorSections = estimatorRows
        .map(row => {
          const estRows = row.estimates
            .sort((a, b) => a.bidDue.localeCompare(b.bidDue))
            .map(
              est => `
            <tr>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.name}</td>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.bidDue}</td>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.estimatedHours}h</td>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.hoursLogged}h</td>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.percentComplete}%</td>
              <td style="padding:4px 8px;font-size:10px;border-bottom:1px solid #eee;">${est.scheduleStatus}</td>
            </tr>
          `,
            )
            .join("");

          const totalHours = row.estimates.reduce((s, e) => s + e.estimatedHours, 0);
          return `
          <div style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <div style="width:20px;height:20px;border-radius:50%;background:${row.color || C.purple};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:700;">
                ${(row.name || "?")[0]}
              </div>
              <span style="font-size:13px;font-weight:700;">${row.name}</span>
              <span style="font-size:10px;color:#888;margin-left:auto;">${row.estimates.length} bids · ${totalHours}h total</span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f8f8;">
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">Project</th>
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">Due</th>
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">Est.</th>
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">Logged</th>
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">%</th>
                  <th style="padding:4px 8px;font-size:9px;text-align:left;font-weight:600;color:#666;">Status</th>
                </tr>
              </thead>
              <tbody>${estRows}</tbody>
            </table>
          </div>
        `;
        })
        .join("");

      const alertSection =
        warnings.length > 0
          ? `
        <div style="margin-top:16px;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Alerts (${warnings.length})</div>
          ${warnings
            .slice(0, 8)
            .map(w => {
              let msg = "";
              if (w.type === "conflict") msg = `${w.estimateName} (${w.estimator}) — schedule conflict`;
              else if (w.type === "overloaded") msg = `${w.estimator} overloaded on ${w.date}`;
              else if (w.type === "predicted_overload")
                msg = `${w.estimator} predicted overload in ${w.daysFromNow} days`;
              else if (w.type === "load_imbalance")
                msg = `Load imbalance: ${w.overloaded.name} vs ${w.underloaded.name}`;
              else if (w.type === "bid_cluster") msg = `${w.count} bids clustered week of ${w.date}`;
              return `<div style="font-size:10px;padding:4px 0;border-bottom:1px solid #eee;">⚠ ${msg}</div>`;
            })
            .join("")}
        </div>
      `
          : "";

      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;padding:20px;color:#222;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #333;">
            <div>
              <div style="font-size:20px;font-weight:700;">Resources — Workload Report</div>
              <div style="font-size:11px;color:#888;">${today}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px;color:#888;">Effective capacity: ${effectiveHoursPerDay?.toFixed(1) || "—"}h/day</div>
              <div style="font-size:10px;color:#888;">${estimatorRows.length} estimator${estimatorRows.length !== 1 ? "s" : ""} · ${unassignedEstimates.length} unassigned</div>
            </div>
          </div>
          ${estimatorSections}
          ${
            unassignedEstimates.length > 0
              ? `
            <div style="margin-top:16px;">
              <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#FBBF24;">Unassigned (${unassignedEstimates.length})</div>
              ${unassignedEstimates
                .map(
                  e => `
                <div style="font-size:10px;padding:4px 0;border-bottom:1px solid #eee;">${e.name} — ${e.estimatedHours}h · Due ${e.bidDue}</div>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
          ${alertSection}
          <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:8px;color:#aaa;text-align:center;">
            Generated by NOVA · ${today}
          </div>
        </div>
      `;

      const container = document.createElement("div");
      container.innerHTML = DOMPurify.sanitize(html);
      document.body.appendChild(container);

      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `resources-report-${new Date().toISOString().slice(0, 10)}.pdf`,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        })
        .from(container)
        .save();

      document.body.removeChild(container);
      useUiStore.getState().showToast("PDF exported");
    } catch (err) {
      console.error("PDF export failed:", err);
      useUiStore.getState().showToast("PDF export failed", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      style={{
        ...bt(C),
        padding: "6px 12px",
        fontSize: T.fontSize.xs,
        fontWeight: 600,
        color: C.textMuted,
        background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        border: `1px solid ${C.border}`,
        borderRadius: T.radius.sm,
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: exporting ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 12 }}>📄</span>
      {exporting ? "Exporting..." : "Export PDF"}
    </button>
  );
}
