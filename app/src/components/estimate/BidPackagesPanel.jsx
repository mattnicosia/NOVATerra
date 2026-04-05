import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { statusBadge } from "@/utils/styles";
import { analyzeGaps } from "@/utils/scopeGapEngine";
import { fireAutoResponse } from "@/utils/autoResponseEngine";

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

const OPENED_SET = new Set(["opened", "downloaded"]);
const SUBMITTED_SET = new Set(["submitted", "parsed", "awarded", "not_awarded"]);

function ResponseProgressBar({ invites }) {
  const subResponseIntents = useBidManagementStore(s => s.subResponseIntents);
  if (!invites || invites.length === 0) return null;
  const total = invites.length;
  let sentOnly = 0;
  let opened = 0;
  let submitted = 0;
  let bidding = 0;
  let reviewing = 0;
  for (const inv of invites) {
    const intent = subResponseIntents?.[inv.id]?.intent;
    if (SUBMITTED_SET.has(inv.status)) submitted++;
    else if (intent === "bidding") bidding++;
    else if (intent === "reviewing") reviewing++;
    else if (OPENED_SET.has(inv.status)) opened++;
    else if (inv.status === "sent") sentOnly++;
  }
  const active = sentOnly + opened + submitted + bidding + reviewing;
  if (active === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
        background: "rgba(255,255,255,0.06)",
        marginBottom: 8,
      }}
      title={`${submitted} submitted · ${bidding} bidding · ${reviewing} reviewing · ${opened} opened · ${sentOnly} awaiting`}
    >
      {submitted > 0 && (
        <div style={{ width: `${(submitted / total) * 100}%`, background: "#BF5AF2", transition: "width 300ms" }} />
      )}
      {bidding > 0 && (
        <div style={{ width: `${(bidding / total) * 100}%`, background: "#30D158", transition: "width 300ms" }} />
      )}
      {reviewing > 0 && (
        <div style={{ width: `${(reviewing / total) * 100}%`, background: "#FF9F0A", transition: "width 300ms" }} />
      )}
      {opened > 0 && (
        <div style={{ width: `${(opened / total) * 100}%`, background: "#64D2FF", transition: "width 300ms" }} />
      )}
      {sentOnly > 0 && (
        <div style={{ width: `${(sentOnly / total) * 100}%`, background: "#8E8E93", transition: "width 300ms" }} />
      )}
    </div>
  );
}

const fmtShort = v => {
  if (!v) return null;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
};

const INTENT_BADGE = {
  bidding: { color: "#30D158", label: "Bidding", pulse: true },
  reviewing: { color: "#FF9F0A", label: "Reviewing", pulse: false },
  pass: { color: "#8E8E93", label: "Passed", pulse: false },
};

function IntentBadge({ intent, reason }) {
  const cfg = INTENT_BADGE[intent];
  if (!cfg) return null;
  return (
    <span
      title={intent === "pass" && reason ? `Reason: ${reason}` : undefined}
      style={{
        background: `${cfg.color}15`,
        color: cfg.color,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.3,
        ...(cfg.pulse ? { animation: "intentPulse 2s ease-in-out infinite" } : {}),
      }}
    >
      {cfg.label}
    </span>
  );
}

