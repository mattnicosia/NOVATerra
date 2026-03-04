import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { analyzeGaps } from "@/utils/scopeGapEngine";
import { fireAutoResponse } from "@/utils/autoResponseEngine";

const fmt = v =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);

export default function AwardBidModal({ bidPackage, onClose }) {
  const C = useTheme();
  const invitations = useBidPackagesStore(s => s.invitations);
  const proposals = useBidPackagesStore(s => s.proposals);
  const updateBidPackage = useBidPackagesStore(s => s.updateBidPackage);
  const updateInvitationStatus = useBidPackagesStore(s => s.updateInvitationStatus);
  const items = useItemsStore(s => s.items);
  const showToast = useUiStore(s => s.showToast);

  const [selectedId, setSelectedId] = useState(null);
  const [notes, setNotes] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [step, setStep] = useState("select"); // 'select' | 'confirm'

  const pkgInvites = invitations[bidPackage.id] || [];

  // Get parsed proposals with gap analysis
  const parsedOptions = useMemo(() => {
    return pkgInvites
      .filter(inv => proposals[inv.id]?.parsedData && Object.keys(proposals[inv.id].parsedData).length > 0)
      .map(inv => {
        const pd = proposals[inv.id].parsedData;
        const report = items?.length ? analyzeGaps(items, pd) : null;
        const totalBid = pd.totalBid || 0;
        const exposure = report?.totalExposure || 0;
        return {
          invitationId: inv.id,
          name: pd.subcontractorName || inv.subCompany || inv.subContact || "Unknown",
          totalBid,
          email: inv.subEmail || inv.sub_email,
          coverageScore: report?.coverageScore ?? null,
          exposure,
          adjustedCost: totalBid + exposure,
          exclusionCount: report?.exclusionConflicts?.length || 0,
        };
      })
      .sort((a, b) => (a.adjustedCost || a.totalBid) - (b.adjustedCost || b.totalBid));
  }, [pkgInvites, proposals, items]);

  const selected = parsedOptions.find(o => o.invitationId === selectedId);
  const losers = parsedOptions.filter(o => o.invitationId !== selectedId);

  const handleAward = async () => {
    if (!selectedId) {
      showToast("Select a subcontractor to award", "error");
      return;
    }

    setAwarding(true);
    try {
      const token = useAuthStore.getState().session?.access_token;

      const resp = await fetch("/api/award-bid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageId: bidPackage.id,
          winnerInvitationId: selectedId,
          notes,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to award bid");
      }

      // Update local store
      updateBidPackage(bidPackage.id, {
        status: "awarded",
        awardedInvitationId: selectedId,
        closedAt: new Date().toISOString(),
      });

      // Update invitation statuses locally
      for (const inv of pkgInvites) {
        updateInvitationStatus(bidPackage.id, inv.id, inv.id === selectedId ? "awarded" : "not_awarded");
      }

      // ── Fire auto-response triggers for award results ──
      const awardCtx = (inv, type) => ({
        packageId: bidPackage.id,
        invitationId: inv.id,
        recipientEmail: inv.subEmail || "",
        subCompany: inv.subCompany || inv.subContact || inv.name || "",
        projectName: bidPackage.name || "",
        bidAmount: inv.totalBid ? String(inv.totalBid) : "",
      });
      // Winner
      fireAutoResponse("postAwardWinner", awardCtx(selected));
      // Non-winners
      for (const inv of pkgInvites) {
        if (inv.id !== selectedId && ["submitted", "parsed"].includes(inv.status)) {
          fireAutoResponse("postAwardLoser", awardCtx(inv));
        }
      }

      showToast(`Awarded to ${selected?.name || "selected sub"}`, "success");
      onClose();
    } catch (err) {
      console.error("Award bid error:", err);
      showToast(err.message || "Failed to award bid", "error");
    } finally {
      setAwarding(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(48,209,88,0.2), rgba(48,209,88,0.05))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={I.check} size={18} color="#30D158" />
        </div>
        <div>
          <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>Award Bid</h3>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>{bidPackage.name}</div>
        </div>
      </div>

      {step === "select" ? (
        <>
          {/* Sub options with context */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
              Select Winner
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {parsedOptions.map((opt, i) => {
                const scoreColor =
                  opt.coverageScore >= 80 ? "#30D158" : opt.coverageScore >= 60 ? "#FF9F0A" : "#FF453A";
                const isBestValue = i === 0 && opt.totalBid > 0;
                return (
                  <div
                    key={opt.invitationId}
                    onClick={() => setSelectedId(opt.invitationId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: selectedId === opt.invitationId ? "rgba(48,209,88,0.08)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${selectedId === opt.invitationId ? "rgba(48,209,88,0.3)" : C.border}`,
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        border: `2px solid ${selectedId === opt.invitationId ? "#30D158" : C.border}`,
                        background: selectedId === opt.invitationId ? "#30D158" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selectedId === opt.invitationId && (
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: "#fff" }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: C.text, fontSize: 14, fontWeight: 500 }}>{opt.name}</span>
                        {isBestValue && (
                          <span
                            style={{
                              background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                              color: "#fff",
                              padding: "1px 5px",
                              borderRadius: 3,
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            Best Value
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 11, color: C.textMuted }}>
                        {opt.coverageScore != null && (
                          <span>
                            Coverage: <span style={{ color: scoreColor, fontWeight: 600 }}>{opt.coverageScore}%</span>
                          </span>
                        )}
                        {opt.exposure > 0 && (
                          <span>
                            Exposure: <span style={{ color: "#FF453A", fontWeight: 600 }}>{fmt(opt.exposure)}</span>
                          </span>
                        )}
                        {opt.exclusionCount > 0 && (
                          <span>
                            {opt.exclusionCount} exclusion{opt.exclusionCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#30D158", fontSize: 16, fontWeight: 700 }}>
                        {opt.totalBid ? fmt(opt.totalBid) : "—"}
                      </div>
                      {opt.exposure > 0 && opt.totalBid > 0 && (
                        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 1 }}>
                          adj: {fmt(opt.adjustedCost)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this award decision..."
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                color: C.text,
                fontSize: 13,
                resize: "vertical",
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => selectedId && setStep("confirm")}
              disabled={!selectedId}
              style={{
                background: selectedId ? "linear-gradient(135deg, #30D158, #34C759)" : C.border,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 24px",
                fontSize: 13,
                fontWeight: 600,
                cursor: selectedId ? "pointer" : "not-allowed",
              }}
            >
              Review Award
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Confirmation Step */}
          <div
            style={{
              padding: "16px",
              borderRadius: 12,
              marginBottom: 16,
              background: "rgba(48,209,88,0.06)",
              border: "1px solid rgba(48,209,88,0.15)",
            }}
          >
            <div
              style={{
                color: C.textMuted,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Awarding to
            </div>
            <div style={{ color: C.text, fontSize: 18, fontWeight: 700 }}>{selected?.name}</div>
            <div style={{ color: "#30D158", fontSize: 20, fontWeight: 700, marginTop: 4 }}>
              {selected?.totalBid ? fmt(selected.totalBid) : "—"}
            </div>
            {selected?.email && <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>{selected.email}</div>}
          </div>

          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(124,92,252,0.06)",
              border: `1px solid ${C.accent}20`,
              color: C.textMuted,
              fontSize: 12,
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>This will:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div>
                1. Send an award notification email to <strong style={{ color: C.text }}>{selected?.name}</strong>
              </div>
              <div>
                2. Send constructive feedback to {losers.length} other bidder{losers.length !== 1 ? "s" : ""}
              </div>
              <div>3. Close the bid package</div>
            </div>
          </div>

          {notes && (
            <div
              style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 16 }}
            >
              <div
                style={{ color: C.textDim, fontSize: 10, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}
              >
                Notes
              </div>
              <div style={{ color: C.textMuted, fontSize: 12 }}>{notes}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setStep("select")}
              style={{
                background: "none",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              onClick={handleAward}
              disabled={awarding}
              style={{
                background: "linear-gradient(135deg, #30D158, #34C759)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 24px",
                fontSize: 13,
                fontWeight: 600,
                cursor: awarding ? "wait" : "pointer",
                opacity: awarding ? 0.6 : 1,
              }}
            >
              {awarding ? "Awarding..." : "Confirm Award & Notify"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
