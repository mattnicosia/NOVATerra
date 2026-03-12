import React, { useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useWidgetStore } from '@/stores/widgetStore';
import {
  WIDGET_REGISTRY,
  SIZE_PRESETS,
  getAvailablePresets,
  getCurrentPreset,
} from '@/constants/widgetRegistry';

/* ────────────────────────────────────────────────────────
   WidgetActionMenu — per-widget popover with resize, move, remove
   ──────────────────────────────────────────────────────── */

export default function WidgetActionMenu({ widgetId, widgetType, currentW, onClose, onConfigure, onReplace }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ref = useRef(null);

  const resizeWidget = useWidgetStore(s => s.resizeWidget);
  const setMovingWidget = useWidgetStore(s => s.setMovingWidget);
  const removeWidget = useWidgetStore(s => s.removeWidget);

  const reg = WIDGET_REGISTRY[widgetType] || {};
  const presets = getAvailablePresets(widgetType);
  const currentPreset = getCurrentPreset(currentW);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    // Use timeout so the click that opened the menu doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuItemStyle = {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '6px 8px', borderRadius: 7,
    border: 'none', background: 'transparent',
    cursor: 'pointer', textAlign: 'left',
    fontSize: 10, fontWeight: 500, color: C.text,
    fontFamily: T.font.display, transition: 'background 0.15s',
  };

  const hoverBg = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 30, right: 4, zIndex: 1000,
        background: C.noGlass
          ? C.bg2
          : dk
            ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)'
            : 'linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 100%)',
        backdropFilter: C.noGlass ? 'none' : 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: C.noGlass ? 'none' : 'blur(40px) saturate(1.8)',
        border: `1px solid ${dk ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
        borderRadius: 12,
        padding: '10px 8px',
        boxShadow: dk
          ? '0 12px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)'
          : '0 4px 16px rgba(0,0,0,0.10), 0 12px 40px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)',
        minWidth: 172,
        animation: 'fadeUp 0.15s cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      {/* Widget label */}
      <div style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: C.textDim,
        fontFamily: T.font.display, padding: '0 8px 6px',
      }}>{reg.label || widgetType}</div>

      {/* Size presets */}
      {presets.length > 1 && (
        <>
          <div style={{
            fontSize: 7.5, fontWeight: 600, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: C.textDim,
            fontFamily: T.font.display, padding: '4px 8px 4px',
          }}>Size</div>
          <div style={{
            display: 'flex', gap: 4, padding: '0 6px 6px',
          }}>
            {presets.map(key => {
              const isActive = key === currentPreset;
              return (
                <button
                  key={key}
                  onClick={() => resizeWidget(widgetId, key)}
                  style={{
                    flex: 1, height: 24, borderRadius: 6,
                    border: `1px solid ${isActive ? `${C.accent}4D` : C.border}`,
                    background: isActive ? `${C.accent}20` : 'transparent',
                    color: isActive ? C.accent : C.textMuted,
                    fontSize: 9, fontWeight: 600, cursor: 'pointer',
                    fontFamily: T.font.display, transition: 'all 0.15s',
                    padding: 0,
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                      e.currentTarget.style.borderColor = `${C.accent}33`;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = C.border;
                    }
                  }}
                >{SIZE_PRESETS[key].label}</button>
              );
            })}
          </div>
        </>
      )}

      {/* Divider */}
      <div style={{
        height: 1, margin: '2px 6px',
        background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }} />

      {/* Move */}
      <button
        onClick={() => { setMovingWidget(widgetId); }}
        style={menuItemStyle}
        onMouseEnter={e => e.currentTarget.style.background = hoverBg}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 1L6 11M1 6L11 6M6 1L4.5 2.5M6 1L7.5 2.5M6 11L4.5 9.5M6 11L7.5 9.5M1 6L2.5 4.5M1 6L2.5 7.5M11 6L9.5 4.5M11 6L9.5 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        Move
      </button>

      {/* Replace */}
      {onReplace && (
        <button
          onClick={() => { onReplace(widgetId, widgetType); onClose(); }}
          style={menuItemStyle}
          onMouseEnter={e => e.currentTarget.style.background = hoverBg}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M10 3.5H4.5a2 2 0 000 4H6M2 8.5h5.5a2 2 0 000-4H6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            <path d="M8.5 1.5L10.5 3.5 8.5 5.5M3.5 6.5L1.5 8.5 3.5 10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Replace
        </button>
      )}

      {/* Configure (embed widgets only) */}
      {reg.configFields && onConfigure && (
        <button
          onClick={() => { onConfigure(widgetId, widgetType); onClose(); }}
          style={menuItemStyle}
          onMouseEnter={e => e.currentTarget.style.background = hoverBg}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M6 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" stroke="currentColor" strokeWidth="1"/>
            <path d="M9.7 7.4l.5.9a.5.5 0 01-.2.7l-1 .5a.5.5 0 00-.3.5v1a.5.5 0 01-.5.5h-1a.5.5 0 01-.5-.5v-.5a.5.5 0 00-.3-.4l-.4-.2a.5.5 0 00-.5 0l-.5.3a.5.5 0 01-.7-.2l-.5-.9a.5.5 0 01.2-.7l.4-.3a.5.5 0 000-.6l-.4-.3a.5.5 0 01-.2-.7l.5-.9a.5.5 0 01.7-.2l.5.3a.5.5 0 00.5 0l.4-.2a.5.5 0 00.3-.4V2a.5.5 0 01.5-.5h1a.5.5 0 01.5.5v.5a.5.5 0 00.3.4l.4.2a.5.5 0 00.5 0l.5-.3a.5.5 0 01.7.2l.5.9a.5.5 0 01-.2.7l-.4.3a.5.5 0 000 .6z" stroke="currentColor" strokeWidth="0.8"/>
          </svg>
          Configure
        </button>
      )}

      {/* Divider + Remove (only for removable widgets) */}
      {reg.removable !== false && (
        <>
          <div style={{
            height: 1, margin: '2px 6px',
            background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          }} />
          <button
            onClick={() => removeWidget(widgetId)}
            style={{ ...menuItemStyle, color: C.red }}
            onMouseEnter={e => e.currentTarget.style.background = dk ? 'rgba(255,59,48,0.08)' : 'rgba(255,59,48,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Remove
          </button>
        </>
      )}
    </div>
  );
}
