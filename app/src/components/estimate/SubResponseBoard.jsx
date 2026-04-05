// SubResponseBoard — Live response dashboard with Kanban-style columns
// Replaces BidTrackingStrip with intent-aware tracking + save counter

import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const COLUMNS = [
  { key: "noResponse", label: "No Response", color: "#8E8E93", icon: I.time },
  { key: "reviewing", label: "Reviewing", color: "#FF9F0A", icon: I.eye },
  { key: "bidding", label: "Bidding", color: "#30D158", icon: I.check },
  { key: "submitted", label: "Submitted", color: "#BF5AF2", icon: I.send },
];

const OPENED_STATUSES = new Set(["opened", "downloaded"]);
const SUBMITTED_STATUSES = new Set(["submitted", "parsed", "awarded", "not_awarded"]);

function SubCard({ inv, color }) {
  const C = useTheme();
  const name = inv.subCompany || inv.sub_company || "Unknown";
  const trade = inv.subTrade || inv.sub_trade || "";
  const sentAt = inv.sentAt || inv.sent_at;
  const ago = sentAt ? timeSince(sentAt) : "";

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}20`,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          color: C.text,
          fontSize: 12,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        {trade && <span style={{ color: C.textDim, fontSize: 10 }}>{trade}</span>}
        {ago && <span style={{ color: C.textDim, fontSize: 10 }}>{ago}</span>}
      </div>
    </div>
  );
}

function timeSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function SubResponseBoard() {
  const C = useTheme();
  const bidPackages = useBidManagementStore(s => s.bidPackages);
  const invitations = useBidManagementStore(s => s.invitations);
  const subResponseIntents = useBidManagementStore(s => s.subResponseIntents);
  const scopeGapResults = useBidManagementStore(s => s.scopeGapResults);

  // Aggregate all active invitations across packages
  const { columns, passed, kpis } = useMemo(() => {
    const cols = { noResponse: [], reviewing: [], bidding: [], submitted: [] };
    const passedList = [];
    let totalSent = 0;
    let totalResponded = 0;
    let _totalOpened = 0;
    let _totalSubmitted = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;

    for (const pkg of bidPackages) {
      if (pkg.status === "closed") continue;
      const pkgInvites = invitations[pkg.id] || [];

      for (const inv of pkgInvites) {
        if (inv.status === "pending") continue; // not sent yet
        totalSent++;

        const intent = subResponseIntents?.[inv.id]?.intent;

        if (SUBMITTED_STATUSES.has(inv.status)) {
          _totalSubmitted++;
          totalResponded++;
          cols.submitted.push(inv);
          if (inv.submittedAt && inv.sentAt) {
            responseTimeSum += new Date(inv.submittedAt).getTime() - new Date(inv.sentAt).getTime();
            responseTimeCount++;
          }
        } else if (intent === "pass") {
          passedList.push({ ...inv, passReason: subResponseIntents[inv.id]?.reason });
          totalResponded++;
        } else if (intent === "bidding") {
          cols.bidding.push(inv);
          totalResponded++;
        } else if (intent === "reviewing") {
          cols.reviewing.push(inv);
          totalResponded++;
        } else if (OPENED_STATUSES.has(inv.status)) {
          _totalOpened++;
          cols.noResponse.push(inv);
        } else {
          cols.noResponse.push(inv);
        }
      }
    }

    // Compute exposure caught
    let exposureCaught = 0;
    for (const report of Object.values(scopeGapResults || {})) {
      if (report?.totalExposure) exposureCaught += report.totalExposure;
    }

    const avgResponseHrs = responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount / 3600000) : null;

    return {
      columns: cols,
      passed: passedList,
      kpis: {
        totalSent,
        responseRate: totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0,
        exposureCaught,
        avgResponseHrs,
      },
    };
  }, [bidPackages, invitations, subResponseIntents, scopeGapResults]);

  const anyActivity = kpis.totalSent > 0;
  if (!anyActivity) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Kanban Columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        {COLUMNS.map(col => {
          const list = columns[col.key];
          return (
            <div
              key={col.key}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 10,
                minHeight: 120,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ic d={col.icon} size={12} color={col.color} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: col.color,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    background: `${col.color}18`,
                    color: col.color,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 10,
                  }}
                >
                  {list.length}
                </span>
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {list.length === 0 ? (
                  <div style={{ color: C.textDim, fontSize: 11, textAlign: "center", padding: "16px 0" }}>—</div>
                ) : (
                  list.map(inv => <SubCard key={inv.id} inv={inv} color={col.color} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Passed row (collapsed) */}
      {passed.length > 0 && (
        <div
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(142,142,147,0.06)",
            border: `1px solid rgba(142,142,147,0.12)`,
            marginBottom: 12,
            fontSize: 12,
            color: "#8E8E93",
          }}
        >
          <span style={{ fontWeight: 600 }}>{passed.length} Passed</span>
          {passed.slice(0, 3).map(p => (
            <span key={p.id} style={{ marginLeft: 8, fontSize: 11 }}>
              {p.subCompany || p.sub_company}
              {p.passReason ? ` (${p.passReason})` : ""}
            </span>
          ))}
          {passed.length > 3 && <span style={{ marginLeft: 8, fontSize: 11 }}>+{passed.length - 3} more</span>}
        </div>
      )}

      {/* KPI Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
        }}
      >
        <KPICard label="Packages Sent" value={bidPackages.filter(p => p.status !== "draft").length} />
        <KPICard label="Response Rate" value={`${kpis.responseRate}%`} />
        <KPICard
          label="Exposure Caught"
          value={kpis.exposureCaught > 0 ? fmtCurrency(kpis.exposureCaught) : "$0"}
          accent
        />
        <KPICard label="Avg Response Time" value={kpis.avgResponseHrs != null ? `${kpis.avgResponseHrs}h` : "—"} />
      </div>
    </div>
  );
}

function KPICard({ label, value, accent }) {
  const C = useTheme();
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: accent ? "rgba(124,92,252,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${accent ? "rgba(124,92,252,0.15)" : C.border}`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? C.accent : C.text }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}

function fmtCurrency(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 100000) return `$${Math.round(v / 1000).toLocaleString()}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
