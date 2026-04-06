import { useMemo } from "react";
import { useReportsStore } from "@/stores/reportsStore";
import CostTreemap from "../CostTreemap";

const DIV_LABELS = {
  "01": "General", "02": "Demo", "03": "Concrete", "04": "Masonry",
  "05": "Steel", "06": "Carpentry", "07": "Roofing", "08": "Openings",
  "09": "Finishes", "10": "Specialties", "11": "Equipment", "14": "Conveying",
  "21": "Fire Protection", "22": "Plumbing", "23": "HVAC", "26": "Electrical",
  "27": "Communications", "28": "Safety", "31": "Earthwork", "32": "Site", "33": "Utilities",
};

/** Red-yellow-green cost gradient as CSS */
function costGradient() {
  return "linear-gradient(to right, #3cba54, #f4c20d, #db3236)";
}

export default function CostVisualization3D({ data, proposalStyles: PS }) {
  const { divTotals = {}, totals = {}, project } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const headingFont = PS?.font?.heading || font;
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", bgSubtle: "#f8f9fa" };
  const space = PS?.space || { sm: 8, md: 16, lg: 24 };

  const costSnapshot = useReportsStore(s => s.proposalDesign?.costSnapshot);
  const grand = totals?.grand || totals?.grandTotal || totals?.total || 0;
  const projectSF = project?.projectSF || 0;

  // Top divisions for the legend
  // divTotals keys may be "09 - Finishes" or just "09"
  const topDivisions = useMemo(() => {
    if (!divTotals || !grand) return [];
    return Object.entries(divTotals)
      .map(([div, val]) => {
        const amount = typeof val === "number" ? val : val?.total || val?.mid || 0;
        // Extract 2-digit code from "09 - Finishes" format, or use as-is
        const code = div.match(/^(\d{2})/)?.[1] || "";
        const label = DIV_LABELS[code] || div.replace(/^\d{2}\s*-\s*/, "") || `Div ${div}`;
        return { div, code, label, amount, pct: (amount / grand) * 100 };
      })
      .filter(d => d.amount > 0 && d.pct >= 2)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [divTotals, grand]);

  // If no data at all, show placeholder
  if (!grand && !costSnapshot) {
    return (
      <div style={{ marginBottom: space.lg, pageBreakInside: "avoid" }}>
        <div style={{ ...type.label, fontFamily: font, color: color.accent, marginBottom: space.sm }}>
          COST INTENSITY MAP
        </div>
        <div style={{
          padding: space.lg, textAlign: "center",
          border: `1px dashed ${color.border || "#ddd"}`, borderRadius: 4,
          color: color.textDim, fontSize: type.body?.fontSize || 12, fontFamily: font,
        }}>
          Add estimate items with costs to generate a cost intensity visualization.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: space.lg, pageBreakInside: "avoid" }}>
      {/* Section label */}
      <div style={{
        ...type.label, fontFamily: font, color: color.accent,
        marginBottom: space.sm,
      }}>
        COST INTENSITY MAP
      </div>

      {/* Subtitle */}
      <div style={{
        ...(type.h1 || {}), fontFamily: headingFont, color: color.text,
        marginBottom: space.sm, fontSize: type.h1?.fontSize || 18,
      }}>
        Where the Money Goes
      </div>

      {/* Caption */}
      <div style={{
        ...type.caption, fontFamily: font, color: color.textDim,
        marginBottom: space.md,
      }}>
        {costSnapshot
          ? "Building elements colored by cost intensity, from green (low) through yellow (moderate) to red (high cost)."
          : "Cost distribution by CSI division, showing relative spend across all trades."
        }
      </div>

      {/* 3D snapshot image OR fallback treemap */}
      {costSnapshot ? (
        <>
          <div style={{
            borderRadius: 4, overflow: "hidden", marginBottom: space.md,
            border: `1px solid ${color.borderLight || "#eee"}`,
            background: "#1a1a2e",
          }}>
            <img
              src={costSnapshot}
              alt="3D cost visualization of building"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
          {/* Cost gradient legend — only shown with 3D snapshot */}
          <div style={{
            display: "flex", alignItems: "center", gap: space.sm,
            marginBottom: space.md,
          }}>
            <span style={{ ...type.caption, fontFamily: font, color: color.textDim }}>Low Cost</span>
            <div style={{
              flex: 1, height: 8, borderRadius: 4,
              background: costGradient(),
            }} />
            <span style={{ ...type.caption, fontFamily: font, color: color.textDim }}>High Cost</span>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: space.md }}>
          <CostTreemap divTotals={divTotals} grand={grand} accent={color.accent} font={font} />
        </div>
      )}

      {/* Division cost table */}
      {topDivisions.length > 0 && (
        <table style={{
          width: "100%", borderCollapse: "collapse", fontFamily: font,
        }}>
          <thead>
            <tr>
              <th style={{ ...type.label, color: color.accent, textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${color.accent}` }}>
                Division
              </th>
              <th style={{ ...type.label, color: color.accent, textAlign: "right", padding: "6px 8px", borderBottom: `2px solid ${color.accent}` }}>
                Amount
              </th>
              {projectSF > 0 && (
                <th style={{ ...type.label, color: color.accent, textAlign: "right", padding: "6px 8px", borderBottom: `2px solid ${color.accent}` }}>
                  $/SF
                </th>
              )}
              <th style={{ ...type.label, color: color.accent, textAlign: "right", padding: "6px 8px", borderBottom: `2px solid ${color.accent}`, width: 60 }}>
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {topDivisions.map((d, i) => (
              <tr key={d.div} style={{ background: i % 2 ? color.bgSubtle : "transparent" }}>
                <td style={{ fontSize: type.body?.fontSize || 11, padding: "5px 8px", color: color.text }}>
                  {d.label}
                </td>
                <td style={{ fontSize: type.money?.fontSize || 12, fontFamily: mono, padding: "5px 8px", textAlign: "right", color: color.text }}>
                  ${d.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                {projectSF > 0 && (
                  <td style={{ fontSize: 10, fontFamily: mono, padding: "5px 8px", textAlign: "right", color: color.textDim }}>
                    ${(d.amount / projectSF).toFixed(2)}
                  </td>
                )}
                <td style={{ fontSize: 10, padding: "5px 8px", textAlign: "right", color: color.textDim }}>
                  {d.pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontSize: type.body?.fontSize || 11, fontWeight: 700, padding: "8px 8px", borderTop: `2px solid ${color.accent}`, color: color.text }}>
                Total
              </td>
              <td style={{ fontSize: type.money?.fontSize || 12, fontFamily: mono, fontWeight: 700, padding: "8px 8px", textAlign: "right", borderTop: `2px solid ${color.accent}`, color: color.text }}>
                ${grand.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
              {projectSF > 0 && (
                <td style={{ fontSize: 10, fontFamily: mono, fontWeight: 700, padding: "8px 8px", textAlign: "right", borderTop: `2px solid ${color.accent}`, color: color.text }}>
                  ${(grand / projectSF).toFixed(2)}
                </td>
              )}
              <td style={{ fontSize: 10, fontWeight: 700, padding: "8px 8px", textAlign: "right", borderTop: `2px solid ${color.accent}`, color: color.text }}>
                100%
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
