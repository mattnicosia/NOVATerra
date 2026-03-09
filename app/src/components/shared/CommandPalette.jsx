import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { loadEstimate } from "@/hooks/usePersistence";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, backdropTransition, paletteVariants, paletteTransition } from "@/utils/motion";
import NewEstimateModal from "@/components/shared/NewEstimateModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// Fuzzy match — case-insensitive substring
function fuzzy(text, query) {
  if (!query) return true;
  const lower = (text || "").toLowerCase();
  const terms = query.toLowerCase().split(/\s+/);
  return terms.every(t => lower.includes(t));
}

// Status → color
const STATUS_COLORS = {
  Qualifying: "#F59E0B",
  Bidding: "#A78BFA",
  Submitted: "#F59E0B",
  Won: "#34D399",
  Lost: "#F87171",
  "On Hold": "#A78BFA",
  Draft: "#8E8E93",
};

// Static pages
const PAGES = [
  { id: "nav-dashboard", label: "Dashboard", path: "/", icon: I.dashboard, category: "Pages" },
  { id: "nav-database", label: "Cost Database", path: "/core?tab=database", icon: I.database, category: "Pages" },
  { id: "nav-assemblies", label: "Assemblies", path: "/assemblies", icon: I.assembly, category: "Pages" },
  { id: "nav-contacts", label: "People", path: "/contacts", icon: I.user, category: "Pages" },
  { id: "nav-settings", label: "Settings", path: "/settings", icon: I.settings, category: "Pages" },
  { id: "nav-inbox", label: "Inbox", path: "/inbox", icon: I.inbox, category: "Pages" },
];

// Static actions
const ACTIONS = [
  { id: "act-new", label: "New Estimate", icon: I.plus, category: "Actions", action: "create" },
  { id: "act-ai", label: "Toggle AI Chat", icon: I.ai, category: "Actions", action: "ai-chat" },
];

