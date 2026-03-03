import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useWidgetLayoutSync } from '@/hooks/useWidgetLayoutSync';
import { useWidgetStore } from '@/stores/widgetStore';
import { useDashboardData } from '@/hooks/useDashboardData';
import { WIDGET_REGISTRY } from '@/constants/widgetRegistry';
import WidgetGrid from '@/components/widgets/WidgetGrid';
import WidgetPickerModal from '@/components/widgets/WidgetPickerModal';
import WidgetReplacePicker from '@/components/widgets/WidgetReplacePicker';
import DashboardFooter from '@/components/dashboard/DashboardFooter';
import CompanySwitcher from '@/components/shared/CompanySwitcher';

/* ────────────────────────────────────────────────────────
   NovaDashboardPage — widget-based dashboard
   Data computation moved to useDashboardData hook.
   Layout managed by widgetStore + react-grid-layout.
   ──────────────────────────────────────────────────────── */

export default function NovaDashboardPage() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;

  // Sync widget layouts with persistence
  useWidgetLayoutSync();

  // Data for the footer
  const { companyEstimates, sortedEstimates } = useDashboardData();

  const editMode = useWidgetStore(s => s.editMode);
  const toggleEditMode = useWidgetStore(s => s.toggleEditMode);
  const movingWidgetId = useWidgetStore(s => s.movingWidgetId);

  // Widget picker modal
  const [showPicker, setShowPicker] = useState(false);

  // Floating menu
  const [showFab, setShowFab] = useState(false);
  const fabRef = useRef(null);

  // Close FAB menu on outside click
  useEffect(() => {
    if (!showFab) return;
    const handler = (e) => {
      if (fabRef.current && !fabRef.current.contains(e.target)) setShowFab(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFab]);

  // Widget config modal (for editing embed URLs in edit mode)
  const [configModal, setConfigModal] = useState(null);
  // Widget replace mode
  const [replaceTarget, setReplaceTarget] = useState(null);

  const handleConfigure = useCallback((id, widgetType) => {
    setConfigModal({ id, widgetType });
  }, []);

  const handleReplace = useCallback((id, widgetType) => {
    setReplaceTarget({ id, widgetType });
  }, []);

  return (
    <>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        fontFamily: T.font.display,
      }}
    >
      {/* Widget grid fills available space */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        animation: 'fadeUp 1s cubic-bezier(0.16,1,0.3,1) 0.5s both',
      }}>
        {/* Company filter */}
        <div style={{
          padding: '12px 28px 0',
          animation: 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.8s both',
        }}>
          <CompanySwitcher />
        </div>
        <WidgetGrid onConfigure={handleConfigure} onReplace={handleReplace} />
      </div>

      {/* Footer */}
      <DashboardFooter
        estimateCount={companyEstimates.length}
        lastModified={sortedEstimates[0]?.lastModified || null}
        onShowPicker={() => setShowPicker(true)}
      />
    </div>

      {/* Floating action button — outside AnimateIn so position:fixed works */}
      {!editMode && !movingWidgetId && (
        <div ref={fabRef} style={{
          position: 'fixed', bottom: 72, right: 28, zIndex: 900,
          animation: 'fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 2s both',
        }}>
          {/* Expandable menu */}
          {showFab && (
            <div style={{
              position: 'absolute', bottom: 52, right: 0,
              background: dk
                ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
                : 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.8) 100%)',
              backdropFilter: 'blur(32px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
              border: `1px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}`,
              borderRadius: 14,
              padding: '8px 6px',
              boxShadow: dk
                ? '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 4px 16px rgba(0,0,0,0.10), 0 16px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)',
              minWidth: 160,
              animation: 'fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              <FabMenuItem
                label="Move & Resize"
                sublabel="Drag widgets to rearrange"
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L7 13M1 7L13 7M7 1L5 3M7 1L9 3M7 13L5 11M7 13L9 11M1 7L3 5M1 7L3 9M13 7L11 5M13 7L11 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>}
                onClick={() => { setShowFab(false); toggleEditMode(); }}
                C={C}
              />
              <FabMenuItem
                label="Add Widget"
                sublabel="Browse & add new modules"
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
                onClick={() => { setShowFab(false); setShowPicker(true); }}
                C={C}
              />
            </div>
          )}

          {/* FAB button */}
          <button
            onClick={() => setShowFab(v => !v)}
            style={{
              width: 40, height: 40, borderRadius: 12,
              border: `1px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}`,
              background: dk
                ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
                : 'linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.90) 100%)',
              backdropFilter: 'blur(32px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
              boxShadow: dk
                ? '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
                : '0 2px 8px rgba(0,0,0,0.10), 0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)',
              color: showFab ? C.accent : C.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
              transition: 'all 0.25s ease-out',
              transform: showFab ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = `${C.accent}4D`;
              e.currentTarget.style.color = C.accent;
              e.currentTarget.style.boxShadow = dk
                ? `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${C.accent}26, inset 0 1px 0 rgba(255,255,255,0.08)`
                : `0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px ${C.accent}26, inset 0 1px 0 rgba(255,255,255,1)`;
            }}
            onMouseLeave={e => {
              if (!showFab) {
                e.currentTarget.style.borderColor = dk ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
                e.currentTarget.style.color = C.textMuted;
                e.currentTarget.style.boxShadow = dk
                  ? '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
                  : '0 2px 8px rgba(0,0,0,0.10), 0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)';
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 4V12M4 8H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Widget picker modal */}
      {showPicker && <WidgetPickerModal onClose={() => setShowPicker(false)} />}

      {/* Widget config modal (inline edit for embed URLs) */}
      {configModal && (
        <WidgetConfigModal
          widgetId={configModal.id}
          widgetType={configModal.widgetType}
          onClose={() => setConfigModal(null)}
        />
      )}

      {/* Widget replace picker */}
      {replaceTarget && (
        <WidgetReplacePicker
          widgetId={replaceTarget.id}
          currentType={replaceTarget.widgetType}
          onClose={() => setReplaceTarget(null)}
        />
      )}
    </>
  );
}

/* ── Floating menu item ──────────────────────────────────── */
function FabMenuItem({ label, sublabel, icon, onClick, C }) {
  const dk = C.isDark;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '8px 10px', borderRadius: 9,
        border: 'none', background: 'transparent',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.accent, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: C.text,
          fontFamily: C.T.font.display, lineHeight: 1.2,
        }}>{label}</div>
        <div style={{
          fontSize: 8.5, fontWeight: 400, color: C.textDim,
          fontFamily: C.T.font.display, marginTop: 1,
        }}>{sublabel}</div>
      </div>
    </button>
  );
}

