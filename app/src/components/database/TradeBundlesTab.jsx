import { useState } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, fmt2, titleCase } from "@/utils/format";

export default function TradeBundlesTab({
  C,
  T,
  activeBundles,
  customBundles,
  bundleItemCounts,
  bundleItems,
  updateElement,
  addBundle,
  removeBundle,
  resetBundles,
  initCustomBundles,
  updateBundle,
  showToast,
}) {
  const [editingBundleKey, setEditingBundleKey] = useState(null);
  const [expandedBundleKey, setExpandedBundleKey] = useState(null);

  return (
    <div
      style={{
        flex: 1,
        background: C.bg1,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, color: C.textMuted }}>
            Trade bundles group CSI divisions into how you present estimates to owners.
            {customBundles && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 9,
                  fontWeight: 700,
                  color: C.orange,
                  background: "rgba(224,135,58,0.12)",
                  padding: "2px 6px",
                  borderRadius: 3,
                }}
              >
                CUSTOMIZED
              </span>
            )}
          </span>
        </div>
        <button
          className="accent-btn"
          onClick={addBundle}
          style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}
        >
          <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Add Bundle
        </button>
        {customBundles && (
          <button
            className="ghost-btn"
            onClick={resetBundles}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textMuted,
              padding: "5px 10px",
              fontSize: 9,
            })}
          >
            <Ic d={I.refresh} size={10} color={C.textMuted} /> Reset to Defaults
          </button>
        )}
        <span style={{ fontSize: 10, color: C.textDim }}>{activeBundles.length} bundles</span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px 2fr 100px 60px 52px",
          gap: 4,
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 9,
          fontWeight: 600,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        <div style={{ textAlign: "center" }}>Order</div>
        <div>Bundle Label</div>
        <div>CSI Divisions</div>
        <div style={{ textAlign: "center" }}>Items</div>
        <div></div>
      </div>

      {/* Bundle rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {[...activeBundles]
          .sort((a, b) => a.sort - b.sort)
          .map((bundle, idx) => {
            const isEditing = editingBundleKey === bundle.key;
            const count = bundleItemCounts[bundle.key] || 0;
            const isExpanded = expandedBundleKey === bundle.key;
            const items = bundleItems[bundle.key] || [];
            return (
              <div
                key={bundle.key}
                style={{
                  animation:
                    idx < 30 ? `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both` : undefined,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 2fr 100px 60px 52px",
                    gap: 4,
                    padding: "8px 14px",
                    borderBottom: `1px solid ${C.bg}`,
                    alignItems: "center",
                    background: isEditing
                      ? C.accentBg
                      : isExpanded
                        ? C.accentBg
                        : idx % 2 === 1
                          ? C.bg2 + "40"
                          : "transparent",
                    cursor: isEditing ? "default" : "pointer",
                  }}
                  onClick={() => {
                    if (!isEditing && count > 0) setExpandedBundleKey(isExpanded ? null : bundle.key);
                  }}
                >
                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        value={bundle.sort}
                        onChange={e => updateBundle(bundle.key, "sort", parseInt(e.target.value) || 0)}
                        onClick={e => e.stopPropagation()}
                        style={nInp(C, { fontSize: 10, padding: "3px 4px", textAlign: "center", width: "100%" })}
                      />
                      <input
                        value={bundle.label}
                        onChange={e => updateBundle(bundle.key, "label", e.target.value)}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        style={inp(C, { fontSize: 12, padding: "4px 8px", fontWeight: 600 })}
                      />
                      <input
                        value={(bundle.divisions || []).join(", ")}
                        onChange={e =>
                          updateBundle(
                            bundle.key,
                            "divisions",
                            e.target.value
                              .split(",")
                              .map(s => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="01, 02..."
                        onClick={e => e.stopPropagation()}
                        style={inp(C, { fontSize: 10, padding: "3px 6px", fontFamily: T.font.sans })}
                      />
                      <div style={{ textAlign: "center", fontSize: 10, color: C.textDim }}>{count}</div>
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        <button
                          className="icon-btn"
                          title="Done"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingBundleKey(null);
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
                          textAlign: "center",
                          fontFamily: T.font.sans,
                          fontSize: 10,
                          color: C.textDim,
                        }}
                      >
                        {bundle.sort}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {count > 0 && (
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 8 8"
                            fill="none"
                            stroke={isExpanded ? C.accent : C.textDim}
                            strokeWidth="1.5"
                            style={{
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                              transition: "transform 200ms cubic-bezier(0.16,1,0.3,1), stroke 200ms ease-out",
                              flexShrink: 0,
                            }}
                          >
                            <path d="M2 0.5l3.5 3.5L2 7.5" />
                          </svg>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{bundle.label}</span>
                      </div>
                      <div style={{ fontFamily: T.font.sans, fontSize: 9, color: C.textMuted }}>
                        {(bundle.divisions || []).length > 0 ? (
                          bundle.divisions.join(", ")
                        ) : (
                          <span style={{ fontStyle: "italic", color: C.textDim }}>sub-based</span>
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 10,
                          color: count > 0 ? C.accent : C.textDim,
                          fontWeight: count > 0 ? 600 : 400,
                        }}
                      >
                        {count}
                      </div>
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        <button
                          className="icon-btn"
                          title="Edit"
                          onClick={e => {
                            e.stopPropagation();
                            initCustomBundles();
                            setEditingBundleKey(bundle.key);
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
                            opacity: 0.6,
                          }}
                        >
                          <Ic d={I.edit} size={11} color={C.textDim} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Delete"
                          onClick={e => {
                            e.stopPropagation();
                            if (confirm(`Delete bundle "${bundle.label}"?`)) {
                              initCustomBundles();
                              removeBundle(bundle.key);
                            }
                          }}
                          style={{
                            width: 22,
                            height: 22,
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
                        >
                          <Ic d={I.trash} size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* Expanded items list */}
                {isExpanded && !isEditing && items.length > 0 && (
                  <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "80px 1.5fr 60px 62px 62px 62px 62px 100px",
                        gap: 4,
                        padding: "4px 14px 4px 54px",
                        fontSize: 8,
                        fontWeight: 600,
                        color: C.textDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      <div>Code</div>
                      <div>Name</div>
                      <div style={{ textAlign: "right" }}>Unit</div>
                      <div style={{ textAlign: "right" }}>Matl</div>
                      <div style={{ textAlign: "right" }}>Labor</div>
                      <div style={{ textAlign: "right" }}>Equip</div>
                      <div style={{ textAlign: "right" }}>Sub</div>
                      <div style={{ textAlign: "right" }}>Bundle</div>
                    </div>
                    {items
                      .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
                      .map((el) => (
                        <div
                          key={el.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "80px 1.5fr 60px 62px 62px 62px 62px 100px",
                            gap: 4,
                            padding: "4px 14px 4px 54px",
                            fontSize: 11,
                            borderBottom: `1px solid ${C.borderLight || C.border}`,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontFamily: T.font.sans, fontSize: 9, color: C.purple }}>
                            {el.code || "—"}
                          </div>
                          <div
                            style={{
                              color: C.text,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {titleCase(el.name) || "Unnamed"}
                          </div>
                          <div style={{ textAlign: "right", fontSize: 10, color: C.textMuted }}>/{el.unit}</div>
                          <div style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.green }}>
                            {fmt2(el.material)}
                          </div>
                          <div style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.blue }}>
                            {fmt2(el.labor)}
                          </div>
                          <div style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.orange }}>
                            {fmt2(el.equipment)}
                          </div>
                          <div style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.red }}>
                            {nn(el.subcontractor) > 0 ? fmt2(el.subcontractor) : "—"}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <select
                              value={el.trade || ""}
                              onChange={e => updateElement(el.id, "trade", e.target.value)}
                              style={{
                                fontSize: 9,
                                padding: "2px 4px",
                                background: C.bg2,
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                borderRadius: 3,
                                cursor: "pointer",
                                maxWidth: "100%",
                              }}
                            >
                              <option value="">— None —</option>
                              {activeBundles.map(b => (
                                <option key={b.key} value={b.key}>
                                  {b.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    <div
                      style={{ padding: "4px 14px 4px 54px", fontSize: 9, color: C.textDim, fontStyle: "italic" }}
                    >
                      {items.length} item{items.length !== 1 ? "s" : ""} in this bundle
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Footer hint */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 9,
          color: C.textDim,
          lineHeight: 1.6,
        }}
      >
        <strong>Order</strong> controls sort order in reports and SOV. <strong>CSI Divisions</strong> auto-assigns
        items by code (leave empty for bundles assigned by subdivision, e.g. Div 06-09 splits). Items assigned to
        a deleted bundle will show as "Unassigned" in reports.
      </div>
    </div>
  );
}
