import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, inp, card as cardStyle } from "@/utils/styles";
import { TRADE_MAP, TRADE_COLORS } from "@/constants/tradeGroupings";
import { CSI } from "@/constants/csi";
import { generateScopeSheet } from "@/utils/scopeSheetGenerator";
import { callAnthropic } from "@/utils/ai";

/* ────────────────────────────────────────────────────────
   AutoBidPackageReview — Card-based review/approval UI
   for NOVA auto-generated bid packages.
   User toggles packages on/off, edits names/messages,
   and sends all with one click.
   ──────────────────────────────────────────────────────── */

export default function AutoBidPackageReview({ proposals, onClose }) {
  const C = useTheme();
  const T = C.T;

  // Stores
  const items = useItemsStore(s => s.items);
  const drawings = useDrawingsStore(s => s.drawings);
  const subs = useMasterDataStore(s => s.masterData.subcontractors);
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const addBidPackage = useBidPackagesStore(s => s.addBidPackage);
  const setPackageInvitations = useBidPackagesStore(s => s.setPackageInvitations);
  const showToast = useUiStore(s => s.showToast);

  // Local mutable state — store originals so unchecked items remain visible in the list
  const [packages, setPackages] = useState(() =>
    proposals.map(p => ({
      ...p,
      itemIds: [...p.itemIds],
      drawingIds: [...p.drawingIds],
      subIds: [...p.subIds],
      _origDrawingIds: [...p.drawingIds],
      _origSubIds: [...p.subIds],
    })),
  );
  const [expandedId, setExpandedId] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [coverEditId, setCoverEditId] = useState(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [subSearchId, setSubSearchId] = useState(null); // which package is browsing all subs
  const [subSearchQuery, setSubSearchQuery] = useState("");
  const [generatingCoverId, setGeneratingCoverId] = useState(null);

  const handleNovaWriteCover = async (pkg) => {
    setGeneratingCoverId(pkg.id);
    try {
      const result = await callAnthropic({
        max_tokens: 500,
        system: `You are NOVA, an AI assistant for a general contractor writing RFP cover messages to subcontractors. Write a brief, professional cover message.

The message should:
- Be 3-5 sentences
- Reference the project name and specific trade/scope
- Mention due date if provided
- Be direct and professional (GC-to-sub tone)
- Do NOT include greetings or sign-offs`,
        messages: [{
          role: "user",
          content: `Project: ${project.name || "Untitled"}
Trade Package: ${pkg.name}
Due Date: ${pkg.dueDate || project.bidDue || "TBD"}
Items: ${pkg.items.slice(0, 8).map(i => i.description || i.code).join(", ")}

Write a professional RFP cover message.`
        }],
        temperature: 0.4,
      });
      const text = result?.content?.[0]?.text || "";
      if (text) updatePkg(pkg.id, { coverMessage: text.trim() });
    } catch (err) {
      console.error("[NOVA Write] Failed:", err);
    }
    setGeneratingCoverId(null);
  };

  // Derived
  const enabledPkgs = useMemo(() => packages.filter(p => p.enabled), [packages]);
  const totalItems = useMemo(() => enabledPkgs.reduce((s, p) => s + p.itemIds.length, 0), [enabledPkgs]);
  const totalSubs = useMemo(() => {
    const ids = new Set();
    enabledPkgs.forEach(p => p.subIds.forEach(id => ids.add(id)));
    return ids.size;
  }, [enabledPkgs]);

  // ─── Mutators ────────────────────────────────────────────
  const updatePkg = (id, updates) => setPackages(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));

  const toggleEnabled = id => updatePkg(id, { enabled: !packages.find(p => p.id === id)?.enabled });

  const toggleItem = (pkgId, itemId) =>
    setPackages(prev =>
      prev.map(p => {
        if (p.id !== pkgId) return p;
        const ids = p.itemIds.includes(itemId) ? p.itemIds.filter(i => i !== itemId) : [...p.itemIds, itemId];
        return { ...p, itemIds: ids, itemCount: ids.length };
      }),
    );

  const toggleDrawing = (pkgId, drawingId) =>
    setPackages(prev =>
      prev.map(p => {
        if (p.id !== pkgId) return p;
        const ids = p.drawingIds.includes(drawingId)
          ? p.drawingIds.filter(i => i !== drawingId)
          : [...p.drawingIds, drawingId];
        return { ...p, drawingIds: ids };
      }),
    );

  const toggleSub = (pkgId, subId) =>
    setPackages(prev =>
      prev.map(p => {
        if (p.id !== pkgId) return p;
        const ids = p.subIds.includes(subId) ? p.subIds.filter(i => i !== subId) : [...p.subIds, subId];
        return { ...p, subIds: ids };
      }),
    );

  // ─── Send All ────────────────────────────────────────────
  const handleSendAll = async () => {
    const toSend = enabledPkgs.filter(p => p.subIds.length > 0);
    if (toSend.length === 0) {
      showToast("No packages with subcontractors to send", "error");
      return;
    }

    setSending(true);
    setProgress({ sent: 0, total: toSend.length });

    const token = useAuthStore.getState().session?.access_token;
    let successCount = 0;
    let failCount = 0;

    for (const pkg of toSend) {
      try {
        const selectedEstItems = items.filter(i => pkg.itemIds.includes(i.id));
        const scopeItems = selectedEstItems.map(i => ({
          id: i.id,
          code: i.code,
          description: i.description,
          division: i.division,
        }));
        const scopeSheet = generateScopeSheet(selectedEstItems, CSI);

        const subsToInvite = subs
          .filter(s => pkg.subIds.includes(s.id))
          .map(s => ({
            company: s.company,
            contact: s.contact,
            email: s.email,
            phone: s.phone,
            trade: (s.trades || []).map(tk => TRADE_MAP[tk]?.label || tk).join(", ") || "",
          }));

        // Create on server FIRST to get the UUID
        const resp = await fetch("/api/bid-package", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            estimateId,
            name: pkg.name,
            scopeItems,
            scopeSheet: scopeSheet.html,
            drawingIds: pkg.drawingIds,
            coverMessage: pkg.coverMessage,
            dueDate: pkg.dueDate || null,
            subs: subsToInvite,
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${resp.status}`);
        }

        const { package: serverPkg, invitations: serverInvites } = await resp.json();
        const pkgId = serverPkg.id;

        // Add to local store with server-generated UUID
        addBidPackage({
          id: pkgId,
          estimateId,
          name: pkg.name,
          scopeItems,
          scopeSheet: scopeSheet.plainText,
          drawingIds: pkg.drawingIds,
          coverMessage: pkg.coverMessage,
          dueDate: pkg.dueDate || null,
        });

        // Store server invitations locally
        const localInvites = serverInvites.map(inv => ({
          id: inv.id,
          subCompany: inv.sub_company,
          subContact: inv.sub_contact,
          subEmail: inv.sub_email,
          subPhone: inv.sub_phone,
          subTrade: inv.sub_trade,
          status: inv.status,
          sentAt: inv.sent_at,
        }));
        setPackageInvitations(pkgId, localInvites);

        // Send invite emails
        await Promise.allSettled(
          serverInvites.map(inv =>
            fetch("/api/send-bid-invite", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                invitationId: inv.id,
                packageId: pkgId,
              }),
            }),
          ),
        );

        successCount++;
      } catch (err) {
        console.error(`[AutoBid] Failed "${pkg.name}":`, err);
        failCount++;
      }

      setProgress(prev => ({ ...prev, sent: (prev?.sent || 0) + 1 }));
    }

    setSending(false);
    setProgress(null);

    if (failCount === 0) {
      showToast(`All ${successCount} bid packages sent successfully`, "success");
    } else {
      showToast(`${successCount} sent, ${failCount} failed`, "warning");
    }
    onClose();
  };

  // ─── Render Helpers ──────────────────────────────────────
  const checkbox = checked => ({
    width: 16,
    height: 16,
    borderRadius: 4,
    border: `1.5px solid ${checked ? C.accent : C.border}`,
    background: checked ? C.accent : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.1s",
  });

  const toggleSwitch = enabled => ({
    width: 36,
    height: 20,
    borderRadius: 10,
    background: enabled ? C.accent : C.border,
    cursor: "pointer",
    position: "relative",
    transition: "background 0.2s",
    flexShrink: 0,
  });

  const toggleKnob = enabled => ({
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "#fff",
    position: "absolute",
    top: 2,
    left: enabled ? 18 : 2,
    transition: "left 0.2s",
  });

  // ─── Render ──────────────────────────────────────────────
  return (
    <Modal onClose={!sending ? onClose : undefined} extraWide>
      <div style={{ minWidth: 0, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ marginBottom: T.space[5] }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[2] }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: T.radius.sm,
                background: `linear-gradient(135deg, ${C.accent}25, #BF5AF220)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.ai} size={18} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                NOVA Auto-Generated Bid Packages
              </div>
              <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
                {enabledPkgs.length} package{enabledPkgs.length !== 1 ? "s" : ""} · {totalItems} scope items ·{" "}
                {totalSubs} subcontractor{totalSubs !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Package Cards Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: T.space[3],
            marginBottom: T.space[5],
            alignContent: "start",
          }}
        >
          {packages.map(pkg => {
            const isExpanded = expandedId === pkg.id;
            const tradeColor = TRADE_COLORS[pkg.tradeKey] || C.accent;
            // Use _orig arrays to show the full matched set (not just currently checked)
            const pkgDrawings = drawings.filter(d => (pkg._origDrawingIds || pkg.drawingIds).includes(d.id));
            const pkgSubs = subs.filter(s => (pkg._origSubIds || pkg.subIds).includes(s.id));

            return (
              <div
                key={pkg.id}
                style={{
                  ...cardStyle(C),
                  padding: 0,
                  opacity: pkg.enabled ? 1 : 0.4,
                  transition: "opacity 0.2s, box-shadow 0.15s",
                  gridColumn: isExpanded ? "span 2" : undefined,
                }}
              >
                {/* Card Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[3],
                    padding: `${T.space[4]}px ${T.space[4]}px`,
                    borderBottom: isExpanded ? `1px solid ${C.border}` : "none",
                  }}
                >
                  {/* Trade color dot */}
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: tradeColor,
                      flexShrink: 0,
                    }}
                  />

                  {/* Name (editable) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingNameId === pkg.id ? (
                      <input
                        autoFocus
                        value={pkg.name}
                        onChange={e => updatePkg(pkg.id, { name: e.target.value })}
                        onBlur={() => setEditingNameId(null)}
                        onKeyDown={e => e.key === "Enter" && setEditingNameId(null)}
                        style={{
                          ...inp(C),
                          padding: "2px 6px",
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.semibold,
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => pkg.enabled && setEditingNameId(pkg.id)}
                        style={{
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.semibold,
                          color: C.text,
                          cursor: pkg.enabled ? "text" : "default",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pkg.name}
                      </div>
                    )}
                    <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginTop: 2 }}>
                      {pkg.itemIds.length} item{pkg.itemIds.length !== 1 ? "s" : ""} · {pkg.drawingIds.length} drawing
                      {pkg.drawingIds.length !== 1 ? "s" : ""} ·{" "}
                      {pkg.subIds.length > 0 ? (
                        <span>
                          {pkg.subIds.length} sub{pkg.subIds.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#f59e0b" }}>no subs matched</span>
                      )}
                    </div>
                  </div>

                  {/* Expand/Collapse */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      color: C.textDim,
                    }}
                    title={isExpanded ? "Collapse" : "Expand to edit"}
                  >
                    <Ic d={isExpanded ? I.chevUp : I.chevDown} size={14} color={C.textDim} />
                  </button>

                  {/* Toggle switch */}
                  <div onClick={() => toggleEnabled(pkg.id)} style={toggleSwitch(pkg.enabled)}>
                    <div style={toggleKnob(pkg.enabled)} />
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && pkg.enabled && (
                  <div style={{ padding: T.space[4] }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[4] }}>
                      {/* Left: Scope Items */}
                      <div>
                        <div
                          style={{
                            fontSize: T.fontSize.xs,
                            fontWeight: T.fontWeight.semibold,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: T.space[2],
                          }}
                        >
                          Scope Items ({pkg.itemIds.length})
                        </div>
                        <div style={{ maxHeight: 200, overflowY: "auto" }}>
                          {pkg.items.map(item => {
                            const checked = pkg.itemIds.includes(item.id);
                            return (
                              <div
                                key={item.id}
                                onClick={() => toggleItem(pkg.id, item.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: T.space[2],
                                  padding: "3px 0",
                                  cursor: "pointer",
                                  fontSize: T.fontSize.xs,
                                  color: checked ? C.text : C.textDim,
                                }}
                              >
                                <div style={checkbox(checked)}>
                                  {checked && <Ic d={I.check} size={10} color="#fff" sw={2.5} />}
                                </div>
                                <span
                                  style={{
                                    color: C.textMuted,
                                    flexShrink: 0,
                                    width: 55,
                                    fontFamily: "monospace",
                                    fontSize: 10,
                                  }}
                                >
                                  {item.code || "—"}
                                </span>
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {item.description || item.code || "Item"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Drawings + Subs */}
                      <div>
                        {/* Drawings */}
                        <div
                          style={{
                            fontSize: T.fontSize.xs,
                            fontWeight: T.fontWeight.semibold,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: T.space[2],
                          }}
                        >
                          Drawings ({pkg.drawingIds.length})
                        </div>
                        {pkgDrawings.length === 0 ? (
                          <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginBottom: T.space[3] }}>
                            No matching drawings
                          </div>
                        ) : (
                          <div style={{ maxHeight: 80, overflowY: "auto", marginBottom: T.space[3] }}>
                            {pkgDrawings.map(d => {
                              const checked = pkg.drawingIds.includes(d.id);
                              return (
                                <div
                                  key={d.id}
                                  onClick={() => toggleDrawing(pkg.id, d.id)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: T.space[2],
                                    padding: "2px 0",
                                    cursor: "pointer",
                                    fontSize: T.fontSize.xs,
                                    color: checked ? C.text : C.textDim,
                                  }}
                                >
                                  <div style={checkbox(checked)}>
                                    {checked && <Ic d={I.check} size={10} color="#fff" sw={2.5} />}
                                  </div>
                                  <Ic d={I.plans} size={11} color={C.textDim} />
                                  <span>{d.label || d.sheetNumber || d.name || "Drawing"}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Subcontractors */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: T.space[2],
                          }}
                        >
                          <div
                            style={{
                              fontSize: T.fontSize.xs,
                              fontWeight: T.fontWeight.semibold,
                              color: C.textDim,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Subcontractors ({pkg.subIds.length})
                          </div>
                          <button
                            onClick={() => {
                              setSubSearchId(subSearchId === pkg.id ? null : pkg.id);
                              setSubSearchQuery("");
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: T.fontSize.xs,
                              color: C.accent,
                              fontWeight: T.fontWeight.medium,
                            }}
                          >
                            {subSearchId === pkg.id ? "Done" : "+ Browse All"}
                          </button>
                        </div>

                        {/* Selected subs */}
                        {pkg.subIds.length === 0 && subSearchId !== pkg.id ? (
                          <div
                            style={{
                              fontSize: T.fontSize.xs,
                              color: "#f59e0b",
                              padding: "4px 8px",
                              borderRadius: T.radius.sm,
                              background: "#f59e0b10",
                            }}
                          >
                            No subs matched — click "+ Browse All" to add subs
                          </div>
                        ) : (
                          <div style={{ maxHeight: 100, overflowY: "auto" }}>
                            {subs
                              .filter(s => pkg.subIds.includes(s.id))
                              .map(s => (
                                <div
                                  key={s.id}
                                  onClick={() => toggleSub(pkg.id, s.id)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: T.space[2],
                                    padding: "2px 0",
                                    cursor: "pointer",
                                    fontSize: T.fontSize.xs,
                                    color: C.text,
                                  }}
                                >
                                  <div style={checkbox(true)}>
                                    <Ic d={I.check} size={10} color="#fff" sw={2.5} />
                                  </div>
                                  <Ic d={I.user} size={11} color={C.textDim} />
                                  <span>{s.company || s.contact || "Unknown"}</span>
                                  {s.email && (
                                    <span style={{ color: C.textDim, marginLeft: "auto", fontSize: 10 }}>
                                      {s.email}
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Browse All Subs search panel */}
                        {subSearchId === pkg.id &&
                          (() => {
                            const q = subSearchQuery.toLowerCase();
                            const browseSubs = q
                              ? subs.filter(
                                  s =>
                                    !pkg.subIds.includes(s.id) &&
                                    ((s.company || "").toLowerCase().includes(q) ||
                                      (s.contact || "").toLowerCase().includes(q) ||
                                      (s.trades || []).some(tk =>
                                        (TRADE_MAP[tk]?.label || tk).toLowerCase().includes(q),
                                      )),
                                )
                              : subs.filter(s => !pkg.subIds.includes(s.id)).slice(0, 20);
                            return (
                              <div
                                style={{
                                  marginTop: T.space[2],
                                  padding: T.space[2],
                                  borderRadius: T.radius.sm,
                                  background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                                  border: `1px solid ${C.border}`,
                                }}
                              >
                                <input
                                  autoFocus
                                  placeholder="Search by company, contact, or trade..."
                                  value={subSearchQuery}
                                  onChange={e => setSubSearchQuery(e.target.value)}
                                  style={{
                                    ...inp(C),
                                    width: "100%",
                                    padding: "4px 8px",
                                    fontSize: T.fontSize.xs,
                                    marginBottom: T.space[2],
                                  }}
                                />
                                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                                  {browseSubs.length === 0 ? (
                                    <div style={{ fontSize: T.fontSize.xs, color: C.textDim, padding: 4 }}>
                                      {q ? "No matching subs" : "All subs already added"}
                                    </div>
                                  ) : (
                                    browseSubs.slice(0, 50).map(s => (
                                      <div
                                        key={s.id}
                                        onClick={() => toggleSub(pkg.id, s.id)}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: T.space[2],
                                          padding: "3px 0",
                                          cursor: "pointer",
                                          fontSize: T.fontSize.xs,
                                          color: C.textDim,
                                        }}
                                      >
                                        <div style={checkbox(false)} />
                                        <span style={{ fontWeight: 500, color: C.text }}>{s.company || "Unknown"}</span>
                                        {(s.trades || []).slice(0, 2).map(tk => (
                                          <span
                                            key={tk}
                                            style={{
                                              fontSize: 9,
                                              padding: "0 4px",
                                              borderRadius: 3,
                                              background: `${TRADE_COLORS[tk] || C.accent}18`,
                                              color: TRADE_COLORS[tk] || C.textDim,
                                            }}
                                          >
                                            {(TRADE_MAP[tk]?.label || tk).split(" ")[0]}
                                          </span>
                                        ))}
                                        {s.email && <span style={{ marginLeft: "auto", fontSize: 10 }}>{s.email}</span>}
                                      </div>
                                    ))
                                  )}
                                  {!q && subs.filter(s => !pkg.subIds.includes(s.id)).length > 20 && (
                                    <div
                                      style={{ fontSize: 10, color: C.textDim, padding: "4px 0", fontStyle: "italic" }}
                                    >
                                      Type to search {subs.filter(s => !pkg.subIds.includes(s.id)).length} subs...
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    </div>

                    {/* Cover Message */}
                    <div style={{ marginTop: T.space[4] }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: T.space[2],
                        }}
                      >
                        <div
                          style={{
                            fontSize: T.fontSize.xs,
                            fontWeight: T.fontWeight.semibold,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Cover Message
                        </div>
                        <div style={{ display: "flex", gap: T.space[2] }}>
                          <button
                            onClick={() => handleNovaWriteCover(pkg)}
                            disabled={generatingCoverId === pkg.id}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: generatingCoverId === pkg.id ? "not-allowed" : "pointer",
                              fontSize: T.fontSize.xs,
                              color: C.accent,
                              fontWeight: T.fontWeight.medium,
                              opacity: generatingCoverId === pkg.id ? 0.5 : 1,
                            }}
                          >
                            {generatingCoverId === pkg.id ? "Generating..." : "\u2726 NOVA Write"}
                          </button>
                          <button
                            onClick={() => setCoverEditId(coverEditId === pkg.id ? null : pkg.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: T.fontSize.xs,
                              color: C.accent,
                              fontWeight: T.fontWeight.medium,
                            }}
                          >
                            {coverEditId === pkg.id ? "Done" : "Edit"}
                          </button>
                        </div>
                      </div>
                      {coverEditId === pkg.id ? (
                        <textarea
                          value={pkg.coverMessage}
                          onChange={e => updatePkg(pkg.id, { coverMessage: e.target.value })}
                          rows={3}
                          style={{ ...inp(C), resize: "vertical", fontSize: T.fontSize.xs }}
                        />
                      ) : (
                        <div
                          style={{
                            fontSize: T.fontSize.xs,
                            color: C.textMuted,
                            padding: T.space[3],
                            borderRadius: T.radius.sm,
                            background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                            border: `1px solid ${C.border}`,
                            lineHeight: 1.5,
                          }}
                        >
                          {pkg.coverMessage || "(no cover message)"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer: Progress or Actions */}
        {sending ? (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: T.space[4] }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${((progress?.sent || 0) / (progress?.total || 1)) * 100}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${C.accent}, #BF5AF2)`,
                    borderRadius: 3,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, flexShrink: 0 }}>
                Sending {progress?.sent || 0} of {progress?.total || 0}...
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `1px solid ${C.border}`,
              paddingTop: T.space[4],
            }}
          >
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
              {enabledPkgs.filter(p => p.subIds.length === 0).length > 0 && (
                <span style={{ color: "#f59e0b" }}>
                  ⚠ {enabledPkgs.filter(p => p.subIds.length === 0).length} package
                  {enabledPkgs.filter(p => p.subIds.length === 0).length !== 1 ? "s" : ""} have no subs and won't be
                  sent
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: T.space[3] }}>
              <button
                style={bt(C, {
                  padding: "8px 20px",
                  background: "transparent",
                  color: C.textMuted,
                  border: `1px solid ${C.border}`,
                })}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                style={bt(C, {
                  padding: "8px 24px",
                  background: `linear-gradient(135deg, ${C.accent}, #BF5AF2)`,
                  color: "#fff",
                  fontSize: T.fontSize.sm,
                })}
                onClick={handleSendAll}
                disabled={enabledPkgs.filter(p => p.subIds.length > 0).length === 0}
              >
                <Ic d={I.send} size={14} color="#fff" />
                Send {enabledPkgs.filter(p => p.subIds.length > 0).length} Package
                {enabledPkgs.filter(p => p.subIds.length > 0).length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
