import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { CSI } from "@/constants/csi";
import { useItemsStore } from "@/stores/itemsStore";
import { inp } from "@/utils/styles";
import { fmt2, nn } from "@/utils/format";
import { normalizeCode } from "@/utils/csiFormat";

export default function CodePicker({ to, C, T, anchorRef, onClose, updateTakeoff }) {
  const [tab, setTab] = useState("division");
  const [search, setSearch] = useState("");
  const [expandedDiv, setExpandedDiv] = useState(null);
  const popRef = useRef(null);
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const anchorRect = anchorRef?.current?.getBoundingClientRect();
  if (!anchorRect) return null;

  const searchLower = search.toLowerCase();

  // Division tab: filter CSI entries
  const filteredDivisions = Object.entries(CSI).filter(([code, div]) => {
    if (!searchLower) return true;
    if (code.includes(searchLower)) return true;
    if (div.name.toLowerCase().includes(searchLower)) return true;
    return Object.entries(div.subs || {}).some(
      ([sc, sn]) => sc.includes(searchLower) || sn.toLowerCase().includes(searchLower)
    );
  });

  // Items tab: filter by matching unit type, then by search
  const unitGroup = { EA: "count", LF: "linear", SF: "area", SY: "area", CY: "volume", CF: "volume" };
  const toGroup = unitGroup[to.unit] || to.unit;
  const matchingItems = items.filter(it => {
    const itGroup = unitGroup[it.unit] || it.unit;
    if (itGroup !== toGroup) return false;
    if (!searchLower) return true;
    return (
      (it.code || "").toLowerCase().includes(searchLower) ||
      (it.description || "").toLowerCase().includes(searchLower)
    );
  });

  const tabBtnStyle = (active) => ({
    flex: 1,
    padding: "5px 0",
    fontSize: 10,
    fontWeight: active ? 700 : 500,
    color: active ? C.accent : C.textDim,
    background: active ? `${C.accent}12` : "transparent",
    border: "none",
    borderBottom: active ? `2px solid ${C.accent}` : `2px solid transparent`,
    cursor: "pointer",
    transition: "all 100ms",
  });

  const rowHover = {
    onMouseEnter: e => (e.currentTarget.style.background = `${C.accent}10`),
    onMouseLeave: e => (e.currentTarget.style.background = "transparent"),
  };

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: "fixed",
        top: Math.min(anchorRect.bottom + 4, window.innerHeight - 380),
        left: Math.min(anchorRect.left, window.innerWidth - 280),
        zIndex: 9999,
        width: 270,
        maxHeight: 360,
        background: C.bg1,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
        <button style={tabBtnStyle(tab === "division")} onClick={() => setTab("division")}>
          Division
        </button>
        <button style={tabBtnStyle(tab === "items")} onClick={() => setTab("items")}>
          Database ({matchingItems.length})
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === "division" ? "Search divisions..." : "Search items..."}
          style={inp(C, {
            width: "100%",
            fontSize: 10,
            padding: "4px 6px",
            background: C.bg2 || C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: 5,
          })}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
        {tab === "division" ? (
          filteredDivisions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 10, color: C.textDim, textAlign: "center" }}>
              No divisions match
            </div>
          ) : (
            filteredDivisions.map(([code, div]) => {
              const isExpanded = expandedDiv === code;
              const subs = Object.entries(div.subs || {});
              const filteredSubs = searchLower
                ? subs.filter(([sc, sn]) => sc.includes(searchLower) || sn.toLowerCase().includes(searchLower))
                : subs;
              return (
                <div key={code}>
                  <button
                    onClick={() => {
                      if (subs.length > 0) {
                        setExpandedDiv(isExpanded ? null : code);
                      } else {
                        updateTakeoff(to.id, "code", normalizeCode(code));
                        onClose();
                      }
                    }}
                    style={{
                      width: "100%", padding: "5px 10px", border: "none",
                      background: to.code === code ? `${C.accent}12` : "transparent",
                      color: C.text, display: "flex", alignItems: "center", gap: 6,
                      fontSize: 11, cursor: "pointer", textAlign: "left",
                    }}
                    {...rowHover}
                  >
                    <span style={{ fontFamily: T.font.mono, fontSize: 9, color: C.purple, fontWeight: 700, minWidth: 22 }}>
                      {code}
                    </span>
                    <span style={{ flex: 1, fontSize: 10 }}>{div.name}</span>
                    {subs.length > 0 && (
                      <span style={{ fontSize: 8, color: C.textDim }}>{isExpanded ? "▾" : "▸"}</span>
                    )}
                  </button>
                  {isExpanded &&
                    filteredSubs.map(([subCode, subName]) => (
                      <button
                        key={subCode}
                        onClick={() => {
                          updateTakeoff(to.id, "code", normalizeCode(subCode));
                          onClose();
                        }}
                        style={{
                          width: "100%", padding: "4px 10px 4px 32px", border: "none",
                          background: to.code === subCode ? `${C.accent}12` : "transparent",
                          color: C.text, display: "flex", alignItems: "center", gap: 6,
                          fontSize: 10, cursor: "pointer", textAlign: "left",
                        }}
                        {...rowHover}
                      >
                        <span style={{ fontFamily: T.font.mono, fontSize: 8, color: `${C.purple}A0`, minWidth: 42 }}>
                          {subCode}
                        </span>
                        <span style={{ flex: 1, fontSize: 9 }}>{subName}</span>
                      </button>
                    ))}
                </div>
              );
            })
          )
        ) : matchingItems.length === 0 ? (
          <div style={{ padding: 12, fontSize: 10, color: C.textDim, textAlign: "center" }}>
            No {to.unit} items in database
          </div>
        ) : (
          matchingItems.map(it => {
            const total = getItemTotal(it);
            const unitCost = nn(it.quantity) > 0 ? total / nn(it.quantity) : 0;
            return (
              <button
                key={it.id}
                onClick={() => {
                  updateTakeoff(to.id, "code", normalizeCode(it.code || ""));
                  updateTakeoff(to.id, "linkedItemId", it.id);
                  onClose();
                }}
                style={{
                  width: "100%", padding: "5px 10px", border: "none",
                  background: to.linkedItemId === it.id ? `${C.accent}12` : "transparent",
                  color: C.text, display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10, cursor: "pointer", textAlign: "left",
                }}
                {...rowHover}
              >
                <span style={{ fontFamily: T.font.mono, fontSize: 8, color: C.purple, fontWeight: 700, minWidth: 40 }}>
                  {it.code || "—"}
                </span>
                <span style={{ flex: 1, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.description || "Untitled"}
                </span>
                <span style={{ fontSize: 8, color: C.green, fontWeight: 600, flexShrink: 0 }}>
                  ${fmt2(unitCost)}/{it.unit}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Current code indicator */}
      {to.code && (
        <div
          style={{
            padding: "4px 10px",
            borderTop: `1px solid ${C.border}`,
            fontSize: 9,
            color: C.textDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Current: <strong style={{ color: C.purple }}>{to.code}</strong></span>
          <button
            onClick={() => {
              updateTakeoff(to.id, "code", "");
              onClose();
            }}
            style={{
              background: "none", border: "none", color: C.red,
              fontSize: 8, cursor: "pointer", padding: "2px 4px",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
