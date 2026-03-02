import { useRef, useState, useEffect, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import NovaOrb from './NovaOrb';
import DashboardCalendar from './DashboardCalendar';

/* ────────────────────────────────────────────────────────
   DashboardCenter — central column of the Nova dashboard
   ──────────────────────────────────────────────────────── */

// ── division display config ──────────────────────────────
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

// ── fallback rows when no divisionTotals ─────────────────
const FALLBACK_ROWS = [
  { label: 'Concrete',    gradient: 'linear-gradient(90deg, #312E81, #6366F1)', shadow: 'rgba(99,102,241,0.55)' },
  { label: 'Framing',     gradient: 'linear-gradient(90deg, #92400E, #F59E0B)', shadow: 'rgba(245,158,11,0.45)' },
  { label: 'MEP Systems', gradient: 'linear-gradient(90deg, #065F46, #34D399)', shadow: 'rgba(52,211,153,0.5)' },
  { label: 'Finishes',    gradient: 'linear-gradient(90deg, #9F1239, #FB7185)', shadow: 'rgba(251,113,133,0.45)' },
  { label: 'GC / OHP',    gradient: 'linear-gradient(90deg, #1E3A5F, #64A9D9)', shadow: 'rgba(100,169,217,0.35)' },
];

// ── helpers ──────────────────────────────────────────────
const nn = v => (typeof v === 'number' && !isNaN(v) ? v : 0);

function formatCost(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${Math.round(v)}`;
}

// ── glass card style (base — theme colors merged in component) ──
const glassCardBase = {
  borderRadius: 14,
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  padding: '14px 18px',
};

// ── component ────────────────────────────────────────────
export default function DashboardCenter({ activeProject }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const glassCard = { ...glassCardBase, background: C.glassBg, border: `1px solid ${C.glassBorder}` };
  const orbRef = useRef(null);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const isNova = !selectedPalette || selectedPalette.startsWith('nova');

  const [askValue, setAskValue] = useState('');
  const [askFocused, setAskFocused] = useState(false);
  const [barScales, setBarScales] = useState([]);

  // ── resolve project data ──────────────────────────────
  const project = activeProject || {};
  const name = project.name || 'Nova';
  const value = nn(project.value);
  const deltaText = project.deltaText || '';
  const divisionTotals = project.divisionTotals || {};

  // ── build cost rows from divisionTotals ────────────────
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
        gradient: style.gradient,
        shadow: style.shadow,
        value: e.value,
        bar: maxVal > 0 ? e.value / maxVal : 0,
        cost: formatCost(e.value),
      };
    });
  }, [divisionTotals]);

  // ── format currency ────────────────────────────────────
  const formatted = useMemo(() => {
    if (value === 0 && !activeProject) return { dollars: '0', cents: '00' };
    const parts = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).split('.');
    return { dollars: parts[0], cents: parts[1] };
  }, [value, activeProject]);

  // ── sync orb intensity ─────────────────────────────────
  useEffect(() => {
    if (orbRef.current && value > 0) {
      orbRef.current.setValueTarget(value);
    }
  }, [value]);

  // ── animate bars ───────────────────────────────────────
  useEffect(() => {
    setBarScales(costRows.map(() => 0));
    const timers = costRows.map((row, i) =>
      setTimeout(() => {
        setBarScales(prev => {
          const next = [...prev];
          next[i] = row.bar;
          return next;
        });
      }, 200 + i * 80),
    );
    return () => timers.forEach(clearTimeout);
  }, [costRows]);

  // ── handlers ───────────────────────────────────────────
  function handleOrbClick() {
    orbRef.current?.exhale();
  }

  function handleAskSubmit(e) {
    e.preventDefault();
    if (!askValue.trim()) return;
    orbRef.current?.pulse();
    setAiChatOpen(true);
    setAskValue('');
  }

  // ── status color ───────────────────────────────────────
  const deltaColor = deltaText.includes('OVERDUE')
    ? C.red
    : deltaText.includes('Won')
    ? C.green
    : C.textMuted;

  // ── render ─────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 20px 0',
        background: 'transparent',
        position: 'relative',
        zIndex: 1,
        overflow: 'auto',
        animation: 'fadeUp 1s cubic-bezier(0.16,1,0.3,1) 0.95s both',
      }}
    >
      {/* ─── 1. Nova Orb (compact) ─────────────────────────── */}
      <NovaOrb
        ref={orbRef}
        onClick={handleOrbClick}
        scheme="nova"
        size={100}
      />

      {/* ─── 2. Status + Ask ─────────────────────────────── */}
      <div style={{ marginTop: 14, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 10, fontWeight: 400,
            letterSpacing: '0.09em', color: C.textMuted,
            fontFamily: T.font.display,
          }}
        >
          NOVA online
        </div>

        <form onSubmit={handleAskSubmit} style={{ marginTop: 14 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 100, width: 260,
              border: `1px solid ${askFocused ? `${C.accent}66` : C.border}`,
              background: askFocused ? `${C.accent}0D` : ov(0.025),
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              boxShadow: askFocused ? `0 0 20px ${C.accent}26, 0 0 40px ${C.accent}0F` : 'none',
              transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
            }}
          >
            <input
              value={askValue}
              onChange={e => setAskValue(e.target.value)}
              onFocus={() => setAskFocused(true)}
              onBlur={() => setAskFocused(false)}
              placeholder="Ask Nova anything..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: T.font.display, fontSize: 10.5, fontWeight: 400,
                color: C.text, caretColor: C.accent,
              }}
            />
            <button
              type="submit"
              style={{
                width: 18, height: 18, borderRadius: '50%', border: 'none',
                background: askValue.trim() ? `${C.accent}59` : ov(0.06),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'background 0.25s', padding: 0,
              }}
            >
              <svg width={9} height={9} viewBox="0 0 12 12" fill="none" style={{ display: 'block' }}>
                <path d="M2 10L10 6L2 2v3.2L7 6L2 6.8V10z"
                  fill={askValue.trim() ? C.accent : C.textDim} />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {/* ─── 3. Estimate Display ─────────────────────────── */}
      <div style={{ marginTop: 20, textAlign: 'center', maxWidth: 480, width: '100%' }}>
        <div style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: C.textDim,
          fontFamily: T.font.display,
        }}>
          {name}
        </div>

        <div style={{
          fontSize: 66, fontWeight: 300, color: C.text,
          fontFamily: T.font.display, lineHeight: 1, marginTop: 4,
          textShadow: dk
            ? `0 0 40px ${C.accent}40, 0 0 80px ${C.accentDim}28, 0 0 120px ${C.accent}14, 0 4px 12px rgba(0,0,0,0.45)`
            : `0 0 30px ${C.accent}20, 0 0 60px ${C.accentDim}10, 0 1px 2px rgba(0,0,0,0.06)`,
        }}>
          <span style={{ fontSize: 26, fontWeight: 400, color: C.accent, verticalAlign: 18 }}>$</span>
          {formatted.dollars}
          <span style={{ fontSize: 20, fontWeight: 300, color: C.textDim, verticalAlign: 4 }}>
            .{formatted.cents}
          </span>
        </div>

        {deltaText && (
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.07em',
            color: deltaColor, fontFamily: T.font.display, marginTop: 6,
          }}>
            {deltaText}
          </div>
        )}
      </div>

      {/* ─── 4. Cost Breakdown ───────────────────────────── */}
      <div style={{ ...glassCard, marginTop: 16, maxWidth: 480, width: '100%' }}>
        {costRows.map((row, i) => (
          <div key={row.label + i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: i < costRows.length - 1 ? 10 : 0,
          }}>
            <div style={{
              width: 84, textAlign: 'right', fontSize: 9.5, fontWeight: 400,
              color: C.textMuted, fontFamily: T.font.display, flexShrink: 0,
            }}>
              {row.label}
            </div>
            <div style={{
              flex: 1, height: 5, borderRadius: 3,
              background: ov(0.06),
              overflow: 'hidden', position: 'relative',
              cursor: 'pointer',
            }}
              onMouseEnter={e => { const bar = e.currentTarget.querySelector('div'); if (bar) bar.style.filter = 'brightness(1.3)'; }}
              onMouseLeave={e => { const bar = e.currentTarget.querySelector('div'); if (bar) bar.style.filter = 'brightness(1)'; }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                borderRadius: 3, background: row.gradient,
                boxShadow: `0 0 10px ${row.shadow}`,
                transform: `scaleX(${barScales[i] || 0})`,
                transformOrigin: 'left',
                transition: 'transform 0.8s cubic-bezier(0.16,1,0.3,1), filter 120ms ease-out',
              }} />
            </div>
            <div style={{
              width: 72, textAlign: 'right', fontSize: 10, fontWeight: 500,
              color: C.text, fontFamily: T.font.display, flexShrink: 0,
            }}>
              {row.cost}
            </div>
          </div>
        ))}
      </div>

      {/* ─── 5. Calendar ────────────────────────────────────── */}
      <DashboardCalendar />
    </div>
  );
}
