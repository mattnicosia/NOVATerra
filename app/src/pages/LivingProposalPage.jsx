// ============================================================
// Living Proposal Page — Public, No Auth Required
// /p/:slug — renders a white-labeled proposal with GC branding
//
// Features:
//   - Line items grouped by division
//   - Alternate toggles (running total updates live)
//   - Exclusions + clarifications
//   - Version selector + diff view
//   - Owner comments
//   - Expiration banner
//   - Engagement beacon (sendBeacon on page hide)
//
// Self-contained — no useTheme(), no auth dependencies
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

export default function LivingProposalPage() {
  const slug = window.location.pathname.split("/p/")[1]?.split("/")[0]?.split("?")[0];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [showDiff, setShowDiff] = useState(false);
  const [altSelections, setAltSelections] = useState({});
  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [comments, setComments] = useState([]);
  const [expandedDivisions, setExpandedDivisions] = useState({});
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const startTime = useRef(Date.now());
  const sectionsViewed = useRef(new Set());

  // ── Fetch proposal data ──
  useEffect(() => {
    if (!slug) { setError("Invalid proposal link"); setLoading(false); return; }

    const vParam = selectedVersion ? `&version=${selectedVersion}` : "";
    fetch(`/api/living-proposal?slug=${slug}${vParam}`)
      .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, data: d })))
      .then(({ ok, status, data: d }) => {
        if (status === 410) { setError("revoked"); setData(d); }
        else if (!ok) { setError(d.error || "Failed to load"); }
        else {
          setData(d);
          setComments(d.comments || []);
          // Init alternate selections
          const sels = {};
          (d.alternateSelections || []).forEach(a => { sels[a.alternate_id] = a.selected; });
          setAltSelections(sels);
        }
        setLoading(false);
      })
      .catch(() => { setError("Network error"); setLoading(false); });
  }, [slug, selectedVersion]);

  // ── Engagement beacon on page hide ──
  useEffect(() => {
    const onHide = () => {
      const duration = Math.round((Date.now() - startTime.current) / 1000);
      navigator.sendBeacon?.("/api/living-proposal-beacon", JSON.stringify({
        viewId: data?.version?.id,
        durationSeconds: duration,
        sectionsViewed: [...sectionsViewed.current],
      }));
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
    };
  }, [data]);

  // ── Section observer ──
  const observeSection = useCallback((sectionName) => {
    sectionsViewed.current.add(sectionName);
  }, []);

  // ── Toggle alternate ──
  const toggleAlternate = async (altId, currentSelected) => {
    const newSelected = !currentSelected;
    setAltSelections(prev => ({ ...prev, [altId]: newSelected }));

    fetch("/api/living-proposal-alternate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        livingProposalId: data.proposal.id,
        accessToken: data.proposal.access_token,
        versionId: data.version.id,
        alternateId: altId,
        selected: newSelected,
      }),
    }).catch(() => {});
  };

  // ── Post comment ──
  const postComment = async () => {
    if (!commentName.trim() || !commentText.trim()) return;
    setCommenting(true);
    try {
      const res = await fetch("/api/living-proposal-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          livingProposalId: data.proposal.id,
          accessToken: data.proposal.access_token,
          versionId: data.version.id,
          authorType: "owner",
          authorName: commentName.trim(),
          authorEmail: commentEmail.trim() || null,
          content: commentText.trim(),
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setComments(prev => [...prev, result.comment]);
        setCommentText("");
      }
    } catch (e) { /* silent */ }
    setCommenting(false);
  };

  // ── Derive colors from GC branding ──
  const accent = data?.proposal?.gc_accent_color || "#7C5CFC";
  const C = {
    bg: "#0D0F14", bg1: "#161619", bg2: "#1E1E22", bg3: "#26262B",
    text: "#F5F5F7", textMuted: "#8E8E93", textDim: "#636366",
    border: "#2C2C2E", accent,
    accentSoft: accent + "20", accentMed: accent + "40",
    green: "#30D158", red: "#FF453A", orange: "#FF9F0A",
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ ...S.page, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8E8E93", fontSize: 14 }}>Loading proposal...</div>
      </div>
    );
  }

  // ── Revoked state ──
  if (error === "revoked") {
    return (
      <div style={{ ...S.page, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128683;</div>
          <h2 style={{ color: "#F5F5F7", fontSize: 20, margin: "0 0 8px" }}>Proposal Revoked</h2>
          <p style={{ color: "#8E8E93", fontSize: 14, margin: "0 0 20px" }}>
            This proposal has been revoked by the sender.
          </p>
          {data?.gc_email && (
            <a href={`mailto:${data.gc_email}`} style={{ color: accent, fontSize: 14, textDecoration: "none" }}>
              Contact {data.gc_company_name || "the sender"}
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div style={{ ...S.page, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#FF453A", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  const proposal = data.proposal;
  const version = data.version;
  const snap = version?.snapshot_data;
  const isExpired = proposal.status === "expired";

  if (!version || !snap) {
    return (
      <div style={{ ...S.page, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8E8E93", fontSize: 14 }}>This proposal hasn't been published yet.</div>
      </div>
    );
  }

  // ── Group items by division ──
  const divisions = {};
  (snap.items || []).forEach(item => {
    const div = item.division || "Unassigned";
    if (!divisions[div]) divisions[div] = [];
    divisions[div].push(item);
  });

  // ── Compute total with alternate adjustments ──
  const baseTotal = parseFloat(version.grand_total) || 0;
  let adjustedTotal = baseTotal;
  (snap.alternates || []).forEach(alt => {
    if (altSelections[alt.id]) {
      adjustedTotal += parseFloat(alt.amount) || 0;
    }
  });

  // ── Expiration countdown ──
  let daysRemaining = null;
  if (proposal.valid_until) {
    const diff = new Date(proposal.valid_until) - new Date();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  const diff = version.change_diff;

  return (
    <div style={{ ...S.page, background: C.bg }}>
      <div style={S.container}>

        {/* ── Expiration Banner ── */}
        {isExpired && (
          <div style={{ ...S.banner, background: "#FF453A20", border: "1px solid #FF453A40" }}>
            <span style={{ color: "#FF453A", fontSize: 14, fontWeight: 600 }}>
              This proposal expired on {new Date(proposal.expired_at || proposal.valid_until).toLocaleDateString()}.
            </span>
            {proposal.gc_email && (
              <a href={`mailto:${proposal.gc_email}`} style={{ color: accent, fontSize: 13, marginLeft: 12 }}>
                Contact {proposal.gc_company_name} for an updated quote
              </a>
            )}
          </div>
        )}

        {/* ── Header / GC Branding ── */}
        <header style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            {proposal.gc_logo_url ? (
              <img src={proposal.gc_logo_url} alt="" style={{ height: 48, maxWidth: 200, objectFit: "contain" }} />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 700, color: "#fff",
              }}>
                {(proposal.gc_company_name || "P")[0]}
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                {proposal.gc_company_name}
              </div>
              {(proposal.gc_phone || proposal.gc_email) && (
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
                  {proposal.gc_phone}{proposal.gc_phone && proposal.gc_email ? " · " : ""}{proposal.gc_email}
                </div>
              )}
            </div>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: "0 0 4px", lineHeight: 1.2 }}>
            {proposal.project_name}
          </h1>
          {proposal.project_address && (
            <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 8 }}>{proposal.project_address}</div>
          )}

          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ fontSize: 12, color: C.textDim }}>
              Version {version.version_number} · Published {new Date(version.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            {daysRemaining != null && !isExpired && (
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                background: daysRemaining <= 7 ? "#FF453A20" : C.accentSoft,
                color: daysRemaining <= 7 ? "#FF453A" : accent,
              }}>
                Valid for {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}
              </div>
            )}
            {data.totalVersions > 1 && (
              <button
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                style={{ ...S.linkBtn, color: accent }}
              >
                {showVersionHistory ? "Hide" : "View"} version history ({data.totalVersions})
              </button>
            )}
          </div>

          {/* Version History Dropdown */}
          {showVersionHistory && (
            <div style={{ ...S.versionList, borderColor: C.border }}>
              {(data.allVersions || []).map(v => (
                <button
                  key={v.version_number}
                  onClick={() => { setSelectedVersion(v.version_number); setShowVersionHistory(false); setLoading(true); }}
                  style={{
                    ...S.versionItem,
                    background: v.version_number === version.version_number ? C.accentSoft : "transparent",
                    borderColor: C.border,
                  }}
                >
                  <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>v{v.version_number}</span>
                  <span style={{ color: C.textDim, fontSize: 12 }}>
                    {new Date(v.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span style={{ color: C.textMuted, fontSize: 12, flex: 1 }}>{v.change_summary || ""}</span>
                  <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                    ${Math.round(v.grand_total).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Change Diff Banner ── */}
        {diff && version.version_number > 1 && (
          <div
            style={{ ...S.diffBanner, borderColor: C.border, background: C.bg1 }}
            onMouseEnter={() => observeSection("diff")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                Changes from v{version.version_number - 1}
              </span>
              <button onClick={() => setShowDiff(!showDiff)} style={{ ...S.linkBtn, color: accent, fontSize: 12 }}>
                {showDiff ? "Hide details" : "Show details"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              {version.change_summary || diff.summary}
            </div>
            {showDiff && (
              <div style={{ marginTop: 12 }}>
                {(diff.added || []).map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.green, padding: "2px 0" }}>+ {a.description} ({a.division})</div>
                ))}
                {(diff.removed || []).map((r, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.red, padding: "2px 0" }}>- {r.description} ({r.division})</div>
                ))}
                {(diff.changed || []).map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.orange, padding: "2px 0" }}>
                    ~ {c.description}: {c.changes.map(ch => `${ch.field}: ${ch.from} → ${ch.to}`).join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Grand Total Card ── */}
        <div
          style={{ ...S.totalCard, background: `linear-gradient(135deg, ${accent}15, ${accent}08)`, borderColor: accent + "40" }}
          onMouseEnter={() => observeSection("summary")}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            {(snap.alternates || []).length > 0 ? "Adjusted Total" : "Proposal Total"}
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: C.text, lineHeight: 1 }}>
            ${Math.round(adjustedTotal).toLocaleString()}
          </div>
          {adjustedTotal !== baseTotal && (
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
              Base: ${Math.round(baseTotal).toLocaleString()} · Alternates: {adjustedTotal > baseTotal ? "+" : ""}${Math.round(adjustedTotal - baseTotal).toLocaleString()}
            </div>
          )}
          <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
            <MiniStat label="Direct Cost" value={snap.directCost} C={C} />
            <MiniStat label="Material" value={snap.materialTotal} C={C} />
            <MiniStat label="Labor" value={snap.laborTotal} C={C} />
            <MiniStat label="Equipment" value={snap.equipmentTotal} C={C} />
            <MiniStat label="Subcontractor" value={snap.subTotal} C={C} />
            <MiniStat label="Markup" value={snap.markupTotal} C={C} />
          </div>
        </div>

        {/* ── Line Items by Division ── */}
        <section onMouseEnter={() => observeSection("line-items")}>
          <h2 style={S.sectionTitle}>Line Items</h2>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>{snap.itemCount} items across {Object.keys(divisions).length} divisions</div>

          {Object.entries(divisions).sort(([a], [b]) => a.localeCompare(b)).map(([divName, items]) => {
            const divTotal = items.reduce((s, it) => {
              const q = parseFloat(it.quantity) || 0;
              return s + q * ((parseFloat(it.material) || 0) + (parseFloat(it.labor) || 0) + (parseFloat(it.equipment) || 0) + (parseFloat(it.subcontractor) || 0));
            }, 0);
            const expanded = expandedDivisions[divName] !== false; // default expanded

            return (
              <div key={divName} style={{ marginBottom: 2 }}>
                <button
                  onClick={() => setExpandedDivisions(p => ({ ...p, [divName]: !expanded }))}
                  style={{
                    ...S.divHeader, background: C.bg1, borderColor: C.border,
                    borderBottomLeftRadius: expanded ? 0 : 8,
                    borderBottomRightRadius: expanded ? 0 : 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{divName}</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>{items.length} items</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text, marginLeft: "auto" }}>
                    ${Math.round(divTotal).toLocaleString()}
                  </span>
                  <span style={{ color: C.textDim, fontSize: 10, marginLeft: 8 }}>{expanded ? "▼" : "▶"}</span>
                </button>
                {expanded && (
                  <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={{ display: "flex", padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg1 + "80" }}>
                      <span style={{ ...S.colHeader, flex: "1 1 200px" }}>Description</span>
                      <span style={{ ...S.colHeader, flex: "0 0 60px", textAlign: "right" }}>Qty</span>
                      <span style={{ ...S.colHeader, flex: "0 0 50px", textAlign: "right" }}>Unit</span>
                      <span style={{ ...S.colHeader, flex: "0 0 80px", textAlign: "right" }}>Material</span>
                      <span style={{ ...S.colHeader, flex: "0 0 80px", textAlign: "right" }}>Labor</span>
                      <span style={{ ...S.colHeader, flex: "0 0 80px", textAlign: "right" }}>Total</span>
                    </div>
                    {items.map(item => {
                      const q = parseFloat(item.quantity) || 0;
                      const lineTotal = q * ((parseFloat(item.material) || 0) + (parseFloat(item.labor) || 0) + (parseFloat(item.equipment) || 0) + (parseFloat(item.subcontractor) || 0));
                      return (
                        <div key={item.id} style={{ display: "flex", padding: "8px 16px", borderBottom: `1px solid ${C.border}22`, alignItems: "center" }}>
                          <span style={{ flex: "1 1 200px", fontSize: 13, color: C.text }}>{item.description}</span>
                          <span style={{ flex: "0 0 60px", fontSize: 12, color: C.textMuted, textAlign: "right" }}>{q || "—"}</span>
                          <span style={{ flex: "0 0 50px", fontSize: 12, color: C.textDim, textAlign: "right" }}>{item.unit || ""}</span>
                          <span style={{ flex: "0 0 80px", fontSize: 12, color: C.textMuted, textAlign: "right" }}>{fmtD(parseFloat(item.material))}</span>
                          <span style={{ flex: "0 0 80px", fontSize: 12, color: C.textMuted, textAlign: "right" }}>{fmtD(parseFloat(item.labor))}</span>
                          <span style={{ flex: "0 0 80px", fontSize: 13, color: C.text, fontWeight: 600, textAlign: "right" }}>{fmtD(lineTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ── Alternates ── */}
        {(snap.alternates || []).length > 0 && (
          <section style={{ marginTop: 32 }} onMouseEnter={() => observeSection("alternates")}>
            <h2 style={S.sectionTitle}>Alternates</h2>
            <p style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Toggle alternates to see how they affect the total.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {snap.alternates.map(alt => {
                const selected = altSelections[alt.id] || false;
                return (
                  <button
                    key={alt.id}
                    onClick={() => !isExpired && toggleAlternate(alt.id, selected)}
                    style={{
                      ...S.altCard,
                      background: selected ? C.accentSoft : C.bg1,
                      borderColor: selected ? accent : C.border,
                      opacity: isExpired ? 0.5 : 1,
                      cursor: isExpired ? "default" : "pointer",
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: `2px solid ${selected ? accent : C.textDim}`,
                      background: selected ? accent : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {selected && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{alt.name}</div>
                      {alt.description && <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{alt.description}</div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: parseFloat(alt.amount) > 0 ? C.green : C.red }}>
                      {parseFloat(alt.amount) > 0 ? "+" : ""}{fmtD(parseFloat(alt.amount))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Exclusions ── */}
        {(snap.exclusions || []).length > 0 && (
          <section style={{ marginTop: 32 }} onMouseEnter={() => observeSection("exclusions")}>
            <h2 style={S.sectionTitle}>Exclusions</h2>
            <div style={{ ...S.listCard, borderColor: C.border, background: C.bg1 }}>
              {snap.exclusions.map((ex, i) => (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < snap.exclusions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: C.text }}>{typeof ex === "string" ? ex : ex.text || ex.description || JSON.stringify(ex)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Clarifications ── */}
        {(snap.clarifications || []).length > 0 && (
          <section style={{ marginTop: 32 }} onMouseEnter={() => observeSection("clarifications")}>
            <h2 style={S.sectionTitle}>Clarifications</h2>
            <div style={{ ...S.listCard, borderColor: C.border, background: C.bg1 }}>
              {snap.clarifications.map((cl, i) => (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < snap.clarifications.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <span style={{ fontSize: 13, color: C.text }}>{typeof cl === "string" ? cl : cl.text || cl.description || JSON.stringify(cl)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Comments ── */}
        <section style={{ marginTop: 32 }} onMouseEnter={() => observeSection("comments")}>
          <h2 style={S.sectionTitle}>Comments</h2>

          {comments.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {comments.map(c => (
                <div key={c.id} style={{ ...S.commentBubble, background: c.author_type === "gc" ? C.accentSoft : C.bg1, borderColor: C.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.author_type === "gc" ? accent : C.text }}>{c.author_name}</span>
                    <span style={{ fontSize: 11, color: C.textDim }}>
                      {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{c.content}</div>
                </div>
              ))}
            </div>
          )}

          {!isExpired && (
            <div style={{ ...S.commentForm, borderColor: C.border, background: C.bg1 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  placeholder="Your name"
                  value={commentName}
                  onChange={e => setCommentName(e.target.value)}
                  style={{ ...S.input, flex: 1, borderColor: C.border, background: C.bg2, color: C.text }}
                />
                <input
                  placeholder="Email (optional)"
                  value={commentEmail}
                  onChange={e => setCommentEmail(e.target.value)}
                  style={{ ...S.input, flex: 1, borderColor: C.border, background: C.bg2, color: C.text }}
                />
              </div>
              <textarea
                placeholder="Leave a comment or question..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                rows={3}
                style={{ ...S.input, borderColor: C.border, background: C.bg2, color: C.text, resize: "vertical", width: "100%", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={postComment}
                  disabled={commenting || !commentName.trim() || !commentText.trim()}
                  style={{
                    ...S.submitBtn,
                    background: accent,
                    opacity: commenting || !commentName.trim() || !commentText.trim() ? 0.4 : 1,
                  }}
                >
                  {commenting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Footer ── */}
        <footer style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.textDim + "66", letterSpacing: "0.08em" }}>Powered by NOVA</div>
        </footer>

      </div>
    </div>
  );
}

// ── Sub-components ──

function MiniStat({ label, value, C }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.textMuted }}>{fmtD(value)}</div>
    </div>
  );
}

function fmtD(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}

// ── Styles ──

const S = {
  page: {
    minHeight: "100vh", fontFamily: "'Switzer', system-ui, -apple-system, sans-serif",
    WebkitFontSmoothing: "antialiased",
  },
  container: {
    maxWidth: 900, margin: "0 auto", padding: "40px 24px 80px",
  },
  header: {
    marginBottom: 32,
  },
  banner: {
    padding: "12px 20px", borderRadius: 8, marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase",
    letterSpacing: "0.05em", margin: "0 0 12px",
  },
  totalCard: {
    padding: "28px 32px", borderRadius: 12, border: "1px solid", marginBottom: 32,
  },
  divHeader: {
    width: "100%", display: "flex", alignItems: "center", gap: 12,
    padding: "12px 16px", border: "1px solid", borderRadius: 8,
    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
  },
  colHeader: {
    fontSize: 10, fontWeight: 600, color: "#636366", textTransform: "uppercase", letterSpacing: "0.04em",
  },
  altCard: {
    display: "flex", alignItems: "center", gap: 14,
    padding: "14px 18px", borderRadius: 10, border: "1px solid",
    fontFamily: "inherit", textAlign: "left", transition: "all 0.15s",
  },
  listCard: {
    borderRadius: 8, border: "1px solid", overflow: "hidden",
  },
  commentBubble: {
    padding: "12px 16px", borderRadius: 8, border: "1px solid", marginBottom: 8,
  },
  commentForm: {
    padding: 16, borderRadius: 8, border: "1px solid",
  },
  input: {
    padding: "8px 12px", borderRadius: 6, border: "1px solid", fontSize: 13,
    fontFamily: "inherit", outline: "none",
  },
  submitBtn: {
    padding: "8px 20px", borderRadius: 6, border: "none", color: "#fff",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  linkBtn: {
    background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
    fontSize: 13, fontWeight: 500, padding: 0,
  },
  diffBanner: {
    padding: "16px 20px", borderRadius: 8, border: "1px solid", marginBottom: 24,
  },
  versionList: {
    marginTop: 12, borderRadius: 8, border: "1px solid", overflow: "hidden",
  },
  versionItem: {
    width: "100%", display: "flex", alignItems: "center", gap: 12,
    padding: "10px 16px", borderBottom: "1px solid", cursor: "pointer",
    fontFamily: "inherit", textAlign: "left", border: "none",
    borderBottomWidth: 1, borderBottomStyle: "solid",
  },
};
