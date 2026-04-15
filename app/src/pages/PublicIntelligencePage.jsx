// ============================================================
// NOVA Core — Public Intelligence Page
// /intelligence — Public, no auth required
//
// Light theme, self-contained. Benchmark search + stats + CTA.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

const FONT = "'Switzer', -apple-system, BlinkMacSystemFont, sans-serif";

const L = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  border: "#E5E7EB",
  accent: "#2563EB",
  accentHover: "#1D4ED8",
  green: "#16A34A",
  amber: "#D97706",
  gray: "#9CA3AF",
  inputBg: "#FFFFFF",
  inputBorder: "#D1D5DB",
  inputFocus: "#2563EB",
  darkBand: "#0F172A",
  darkBandText: "#F8FAFC",
  darkBandMuted: "#94A3B8",
};

const FLAG_COLORS = {
  market: { bg: "#DCFCE7", text: "#166534" },
  indicative: { bg: "#FEF3C7", text: "#92400E" },
  insufficient_data: { bg: "#F3F4F6", text: "#6B7280" },
};

// Example placeholder cards shown before search
const EXAMPLES = [
  { csi_code: "03.300", csi_title: "Cast-in-Place Concrete", unit: "CY", p10: 285.00, p50: 380.00, p90: 513.00, display_flag: "indicative", spec_section: "03 30 00", spec_title: "Cast-in-Place Concrete" },
  { csi_code: "09.210", csi_title: "Gypsum Board", unit: "SF", p10: 2.25, p50: 3.00, p90: 4.05, display_flag: "indicative", spec_section: "09 21 16", spec_title: "Gypsum Board Assemblies" },
  { csi_code: "07.500", csi_title: "Membrane Roofing", unit: "SQ", p10: 412.50, p50: 550.00, p90: 742.50, display_flag: "indicative", spec_section: "07 50 00", spec_title: "Membrane Roofing" },
];

