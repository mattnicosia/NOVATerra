import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useGroupsStore } from "@/stores/groupsStore";
import { useUiStore } from "@/stores/uiStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

export default function GroupBar() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;

  const groups = useGroupsStore(s => s.groups);
  const addGroup = useGroupsStore(s => s.addGroup);
  const updateGroup = useGroupsStore(s => s.updateGroup);
  const removeGroup = useGroupsStore(s => s.removeGroup);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const setActiveGroupId = useUiStore(s => s.setActiveGroupId);
  const items = useItemsStore(s => s.items);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const showToast = useUiStore(s => s.showToast);
  const tkPanelTier = useTakeoffsStore(s => s.tkPanelTier);
  const tkPanelOpen = useTakeoffsStore(s => s.tkPanelOpen);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const editRef = useRef(null);
  const contextRef = useRef(null);

  // Guard: reset activeGroupId if it points to a deleted group
  useEffect(() => {
    if (!groups.find(g => g.id === activeGroupId)) {
      setActiveGroupId("base");
    }
  }, [groups, activeGroupId, setActiveGroupId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = e => {
      if (contextRef.current && !contextRef.current.contains(e.target)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Focus input on edit start
  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const getCount = useCallback(
    groupId => {
      const ic = items.filter(i => (i.bidContext || "base") === groupId).length;
      const tc = takeoffs.filter(t => (t.bidContext || "base") === groupId).length;
      return ic + tc;
    },
    [items, takeoffs],
  );

  const handleAdd = () => {
    const num = groups.length;
    const newId = addGroup(`Alt ${num}`, "add");
    setActiveGroupId(newId);
    setEditingId(newId);
    setEditingName(`Alt ${num}`);
  };

  const commitEdit = () => {
    if (editingId && editingName.trim()) {
      updateGroup(editingId, "name", editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleContextMenu = (e, group) => {
    e.preventDefault();
    if (group.id === "base" && group.type === "base") {
      // Allow rename only for base
      setContextMenu({ x: e.clientX, y: e.clientY, group, baseOnly: true });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, group, baseOnly: false });
    }
  };

  const handleDelete = group => {
    setContextMenu(null);
    const count = getCount(group.id);
    if (count > 0) {
      setDeleteConfirm(group);
    } else {
      removeGroup(group.id);
      if (activeGroupId === group.id) setActiveGroupId("base");
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const gid = deleteConfirm.id;
    // Move items to base
    const curItems = useItemsStore.getState().items;
    useItemsStore
      .getState()
      .setItems(curItems.map(i => ((i.bidContext || "base") === gid ? { ...i, bidContext: "base" } : i)));
    // Move takeoffs to base
    const curTk = useTakeoffsStore.getState().takeoffs;
    useTakeoffsStore
      .getState()
      .setTakeoffs(curTk.map(t => ((t.bidContext || "base") === gid ? { ...t, bidContext: "base" } : t)));
    removeGroup(gid);
    if (activeGroupId === gid) setActiveGroupId("base");
    showToast(`Moved ${getCount(gid)} items to Base Bid and deleted group`);
    setDeleteConfirm(null);
  };

  // Drop handler — change item/takeoff bidContext
  const handleDragOver = (e, groupId) => {
    e.preventDefault();
    setDragOverId(groupId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e, targetGroupId) => {
    e.preventDefault();
    setDragOverId(null);
    const dragType = e.dataTransfer.getData("drag-type");
    const dragId = e.dataTransfer.getData("drag-id");
    if (!dragId) return;

    if (dragType === "item") {
      const curItems = useItemsStore.getState().items;
      useItemsStore.getState().setItems(curItems.map(i => (i.id === dragId ? { ...i, bidContext: targetGroupId } : i)));
      showToast("Moved item to " + (groups.find(g => g.id === targetGroupId)?.name || targetGroupId));
    } else if (dragType === "takeoff") {
      const curTk = useTakeoffsStore.getState().takeoffs;
      useTakeoffsStore
        .getState()
        .setTakeoffs(curTk.map(t => (t.id === dragId ? { ...t, bidContext: targetGroupId } : t)));
      showToast("Moved takeoff to " + (groups.find(g => g.id === targetGroupId)?.name || targetGroupId));
    }
  };

  const typeIndicator = type => {
    if (type === "add") return { char: "+", color: "#27AE60" };
    if (type === "deduct") return { char: "\u2013", color: "#E67E22" };
    return null;
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          padding: "4px 8px",
          background: dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.08)",
          backdropFilter: T.glass.blurLight,
          WebkitBackdropFilter: T.glass.blurLight,
          borderRadius: T.radius.md,
          border: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)"}`,
          boxShadow: [T.glass.specularSm, T.glass.edge].join(", "),
          flexShrink: 0,
          overflowX: "auto",
          minHeight: 36,
        }}
      >
        {/* Tier mode cycling button */}
        {(() => {
          const modes = [
            { id: "closed", bars: 0, label: "Closed" },
            { id: "standard", bars: 2, label: "Standard" },
            { id: "full", bars: 3, label: "Split" },
            { id: "estimate", bars: 4, label: "Estimate" },
          ];
          let curId;
          if (tkPanelTier === "estimate") curId = "estimate";
          else if (!tkPanelOpen) curId = "closed";
          else if (tkPanelTier === "full") curId = "full";
          else curId = "standard";
          const idx = modes.findIndex(m => m.id === curId);
          const current = modes[idx >= 0 ? idx : 0];
          const nextMode = modes[(idx + 1) % modes.length];
          const cycleTier = () => {
            const store = useTakeoffsStore.getState();
            if (nextMode.id === "closed") {
              store.setTkPanelOpen(false);
              store.setTkPanelTier("standard");
              sessionStorage.setItem("bldg-tkPanelTier", "standard");
              sessionStorage.setItem("bldg-tkPanelWidth", "550");
            } else if (nextMode.id === "estimate") {
              store.setTkPanelOpen(false);
              store.setTkPanelTier("estimate");
              sessionStorage.setItem("bldg-tkPanelTier", "estimate");
              sessionStorage.setItem("bldg-tkPanelWidth", "0");
            } else {
              store.setTkPanelOpen(true);
              store.setTkPanelWidth(nextMode.id === "full" ? 900 : 550);
              store.setTkPanelTier(nextMode.id);
              sessionStorage.setItem("bldg-tkPanelTier", nextMode.id);
              sessionStorage.setItem("bldg-tkPanelWidth", nextMode.id === "full" ? "900" : "550");
            }
          };
          return (
            <button
              className="icon-btn"
              title={`${current.label} → ${nextMode.label}`}
              onClick={cycleTier}
              style={{
                width: 22,
                height: 22,
                border: `1px solid ${current.bars > 0 ? (C.accent + "50") : C.border}`,
                background: current.bars > 0 ? (C.accent + "14") : "transparent",
                borderRadius: 3,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1.5,
                padding: 0,
                flexShrink: 0,
              }}
            >
              {current.bars === 0 ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="18" rx="1" />
                  <path d="M14 3h7M14 9h7M14 15h5" />
                </svg>
              ) : (
                Array.from({ length: current.bars }).map((_, i) => (
                  <div key={i} style={{ width: 2.5, height: 8, borderRadius: 1, background: C.accent }} />
                ))
              )}
            </button>
          );
        })()}

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 18,
            background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            flexShrink: 0,
            margin: "0 2px",
          }}
        />

        {/* Render groups with nesting support — top-level groups shown first, sub-groups indented after parent */}
        {(() => {
          const topLevel = groups.filter(g => !g.parentId);
          const renderList = [];
          topLevel.forEach(g => {
            renderList.push(g);
            // Add children of this group right after
            const children = groups.filter(c => c.parentId === g.id);
            children.forEach(c => renderList.push({ ...c, _isChild: true }));
          });
          return renderList;
        })().map(g => {
          const isActive = activeGroupId === g.id;
          const isEditing = editingId === g.id;
          const count = getCount(g.id);
          const ind = typeIndicator(g.type);
          const isDragOver = dragOverId === g.id;
          const isChild = g._isChild;

          return (
            <div
              key={g.id}
              onClick={() => {
                if (!isEditing) setActiveGroupId(g.id);
              }}
              onContextMenu={e => handleContextMenu(e, g)}
              onDragOver={e => handleDragOver(e, g.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, g.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: isChild ? "3px 8px 3px 16px" : "5px 10px",
                borderRadius: T.radius.sm,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: isChild ? 10 : 11,
                fontWeight: isChild ? 500 : 600,
                fontFamily: T.font.sans,
                transition: "all 0.25s ease",
                background: isActive ? (dk ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.30)") : "transparent",
                color: isActive ? C.text : C.textDim,
                border: isDragOver
                  ? `1px solid ${C.accent}60`
                  : isActive
                    ? `0.5px solid ${dk ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.40)"}`
                    : "0.5px solid transparent",
                boxShadow: isDragOver
                  ? `0 0 8px ${C.accent}30`
                  : isActive
                    ? [
                        `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.55)"}`,
                        `0 0 0 0.5px ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)"}`,
                      ].join(", ")
                    : "none",
                backdropFilter: isActive ? "blur(8px) saturate(150%)" : "none",
                WebkitBackdropFilter: isActive ? "blur(8px) saturate(150%)" : "none",
              }}
            >
              {ind && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: isActive ? ind.color : ind.color,
                    lineHeight: 1,
                    marginRight: 1,
                    opacity: isActive ? 0.9 : 0.7,
                  }}
                >
                  {ind.char}
                </span>
              )}

              {isEditing ? (
                <input
                  ref={editRef}
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") {
                      setEditingId(null);
                      setEditingName("");
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: isActive ? "#fff" : C.text,
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: T.font.sans,
                    width: Math.max(40, editingName.length * 7),
                    padding: 0,
                  }}
                />
              ) : (
                <span>{g.name}</span>
              )}

              <span
                style={{
                  fontSize: 9,
                  opacity: 0.65,
                  fontWeight: 500,
                  background: isActive
                    ? dk
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)"
                    : dk
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.04)",
                  padding: "1px 5px",
                  borderRadius: 8,
                  minWidth: 16,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </div>
          );
        })}

        {/* Add group button */}
        <button
          onClick={handleAdd}
          style={{
            ...bt(C),
            padding: "4px 8px",
            background: "transparent",
            color: C.textDim,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            borderRadius: T.radius.sm,
            flexShrink: 0,
          }}
          title="Add alternate group"
        >
          <Ic d={I.plus} size={12} color={C.textDim} />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
            minWidth: 140,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => {
              setEditingId(contextMenu.group.id);
              setEditingName(contextMenu.group.name);
              setContextMenu(null);
            }}
            className="nav-item"
            style={{
              width: "100%",
              padding: "7px 12px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: C.text,
              fontFamily: T.font.sans,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Rename
          </button>
          {/* Add Sub-group — available for all groups (even base) */}
          <button
            onClick={() => {
              const parentId = contextMenu.group.id;
              const subs = groups.filter(g => g.parentId === parentId);
              const newName = `${contextMenu.group.name} — Sub ${subs.length + 1}`;
              const newId = addGroup(newName, "add", parentId);
              setActiveGroupId(newId);
              setEditingId(newId);
              setEditingName(newName);
              setContextMenu(null);
            }}
            className="nav-item"
            style={{
              width: "100%",
              padding: "7px 12px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: C.accent,
              fontFamily: T.font.sans,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Add Sub-group
          </button>
          {!contextMenu.baseOnly && (
            <>
              <button
                onClick={() => {
                  updateGroup(contextMenu.group.id, "type", contextMenu.group.type === "add" ? "deduct" : "add");
                  setContextMenu(null);
                }}
                className="nav-item"
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: C.text,
                  fontFamily: T.font.sans,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Set Type: {contextMenu.group.type === "add" ? "Deduct" : "Add"}
              </button>
              <button
                onClick={() => handleDelete(contextMenu.group)}
                className="nav-item"
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "#E74C3C",
                  fontFamily: T.font.sans,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(231,76,60,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1001,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.bg1,
              borderRadius: T.radius.lg,
              padding: 24,
              maxWidth: 360,
              border: `1px solid ${C.border}`,
              boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Delete "{deleteConfirm.name}"?
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>
              {getCount(deleteConfirm.id)} item(s) will be moved to Base Bid.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={bt(C, {
                  padding: "6px 14px",
                  background: C.bg2,
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm,
                  fontSize: 12,
                  cursor: "pointer",
                })}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={bt(C, {
                  padding: "6px 14px",
                  background: "#E74C3C",
                  color: "#fff",
                  border: "none",
                  borderRadius: T.radius.sm,
                  fontSize: 12,
                  cursor: "pointer",
                })}
              >
                Delete & Move Items
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
