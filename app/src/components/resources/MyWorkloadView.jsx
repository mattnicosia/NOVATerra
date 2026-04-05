import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useTheme } from "@/hooks/useTheme";
import { cardSolid } from "@/utils/styles";

export default function MyWorkloadView() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const userId = useAuthStore(s => s.user?.id);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  // Filter to only this user's estimates
  const myEstimates = useMemo(() => {
    if (!userId) return [];
    return estimatesIndex.filter(
      e => e.ownerId === userId || (Array.isArray(e.assignedTo) && e.assignedTo.includes(userId)),
    );
  }, [estimatesIndex, userId]);

  // Utilization: total estimated hours this week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weeklyHours = useMemo(() => {
    return myEstimates.reduce((sum, e) => {
      const hrs = parseFloat(e.estimatedHours) || 0;
      // Count if the estimate is active (Bidding/Qualifying)
      if (e.status === "Bidding" || e.status === "Qualifying") return sum + hrs;
      return sum;
    }, 0);
  }, [myEstimates]);

  const CAPACITY = 40;
  const utilizationPct = Math.min((weeklyHours / CAPACITY) * 100, 100);
  const utilizationBarColor =
    utilizationPct <= 50 ? "#30D158" : utilizationPct <= 85 ? "#FF9500" : "#FF3B30";

  // Upcoming deadlines sorted by bidDue
  const deadlines = useMemo(() => {
    return myEstimates
      .filter(e => e.bidDue && (e.status === "Bidding" || e.status === "Qualifying"))
      .sort((a, b) => (a.bidDue > b.bidDue ? 1 : -1));
  }, [myEstimates]);

  const fmtDate = d => {
    if (!d) return "—";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const daysUntil = d => {
    if (!d) return null;
    const dt = new Date(d + "T00:00:00");
    const diff = Math.ceil((dt - now) / 86400000);
    if (diff < 0) return "Overdue";
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return `${diff} days`;
  };

  const statusBadge = status => {
    const colors = {
      Qualifying: C.orange,
      Bidding: C.purple,
      Submitted: C.blue,
      Won: C.green,
      Lost: C.red,
      "On Hold": C.yellow,
      Draft: C.textDim,
    };
    return {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      background: (colors[status] || "#8E8E93") + "20",
      color: colors[status] || "#8E8E93",
    };
  };

  return (
    <div style={{ padding: T.space[6], maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: T.space[6] }}>
        <h1
          style={{
            fontFamily: "Switzer, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: C.text,
            margin: 0,
          }}
        >
          My Workload
        </h1>
        <p
          style={{
            fontFamily: "Switzer, sans-serif",
            fontSize: 12,
            color: C.textSecondary,
            marginTop: 4,
          }}
        >
          {myEstimates.length} estimate{myEstimates.length !== 1 ? "s" : ""} assigned
        </p>
      </div>

      {/* Utilization Summary */}
      <div style={{ ...cardSolid(C), padding: T.space[5], marginBottom: T.space[5] }}>
        <div
          style={{
            fontFamily: "Switzer, sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: C.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: T.space[3],
          }}
        >
          Weekly Utilization
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: C.surface2 || C.bg2 || "#1C1C1E",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${utilizationPct}%`,
                height: "100%",
                borderRadius: 4,
                background: utilizationBarColor,
                transition: "width 300ms ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "Switzer, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
              minWidth: 80,
              textAlign: "right",
            }}
          >
            {weeklyHours.toFixed(1)}h / {CAPACITY}h
          </span>
        </div>
      </div>

      {/* My Estimates */}
      <div style={{ marginBottom: T.space[5] }}>
        <div
          style={{
            fontFamily: "Switzer, sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: C.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: T.space[3],
          }}
        >
          My Estimates
        </div>
        {myEstimates.length === 0 && (
          <div
            style={{
              ...cardSolid(C),
              padding: T.space[6],
              textAlign: "center",
              fontFamily: "Switzer, sans-serif",
              fontSize: 13,
              color: C.textSecondary,
            }}
          >
            No estimates assigned yet
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: T.space[3] }}>
          {myEstimates.map(est => (
            <div
              key={est.id}
              onClick={() => {
                useEstimatesStore.getState().setActiveEstimateId(est.id);
                navigate("/");
              }}
              style={{
                ...cardSolid(C),
                padding: T.space[4],
                cursor: "pointer",
                transition: "border-color 120ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent || "#6366F1")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: T.space[2],
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "Switzer, sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: C.text,
                    }}
                  >
                    {est.name || "Untitled"}
                  </div>
                  {est.client && (
                    <div
                      style={{
                        fontFamily: "Switzer, sans-serif",
                        fontSize: 11,
                        color: C.textSecondary,
                        marginTop: 2,
                      }}
                    >
                      {est.client}
                    </div>
                  )}
                </div>
                <span style={statusBadge(est.status)}>{est.status}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: T.space[4],
                  fontFamily: "Switzer, sans-serif",
                  fontSize: 11,
                  color: C.textSecondary,
                }}
              >
                {est.bidDue && (
                  <span>
                    Due: {fmtDate(est.bidDue)}
                    {(() => {
                      const d = daysUntil(est.bidDue);
                      if (!d) return null;
                      const isUrgent = d === "Overdue" || d === "Today" || d === "Tomorrow";
                      return (
                        <span
                          style={{
                            marginLeft: 4,
                            color: isUrgent ? "#FF3B30" : C.textSecondary,
                            fontWeight: isUrgent ? 600 : 400,
                          }}
                        >
                          ({d})
                        </span>
                      );
                    })()}
                  </span>
                )}
                {est.estimatedHours > 0 && <span>{est.estimatedHours}h estimated</span>}
                {est.grandTotal > 0 && (
                  <span>${Number(est.grandTotal).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Deadlines */}
      {deadlines.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: "Switzer, sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: C.textSecondary,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: T.space[3],
            }}
          >
            Upcoming Deadlines
          </div>
          <div style={{ ...cardSolid(C), padding: T.space[4] }}>
            {deadlines.map(est => {
              const d = daysUntil(est.bidDue);
              const isUrgent = d === "Overdue" || d === "Today" || d === "Tomorrow";
              return (
                <div
                  key={est.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: `${T.space[2]}px 0`,
                    borderBottom: `1px solid ${C.border || "#2C2C2E"}`,
                    fontFamily: "Switzer, sans-serif",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: C.text, fontWeight: 500 }}>{est.name || "Untitled"}</span>
                  <span
                    style={{
                      color: isUrgent ? "#FF3B30" : C.textSecondary,
                      fontWeight: isUrgent ? 600 : 400,
                      fontSize: 11,
                    }}
                  >
                    {fmtDate(est.bidDue)} ({d})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
