import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { statusBadge } from "@/utils/styles";
import { analyzeGaps } from "@/utils/scopeGapEngine";

const STATUS_COLORS = {
  pending: { color: "#AEAEB2", label: "Pending" },
  sent: { color: "#64D2FF", label: "Sent" },
  opened: { color: "#FFD60A", label: "Opened" },
  downloaded: { color: "#FF9F0A", label: "Downloaded" },
  submitted: { color: "#30D158", label: "Submitted" },
  parsed: { color: "#BF5AF2", label: "Parsed" },
  awarded: { color: "#30D158", label: "Awarded" },
  not_awarded: { color: "#8E8E93", label: "Not Awarded" },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span style={statusBadge(s.color)}>{s.label}</span>;
}

const fmtShort = v => {
  if (!v) return null;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
};

function InvitationRow({ inv, proposal, gapReport, onResend, onViewProposal }) {
  const C = useTheme();
  const hasProposal = proposal?.parsedData && Object.keys(proposal.parsedData).length > 0;
  const pd = hasProposal ? proposal.parsedData : null;
  const score = gapReport?.coverageScore;
  const scoreColor = score >= 80 ? "#30D158" : score >= 60 ? "#FF9F0A" : "#FF453A";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
        fontSize: 13,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {inv.subCompany || inv.sub_company || "Unknown"}
        </div>
        <div style={{ color: C.textMuted, fontSize: 11 }}>
          {inv.subEmail || inv.sub_email || ""}
          {inv.subTrade || inv.sub_trade ? ` · ${inv.subTrade || inv.sub_trade}` : ""}
        </div>
      </div>

      {/* Inline bid + coverage when parsed */}
      {pd && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {pd.totalBid > 0 && (
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
              {fmtShort(pd.totalBid)}
            </span>
          )}
          {score != null && (
            <span
              style={{
                background: `${scoreColor}18`,
                color: scoreColor,
                padding: "1px 5px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {score}%
            </span>
          )}
        </div>
      )}

      <StatusPill status={inv.status} />
      {hasProposal && onViewProposal && (
        <button
          onClick={() => onViewProposal(proposal)}
          style={{
            background: "none",
            border: "none",
            color: "#30D158",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 8px",
            borderRadius: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(48,209,88,0.12)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          View
        </button>
      )}
      {(inv.status === "sent" || inv.status === "pending") && (
        <button
          onClick={() => onResend(inv)}
          style={{
            background: "none",
            border: "none",
            color: C.accent,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 8px",
            borderRadius: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(124,92,252,0.12)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          Resend
        </button>
      )}
    </div>
  );
}

export default function BidPackagesPanel({ onCreateNew, onViewProposal, onCompare, onAward, onClose: onClosePackage }) {
  const C = useTheme();
  const T = C.T;
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);
  const proposals = useBidPackagesStore(s => s.proposals);
  const getPackageStats = useBidPackagesStore(s => s.getPackageStats);
  const items = useItemsStore(s => s.items);
  const [expandedId, setExpandedId] = useState(null);

  // Auto-compute gap reports for parsed proposals
  const gapReports = useMemo(() => {
    if (!items?.length) return {};
    const reports = {};
    for (const [invId, proposal] of Object.entries(proposals)) {
      if (proposal?.parsedData && Object.keys(proposal.parsedData).length > 0) {
        reports[invId] = analyzeGaps(items, proposal.parsedData);
      }
    }
    return reports;
  }, [proposals, items]);

  const showToast = useUiStore(s => s.showToast);

  const handleResend = async inv => {
    try {
      const token = useAuthStore.getState().session?.access_token;

      // Find the package for this invitation
      const pkgId = Object.entries(invitations).find(([, invites]) => invites.some(i => i.id === inv.id))?.[0];

      if (!pkgId) throw new Error("Package not found");

      const resp = await fetch("/api/send-bid-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          invitationId: inv.id,
          packageId: pkgId,
        }),
      });

      if (!resp.ok) throw new Error("Failed to resend");
      showToast(`Invite resent to ${inv.subEmail || inv.sub_email}`, "success");
    } catch (err) {
      console.error("Resend failed:", err);
      showToast("Failed to resend invitation", "error");
    }
  };

  if (bidPackages.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(124,92,252,0.15), rgba(191,90,242,0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Ic d={I.send} size={28} color={C.accent} />
        </div>
        <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>No bid packages yet</h3>
        <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
          Create a bid package to send scope, drawings, and invitations to subcontractors.
        </p>
        <button
          onClick={onCreateNew}
          style={{
            background: `linear-gradient(135deg, ${C.accent}, #BF5AF2)`,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Ic d={I.plus} size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Create Bid Package
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bidPackages.map(pkg => {
        const stats = getPackageStats(pkg.id);
        const isExpanded = expandedId === pkg.id;
        const pkgInvites = invitations[pkg.id] || [];

        return (
          <div
            key={pkg.id}
            style={{
              background: C.glassBg || "rgba(255,255,255,0.04)",
              border: `1px solid ${C.glassBorder || C.border}`,
              borderRadius: T.radius.lg,
              overflow: "hidden",
            }}
          >
            {/* Card Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                cursor: "pointer",
                borderBottom: isExpanded ? `1px solid ${C.border}` : "none",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(124,92,252,0.2), rgba(191,90,242,0.1))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ic d={I.send} size={16} color={C.accent} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{pkg.name}</div>
                <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                  {pkg.dueDate
                    ? `Due ${new Date(pkg.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : "No due date"}
                  {" · "}
                  {stats.total} sub{stats.total !== 1 ? "s" : ""} invited
                </div>
              </div>

              {/* Mini status summary */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {pkg.status === "awarded" && (
                  <span
                    style={{
                      background: "#1C3D2A",
                      color: "#30D158",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Awarded
                  </span>
                )}
                {pkg.status === "closed" && (
                  <span
                    style={{
                      background: "rgba(142,142,147,0.12)",
                      color: "#8E8E93",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Closed
                  </span>
                )}
                {pkg.status !== "awarded" && pkg.status !== "closed" && stats.total > 0 && (
                  <span
                    style={{
                      background: stats.submitted > 0 ? "#1C3D2A" : "rgba(255,255,255,0.06)",
                      color: stats.submitted > 0 ? "#30D158" : C.textMuted,
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {stats.submitted} of {stats.total} responded
                  </span>
                )}
              </div>

              <Ic
                d={I.chevron}
                size={14}
                color={C.textMuted}
                style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
              />
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div style={{ padding: "12px 16px" }}>
                {/* Scope summary */}
                {Array.isArray(pkg.scopeItems) && pkg.scopeItems.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        color: C.textMuted,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 6,
                      }}
                    >
                      Scope
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {pkg.scopeItems.slice(0, 8).map((s, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: "rgba(255,255,255,0.06)",
                            color: C.textMuted,
                            fontSize: 11,
                          }}
                        >
                          {typeof s === "string" ? s : s.description || s.name || ""}
                        </span>
                      ))}
                      {pkg.scopeItems.length > 8 && (
                        <span style={{ color: C.textDim, fontSize: 11 }}>+{pkg.scopeItems.length - 8} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Invitations list */}
                <div
                  style={{
                    color: C.textMuted,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}
                >
                  Subcontractors ({pkgInvites.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {pkgInvites.map(inv => (
                    <InvitationRow
                      key={inv.id}
                      inv={inv}
                      proposal={proposals[inv.id]}
                      gapReport={gapReports[inv.id]}
                      onResend={handleResend}
                      onViewProposal={
                        onViewProposal ? p => onViewProposal({ ...p, _packageName: pkg.name }) : undefined
                      }
                    />
                  ))}
                </div>

                {/* Action buttons */}
                {(() => {
                  const parsedProposals = pkgInvites
                    .map(inv => proposals[inv.id])
                    .filter(p => p?.parsedData && Object.keys(p.parsedData).length > 0);
                  const isAwarded = pkg.status === "awarded";
                  return (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      {parsedProposals.length >= 2 && onCompare && (
                        <button
                          onClick={() => onCompare(pkg, parsedProposals)}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            background: `linear-gradient(135deg, ${C.accent}15, #BF5AF215)`,
                            border: `1px solid ${C.accent}30`,
                            color: C.accent,
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Ic d={I.report} size={13} color={C.accent} />
                          Compare {parsedProposals.length}
                        </button>
                      )}
                      {parsedProposals.length >= 1 && onAward && !isAwarded && (
                        <button
                          onClick={() => onAward(pkg)}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            background: "linear-gradient(135deg, rgba(48,209,88,0.12), rgba(48,209,88,0.05))",
                            border: "1px solid rgba(48,209,88,0.25)",
                            color: "#30D158",
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Ic d={I.check} size={13} color="#30D158" />
                          Award
                        </button>
                      )}
                      {isAwarded && (
                        <div
                          style={{
                            flex: 1,
                            textAlign: "center",
                            padding: "8px 16px",
                            borderRadius: 8,
                            background: "rgba(48,209,88,0.08)",
                            border: "1px solid rgba(48,209,88,0.15)",
                            color: "#30D158",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Awarded
                        </div>
                      )}
                      {/* Close/Archive — available when not yet awarded/closed */}
                      {!isAwarded && pkg.status !== "closed" && (
                        <button
                          onClick={() => {
                            if (onClosePackage) onClosePackage(pkg);
                            else {
                              if (!window.confirm(`Close "${pkg.name}"? This won't delete it but marks it as closed.`))
                                return;
                              useBidPackagesStore
                                .getState()
                                .updateBidPackage(pkg.id, { status: "closed", closedAt: new Date().toISOString() });
                              showToast("Package closed", "success");
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            background: "none",
                            border: `1px solid ${C.border}`,
                            color: C.textMuted,
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Close this bid package"
                        >
                          <Ic d={I.x} size={12} color={C.textMuted} />
                          Close
                        </button>
                      )}
                      {pkg.status === "closed" && !isAwarded && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "8px 14px",
                            borderRadius: 8,
                            background: "rgba(142,142,147,0.08)",
                            border: "1px solid rgba(142,142,147,0.15)",
                            color: "#8E8E93",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Closed
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
