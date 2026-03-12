/**
 * ScenariosPanel — Tree-based scenario/alternate/breakout organizer.
 * Replaces the horizontal GroupBar with a vertical tree in the left panel.
 * Features: template menu, NOVA AI suggestions, drag-drop reparent, context menu.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useGroupsStore } from "@/stores/groupsStore";
import { useUiStore } from "@/stores/uiStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { callAnthropicStream, buildProjectContext } from "@/utils/ai";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

// ── Scenario Templates ────────────────────────────────────────────────
const SCENARIO_TEMPLATES = [
  {
    category: "Add Alternates",
    items: [
      { name: "Upgraded Finishes", type: "add", desc: "Premium finish materials and specifications" },
      { name: "Premium Fixtures", type: "add", desc: "Higher-end plumbing and lighting fixtures" },
      { name: "Enhanced Landscaping", type: "add", desc: "Upgraded site and landscape scope" },
      { name: "Additional Wing/Floor", type: "add", desc: "Expansion of building footprint or levels" },
    ],
  },
  {
    category: "Deduct Alternates",
    items: [
      { name: "Owner-Furnished Equipment", type: "deduct", desc: "Equipment provided by owner, deducted from bid" },
      { name: "Value Engineering", type: "deduct", desc: "Reduced scope or alternative materials to lower cost" },
      { name: "Simplified Finishes", type: "deduct", desc: "Standard finishes replacing specified upgrades" },
      { name: "Self-Performed Work", type: "deduct", desc: "Scope to be performed by owner's forces" },
    ],
  },
  {
    category: "Breakouts",
    items: [
      {
        name: "By Phase",
        type: "base",
        desc: "Break estimate into construction phases",
        multi: [
          { name: "Phase 1", type: "base" },
          { name: "Phase 2", type: "base" },
        ],
      },
      {
        name: "By Building",
        type: "base",
        desc: "Separate costs per building",
        multi: [
          { name: "Building A", type: "base" },
          { name: "Building B", type: "base" },
        ],
      },
      { name: "By Floor", type: "base", desc: "Break out costs per floor level" },
      {
        name: "Site vs Structure",
        type: "base",
        desc: "Separate sitework from building costs",
        multi: [
          { name: "Sitework", type: "base" },
          { name: "Building", type: "base" },
        ],
      },
    ],
  },
  {
    category: "Other",
    items: [
      { name: "Allowance Items", type: "add", desc: "Items carried as allowances pending final selection" },
      { name: "Unit Prices", type: "add", desc: "Unit price items for quantity adjustments" },
      { name: "Time & Material", type: "add", desc: "T&M scope outside lump sum pricing" },
    ],
  },
];

// ── Build tree from flat groups array ─────────────────────────────────
function buildTree(groups) {
  const map = {};
  const roots = [];
  groups.forEach(g => {
    map[g.id] = { ...g, children: [] };
  });
  groups.forEach(g => {
    if (g.parentId && map[g.parentId]) {
      map[g.parentId].children.push(map[g.id]);
    } else {
      roots.push(map[g.id]);
    }
  });
  return roots;
}

export default function ScenariosPanel() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;

  const groups = useGroupsStore(s => s.groups);
  const addGroup = useGroupsStore(s => s.addGroup);
  const updateGroup = useGroupsStore(s => s.updateGroup);
  const removeGroup = useGroupsStore(s => s.removeGroup);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const setActiveGroupId = useUiStore(s => s.setActiveGroupId);
  const showToast = useUiStore(s => s.showToast);
  const items = useItemsStore(s => s.items);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const project = useProjectStore(s => s.project);
  const specs = useSpecsStore(s => s.specs);
  const drawings = useDrawingsStore(s => s.drawings);

  const [collapsed, setCollapsed] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Template menu
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);

  // NOVA suggestions
  const [novaLoading, setNovaLoading] = useState(false);
  const [novaStream, setNovaStream] = useState("");
  const [novaSuggestions, setNovaSuggestions] = useState([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());

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

  // Close add menu on outside click
  useEffect(() => {
    if (!showAddMenu) return;
    const handler = e => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAddMenu]);

  // Focus input on edit start
  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const tree = useMemo(() => buildTree(groups), [groups]);

  const getCount = useCallback(
    groupId => {
      const ic = items.filter(i => (i.bidContext || "base") === groupId).length;
      const tc = takeoffs.filter(t => (t.bidContext || "base") === groupId).length;
      return ic + tc;
    },
    [items, takeoffs],
  );

  // Get total count including children
  const getTreeCount = useCallback(
    groupId => {
      let total = getCount(groupId);
      const children = groups.filter(g => g.parentId === groupId);
      children.forEach(c => {
        total += getTreeCount(c.id);
      });
      return total;
    },
    [groups, getCount],
  );

  const toggleCollapse = id => {
    setCollapsed(p => ({ ...p, [id]: !p[id] }));
  };

  const commitEdit = () => {
    if (editingId && editingName.trim()) {
      updateGroup(editingId, "name", editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  };

  const handleAdd = (parentId = null) => {
    const parentName = parentId
      ? groups.find(g => g.id === parentId)?.name || ""
      : "";
    const subs = groups.filter(g => g.parentId === (parentId || null) && g.id !== "base");
    const num = parentId ? subs.length + 1 : groups.filter(g => !g.parentId && g.id !== "base").length + 1;
    const name = parentId ? `${parentName} — Alt ${num}` : `Alternate ${num}`;
    const newId = addGroup(name, "add", parentId);
    setActiveGroupId(newId);
    setEditingId(newId);
    setEditingName(name);
    if (parentId) setCollapsed(p => ({ ...p, [parentId]: false }));
  };

  // ── Create from template ────────────────────────────────────────────
  const handleTemplateSelect = tmpl => {
    setShowAddMenu(false);
    if (tmpl.multi) {
      // Create parent + children
      const parentId = addGroup(tmpl.name, tmpl.type, null);
      tmpl.multi.forEach(child => {
        addGroup(child.name, child.type, parentId);
      });
      setActiveGroupId(parentId);
      setCollapsed(p => ({ ...p, [parentId]: false }));
      showToast(`Created "${tmpl.name}" with ${tmpl.multi.length} children`);
    } else {
      const newId = addGroup(tmpl.name, tmpl.type, null);
      setActiveGroupId(newId);
      showToast(`Created "${tmpl.name}"`);
    }
  };

  // ── NOVA Suggest ────────────────────────────────────────────────────
  const generateSuggestions = async () => {
    setNovaLoading(true);
    setNovaSuggestions([]);
    setNovaStream("");
    setSelectedSuggestions(new Set());
    try {
      const context = buildProjectContext({ project, items, specs, drawings });
      const existingGroups = groups.map(g => `${g.name} (${g.type})`).join(", ");
      const fullText = await callAnthropicStream({
        max_tokens: 2000,
        system: `You are a senior construction estimator helping organize bid scenarios. You suggest practical alternates, breakouts, and bid strategies based on the project scope, specifications, and estimate items.

Consider:
- Common architect-requested alternates for this building type
- Value engineering opportunities based on high-cost divisions
- Phasing or breakout strategies that improve bid clarity
- Industry-standard alternate patterns for the project type and size
- What's already been created (avoid duplicates)`,
        messages: [
          {
            role: "user",
            content: `Analyze this project and suggest 4-6 bid scenarios (alternates, breakouts, or grouping strategies).

${context}

Existing scenarios: ${existingGroups}

For each suggestion, format as:
**SCENARIO: [Name]**
Type: add | deduct
Description: [One sentence explaining what this scenario covers]
Rationale: [Why this makes sense for this specific project]

Prioritize by likelihood the architect/owner will request these.`,
          },
        ],
        onText: t => setNovaStream(t),
      });
      setNovaStream("");
      // Parse suggestions
      const blocks = fullText.split(/\*\*SCENARIO:/).filter(b => b.trim());
      const parsed = blocks
        .map(block => {
          const nameMatch = block.match(/^\s*(.+?)\*\*/);
          const typeMatch = block.match(/Type:\s*(add|deduct|base)/i);
          const descMatch = block.match(/Description:\s*(.+?)(?:\n|$)/);
          const ratMatch = block.match(/Rationale:\s*(.+?)(?:\n|$)/);
          return {
            name: nameMatch?.[1]?.trim() || "",
            type: (typeMatch?.[1] || "add").toLowerCase(),
            description: descMatch?.[1]?.trim() || "",
            rationale: ratMatch?.[1]?.trim() || "",
          };
        })
        .filter(s => s.name);
      setNovaSuggestions(parsed);
      // Auto-select all
      setSelectedSuggestions(new Set(parsed.map((_, i) => i)));
    } catch (err) {
      showToast(`NOVA error: ${err.message}`, "error");
    } finally {
      setNovaLoading(false);
    }
  };

  const toggleSuggestion = idx => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const addSelectedSuggestions = () => {
    let count = 0;
    novaSuggestions.forEach((s, i) => {
      if (selectedSuggestions.has(i)) {
        addGroup(s.name, s.type, null);
        count++;
      }
    });
    showToast(`Added ${count} scenario${count !== 1 ? "s" : ""}`);
    setNovaSuggestions([]);
    setSelectedSuggestions(new Set());
  };

  const handleContextMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleDelete = node => {
    setContextMenu(null);
    if (node.id === "base") return;
    const count = getTreeCount(node.id);
    if (count > 0) {
      setDeleteConfirm(node);
    } else {
      const removeRecursive = id => {
        const children = groups.filter(g => g.parentId === id);
        children.forEach(c => removeRecursive(c.id));
        removeGroup(id);
      };
      removeRecursive(node.id);
      if (activeGroupId === node.id) setActiveGroupId("base");
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const gid = deleteConfirm.id;
    const collectIds = id => {
      const ids = [id];
      groups.filter(g => g.parentId === id).forEach(c => ids.push(...collectIds(c.id)));
      return ids;
    };
    const allIds = new Set(collectIds(gid));
    const targetId = deleteConfirm.parentId || "base";
    const curItems = useItemsStore.getState().items;
    useItemsStore.getState().setItems(
      curItems.map(i => (allIds.has(i.bidContext || "base") ? { ...i, bidContext: targetId } : i)),
    );
    const curTk = useTakeoffsStore.getState().takeoffs;
    useTakeoffsStore.getState().setTakeoffs(
      curTk.map(t => (allIds.has(t.bidContext || "base") ? { ...t, bidContext: targetId } : t)),
    );
    allIds.forEach(id => { if (id !== "base") removeGroup(id); });
    if (activeGroupId && allIds.has(activeGroupId)) setActiveGroupId("base");
    const parentName = groups.find(g => g.id === targetId)?.name || "Base Bid";
    showToast(`Moved items to ${parentName} and deleted scenario`);
    setDeleteConfirm(null);
  };

  // ── Drag-drop: reparent scenarios ───────────────────────────────────
  const handleDragStart = (e, nodeId) => {
    if (nodeId === "base") { e.preventDefault(); return; }
    setDragId(nodeId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("scenario-id", nodeId);
  };

  const handleDragOverNode = (e, nodeId) => {
    e.preventDefault();
    if (dragId && dragId !== nodeId) setDragOver(nodeId);
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDropOnNode = (e, targetId) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const isDescendant = (parentId, checkId) => {
      const children = groups.filter(g => g.parentId === parentId);
      for (const c of children) {
        if (c.id === checkId) return true;
        if (isDescendant(c.id, checkId)) return true;
      }
      return false;
    };
    if (isDescendant(dragId, targetId)) { setDragId(null); return; }
    updateGroup(dragId, "parentId", targetId === "__root__" ? null : targetId);
    setCollapsed(p => ({ ...p, [targetId]: false }));
    setDragId(null);
    showToast("Moved scenario");
  };

  const handleDragEnd = () => { setDragId(null); setDragOver(null); };

  // ── Type indicator ──────────────────────────────────────────────────
  const typeColor = type => {
    if (type === "add") return "#27AE60";
    if (type === "deduct") return "#E67E22";
    return C.accent;
  };

  // ── Render a tree node ──────────────────────────────────────────────
  const renderNode = (node, depth = 0) => {
    const isActive = activeGroupId === node.id;
    const isEditing = editingId === node.id;
    const count = getCount(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsed[node.id];
    const isDragTarget = dragOver === node.id;
    const isDragging = dragId === node.id;

    return (
      <div key={node.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
        <div
          onClick={() => { if (!isEditing) setActiveGroupId(node.id); }}
          onContextMenu={e => handleContextMenu(e, node)}
          onDoubleClick={() => {
            setEditingId(node.id);
            setEditingName(node.name);
          }}
          draggable={node.id !== "base"}
          onDragStart={e => handleDragStart(e, node.id)}
          onDragOver={e => handleDragOverNode(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDropOnNode(e, node.id)}
          onDragEnd={handleDragEnd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 8px",
            paddingLeft: 8 + depth * 16,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: isActive ? 700 : 500,
            fontFamily: T.font.sans,
            color: isActive ? C.text : C.textDim,
            background: isActive
              ? dk ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.25)"
              : isDragTarget
                ? `${C.accent}12`
                : "transparent",
            borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
            borderRadius: `0 ${T.radius.sm}px ${T.radius.sm}px 0`,
            transition: "all 0.15s ease",
            outline: isDragTarget ? `1px dashed ${C.accent}60` : "none",
          }}
        >
          {/* Chevron */}
          <span
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleCollapse(node.id); }}
            style={{
              width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, opacity: hasChildren ? 0.6 : 0,
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.15s", cursor: hasChildren ? "pointer" : "default",
            }}
          >
            <Ic d={I.chevronDown} size={10} color={C.textDim} />
          </span>

          {/* Type dot */}
          {node.type !== "base" && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor(node.type), flexShrink: 0, opacity: 0.8 }} />
          )}

          {/* Name */}
          {isEditing ? (
            <input
              ref={editRef}
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
              }}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: C.text, fontSize: 11, fontWeight: 600, fontFamily: T.font.sans, padding: 0, minWidth: 0,
              }}
            />
          ) : (
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.name}
            </span>
          )}

          {/* Count badge */}
          <span style={{
            fontSize: 9, opacity: 0.6, fontWeight: 500,
            background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
            padding: "1px 5px", borderRadius: 8, minWidth: 16, textAlign: "center", flexShrink: 0,
          }}>
            {count}
          </span>

          {/* Quick-add child */}
          <span
            className="scenario-add-child"
            onClick={e => { e.stopPropagation(); handleAdd(node.id); }}
            style={{ opacity: 0, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0, padding: "0 2px", transition: "opacity 0.15s" }}
            title="Add child scenario"
          >
            <Ic d={I.plus} size={9} color={C.textDim} />
          </span>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px 6px",
          borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: T.font.sans }}>
          Scenarios
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* NOVA Suggest */}
          <button
            onClick={generateSuggestions}
            disabled={novaLoading}
            style={{
              ...bt(C),
              padding: "3px 7px",
              background: novaLoading ? C.bg3 : `linear-gradient(135deg, ${C.accent}15, ${C.purple || C.accent}15)`,
              border: `1px solid ${C.accent}25`,
              cursor: novaLoading ? "default" : "pointer",
              fontSize: 9,
              color: C.accent,
              display: "flex",
              alignItems: "center",
              gap: 3,
              borderRadius: T.radius.sm,
              fontFamily: T.font.sans,
              fontWeight: 600,
            }}
            title="AI-suggested scenarios based on your project"
          >
            {novaLoading ? (
              <>
                <span style={{
                  display: "inline-block", width: 8, height: 8,
                  border: `1.5px solid ${C.accent}40`, borderTop: `1.5px solid ${C.accent}`,
                  borderRadius: "50%", animation: "spin 0.8s linear infinite",
                }} />
                ...
              </>
            ) : (
              <>
                <Ic d={I.ai} size={9} color={C.accent} />
                Suggest
              </>
            )}
          </button>

          {/* Add dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowAddMenu(v => !v)}
              style={{
                ...bt(C),
                padding: "3px 6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 10,
                color: C.accent,
                display: "flex",
                alignItems: "center",
                gap: 2,
                borderRadius: T.radius.sm,
                fontFamily: T.font.sans,
                fontWeight: 600,
              }}
              title="Add scenario"
            >
              <Ic d={I.plus} size={10} color={C.accent} />
              <Ic d={I.chevronDown} size={8} color={C.accent} />
            </button>

            {/* Template dropdown */}
            {showAddMenu && (
              <div
                ref={addMenuRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  zIndex: 1000,
                  background: C.bg1,
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.md,
                  boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
                  minWidth: 200,
                  maxHeight: 380,
                  overflowY: "auto",
                  padding: "4px 0",
                  marginTop: 2,
                }}
              >
                {/* Blank */}
                <button
                  onClick={() => { setShowAddMenu(false); handleAdd(null); }}
                  style={menuItemStyle(C, T)}
                  onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Ic d={I.plus} size={10} color={C.accent} />
                  <span style={{ fontWeight: 600 }}>Blank Scenario</span>
                </button>
                <div style={{ height: 1, background: C.border, margin: "4px 0" }} />

                {SCENARIO_TEMPLATES.map(cat => (
                  <div key={cat.category}>
                    {/* Category header */}
                    <div style={{
                      padding: "6px 12px 3px",
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      fontFamily: T.font.sans,
                    }}>
                      {cat.category}
                    </div>
                    {cat.items.map(tmpl => (
                      <button
                        key={tmpl.name}
                        onClick={() => handleTemplateSelect(tmpl)}
                        style={menuItemStyle(C, T)}
                        onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                          background: typeColor(tmpl.type),
                        }} />
                        <span style={{ flex: 1 }}>{tmpl.name}</span>
                        {tmpl.multi && (
                          <span style={{ fontSize: 8, opacity: 0.5 }}>{tmpl.multi.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* NOVA Suggestions panel */}
      {(novaLoading || novaSuggestions.length > 0) && (
        <div style={{
          borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          padding: "6px 8px",
          flexShrink: 0,
          maxHeight: 220,
          overflowY: "auto",
          background: dk ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
        }}>
          {/* Streaming preview */}
          {novaLoading && novaStream && (
            <div style={{
              fontSize: 10, color: C.textDim, lineHeight: 1.5,
              whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto",
              padding: "4px 6px", background: C.bg, borderRadius: 4,
              border: `1px solid ${C.border}`, marginBottom: 6,
            }}>
              {novaStream}
              <span style={{
                display: "inline-block", width: 3, height: 10,
                background: C.accent, borderRadius: 1,
                animation: "pulse 0.8s infinite",
                verticalAlign: "text-bottom", marginLeft: 2,
              }} />
            </div>
          )}

          {/* Parsed suggestions */}
          {novaSuggestions.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, marginBottom: 4, fontFamily: T.font.sans }}>
                NOVA Suggestions ({novaSuggestions.length})
              </div>
              {novaSuggestions.map((s, i) => (
                <div
                  key={i}
                  onClick={() => toggleSuggestion(i)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 6,
                    padding: "5px 4px", cursor: "pointer", borderRadius: 4,
                    background: selectedSuggestions.has(i) ? `${C.accent}08` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Checkbox */}
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 1,
                    border: `1.5px solid ${selectedSuggestions.has(i) ? C.accent : C.border}`,
                    background: selectedSuggestions.has(i) ? C.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
                    {selectedSuggestions.has(i) && (
                      <Ic d={I.check} size={8} color="#fff" />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor(s.type), flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>{s.name}</span>
                      <span style={{ fontSize: 8, color: s.type === "add" ? "#27AE60" : s.type === "deduct" ? "#E67E22" : C.textDim, fontWeight: 600, textTransform: "uppercase" }}>
                        {s.type}
                      </span>
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.4, marginTop: 1 }}>{s.description}</div>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setNovaSuggestions([]); setSelectedSuggestions(new Set()); }}
                  style={bt(C, {
                    padding: "3px 8px", background: "transparent", border: `1px solid ${C.border}`,
                    color: C.textDim, fontSize: 9, cursor: "pointer", borderRadius: T.radius.sm,
                    fontFamily: T.font.sans,
                  })}
                >
                  Dismiss
                </button>
                <button
                  onClick={addSelectedSuggestions}
                  disabled={selectedSuggestions.size === 0}
                  style={bt(C, {
                    padding: "3px 10px",
                    background: selectedSuggestions.size > 0 ? C.accent : C.bg3,
                    color: selectedSuggestions.size > 0 ? "#fff" : C.textDim,
                    border: "none", fontSize: 9, fontWeight: 600, cursor: selectedSuggestions.size > 0 ? "pointer" : "default",
                    borderRadius: T.radius.sm, fontFamily: T.font.sans,
                  })}
                >
                  Add {selectedSuggestions.size > 0 ? `${selectedSuggestions.size} Selected` : "Selected"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tree */}
      <div
        style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}
        onDragOver={e => { e.preventDefault(); setDragOver("__root__"); }}
        onDrop={e => handleDropOnNode(e, "__root__")}
        onDragLeave={handleDragLeave}
      >
        {tree.map(node => renderNode(node, 0))}
      </div>

      {/* Hover styles */}
      <style>{`
        div:hover > .scenario-add-child { opacity: 0.6 !important; }
        .scenario-add-child:hover { opacity: 1 !important; }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.md,
            boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)", minWidth: 160,
            overflow: "hidden", padding: "4px 0",
          }}
        >
          <button
            onClick={() => { setEditingId(contextMenu.node.id); setEditingName(contextMenu.node.name); setContextMenu(null); }}
            style={menuItemStyle(C, T)}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Rename
          </button>
          <button
            onClick={() => { handleAdd(contextMenu.node.id); setContextMenu(null); }}
            style={{ ...menuItemStyle(C, T), color: C.accent }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Add Child Scenario
          </button>
          {contextMenu.node.id !== "base" && (
            <>
              <button
                onClick={() => {
                  const cur = contextMenu.node.type;
                  updateGroup(contextMenu.node.id, "type", cur === "add" ? "deduct" : "add");
                  setContextMenu(null);
                }}
                style={menuItemStyle(C, T)}
                onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Set Type: {contextMenu.node.type === "add" ? "Deduct" : "Add"}
              </button>
              {contextMenu.node.parentId && (
                <button
                  onClick={() => { updateGroup(contextMenu.node.id, "parentId", null); setContextMenu(null); showToast("Moved to root level"); }}
                  style={menuItemStyle(C, T)}
                  onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  Move to Root
                </button>
              )}
              <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
              <button
                onClick={() => handleDelete(contextMenu.node)}
                style={{ ...menuItemStyle(C, T), color: "#E74C3C" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(231,76,60,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.bg1, borderRadius: T.radius.lg, padding: 24, maxWidth: 360,
              border: `1px solid ${C.border}`, boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: T.font.sans }}>
              Delete "{deleteConfirm.name}"?
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16, fontFamily: T.font.sans }}>
              {getTreeCount(deleteConfirm.id)} item(s) will be moved to{" "}
              {deleteConfirm.parentId ? groups.find(g => g.id === deleteConfirm.parentId)?.name || "parent" : "Base Bid"}.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={bt(C, { padding: "6px 14px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: T.radius.sm, fontSize: 12, cursor: "pointer", fontFamily: T.font.sans })}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={bt(C, { padding: "6px 14px", background: "#E74C3C", color: "#fff", border: "none", borderRadius: T.radius.sm, fontSize: 12, cursor: "pointer", fontFamily: T.font.sans })}
              >
                Delete & Move Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Menu item style helper ────────────────────────────────────────────
function menuItemStyle(C, T) {
  return {
    width: "100%",
    padding: "6px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    color: C.text,
    fontFamily: T.font.sans,
    textAlign: "left",
  };
}
