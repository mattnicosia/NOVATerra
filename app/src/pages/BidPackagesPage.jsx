import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { fireAutoResponse } from "@/utils/autoResponseEngine";
import { generateBidPackageProposals, generateCoverMessages } from "@/utils/bidPackageAutoGenerator";
import BidPackagesPanel from "@/components/estimate/BidPackagesPanel";
import CreateBidPackageModal from "@/components/estimate/CreateBidPackageModal";
import AutoBidPackageReview from "@/components/estimate/AutoBidPackageReview";
import SubResponseBoard from "@/components/estimate/SubResponseBoard";
import ProposalDetailModal from "@/components/estimate/ProposalDetailModal";
import ProposalComparisonMatrix from "@/components/estimate/ProposalComparisonMatrix";
import AwardBidModal from "@/components/estimate/AwardBidModal";
import InviteSubsModal from "@/components/estimate/InviteSubsModal";
import EmptyState from "@/components/shared/EmptyState";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { autoTradeFromCode } from "@/constants/tradeGroupings";

const SUBMITTED_STATUSES = new Set(["submitted", "parsed", "awarded", "not_awarded"]);
const OVERDUE_MS = 72 * 3600 * 1000; // 72 hours

export default function BidPackagesPage() {
  const C = useTheme();
  const T = C.T;
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const allInvitations = useBidPackagesStore(s => s.invitations);
  const subResponseIntents = useBidPackagesStore(s => s.subResponseIntents);
  const user = useAuthStore(s => s.user);
  const showToast = useUiStore(s => s.showToast);
  const estimateItems = useItemsStore(s => s.items);

  const drawings = useDrawingsStore(s => s.drawings);
  const subs = useMasterDataStore(s => s.masterData.subcontractors);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [awardPkg, setAwardPkg] = useState(null);
  const [invitePkg, setInvitePkg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [autoHover, setAutoHover] = useState(false);

  // Auto-generate bid packages
  const [showAutoReview, setShowAutoReview] = useState(false);
  const [autoProposals, setAutoProposals] = useState(null);
  const [autoGenerating, setAutoGenerating] = useState(false);

  const handleAutoGenerate = async () => {
    if (autoGenerating) return;
    if (!estimateItems || estimateItems.length === 0) {
      showToast("No scope items — import an RFP or add items first", "warn");
      return;
    }
    setAutoGenerating(true);
    try {
      const { proposals, unassignedCount } = generateBidPackageProposals({
        items: estimateItems,
        drawings: drawings || [],
        subs: subs || [],
        project: project || {},
      });
      if (proposals.length === 0) {
        showToast("No trade-assigned items found — check CSI codes", "warn");
        setAutoGenerating(false);
        return;
      }
      if (unassignedCount > 0) {
        showToast(`${unassignedCount} item${unassignedCount > 1 ? "s" : ""} could not be assigned to a trade`, "info");
      }
      const messages = await generateCoverMessages(proposals, project || {});
      const enriched = proposals.map((p, i) => ({ ...p, coverMessage: messages[i] || "" }));
      setAutoProposals(enriched);
      setShowAutoReview(true);
    } catch (err) {
      console.error("[AutoBid] Generation failed:", err);
      showToast("Auto-generation failed — try again", "error");
    } finally {
      setAutoGenerating(false);
    }
  };

  // ── Coverage health metrics ──
  const coverage = useMemo(() => {
    let totalSent = 0;
    let totalResponded = 0;
    let totalSubmitted = 0;
    let overdue = 0;
    const now = Date.now();

    for (const pkg of bidPackages) {
      if (pkg.status === "closed") continue;
      const pkgInvites = allInvitations[pkg.id] || [];
      for (const inv of pkgInvites) {
        if (inv.status === "pending") continue;
        totalSent++;

        const intent = subResponseIntents?.[inv.id]?.intent;
        if (SUBMITTED_STATUSES.has(inv.status)) {
          totalSubmitted++;
          totalResponded++;
        } else if (intent === "pass" || intent === "bidding" || intent === "reviewing") {
          totalResponded++;
        } else {
          // No response — check if overdue
          const sentTime = inv.sentAt || inv.sent_at;
          if (sentTime && now - new Date(sentTime).getTime() > OVERDUE_MS) {
            overdue++;
          }
        }
      }
    }

    const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
    return { totalSent, totalResponded, totalSubmitted, overdue, responseRate };
  }, [bidPackages, allInvitations, subResponseIntents]);

  // Sync with server on mount
  useEffect(() => {
    if (!estimateId || !user) return;
    (async () => {
      setSyncing(true);
      try {
        const token = user?.access_token || (await useAuthStore.getState().getSession())?.access_token;
        const resp = await fetch(`/api/bid-package?estimateId=${estimateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const { packages } = await resp.json();
          if (Array.isArray(packages)) {
            for (const pkg of packages) {
              const oldInvites = useBidPackagesStore.getState().invitations[pkg.id] || [];
              const invites = (pkg.bid_invitations || []).map(inv => ({
                id: inv.id,
                subCompany: inv.sub_company,
                subContact: inv.sub_contact,
                subEmail: inv.sub_email,
                subPhone: inv.sub_phone,
                subTrade: inv.sub_trade,
                status: inv.status,
                sentAt: inv.sent_at,
                openedAt: inv.opened_at,
                submittedAt: inv.submitted_at,
                token: inv.token,
                intent: inv.intent,
                intentReason: inv.intent_reason,
                intentAt: inv.intent_at,
              }));
              useBidPackagesStore.getState().setPackageInvitations(pkg.id, invites);

              for (const inv of invites) {
                if (inv.intent) {
                  useBidPackagesStore.getState().setSubResponseIntent(inv.id, inv.intent, inv.intentReason);
                }
              }

              // Auto-response triggers
              const pj = useProjectStore.getState().project;
              for (const newInv of invites) {
                const oldInv = oldInvites.find(o => o.id === newInv.id);
                const oldStatus = oldInv?.status;
                const ctx = {
                  packageId: pkg.id,
                  invitationId: newInv.id,
                  recipientEmail: newInv.subEmail || "",
                  subCompany: newInv.subCompany || newInv.subContact || "",
                  projectName: pkg.name || pj?.name || "",
                  dueDate: pkg.due_date || "",
                };
                if (oldStatus !== "opened" && newInv.status === "opened") {
                  fireAutoResponse("portalOpened", ctx);
                }
                if (oldStatus !== "submitted" && newInv.status === "submitted") {
                  fireAutoResponse("proposalSubmitted", ctx);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[BidPackagesPage] Sync failed:", err);
      } finally {
        setSyncing(false);
      }
    })();
  }, [estimateId, user]);

  const hasPackages = bidPackages.length > 0;
  const activePackages = bidPackages.filter(p => p.status !== "draft" && p.status !== "closed");

  // Coverage health color
  const healthColor =
    coverage.responseRate >= 70 ? "#30D158" :
    coverage.responseRate >= 40 ? "#FF9F0A" : "#FF453A";

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: 960,
        fontFamily: T.font.sans,
      }}
    >
      {/* ── Command Strip Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: T.space[5],
        }}
      >
        <div>
          <h2
            style={{
              color: C.text,
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Bid Packages
          </h2>
          <p style={{ color: C.textMuted, fontSize: 13, margin: "2px 0 0" }}>
            Manage scope, track sub responses, level bids
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Auto-Generate — demoted text link */}
          <button
            onClick={handleAutoGenerate}
            disabled={autoGenerating}
            onMouseEnter={() => setAutoHover(true)}
            onMouseLeave={() => setAutoHover(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "none",
              border: "none",
              color: autoGenerating ? C.textDim : autoHover ? C.accent : C.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: autoGenerating ? "default" : "pointer",
              opacity: autoGenerating ? 0.5 : 1,
              padding: "6px 8px",
              borderRadius: T.radius.sm,
              transition: T.transition.fast,
            }}
          >
            <Ic
              d={I.ai}
              size={14}
              color={autoGenerating ? C.textDim : autoHover ? C.accent : C.textMuted}
              style={autoGenerating ? { animation: "spin 1s linear infinite" } : {}}
            />
            {autoGenerating ? "Generating..." : "Auto-Generate"}
          </button>

          {/* + New Package — primary CTA */}
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: `linear-gradient(135deg, ${C.accent}, #BF5AF2)`,
              color: "#fff",
              border: "none",
              borderRadius: T.radius.sm,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: T.font.sans,
              boxShadow: `0 2px 12px ${C.accent}30`,
              transition: T.transition.fast,
            }}
          >
            <Ic d={I.plus} size={14} />
            New Package
          </button>
        </div>
      </div>

      {/* ── Sync Indicator ── */}
      {syncing && (
        <div
          style={{
            color: C.textMuted,
            fontSize: T.fontSize.xs,
            marginBottom: T.space[3],
            display: "flex",
            alignItems: "center",
            gap: T.space[2],
          }}
        >
          <Ic d={I.refresh} size={12} color={C.textMuted} style={{ animation: "spin 1s linear infinite" }} />
          Syncing with server...
        </div>
      )}

      {/* ── Empty State ── */}
      {!hasPackages && (
        <>
          <EmptyState
            icon={I.send}
            title="Ready to go to market"
            subtitle="Create a bid package to send scope and drawings to your subs — NOVA handles the rest."
            action={() => setShowCreate(true)}
            actionLabel="New Package"
            actionIcon={I.plus}
          />
          <div
            style={{
              textAlign: "center",
              marginTop: -12,
              fontSize: 12,
              color: C.textMuted,
              animation: "staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) 500ms both",
            }}
          >
            or{" "}
            <button
              onClick={handleAutoGenerate}
              disabled={autoGenerating}
              style={{
                background: "none",
                border: "none",
                color: C.accent,
                fontSize: 12,
                fontWeight: 500,
                cursor: autoGenerating ? "default" : "pointer",
                padding: 0,
                fontFamily: T.font.sans,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              {autoGenerating ? "generating..." : "auto-generate from your scope"}
            </button>
          </div>
        </>
      )}

      {/* ── Populated State ── */}
      {hasPackages && (
        <>
          {/* Coverage Health Bar */}
          {coverage.totalSent > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "12px 16px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                marginBottom: 16,
                flexWrap: "wrap",
              }}
            >
              {/* Coverage indicator */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: healthColor,
                    boxShadow: `0 0 8px ${healthColor}60`,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: healthColor }}>
                  {coverage.responseRate}% Coverage
                </span>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 16, background: C.border }} />

              {/* Quick stats */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  <strong style={{ color: C.text, fontWeight: 600 }}>{coverage.totalSent}</strong> invited
                </span>
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  <strong style={{ color: C.text, fontWeight: 600 }}>{coverage.totalSubmitted}</strong> bids in
                </span>
                {coverage.overdue > 0 && (
                  <span style={{ fontSize: 12, color: "#FF453A" }}>
                    <strong style={{ fontWeight: 600 }}>{coverage.overdue}</strong> overdue
                  </span>
                )}
              </div>

              {/* Package count */}
              <span style={{ fontSize: 12, color: C.textDim }}>
                {activePackages.length} active package{activePackages.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Live Response Dashboard (Kanban + KPIs) */}
          <SubResponseBoard />

          {/* Package List */}
          <BidPackagesPanel
            onCreateNew={() => setShowCreate(true)}
            onViewProposal={proposal => setSelectedProposal(proposal)}
            onCompare={(pkg, proposals) => setCompareData({ pkg, proposals })}
            onAward={pkg => setAwardPkg(pkg)}
            onInviteSubs={pkg => setInvitePkg(pkg)}
          />
        </>
      )}

      {/* ── Modals ── */}
      {showAutoReview && autoProposals && (
        <AutoBidPackageReview
          proposals={autoProposals}
          onClose={() => {
            setShowAutoReview(false);
            setAutoProposals(null);
          }}
        />
      )}
      {showCreate && <CreateBidPackageModal onClose={() => setShowCreate(false)} />}
      {selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          onClose={() => setSelectedProposal(null)}
          estimateItems={estimateItems}
          projectName={project?.name}
          packageName={selectedProposal._packageName}
        />
      )}
      {compareData && (
        <ProposalComparisonMatrix
          bidPackage={compareData.pkg}
          proposals={compareData.proposals}
          estimateItems={estimateItems}
          onClose={() => setCompareData(null)}
        />
      )}
      {awardPkg && <AwardBidModal bidPackage={awardPkg} onClose={() => setAwardPkg(null)} />}
      {invitePkg && (
        <InviteSubsModal
          packageId={invitePkg.id}
          packageName={invitePkg.name}
          selectedTrades={(() => {
            const trades = new Set();
            for (const si of invitePkg.scopeItems || []) {
              const item = estimateItems.find(i => i.id === si.id);
              if (item) {
                const trade = item.trade || autoTradeFromCode(item.code);
                if (trade) trades.add(trade);
              }
            }
            return trades;
          })()}
          existingEmails={(allInvitations[invitePkg.id] || []).map(inv => (inv.subEmail || inv.sub_email || "").toLowerCase()).filter(Boolean)}
          onClose={() => setInvitePkg(null)}
        />
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
