// DivisionDeepDive — 10-card grid, one per division index category
import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useScanStore } from '@/stores/scanStore';
import {
  getAllDivisionIndices, getAvailableYears, getDivisionIndex, getCurrentYear,
  DIVISION_INDICES,
} from '@/constants/constructionCostIndex';
import { Spark, BarChart } from './PureCSSChart';

const DIV_LABELS = {
  concrete: { label: "Concrete / Masonry", codes: "03, 04", icon: null },
  metals: { label: "Steel & Metals", codes: "05", icon: null },
  wood: { label: "Wood & Composites", codes: "06", icon: null },
  thermal: { label: "Thermal / Roofing", codes: "07", icon: null },
  openings: { label: "Doors & Windows", codes: "08", icon: null },
  finishes: { label: "Finishes", codes: "09, 10", icon: null },
  mechanical: { label: "Plumbing / HVAC", codes: "21-23", icon: null },
  electrical: { label: "Electrical", codes: "26-28", icon: null },
  sitework: { label: "Sitework", codes: "31-33", icon: null },
  general: { label: "General / Labor", codes: "01, 02", icon: null },
};

export default function DivisionDeepDive() {
  const C = useTheme();
  const T = C.T;
  const [expandedDiv, setExpandedDiv] = useState(null);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();
  const learningRecords = useScanStore(s => s.learningRecords);
  const currentYear = getCurrentYear();

  const divData = getAllDivisionIndices(currentYear);
  const years = getAvailableYears();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {divData
        .sort((a, b) => b.index - a.index)
        .map(d => {
          const meta = DIV_LABELS[d.category] || { label: d.category, codes: "" };
          const isExpanded = expandedDiv === d.category;

          // Sparkline data — all years for this division
          const sparkData = years.map(y => {
            const indices = DIVISION_INDICES[d.category];
            return indices ? (indices[y] || 100) : 100;
          });

          // Calibration factor for related divisions
          const relatedDivs = (meta.codes || "").split(",").map(s => s.trim()).filter(Boolean);
          const calFactors = relatedDivs
            .map(code => ({ code, factor: calibrationFactors[code] }))
            .filter(f => f.factor !== undefined);

          // Learning record stats
          const divRecordCount = learningRecords.filter(r =>
            relatedDivs.some(code => r.calibration && r.calibration[code])
          ).length;

          return (
            <div
              key={d.category}
              onClick={() => setExpandedDiv(isExpanded ? null : d.category)}
              style={{
                padding: "12px 14px", borderRadius: T.radius.md, cursor: "pointer",
                background: C.glassBg || 'rgba(18,21,28,0.55)',
                backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
                border: `1px solid ${isExpanded ? C.accent + '30' : (C.glassBorder || 'rgba(255,255,255,0.06)')}`,
                transition: "border-color 0.15s",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{meta.label}</div>
                  <div style={{ fontSize: 8, color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>
                    Div {meta.codes}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>
                    {d.index.toFixed(1)}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                    color: d.yoy > 3 ? C.orange : d.yoy > 0 ? C.green : C.textDim,
                  }}>
                    {d.yoy > 0 ? "+" : ""}{d.yoy.toFixed(1)}% YoY
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <Spark data={sparkData} height={20} color={d.yoy > 3 ? C.orange : C.accent} />

              {/* Calibration factors */}
              {calFactors.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {calFactors.map(f => {
                    const pct = Math.round((f.factor - 1) * 100);
                    const color = pct > 0 ? C.red : pct < 0 ? C.green : C.textDim;
                    return (
                      <div key={f.code} style={{
                        fontSize: 8, padding: "2px 5px", borderRadius: 3,
                        background: `${color}12`, color,
                        fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
                      }}>
                        {f.code}: {pct > 0 ? "+" : ""}{pct}%
                      </div>
                    );
                  })}
                </div>
              )}

              {divRecordCount > 0 && (
                <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>
                  {divRecordCount} calibration record{divRecordCount !== 1 ? "s" : ""}
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    Yearly Index (base 2020 = 100)
                  </div>
                  <BarChart
                    data={years.map(y => {
                      const indices = DIVISION_INDICES[d.category];
                      const val = indices ? (indices[y] || 100) : 100;
                      return {
                        label: String(y).slice(-2),
                        value: val,
                        color: y === currentYear ? C.accent : y === 2020 ? C.blue : C.textDim,
                      };
                    })}
                    height={50}
                    showLabels={true}
                    animate={true}
                  />
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
