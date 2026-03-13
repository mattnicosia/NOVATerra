import { useState, useMemo, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { TRADE_MAP } from "@/constants/tradeGroupings";
import { TradeBadge, default as TradeMultiSelect } from "@/components/contacts/TradeMultiSelect";

export default function InviteSubsModal({ packageId, packageName, selectedTrades, existingEmails, onClose }) {
  const C = useTheme();
  const T = C.T;

  // Store data
  const subs = useMasterDataStore(s => s.masterData.subcontractors);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const toggleSubPreferred = useMasterDataStore(s => s.toggleSubPreferred);
  const setPackageInvitations = useBidPackagesStore(s => s.setPackageInvitations);
  const showToast = useUiStore(s => s.showToast);

  // Local state
  const [selectedSubs, setSelectedSubs] = useState([]);
  const [subTab, setSubTab] = useState("contacts");
  const [subSearch, setSubSearch] = useState("");
  const [networkSubs, setNetworkSubs] = useState([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  const [networkFetched, setNetworkFetched] = useState(false);
  const [selectedNetworkSubs, setSelectedNetworkSubs] = useState([]);
  const [coverMessage, setCoverMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSub, setNewSub] = useState({ company: "", trades: [], contact: "", email: "", phone: "" });

  // Normalize existing emails for dedup
  const existingEmailSet = useMemo(
    () => new Set((existingEmails || []).map(e => e.toLowerCase())),
    [existingEmails],
  );

  // Filter subs: exclude already-invited emails
  const availableSubs = useMemo(
    () => subs.filter(s => !s.email || !existingEmailSet.has(s.email.toLowerCase())),
    [subs, existingEmailSet],
  );

  // Search filter
  const filteredSubs = useMemo(() => {
    if (!subSearch) return availableSubs;
    const q = subSearch.toLowerCase();
    return availableSubs.filter(
      s =>
        (s.company || "").toLowerCase().includes(q) ||
        (s.trades || []).some(tk => (TRADE_MAP[tk]?.label || tk).toLowerCase().includes(q)) ||
        (s.contact || "").toLowerCase().includes(q),
    );
  }, [availableSubs, subSearch]);

  // Auto-match subs by trades matching selected scope
  const matchedSubIds = useMemo(() => {
    if (!selectedTrades || selectedTrades.size === 0) return new Set();
    return new Set(
      availableSubs.filter(s => (s.trades || []).some(tk => selectedTrades.has(tk))).map(s => s.id),
    );
  }, [availableSubs, selectedTrades]);

  // Auto-select matching subs on mount
  useEffect(() => {
    if (selectedTrades && selectedTrades.size > 0 && matchedSubIds.size > 0) {
      setSelectedSubs(prev => [...new Set([...prev, ...matchedSubIds])]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNetworkSubs = async () => {
    if (networkFetched) return;
    setNetworkLoading(true);
    setNetworkError(null);
    try {
      const token = useAuthStore.getState().session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams();
      // Send selected trades for filtering
      const tradeLabels = [...(selectedTrades || [])]
        .filter(t => TRADE_MAP[t]?.label)
        .map(t => TRADE_MAP[t].label);
      if (tradeLabels.length > 0) params.set("trades", tradeLabels.join(","));
      // Exclude already-invited emails AND local contact emails
      const localEmails = subs.filter(s => s.email).map(s => s.email.toLowerCase());
      const allExclude = [...new Set([...localEmails, ...existingEmailSet])];
      if (allExclude.length > 0) params.set("exclude_emails", allExclude.join(","));
      params.set("limit", "100");

      const resp = await fetch(`/api/sub-pool?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Failed to fetch network subs");
      const { subs: pool } = await resp.json();
      // Client-side dedup safety net
      const excludeSet = new Set(allExclude);
      const deduped = (pool || []).filter(s => !excludeSet.has((s.email || "").toLowerCase()));
      setNetworkSubs(deduped);
      setNetworkFetched(true);
    } catch (err) {
      console.error("[NOVA Network] Fetch error:", err);
      setNetworkError(err.message);
    } finally {
      setNetworkLoading(false);
    }
  };

  const toggleSub = subId => {
    setSelectedSubs(prev => (prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]));
  };

  const toggleNetworkSub = email => {
    setSelectedNetworkSubs(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email],
    );
  };

  const addNetworkSubToContacts = sub => {
    addMasterItem("subcontractors", {
      company: sub.company || "",
      contact: sub.contact || "",
      email: sub.email || "",
      phone: sub.phone || "",
      trades: sub.trade ? [sub.trade] : [],
      notes: "Added from NOVA Network",
      rating: "",
      markets: [sub.market || ""],
      insuranceExpiry: "",
      bondingCapacity: "",
      emr: "",
      certifications: [],
      yearsInBusiness: "",
      licenseNo: "",
      website: "",
      address: "",
    });
    showToast(`${sub.company || sub.email} added to contacts`);
  };

  const handleSend = async () => {
    if (selectedSubs.length === 0 && selectedNetworkSubs.length === 0) {
      showToast("Please select at least one subcontractor", "error");
      return;
    }

    setSending(true);
    try {
      const localSubsToInvite = subs
        .filter(s => selectedSubs.includes(s.id))
        .map(s => ({
          company: s.company,
          contact: s.contact,
          email: s.email,
          phone: s.phone,
          trade: (s.trades || []).map(tk => TRADE_MAP[tk]?.label || tk).join(", "),
        }));
      const networkSubsToInvite = networkSubs
        .filter(s => selectedNetworkSubs.includes(s.email))
        .map(s => ({
          company: s.company || "",
          contact: s.contact || "",
          email: s.email,
          phone: s.phone || "",
          trade: s.trade || "",
        }));
      const subsToInvite = [...localSubsToInvite, ...networkSubsToInvite];

      // 1. Create invitations via API
      const token = useAuthStore.getState().session?.access_token;
      const resp = await fetch("/api/bid-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageId, subs: subsToInvite }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create invitations");
      }

      const { invitations: serverInvites } = await resp.json();

      // 2. Send emails
      await Promise.allSettled(
        serverInvites.map(inv =>
          fetch("/api/send-bid-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ invitationId: inv.id, packageId }),
          }),
        ),
      );

      // 3. Update local store
      const existingInvites = useBidPackagesStore.getState().invitations[packageId] || [];
      const newLocalInvites = serverInvites.map(inv => ({
        id: inv.id,
        subCompany: inv.sub_company,
        subContact: inv.sub_contact,
        subEmail: inv.sub_email,
        subPhone: inv.sub_phone,
        subTrade: inv.sub_trade,
        status: inv.status,
        sentAt: inv.sent_at,
      }));
      useBidPackagesStore.getState().setPackageInvitations(packageId, [...existingInvites, ...newLocalInvites]);

      showToast(`${subsToInvite.length} invitation${subsToInvite.length !== 1 ? "s" : ""} sent`);
      onClose();
    } catch (err) {
      console.error("Send invitations error:", err);
      showToast(err.message || "Failed to send invitations", "error");
    } finally {
      setSending(false);
    }
  };

  const totalSelected = selectedSubs.length + selectedNetworkSubs.length;

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: T.font.sans,
  };

  const checkboxStyle = checked => ({
    width: 18,
    height: 18,
    borderRadius: 4,
    border: `2px solid ${checked ? C.accent : C.border}`,
    background: checked ? C.accent : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 150ms",
  });

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
        Invite Subcontractors
      </h3>
      <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 16px" }}>
        Add subs to <strong style={{ color: C.text }}>{packageName}</strong>. They'll receive an email
        with a link to view details and submit a proposal.
      </p>

      {/* Tab Bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        {[
          { key: "contacts", label: `Your Subs (${availableSubs.length})` },
          { key: "network", label: "NOVA Network" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setSubTab(tab.key);
              if (tab.key === "network" && !networkFetched) fetchNetworkSubs();
            }}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              borderBottom: `2px solid ${subTab === tab.key ? C.accent : "transparent"}`,
              background: "none",
              color: subTab === tab.key ? C.accent : C.textMuted,
              transition: "all 150ms",
              fontFamily: T.font.sans,
            }}
          >
            {tab.label}
            {tab.key === "network" && selectedNetworkSubs.length > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  background: C.accent,
                  color: "#fff",
                  borderRadius: 8,
                  padding: "1px 6px",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {selectedNetworkSubs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ minHeight: 280, maxHeight: 380, overflowY: "auto" }}>
        {/* Your Subs Tab */}
        {subTab === "contacts" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                placeholder="Search subs..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  const allIds = filteredSubs.map(s => s.id);
                  const allSelected = allIds.every(id => selectedSubs.includes(id));
                  if (allSelected) {
                    setSelectedSubs(prev => prev.filter(id => !allIds.includes(id)));
                  } else {
                    setSelectedSubs(prev => [...new Set([...prev, ...allIds])]);
                  }
                }}
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  color: C.accent,
                  borderRadius: 8,
                  padding: "0 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {filteredSubs.every(s => selectedSubs.includes(s.id)) ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Inline Add Sub */}
            <div style={{ marginBottom: 12 }}>
              {!showAddSub ? (
                <button
                  onClick={() => setShowAddSub(true)}
                  style={{
                    background: "none",
                    border: `1px dashed ${C.border}`,
                    color: C.accent,
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    width: "100%",
                    fontFamily: T.font.sans,
                  }}
                >
                  + Add New Sub
                </button>
              ) : (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.accent}30`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                    New Subcontractor
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      placeholder="Company *"
                      value={newSub.company}
                      onChange={e => setNewSub(p => ({ ...p, company: e.target.value }))}
                      autoFocus
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <TradeMultiSelect
                        value={newSub.trades || []}
                        onChange={trades => setNewSub(p => ({ ...p, trades }))}
                        compact
                        placeholder="Add trade..."
                      />
                    </div>
                    <input
                      placeholder="Contact Name"
                      value={newSub.contact}
                      onChange={e => setNewSub(p => ({ ...p, contact: e.target.value }))}
                      style={inputStyle}
                    />
                    <input
                      placeholder="Email"
                      value={newSub.email}
                      onChange={e => setNewSub(p => ({ ...p, email: e.target.value }))}
                      style={inputStyle}
                    />
                    <input
                      placeholder="Phone"
                      value={newSub.phone}
                      onChange={e => setNewSub(p => ({ ...p, phone: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => {
                        setShowAddSub(false);
                        setNewSub({ company: "", trades: [], contact: "", email: "", phone: "" });
                      }}
                      style={{
                        background: "none",
                        border: `1px solid ${C.border}`,
                        color: C.textMuted,
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: T.font.sans,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!newSub.company.trim()) {
                          showToast("Company name is required", "error");
                          return;
                        }
                        addMasterItem("subcontractors", {
                          ...newSub,
                          notes: "",
                          rating: "",
                          markets: [],
                          insuranceExpiry: "",
                          bondingCapacity: "",
                          emr: "",
                          certifications: [],
                          yearsInBusiness: "",
                          licenseNo: "",
                          website: "",
                          address: "",
                        });
                        const updatedSubs = useMasterDataStore.getState().masterData.subcontractors;
                        const created = updatedSubs[updatedSubs.length - 1];
                        if (created) setSelectedSubs(prev => [...prev, created.id]);
                        showToast(`${newSub.company} added and selected`);
                        setNewSub({ company: "", trades: [], contact: "", email: "", phone: "" });
                        setShowAddSub(false);
                      }}
                      disabled={!newSub.company.trim()}
                      style={{
                        background: newSub.company.trim() ? C.accent : C.bg2,
                        color: newSub.company.trim() ? "#fff" : C.textDim,
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: newSub.company.trim() ? "pointer" : "not-allowed",
                        fontFamily: T.font.sans,
                      }}
                    >
                      Add & Select
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Auto-select matching subs hint */}
            {matchedSubIds.size > 0 && selectedSubs.length === 0 && (
              <button
                onClick={() => setSelectedSubs(prev => [...new Set([...prev, ...matchedSubIds])])}
                style={{
                  background: `${C.accent}10`,
                  border: `1px solid ${C.accent}30`,
                  color: C.accent,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  marginBottom: 12,
                  fontFamily: T.font.sans,
                }}
              >
                Auto-select {matchedSubIds.size} matching sub{matchedSubIds.size !== 1 ? "s" : ""} for
                selected scope
              </button>
            )}

            {filteredSubs.length === 0 ? (
              <p style={{ color: C.textDim, fontSize: 13, textAlign: "center", padding: 40 }}>
                {availableSubs.length === 0
                  ? "No subcontractors available. Try the NOVA Network tab to discover subs."
                  : "No matches found."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {/* Preferred subs section header */}
                {filteredSubs.some(s => s.preferred) && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FF9F0A",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      padding: "6px 0 2px",
                    }}
                  >
                    Your Preferred
                  </div>
                )}
                {[...filteredSubs]
                  .sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0))
                  .map((sub, idx, arr) => {
                    const sel = selectedSubs.includes(sub.id);
                    const isMatch = matchedSubIds.has(sub.id);
                    const showDivider = idx > 0 && arr[idx - 1]?.preferred && !sub.preferred;
                    return (
                      <div key={sub.id}>
                        {showDivider && (
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: C.textMuted,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                              padding: "8px 0 2px",
                              borderTop: `1px solid ${C.border}`,
                              marginTop: 4,
                            }}
                          >
                            All Subs
                          </div>
                        )}
                        <div
                          onClick={() => toggleSub(sub.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 8,
                            cursor: "pointer",
                            background: sel ? `${C.accent}10` : "rgba(255,255,255,0.03)",
                            border: `1px solid ${sel ? C.accent + "40" : isMatch ? C.green + "30" : "transparent"}`,
                            transition: "all 150ms",
                          }}
                        >
                          <div style={checkboxStyle(sel)}>
                            {sel && <Ic d={I.check} size={10} color="#fff" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>
                                {sub.company || "Unknown Company"}
                              </span>
                              {sub.preferred && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    fontWeight: 700,
                                    color: "#FF9F0A",
                                    background: "rgba(255,159,10,0.12)",
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                  }}
                                >
                                  PREFERRED
                                </span>
                              )}
                              {isMatch && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    fontWeight: 700,
                                    color: C.green,
                                    background: `${C.green}15`,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                  }}
                                >
                                  MATCH
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                marginTop: 2,
                                flexWrap: "wrap",
                              }}
                            >
                              {(sub.trades || []).slice(0, 3).map(tk => (
                                <TradeBadge key={tk} tradeKey={tk} size="xs" />
                              ))}
                              {(sub.trades || []).length > 3 && (
                                <span style={{ fontSize: 9, color: C.textDim }}>
                                  +{(sub.trades || []).length - 3}
                                </span>
                              )}
                              {sub.contact && (
                                <span style={{ color: C.textDim, fontSize: 10 }}> · {sub.contact}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              toggleSubPreferred(sub.id);
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 4,
                              fontSize: 16,
                              color: sub.preferred ? "#FF9F0A" : C.textDim,
                              transition: "color 150ms",
                            }}
                            title={sub.preferred ? "Remove from preferred" : "Mark as preferred"}
                          >
                            {sub.preferred ? "\u2605" : "\u2606"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* NOVA Network Tab */}
        {subTab === "network" && (
          <>
            {networkLoading && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 13, color: C.accent, fontWeight: 500 }}>
                  Searching NOVA Network...
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                  Finding subs that match your scope
                </div>
              </div>
            )}

            {networkError && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 13, color: "#FF453A", fontWeight: 500 }}>{networkError}</div>
                <button
                  onClick={() => {
                    setNetworkFetched(false);
                    fetchNetworkSubs();
                  }}
                  style={{
                    marginTop: 8,
                    background: "none",
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: T.font.sans,
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {!networkLoading && !networkError && networkSubs.length === 0 && networkFetched && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 13, color: C.textDim }}>
                  No network subs found for your selected trades.
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                  As subs submit proposals across NOVATerra, they'll appear here ranked by reputation.
                </div>
              </div>
            )}

            {!networkLoading && !networkError && networkSubs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    padding: "2px 0 6px",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{networkSubs.length} subs found — sorted by reputation</span>
                  {selectedNetworkSubs.length > 0 && (
                    <span style={{ color: C.accent }}>{selectedNetworkSubs.length} selected</span>
                  )}
                </div>
                {networkSubs.map(ns => {
                  const sel = selectedNetworkSubs.includes(ns.email);
                  const proposals = ns.proposal_count || 0;
                  const winRate = ns._winRate;
                  const coverage = ns.avg_coverage_score;
                  const responseHrs = ns.avg_response_hours;
                  return (
                    <div
                      key={ns.email}
                      onClick={() => toggleNetworkSub(ns.email)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: sel ? `${C.accent}10` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${sel ? C.accent + "40" : "transparent"}`,
                        transition: "all 150ms",
                      }}
                    >
                      <div style={checkboxStyle(sel)}>
                        {sel && <Ic d={I.check} size={10} color="#fff" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>
                            {ns.company || ns.email}
                          </span>
                          {ns.trade && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 600,
                                color: C.textDim,
                                background: "rgba(255,255,255,0.06)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {ns.trade}
                            </span>
                          )}
                        </div>
                        {/* Reputation badges */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          {proposals > 0 && (
                            <span
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <span style={{ color: C.accent, fontWeight: 700 }}>{proposals}</span>{" "}
                              proposal{proposals !== 1 ? "s" : ""}
                            </span>
                          )}
                          {winRate != null && (
                            <span
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    winRate >= 50 ? "#30D158" : winRate >= 25 ? "#FF9F0A" : C.textDim,
                                  fontWeight: 700,
                                }}
                              >
                                {winRate}%
                              </span>{" "}
                              win rate
                            </span>
                          )}
                          {coverage != null && coverage > 0 && (
                            <span
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    coverage >= 80
                                      ? "#30D158"
                                      : coverage >= 50
                                        ? "#FF9F0A"
                                        : C.textDim,
                                  fontWeight: 700,
                                }}
                              >
                                {Math.round(coverage)}%
                              </span>{" "}
                              coverage
                            </span>
                          )}
                          {responseHrs != null && responseHrs < 48 && (
                            <span
                              style={{
                                fontSize: 9,
                                color: C.textDim,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <span
                                style={{
                                  color: responseHrs <= 24 ? "#30D158" : "#FF9F0A",
                                  fontWeight: 700,
                                }}
                              >
                                {responseHrs < 1
                                  ? "<1h"
                                  : responseHrs < 24
                                    ? `${Math.round(responseHrs)}h`
                                    : `${Math.round(responseHrs / 24)}d`}
                              </span>{" "}
                              avg response
                            </span>
                          )}
                          {ns.contact && (
                            <span style={{ color: C.textDim, fontSize: 9 }}> · {ns.contact}</span>
                          )}
                        </div>
                      </div>
                      {/* Add to contacts button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          addNetworkSubToContacts(ns);
                        }}
                        style={{
                          background: "none",
                          border: `1px solid ${C.border}`,
                          color: C.textDim,
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          fontFamily: T.font.sans,
                          transition: "all 150ms",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = C.accent;
                          e.currentTarget.style.color = C.accent;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = C.border;
                          e.currentTarget.style.color = C.textDim;
                        }}
                        title="Add to your contacts"
                      >
                        + Contacts
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cover message */}
      <div style={{ marginTop: 16 }}>
        <label
          style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}
        >
          Cover Message (optional)
        </label>
        <textarea
          value={coverMessage}
          onChange={e => setCoverMessage(e.target.value)}
          placeholder="Add any special instructions or notes for the subs..."
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${C.border}`,
        }}
      >
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
          Back
        </button>

        <button
          onClick={handleSend}
          disabled={totalSelected === 0 || sending}
          style={{
            background:
              totalSelected > 0
                ? `linear-gradient(135deg, ${C.accent}, #BF5AF2)`
                : C.border,
            color: totalSelected > 0 ? "#fff" : C.textDim,
            border: "none",
            borderRadius: 8,
            padding: "8px 24px",
            fontSize: 13,
            fontWeight: 600,
            cursor: totalSelected > 0 ? "pointer" : "not-allowed",
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending
            ? "Sending..."
            : totalSelected > 0
              ? `Send ${totalSelected} Invitation${totalSelected !== 1 ? "s" : ""}`
              : "Send Invitations"}
        </button>
      </div>
    </Modal>
  );
}
