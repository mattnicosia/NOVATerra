// ============================================================
// Re-engage Preferred Subs Panel
// Shown on revision estimates that inherited preferred subs.
// Lets GC selectively re-invite preferred subs for specific trades.
// ============================================================

import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { supabase } from "@/utils/supabase";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, inp } from "@/utils/styles";
import { fmt } from "@/utils/format";

export default function ReengageSubsPanel({ onClose }) {
  const C = useTheme();
  const T = C.T;

  const preferredSubs = useBidLevelingStore(s => s.preferredSubs);
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const showToast = useUiStore(s => s.showToast);

  const currentEntry = estimatesIndex.find(e => e.id === activeEstimateId);
  const isRevision = !!currentEntry?.parentEstimateId;
  const revisionReason = currentEntry?.revisionReason || "";

  // Build list of preferred subs with their trade info
  const preferredList = useMemo(() => {
    return Object.entries(preferredSubs).map(([trade, info]) => ({
      trade,
      ...info,
      // Check if already invited in this revision's bid packages
      alreadyInvited: Object.values(invitations).some(pkgInvites =>
        (pkgInvites || []).some(inv =>
          inv.subCompany === info.subName || inv.subEmail === info.subEmail,
        ),
      ),
    }));
  }, [preferredSubs, invitations]);

  // Selection state
  const [selectedTrades, setSelectedTrades] = useState(
    () => new Set(preferredList.filter(p => !p.alreadyInvited).map(p => p.trade)),
  );
  const [coverMessage, setCoverMessage] = useState(
    revisionReason
      ? `We're working on a revision for this project. The owner has requested: ${revisionReason}. We'd appreciate your updated pricing or value engineering input on your scope.`
      : "We're working on a revision for this project and would appreciate your updated pricing or input on your scope.",
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const toggleTrade = trade => {
    setSelectedTrades(prev => {
      const next = new Set(prev);
      if (next.has(trade)) next.delete(trade);
      else next.add(trade);
      return next;
    });
  };

  const handleSend = async () => {
    const toSend = preferredList.filter(p => selectedTrades.has(p.trade) && !p.alreadyInvited);
    if (toSend.length === 0) {
      showToast("No subs selected", "error");
      return;
    }

    setSending(true);
    try {
      // Get fresh token
      let token = null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      }
      if (!token) throw new Error("Not authenticated");

      // Find or create a bid package for re-engagement
      let packageId = bidPackages.find(p => p.name?.includes("Revision"))?.id;

      if (!packageId) {
        // Create a lightweight bid package for the re-engagement
        const resp = await fetch("/api/bid-invitation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            packageId: null,
            createPackage: true,
            packageName: `Revision ${currentEntry?.revisionNumber || ""} — Re-engagement`,
            estimateId: activeEstimateId,
            subs: toSend.map(p => ({
              company: p.subName,
              contact: "",
              email: p.subEmail || "",
              phone: "",
              trade: p.trade,
            })),
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create invitations");
        }

        const result = await resp.json();
        const serverInvites = result.invitations || [];

        // Send emails
        await Promise.allSettled(
          serverInvites.map(inv =>
            fetch("/api/send-bid-invite", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                invitationId: inv.id,
                packageId: result.packageId || inv.package_id,
                coverMessage,
              }),
            }),
          ),
        );

        showToast(`${toSend.length} preferred sub${toSend.length !== 1 ? "s" : ""} re-engaged`);
        setSent(true);
      } else {
        // Use existing revision package
        const resp = await fetch("/api/bid-invitation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            packageId,
            subs: toSend.map(p => ({
              company: p.subName,
              contact: "",
              email: p.subEmail || "",
              phone: "",
              trade: p.trade,
            })),
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create invitations");
        }

        const { invitations: serverInvites } = await resp.json();

        // Send emails
        await Promise.allSettled(
          serverInvites.map(inv =>
            fetch("/api/send-bid-invite", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ invitationId: inv.id, packageId, coverMessage }),
            }),
          ),
        );

        // Update local store
        const existing = useBidPackagesStore.getState().invitations[packageId] || [];
        const newLocal = serverInvites.map(inv => ({
          id: inv.id,
          subCompany: inv.sub_company,
          subContact: inv.sub_contact,
          subEmail: inv.sub_email,
          subPhone: inv.sub_phone,
          subTrade: inv.sub_trade,
          status: inv.status,
          sentAt: inv.sent_at,
        }));
        useBidPackagesStore.getState().setPackageInvitations(packageId, [...existing, ...newLocal]);

        showToast(`${toSend.length} preferred sub${toSend.length !== 1 ? "s" : ""} re-engaged`);
        setSent(true);
      }
    } catch (err) {
      console.error("[ReengageSubsPanel] Error:", err);
      showToast(err.message || "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  if (preferredList.length === 0) return null;

  return (
    <div
      style={{
        background: `${C.accent}08`,
        border: `1px solid ${C.accent}25`,
        borderRadius: 10,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#FBBF24", fontSize: 16 }}>★</span>
            Preferred Subs
            {isRevision && (
              <span style={{ fontSize: 10, fontWeight: 500, color: C.textMuted, marginLeft: 4 }}>
                — carried from original estimate
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {sent
              ? "Invitations sent. You'll see responses in Bid Packages."
              : "Select which preferred subs to re-engage for this revision."}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 16, cursor: "pointer" }}
          >
            ×
          </button>
        )}
      </div>

      {/* Sub list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {preferredList.map(sub => {
          const selected = selectedTrades.has(sub.trade);
          const disabled = sub.alreadyInvited || sent;
          return (
            <div
              key={sub.trade}
              onClick={() => !disabled && toggleTrade(sub.trade)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 7,
                background: selected && !disabled ? `${C.accent}12` : C.bg2,
                border: `1px solid ${selected && !disabled ? `${C.accent}40` : C.border}`,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: `2px solid ${selected ? C.accent : C.border}`,
                  background: selected ? C.accent : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {selected && <Ic d={I.check} size={11} color="#fff" sw={3} />}
              </div>

              {/* Sub info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {sub.subName}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  {sub.trade}
                  {sub.totalBid > 0 && (
                    <span style={{ marginLeft: 8, color: C.textMuted }}>
                      Last bid: {fmt(sub.totalBid)}
                    </span>
                  )}
                </div>
              </div>

              {/* Status badges */}
              {sub.alreadyInvited && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: C.green || "#30D158",
                  background: "rgba(48,209,88,0.12)", padding: "2px 8px", borderRadius: 4,
                }}>
                  Already Invited
                </span>
              )}
              {sent && selected && !sub.alreadyInvited && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: C.accent,
                  background: `${C.accent}15`, padding: "2px 8px", borderRadius: 4,
                }}>
                  Sent
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Cover message */}
      {!sent && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, marginBottom: 4, letterSpacing: "0.04em" }}>
            MESSAGE TO SUBS (OPTIONAL)
          </div>
          <textarea
            value={coverMessage}
            onChange={e => setCoverMessage(e.target.value)}
            rows={2}
            style={inp(C, { fontSize: 11, resize: "vertical", lineHeight: 1.5 })}
            placeholder="Brief context about what changed and what you need from them..."
          />
        </div>
      )}

      {/* Action buttons */}
      {!sent && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={() => {
              if (selectedTrades.size === preferredList.filter(p => !p.alreadyInvited).length) {
                setSelectedTrades(new Set());
              } else {
                setSelectedTrades(new Set(preferredList.filter(p => !p.alreadyInvited).map(p => p.trade)));
              }
            }}
            style={bt(C, {
              background: "transparent",
              color: C.textMuted,
              border: `1px solid ${C.border}`,
              padding: "6px 14px",
              fontSize: 11,
              fontWeight: 500,
            })}
          >
            {selectedTrades.size === preferredList.filter(p => !p.alreadyInvited).length ? "Deselect All" : "Select All"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || selectedTrades.size === 0}
            style={bt(C, {
              background: C.accent,
              color: "#fff",
              padding: "6px 18px",
              fontSize: 11,
              fontWeight: 600,
              opacity: sending || selectedTrades.size === 0 ? 0.5 : 1,
            })}
          >
            {sending ? "Sending..." : `Re-engage ${selectedTrades.size} Sub${selectedTrades.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
