// useScenarioDrag — Extracted from ScenariosPanel.jsx
// Drag-drop reparenting logic for scenario tree
import { useState } from "react";

export function useScenarioDrag({ groups, updateGroup, setCollapsed, showToast }) {
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const handleDragStart = (e, nodeId) => {
    if (nodeId === "base") {
      e.preventDefault();
      return;
    }
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
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const isDescendant = (parentId, checkId) => {
      const children = groups.filter(g => g.parentId === parentId);
      for (const c of children) {
        if (c.id === checkId) return true;
        if (isDescendant(c.id, checkId)) return true;
      }
      return false;
    };
    if (isDescendant(dragId, targetId)) {
      setDragId(null);
      return;
    }
    updateGroup(dragId, "parentId", targetId === "__root__" ? null : targetId);
    setCollapsed(p => ({ ...p, [targetId]: false }));
    setDragId(null);
    showToast("Moved scenario");
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOver(null);
  };

  return {
    dragId,
    dragOver,
    handleDragStart,
    handleDragOverNode,
    handleDragLeave,
    handleDropOnNode,
    handleDragEnd,
  };
}
