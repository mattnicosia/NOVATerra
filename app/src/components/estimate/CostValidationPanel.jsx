import { useState, useMemo, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { runValidation } from '@/utils/costValidation';

export default function CostValidationPanel({ items }) {
  const C = useTheme();
  const T = C.T;
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(new Set());
  const debounceRef = useRef(null);
  const [warnings, setWarnings] = useState([]);

  // Debounced validation
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setWarnings(runValidation(items));
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [items]);

  // Filter out dismissed warnings
  const active = useMemo(() =>
    warnings.filter(w => !dismissed.has(w.itemId || w.message)),
  [warnings, dismissed]);

  const warnCount = active.filter(w => w.severity === 'warn').length;
  const infoCount = active.filter(w => w.severity === 'info').length;

  if (active.length === 0) return null;

  const scrollToItem = (itemId) => {
    if (!itemId) return;
    const el = document.querySelector(`[data-item-id="${itemId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight — softer glow
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = `0 0 0 2px ${C.orange}40, inset 0 0 12px ${C.orange}06`;
      setTimeout(() => { el.style.boxShadow = ''; }, 2000);
    }
  };

  return (
    <div style={{
      margin: '0 0 8px',
      borderRadius: 10,
      background: expanded ? `${C.orange}06` : `${C.orange}04`,
      border: `1px solid ${C.orange}15`,
      overflow: 'hidden',
      transition: 'all 0.2s ease',
      fontFamily: T.font.sans,
    }}>
      {/* Header — always visible */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px',
          cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = `${C.orange}06`; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Warning icon */}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01" />
        </svg>

        <span style={{
          fontSize: 12, fontWeight: 600, color: C.orange,
          flex: 1,
        }}>
          {warnCount > 0 && `${warnCount} warning${warnCount > 1 ? 's' : ''}`}
          {warnCount > 0 && infoCount > 0 && ' · '}
          {infoCount > 0 && `${infoCount} suggestion${infoCount > 1 ? 's' : ''}`}
        </span>

        {/* Dismiss all */}
        {expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const allKeys = new Set(active.map(w => w.itemId || w.message));
              setDismissed(allKeys);
            }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 500, color: `${C.orange}80`,
              padding: '2px 6px', borderRadius: 4,
            }}
          >Dismiss all</button>
        )}

        {/* Chevron */}
        <svg
          width={12} height={12} viewBox="0 0 24 24" fill="none"
          stroke={`${C.orange}60`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0)' }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Expanded warnings list */}
      {expanded && (
        <div style={{ padding: '0 8px 8px' }}>
          {active.map((w, i) => (
            <div
              key={w.itemId || `${w.type}-${i}`}
              onClick={() => scrollToItem(w.itemId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                cursor: w.itemId ? 'pointer' : 'default',
                transition: 'background 0.1s',
                fontSize: 11.5,
                color: w.severity === 'warn' ? C.orange : C.blue,
              }}
              onMouseEnter={e => { if (w.itemId) e.currentTarget.style.background = `${C.orange}08`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: w.severity === 'warn' ? C.orange : C.blue,
                opacity: 0.7,
              }} />
              <span style={{ flex: 1, lineHeight: 1.4 }}>{w.message}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed(prev => new Set([...prev, w.itemId || w.message]));
                }}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: `${C.text}20`, padding: 2, display: 'flex',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = `${C.text}60`; }}
                onMouseLeave={e => { e.currentTarget.style.color = `${C.text}20`; }}
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
