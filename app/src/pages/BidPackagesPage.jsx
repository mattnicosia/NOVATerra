import { useState, useEffect } from "react";
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
import BidLevelingGrid from "@/components/estimate/BidLevelingGrid";
import CreateBidPackageModal from "@/components/estimate/CreateBidPackageModal";
import AutoBidPackageReview from "@/components/estimate/AutoBidPackageReview";
import BidTrackingStrip from "@/components/estimate/BidTrackingStrip";
import ProposalDetailModal from "@/components/estimate/ProposalDetailModal";
import ProposalComparisonMatrix from "@/components/estimate/ProposalComparisonMatrix";
import AwardBidModal from "@/components/estimate/AwardBidModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function BidPackagesPage() {
  const C = useTheme();
  const T = C.T;
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const user = useAuthStore(s => s.user);
  const showToast = useUiStore(s => s.showToast);
  const estimateItems = useItemsStore(s => s.items);

  const drawings = useDrawingsStore(s => s.drawings);
  const subs = useMasterDataStore(s => s.masterData.subcontractors);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [awardPkg, setAwardPkg] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("packages"); // "packages" | "leveling"

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
      // 1. Deterministic split (instant)
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
      // 2. AI cover messages (async ~3s)
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
          // Merge server data into local store
          if (Array.isArray(packages)) {
            for (const pkg of packages) {
              // Get old invitations before overwriting (for status diff)
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
              }));
              useBidPackagesStore.getState().setPackageInvitations(pkg.id, invites);

              // ── Auto-response triggers: detect status transitions ──
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

  return (
    <div
      style={{
        padding: `${T.space[6]}px ${T.space[7]}px`,
        maxWidth: view === "leveling" ? 1200 : 900,
        fontFamily: "'DM Sans', sans-serif",
        transition: "max-width 200ms",
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(124,92,252,0.2), rgba(191,90,242,0.1))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={view === "leveling" ? I.report : I.send} size={20} color={C.accent} />
          </div>
          <div>
            <h2 style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: 0 }}>
              {view === "leveling" ? "Bid Leveling" : "Bid Packages"}
            </h2>
            <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
              {view === "leveling"
                ? "Compare all proposals side-by-side with scope gap analysis"
                : "Send scope to subs, track responses, and auto-populate bid leveling"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View Toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              overflow: "hidden",
            }}
          >
            {[
              { key: "packages", icon: I.send, label: "Packages" },
              { key: "leveling", icon: I.report, label: "Leveling" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  background: view === v.key ? `${C.accent}15` : "transparent",
                  color: view === v.key ? C.accent : C.textMuted,
                  borderRight: v.key === "packages" ? `1px solid ${C.border}` : "none",
                }}
              >
                <Ic d={v.icon} size={13} color={view === v.key ? C.accent : C.textMuted} />
                {v.label}
              </button>
            ))}
          </div>

          {/* Auto-Generate button */}
          <button
            onClick={handleAutoGenerate}
            disabled={autoGenerating}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              color: autoGenerating ? C.textMuted : C.accent,
              border: `1.5px solid ${autoGenerating ? C.border : C.accent}`,
              borderRadius: 10,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: autoGenerating ? "default" : "pointer",
              opacity: autoGenerating ? 0.6 : 1,
              transition: "all 150ms",
            }}
          >
            <Ic
              d={I.ai}
              size={14}
              color={autoGenerating ? C.textMuted : C.accent}
              style={autoGenerating ? { animation: "spin 1s linear infinite" } : {}}
            />
            {autoGenerating ? "Generating..." : "Auto-Generate"}
          </button>

          {/* New Package button */}
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: `linear-gradient(135deg, ${C.accent}, #BF5AF2)`,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Ic d={I.plus} size={14} />
            New Package
          </button>
        </div>
      </div>

      {/* Sync indicator */}
      {syncing && (
        <div
          style={{
            color: C.textMuted,
            fontSize: 12,
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ic d={I.refresh} size={12} color={C.textMuted} style={{ animation: "spin 1s linear infinite" }} />
          Syncing with server...
        </div>
      )}

      {/* Bid Tracking KPIs */}
      {view === "packages" && bidPackages.length > 0 && <BidTrackingStrip />}

      {/* Content: Packages or Leveling */}
      {view === "packages" ? (
        <BidPackagesPanel
          onCreateNew={() => setShowCreate(true)}
          onViewProposal={proposal => setSelectedProposal(proposal)}
          onCompare={(pkg, proposals) => setCompareData({ pkg, proposals })}
          onAward={pkg => setAwardPkg(pkg)}
        />
      ) : (
        <BidLevelingGrid onViewProposal={proposal => setSelectedProposal(proposal)} onAward={pkg => setAwardPkg(pkg)} />
      )}

      {/* Modals */}
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
