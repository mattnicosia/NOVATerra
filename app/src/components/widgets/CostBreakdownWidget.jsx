import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDashboardData } from '@/hooks/useDashboardData';

/* ────────────────────────────────────────────────────────
   CostBreakdownWidget — division cost bars
   ──────────────────────────────────────────────────────── */

const DIVISION_STYLES = {
  '03': { label: 'Concrete',     gradient: 'linear-gradient(90deg, #312E81, #6366F1)', shadow: 'rgba(99,102,241,0.55)' },
  '05': { label: 'Metals',       gradient: 'linear-gradient(90deg, #92400E, #F59E0B)', shadow: 'rgba(245,158,11,0.45)' },
  '06': { label: 'Wood/Framing', gradient: 'linear-gradient(90deg, #92400E, #F59E0B)', shadow: 'rgba(245,158,11,0.45)' },
  '09': { label: 'Finishes',     gradient: 'linear-gradient(90deg, #9F1239, #FB7185)', shadow: 'rgba(251,113,133,0.45)' },
  '15': { label: 'Mechanical',   gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
  '16': { label: 'Electrical',   gradient: 'linear-gradient(90deg, #1E3A5F, #64A9D9)', shadow: 'rgba(100,169,217,0.35)' },
  '21': { label: 'Fire Supp.',   gradient: 'linear-gradient(90deg, #9F1239, #FB7185)', shadow: 'rgba(251,113,133,0.45)' },
  '22': { label: 'Plumbing',     gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
  '23': { label: 'HVAC',         gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
  '26': { label: 'Electrical',   gradient: 'linear-gradient(90deg, #1E3A5F, #64A9D9)', shadow: 'rgba(100,169,217,0.35)' },
  '31': { label: 'Earthwork',    gradient: 'linear-gradient(90deg, #78350F, #D97706)', shadow: 'rgba(217,119,6,0.45)' },
  '32': { label: 'Exterior',     gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
};

const DEFAULT_STYLE = { gradient: 'linear-gradient(90deg, #374151, #6B7280)', shadow: 'rgba(107,114,128,0.4)' };

const FALLBACK_ROWS = [
  { label: 'Concrete',    gradient: 'linear-gradient(90deg, #312E81, #6366F1)', shadow: 'rgba(99,102,241,0.55)' },
  { label: 'Framing',     gradient: 'linear-gradient(90deg, #92400E, #F59E0B)', shadow: 'rgba(245,158,11,0.45)' },
  { label: 'MEP Systems', gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
  { label: 'Finishes',    gradient: 'linear-gradient(90deg, #9F1239, #FB7185)', shadow: 'rgba(251,113,133,0.45)' },
  { label: 'GC / OHP',    gradient: 'linear-gradient(90deg, #1E3A5F, #64A9D9)', shadow: 'rgba(100,169,217,0.35)' },
];

const EMPTY_OBJ = {};
const nn = v => (typeof v === 'number' && !isNaN(v) ? v : 0);

function formatCost(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${Math.round(v)}`;
}

export default function CostBreakdownWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const { activeProject } = useDashboardData();

  const divisionTotals = activeProject?.divisionTotals || EMPTY_OBJ;

  const costRows = useMemo(() => {
    const entries = Object.entries(divisionTotals)
      .map(([code, val]) => ({ code, value: nn(val) }))
      .filter(e => e.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    if (entries.length === 0) {
      return FALLBACK_ROWS.map(r => ({ ...r, value: 0, bar: 0, cost: '\u2014' }));
    }

    const maxVal = entries[0].value;
    return entries.map(e => {
      const style = DIVISION_STYLES[e.code] || DEFAULT_STYLE;
      return {
        label: style.label || `Div ${e.code}`,
        gradient: style.gradient, shadow: style.shadow,
        value: e.value, bar: maxVal > 0 ? e.value / maxVal : 0,
        cost: formatCost(e.value),
      };
    });
  }, [divisionTotals]);

  const [barScales, setBarScales] = useState([]);

  useEffect(() => {
    setBarScales(costRows.map(() => 0));
    const timers = costRows.map((row, i) =>
      setTimeout(() => {
        setBarScales(prev => { const next = [...prev]; next[i] = row.bar; return next; });
      }, 200 + i * 80),
    );
    return () => timers.forEach(clearTimeout);
  }, [costRows]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      height: '100%', fontFamily: T.font.display,
    }}>
      {costRows.map((row, i) => (
        <div key={row.label + i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: i < costRows.length - 1 ? 10 : 0,
        }}>
          <div style={{
            width: 84, textAlign: 'right', fontSize: 9.5, fontWeight: 400,
            color: C.textMuted, fontFamily: T.font.display, flexShrink: 0,
          }}>{row.label}</div>
          <div style={{
            flex: 1, height: 3, borderRadius: 2, background: ov(0.06),
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              borderRadius: 2, background: row.gradient,
              boxShadow: `0 0 8px ${row.shadow}`,
              transform: `scaleX(${barScales[i] || 0})`,
              transformOrigin: 'left',
              transition: 'transform 0.8s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
          <div style={{
            width: 72, textAlign: 'right', fontSize: 10, fontWeight: 500,
            color: C.text, fontFamily: T.font.display, flexShrink: 0,
          }}>{row.cost}</div>
        </div>
      ))}
    </div>
  );
}
