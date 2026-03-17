import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { nn, fmt } from "@/utils/format";

/* ────────────────────────────────────────────────────────
   MorningBrief — NOVA's daily context briefing
   Shows on first dashboard visit of the day, then dissolves.
   "NOVA knows your day better than you do."
   ──────────────────────────────────────────────────────── */

function getDayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-16"
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function MorningBrief({ onDismiss }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const [phase, setPhase] = useState("enter"); // enter → visible → exit
  const [opacity, setOpacity] = useState(0);

  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  // Filter to company estimates
  const estimates = useMemo(() => {
    if (!activeCompanyId || activeCompanyId === "__all__") return estimatesIndex;
    return estimatesIndex.filter(e => e.companyProfileId === activeCompanyId);
  }, [estimatesIndex, activeCompanyId]);

  // ── Compute brief data ──
  const brief = useMemo(() => {
    const now = new Date();
    const active = estimates.filter(e => e.status === "Bidding" || e.status === "Pending");
    const pipeline = active.reduce((s, e) => s + nn(e.grandTotal), 0);

    // Deadlines
    const withDue = active
      .filter(e => e.bidDue)
      .map(e => {
        const due = new Date(e.bidDue);
        const daysLeft = Math.ceil((due - now) / 86400000);
        return { ...e, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const overdue = withDue.filter(d => d.daysLeft < 0);
    const dueToday = withDue.filter(d => d.daysLeft === 0);
    const dueThisWeek = withDue.filter(d => d.daysLeft > 0 && d.daysLeft <= 7);
    const urgent = [...overdue, ...dueToday, ...dueThisWeek].slice(0, 3);

    // Win rate
    const won = estimates.filter(e => e.status === "Won").length;
    const lost = estimates.filter(e => e.status === "Lost").length;
    const decided = won + lost;
    const winRate = decided >= 2 ? Math.round((won / decided) * 100) : null;

    // Unpriced items across active estimates
    const totalItems = active.reduce((s, e) => s + nn(e.elementCount), 0);

    return {
      activeCount: active.length,
      pipeline,
      urgent,
      overdue: overdue.length,
      dueToday: dueToday.length,
      dueThisWeek: dueThisWeek.length,
      winRate,
      totalItems,
      totalEstimates: estimates.length,
    };
  }, [estimates]);

  // ── Build the brief sentence ──
  const sentence = useMemo(() => {
    const parts = [];

    if (brief.activeCount === 0) {
      parts.push("No active bids right now. Ready to start one?");
      return parts.join(" ");
    }

    parts.push(`You have ${brief.activeCount} active bid${brief.activeCount !== 1 ? "s" : ""}`);
    if (brief.pipeline > 0) parts[0] += ` worth ${fmt(brief.pipeline)}`;
    parts[0] += ".";

    if (brief.overdue > 0) {
      parts.push(`${brief.overdue} ${brief.overdue === 1 ? "is" : "are"} overdue.`);
    } else if (brief.dueToday > 0) {
      parts.push(`${brief.dueToday} due today.`);
    } else if (brief.dueThisWeek > 0) {
      parts.push(`${brief.dueThisWeek} due this week.`);
    }

    if (brief.winRate !== null) {
      parts.push(`Running win rate: ${brief.winRate}%.`);
    }

    return parts.join(" ");
  }, [brief]);

  // ── Animation lifecycle ──
  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setOpacity(1));
    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      setPhase("exit");
      setOpacity(0);
      setTimeout(onDismiss, 600);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleClick = () => {
    setPhase("exit");
    setOpacity(0);
    setTimeout(onDismiss, 600);
  };

  const urgentColor = (daysLeft) => {
    if (daysLeft <= 0) return C.red;
    if (daysLeft <= 3) return C.orange;
    return C.textMuted;
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        zIndex: 1000,
        cursor: "pointer",
        opacity,
        transition: "opacity 0.6s cubic-bezier(0.16,1,0.3,1)",
        fontFamily: T.font.sans,
      }}
    >
      {/* NOVA wordmark */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: C.accent,
          marginBottom: 32,
          opacity: 0.6,
        }}
      >
        NOVA DAILY BRIEF
      </div>

      {/* Greeting */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 300,
          color: C.text,
          marginBottom: 12,
          letterSpacing: "-0.01em",
          opacity: 0,
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s forwards",
        }}
      >
        {getGreeting()}.
      </div>

      {/* Main brief sentence */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 400,
          color: C.textMuted,
          maxWidth: 520,
          textAlign: "center",
          lineHeight: 1.6,
          marginBottom: 32,
          opacity: 0,
          animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s forwards",
        }}
      >
        {sentence}
      </div>

      {/* Urgent deadlines */}
      {brief.urgent.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            opacity: 0,
            animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.8s forwards",
          }}
        >
          {brief.urgent.map(e => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 16px",
                borderRadius: T.radius.md,
                background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${urgentColor(e.daysLeft)}18`,
                minWidth: 340,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: urgentColor(e.daysLeft),
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {e.name || "Untitled"}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  {e.client || "No client"}
                  {e.grandTotal > 0 && ` \u00B7 ${fmt(e.grandTotal)}`}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: urgentColor(e.daysLeft),
                  flexShrink: 0,
                }}
              >
                {e.daysLeft <= 0
                  ? "OVERDUE"
                  : e.daysLeft === 0
                    ? "TODAY"
                    : `${e.daysLeft}d`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tap to continue */}
      <div
        style={{
          fontSize: 10,
          color: C.textDim,
          marginTop: 48,
          letterSpacing: "0.05em",
          opacity: 0,
          animation: "fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 1.5s forwards",
        }}
      >
        Click anywhere to continue
      </div>
    </div>
  );
}
