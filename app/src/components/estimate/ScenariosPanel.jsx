/**
 * ScenariosPanel — Connected-pills scenario/alternate/breakout organizer.
 * Single view with SVG connector lines showing parent-child hierarchy.
 * Features: template menu, NOVA AI suggestions, drag-drop reparent, context menu.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useGroupsStore } from "@/stores/groupsStore";
import { useUiStore } from "@/stores/uiStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useScenarioDrag } from "@/hooks/useScenarioDrag";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useProjectStore } from "@/stores/projectStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { callAnthropicStream, buildProjectContext } from "@/utils/ai";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

// ── Compact currency formatter ────────────────────────────────────────
function formatCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString();
}

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
    category: "Revisions",
    items: [
      { name: "Addendum", type: "revision", desc: "Track scope changes from a drawing addendum" },
      { name: "Bulletin", type: "revision", desc: "Track pricing request from a post-contract bulletin" },
      { name: "ASI", type: "revision", desc: "Track clarifications from an ASI (no cost impact expected)" },
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
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const project = useProjectStore(s => s.project);
  const specs = useDocumentManagementStore(s => s.specs);
  const drawings = useDrawingPipelineStore(s => s.drawings);

  const [collapsed, setCollapsed] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // ── Drag-drop reparenting (extracted) ──
  const { dragId, dragOver, handleDragStart, handleDragOverNode, handleDragLeave, handleDropOnNode, handleDragEnd } =
    useScenarioDrag({ groups, updateGroup, setCollapsed, showToast });

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
    const parentName = parentId ? groups.find(g => g.id === parentId)?.name || "" : "";
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
    useItemsStore
      .getState()
      .setItems(curItems.map(i => (allIds.has(i.bidContext || "base") ? { ...i, bidContext: targetId } : i)));
    const curTk = useDrawingPipelineStore.getState().takeoffs;
    useDrawingPipelineStore
      .getState()
      .setTakeoffs(curTk.map(t => (allIds.has(t.bidContext || "base") ? { ...t, bidContext: targetId } : t)));
    allIds.forEach(id => {
      if (id !== "base") removeGroup(id);
    });
    if (activeGroupId && allIds.has(activeGroupId)) setActiveGroupId("base");
    const parentName = groups.find(g => g.id === targetId)?.name || "Base Bid";
    showToast(`Moved items to ${parentName} and deleted scenario`);
    setDeleteConfirm(null);
  };

  // ── Type indicator ──────────────────────────────────────────────────
  const typeColor = type => {
    if (type === "add") return "#27AE60";
    if (type === "deduct") return "#E67E22";
    if (type === "revision") return "#F59E0B"; // amber
    if (type === "breakout") return C.textDim;
    return C.accent;
  };

  const getScenarioTotals = useCallback(ids => useItemsStore.getState().getScenarioTotals(ids), []);

  // ── Render a single pill ────────────────────────────────────────────
  const renderSinglePill = node => {
    const isActive = activeGroupId === node.id;
    const count = getCount(node.id);
    const tc = typeColor(node.type);
    const childIds = new Set([node.id, ...(node.children || []).map(c => c.id)]);
    const totals = getScenarioTotals(childIds);
    const isDragTarget = dragOver === node.id;
    const isDragging = dragId === node.id;

    return (
      <div
        key={node.id}
        onClick={() => setActiveGroupId(node.id)}
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
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          borderRadius: 16,
          cursor: node.id !== "base" ? (isDragging ? "grabbing" : "grab") : "pointer",
          background: isDragTarget
            ? `${C.accent}18`
            : isActive
              ? `${tc}20`
              : dk
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.03)",
          border: isDragTarget
            ? `1.5px dashed ${C.accent}`
            : node.type === "breakout"
              ? `1.5px dashed ${isActive ? tc : dk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`
              : isActive
                ? `1.5px solid ${tc}`
                : `1.5px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          transition: "all 0.15s",
          whiteSpace: "nowrap",
          position: "relative",
          opacity: isDragging ? 0.35 : 1,
          transform: isDragTarget ? "scale(1.04)" : isDragging ? "scale(0.95)" : "scale(1)",
          boxShadow: isDragTarget ? `0 0 8px ${C.accent}30` : "none",
        }}
      >
        {/* Type dot */}
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tc, flexShrink: 0 }} />

        {/* Name */}
        {editingId === node.id ? (
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
              color: C.text,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: T.font.sans,
              padding: 0,
              width: Math.max(40, editingName.length * 6),
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 10,
              fontWeight: isActive ? 700 : 600,
              color: isActive ? tc : C.text,
              fontFamily: T.font.sans,
            }}
          >
            {node.name}
          </span>
        )}

        {/* Total with markups */}
        {totals.grand > 0 && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              fontFamily: T.font.sans,
              opacity: 0.7,
              color:
                node.type === "deduct"
                  ? "#E67E22"
                  : node.type === "add"
                    ? "#27AE60"
                    : node.type === "revision"
                      ? "#F59E0B"
                      : C.textDim,
            }}
          >
            {node.type === "breakout" ? "" : node.type === "deduct" ? "\u2212" : node.type === "revision" ? "Δ " : "+"}$
            {formatCompact(totals.grand)}
            {node.type === "breakout" ? " (incl.)" : ""}
          </span>
        )}
        {/* Revision status badge */}
        {node.type === "revision" && (
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              fontFamily: T.font.sans,
              padding: "1px 4px",
              borderRadius: 4,
              background: node.accepted ? "#27AE6030" : "#F59E0B25",
              color: node.accepted ? "#27AE60" : "#F59E0B",
            }}
          >
            {node.accepted ? "✓ Applied" : "Pending"}
          </span>
        )}

        {/* Count */}
        <span
          style={{
            fontSize: 8,
            opacity: 0.5,
            background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            padding: "0px 4px",
            borderRadius: 6,
          }}
        >
          {count}
        </span>

        {/* Delete x on hover */}
        {node.id !== "base" && (
          <span
            className="scenario-add-child"
            onClick={e => {
              e.stopPropagation();
              handleDelete(node);
            }}
            style={{
              opacity: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              marginLeft: -2,
              transition: "opacity 0.15s",
            }}
            title="Delete scenario"
          >
            <Ic d={I.x} size={8} color={C.red || "#E74C3C"} />
          </span>
        )}
      </div>
    );
  };

  // ── Render connected pills recursively ──────────────────────────────
  const renderConnectedPills = node => {
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsed[node.id];

    return (
      <div key={node.id} style={{ display: "flex", flexDirection: "column" }}>
        {/* The pill itself */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {renderSinglePill(node)}
          {/* Collapse toggle for nodes with children */}
          {hasChildren && (
            <span
              onClick={e => {
                e.stopPropagation();
                toggleCollapse(node.id);
              }}
              style={{
                width: 14,
                height: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: 0.5,
                flexShrink: 0,
                transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              <Ic d={I.chevronDown} size={8} color={C.textDim} />
            </span>
          )}
        </div>

        {/* Children with connector lines */}
        {hasChildren && !isCollapsed && (
          <div style={{ position: "relative", paddingLeft: 20, marginTop: 0 }}>
            {/* Vertical connector line from parent down to last child */}
            <div
              style={{
                position: "absolute",
                left: 8,
                top: 0,
                bottom: node.children.length > 1 ? 14 : 14,
                width: 1,
                background: C.border,
                borderRadius: 1,
              }}
            />

            {node.children.map((child, _idx) => (
              <div key={child.id} style={{ position: "relative", marginTop: 6 }}>
                {/* Horizontal connector line from vertical line to pill */}
                <div
                  style={{
                    position: "absolute",
                    left: -12,
                    top: 14,
                    width: 12,
                    height: 1,
                    background: C.border,
                    borderRadius: 1,
                  }}
                />
                {/* Small rounded corner where vertical meets horizontal */}
                <div
                  style={{
                    position: "absolute",
                    left: -13,
                    top: 10,
                    width: 5,
                    height: 5,
                    borderLeft: `1px solid ${C.border}`,
                    borderBottom: `1px solid ${C.border}`,
                    borderRadius: "0 0 0 3px",
                    borderTop: "none",
                    borderRight: "none",
                  }}
                />
                {renderConnectedPills(child)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px 6px",
          borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontFamily: T.font.sans,
          }}
        >
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
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    border: `1.5px solid ${C.accent}40`,
                    borderTop: `1.5px solid ${C.accent}`,
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
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
                  onClick={() => {
                    setShowAddMenu(false);
                    handleAdd(null);
                  }}
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
                    <div
                      style={{
                        padding: "6px 12px 3px",
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.textDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        fontFamily: T.font.sans,
                      }}
                    >
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
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: typeColor(tmpl.type),
                          }}
                        />
                        <span style={{ flex: 1 }}>{tmpl.name}</span>
                        {tmpl.multi && <span style={{ fontSize: 8, opacity: 0.5 }}>{tmpl.multi.length}</span>}
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
        <div
          style={{
            borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            padding: "6px 8px",
            flexShrink: 0,
            maxHeight: 220,
            overflowY: "auto",
            background: dk ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
          }}
        >
          {/* Streaming preview */}
          {novaLoading && novaStream && (
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                maxHeight: 120,
                overflowY: "auto",
                padding: "4px 6px",
                background: C.bg,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
                marginBottom: 6,
              }}
            >
              {novaStream}
              <span
                style={{
                  display: "inline-block",
                  width: 3,
                  height: 10,
                  background: C.accent,
                  borderRadius: 1,
                  animation: "pulse 0.8s infinite",
                  verticalAlign: "text-bottom",
                  marginLeft: 2,
                }}
              />
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
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    padding: "5px 4px",
                    cursor: "pointer",
                    borderRadius: 4,
                    background: selectedSuggestions.has(i) ? `${C.accent}08` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      flexShrink: 0,
                      marginTop: 1,
                      border: `1.5px solid ${selectedSuggestions.has(i) ? C.accent : C.border}`,
                      background: selectedSuggestions.has(i) ? C.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {selectedSuggestions.has(i) && <Ic d={I.check} size={8} color="#fff" />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: typeColor(s.type),
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
                        {s.name}
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          color: s.type === "add" ? "#27AE60" : s.type === "deduct" ? "#E67E22" : C.textDim,
                          fontWeight: 600,
                          textTransform: "uppercase",
                        }}
                      >
                        {s.type}
                      </span>
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.4, marginTop: 1 }}>
                        {s.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setNovaSuggestions([]);
                    setSelectedSuggestions(new Set());
                  }}
                  style={bt(C, {
                    padding: "3px 8px",
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textDim,
                    fontSize: 9,
                    cursor: "pointer",
                    borderRadius: T.radius.sm,
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
                    border: "none",
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: selectedSuggestions.size > 0 ? "pointer" : "default",
                    borderRadius: T.radius.sm,
                    fontFamily: T.font.sans,
                  })}
                >
                  Add {selectedSuggestions.size > 0 ? `${selectedSuggestions.size} Selected` : "Selected"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Connected pills view */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 10px",
          outline: dragOver === "__root__" ? `1.5px dashed ${C.accent}40` : "none",
          outlineOffset: -2,
          borderRadius: 6,
          transition: "outline 0.15s",
        }}
        onDragOver={e => {
          e.preventDefault();
          setDragOver("__root__");
        }}
        onDrop={e => handleDropOnNode(e, "__root__")}
        onDragLeave={handleDragLeave}
      >
        {/* Base bid pill — always at top */}
        {(() => {
          const baseNode = tree.find(n => n.id === "base");
          if (!baseNode) return null;
          const baseTotals = getScenarioTotals("base");
          return (
            <div style={{ marginBottom: 8 }}>
              <div
                onClick={() => setActiveGroupId("base")}
                onContextMenu={e => handleContextMenu(e, baseNode)}
                onDragOver={e => {
                  e.preventDefault();
                  if (dragId) setDragOver("base");
                }}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDropOnNode(e, "base")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 20,
                  cursor: "pointer",
                  background:
                    activeGroupId === "base"
                      ? `${C.accent}20`
                      : dragOver === "base"
                        ? `${C.accent}12`
                        : dk
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.04)",
                  border:
                    activeGroupId === "base"
                      ? `1.5px solid ${C.accent}`
                      : dragOver === "base"
                        ? `1.5px dashed ${C.accent}60`
                        : `1.5px solid transparent`,
                  transition: "all 0.15s",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: activeGroupId === "base" ? C.accent : C.text,
                    fontFamily: T.font.sans,
                  }}
                >
                  Base Bid
                </span>
                {baseTotals.grand > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: C.textDim, fontFamily: T.font.sans }}>
                    ${formatCompact(baseTotals.grand)}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 8,
                    opacity: 0.5,
                    background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                    padding: "1px 5px",
                    borderRadius: 6,
                  }}
                >
                  {baseTotals.count}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Scenario pills with connector lines */}
        {tree.filter(n => n.id !== "base").length > 0 && (
          <div style={{ position: "relative", paddingLeft: 20 }}>
            {/* Vertical connector line from base down */}
            <div
              style={{
                position: "absolute",
                left: 8,
                top: 0,
                bottom: 14,
                width: 1,
                background: C.border,
                borderRadius: 1,
              }}
            />

            {tree
              .filter(n => n.id !== "base")
              .map((node, idx) => (
                <div key={node.id} style={{ position: "relative", marginTop: idx === 0 ? 0 : 6 }}>
                  {/* Horizontal connector from vertical line to pill */}
                  <div
                    style={{
                      position: "absolute",
                      left: -12,
                      top: 14,
                      width: 12,
                      height: 1,
                      background: C.border,
                      borderRadius: 1,
                    }}
                  />
                  {/* Rounded corner */}
                  <div
                    style={{
                      position: "absolute",
                      left: -13,
                      top: 10,
                      width: 5,
                      height: 5,
                      borderLeft: `1px solid ${C.border}`,
                      borderBottom: `1px solid ${C.border}`,
                      borderRadius: "0 0 0 3px",
                      borderTop: "none",
                      borderRight: "none",
                    }}
                  />
                  {renderConnectedPills(node)}
                </div>
              ))}
          </div>
        )}

        {/* All Scenarios (with markups) summary */}
        {groups.length > 1 && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              borderRadius: T.radius.sm,
              background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 4,
                fontFamily: T.font.sans,
              }}
            >
              All Scenarios (with markups)
            </div>
            {groups
              .filter(g => g.id !== "base")
              .map(g => {
                const ids = new Set([g.id, ...groups.filter(c => c.parentId === g.id).map(c => c.id)]);
                const t = getScenarioTotals(ids);
                if (t.count === 0) return null;
                return (
                  <div
                    key={g.id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: C.text,
                        fontFamily: T.font.sans,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: typeColor(g.type) }} />
                      {g.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: T.font.sans,
                        color: g.type === "deduct" ? "#E67E22" : g.type === "add" ? "#27AE60" : C.text,
                      }}
                    >
                      {g.type === "deduct" ? "\u2212" : g.type === "add" ? "+" : ""}${formatCompact(t.grand)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
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
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
            minWidth: 160,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <button
            onClick={() => {
              setEditingId(contextMenu.node.id);
              setEditingName(contextMenu.node.name);
              setContextMenu(null);
            }}
            style={menuItemStyle(C, T)}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            Rename
          </button>
          <button
            onClick={() => {
              handleAdd(contextMenu.node.id);
              setContextMenu(null);
            }}
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
                  onClick={() => {
                    updateGroup(contextMenu.node.id, "parentId", null);
                    setContextMenu(null);
                    showToast("Moved to root level");
                  }}
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
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: T.font.sans }}>
              Delete "{deleteConfirm.name}"?
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16, fontFamily: T.font.sans }}>
              {getTreeCount(deleteConfirm.id)} item(s) will be moved to{" "}
              {deleteConfirm.parentId
                ? groups.find(g => g.id === deleteConfirm.parentId)?.name || "parent"
                : "Base Bid"}
              .
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
                  fontFamily: T.font.sans,
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
                  fontFamily: T.font.sans,
                })}
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