function fmt(n) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PublicIntelligencePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState(null);
  const debounceRef = useRef(null);

  // Fetch stats on mount
  useEffect(() => {
    fetch("/api/nova-core/public-stats")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  // Debounced search
  const handleInput = useCallback((val) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setResults(null);
      setTotalCount(0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/nova-core/public-benchmark?q=${encodeURIComponent(val.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setTotalCount(data.total || data.results?.length || 0);
          setResults(data.results || data);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const displayResults = results === null ? EXAMPLES : results;
  const isPlaceholder = results === null;

  return (
    <div style={{ minHeight: "100vh", background: L.bg, fontFamily: FONT }}>
      {/* ── NAV BAR ── */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 32px", maxWidth: 1100, margin: "0 auto",
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: L.text }}>
          NOVA
        </span>
        <a
          href="/signup"
          style={{
            fontSize: 13, fontWeight: 600, color: "#FFFFFF", background: L.accent,
            padding: "8px 20px", borderRadius: 8, textDecoration: "none",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { e.target.style.background = L.accentHover; }}
          onMouseLeave={e => { e.target.style.background = L.accent; }}
        >
          Sign up free
        </a>
      </nav>

      {/* ── SECTION 1: Hero + Search ── */}
      <section style={{ maxWidth: 800, margin: "0 auto", padding: "60px 32px 48px" }}>
        <h1 style={{ fontSize: 40, fontWeight: 700, color: L.text, margin: 0, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
          Construction cost intelligence. Free.
        </h1>
        <p style={{ fontSize: 17, color: L.textMuted, margin: "16px 0 36px", lineHeight: 1.6 }}>
          Search 950+ scope items. National benchmarks. No account required.
        </p>

        {/* Search input */}
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder='Search by CSI code or scope item — e.g. "03.300" or "concrete slab"'
            style={{
              width: "100%", padding: "16px 20px", fontSize: 16, fontFamily: FONT,
              borderRadius: 12, border: `1px solid ${L.inputBorder}`, background: L.inputBg,
              color: L.text, outline: "none", boxSizing: "border-box",
              transition: "border-color 0.15s, box-shadow 0.15s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
            onFocus={e => { e.target.style.borderColor = L.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = L.inputBorder; e.target.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; }}
          />
          {loading && (
            <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={L.accent} strokeWidth={2.5} style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {isPlaceholder && (
            <div style={{ fontSize: 12, color: L.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Example results
            </div>
          )}
          {displayResults.length === 0 && !loading && results !== null && (
            <div style={{ padding: "32px 0", textAlign: "center", color: L.textMuted, fontSize: 14 }}>
              No results found for "{query}". Try a different search term.
            </div>
          )}
          {(isPlaceholder ? displayResults : displayResults.slice(0, 5)).map((item, i) => (
            <ResultCard key={i} item={item} isPlaceholder={isPlaceholder} />
          ))}
          {!isPlaceholder && totalCount > 5 && (
            <a href="/signup" style={{
              display: "block", textAlign: "center", padding: "14px 0",
              fontSize: 14, fontWeight: 600, color: L.accent, textDecoration: "none",
            }}>
              See all {totalCount} results → Sign up free
            </a>
          )}
        </div>
      </section>

      {/* ── SECTION 2: Stats Band ── */}
      <section style={{
        background: L.darkBand, padding: "40px 32px", marginTop: 32,
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto", display: "flex",
          justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24,
        }}>
          <StatItem value={stats?.scope_items || "950"} label="scope items tracked" />
          <StatDivider />
          <StatItem value={stats?.divisions || "13"} label="CSI divisions" />
          <StatDivider />
          <StatItem value={stats?.spec_refs || "777"} label="spec references" />
          <StatDivider />
          <StatItem value="Updated" label="daily" />
        </div>
      </section>

      {/* ── SECTION 3: Trial CTA ── */}
      <section style={{ padding: "80px 32px", background: L.bg }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: L.text, margin: "0 0 12px", letterSpacing: "-0.015em" }}>
            Start your 21-day free trial
          </h2>
          <p style={{ fontSize: 16, color: L.textMuted, margin: "0 0 36px", lineHeight: 1.6 }}>
            No credit card required. Full access from day one.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left", maxWidth: 380, margin: "0 auto 36px" }}>
            {[
              "Metro-level P10/P50/P90 benchmarks",
              "API access — integrate NOVA Core into your workflow",
              "Sub portal — receive proposals directly",
              "Carbon intelligence — track embodied carbon per scope item",
            ].map((feat, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={L.green} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: 14, color: L.text, lineHeight: 1.5 }}>{feat}</span>
              </div>
            ))}
          </div>

          <a
            href="/signup"
            style={{
              display: "inline-block", padding: "14px 36px", fontSize: 15, fontWeight: 600,
              color: "#FFFFFF", background: L.accent, borderRadius: 10, textDecoration: "none",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.target.style.background = L.accentHover; }}
            onMouseLeave={e => { e.target.style.background = L.accent; }}
          >
            Start free trial →
          </a>

          <p style={{ fontSize: 13, color: L.textDim, marginTop: 16 }}>
            After 21 days: $299/user/month. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px 0 40px", fontSize: 12, color: L.textDim }}>
        Powered by NOVATerra
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ResultCard({ item, isPlaceholder }) {
  const flagStyle = FLAG_COLORS[item.display_flag] || FLAG_COLORS.insufficient_data;

  return (
    <div style={{
      background: "#FFFFFF", border: `1px solid ${L.border}`, borderRadius: 10,
      padding: "20px 24px", opacity: isPlaceholder ? 0.7 : 1,
      transition: "box-shadow 0.15s",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      {/* Top row: CSI code · title · unit */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: L.accent }}>
          {item.csi_code}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: L.text }}>{item.csi_title}</span>
        <span style={{ fontSize: 12, color: L.textDim, marginLeft: "auto" }}>/{item.unit}</span>
      </div>

      {/* P10 / P50 / P90 columns */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        <PriceCol label="P10" value={item.p10} color={L.green} />
        <PriceCol label="P50" value={item.p50} color={L.text} bold />
        <PriceCol label="P90" value={item.p90} color="#DC2626" />
      </div>

      {/* Flag badge + spec */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
          background: flagStyle.bg, color: flagStyle.text, textTransform: "capitalize",
        }}>
          {(item.display_flag || "").replace(/_/g, " ")}
        </span>
        {item.spec_section && (
          <span style={{ fontSize: 12, color: L.textDim }}>
            {item.spec_section}{item.spec_title ? ` — ${item.spec_title}` : ""}
          </span>
        )}
      </div>

      {/* Metro data upsell */}
      {!isPlaceholder && (
        <a href="/signup" style={{
          display: "block", marginTop: 12, fontSize: 13, color: L.accent,
          textDecoration: "none", fontWeight: 500,
        }}>
          Get metro-level data for this item →
        </a>
      )}
    </div>
  );
}

function PriceCol({ label, value, color, bold }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 11, color: L.textDim, marginBottom: 2, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 700 : 500, color, fontFamily: FONT }}>
        {fmt(value)}
      </div>
    </div>
  );
}

function StatItem({ value, label }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: L.darkBandText }}>{value}</div>
      <div style={{ fontSize: 13, color: L.darkBandMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function StatDivider() {
  return <div style={{ width: 1, height: 40, background: "rgba(148,163,184,0.25)" }} />;
}