export default function CommandPalette() {
  const C = useTheme();
  const T = C.T;
  const isDk = C.isDark;
  const ov = a => (isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  const navigate = useNavigate();
  const location = useLocation();
  const { open, query, recentIds, close, setQuery, addRecent } = useCommandPaletteStore();
  const estimates = useEstimatesStore(s => s.estimatesIndex);
  const createEstimate = useEstimatesStore(s => s.createEstimate);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);
  const aiChatOpen = useUiStore(s => s.aiChatOpen);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, close]);

  // Build results
  const results = useMemo(() => {
    const items = [];

    // Estimates
    const filtered = estimates
      .filter(e => fuzzy(`${e.name} ${e.client || ""} ${e.status || ""}`, query))
      .sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0))
      .slice(0, 12);

    // If no query, show recents first
    if (!query && recentIds.length > 0) {
      const recentEstimates = recentIds
        .map(id => estimates.find(e => e.id === id))
        .filter(Boolean)
        .slice(0, 4);
      if (recentEstimates.length > 0) {
        recentEstimates.forEach(e => {
          items.push({
            id: `recent-${e.id}`,
            label: e.name,
            sub: e.client || e.status || "",
            icon: I.estimate,
            category: "Recent",
            estimateId: e.id,
            status: e.status,
          });
        });
      }
    }

    filtered.forEach(e => {
      // Skip if already in recents
      if (!query && items.some(i => i.estimateId === e.id)) return;
      items.push({
        id: `est-${e.id}`,
        label: e.name,
        sub: e.client || e.status || "",
        icon: I.estimate,
        category: "Estimates",
        estimateId: e.id,
        status: e.status,
      });
    });

    // Pages
    PAGES.filter(p => fuzzy(p.label, query)).forEach(p => items.push(p));

    // Actions
    ACTIONS.filter(a => fuzzy(a.label, query)).forEach(a => items.push(a));

    return items;
  }, [estimates, query, recentIds]);

  // Clamp active index
  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [results.length, activeIndex]);

  // Execute a result
  const execute = useCallback(
    item => {
      close();
      if (item.estimateId) {
        addRecent(item.estimateId);
        navigate(`/estimate/${item.estimateId}/takeoffs`);
      } else if (item.path) {
        navigate(item.path);
      } else if (item.action === "create") {
        setShowNewModal(true);
        return; // Don't close the palette — the modal will overlay
      } else if (item.action === "ai-chat") {
        setAiChatOpen(!aiChatOpen);
      }
    },
    [close, navigate, addRecent, activeCompanyId, createEstimate, setAiChatOpen, aiChatOpen],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    e => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        execute(results[activeIndex]);
      }
    },
    [results, activeIndex, execute],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleNewCreated = async id => {
    setShowNewModal(false);
    close();
    await loadEstimate(id);
    navigate(`/estimate/${id}/takeoffs`);
  };

  if (!open && !showNewModal) return null;

  if (showNewModal) {
    return (
      <NewEstimateModal
        companyProfileId={activeCompanyId === "__all__" ? "" : activeCompanyId}
        onCreated={handleNewCreated}
        onClose={() => {
          setShowNewModal(false);
          close();
        }}
      />
    );
  }

  // Group results by category for section headers
  let lastCategory = "";

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={backdropTransition}
      onClick={e => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: isDk ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
    >
      <motion.div
        variants={paletteVariants}
        transition={paletteTransition}
        style={{
          width: 540,
          maxHeight: "60vh",
          background: isDk ? `linear-gradient(145deg, ${C.glassBg} 0%, ${C.glassBgDark} 100%)` : C.bg1,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          boxShadow: isDk
            ? `0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px ${C.glassBorder}`
            : `0 25px 60px rgba(0,0,0,0.15), 0 0 0 1px ${C.border}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: T.font.display,
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${C.borderLight || C.border}`,
          }}
        >
          <Ic d={I.search} size={16} color={C.textDim} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search estimates, pages, actions..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 15,
              fontWeight: 400,
              color: C.text,
              fontFamily: T.font.display,
              letterSpacing: "0.01em",
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: C.textDim,
              background: ov(0.05),
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "2px 6px",
              fontFamily: T.font.mono,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "6px 6px 8px",
          }}
        >
          {results.length === 0 && (
            <div
              style={{
                padding: "32px 18px",
                textAlign: "center",
                color: C.textDim,
                fontSize: 13,
              }}
            >
              No results found
            </div>
          )}
          {results.map((item, i) => {
            const showHeader = item.category !== lastCategory;
            lastCategory = item.category;
            const isActive = i === activeIndex;

            return (
              <div key={item.id}>
                {showHeader && (
                  <div
                    style={{
                      padding: "10px 12px 4px",
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {item.category}
                  </div>
                )}
                <div
                  onClick={() => execute(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    transition: "background 0.1s",
                    background: isActive ? `${C.accent}1F` : "transparent",
                    border: isActive ? `1px solid ${C.accent}26` : "1px solid transparent",
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: isActive ? `${C.accent}26` : ov(0.04),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "background 0.1s",
                    }}
                  >
                    <Ic d={item.icon} size={14} color={isActive ? C.accent : C.textMuted} />
                  </div>

                  {/* Label + sub */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: isActive ? C.text : C.textMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </div>
                    {item.sub && (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: C.textDim,
                          marginTop: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.sub}
                      </div>
                    )}
                  </div>

                  {/* Status dot for estimates */}
                  {item.status && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: STATUS_COLORS[item.status] || "#8E8E93",
                        boxShadow: `0 0 6px ${STATUS_COLORS[item.status] || "#8E8E93"}60`,
                      }}
                    />
                  )}

                  {/* Enter hint on active */}
                  {isActive && (
                    <kbd
                      style={{
                        fontSize: 9,
                        fontWeight: 500,
                        color: C.textDim,
                        background: ov(0.05),
                        border: `1px solid ${C.border}`,
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontFamily: T.font.mono,
                        flexShrink: 0,
                      }}
                    >
                      &#9166;
                    </kbd>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            borderTop: `1px solid ${C.borderLight || C.border}`,
            fontSize: 10,
            color: C.textDim,
            fontFamily: T.font.mono,
          }}
        >
          <span>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>&#8593;&#8595; navigate</span>
            <span>&#9166; select</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
