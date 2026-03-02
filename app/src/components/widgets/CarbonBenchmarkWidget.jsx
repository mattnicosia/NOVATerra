import React, { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardData } from '@/hooks/useDashboardData';
import { CARBON_BENCHMARKS, CARBON_TRADE_DEFAULTS } from '@/constants/embodiedCarbonDb';
import { calcCarbonScore, formatCarbon } from '@/utils/carbonEngine';

/* ────────────────────────────────────────────────────────
   CarbonBenchmarkWidget — Terra Score: carbon intensity KPIs
   Shows kg CO2e/SF vs building-type benchmarks, LEED target,
   and a 0-100 Terra Carbon Score.
   ──────────────────────────────────────────────────────── */

const DIV_TO_TRADE = {
  '03': 'concrete', '04': 'masonry', '05': 'metals', '06': 'carpentry',
  '07': 'insulation', '08': 'doors', '09': 'finishes', '10': 'specialties',
  '15': 'hvac', '16': 'electrical', '21': 'fireSuppression', '22': 'plumbing',
  '23': 'hvac', '26': 'electrical', '27': 'electrical', '28': 'electrical',
  '31': 'sitework', '32': 'sitework', '33': 'sitework',
};

const nn = v => (typeof v === 'number' && !isNaN(v) ? v : 0);
const EMPTY_OBJ = {};

function resolveType(bt) {
  if (!bt) return 'office';
  const s = bt.toLowerCase();
  if (s.includes('office') || s.includes('commercial')) return 'office';
  if (s.includes('retail') || s.includes('store')) return 'retail';
  if (s.includes('industrial') || s.includes('factory')) return 'industrial';
  if (s.includes('warehouse') || s.includes('storage')) return 'warehouse';
  if (s.includes('hospital') || s.includes('health') || s.includes('medical')) return 'healthcare';
  if (s.includes('school') || s.includes('education') || s.includes('university')) return 'education';
  if (s.includes('residential') || s.includes('apartment') || s.includes('condo') || s.includes('housing')) return 'residential_multi';
  if (s.includes('hotel') || s.includes('hospitality') || s.includes('motel')) return 'hotel';
  if (s.includes('mixed')) return 'mixed_use';
  if (s.includes('lab') || s.includes('research') || s.includes('science')) return 'office';
  return 'office';
}

function scoreColor(score, C) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.orange || '#F59E0B';
  if (score >= 25) return '#F97316';
  return '#EF4444';
}

function scoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  if (score >= 20) return 'High Impact';
  return 'Very High';
}

export default function CarbonBenchmarkWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const { activeProject } = useDashboardData();

  const divisionTotals = activeProject?.divisionTotals || EMPTY_OBJ;
  const projectSF = nn(activeProject?.projectSF);
  const buildingType = activeProject?.buildingType || '';

  // Estimate total CO2e from division costs
  const { kgCO2ePerSF, totalKgCO2e, score, benchmark, typeKey } = useMemo(() => {
    let total = 0;
    Object.entries(divisionTotals).forEach(([code, costVal]) => {
      const trade = DIV_TO_TRADE[code] || 'general';
      const materialPortion = nn(costVal) * 0.4;
      const carbonFactor = CARBON_TRADE_DEFAULTS[trade] || 0.06;
      total += materialPortion * carbonFactor;
    });

    const tk = resolveType(buildingType);
    const bm = CARBON_BENCHMARKS[tk] || CARBON_BENCHMARKS['office'] || { low: 25, typical: 45, high: 70 };
    const intensity = projectSF > 0 ? total / projectSF : 0;
    const sc = projectSF > 0 ? Math.round(calcCarbonScore(intensity, tk)) : null;

    return { kgCO2ePerSF: intensity, totalKgCO2e: total, score: sc, benchmark: bm, typeKey: tk };
  }, [divisionTotals, projectSF, buildingType]);

  const hasData = totalKgCO2e > 0 && projectSF > 0;
  const sColor = hasData ? scoreColor(score, C) : C.textDim;

  // KPI rows
  const rows = [
    {
      label: 'kg CO2e/SF',
      value: hasData ? kgCO2ePerSF.toFixed(1) : '\u2014',
      sub: hasData ? `vs ${benchmark.typical} typical` : '',
      fill: hasData
        ? Math.min(1, kgCO2ePerSF / (benchmark.high * 1.5))
        : 0,
      color: sColor,
    },
    {
      label: 'Total CO2e',
      value: hasData ? formatCarbon(totalKgCO2e) : '\u2014',
      sub: '',
      fill: 0,
      color: C.text,
    },
    {
      label: 'LEED Target',
      value: hasData
        ? `${kgCO2ePerSF <= benchmark.typical * 0.8 ? '\u2713' : '\u2717'} -20%`
        : '\u2014',
      sub: hasData ? `need \u2264${(benchmark.typical * 0.8).toFixed(0)} kg/SF` : '',
      fill: hasData
        ? Math.min(1, Math.max(0, 1 - (kgCO2ePerSF / (benchmark.typical * 0.8))))
        : 0,
      color: hasData && kgCO2ePerSF <= benchmark.typical * 0.8 ? C.green : C.textDim,
    },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', fontFamily: T.font.display,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.textDim,
        }}>
          <span style={{ color: C.green }}>TERRA</span> SCORE
        </div>
        {hasData && (
          <div style={{
            fontSize: 8, color: C.textDim,
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            {benchmark.label || typeKey}
          </div>
        )}
      </div>

      {/* Score circle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: `2px solid ${hasData ? sColor : ov(0.12)}`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: hasData ? `${sColor}12` : 'transparent',
          transition: 'all 0.6s ease',
        }}>
          <div style={{
            fontSize: 18, fontWeight: 700, color: hasData ? sColor : C.textDim,
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1,
          }}>
            {hasData ? score : '\u2014'}
          </div>
          <div style={{
            fontSize: 6.5, fontWeight: 500, color: C.textDim,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            marginTop: 1,
          }}>
            {hasData ? scoreLabel(score) : 'NO DATA'}
          </div>
        </div>
      </div>

      {/* KPI rows */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: i < rows.length - 1 ? 8 : 0,
          }}>
            <div style={{
              flex: 1, minWidth: 0,
            }}>
              <div style={{
                fontSize: 9.5, fontWeight: 400, color: C.textMuted,
                marginBottom: 1,
              }}>{r.label}</div>
              {r.sub && (
                <div style={{
                  fontSize: 7, color: C.textDim,
                  fontStyle: 'italic',
                }}>{r.sub}</div>
              )}
            </div>
            {r.fill > 0 && (
              <div style={{
                width: 28, height: 2, borderRadius: 1, background: ov(0.06),
                position: 'relative', overflow: 'hidden', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${Math.min(100, r.fill * 100)}%`,
                  borderRadius: 1, background: r.color,
                  transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                }} />
              </div>
            )}
            <div style={{
              fontSize: 11, fontWeight: 600, color: r.color,
              fontFamily: "'DM Sans', sans-serif",
              minWidth: 48, textAlign: 'right', flexShrink: 0,
            }}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {hasData && (
        <div style={{
          fontSize: 7.5, color: C.textDim, marginTop: 8,
          fontStyle: 'italic', textAlign: 'right',
        }}>
          ICE v4.1 &middot; CLF Baselines
        </div>
      )}
    </div>
  );
}
