import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from "@/constants/widgetRegistry";

/* ────────────────────────────────────────────────────────
   WidgetPickerModal — add/configure widgets
   ──────────────────────────────────────────────────────── */

export default function WidgetPickerModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const ref = useRef(null);
  const addWidget = useWidgetStore(s => s.addWidget);
  const layouts = useWidgetStore(s => s.layouts);

  // Config form state for embed widgets
  const [configFor, setConfigFor] = useState(null); // { type, fields }
  const [configValues, setConfigValues] = useState({});

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

  // Check which singletons are already in the layout
  const activeWidgetTypes = new Set((layouts.lg || []).map(item => item.widgetType));

  // Group widgets by category
  const categories = Object.entries(WIDGET_CATEGORIES).sort(([, a], [, b]) => a.order - b.order);

  const widgetsByCategory = {};
  for (const [typeId, reg] of Object.entries(WIDGET_REGISTRY)) {
    const cat = reg.category || "core";
    if (!widgetsByCategory[cat]) widgetsByCategory[cat] = [];
    widgetsByCategory[cat].push({ typeId, ...reg });
  }

  function handleAdd(typeId) {
    const reg = WIDGET_REGISTRY[typeId];
    if (reg?.configFields) {
      setConfigFor({ type: typeId, fields: reg.configFields });
      setConfigValues({});
    } else {
      addWidget(typeId);
      onClose();
    }
  }

  function handleConfigSubmit() {
    if (!configFor) return;
    addWidget(configFor.type, configValues);
    onClose();
  }

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${C.border}`,
    background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    color: C.text,
    fontSize: 11,
    fontWeight: 400,
    fontFamily: T.font.display,
    outline: "none",
    boxSizing: "border-box",
  };

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
            marginBottom: 16,
            fontFamily: T.font.display,
          }}
        >
          {configFor ? "Configure Widget" : "Add Widget"}
        </div>

        {configFor ? (
          /* Config form for embed widgets */
          <div>
            {configFor.fields.map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: C.textDim,
                    fontFamily: T.font.display,
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  {field.label}
                </label>
                <input
                  value={configValues[field.key] || ""}
                  onChange={e => setConfigValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder || ""}
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = `${C.accent}66`)}
                  onBlur={e => (e.currentTarget.style.borderColor = C.border)}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => setConfigFor(null)}
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
                Back
              </button>
              <button
                onClick={handleConfigSubmit}
                style={{
                  padding: "7px 16px",
                  borderRadius: 7,
                  border: `1px solid ${C.accent}4D`,
                  background: `${C.accent}26`,
                  color: C.accent,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: T.font.display,
                }}
              >
                Add Widget
              </button>
            </div>
          </div>
        ) : (
          /* Widget gallery */
          categories.map(([catId, catMeta]) => {
            const widgets = widgetsByCategory[catId];
            if (!widgets || widgets.length === 0) return null;
            return (
              <div key={catId} style={{ marginBottom: 20 }}>
                {/* Category header with icon */}
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
                      background:
                        catId === "core"
                          ? `${C.accent}1A`
                          : catId === "market"
                            ? `${C.green || "#34D399"}1A`
                            : ov(0.06),
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
                          stroke={C.accent}
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
                          stroke={C.green || "#34D399"}
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {catId === "thirdparty" && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke={C.textMuted} strokeWidth="1" />
                        <path d="M4.5 6h3M6 4.5v3" stroke={C.textMuted} strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <div>
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
                    {catMeta.description && (
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 400,
                          color: C.textDim,
                          fontFamily: T.font.display,
                          lineHeight: 1.2,
                        }}
                      >
                        {catMeta.description}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {widgets.map(w => {
                    const isAdded = w.singleton && activeWidgetTypes.has(w.typeId);
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
                        {isAdded ? (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 500,
                              color: C.green,
                              fontFamily: T.font.display,
                              padding: "3px 8px",
                              borderRadius: 5,
                              background: `${C.green}1A`,
                            }}
                          >
                            Added
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAdd(w.typeId)}
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
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
