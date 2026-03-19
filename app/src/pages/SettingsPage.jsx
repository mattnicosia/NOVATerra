import { useRef, useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import { useItemsStore, DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useInboxStore } from "@/stores/inboxStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { supabase } from "@/utils/supabase";
// PALETTES import removed — theme selection temporarily disabled
import Sec from "@/components/shared/Sec";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { saveSettings, saveMasterData } from "@/hooks/usePersistence";

import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";
import { uid } from "@/utils/format";
import { processLogo } from "@/utils/imageUtils";

import LogoPill from "@/components/shared/LogoPill";
import AutoResponseSettings from "@/components/settings/AutoResponseSettings";
import EstimatorSettingsPanel from "@/components/settings/EstimatorSettingsPanel";

export default function SettingsPage() {
  const C = useTheme();
  const T = C.T;
  const logoFileRef = useRef(null);
  const masterData = useMasterDataStore(s => s.masterData);
  const updateCompanyInfo = useMasterDataStore(s => s.updateCompanyInfo);
  const appSettings = useUiStore(s => s.appSettings);
  const updateSetting = useUiStore(s => s.updateSetting);
  const showToast = useUiStore(s => s.showToast);
  const markup = useItemsStore(s => s.markup);
  const setMarkup = useItemsStore(s => s.setMarkup);
  const markupOrder = useItemsStore(s => s.markupOrder) || DEFAULT_MARKUP_ORDER;
  const setMarkupOrder = useItemsStore(s => s.setMarkupOrder);

  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dragMarkupIdx, setDragMarkupIdx] = useState(null);

  // Org role: estimators see company profile as read-only
  const isManager = useOrgStore(selectIsManager);
  const hasOrg = useOrgStore(s => !!s.org);
  const orgName = useOrgStore(s => s.org?.name);
  const companyReadOnly = hasOrg && !isManager;

  // First org login: show welcome banner once (flag set by AppContent redirect)
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return localStorage.getItem("bldg-first-org-welcome") === "1"; } catch { return false; }
  });
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.removeItem("bldg-first-org-welcome"); } catch { /* non-critical */ }
  };

  // Markup color mapping
  const markupColors = {
    overhead: C.blue,
    profit: C.green,
    overheadAndProfit: C.blue,
    contingency: C.orange,
    generalConditions: C.cyan,
    insurance: C.purple,
    fee: C.red,
  };

  const _handleMarkupDrop = targetIdx => {
    if (dragMarkupIdx === null || dragMarkupIdx === targetIdx) return;
    const current = [...(appSettings.defaultMarkupOrder || DEFAULT_MARKUP_ORDER)];
    const [moved] = current.splice(dragMarkupIdx, 1);
    current.splice(targetIdx, 0, moved);
    updateSetting("defaultMarkupOrder", current);
    setDragMarkupIdx(null);
  };

  const [_senderEmails, _setSenderEmails] = useState([]);
  const [_newSenderEmail, _setNewSenderEmail] = useState("");

  const handleLogoUpload = async file => {
    try {
      const dataUrl = await processLogo(file);
      updateCompanyInfo("logo", dataUrl);
      showToast("Logo uploaded");
    } catch {
      showToast("Failed to process logo");
    }
  };

  const handleSave = async () => {
    try {
      await saveSettings();
      await saveMasterData();
      setSettingsSaved(true);
      showToast("Settings saved");
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {
      showToast("Failed to save settings", "error");
    }
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1000 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `linear-gradient(135deg,${C.accent},${C.accentDim})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={I.settings} size={20} color="#fff" sw={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Settings</div>
            <div style={{ fontSize: 11, color: C.textDim }}>
              Company profile, default markups, AI configuration, and display preferences
            </div>
          </div>
        </div>

        {/* Welcome banner for first-login invited users */}
        {showWelcome && hasOrg && (
          <div
            style={{
              padding: "16px 20px",
              background: `${C.accent}10`,
              border: `1px solid ${C.accent}30`,
              borderRadius: T.radius.md,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                Welcome to {orgName || "the team"}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
                You have joined as an estimator. Below is the company profile and team information.
                {companyReadOnly && " Company profile fields are managed by your admin."}
              </div>
            </div>
            <button
              onClick={dismissWelcome}
              style={bt(C, {
                background: C.accent,
                color: "#fff",
                padding: "6px 16px",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              })}
            >
              Got it
            </button>
          </div>
        )}

        {/* Company Profiles */}
        <CompanyProfilesSection
          C={C}
          T={T}
          masterData={masterData}
          showToast={showToast}
          logoFileRef={logoFileRef}
          handleLogoUpload={handleLogoUpload}
          updateCompanyInfo={updateCompanyInfo}
          readOnly={companyReadOnly}
        />

        {/* Default Markup & Tax Rates */}
        <Sec title="Default Markup & Tax Rates">
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
            Defaults applied to new estimates. <strong style={{ color: C.accent }}>Active</strong> markups are applied
            in calculation order (drag to reorder). Move items to <strong style={{ color: C.textDim }}>Inactive</strong>{" "}
            to keep them configured but not applied.
          </div>

          {/* Markup rows with on/off toggle, drag reorder for active items */}
          {(() => {
            const allOrder = appSettings.defaultMarkupOrder || DEFAULT_MARKUP_ORDER;
            const activeItems = allOrder.filter(mo => mo.active !== false);
            const inactiveItems = allOrder.filter(mo => mo.active === false);

            const toggleActive = key => {
              const updated = [...allOrder].map(mo => (mo.key === key ? { ...mo, active: !mo.active } : mo));
              updateSetting("defaultMarkupOrder", updated);
            };

            // Drag reorder among active items only
            const handleActiveMarkupDrop = targetActiveIdx => {
              if (dragMarkupIdx === null) return;
              const draggedItem = activeItems[dragMarkupIdx];
              if (!draggedItem || dragMarkupIdx === targetActiveIdx) return;
              const newActive = activeItems.filter((_, i) => i !== dragMarkupIdx);
              newActive.splice(targetActiveIdx, 0, draggedItem);
              updateSetting("defaultMarkupOrder", [...newActive, ...inactiveItems]);
              setDragMarkupIdx(null);
            };

            const ToggleSwitch = ({ active, onToggle }) => (
              <div
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  onToggle();
                }}
                onMouseDown={e => e.stopPropagation()}
                onDragStart={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                draggable={false}
                style={{
                  width: 32,
                  height: 18,
                  borderRadius: 9,
                  cursor: "pointer",
                  position: "relative",
                  background: active ? C.green : C.bg3,
                  border: `1px solid ${active ? C.green : C.border}`,
                  transition: "background 0.2s, border-color 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 1,
                    left: active ? 16 : 1,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </div>
            );

            return (
              <>
                {/* Active section */}
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.accent,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: C.green,
                      boxShadow: `0 0 6px ${C.green}60`,
                    }}
                  />
                  Active ({activeItems.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
                  {activeItems.map((mo, idx) => {
                    const color = markupColors[mo.key] || C.textDim;
                    return (
                      <div
                        key={mo.key}
                        draggable
                        onDragStart={e => {
                          setDragMarkupIdx(idx);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          handleActiveMarkupDrop(idx);
                        }}
                        onDragEnd={() => setDragMarkupIdx(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          background: dragMarkupIdx === idx ? `${C.accent}12` : C.bg2,
                          borderRadius: 6,
                          border: `1px solid ${dragMarkupIdx === idx ? C.accent + "50" : C.border}`,
                          cursor: "grab",
                          transition: "box-shadow 0.15s, background 0.15s, border-color 0.15s",
                          userSelect: "none",
                          opacity: dragMarkupIdx === idx ? 0.6 : 1,
                        }}
                      >
                        {/* On/Off toggle */}
                        <ToggleSwitch active={true} onToggle={() => toggleActive(mo.key)} />
                        {/* Drag handle */}
                        <svg
                          width="10"
                          height="14"
                          viewBox="0 0 10 14"
                          fill={C.textDim}
                          style={{ flexShrink: 0, opacity: 0.5 }}
                        >
                          <circle cx="3" cy="2" r="1.2" />
                          <circle cx="7" cy="2" r="1.2" />
                          <circle cx="3" cy="7" r="1.2" />
                          <circle cx="7" cy="7" r="1.2" />
                          <circle cx="3" cy="12" r="1.2" />
                          <circle cx="7" cy="12" r="1.2" />
                        </svg>
                        {/* Order number */}
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: `${color}20`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </div>
                        {/* Label */}
                        <div style={{ flex: 1, minWidth: 100 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color }}>{mo.label}</div>
                        </div>
                        {/* Value input */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            value={appSettings.defaultMarkup[mo.key] || ""}
                            onChange={e =>
                              updateSetting(
                                "defaultMarkup." + mo.key,
                                e.target.value === "" ? "" : parseFloat(e.target.value),
                              )
                            }
                            style={nInp(C, { width: 70, padding: "5px 8px", fontSize: 13, fontWeight: 600 })}
                            step="0.5"
                            min="0"
                            max="100"
                            onClick={e => e.stopPropagation()}
                          />
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>%</span>
                        </div>
                        {/* Compound toggle */}
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            cursor: "pointer",
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: mo.compound ? `${C.accent}18` : "transparent",
                            border: `1px solid ${mo.compound ? C.accent + "50" : C.border}`,
                            transition: "all 0.15s",
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={mo.compound || false}
                            onChange={e => {
                              const updated = [...allOrder].map(m =>
                                m.key === mo.key ? { ...m, compound: e.target.checked } : m,
                              );
                              updateSetting("defaultMarkupOrder", updated);
                            }}
                            style={{ width: 12, height: 12, accentColor: C.accent }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: mo.compound ? C.accent : C.textDim,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Compound
                          </span>
                        </label>
                      </div>
                    );
                  })}
                  {activeItems.length === 0 && (
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: 6,
                        border: `1px dashed ${C.border}`,
                        color: C.textDim,
                        fontSize: 11,
                        textAlign: "center",
                      }}
                    >
                      No active markups — toggle items on below
                    </div>
                  )}
                </div>

                {/* Inactive section */}
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.textDim, opacity: 0.4 }} />
                  Inactive ({inactiveItems.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
                  {inactiveItems.map(mo => {
                    const _color = markupColors[mo.key] || C.textDim;
                    return (
                      <div
                        key={mo.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          background: C.bg2,
                          borderRadius: 6,
                          opacity: 0.55,
                          border: `1px dashed ${C.border}`,
                          userSelect: "none",
                        }}
                      >
                        {/* On/Off toggle */}
                        <ToggleSwitch active={false} onToggle={() => toggleActive(mo.key)} />
                        {/* Label */}
                        <div style={{ flex: 1, minWidth: 100 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim }}>{mo.label}</div>
                        </div>
                        {/* Value input (still editable so users can pre-configure) */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            value={appSettings.defaultMarkup[mo.key] || ""}
                            onChange={e =>
                              updateSetting(
                                "defaultMarkup." + mo.key,
                                e.target.value === "" ? "" : parseFloat(e.target.value),
                              )
                            }
                            style={nInp(C, { width: 70, padding: "5px 8px", fontSize: 13, fontWeight: 600 })}
                            step="0.5"
                            min="0"
                            max="100"
                          />
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>%</span>
                        </div>
                      </div>
                    );
                  })}
                  {inactiveItems.length === 0 && (
                    <div
                      style={{
                        padding: "10px 16px",
                        borderRadius: 6,
                        border: `1px dashed ${C.border}`,
                        color: C.textDim,
                        fontSize: 11,
                        textAlign: "center",
                      }}
                    >
                      All markups are active
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Bond & Tax (always applied last, not reorderable) */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            Post-Markup (always last)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              { key: "bond", label: "Bond %", color: C.cyan },
              { key: "tax", label: "Tax %", color: C.red },
            ].map(m => (
              <div
                key={m.key}
                style={{ padding: "8px 12px", background: C.bg2, borderRadius: 6, border: `1px solid ${C.border}` }}
              >
                <label
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: m.color,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {m.label}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <input
                    type="number"
                    value={appSettings.defaultMarkup[m.key] || ""}
                    onChange={e =>
                      updateSetting("defaultMarkup." + m.key, e.target.value === "" ? "" : parseFloat(e.target.value))
                    }
                    style={nInp(C, { width: 80, padding: "6px 8px", fontSize: 14, fontWeight: 600 })}
                    step="0.5"
                    min="0"
                    max="100"
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.textMuted }}>%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Current estimate info */}
          <div
            style={{
              padding: "8px 12px",
              background: C.accentBg,
              borderRadius: 6,
              border: `1px solid ${C.accent}30`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ic d={I.ai} size={14} color={C.accent} />
            <div style={{ fontSize: 10, color: C.accent }}>
              <strong>Current estimate</strong> order:{" "}
              {markupOrder
                .filter(mo => mo.active !== false)
                .map((mo, _i) => `${mo.label} ${markup[mo.key] || 0}%${mo.compound ? "★" : ""}`)
                .join(" → ")}{" "}
              | Bond {markup.bond || 0}% | Tax {markup.tax || 0}%
              {markupOrder.some(mo => mo.compound && mo.active !== false) && (
                <span style={{ marginLeft: 4 }}>★ = compounded</span>
              )}{" "}
              <button
                onClick={() => {
                  setMarkup({ ...appSettings.defaultMarkup });
                  setMarkupOrder([...(appSettings.defaultMarkupOrder || DEFAULT_MARKUP_ORDER)]);
                  showToast("Applied default markups & order to current estimate");
                }}
                style={bt(C, {
                  background: C.accent,
                  color: "#fff",
                  padding: "2px 8px",
                  fontSize: 9,
                  display: "inline-flex",
                })}
              >
                Apply Defaults to Current
              </button>
            </div>
          </div>
        </Sec>

        {/* Labor Types */}
        <Sec title="Labor Types">
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
            Configure labor type multipliers. The multiplier is applied to the labor portion of all line items at
            calculation time. Set per-estimate on the Project Info page.
          </div>

          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 60px",
              gap: 8,
              marginBottom: 6,
              fontSize: 9,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              padding: "0 4px",
            }}
          >
            <span>Label</span>
            <span style={{ textAlign: "right" }}>Multiplier</span>
            <span />
          </div>

          {/* Labor type rows */}
          {(appSettings.laborTypes || DEFAULT_LABOR_TYPES).map((lt, idx) => (
            <div
              key={lt.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 60px",
                gap: 8,
                marginBottom: 4,
                alignItems: "center",
              }}
            >
              <input
                value={lt.label}
                onChange={e => {
                  const updated = [...(appSettings.laborTypes || DEFAULT_LABOR_TYPES)];
                  updated[idx] = { ...updated[idx], label: e.target.value };
                  updateSetting("laborTypes", updated);
                }}
                style={inp(C, { padding: "6px 10px", fontSize: 12 })}
              />
              <input
                type="number"
                value={lt.multiplier}
                onChange={e => {
                  const updated = [...(appSettings.laborTypes || DEFAULT_LABOR_TYPES)];
                  updated[idx] = { ...updated[idx], multiplier: parseFloat(e.target.value) || 1.0 };
                  updateSetting("laborTypes", updated);
                }}
                step="0.05"
                min="0.5"
                max="5.0"
                style={nInp(C, { padding: "6px 8px", fontSize: 13, fontWeight: 600, textAlign: "center" })}
              />
              <div style={{ display: "flex", justifyContent: "center" }}>
                {(appSettings.laborTypes || []).length > 1 && (
                  <button
                    onClick={() => {
                      const updated = (appSettings.laborTypes || []).filter((_, i) => i !== idx);
                      updateSetting("laborTypes", updated);
                      // If deleted type was the default, reset to first remaining
                      if (appSettings.defaultLaborType === lt.key && updated.length > 0) {
                        updateSetting("defaultLaborType", updated[0].key);
                      }
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      border: "none",
                      background: "transparent",
                      color: C.red,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: 0.6,
                    }}
                    title="Remove"
                  >
                    <Ic d={I.trash} size={12} color={C.red} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add button */}
          <button
            onClick={() => {
              const key = `custom_${uid()}`;
              updateSetting("laborTypes", [
                ...(appSettings.laborTypes || DEFAULT_LABOR_TYPES),
                { key, label: "Custom", multiplier: 1.0 },
              ]);
            }}
            style={bt(C, {
              background: "transparent",
              border: `1px dashed ${C.border}`,
              color: C.accent,
              padding: "6px 12px",
              fontSize: 10,
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            })}
          >
            <Ic d={I.plus} size={12} color={C.accent} sw={2} /> Add Labor Type
          </button>

          {/* Default labor type selector */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: C.bg2,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            <label style={{ fontSize: 10, fontWeight: 600, color: C.textDim }}>Default for new estimates:</label>
            <select
              value={appSettings.defaultLaborType || "open_shop"}
              onChange={e => updateSetting("defaultLaborType", e.target.value)}
              style={inp(C, { width: 220, padding: "5px 10px", fontSize: 11 })}
            >
              {(appSettings.laborTypes || DEFAULT_LABOR_TYPES).map(lt => (
                <option key={lt.key} value={lt.key}>
                  {lt.label} ({lt.multiplier}x)
                </option>
              ))}
            </select>
          </div>
        </Sec>

        {/* AI Configuration */}
        <Sec title="AI Configuration">
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
            Configure the AI features used for spec parsing, auto-labeling, scope suggestions, pricing lookup, and the
            AI chat assistant.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div
              style={{
                padding: "10px 14px",
                background: `${C.green}08`,
                borderRadius: 6,
                border: `1px solid ${C.green}25`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ic d={I.check} size={16} color={C.green} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>AI is built-in</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                  NOVA AI features are included with your account. No API key needed.
                </div>
              </div>
            </div>
            <div>
              <label
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                FRED API Key (Market Data)
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                <input
                  type="password"
                  value={appSettings.fredApiKey || ""}
                  onChange={e => updateSetting("fredApiKey", e.target.value)}
                  placeholder="Your FRED API key..."
                  style={inp(C, {
                    padding: "8px 12px",
                    fontSize: 12,
                    fontFamily: T.font.sans,
                    flex: 1,
                    maxWidth: 500,
                  })}
                />
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
                Free API key for live construction market data (lumber, steel, housing starts). Get one at{" "}
                <a
                  href="https://fred.stlouisfed.org/docs/api/api_key.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.accent, fontWeight: 500, textDecoration: "none" }}
                >
                  fred.stlouisfed.org
                </a>
              </div>
            </div>
            <div style={{ padding: "10px 14px", background: C.bg2, borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                AI-Powered Features
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  {
                    name: "Spec Book Parsing",
                    desc: "Upload PDF auto-extract CSI sections",
                    icon: I.layers,
                    color: C.purple,
                  },
                  {
                    name: "Smart Label / Auto Label",
                    desc: "AI reads sheet numbers from title blocks",
                    icon: I.plans,
                    color: C.blue,
                  },
                  {
                    name: "Auto-Count (Vision)",
                    desc: "AI counts repeated elements on drawings",
                    icon: I.takeoff,
                    color: C.green,
                  },
                  {
                    name: "AI Pricing Lookup",
                    desc: "Get material/labor pricing estimates",
                    icon: I.dollar,
                    color: C.orange,
                  },
                  {
                    name: "Scope Suggestions",
                    desc: "AI suggests takeoff items from drawings",
                    icon: I.ai,
                    color: C.accent,
                  },
                  { name: "AI Chat Assistant", desc: "Context-aware project assistant", icon: I.send, color: C.cyan },
                ].map(f => (
                  <div
                    key={f.name}
                    style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 4 }}
                  >
                    <Ic d={f.icon} size={14} color={f.color} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.text }}>{f.name}</div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Sec>

        {/* Historical Proposals — moved to Cost Database */}
        <Sec title="Cost History & ROM Calibration">
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
            Historical proposals and ROM calibration data has moved to the{" "}
            <strong style={{ color: C.accent }}>Cost Database → Cost History</strong> tab.
          </div>
        </Sec>

        {/* Auto-Responses */}
        <Sec title="Auto-Responses" icon={I.send}>
          <AutoResponseSettings />
        </Sec>

        {/* Team */}
        <Sec title="Team" icon={I.people}>
          <EstimatorSettingsPanel />
        </Sec>

        {/* Project Access — managers/owners only */}
        {isManager && hasOrg && <ProjectAccessSection />}

        {/* Email Inbox */}
        {supabase && <EmailInboxSection C={C} T={T} showToast={showToast} />}

        {/* Save Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            background: C.bg1,
            borderRadius: T.radius.md,
            border: `1px solid ${C.border}`,
            marginTop: 12,
          }}
        >
          <div style={{ fontSize: 11, color: C.textMuted }}>
            Default markups apply to new estimates only — existing estimates keep their current values.
          </div>
          <button
            className="accent-btn"
            onClick={handleSave}
            style={bt(C, {
              background: C.accent,
              color: "#fff",
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 160,
              justifyContent: "center",
            })}
          >
            <Ic d={settingsSaved ? I.check : I.save} size={16} color="#fff" sw={2} />
            {settingsSaved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Company Profiles management section
function CompanyProfilesSection({
  C,
  T,
  masterData,
  showToast,
  logoFileRef: _logoFileRef,
  handleLogoUpload: _handleLogoUpload,
  updateCompanyInfo,
  readOnly = false,
}) {
  const addProfile = useMasterDataStore(s => s.addCompanyProfile);
  const updateProfile = useMasterDataStore(s => s.updateCompanyProfile);
  const removeProfile = useMasterDataStore(s => s.removeCompanyProfile);
  const profiles = masterData.companyProfiles || [];
  const [editingProfileId, setEditingProfileId] = useState(null); // null = default, or profile id
  const [_showNewForm, setShowNewForm] = useState(false);
  const profileLogoRef = useRef(null);

  // The profile currently being edited
  const isDefault = editingProfileId === null;
  const editingProfile = isDefault ? masterData.companyInfo : profiles.find(p => p.id === editingProfileId);

  const updateField = (field, value) => {
    if (isDefault) {
      updateCompanyInfo(field, value);
    } else {
      updateProfile(editingProfileId, field, value);
    }
  };

  const handleProfileLogoUpload = async file => {
    try {
      const dataUrl = await processLogo(file);
      updateField("logo", dataUrl);
      showToast("Logo uploaded");
    } catch {
      showToast("Failed to process logo");
    }
  };

  const handleCreateProfile = () => {
    const newProfile = {
      name: "New Profile",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
      licenseNo: "",
      logo: null,
      brandColors: [],
      palettes: [],
      boilerplateExclusions: [],
      boilerplateNotes: [],
    };
    addProfile(newProfile);
    const latest = useMasterDataStore.getState().masterData.companyProfiles;
    setEditingProfileId(latest[latest.length - 1].id);
    setShowNewForm(false);
    showToast("Profile created");
  };

  const handleDeleteProfile = id => {
    removeProfile(id);
    if (editingProfileId === id) setEditingProfileId(null);
    showToast("Profile deleted");
  };

  return (
    <Sec title={readOnly ? "Company Profiles (View Only)" : "Company Profiles"}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
        {readOnly
          ? "Company profiles are managed by your organization admin. You can view the details below."
          : <>Manage company profiles for different clients or offices. Select a profile per-project on the Project Info page.
            The <strong style={{ color: C.accent }}>primary</strong> profile is used by default.</>}
      </div>

      {/* Profile logo tiles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {/* Primary / default profile tile */}
        <div
          onClick={() => setEditingProfileId(null)}
          style={{
            width: 100,
            height: 80,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s",
            border: `2px solid ${isDefault ? C.accent : C.border}`,
            background: isDefault ? `${C.accent}10` : C.bg2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <LogoPill
            src={masterData.companyInfo?.logo}
            maxHeight={56}
            maxWidth={80}
            fallback={
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: C.accent + "20",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ic d={I.folder} size={24} color={C.accent} />
              </div>
            }
          />
        </div>

        {/* Additional profile tiles */}
        {profiles.map(p => {
          const sel = editingProfileId === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setEditingProfileId(p.id)}
              style={{
                width: 100,
                height: 80,
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 0.15s",
                border: `2px solid ${sel ? C.accent : C.border}`,
                background: sel ? `${C.accent}10` : C.bg2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {!readOnly && <button
                onClick={e => {
                  e.stopPropagation();
                  handleDeleteProfile(p.id);
                }}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  opacity: 0.5,
                }}
                title="Delete profile"
              >
                <Ic d={I.x} size={10} color={C.textDim} />
              </button>}
              <LogoPill
                src={p.logo}
                maxHeight={56}
                maxWidth={80}
                fallback={
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: C.purple + "20",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ic d={I.folder} size={24} color={C.purple} />
                  </div>
                }
              />
            </div>
          );
        })}

        {/* Add new profile tile */}
        {!readOnly && <div
          onClick={handleCreateProfile}
          style={{
            width: 100,
            height: 80,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s",
            border: `2px dashed ${C.border}`,
            background: "transparent",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Ic d={I.plus} size={18} color={C.accent} sw={2} />
          <span style={{ fontSize: 9, fontWeight: 600, color: C.accent }}>Add</span>
        </div>}
      </div>

      {/* Edit form for selected profile */}
      {editingProfile && (
        <div style={{ padding: 16, background: C.bg1, borderRadius: T.radius.md, border: `1px solid ${C.border}` }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: C.accent,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ic d={readOnly ? I.eye : I.edit} size={12} color={C.accent} />
            {readOnly ? "Viewing" : "Editing"}: {isDefault ? "Primary Profile" : editingProfile.name || "Unnamed Profile"}
            {isDefault && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 500,
                  color: C.textDim,
                  fontStyle: "italic",
                  textTransform: "none",
                  letterSpacing: 0,
                }}
              >
                {" "}
                (default for all projects)
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: T.radius.md,
                  border: `2px dashed ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: C.bg2,
                  cursor: readOnly ? "default" : "pointer",
                  transition: "border-color 0.2s",
                }}
                onClick={() => !readOnly && profileLogoRef.current?.click()}
                onDragOver={e => {
                  if (readOnly) return;
                  e.preventDefault();
                  e.currentTarget.style.borderColor = C.accent;
                }}
                onDragLeave={e => {
                  if (readOnly) return;
                  e.currentTarget.style.borderColor = C.border;
                }}
                onDrop={e => {
                  if (readOnly) return;
                  e.preventDefault();
                  e.currentTarget.style.borderColor = C.border;
                  if (e.dataTransfer.files[0]) handleProfileLogoUpload(e.dataTransfer.files[0]);
                }}
              >
                <LogoPill
                  src={editingProfile?.logo}
                  maxHeight={90}
                  maxWidth={90}
                  fallback={
                    <div style={{ textAlign: "center" }}>
                      <Ic d={I.upload} size={18} color={C.textDim} />
                      <div style={{ fontSize: 8, color: C.textDim, marginTop: 4 }}>Upload Logo</div>
                    </div>
                  }
                />
              </div>
              <input
                ref={profileLogoRef}
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.svg,.webp"
                style={{ display: "none" }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleProfileLogoUpload(f);
                  e.target.value = "";
                }}
              />
              {editingProfile?.logo && !readOnly && (
                <button
                  className="ghost-btn"
                  onClick={() => {
                    updateField("logo", null);
                    updateField("palettes", []);
                  }}
                  style={bt(C, {
                    fontSize: 9,
                    color: C.red,
                    background: "transparent",
                    border: "none",
                    padding: "2px 6px",
                  })}
                >
                  Remove
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Company Name</label>
                <input
                  value={editingProfile?.name || ""}
                  onChange={e => !readOnly && updateField("name", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "6px 10px", fontSize: 13, fontWeight: 700, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Address</label>
                <input
                  value={editingProfile?.address || ""}
                  onChange={e => !readOnly && updateField("address", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>City</label>
                <input
                  value={editingProfile?.city || ""}
                  onChange={e => !readOnly && updateField("city", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>State</label>
                  <input
                    value={editingProfile?.state || ""}
                    onChange={e => !readOnly && updateField("state", e.target.value)}
                    readOnly={readOnly}
                    style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Zip</label>
                  <input
                    value={editingProfile?.zip || ""}
                    onChange={e => !readOnly && updateField("zip", e.target.value)}
                    readOnly={readOnly}
                    style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Phone</label>
                <input
                  value={editingProfile?.phone || ""}
                  onChange={e => !readOnly && updateField("phone", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Email</label>
                <input
                  value={editingProfile?.email || ""}
                  onChange={e => !readOnly && updateField("email", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Website</label>
                <input
                  value={editingProfile?.website || ""}
                  onChange={e => !readOnly && updateField("website", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
              <div>
                <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>License #</label>
                <input
                  value={editingProfile?.licenseNo || ""}
                  onChange={e => !readOnly && updateField("licenseNo", e.target.value)}
                  readOnly={readOnly}
                  style={inp(C, { padding: "5px 10px", fontSize: 11, ...(readOnly && { opacity: 0.75, cursor: "default" }) })}
                />
              </div>
            </div>
          </div>

          {/* ── Boilerplate Exclusions & Notes ── */}
          <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ic d={I.plans} size={12} color={C.accent} />
              Default Exclusions &amp; Notes
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 12, lineHeight: 1.5 }}>
              These appear automatically on every new estimate using this profile. Estimators can remove individual
              items per-project.
            </div>

            {/* Boilerplate Exclusions */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>Exclusions</span>
                {!readOnly && <button
                  onClick={() => {
                    const list = [...(editingProfile?.boilerplateExclusions || []), { id: uid(), text: "" }];
                    updateField("boilerplateExclusions", list);
                  }}
                  style={{
                    background: `${C.accent}10`,
                    border: `1px solid ${C.accent}30`,
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                    color: C.accent,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ic d={I.plus} size={9} color={C.accent} /> Add
                </button>}
              </div>
              {(editingProfile?.boilerplateExclusions || []).length === 0 && (
                <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic", padding: "6px 0" }}>
                  No default exclusions yet
                </div>
              )}
              {(editingProfile?.boilerplateExclusions || []).map((ex, i) => (
                <div key={ex.id} style={{ display: "flex", alignItems: "start", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, paddingTop: 7, minWidth: 16 }}>
                    {i + 1}.
                  </span>
                  <textarea
                    value={ex.text}
                    onChange={e => {
                      if (readOnly) return;
                      const list = (editingProfile?.boilerplateExclusions || []).map(x =>
                        x.id === ex.id ? { ...x, text: e.target.value } : x,
                      );
                      updateField("boilerplateExclusions", list);
                    }}
                    readOnly={readOnly}
                    placeholder="e.g. Site work, landscaping, and paving are excluded from this proposal."
                    rows={1}
                    style={{
                      ...inp(C, { padding: "5px 10px", fontSize: 11, resize: readOnly ? "none" : "vertical", minHeight: 28 }),
                      flex: 1,
                      fontFamily: T.font.sans,
                      lineHeight: 1.5,
                      ...(readOnly && { opacity: 0.75, cursor: "default" }),
                    }}
                  />
                  {!readOnly && <button
                    onClick={() => {
                      const list = (editingProfile?.boilerplateExclusions || []).filter(x => x.id !== ex.id);
                      updateField("boilerplateExclusions", list);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      marginTop: 3,
                      opacity: 0.5,
                    }}
                    title="Remove"
                  >
                    <Ic d={I.x} size={10} color={C.red} />
                  </button>}
                </div>
              ))}
            </div>

            {/* Boilerplate Notes (Clarifications / Qualifications) */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.text }}>Notes &amp; Clarifications</span>
                {!readOnly && <button
                  onClick={() => {
                    const list = [
                      ...(editingProfile?.boilerplateNotes || []),
                      { id: uid(), text: "", category: "clarification" },
                    ];
                    updateField("boilerplateNotes", list);
                  }}
                  style={{
                    background: `${C.accent}10`,
                    border: `1px solid ${C.accent}30`,
                    borderRadius: 4,
                    padding: "2px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                    color: C.accent,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ic d={I.plus} size={9} color={C.accent} /> Add
                </button>}
              </div>
              {(editingProfile?.boilerplateNotes || []).length === 0 && (
                <div style={{ fontSize: 10, color: C.textDim, fontStyle: "italic", padding: "6px 0" }}>
                  No default notes yet
                </div>
              )}
              {(editingProfile?.boilerplateNotes || []).map((note, i) => (
                <div key={note.id} style={{ display: "flex", alignItems: "start", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, paddingTop: 7, minWidth: 16 }}>
                    {i + 1}.
                  </span>
                  <select
                    value={note.category || "clarification"}
                    onChange={e => {
                      if (readOnly) return;
                      const list = (editingProfile?.boilerplateNotes || []).map(n =>
                        n.id === note.id ? { ...n, category: e.target.value } : n,
                      );
                      updateField("boilerplateNotes", list);
                    }}
                    disabled={readOnly}
                    style={{
                      ...inp(C, { padding: "4px 6px", fontSize: 9, width: 90, minWidth: 90 }),
                      fontWeight: 600,
                      marginTop: 1,
                      ...(readOnly && { opacity: 0.75, cursor: "default" }),
                    }}
                  >
                    <option value="clarification">Clarification</option>
                    <option value="qualification">Qualification</option>
                    <option value="note">Note</option>
                  </select>
                  <textarea
                    value={note.text}
                    onChange={e => {
                      if (readOnly) return;
                      const list = (editingProfile?.boilerplateNotes || []).map(n =>
                        n.id === note.id ? { ...n, text: e.target.value } : n,
                      );
                      updateField("boilerplateNotes", list);
                    }}
                    readOnly={readOnly}
                    placeholder="e.g. Pricing valid for 30 days from date of proposal."
                    rows={1}
                    style={{
                      ...inp(C, { padding: "5px 10px", fontSize: 11, resize: readOnly ? "none" : "vertical", minHeight: 28 }),
                      flex: 1,
                      fontFamily: T.font.sans,
                      lineHeight: 1.5,
                      ...(readOnly && { opacity: 0.75, cursor: "default" }),
                    }}
                  />
                  {!readOnly && <button
                    onClick={() => {
                      const list = (editingProfile?.boilerplateNotes || []).filter(n => n.id !== note.id);
                      updateField("boilerplateNotes", list);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      marginTop: 3,
                      opacity: 0.5,
                    }}
                    title="Remove"
                  >
                    <Ic d={I.x} size={10} color={C.red} />
                  </button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: C.textDim }}>
        Company info appears on proposal letterheads, bid forms, and reports. Upload a logo to auto-extract brand color
        palettes. Select a profile per-project on the Project Info page.
      </div>
    </Sec>
  );
}

// ── Project Access (manager/owner only) ──
function ProjectAccessSection() {
  const C = useTheme();
  const T = C.T;
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const setVisibility = useEstimatesStore(s => s.setVisibility);
  const assignEstimate = useEstimatesStore(s => s.assignEstimate);
  const members = useOrgStore(s => s.members);
  const fetchMembers = useOrgStore(s => s.fetchMembers);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  useEffect(() => {
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable action
  }, []);

  // Map user_id -> display_name for quick lookup
  const memberMap = {};
  members.forEach(m => {
    memberMap[m.user_id] = m.display_name || m.user_id?.slice(0, 8);
  });

  const getMemberName = userId => memberMap[userId] || userId?.slice(0, 8) || "Unknown";

  // Filter to non-trashed estimates
  const estimates = estimatesIndex.filter(e => e.status !== "Trash");

  const toggleAssignment = (estimateId, userId, currentAssigned) => {
    const arr = currentAssigned || [];
    const next = arr.includes(userId) ? arr.filter(id => id !== userId) : [...arr, userId];
    assignEstimate(estimateId, next);
  };

  return (
    <Sec title="Project Access" icon={I.shield}>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        Control which estimates your team can see. <strong style={{ color: C.textDim }}>Private</strong> = owner only,{" "}
        <strong style={{ color: C.textDim }}>Assigned</strong> = owner + selected users,{" "}
        <strong style={{ color: C.textDim }}>Org-Wide</strong> = everyone in the organization.
      </div>

      {estimates.length === 0 ? (
        <div style={{ fontSize: 11, color: C.textDim, fontStyle: "italic", padding: "12px 0" }}>
          No estimates found.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 140px 1fr",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${C.border}`,
              marginBottom: 2,
            }}
          >
            {["Estimate Name", "Owner", "Visibility", "Assigned To"].map(h => (
              <div key={h} style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {h}
              </div>
            ))}
          </div>

          {/* Table rows */}
          {estimates.map(est => {
            const vis = est.visibility || "private";
            const assigned = est.assignedTo || [];
            const isDropdownOpen = openDropdownId === est.id;

            return (
              <div
                key={est.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 140px 1fr",
                  gap: 8,
                  padding: "8px 12px",
                  borderBottom: `1px solid ${C.border}20`,
                  alignItems: "center",
                }}
              >
                {/* Estimate name */}
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {est.name || "Untitled"}
                </div>

                {/* Owner */}
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  {getMemberName(est.ownerId)}
                </div>

                {/* Visibility dropdown */}
                <select
                  value={vis}
                  onChange={e => setVisibility(est.id, e.target.value)}
                  style={{
                    ...inp(C, { padding: "4px 6px", fontSize: 10, fontWeight: 600 }),
                    cursor: "pointer",
                  }}
                >
                  <option value="private">Private</option>
                  <option value="assigned">Assigned</option>
                  <option value="org">Org-Wide</option>
                </select>

                {/* Assigned To */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", position: "relative" }}>
                  {assigned.map(userId => (
                    <span
                      key={userId}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: C.text,
                        background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                        padding: "2px 8px",
                        borderRadius: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {getMemberName(userId)}
                      <span
                        onClick={() => toggleAssignment(est.id, userId, assigned)}
                        style={{ cursor: "pointer", opacity: 0.5, lineHeight: 1 }}
                        title="Remove"
                      >
                        x
                      </span>
                    </span>
                  ))}

                  {/* Add button */}
                  <button
                    onClick={() => setOpenDropdownId(isDropdownOpen ? null : est.id)}
                    style={{
                      background: `${C.accent}10`,
                      border: `1px solid ${C.accent}30`,
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      color: C.accent,
                      cursor: "pointer",
                    }}
                  >
                    + Add
                  </button>

                  {/* Assignment dropdown */}
                  {isDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        zIndex: 100,
                        background: C.bg1,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        padding: 4,
                        marginTop: 4,
                        minWidth: 180,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                      }}
                    >
                      {members.map(m => {
                        const isAssigned = assigned.includes(m.user_id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => toggleAssignment(est.id, m.user_id, assigned)}
                            style={{
                              padding: "6px 10px",
                              fontSize: 11,
                              color: C.text,
                              cursor: "pointer",
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              background: isAssigned ? `${C.accent}15` : "transparent",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}20`; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isAssigned ? `${C.accent}15` : "transparent"; }}
                          >
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                border: `1.5px solid ${isAssigned ? C.accent : C.textDim}`,
                                background: isAssigned ? C.accent : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {isAssigned && <Ic d={I.check} size={9} color="#fff" sw={2.5} />}
                            </div>
                            <span style={{ fontWeight: isAssigned ? 600 : 400 }}>
                              {m.display_name || m.user_id?.slice(0, 8)}
                            </span>
                            <span style={{ fontSize: 9, color: C.textDim, marginLeft: "auto" }}>
                              {m.role}
                            </span>
                          </div>
                        );
                      })}
                      {members.length === 0 && (
                        <div style={{ fontSize: 10, color: C.textDim, padding: 8, fontStyle: "italic" }}>
                          No team members found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Sec>
  );
}

// Email Inbox settings sub-component
function EmailInboxSection({ C, T, showToast }) {
  const user = useAuthStore(s => s.user);
  const { registerSenderEmail, removeSenderEmail, fetchSenderEmails } = useInboxStore();
  const [senderEmails, setSenderEmails] = useState([]);
  const [newSender, setNewSender] = useState("");

  useEffect(() => {
    fetchSenderEmails().then(setSenderEmails);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand action is stable; run once on mount
  }, []);

  const handleAddSender = async () => {
    if (!newSender) return;
    const result = await registerSenderEmail(newSender);
    if (result.error) {
      showToast(result.error);
    } else {
      setSenderEmails(prev => [...prev, newSender.toLowerCase()]);
      setNewSender("");
      showToast("Sender email registered");
    }
  };

  const handleRemoveSender = async email => {
    await removeSenderEmail(email);
    setSenderEmails(prev => prev.filter(e => e !== email));
    showToast("Sender email removed");
  };

  return (
    <Sec title="Email Inbox (AI-Powered RFP Ingestion)">
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
        Forward RFP emails to your dedicated address. AI will parse bid information, extract contacts, and create draft
        estimates automatically.
      </div>

      <div>
        {/* Auth status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div
            style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}60` }}
          />
          <span style={{ fontSize: 12, color: C.text }}>{user?.email}</span>
        </div>

        {/* Forwarding address */}
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: `${C.accent}08`,
            border: `1px solid ${C.accent}20`,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>
            YOUR FORWARDING ADDRESS
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: T.font.sans }}>
            bids@novabuild.app
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Forward RFP emails here. They will appear in your Inbox within seconds.
          </div>
        </div>

        {/* Registered sender emails */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, marginBottom: 8 }}>
            REGISTERED SENDER EMAILS
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
            Only emails from these addresses will be processed. Add the email addresses you forward from.
          </div>

          {senderEmails.map(email => (
            <div
              key={email}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 6,
                background: C.bg,
                border: `1px solid ${C.border}`,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 12, color: C.text, fontFamily: T.font.sans }}>{email}</span>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                onClick={() => handleRemoveSender(email)}
              >
                <Ic d={I.x} size={12} color={C.textDim} />
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              type="email"
              value={newSender}
              onChange={e => setNewSender(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddSender()}
              placeholder="sender@example.com"
              style={inp(C, { flex: 1, fontSize: 12 })}
            />
            <button
              style={bt(C, { padding: "6px 12px", fontSize: 11, background: C.accent, color: "#fff" })}
              onClick={handleAddSender}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Sec>
  );
}
