import React, { useMemo, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useWidgetStore } from '@/stores/widgetStore';
import { useUiStore } from '@/stores/uiStore';

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'never';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

export default function DashboardFooter({ estimateCount = 0, lastModified = null, onShowPicker }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;

  const editMode = useWidgetStore(s => s.editMode);
  const toggleEditMode = useWidgetStore(s => s.toggleEditMode);
  const resetToDefault = useWidgetStore(s => s.resetToDefault);
  const movingWidgetId = useWidgetStore(s => s.movingWidgetId);
  const clearMovingWidget = useWidgetStore(s => s.clearMovingWidget);
  const [confirmReset, setConfirmReset] = useState(false);
  const showToast = useUiStore(s => s.showToast);

  const lastSync = useMemo(() => timeAgo(lastModified), [lastModified]);

  const handleSaveLayout = () => {
    const layouts = useWidgetStore.getState().layouts;
    useUiStore.getState().updateSetting('widgetLayouts', layouts);
    showToast("Layout saved!");
  };

  const ghostBtn = {
    fontFamily: T.font.display,
    fontSize: 9,
    fontWeight: 500,
    padding: '4px 12px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    background: 'transparent',
    color: C.textMuted,
    cursor: 'pointer',
    letterSpacing: '0.04em',
    transition: 'all 0.25s ease-out',
  };

  return (
    <div style={{
      height: 52,
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: dk
        ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
        : 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.55) 100%)',
      backdropFilter: 'blur(40px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
      borderTop: `1px solid ${dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      boxShadow: dk
        ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -4px 16px rgba(0,0,0,0.2)'
        : 'inset 0 1px 0 rgba(255,255,255,0.8), 0 -4px 16px rgba(0,0,0,0.03)',
      animation: 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 1.8s both',
      flexShrink: 0,
    }}>
      {/* Left: meta text or move-mode hint */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        fontFamily: T.font.display, fontSize: 8.5, fontWeight: 400,
        letterSpacing: '0.04em', color: C.text,
      }}>
        {movingWidgetId ? (
          <span style={{ color: C.accent, fontWeight: 500 }}>
            Drag widget to reposition &middot; click outside to finish
          </span>
        ) : editMode ? (
          <span style={{ color: C.textDim }}>Editing layout &middot; drag to rearrange</span>
        ) : (
          <>
            <span style={{ color: C.textDim }}>Last activity</span>
            <span style={{ color: C.textMuted, marginLeft: 4 }}>{lastSync}</span>
            <span style={{ color: C.textDim, margin: '0 8px' }}>&middot;</span>
            <span style={{ color: C.textDim }}>Powered by</span>
            <span style={{ color: C.textMuted, marginLeft: 4 }}>NOVA</span>
          </>
        )}
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {movingWidgetId ? (
          <button
            onClick={clearMovingWidget}
            style={{
              ...ghostBtn,
              background: `${C.accent}26`,
              borderColor: `${C.accent}4D`,
              color: C.accent,
              fontWeight: 600,
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${C.accent}40`}
            onMouseLeave={e => e.currentTarget.style.background = `${C.accent}26`}
          >Done</button>
        ) : editMode ? (
          <>
            {/* Reset button */}
            {confirmReset ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 8.5, color: C.textDim, fontFamily: T.font.display }}>Reset layout?</span>
                <button
                  onClick={() => { resetToDefault(); setConfirmReset(false); }}
                  style={{ ...ghostBtn, color: C.red, borderColor: `${C.red}4D`, fontSize: 8.5, padding: '3px 8px' }}
                >Yes</button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{ ...ghostBtn, fontSize: 8.5, padding: '3px 8px' }}
                >No</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                style={{ ...ghostBtn, opacity: 0.5 }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
              >Reset</button>
            )}

            {/* Add Widget button */}
            <button
              onClick={onShowPicker}
              style={{
                ...ghostBtn,
                borderColor: `${C.green}4D`,
                color: C.green,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${C.green}0D`;
                e.currentTarget.style.borderColor = `${C.green}66`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = `${C.green}4D`;
              }}
            >+ Add Widget</button>

            {/* Done button */}
            <button
              onClick={toggleEditMode}
              style={{
                ...ghostBtn,
                background: `${C.accent}26`,
                borderColor: `${C.accent}4D`,
                color: C.accent,
                fontWeight: 600,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${C.accent}40`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `${C.accent}26`;
              }}
            >Done</button>
          </>
        ) : (
          <>
            {/* Save Layout — always visible, accent-tinted */}
            <button
              onClick={handleSaveLayout}
              style={{
                ...ghostBtn,
                borderColor: `${C.accent}33`,
                color: C.accent,
                opacity: 0.8,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = `${C.accent}14`;
                e.currentTarget.style.borderColor = `${C.accent}66`;
                e.currentTarget.style.boxShadow = `0 0 12px ${C.accent}1A`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '0.8';
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = `${C.accent}33`;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >Save Layout</button>
          </>
        )}
      </div>
    </div>
  );
}
