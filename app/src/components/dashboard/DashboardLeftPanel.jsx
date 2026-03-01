import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';

/* ── helpers ── */
function formatValue(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function formatBenchmarkValue(v) {
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  if (v >= 1) return `$${Math.round(v)}`;
  return '$0';
}

/* ---------- SVG Icons ---------- */
const PenDocIcon = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="1.5" width="8" height="11" rx="1.5" stroke={color} strokeWidth="1.1" fill="none" />
    <line x1="5" y1="5" x2="9" y2="5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    <line x1="5" y1="7.2" x2="7.5" y2="7.2" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    <path d="M9.5 8.5L11 7L12 8L10.5 9.5L9.5 9.8L9.5 8.5Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
  </svg>
);

const ChevronRight = ({ color = 'currentColor' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.5 2.5L8 6L4.5 9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DotsIcon = ({ color = 'currentColor' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="3.5" r="1.1" fill={color} />
    <circle cx="7" cy="7" r="1.1" fill={color} />
    <circle cx="7" cy="10.5" r="1.1" fill={color} />
  </svg>
);

/* ---------- Keyframes (injected once) ---------- */
let stylesInjected = false;
function injectKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeLeft {
      from { opacity: 0; transform: translateX(-24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}

/* ---------- Context Menu ---------- */
function ProjectMenu({ x, y, onOpen, onDelete, onClose }) {
  const C = useTheme();
  const dk = C.isDark;
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { label: 'Open', action: onOpen },
    { label: 'Delete', action: onDelete, danger: true },
  ];
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  return (
    <div ref={ref} style={{
      position: 'fixed', top: y, left: x, zIndex: 9999,
      background: C.sidebarBg,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '4px 0',
      minWidth: 120,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }}>
      {items.map(item => (
        <button
          key={item.label}
          onClick={(e) => { e.stopPropagation(); item.action(); onClose(); }}
          style={{
            display: 'block', width: '100%', padding: '7px 14px',
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 11, fontWeight: 500, textAlign: 'left',
            color: item.danger ? C.red : C.text,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = ov(0.06)}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Confirm Delete Dialog ---------- */
function ConfirmDelete({ name, onConfirm, onCancel }) {
  const C = useTheme();
  const dk = C.isDark;
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }}>
      <div ref={ref} style={{
        background: C.sidebarBg,
        border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '24px 28px',
        maxWidth: 340, width: '90%',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Delete Estimate
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
          Are you sure you want to delete <span style={{ color: C.text, fontWeight: 500 }}>{name}</span>? This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              color: C.textMuted,
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', borderRadius: 7,
              border: `1px solid ${C.red}4D`,
              background: `${C.red}26`,
              color: C.red,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========== Component ========== */
export default function DashboardLeftPanel({
  estimates = [], activeEstimateId, onSelectProject, onOpenProject, onDeleteProject,
  onCreateEstimate, benchmarks = {},
}) {
  injectKeyframes();

  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const [hoveredId, setHoveredId] = useState(null);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [menuState, setMenuState] = useState(null);       // { id, x, y }
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }

  const font = T.font.display;

  // ── Compute benchmark display values ────────────────────
  const costPerSF = benchmarks.costPerSF || 0;
  const winRate = benchmarks.winRate;
  const openBids = benchmarks.openBids || 0;

  const benchmarkRows = [
    {
      label: 'Cost/SF',
      value: costPerSF > 0 ? formatBenchmarkValue(costPerSF) : '\u2014',
      fill: `linear-gradient(90deg, ${C.accent}B3, ${C.accentAlt || C.accent}80)`,
      width: costPerSF > 0 ? `${Math.min(100, (costPerSF / 800) * 100)}%` : '0%',
      color: C.accent,
    },
    {
      label: 'Win Rate',
      value: winRate !== null && winRate !== undefined ? `${winRate}%` : 'N/A',
      fill: `linear-gradient(90deg, ${C.green}B3, ${C.green}80)`,
      width: winRate !== null && winRate !== undefined ? `${winRate}%` : '0%',
      color: C.green,
    },
    {
      label: 'Pipeline',
      value: benchmarks.pipeline > 0 ? formatValue(benchmarks.pipeline) : '\u2014',
      fill: `linear-gradient(90deg, ${C.orange}B3, ${C.orange}80)`,
      width: benchmarks.pipeline > 0 ? `${Math.min(100, (benchmarks.pipeline / 20000000) * 100)}%` : '0%',
      color: C.orange,
    },
    {
      label: 'Open Bids',
      value: `${openBids}`,
      fill: dk
        ? 'linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.15))'
        : 'linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.10))',
      width: `${Math.min(100, openBids * 10)}%`,
      color: C.text,
    },
  ];

  /* ---------- Styles ---------- */
  const panelStyle = {
    width: T.dashboard.leftPanel,
    minWidth: T.dashboard.leftPanel,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px 16px',
    background: `linear-gradient(135deg, ${C.glassBgDark} 0%, ${C.glassBg} 50%, transparent 100%)`,
    backdropFilter: 'blur(32px) saturate(1.4)',
    boxShadow: `inset -1px 0 0 ${C.glassBorder}`,
    animation: 'fadeLeft 0.8s cubic-bezier(0.16,1,0.3,1) 0.7s both',
    fontFamily: font,
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const sectionLabelStyle = {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: C.textDim,
    fontFamily: font,
    margin: 0,
  };

  const glassCardStyle = {
    background: C.glassBg,
    borderRadius: 10,
    padding: 6,
    position: 'relative',
    boxShadow: dk
      ? `0 2px 12px rgba(0,0,0,0.3), 0 1px 0 ${C.glassBorder} inset`
      : `0 2px 8px rgba(0,0,0,0.06), 0 1px 0 ${C.glassBorder} inset`,
    border: `1px solid ${C.glassBorder}`,
  };

  const hasEstimates = estimates.length > 0;

  // ── context menu handlers ─────────────────────────────
  const handleContextMenu = (e, proj) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ id: proj.id, name: proj.name, x: e.clientX, y: e.clientY });
  };

  const handleDotsClick = (e, proj) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ id: proj.id, name: proj.name, x: rect.right, y: rect.bottom + 4 });
  };

  return (
    <div style={panelStyle}>
      {/* Section Header */}
      <div style={{ marginBottom: 10, padding: '0 4px' }}>
        <span style={sectionLabelStyle}>
          PROJECTS{hasEstimates ? ` (${estimates.length})` : ''}
        </span>
      </div>

      {/* Project List Card */}
      <div style={{ ...glassCardStyle, overflow: 'auto', flex: 1, minHeight: 0 }}>
        {hasEstimates ? (
          estimates.map(proj => {
            const isActive = proj.id === activeEstimateId;
            const isHovered = proj.id === hoveredId;

            return (
              <div
                key={proj.id}
                onClick={() => onOpenProject?.(proj.id)}
                onContextMenu={(e) => handleContextMenu(e, proj)}
                onMouseEnter={() => setHoveredId(proj.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid transparent',
                  cursor: 'pointer', transition: 'background 150ms ease-out',
                  outline: 'none', position: 'relative',
                  ...(isActive && {
                    background: `linear-gradient(135deg, ${C.accent}1A 0%, ${C.accentDim}0F 100%)`,
                  }),
                  ...(!isActive && isHovered && {
                    background: ov(0.04),
                  }),
                }}
              >
                {/* Name row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: C.text, fontFamily: font,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                    ...(isActive && dk && { textShadow: `0 0 14px ${C.accent}59` }),
                  }}>
                    {proj.name}
                  </span>

                  {/* Three-dot menu — visible on hover or when menu is open */}
                  {(isHovered || menuState?.id === proj.id) && (
                    <button
                      onClick={(e) => handleDotsClick(e, proj)}
                      style={{
                        width: 20, height: 20, borderRadius: 4,
                        border: 'none', background: ov(0.06),
                        cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        padding: 0, flexShrink: 0, marginLeft: 4,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = ov(0.12)}
                      onMouseLeave={(e) => e.currentTarget.style.background = ov(0.06)}
                    >
                      <DotsIcon color={C.textMuted} />
                    </button>
                  )}

                  {/* Status pill — hide when dots are showing to avoid crowding */}
                  {!(isHovered || menuState?.id === proj.id) && (
                    <span style={{
                      fontSize: 8, fontWeight: 500, letterSpacing: '0.06em',
                      textTransform: 'uppercase', fontFamily: font,
                      padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginLeft: 6,
                      color: C.textMuted,
                      background: ov(0.05),
                      border: `1px solid ${C.borderLight}`,
                    }}>
                      {proj.statusLabel}
                    </span>
                  )}
                </div>
                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 400, color: C.textMuted, fontFamily: font,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                  }}>
                    {proj.type}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: C.accent, fontFamily: font, flexShrink: 0, marginLeft: 8 }}>
                    {proj.value > 0 ? formatValue(proj.value) : '\u2014'}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: '20px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, fontFamily: font }}>
              No estimates yet
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 400, color: C.textDim, fontFamily: font, marginTop: 4 }}>
              Create your first estimate below
            </div>
          </div>
        )}
      </div>

      {/* Create Estimate CTA */}
      <div
        onClick={onCreateEstimate}
        onMouseEnter={() => setCtaHovered(true)}
        onMouseLeave={() => setCtaHovered(false)}
        style={{
          ...glassCardStyle,
          marginTop: 12, padding: '12px 14px',
          border: `1px solid ${C.accent}33`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 200ms ease-out', flexShrink: 0,
          ...(ctaHovered && {
            borderColor: `${C.accent}59`,
            boxShadow: `0 4px 20px ${C.accentDim}26, 0 1px 0 ${ov(0.06)} inset`,
            transform: 'translateY(-1px)',
          }),
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: `${C.accent}26`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <PenDocIcon color={C.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text, fontFamily: font }}>
            Create Estimate
          </div>
          <div style={{ fontSize: 8.5, fontWeight: 400, color: C.textDim, fontFamily: font, marginTop: 1 }}>
            New project &middot; AI-powered
          </div>
        </div>
        <div style={{
          transition: 'transform 200ms ease-out',
          transform: ctaHovered ? 'translateX(2px)' : 'translateX(0)',
          flexShrink: 0,
        }}>
          <ChevronRight color={C.textDim} />
        </div>
      </div>

      {/* Benchmarks Card */}
      <div style={{ ...glassCardStyle, padding: '14px 14px 12px', marginTop: 12, flexShrink: 0 }}>
        <div style={{ ...sectionLabelStyle, marginBottom: 10, padding: 0 }}>BENCHMARKS</div>
        {benchmarkRows.map((b, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: i < benchmarkRows.length - 1 ? 10 : 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, fontFamily: font, flex: 1, minWidth: 0 }}>
              {b.label}
            </span>
            <div style={{
              width: 36, height: 2, borderRadius: 1,
              background: ov(0.06),
              position: 'relative', overflow: 'hidden', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                width: b.width, borderRadius: 1, background: b.fill,
                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: b.color, fontFamily: font, minWidth: 28, textAlign: 'right' }}>
              {b.value}
            </span>
          </div>
        ))}
      </div>

      {/* Context menu portal */}
      {menuState && (
        <ProjectMenu
          x={menuState.x}
          y={menuState.y}
          onOpen={() => onOpenProject?.(menuState.id)}
          onDelete={() => setConfirmDelete({ id: menuState.id, name: menuState.name })}
          onClose={() => setMenuState(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <ConfirmDelete
          name={confirmDelete.name}
          onConfirm={() => {
            onDeleteProject?.(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
