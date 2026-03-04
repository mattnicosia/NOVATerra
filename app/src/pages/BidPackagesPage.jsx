import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import BidPackagesPanel from "@/components/estimate/BidPackagesPanel";
import CreateBidPackageModal from "@/components/estimate/CreateBidPackageModal";
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

  const [showCreate, setShowCreate] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [awardPkg, setAwardPkg] = useState(null);
  const [syncing, setSyncing] = useState(false);

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
        maxWidth: 900,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
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
            <Ic d={I.send} size={20} color={C.accent} />
          </div>
          <div>
            <h2 style={{ color: C.text, fontSize: 18, fontWeight: 600, margin: 0 }}>Bid Packages</h2>
            <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
              Send scope to subs, track responses, and auto-populate bid leveling
            </p>
          </div>
        </div>

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

      {/* Package List */}
      <BidPackagesPanel
        onCreateNew={() => setShowCreate(true)}
        onViewProposal={proposal => setSelectedProposal(proposal)}
        onCompare={(pkg, proposals) => setCompareData({ pkg, proposals })}
        onAward={pkg => setAwardPkg(pkg)}
      />

      {/* Modals */}
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
