import { useState, useEffect, useRef, useCallback, Component } from "react";
import { buildProposalStyles, loadProposalFont } from "@/constants/proposalStyles";
import ProposalSection from "@/components/proposal/ProposalSection";
import CostTreemap from "@/components/proposal/CostTreemap";

// Simple error boundary for individual sections — prevents one bad section from crashing entire viewer
class SectionErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? null : this.props.children; }
}

// Generate a session ID for analytics
const SESSION_ID = crypto.randomUUID();

function trackEvent(proposalId, eventType, extra = {}) {
  if (!proposalId) return;
  fetch("/api/track-proposal-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposalId, sessionId: SESSION_ID, eventType, ...extra }),
  }).catch(() => {}); // Never block on analytics
}

export default function ProposalViewerPage() {
  const [token, setToken] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [acceptForm, setAcceptForm] = useState({ name: "", title: "" });
  const [accepted, setAccepted] = useState(false);
  const containerRef = useRef(null);

  // Override body overflow:hidden from App.css so this page scrolls
  useEffect(() => {
    document.body.style.overflow = "auto";
    document.body.style.background = "#f5f5f7";
    document.documentElement.style.overflow = "auto";
    return () => { document.body.style.overflow = ""; document.body.style.background = ""; document.documentElement.style.overflow = ""; };
  }, []);

  // Extract token from URL
  useEffect(() => {
    const match = window.location.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
    if (match) setToken(match[1]);
    else setError("Invalid proposal link");
  }, []);

  // Fetch proposal data
  const fetchProposal = useCallback(async (pwd) => {
    if (!token) return;
    setLoading(true);
    try {
      const url = pwd
        ? `/api/living-proposal?token=${token}&pwd=${encodeURIComponent(pwd)}`
        : `/api/living-proposal?token=${token}`;
      const res = await fetch(url);
      const json = await res.json();
      if (res.status === 403 && json.passwordRequired) {
        setPasswordRequired(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      setPasswordRequired(false);
      if (json.accepted_at) setAccepted(true);
      // Track open event
      trackEvent(json.id, "open", { metadata: { userAgent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}` } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchProposal(); }, [fetchProposal]);

  // Load font
  useEffect(() => {
    if (data?.design_config?.fontId) loadProposalFont(data.design_config.fontId);
  }, [data?.design_config?.fontId]);

  // Scroll tracking
  useEffect(() => {
    if (!data || !containerRef.current) return;
    let maxScroll = 0;
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const depth = el.scrollTop / (el.scrollHeight - el.clientHeight);
      if (depth > maxScroll + 0.1) {
        maxScroll = depth;
        trackEvent(data.id, "scroll", { scrollDepth: Math.round(depth * 100) / 100 });
      }
    };
    const el = containerRef.current;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [data]);

  // Accept handler
  const handleAccept = async () => {
    if (!acceptForm.name.trim()) return;
    try {
      const res = await fetch("/api/accept-living-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, acceptedName: acceptForm.name, acceptedTitle: acceptForm.title }),
      });
      if (res.ok) {
        setAccepted(true);
        trackEvent(data.id, "accept", { metadata: { name: acceptForm.name } });
      }
    } catch { /* no-op */ }
  };

  // Build styles
  const PS = data ? buildProposalStyles(data.design_config || {}) : buildProposalStyles({});
  const accent = PS.color.accent;
  const font = PS.font.body;

  // Password gate
  if (passwordRequired) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: font }}>
        <div style={{ background: "#fff", padding: 40, borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: accent, marginBottom: 8 }}>Protected Proposal</div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>Enter the password to view this proposal.</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={e => e.key === "Enter" && fetchProposal(password)}
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, border: "1px solid #ddd", borderRadius: 8, marginBottom: 16, outline: "none", boxSizing: "border-box" }}
          />
          <button
            onClick={() => fetchProposal(password)}
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 700, background: accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            View Proposal
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: font }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #eee", borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "#999" }}>Loading proposal...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: font }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>404</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 8 }}>{error}</div>
          <div style={{ fontSize: 13, color: "#999" }}>This proposal may have been removed or expired.</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build proposal data for section components
  const pd = data.proposal_data || {};
  const ci = data.company_info || {};
  const pi = data.project_info || {};
  const sections = pd.visibleSections || [];
  const proposalData = {
    project: pi,
    masterData: { companyInfo: ci, clients: [], companyProfiles: [] },
    companyInfo: ci,
    totals: pd.totals || {},
    usedDivisions: pd.usedDivisions || [],
    divTotals: pd.divTotals || {},
    alternates: pd.alternates || [],
    exclusions: pd.exclusions || [],
    clarifications: pd.clarifications || [],
    allowanceItems: pd.allowanceItems || [],
    allowanceGrandTotal: pd.allowanceGrandTotal || 0,
    generateAllowanceNote: (item) => item.allowanceNote || `${item.description} allowance`,
    activeEstimateId: data.estimate_id,
    items: pd.items || [],
    T: { font: { sans: font, mono: PS.font.mono }, fontSize: {}, fontWeight: {}, radius: { lg: 8, md: 6, sm: 4 }, space: PS.space, shadow: {} },
    C: { accent, text: PS.color.text, textDim: PS.color.textDim, textMuted: PS.color.textMuted, border: PS.color.border, bg2: PS.color.bgSubtle },
  };

  // Section numbering
  const NUMBERED_SECTIONS = new Set(["scope", "baseBid", "sov", "alternates", "exclusions", "allowances", "clarifications", "qualifications", "acceptance"]);
  let counter = 0;

  return (
    <div ref={containerRef} style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: font }}>
      {/* Top accent bar */}
      <div style={{ height: 4, background: accent }} />

      {/* Content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 12px rgba(0,0,0,0.08)", padding: PS.page.padding, fontFamily: font, lineHeight: 1.6 }}>
          {/* Render sections */}
          {sections.map((id) => {
            const isSpecial = id.startsWith("pagebreak_") || id.startsWith("spacer_") || id.startsWith("doc_");
            // Skip uploaded doc sections on public viewer (no store data)
            if (id.startsWith("doc_")) return null;
            if (!isSpecial && NUMBERED_SECTIONS.has(id)) counter++;
            const sn = (!isSpecial && data.design_config?.showSectionNumbers && NUMBERED_SECTIONS.has(id)) ? counter : null;

            return (
              <div
                key={id}
                id={`section-${id}`}
                onMouseEnter={() => {
                  setActiveSection(id);
                  trackEvent(data.id, "section_view", { sectionId: id });
                }}
              >
                <SectionErrorBoundary>
                  <ProposalSection sectionId={id} data={proposalData} proposalStyles={PS} sectionNumber={sn} />
                </SectionErrorBoundary>
              </div>
            );
          })}

          {/* Cost Treemap */}
          {pd.divTotals && Object.keys(pd.divTotals).length > 0 && (
            <div style={{ marginTop: 32, marginBottom: 32 }}>
              <div style={{ ...PS.type.h2, fontFamily: font, color: accent, marginBottom: 16 }}>COST DISTRIBUTION</div>
              <CostTreemap divTotals={pd.divTotals} grand={pd.totals?.grand || 0} accent={accent} font={font} />
            </div>
          )}

          {/* Accept Block */}
          {!accepted ? (
            <div style={{ marginTop: 40, padding: 24, border: `1px solid ${PS.color.border}`, borderTop: `3px solid ${accent}`, borderRadius: 8 }}>
              <div style={{ ...PS.type.h2, fontFamily: font, color: PS.color.text, marginBottom: 12 }}>ACCEPT PROPOSAL</div>
              <div style={{ ...PS.type.body, fontFamily: font, color: PS.color.textDim, marginBottom: 20 }}>
                The above proposal is accepted. You are authorized to proceed as outlined above.
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <input
                  placeholder="Your Name *"
                  value={acceptForm.name}
                  onChange={e => setAcceptForm(f => ({ ...f, name: e.target.value }))}
                  style={{ flex: 1, padding: "10px 14px", fontSize: 14, border: "1px solid #ddd", borderRadius: 6, outline: "none", fontFamily: font }}
                />
                <input
                  placeholder="Title (optional)"
                  value={acceptForm.title}
                  onChange={e => setAcceptForm(f => ({ ...f, title: e.target.value }))}
                  style={{ flex: 1, padding: "10px 14px", fontSize: 14, border: "1px solid #ddd", borderRadius: 6, outline: "none", fontFamily: font }}
                />
              </div>
              <button
                onClick={handleAccept}
                disabled={!acceptForm.name.trim()}
                style={{
                  width: "100%", padding: "14px 20px", fontSize: 15, fontWeight: 700,
                  background: acceptForm.name.trim() ? accent : "#ddd",
                  color: acceptForm.name.trim() ? "#fff" : "#999",
                  border: "none", borderRadius: 8, cursor: acceptForm.name.trim() ? "pointer" : "not-allowed",
                  fontFamily: font,
                }}
              >
                Accept Proposal
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 40, padding: 24, background: `${accent}08`, border: `1px solid ${accent}30`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: accent, marginBottom: 4 }}>Proposal Accepted</div>
              <div style={{ fontSize: 13, color: PS.color.textDim }}>
                {data.accepted_name && `By ${data.accepted_name}`}
                {data.accepted_at && ` on ${new Date(data.accepted_at).toLocaleDateString()}`}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 11, color: "#999" }}>
          Powered by <strong style={{ color: accent }}>NOVATerra</strong>
        </div>
      </div>
    </div>
  );
}