/* ── Inline config modal for embed widgets ─────────────── */
function WidgetConfigModal({ widgetId, widgetType, onClose }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ref = React.useRef(null);
  const updateWidgetConfig = useWidgetStore(s => s.updateWidgetConfig);
  const layouts = useWidgetStore(s => s.layouts);

  const reg = WIDGET_REGISTRY[widgetType] || {};
  const fields = reg.configFields || [];

  // Get current config
  const currentItem = (layouts.lg || []).find(item => item.i === widgetId);
  const [values, setValues] = useState(currentItem?.config || {});

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleSave() {
    updateWidgetConfig(widgetId, values);
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: dk ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)',
      backdropFilter: 'blur(8px)',
    }}>
      <div ref={ref} style={{
        background: dk
          ? 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.8) 100%)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: `1px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: 18, padding: '22px 24px', maxWidth: 360, width: '90%',
        boxShadow: dk
          ? '0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2)'
          : '0 24px 64px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16, fontFamily: T.font.display }}>
          Configure {reg.label || widgetType}
        </div>
        {fields.map(field => (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <label style={{
              fontSize: 8.5, fontWeight: 600, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.textDim,
              fontFamily: T.font.display, marginBottom: 4, display: 'block',
            }}>{field.label}</label>
            <input
              value={values[field.key] || ''}
              onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder || ''}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                color: C.text, fontSize: 11, fontWeight: 400,
                fontFamily: T.font.display, outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderColor = `${C.accent}66`}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
            />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            color: C.textMuted, fontSize: 11, fontWeight: 500, cursor: 'pointer',
            fontFamily: T.font.display,
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '7px 16px', borderRadius: 7, border: `1px solid ${C.accent}4D`,
            background: `${C.accent}26`, color: C.accent,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.display,
          }}>Save</button>
        </div>
      </div>
    </div>
  );
}