function InvitationRow({ inv, proposal, gapReport, onResend, onViewProposal, onRemove }) {
  const C = useTheme();
  const subResponseIntents = useBidManagementStore(s => s.subResponseIntents);
  const intentData = subResponseIntents?.[inv.id];
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

      {intentData?.intent && <IntentBadge intent={intentData.intent} reason={intentData.reason} />}
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
        <>
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
          {onRemove && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRemove(inv);
              }}
              style={{
                background: "none",
                border: "none",
                color: C.textDim,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 6px",
                borderRadius: 6,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(255,69,58,0.12)";
                e.currentTarget.style.color = "#FF453A";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = C.textDim;
              }}
              title="Remove this sub from the package"
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function BidPackagesPanel({
  onCreateNew,
  onViewProposal,
  onCompare,
  onAward,
  onClose: onClosePackage,
  onInviteSubs,
}) {
  const C = useTheme();
  const T = C.T;
  const bidPackages = useBidManagementStore(s => s.bidPackages);
  const invitations = useBidManagementStore(s => s.invitations);
  const proposals = useBidManagementStore(s => s.proposals);
  const getPackageStats = useBidManagementStore(s => s.getPackageStats);
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

  const removeInvitation = useBidManagementStore(s => s.removeInvitation);
  const showToast = useUiStore(s => s.showToast);

  const handleRemoveInvitation = async (pkgId, inv) => {
    if (
      !window.confirm(`Remove ${inv.subCompany || inv.sub_company || inv.subEmail || inv.sub_email} from this package?`)
    )
      return;
    try {
      const token = useAuthStore.getState().session?.access_token;
      const resp = await fetch("/api/bid-invitation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invitationId: inv.id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove");
      }
      removeInvitation(pkgId, inv.id);
      showToast("Sub removed from package", "success");
    } catch (err) {
      console.error("Remove invitation error:", err);
      showToast(err.message || "Failed to remove sub", "error");
    }
  };

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

                {/* Response progress bar */}
                {pkgInvites.length > 0 && <ResponseProgressBar invites={pkgInvites} />}

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
                      onRemove={
                        pkg.status !== "awarded" && pkg.status !== "closed"
                          ? removedInv => handleRemoveInvitation(pkg.id, removedInv)
                          : undefined
                      }
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
                  const now = Date.now();
                  const nonResponsive = pkgInvites.filter(
                    inv =>
                      inv.status === "sent" && inv.sentAt && (now - new Date(inv.sentAt).getTime()) / 3600000 >= 72,
                  );
                  return (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {/* Invite Subs — primary action for packages */}
                      {onInviteSubs && pkg.status !== "awarded" && pkg.status !== "closed" && (
                        <button
                          onClick={() => onInviteSubs(pkg)}
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
                            fontFamily: "inherit",
                          }}
                        >
                          <Ic d={I.user} size={13} color={C.accent} />+ Invite Subs
                        </button>
                      )}
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
                      {/* Nudge non-responsive subs (72h+) */}
                      {nonResponsive.length > 0 && !isAwarded && pkg.status !== "closed" && (
                        <button
                          onClick={() => {
                            for (const inv of nonResponsive) {
                              fireAutoResponse("noResponse72h", {
                                packageId: pkg.id,
                                invitationId: inv.id,
                                recipientEmail: inv.subEmail || "",
                                subCompany: inv.subCompany || inv.subContact || "",
                                projectName: pkg.name || "",
                                dueDate: pkg.dueDate || "",
                                sentAt: inv.sentAt,
                              });
                            }
                            showToast(
                              `Nudge draft${nonResponsive.length > 1 ? "s" : ""} queued for ${nonResponsive.length} sub${nonResponsive.length > 1 ? "s" : ""} — review in notifications`,
                              "success",
                            );
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            background: "linear-gradient(135deg, rgba(255,159,10,0.12), rgba(255,159,10,0.05))",
                            border: "1px solid rgba(255,159,10,0.25)",
                            color: "#FF9F0A",
                            borderRadius: 8,
                            padding: "8px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title="Send follow-up to subs who haven't opened their invitation"
                        >
                          <Ic d={I.warn} size={13} color="#FF9F0A" />
                          Nudge {nonResponsive.length}
                        </button>
                      )}
                      {/* Close/Archive — available when not yet awarded/closed */}
                      {!isAwarded && pkg.status !== "closed" && (
                        <button
                          onClick={() => {
                            if (onClosePackage) onClosePackage(pkg);
                            else {
                              if (!window.confirm(`Close "${pkg.name}"? This won't delete it but marks it as closed.`))
                                return;
                              useBidManagementStore
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
