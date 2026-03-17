import { useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from "@/constants/widgetRegistry";

/* ────────────────────────────────────────────────────────
   WidgetReplacePicker — modal to swap one widget for another
   Keeps the same grid position and size.
   ──────────────────────────────────────────────────────── */

export default function WidgetReplacePicker({ widgetId, currentType, onClose }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const ref = useRef(null);

  const replaceWidget = useWidgetStore(s => s.replaceWidget);
  const layouts = useWidgetStore(s => s.layouts);
  const activeWidgetTypes = new Set((layouts.lg || []).map(item => item.widgetType));

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const categories = Object.entries(WIDGET_CATEGORIES).sort(([, a], [, b]) => a.order - b.order);

  const widgetsByCategory = {};
  for (const [typeId, reg] of Object.entries(WIDGET_REGISTRY)) {
    if (typeId === currentType) continue; // don't show current widget
    const cat = reg.category || "core";
    if (!widgetsByCategory[cat]) widgetsByCategory[cat] = [];
    widgetsByCategory[cat].push({ typeId, ...reg });
  }

  function handleSelect(typeId) {
    replaceWidget(widgetId, typeId);
    onClose();
  }

  const currentReg = WIDGET_REGISTRY[currentType] || {};

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: dk ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)",
        backdropFilter: C.noGlass ? "none" : "blur(8px)",
      }}
    >
      <div
        ref={ref}
        style={{
          background: C.noGlass
            ? C.bg2
            : dk
              ? "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.8) 100%)",
          backdropFilter: C.noGlass ? "none" : "blur(40px) saturate(1.8)",
          WebkitBackdropFilter: C.noGlass ? "none" : "blur(40px) saturate(1.8)",
          border: `1px solid ${dk ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
          borderRadius: 18,
          padding: "22px 24px",
          maxWidth: 420,
          width: "90%",
          boxShadow: dk
            ? "0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.2)"
            : "0 24px 64px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            marginBottom: 4,
            fontFamily: T.font.display,
          }}
        >
          Replace Widget
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 400,
            color: C.textDim,
            marginBottom: 16,
            fontFamily: T.font.display,
          }}
        >
          Replacing <span style={{ fontWeight: 600, color: C.text }}>{currentReg.label || currentType}</span> — same
          position & size
        </div>

        {categories.map(([catId, catMeta]) => {
          const widgets = widgetsByCategory[catId];
          if (!widgets || widgets.length === 0) return null;

          const catColor = catId === "core" ? C.accent : catId === "market" ? C.green || "#34D399" : C.textMuted;

          return (
            <div key={catId} style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  padding: "0 2px",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: `${catColor}1A`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {catId === "core" && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M1 9h10M3 9V5l3-2.5L9 5v4"
                        stroke={catColor}
                        strokeWidth="1.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {catId === "market" && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M1 9l3-3 2 1.5L11 3M11 3v2.5M11 3H8.5"
                        stroke={catColor}
                        strokeWidth="1.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {catId === "thirdparty" && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke={catColor} strokeWidth="1" />
                      <path d="M4.5 6h3M6 4.5v3" stroke={catColor} strokeWidth="1" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: C.text,
                    fontFamily: T.font.display,
                    lineHeight: 1.2,
                  }}
                >
                  {catMeta.label}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {widgets.map(w => {
                  const alreadyActive = w.singleton && activeWidgetTypes.has(w.typeId);
                  return (
                    <div
                      key={w.typeId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 8,
                        background: ov(0.03),
                        border: `1px solid ${C.noGlass ? C.border : C.glassBorder}`,
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: C.text,
                            fontFamily: T.font.display,
                          }}
                        >
                          {w.label}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 400,
                            color: C.textDim,
                            fontFamily: T.font.display,
                            marginTop: 2,
                          }}
                        >
                          {w.description}
                        </div>
                      </div>
                      {alreadyActive ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 500,
                            color: C.textDim,
                            fontFamily: T.font.display,
                            padding: "3px 8px",
                            borderRadius: 5,
                            background: ov(0.04),
                          }}
                        >
                          In Use
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSelect(w.typeId)}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            border: `1px solid ${C.accent}4D`,
                            background: `${C.accent}1A`,
                            color: C.accent,
                            fontSize: 9,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: T.font.display,
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `${C.accent}33`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = `${C.accent}1A`;
                          }}
                        >
                          Select
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
              color: C.textMuted,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: T.font.display,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
