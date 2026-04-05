import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { useUiStore } from "@/stores/uiStore";

export default function TakeoffPanelTabBar({
  C, T,
  leftPanelTab, setLeftPanelTab,
  pageFilter, setPageFilter,
  filteredTakeoffs,
  tkPanelTier,
  tkVisibility, setTkVisibility,
  setTkPanelOpen,
  engageMeasuring,
  setActiveModule,
}) {
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/* Panel mode tabs: Est | Discovery | Scen | Notes | RFIs | NOVA */}
      {(() => {
        const allTabs = [
          { key: "estimate", label: "Est", icon: I.ruler },
          { key: "discovery", label: "Discovery", icon: I.search || I.scan || I.ai },
          { key: "scenarios", label: "Scenarios", icon: I.layers },
          { key: "notes", label: "Notes", icon: I.report },
          { key: "rfis", label: "RFIs", icon: I.send },
          { key: "nova", label: "NOVA", icon: I.ai },
        ];
        const isEstimateTier = tkPanelTier === "estimate";
        const row1 = isEstimateTier ? allTabs.slice(0, 3) : allTabs;
        const row2 = isEstimateTier ? [allTabs[4], allTabs[3]] : [];

        const renderTab = t => {
          const isActive = leftPanelTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setLeftPanelTab(t.key);
                setShowNotesPanel(t.key === "notes");
              }}
              style={{
                padding: isEstimateTier ? "3px 10px" : "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: isActive
                  ? t.key === "nova"
                    ? "linear-gradient(135deg, #7C5CFC, #6D28D9)"
                    : C.accent
                  : "transparent",
                color: isActive ? "#fff" : C.textDim,
                border: isActive ? "none" : `1px solid ${C.border}`,
                borderRadius: 999,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ic d={t.icon} size={11} color={isActive ? "#fff" : C.textDim} /> {t.label}
            </button>
          );
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{row1.map(renderTab)}</div>
            {row2.length > 0 && <div style={{ display: "flex", gap: 2 }}>{row2.map(renderTab)}</div>}
          </div>
        );
      })()}

      {/* Takeoffs sub-filters (only when Estimate tab active) */}
      {leftPanelTab === "estimate" && (
        <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 4, padding: 2 }}>
          <button
            onClick={() => {
              setPageFilter("all");
              if (tkVisibility === "page") setTkVisibility("all");
            }}
            style={{
              padding: "2px 8px",
              fontSize: 9,
              fontWeight: 600,
              background: pageFilter === "all" ? C.accent : "transparent",
              color: pageFilter === "all" ? "#fff" : C.textDim,
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            All
          </button>
          <button
            onClick={() => {
              setPageFilter("page");
              setTkVisibility("page");
            }}
            style={{
              padding: "2px 8px",
              fontSize: 9,
              fontWeight: 600,
              background: pageFilter === "page" ? C.accent : "transparent",
              color: pageFilter === "page" ? "#fff" : C.textDim,
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            This Page{pageFilter === "page" ? ` (${filteredTakeoffs.length})` : ""}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {leftPanelTab === "estimate" && (
          <button
            className="icon-btn"
            onClick={() => {
              const next = { all: "page", page: "active", active: "all" };
              const nv = next[tkVisibility] || "all";
              setTkVisibility(nv);
              if (nv === "page") {
                setPageFilter("page");
                setActiveModule(null);
              } else if (tkVisibility === "page") {
                setPageFilter("all");
              }
            }}
            title={
              tkVisibility === "all"
                ? "Showing all takeoffs"
                : tkVisibility === "page"
                  ? "This page only"
                  : "Selected takeoff only"
            }
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${tkVisibility === "active" || tkVisibility === "page" ? C.accent + "60" : C.border}`,
              background:
                tkVisibility === "page"
                  ? C.accent + "18"
                  : tkVisibility === "active"
                    ? C.accent + "12"
                    : "transparent",
              color: tkVisibility === "page" ? C.accent : tkVisibility === "active" ? C.accent : C.textDim,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {tkVisibility === "active" && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.accent,
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                1
              </span>
            )}
            {tkVisibility === "page" && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: C.accent,
                  color: "#fff",
                  fontSize: 7,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                P
              </span>
            )}
          </button>
        )}
        {/* Close panel chevron */}
        <button
          className="icon-btn"
          onClick={() => setTkPanelOpen(false)}
          title="Close panel"
          style={{
            width: 22,
            height: 22,
            border: "none",
            background: C.bg2,
            color: C.textDim,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 1L2 5l4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
