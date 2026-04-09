import { useState, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, fmt2, titleCase } from "@/utils/format";
import { autoDirective } from "@/utils/directives";
import { UNITS } from "@/constants/units";
import EmptyState from "@/components/shared/EmptyState";
import { useDatabaseStore } from "@/stores/databaseStore";
import { exportUserElementsCsv } from "@/utils/csvExport";

export default function ItemsListPanel({
  C,
  T,
  elements,
  activeCodes,
  activeBundles,
  bundleMap,
  sortedDbElements,
  dbVisibleElements,
  dbSearch,
  setDbSearch,
  dbSelectedSub,
  setDbSelectedSub,
  showOverridesOnly,
  setShowOverridesOnly,
  overrideSummary,
  updateElement,
  removeElement,
  duplicateElement,
  revertOverride,
  getMasterVersion,
  addFromDB,
  showToast,
  project,
  estimators,
  setSubProposalOpen,
  setCsvImportOpen,
  gridCols,
}) {
  const [editingId, setEditingId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [moveCode, setMoveCode] = useState("");
  const [compareId, setCompareId] = useState(null);

  // Dismiss row action menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = e => {
      if (e.target.closest(".icon-btn")) return;
      setMenuOpenId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  return (
    <div
      style={{
        flex: 1,
        background: C.bg1,
        borderRadius: `0 ${T.radius.md}px ${T.radius.md}px 0`,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <input
            placeholder="Search items..."
            value={dbSearch}
            onChange={e => {
              setDbSearch(e.target.value);
              if (e.target.value) setDbSelectedSub(null);
            }}
            style={inp(C, { paddingLeft: 28, fontSize: 12 })}
          />
          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
            <Ic d={I.search} size={12} color={C.textDim} />
          </div>
        </div>
        {dbSelectedSub && (
          <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
            {dbSelectedSub} — {activeCodes[dbSelectedSub.split(".")[0]]?.subs?.[dbSelectedSub] || ""}
          </span>
        )}
        <button
          onClick={() => setShowOverridesOnly(!showOverridesOnly)}
          style={bt(C, {
            background: showOverridesOnly ? `${C.orange}18` : "transparent",
            border: `1px solid ${showOverridesOnly ? C.orange : C.border}`,
            color: showOverridesOnly ? C.orange : C.textMuted,
            padding: "4px 10px",
            fontSize: 10,
            fontWeight: showOverridesOnly ? 700 : 500,
          })}
        >
          My Overrides
          {overrideSummary.total > 0 && (
            <span
              style={{
                marginLeft: 4,
                fontSize: 8,
                fontWeight: 700,
                background: showOverridesOnly ? C.orange : C.textDim,
                color: "#fff",
                padding: "1px 5px",
                borderRadius: 8,
                minWidth: 14,
                textAlign: "center",
                display: "inline-block",
              }}
            >
              {overrideSummary.total}
            </span>
          )}
        </button>
        <button
          className="accent-btn"
          onClick={() => {
            const sub = dbSelectedSub || "";
            let code = sub;
            if (sub) {
              const existing = elements.filter(el => el.code && el.code.startsWith(sub + "."));
              const nums = existing
                .map(el => {
                  const tail = el.code.slice(sub.length + 1);
                  return parseInt(tail, 10);
                })
                .filter(n => !isNaN(n));
              const next = nums.length > 0 ? Math.max(...nums) + 10 : 10;
              code = `${sub}.${String(next).padStart(2, "0")}`;
            }
            const userName = project?.estimator || (estimators.length > 0 ? estimators[0].name : "");
            useDatabaseStore.getState().addElement({
              code,
              name: "",
              unit: "EA",
              material: 0,
              labor: 0,
              equipment: 0,
              subcontractor: 0,
              directive: "",
              addedBy: userName,
              addedDate: new Date().toLocaleDateString(),
              specVariants: [],
              specText: "",
            });
            showToast("New scope item created");
          }}
          style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}
        >
          <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Create Scope Item
        </button>
        <button
          className="accent-btn"
          onClick={() => setSubProposalOpen(true)}
          style={bt(C, {
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: "#fff",
            padding: "5px 12px",
            fontSize: 10,
            border: "none",
            boxShadow: `0 1px 6px ${C.accent}30`,
          })}
        >
          <Ic d={I.upload} size={11} color="#fff" /> Import Sub Proposal
        </button>
        <button
          className="ghost-btn"
          onClick={() => {
            const userEls = useDatabaseStore.getState().getUserElements();
            if (userEls.length === 0) {
              showToast("No user items to export", "warning");
              return;
            }
            exportUserElementsCsv(userEls);
            showToast(`Exported ${userEls.length} item${userEls.length !== 1 ? "s" : ""} to CSV`);
          }}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.text,
            padding: "5px 10px",
            fontSize: 10,
          })}
        >
          <Ic d={I.download} size={11} color={C.textMuted} /> Export CSV
        </button>
        <button
          className="ghost-btn"
          onClick={() => setCsvImportOpen(true)}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.text,
            padding: "5px 10px",
            fontSize: 10,
          })}
        >
          <Ic d={I.upload} size={11} color={C.textMuted} /> Import CSV
        </button>
        {showOverridesOnly && overrideSummary.overrideCount > 0 && (
          <button
            className="ghost-btn"
            onClick={() => {
              if (
                confirm(
                  `Revert all ${overrideSummary.overrideCount} override${overrideSummary.overrideCount !== 1 ? "s" : ""} to master pricing? This cannot be undone.`,
                )
              ) {
                const overrides = elements.filter(e => e.source !== "master" && e.masterItemId);
                overrides.forEach(o => revertOverride(o.id));
                showToast(
                  `Reverted ${overrides.length} override${overrides.length !== 1 ? "s" : ""} to master pricing`,
                );
              }
            }}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.orange}`,
              color: C.orange,
              padding: "5px 10px",
              fontSize: 10,
            })}
          >
            <Ic d={I.refresh} size={11} color={C.orange} /> Revert All Overrides
          </button>
        )}
        {elements.length > 0 && (
          <button
            className="ghost-btn"
            onClick={() => {
              if (confirm("Clear ALL scope items from database? This cannot be undone.")) {
                useDatabaseStore.getState().setElements([]);
              }
            }}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.red}`,
              color: C.red,
              padding: "5px 10px",
              fontSize: 9,
            })}
          >
            Clear All
          </button>
        )}
        <span style={{ fontSize: 10, color: C.textDim }}>{dbVisibleElements.length} items</span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 9,
          fontWeight: 600,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        <div>Code</div>
        <div>Dir</div>
        <div>Item</div>
        <div>Bundle</div>
        <div style={{ textAlign: "right" }}>Unit</div>
        <div style={{ textAlign: "right" }}>Matl</div>
        <div style={{ textAlign: "right" }}>Labor</div>
        <div style={{ textAlign: "right" }}>Equip</div>
        <div style={{ textAlign: "right" }}>Sub</div>
        <div style={{ textAlign: "right" }}>Added By</div>
        <div></div>
      </div>

      {/* Move bar */}
      {movingId &&
        (() => {
          const movingEl = elements.find(e => e.id === movingId);
          if (!movingEl) return null;
          const canConfirm = moveCode && moveCode !== movingEl.code;
          const chips = Object.entries(activeCodes)
            .flatMap(([_dc, div]) =>
              Object.entries(div.subs || {})
                .filter(([sk]) => !moveCode || sk.startsWith(moveCode.split(".")[0]))
                .slice(0, 12)
                .map(([sk, name]) => ({ sk, name })),
            )
            .slice(0, 10);
          return (
            <div
              style={{
                padding: "8px 14px",
                background: C.accentBg,
                borderBottom: `2px solid ${C.accent}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              <Ic d={I.move} size={14} color={C.accent} />
              <span
                style={{
                  fontWeight: 600,
                  color: C.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 200,
                }}
              >
                Move "{movingEl.name}"
              </span>
              <span style={{ color: C.textDim, fontSize: 10, flexShrink: 0 }}>to:</span>
              <input
                value={moveCode}
                onChange={e => setMoveCode(e.target.value)}
                placeholder="e.g. 05.210"
                autoFocus
                style={inp(C, {
                  width: 110,
                  fontFamily: T.font.sans,
                  fontSize: 11,
                  padding: "4px 8px",
                })}
                onKeyDown={e => {
                  if (e.key === "Enter" && canConfirm) {
                    updateElement(movingId, "code", moveCode);
                    showToast(`Moved to ${moveCode}`);
                    setMovingId(null);
                    setMoveCode("");
                  }
                  if (e.key === "Escape") {
                    setMovingId(null);
                    setMoveCode("");
                  }
                }}
              />
              <div style={{ display: "flex", gap: 3, flex: 1, overflow: "hidden", flexWrap: "wrap" }}>
                {chips.map(({ sk, name: _name }) => (
                  <button
                    key={sk}
                    onClick={() => setMoveCode(sk)}
                    style={{
                      padding: "2px 7px",
                      fontSize: 8,
                      fontWeight: 600,
                      background: moveCode === sk ? C.accent : C.bg,
                      color: moveCode === sk ? "#fff" : C.textMuted,
                      border: `1px solid ${moveCode === sk ? C.accent : C.border}`,
                      borderRadius: 4,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sk}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (canConfirm) {
                    updateElement(movingId, "code", moveCode);
                    showToast(`Moved "${movingEl.name}" to ${moveCode}`);
                  }
                  setMovingId(null);
                  setMoveCode("");
                }}
                disabled={!canConfirm}
                style={bt(C, {
                  background: canConfirm ? C.accent : C.bg3,
                  color: canConfirm ? "#fff" : C.textDim,
                  padding: "4px 12px",
                  fontSize: 10,
                  fontWeight: 600,
                  flexShrink: 0,
                })}
              >
                <Ic d={I.check} size={10} color={canConfirm ? "#fff" : C.textDim} sw={2.5} /> Move
              </button>
              <button
                onClick={() => {
                  setMovingId(null);
                  setMoveCode("");
                }}
                style={bt(C, {
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  padding: "4px 10px",
                  fontSize: 10,
                  flexShrink: 0,
                })}
              >
                Cancel
              </button>
            </div>
          );
        })()}

      {/* Items list -- virtualized for performance with large databases */}
      {sortedDbElements.length > 0 ? (
        <Virtuoso
          style={{ flex: 1 }}
          data={sortedDbElements}
          overscan={200}
          itemContent={(idx, el) => {
            const dirColor =
              el.directive === "F/O"
                ? C.blue
                : el.directive === "I/O"
                  ? C.orange
                  : el.directive === "F/I"
                    ? C.green
                    : C.textDim;
            const isEditing = editingId === el.id;
            const tradeLabel = el.trade ? bundleMap[el.trade]?.label || el.trade : "";
            const editField = (field, value) => {
              updateElement(el.id, field, value);
              if (
                ["material", "labor", "equipment", "subcontractor"].includes(field) &&
                !el.directiveOverride
              ) {
                const m = field === "material" ? nn(value) : nn(el.material);
                const l = field === "labor" ? nn(value) : nn(el.labor);
                const e = field === "equipment" ? nn(value) : nn(el.equipment);
                const s = field === "subcontractor" ? nn(value) : nn(el.subcontractor);
                updateElement(el.id, "directive", autoDirective(m, l, e, s));
              }
            };
            return (
              <div
                key={el.id}
                className="db-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  padding: isEditing ? "5px 14px" : "7px 14px",
                  borderBottom: `1px solid ${C.bg}`,
                  alignItems: "center",
                  background: isEditing ? C.accentBg : idx % 2 === 1 ? C.bg2 + "40" : "transparent",
                  animation:
                    idx < 40
                      ? `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 25}ms both`
                      : undefined,
                }}
              >
                {isEditing ? (
                  <>
                    <input
                      value={el.code}
                      onChange={e => editField("code", e.target.value)}
                      style={inp(C, {
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        padding: "3px 4px",
                        textAlign: "center",
                      })}
                    />
                    <select
                      value={el.directive || ""}
                      onChange={e => {
                        updateElement(el.id, "directive", e.target.value);
                        updateElement(el.id, "directiveOverride", !!e.target.value);
                      }}
                      style={inp(C, {
                        fontSize: 8,
                        padding: "2px 1px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: dirColor,
                      })}
                    >
                      <option value="">Auto</option>
                      <option value="F/I">F/I</option>
                      <option value="F/O">F/O</option>
                      <option value="I/O">I/O</option>
                    </select>
                    <input
                      value={el.name}
                      onChange={e => editField("name", e.target.value)}
                      autoFocus
                      style={inp(C, { fontSize: 11, padding: "3px 6px" })}
                    />
                    <select
                      value={el.trade || ""}
                      onChange={e => updateElement(el.id, "trade", e.target.value)}
                      style={inp(C, { fontSize: 9, padding: "3px 4px" })}
                    >
                      <option value="">— None —</option>
                      {activeBundles.map(b => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={el.unit}
                      onChange={e => editField("unit", e.target.value)}
                      style={inp(C, { fontSize: 10, padding: "3px 4px", textAlign: "center", width: "100%" })}
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={el.material}
                      onChange={e => editField("material", e.target.value)}
                      style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.green })}
                    />
                    <input
                      type="number"
                      value={el.labor}
                      onChange={e => editField("labor", e.target.value)}
                      style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.blue })}
                    />
                    <input
                      type="number"
                      value={el.equipment}
                      onChange={e => editField("equipment", e.target.value)}
                      style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.orange })}
                    />
                    <input
                      type="number"
                      value={el.subcontractor || 0}
                      onChange={e => editField("subcontractor", e.target.value)}
                      style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.red })}
                    />
                    <div />
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      <button
                        className="icon-btn"
                        title="Done"
                        onClick={() => setEditingId(null)}
                        style={{
                          width: 22,
                          height: 22,
                          border: "none",
                          background: "transparent",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Ic d={I.check} size={12} color={C.green} sw={2.5} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        color: C.purple,
                        fontWeight: 600,
                      }}
                    >
                      {el.code}
                    </div>
                    <select
                      value={el.directive || ""}
                      onChange={e => {
                        updateElement(el.id, "directive", e.target.value);
                        updateElement(el.id, "directiveOverride", !!e.target.value);
                      }}
                      title={el.directiveOverride ? "Manual override (click to change)" : "Auto-calculated"}
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: dirColor,
                        textAlign: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "1px 0",
                        appearance: "none",
                        WebkitAppearance: "none",
                        width: "100%",
                        textDecoration: el.directiveOverride ? "underline" : "none",
                      }}
                    >
                      <option value="">—</option>
                      <option value="F/I">F/I</option>
                      <option value="F/O">F/O</option>
                      <option value="I/O">I/O</option>
                    </select>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.text,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {titleCase(el.name)}
                      {el.source === "user" && el.masterItemId && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontSize: 7,
                            fontWeight: 700,
                            color: C.orange,
                            background: `${C.orange}14`,
                            padding: "1px 4px",
                            borderRadius: 3,
                            verticalAlign: "middle",
                          }}
                        >
                          Override
                        </span>
                      )}
                      {el.source === "user" && !el.masterItemId && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontSize: 7,
                            fontWeight: 700,
                            color: C.green,
                            background: `${C.green}14`,
                            padding: "1px 4px",
                            borderRadius: 3,
                            verticalAlign: "middle",
                          }}
                        >
                          Custom
                        </span>
                      )}
                      {(el.specVariants || []).length > 0 && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontSize: 7,
                            fontWeight: 700,
                            color: C.purple,
                            background: `${C.purple}12`,
                            padding: "1px 4px",
                            borderRadius: 3,
                            verticalAlign: "middle",
                          }}
                        >
                          {(el.specVariants || []).length} var
                        </span>
                      )}
                    </div>
                    <div style={{ overflow: "hidden" }}>
                      {tradeLabel && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color: C.accent,
                            background: C.accentBg,
                            padding: "2px 6px",
                            borderRadius: 3,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "inline-block",
                            maxWidth: "100%",
                          }}
                        >
                          {tradeLabel}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 10, color: C.textMuted }}>/{el.unit}</div>
                    <div
                      style={{
                        textAlign: "right",
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        color: C.green,
                      }}
                    >
                      {fmt2(el.material)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        color: C.blue,
                      }}
                    >
                      {fmt2(el.labor)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        color: C.orange,
                      }}
                    >
                      {fmt2(el.equipment)}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontFamily: T.font.sans,
                        fontSize: 10,
                        color: C.red,
                      }}
                    >
                      {nn(el.subcontractor) > 0 ? fmt2(el.subcontractor) : "—"}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 8, color: C.textDim, lineHeight: 1.3 }}>
                      <div>{el.addedBy || "—"}</div>
                      <div>{el.addedDate || ""}</div>
                    </div>
                    <div style={{ position: "relative", display: "flex", justifyContent: "flex-end", gap: 2, zIndex: menuOpenId === el.id ? 9999 : "auto" }}>
                      <button
                        className="icon-btn"
                        title="Add to Estimate"
                        onClick={e => {
                          e.stopPropagation();
                          addFromDB(el);
                        }}
                        style={{
                          width: 22,
                          height: 22,
                          border: "none",
                          background: "transparent",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          opacity: 0.7,
                          color: C.accent,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                      <button
                        className="icon-btn"
                        title="Actions"
                        onClick={e => {
                          e.stopPropagation();
                          if (menuOpenId === el.id) {
                            setMenuOpenId(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setMenuOpenId(el.id);
                          }
                        }}
                        style={{
                          width: 22,
                          height: 22,
                          border: "none",
                          background: menuOpenId === el.id ? C.accentBg : "transparent",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          opacity: 0.7,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={C.textDim}>
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                      {menuOpenId === el.id && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            right: 0,
                            bottom: "100%",
                            marginBottom: 4,
                            zIndex: 9999,
                            background: C.glassBgDark || C.bg,
                            border: `1px solid ${C.glassBorder || C.border}`,
                            borderRadius: 8,
                            backdropFilter: "blur(16px)",
                            WebkitBackdropFilter: "blur(16px)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 0 12px rgba(0,0,0,0.10)",
                            minWidth: 160,
                            padding: "4px 0",
                            animation: "staggerFadeUp 200ms cubic-bezier(0.16,1,0.3,1) both",
                          }}
                        >
                          <button
                            onMouseDown={e => {
                              e.stopPropagation();
                              duplicateElement(el.id);
                              setMenuOpenId(null);
                              showToast(`Copied "${el.name}"`);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "7px 14px",
                              fontSize: 11,
                              fontWeight: 500,
                              background: "transparent",
                              border: "none",
                              color: C.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <Ic d={I.copy} size={12} color={C.textMuted} /> Copy Item
                          </button>
                          <button
                            onMouseDown={e => {
                              e.stopPropagation();
                              setMovingId(el.id);
                              setMoveCode(el.code);
                              setMenuOpenId(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "7px 14px",
                              fontSize: 11,
                              fontWeight: 500,
                              background: "transparent",
                              border: "none",
                              color: C.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <Ic d={I.move} size={12} color={C.textMuted} /> Move to Code...
                          </button>
                          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                          <button
                            onMouseDown={e => {
                              e.stopPropagation();
                              setEditingId(el.id);
                              setMovingId(null);
                              setMenuOpenId(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "7px 14px",
                              fontSize: 11,
                              fontWeight: 500,
                              background: "transparent",
                              border: "none",
                              color: C.text,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <Ic d={I.edit} size={12} color={C.textMuted} /> Edit
                          </button>
                          {el.masterItemId && (
                            <button
                              onMouseDown={e => {
                                e.stopPropagation();
                                setCompareId(compareId === el.id ? null : el.id);
                                setMenuOpenId(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "7px 14px",
                                fontSize: 11,
                                fontWeight: 500,
                                background: "transparent",
                                border: "none",
                                color: C.text,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <Ic d={I.eye} size={12} color={C.textMuted} /> See Original
                            </button>
                          )}
                          {el.masterItemId && (
                            <button
                              onMouseDown={e => {
                                e.stopPropagation();
                                if (confirm(`Revert "${el.name}" to master pricing?`)) {
                                  revertOverride(el.id);
                                  showToast(`Reverted "${el.name}" to master pricing`);
                                }
                                setMenuOpenId(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "7px 14px",
                                fontSize: 11,
                                fontWeight: 500,
                                background: "transparent",
                                border: "none",
                                color: C.orange,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <Ic d={I.refresh} size={12} color={C.orange} /> Revert to Master
                            </button>
                          )}
                          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                          <button
                            onMouseDown={e => {
                              e.stopPropagation();
                              if (confirm(`Delete "${el.name}"?`)) removeElement(el.id);
                              setMenuOpenId(null);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              width: "100%",
                              padding: "7px 14px",
                              fontSize: 11,
                              fontWeight: 500,
                              background: "transparent",
                              border: "none",
                              color: C.red,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <Ic d={I.trash} size={12} color={C.red} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {compareId === el.id &&
                  el.masterItemId &&
                  (() => {
                    const master = getMasterVersion(el.masterItemId);
                    if (!master) return null;
                    const delta = (a, b) => {
                      const d = nn(a) - nn(b);
                      return d === 0 ? "—" : (d > 0 ? "+" : "") + fmt2(d);
                    };
                    const dColor = (a, b) =>
                      nn(a) - nn(b) === 0 ? C.textDim : nn(a) > nn(b) ? C.red : C.green;
                    return (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          padding: "8px 12px",
                          background: `${C.orange}08`,
                          borderTop: `1px solid ${C.orange}20`,
                          display: "grid",
                          gridTemplateColumns: "80px 1fr repeat(3, 80px)",
                          gap: 8,
                          fontSize: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: C.textDim }}>Compare</div>
                        <div />
                        <div style={{ textAlign: "right", fontWeight: 700, color: C.green }}>Material</div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: C.blue }}>Labor</div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: C.orange }}>Equipment</div>
                        <div style={{ color: C.textDim, fontWeight: 600 }}>Master</div>
                        <div style={{ color: C.textDim }}>{titleCase(master.name)}</div>
                        <div style={{ textAlign: "right", color: C.textMuted }}>{fmt2(master.material)}</div>
                        <div style={{ textAlign: "right", color: C.textMuted }}>{fmt2(master.labor)}</div>
                        <div style={{ textAlign: "right", color: C.textMuted }}>{fmt2(master.equipment)}</div>
                        <div style={{ color: C.accent, fontWeight: 600 }}>Yours</div>
                        <div style={{ color: C.text }}>{titleCase(el.name)}</div>
                        <div style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>
                          {fmt2(el.material)}
                        </div>
                        <div style={{ textAlign: "right", color: C.blue, fontWeight: 600 }}>
                          {fmt2(el.labor)}
                        </div>
                        <div style={{ textAlign: "right", color: C.orange, fontWeight: 600 }}>
                          {fmt2(el.equipment)}
                        </div>
                        <div style={{ color: C.textDim, fontWeight: 600 }}>Delta</div>
                        <div />
                        <div
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: dColor(el.material, master.material),
                          }}
                        >
                          {delta(el.material, master.material)}
                        </div>
                        <div
                          style={{ textAlign: "right", fontWeight: 700, color: dColor(el.labor, master.labor) }}
                        >
                          {delta(el.labor, master.labor)}
                        </div>
                        <div
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: dColor(el.equipment, master.equipment),
                          }}
                        >
                          {delta(el.equipment, master.equipment)}
                        </div>
                        <div
                          style={{
                            gridColumn: "1 / -1",
                            display: "flex",
                            justifyContent: "flex-end",
                            paddingTop: 4,
                          }}
                        >
                          <button
                            onClick={() => setCompareId(null)}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: C.textMuted,
                              background: "transparent",
                              border: `1px solid ${C.border}`,
                              borderRadius: 4,
                              padding: "3px 10px",
                              cursor: "pointer",
                            }}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            );
          }}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState
            icon={I.database}
            title={`No items${dbSelectedSub ? ` in ${dbSelectedSub}` : ""}`}
            subtitle={dbSearch ? `No results for "${dbSearch}"` : 'Click "Create Scope Item" to add one.'}
          />
        </div>
      )}
    </div>
  );
}
