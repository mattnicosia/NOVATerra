import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useWidgetStore } from '@/stores/widgetStore';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from '@/constants/widgetRegistry';

/* ────────────────────────────────────────────────────────
   WidgetPickerWidget — browse & add modules from the dashboard
   ──────────────────────────────────────────────────────── */

const CATEGORY_ICONS = {
  core: (color) => (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M1 9h10M3 9V5l3-2.5L9 5v4" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  market: (color) => (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M1 9l3-3 2 1.5L11 3M11 3v2.5M11 3H8.5" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  thirdparty: (color) => (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke={color} strokeWidth="1"/>
      <path d="M4.5 6h3M6 4.5v3" stroke={color} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  ),
};

export default function WidgetPickerWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = (a) => dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
  const font = T.font.display;

  const addWidget = useWidgetStore(s => s.addWidget);
  const layouts = useWidgetStore(s => s.layouts);

  const activeWidgetTypes = new Set((layouts.lg || []).map(item => item.widgetType));

  const categories = Object.entries(WIDGET_CATEGORIES)
    .sort(([, a], [, b]) => a.order - b.order);

  const widgetsByCategory = {};
  for (const [typeId, reg] of Object.entries(WIDGET_REGISTRY)) {
    if (typeId === 'widget-picker') continue; // don't show self
    const cat = reg.category || 'core';
    if (!widgetsByCategory[cat]) widgetsByCategory[cat] = [];
    widgetsByCategory[cat].push({ typeId, ...reg });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: font }}>
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: C.textDim, fontFamily: font,
        padding: '0 4px', marginBottom: 8,
      }}>
        WIDGET STORE
      </span>

      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        background: C.noGlass ? C.bg2 : C.glassBg, borderRadius: 10, padding: 8,
        boxShadow: C.noGlass ? 'none' : dk
          ? `0 2px 12px rgba(0,0,0,0.3), 0 1px 0 ${C.glassBorder} inset`
          : `0 2px 8px rgba(0,0,0,0.06), 0 1px 0 ${C.glassBorder} inset`,
        border: `1px solid ${C.noGlass ? C.border : C.glassBorder}`,
      }}>
        {categories.map(([catId, catMeta]) => {
          const widgets = widgetsByCategory[catId];
          if (!widgets || widgets.length === 0) return null;

          const catColor = catId === 'core' ? C.accent
            : catId === 'market' ? (C.green || '#34D399')
            : C.textMuted;

          return (
            <div key={catId} style={{ marginBottom: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                marginBottom: 4, padding: '0 2px',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: `${catColor}1A`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {CATEGORY_ICONS[catId]?.(catColor)}
                </div>
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: C.textMuted, fontFamily: font,
                }}>{catMeta.label}</span>
              </div>

              {widgets.map(w => {
                const isAdded = w.singleton && activeWidgetTypes.has(w.typeId);
                return (
                  <div key={w.typeId} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 6px', borderRadius: 6,
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = ov(0.04)}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: C.text, fontFamily: font,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{w.label}</div>
                    </div>
                    {isAdded ? (
                      <span style={{
                        fontSize: 8, fontWeight: 500, color: C.green,
                        fontFamily: font, padding: '2px 6px',
                        borderRadius: 4, background: `${C.green}1A`,
                        flexShrink: 0,
                      }}>Added</span>
                    ) : (
                      <button
                        onClick={() => addWidget(w.typeId)}
                        style={{
                          padding: '2px 8px', borderRadius: 4,
                          border: `1px solid ${C.accent}4D`,
                          background: `${C.accent}1A`, color: C.accent,
                          fontSize: 8, fontWeight: 600, cursor: 'pointer',
                          fontFamily: font, transition: 'all 0.15s',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}33`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = `${C.accent}1A`; }}
                      >Add</button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
