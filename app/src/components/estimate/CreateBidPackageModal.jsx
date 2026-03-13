import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import {
  getTradeLabel,
  getTradeSortOrder,
  autoTradeFromCode,
  TRADE_MAP,
} from "@/constants/tradeGroupings";
import { CSI } from "@/constants/csi";
import { generateScopeSheet } from "@/utils/scopeSheetGenerator";
import { callAnthropic } from "@/utils/ai";

const STEPS = [
  { key: "details", label: "Details", icon: I.edit },
  { key: "scope", label: "Select Scope", icon: I.estimate },
  { key: "drawings", label: "Select Drawings", icon: I.plans },
];

export default function CreateBidPackageModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const [step, setStep] = useState(0);

  // Store data
  const items = useItemsStore(s => s.items);
  const drawings = useDrawingsStore(s => s.drawings);
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const addBidPackage = useBidPackagesStore(s => s.addBidPackage);
  const presets = useBidPackagesStore(s => s.bidPackagePresets);
  const addPreset = useBidPackagesStore(s => s.addPreset);
  const user = useAuthStore(s => s.user);
  const showToast = useUiStore(s => s.showToast);

  // Form state
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedDrawings, setSelectedDrawings] = useState(() => drawings.map(d => d.id));
  const [packageName, setPackageName] = useState("RFP - " + (project.name || ""));
  const [dueDate, setDueDate] = useState(project.bidDue || "");
  const [coverMessage, setCoverMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [groupMode, setGroupMode] = useState("trade");
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [aiInfilling, setAiInfilling] = useState(false);

  const handleLoadPreset = async preset => {
    setShowPresetPicker(false);
    if (preset.scopeFilter?.selectedTradeKeys?.length > 0) {
      const tradeKeys = new Set(preset.scopeFilter.selectedTradeKeys);
      const matched = items
        .filter(item => {
          const trade = item.trade || autoTradeFromCode(item.code);
          return trade && tradeKeys.has(trade);
        })
        .map(i => i.id);
      if (matched.length > 0) setSelectedItems(matched);
      if (preset.scopeFilter.groupMode) setGroupMode(preset.scopeFilter.groupMode);
    }
    if (preset.drawingFilter?.strategy === "all") {
      setSelectedDrawings(drawings.map(d => d.id));
    }
    if (preset.defaultNameTemplate) {
      setPackageName(
        preset.defaultNameTemplate
          .replace(/\{\{projectName\}\}/g, project.name || "")
          .replace(/\{\{dueDate\}\}/g, project.bidDue || ""),
      );
    }
    if (preset.coverMessageTemplate) {
      setAiInfilling(true);
      try {
        const result = await callAnthropic({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system:
            "You are NOVA, an AI assistant for a general contractor. Given a cover message template and project details, fill in the template with specific project information. Return ONLY the filled-in message text, no JSON wrapping.",
          messages: [
            {
              role: "user",
              content: `Template:\n${preset.coverMessageTemplate}\n\nProject Details:\n- Name: ${project.name}\n- Due Date: ${project.bidDue || "TBD"}\n- Job Type: ${project.jobType || "Commercial"}\n\nFill in the template with these project-specific details.`,
            },
          ],
          temperature: 0.3,
        });
        const text = result?.content?.[0]?.text || preset.coverMessageTemplate;
        setCoverMessage(text);
      } catch {
        setCoverMessage(
          preset.coverMessageTemplate
            .replace(/\{\{projectName\}\}/g, project.name || "")
            .replace(/\{\{dueDate\}\}/g, project.bidDue || ""),
        );
      }
      setAiInfilling(false);
    }
    showToast(`Template "${preset.name}" loaded`);
  };

  const handleSaveAsTemplate = () => {
    const selectedTradeKeys = [];
    const selectedSet = new Set(selectedItems);
    for (const item of items) {
      if (!selectedSet.has(item.id)) continue;
      const trade = item.trade || autoTradeFromCode(item.code);
      if (trade && !selectedTradeKeys.includes(trade)) selectedTradeKeys.push(trade);
    }
    addPreset({
      name: packageName || "Untitled Template",
      description: `${selectedItems.length} scope items, ${selectedDrawings.length} drawings`,
      scopeFilter: { groupMode, selectedTradeKeys },
      drawingFilter: { strategy: selectedDrawings.length === drawings.length ? "all" : "byType" },
      coverMessageTemplate: coverMessage || "",
      defaultNameTemplate: packageName.replace(project.name || "", "{{projectName}}"),
    });
    showToast("Saved as template for future use");
  };

  // Group items by the active grouping mode
  const groups = useMemo(() => {
    const map = {};
    for (const item of items) {
      let key, label, sort;
      if (groupMode === "trade") {
        key = item.trade || autoTradeFromCode(item.code) || "_unassigned";
        label = getTradeLabel(item);
        sort = getTradeSortOrder(item);
      } else if (groupMode === "subdivision") {
        key = item.code || "00.000";
        const div = key.split(".")[0];
        const subName = CSI[div]?.subs?.[key];
        label = `${key} — ${subName || "Unknown"}`;
        sort = key;
      } else {
        key = item.division || item.code?.slice(0, 2) || "00";
        label = item.divisionLabel || CSI[key]?.name || `Division ${key}`;
        sort = key;
      }
      if (!map[key]) map[key] = { key, label, sort, items: [] };
      map[key].items.push(item);
    }
    return Object.values(map).sort((a, b) =>
      typeof a.sort === "number" && typeof b.sort === "number"
        ? a.sort - b.sort
        : String(a.sort).localeCompare(String(b.sort)),
    );
  }, [items, groupMode]);

  const toggleItem = itemId => {
    setSelectedItems(prev => (prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]));
  };

  const toggleGroup = groupKey => {
    const groupItems = groups.find(g => g.key === groupKey)?.items || [];
    const groupIds = groupItems.map(i => i.id);
    const allSelected = groupIds.every(id => selectedItems.includes(id));
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !groupIds.includes(id)));
    } else {
      setSelectedItems(prev => [...new Set([...prev, ...groupIds])]);
    }
  };

  const toggleDrawing = drawingId => {
    setSelectedDrawings(prev =>
      prev.includes(drawingId) ? prev.filter(id => id !== drawingId) : [...prev, drawingId],
    );
  };

  // ── Create Package (no invitations) ──
  const handleCreate = async () => {
    if (!packageName.trim()) {
      showToast("Please enter a package name", "error");
      return;
    }

    setCreating(true);
    try {
      const selectedEstItems = items.filter(i => selectedItems.includes(i.id));
      const scopeItems = selectedEstItems.map(i => ({
        id: i.id,
        code: i.code,
        description: i.description,
        division: i.division,
      }));
      const scopeSheet = generateScopeSheet(selectedEstItems, CSI);

      // Create package in store (local-first)
      const pkgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      addBidPackage({
        id: pkgId,
        estimateId,
        name: packageName,
        scopeItems,
        scopeSheet: scopeSheet.plainText,
        drawingIds: selectedDrawings,
        coverMessage,
        dueDate: dueDate || null,
      });

      // Create on server
      const token = useAuthStore.getState().session?.access_token;
      const resp = await fetch("/api/bid-package", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          estimateId,
          name: packageName,
          scopeItems,
          scopeSheet: scopeSheet.html,
          drawingIds: selectedDrawings,
          coverMessage,
          dueDate: dueDate || null,
          subs: [], // No invitations — subs added separately
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create bid package");
      }

      showToast("Package created — invite subs when ready", "success");
      onClose();
    } catch (err) {
      console.error("Create bid package error:", err);
      showToast(err.message || "Failed to create bid package", "error");
    } finally {
      setCreating(false);
    }
  };

  const canNext = () => {
    if (step === 0) return packageName.trim().length > 0;
    return true;
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: T.font.sans,
  };

  const checkboxStyle = checked => ({
    width: 18,
    height: 18,
    borderRadius: 4,
    border: `2px solid ${checked ? C.accent : C.border}`,
    background: checked ? C.accent : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 150ms",
  });

  return (
    <Modal onClose={onClose} extraWide>
      {/* Step indicators */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              cursor: i < step ? "pointer" : "default",
              opacity: i <= step ? 1 : 0.4,
            }}
            onClick={() => i < step && setStep(i)}
          >
            <div
              style={{
                height: 3,
                width: "100%",
                borderRadius: 2,
                background: i <= step ? C.accent : C.border,
                transition: "background 200ms",
              }}
            />
            <span style={{ fontSize: 10, color: i === step ? C.accent : C.textMuted, fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div style={{ minHeight: 340, maxHeight: 440, overflowY: "auto" }}>
        {/* Step 1: Details */}
        {step === 0 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Package Details</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 16px" }}>
              Name your package and set the due date. You'll invite subs after creating it.
            </p>

            {/* Template picker */}
            {presets.length > 0 && !showPresetPicker && (
              <button
                onClick={() => setShowPresetPicker(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "8px 12px",
                  marginBottom: 12,
                  borderRadius: 8,
                  background: `${C.accent}08`,
                  border: `1px dashed ${C.accent}30`,
                  color: C.accent,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: T.font.sans,
                }}
              >
                <Ic d={I.copy || I.plans} size={12} color={C.accent} /> Use Template ({presets.length} saved)
              </button>
            )}
            {showPresetPicker && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: `${C.accent}06`,
                  border: `1px solid ${C.accent}20`,
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Templates</span>
                  <button
                    onClick={() => setShowPresetPicker(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.textDim,
                      fontSize: 10,
                      cursor: "pointer",
                      fontFamily: T.font.sans,
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {presets.map(preset => (
                  <div
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${C.border}`,
                      marginBottom: 4,
                      transition: "all 150ms",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent + "40")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{preset.name}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{preset.description}</div>
                  </div>
                ))}
              </div>
            )}

            {aiInfilling && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: 12,
                  borderRadius: 8,
                  background: `${C.accent}10`,
                  border: `1px solid ${C.accent}30`,
                  fontSize: 11,
                  color: C.accent,
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                NOVA is customizing your template...
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Package Name *
              </label>
              <input
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="e.g., RFP - MEP Bid Package"
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Due Date
              </label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Cover Message (optional)
              </label>
              <textarea
                value={coverMessage}
                onChange={e => setCoverMessage(e.target.value)}
                placeholder="Add any special instructions or notes for the subs..."
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>
        )}

        {/* Step 2: Select Scope */}
        {step === 1 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Select Scope Items</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 12px" }}>
              Choose scope items to include in this bid package.
            </p>
            {/* Grouping mode segmented control */}
            <div
              style={{
                display: "inline-flex",
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${C.border}`,
                marginBottom: 14,
              }}
            >
              {[
                { key: "trade", label: "Trade Bundles" },
                { key: "subdivision", label: "Subdivision" },
                { key: "division", label: "Division" },
              ].map((mode, i) => (
                <button
                  key={mode.key}
                  onClick={() => setGroupMode(mode.key)}
                  style={{
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    borderLeft: i > 0 ? `1px solid ${C.border}` : "none",
                    background: groupMode === mode.key ? C.accent : "transparent",
                    color: groupMode === mode.key ? "#fff" : C.textMuted,
                    transition: "all 150ms",
                    fontFamily: T.font.sans,
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {groups.map(group => {
              const groupIds = group.items.map(i => i.id);
              const allSel = groupIds.every(id => selectedItems.includes(id));
              const someSel = groupIds.some(id => selectedItems.includes(id));
              return (
                <div key={group.key} style={{ marginBottom: 8 }}>
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <div style={checkboxStyle(allSel)}>
                      {allSel && <Ic d={I.check} size={12} color="#fff" />}
                      {!allSel && someSel && (
                        <div style={{ width: 8, height: 2, background: C.accent, borderRadius: 1 }} />
                      )}
                    </div>
                    <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{group.label}</span>
                    <span style={{ color: C.textDim, fontSize: 11 }}>({group.items.length})</span>
                  </div>
                  {(allSel || someSel) && (
                    <div style={{ paddingLeft: 28 }}>
                      {group.items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 0",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          <div style={checkboxStyle(selectedItems.includes(item.id))}>
                            {selectedItems.includes(item.id) && <Ic d={I.check} size={10} color="#fff" />}
                          </div>
                          <span style={{ color: C.textMuted }}>
                            {item.code} — {item.description || "Untitled"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: "center", padding: 40 }}>
                No items in this estimate yet. Add line items first.
              </p>
            )}

            {/* Scope summary preview */}
            {selectedItems.length > 0 &&
              (() => {
                const scopeSheet = generateScopeSheet(
                  items.filter(i => selectedItems.includes(i.id)),
                  CSI,
                );
                return scopeSheet.divisions.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <label
                      style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}
                    >
                      Scope Summary (auto-generated, included in invite)
                    </label>
                    <div
                      style={{
                        maxHeight: 140,
                        overflowY: "auto",
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${C.border}`,
                        fontSize: 12,
                        color: C.textMuted,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {scopeSheet.plainText}
                    </div>
                  </div>
                ) : null;
              })()}
          </div>
        )}

        {/* Step 3: Select Drawings */}
        {step === 2 && (
          <div>
            <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>Select Drawings</h3>
            <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 16px" }}>
              Choose which drawings to share with subcontractors. They'll be able to download these.
            </p>
            {drawings.length === 0 ? (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: "center", padding: 40 }}>
                No drawings uploaded yet. You can skip this step.
              </p>
            ) : (
              <>
                <button
                  onClick={() => {
                    const allIds = drawings.map(d => d.id);
                    setSelectedDrawings(selectedDrawings.length === allIds.length ? [] : allIds);
                  }}
                  style={{
                    background: "none",
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    borderRadius: 6,
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: 10,
                  }}
                >
                  {selectedDrawings.length === drawings.length ? "Deselect All" : "Select All"}
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {drawings.map(d => {
                    const sel = selectedDrawings.includes(d.id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => toggleDrawing(d.id)}
                        style={{
                          border: `2px solid ${sel ? C.accent : C.border}`,
                          borderRadius: 10,
                          padding: 8,
                          cursor: "pointer",
                          background: sel ? `${C.accent}10` : "transparent",
                          transition: "all 150ms",
                        }}
                      >
                        {d.data && (
                          <img
                            src={d.data}
                            alt=""
                            style={{
                              width: "100%",
                              height: 80,
                              objectFit: "cover",
                              borderRadius: 6,
                              marginBottom: 6,
                            }}
                          />
                        )}
                        <div
                          style={{
                            fontSize: 11,
                            color: C.text,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.label || d.name || "Drawing"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Save as Template */}
            <button
              onClick={handleSaveAsTemplate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 16,
                padding: "8px 14px",
                background: "none",
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                color: C.textMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: T.font.sans,
                width: "100%",
                justifyContent: "center",
              }}
            >
              <Ic d={I.save || I.check} size={12} color={C.textDim} /> Save as Template
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={step === 0 ? onClose : () => setStep(step - 1)}
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          {step === 2 && selectedDrawings.length === 0 && (
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                background: "none",
                border: "none",
                color: C.textMuted,
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 500,
                fontFamily: T.font.sans,
              }}
            >
              Skip & Create
            </button>
          )}
          <button
            onClick={step === 2 ? handleCreate : () => setStep(step + 1)}
            disabled={!canNext() || creating}
            style={{
              background: canNext() ? `linear-gradient(135deg, ${C.accent}, #BF5AF2)` : C.border,
              color: canNext() ? "#fff" : C.textDim,
              border: "none",
              borderRadius: 8,
              padding: "8px 24px",
              fontSize: 13,
              fontWeight: 600,
              cursor: canNext() ? "pointer" : "not-allowed",
              opacity: creating ? 0.6 : 1,
              fontFamily: T.font.sans,
            }}
          >
            {creating ? "Creating..." : step === 2 ? "Create Package" : "Next"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
