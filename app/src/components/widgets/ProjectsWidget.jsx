import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";
import NewEstimateModal from "@/components/shared/NewEstimateModal";
import EmptyState from "@/components/shared/EmptyState";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────
   ProjectsWidget — projects list + create estimate CTA
   ──────────────────────────────────────────────────────── */

function formatValue(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

const DotsIcon = ({ color = "currentColor" }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="3.5" r="1.1" fill={color} />
    <circle cx="7" cy="7" r="1.1" fill={color} />
    <circle cx="7" cy="10.5" r="1.1" fill={color} />
  </svg>
);

const PenDocIcon = ({ color = "currentColor" }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="1.5" width="8" height="11" rx="1.5" stroke={color} strokeWidth="1.1" fill="none" />
    <line x1="5" y1="5" x2="9" y2="5" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    <line x1="5" y1="7.2" x2="7.5" y2="7.2" stroke={color} strokeWidth="0.9" strokeLinecap="round" />
    <path
      d="M9.5 8.5L11 7L12 8L10.5 9.5L9.5 9.8L9.5 8.5Z"
      fill={color}
      stroke={color}
      strokeWidth="0.5"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRight = ({ color = "currentColor" }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M4.5 2.5L8 6L4.5 9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Context menu */
function ProjectMenu({ x, y, onOpen, onDelete, onClose }) {
  const C = useTheme();
  const dk = C.isDark;
  const ref = useRef(null);
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 9999,
        background: C.sidebarBg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "4px 0",
        minWidth: 120,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {[
        { label: "Open", action: onOpen },
        { label: "Delete", action: onDelete, danger: true },
      ].map(item => (
        <button
          key={item.label}
          onClick={e => {
            e.stopPropagation();
            item.action();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "7px 14px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            textAlign: "left",
            color: item.danger ? C.red : C.text,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = ov(0.06))}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* Confirm delete dialog */
function ConfirmDelete({ name, onConfirm, onCancel }) {
  const C = useTheme();
  const dk = C.isDark;
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={ref}
        style={{
          background: C.sidebarBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "24px 28px",
          maxWidth: 340,
          width: "90%",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Delete Estimate</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
          Are you sure you want to delete <span style={{ color: C.text, fontWeight: 500 }}>{name}</span>? This cannot be
          undone.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
              color: C.textMuted,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 16px",
              borderRadius: 7,
              border: `1px solid ${C.red}4D`,
              background: `${C.red}26`,
              color: C.red,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const font = T.font.display;

  const {
    estimatesList: estimates,
    activeEstimate,
    handleOpenEstimate: onOpenProject,
    handleDeleteEstimate: onDeleteProject,
    handleCreateEstimate: onCreateEstimate,
    showNewEstimateModal,
    setShowNewEstimateModal,
    handleNewEstimateCreated,
    activeCompanyId,
  } = useDashboardData();

  const activeEstimateId = activeEstimate?.id || null;
  const [hoveredId, setHoveredId] = useState(null);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [menuState, setMenuState] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const glassCardStyle = {
    borderRadius: 10,
    padding: 6,
    position: "relative",
    background: "transparent",
    border: "none",
    boxShadow: "none",
  };

  const hasEstimates = estimates.length > 0;

  const handleContextMenu = (e, proj) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ id: proj.id, name: proj.name, x: e.clientX, y: e.clientY });
  };

  const handleDotsClick = (e, proj) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ id: proj.id, name: proj.name, x: rect.right, y: rect.bottom + 4 });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: font }}>
      {/* Section Header + Create button */}
      <div
        style={{
          marginBottom: 8,
          padding: "0 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.textDim,
            fontFamily: font,
          }}
        >
          PROJECTS{hasEstimates ? ` (${estimates.length})` : ""}
        </span>
        <button
          onClick={onCreateEstimate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${C.accent}4D`,
            background: `${C.accent}1A`,
            color: C.accent,
            fontSize: 9,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: font,
            transition: "all 0.15s",
            lineHeight: 1,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = `${C.accent}33`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = `${C.accent}1A`;
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 2V8M2 5H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Create
        </button>
      </div>

      {/* Project List */}
      <div style={{ ...glassCardStyle, overflow: "auto", flex: 1, minHeight: 0 }}>
        {hasEstimates ? (
          estimates.map(proj => {
            const isActive = proj.id === activeEstimateId;
            const isHovered = proj.id === hoveredId;
            return (
              <div
                key={proj.id}
                onClick={() => onOpenProject?.(proj.id)}
                onContextMenu={e => handleContextMenu(e, proj)}
                onMouseEnter={() => setHoveredId(proj.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  cursor: "pointer",
                  transition: "background 150ms ease-out",
                  outline: "none",
                  position: "relative",
                  ...(isActive && { background: `linear-gradient(135deg, ${C.accent}1A 0%, ${C.accentDim}0F 100%)` }),
                  ...(!isActive && isHovered && { background: ov(0.04) }),
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.text,
                      fontFamily: font,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                      ...(isActive && dk && { textShadow: `0 0 14px ${C.accent}59` }),
                    }}
                  >
                    {proj.name}
                  </span>
                  {(isHovered || menuState?.id === proj.id) && (
                    <button
                      onClick={e => handleDotsClick(e, proj)}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        border: "none",
                        background: ov(0.06),
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                        marginLeft: 4,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = ov(0.12))}
                      onMouseLeave={e => (e.currentTarget.style.background = ov(0.06))}
                    >
                      <DotsIcon color={C.textMuted} />
                    </button>
                  )}
                  {!(isHovered || menuState?.id === proj.id) && (
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 500,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontFamily: font,
                        padding: "2px 6px",
                        borderRadius: 4,
                        flexShrink: 0,
                        marginLeft: 6,
                        color: C.textMuted,
                        background: ov(0.05),
                        border: `1px solid ${C.borderLight}`,
                      }}
                    >
                      {proj.statusLabel}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      color: C.textMuted,
                      fontFamily: font,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {proj.type}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: C.accent,
                      fontFamily: font,
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    {proj.value > 0 ? formatValue(proj.value) : "\u2014"}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={I.folder}
            title="Create Your First Estimate"
            subtitle="Start a new project to begin estimating with NOVATerra."
            action={() => setShowNewEstimateModal(true)}
            actionLabel="New Estimate"
            actionIcon={I.plus}
          />
        )}
      </div>

      {menuState &&
        createPortal(
          <ProjectMenu
            x={menuState.x}
            y={menuState.y}
            onOpen={() => onOpenProject?.(menuState.id)}
            onDelete={() => setConfirmDelete({ id: menuState.id, name: menuState.name })}
            onClose={() => setMenuState(null)}
          />,
          document.body,
        )}
      {confirmDelete && (
        <ConfirmDelete
          name={confirmDelete.name}
          onConfirm={() => {
            onDeleteProject?.(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {showNewEstimateModal && (
        <NewEstimateModal
          companyProfileId={activeCompanyId === "__all__" ? "" : activeCompanyId}
          onCreated={handleNewEstimateCreated}
          onClose={() => setShowNewEstimateModal(false)}
        />
      )}
    </div>
  );
}
