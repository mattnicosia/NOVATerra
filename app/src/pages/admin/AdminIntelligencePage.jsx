// ============================================================
// NOVA Core — Admin Intelligence Dashboard
// /admin/intelligence
//
// Six sections:
//   1. Market Overview (4 stat cards)
//   2. Benchmark Explorer (search + detail)
//   3. Data Velocity (flywheel chart)
//   4. Coverage by Division (table)
//   5. Carbon Summary (3 stat cards)
//   6. Top API Queries
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Label,
} from "recharts";

// ── Helpers ──

const FLAG_COLORS = {
  market: "#34D399",
  indicative: "#F59E0B",
  insufficient_data: "#EF4444",
  national_fallback: "#6B7280",
};

const FLAG_LABELS = {
  market: "Market",
  indicative: "Indicative",
  insufficient_data: "Insufficient",
  national_fallback: "National Fallback",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDollars(n) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Skeleton Loader ──

function Skeleton({ width, height = 20, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function SkeletonCard() {
  return (
    <div style={{ ...S.statCard, minHeight: 90 }}>
      <Skeleton width={100} height={12} />
      <Skeleton width={60} height={32} style={{ marginTop: 12 }} />
    </div>
  );
}

// ── Section 1: Market Overview ──

function MarketOverview({ data, loading }) {
  const cards = [
    { label: "Total Scope Items", value: data?.total_scope_items, color: "#8B5CF6" },
    { label: "Items with Data", value: data?.items_with_data, color: "#3B82F6" },
    { label: "Divisions Covered", value: data?.divisions_covered, color: "#10B981" },
    { label: "Spec References", value: data?.spec_references, color: "#F59E0B" },
  ];

  return (
    <div>
      <h3 style={S.sectionTitle}>Market Overview</h3>
      <div style={S.cardRow}>
        {loading
          ? [0, 1, 2, 3].map(i => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <div key={i} style={S.statCard}>
                <div style={S.statLabel}>{c.label}</div>
                <div style={{ ...S.statValue, color: c.color }}>
                  {(c.value ?? 0).toLocaleString()}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

// ── Section 2: Benchmark Explorer ──

function BenchmarkExplorer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setResults(null);
      setSelected(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/nova-core/intelligence-search?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setSelected(null);
      }
    } catch (err) {
      console.error("[benchmark-search]", err);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 400);
  };

  const flagBadge = (flag) => {
    const color = FLAG_COLORS[flag] || "#6B7280";
    const label = FLAG_LABELS[flag] || flag || "—";
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: "#fff",
        background: color,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    );
  };

  return (
    <div>
      <h3 style={S.sectionTitle}>Benchmark Explorer</h3>
      <div style={S.panel}>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search by CSI code or scope item name..."
          style={S.searchInput}
        />

        {searching && (
          <div style={{ padding: "16px 0", color: "#888780", fontSize: 13 }}>Searching...</div>
        )}

        {!searching && results === null && (
          <div style={S.empty}>Search for a scope item above</div>
        )}

        {!searching && results && results.length === 0 && (
          <div style={S.empty}>No results found</div>
        )}

        {!searching && results && results.length > 0 && (
          <>
            {/* Results table */}
            <div style={{ overflowX: "auto" }}>
              <div style={S.tableHeader}>
                <span style={{ ...S.th, flex: "0 0 90px" }}>CSI Code</span>
                <span style={{ ...S.th, flex: "1 1 200px" }}>Scope Item</span>
                <span style={{ ...S.th, flex: "0 0 60px" }}>Unit</span>
                <span style={{ ...S.th, flex: "0 0 80px", textAlign: "right" }}>P50</span>
                <span style={{ ...S.th, flex: "0 0 110px", textAlign: "center" }}>Display Flag</span>
                <span style={{ ...S.th, flex: "0 0 120px" }}>Spec Section</span>
              </div>
              {results.map((r, i) => (
                <div
                  key={i}
                  onClick={() => setSelected(selected === i ? null : i)}
                  style={{
                    ...S.row,
                    cursor: "pointer",
                    background: selected === i ? "rgba(139,92,246,0.08)" : i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
                  <span style={{ ...S.td, flex: "0 0 90px", fontFamily: "monospace", fontWeight: 600 }}>
                    {r.csi_code}
                  </span>
                  <span style={{ ...S.td, flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </span>
                  <span style={{ ...S.td, flex: "0 0 60px", color: "#888780" }}>{r.unit}</span>
                  <span style={{ ...S.td, flex: "0 0 80px", textAlign: "right", fontWeight: 600 }}>
                    {formatDollars(r.p50)}
                  </span>
                  <span style={{ ...S.td, flex: "0 0 110px", textAlign: "center" }}>
                    {flagBadge(r.display_flag)}
                  </span>
                  <span style={{ ...S.td, flex: "0 0 120px", color: "#888780", fontSize: 11 }}>
                    {r.spec_section || "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Detail card */}
            {selected !== null && results[selected] && (
              <DetailCard item={results[selected]} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailCard({ item }) {
  const p10 = item.p10 ?? 0;
  const p50 = item.p50 ?? 0;
  const p90 = item.p90 ?? 0;
  const range = p90 - p10 || 1;
  const p50Pct = range > 0 ? ((p50 - p10) / range) * 100 : 50;

  return (
    <div style={{ ...S.detailCard, marginTop: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
        {item.csi_code} — {item.title}
      </div>

      {/* P10 / P50 / P90 bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888780", marginBottom: 6 }}>
          <span>P10: {formatDollars(p10)}</span>
          <span>P50: {formatDollars(p50)}</span>
          <span>P90: {formatDollars(p90)}</span>
        </div>
        <div style={{ position: "relative", height: 12, borderRadius: 6, background: "#161614", overflow: "hidden" }}>
          <div style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg, #3B82F6, #8B5CF6, #EC4899)",
            opacity: 0.3,
            borderRadius: 6,
          }} />
          <div style={{
            position: "absolute",
            left: `${Math.min(Math.max(p50Pct, 2), 98)}%`,
            top: -2,
            width: 3,
            height: 16,
            borderRadius: 2,
            background: "#fff",
            transform: "translateX(-50%)",
          }} />
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <MetaItem label="Sample Count" value={item.sample_count ?? "—"} />
        <MetaItem label="State" value={item.state || "National"} />
        <MetaItem label="Last Updated" value={formatDate(item.updated_at)} />
        {item.spec_section && <MetaItem label="Spec Section" value={`${item.spec_section} — ${item.spec_title || ""}`} />}
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 13, color: "#fff", fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ── Section 3: Data Velocity ──

function DataVelocity({ velocity, loading }) {
  if (loading) {
    return (
      <div>
        <h3 style={S.sectionTitle}>Data Velocity</h3>
        <div style={{ ...S.panel, height: 260 }}>
          <Skeleton width="100%" height={200} />
        </div>
      </div>
    );
  }

  const singleDay = !velocity || velocity.length <= 1;

  return (
    <div>
      <h3 style={S.sectionTitle}>Data Velocity</h3>
      <div style={S.panel}>
        {singleDay && (
          <div style={{
            padding: "8px 12px",
            marginBottom: 12,
            borderRadius: 6,
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            fontSize: 12,
            color: "#F59E0B",
          }}>
            Seed data baseline — real market data will displace this as proposals are won
          </div>
        )}
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={velocity || [{ day: "Today", seed_weight: 0.4, real_weight: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="day"
                stroke="#888780"
                fontSize={10}
                tickFormatter={(v) => {
                  if (v === "Today") return v;
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                stroke="#888780"
                fontSize={10}
                domain={[0, 1]}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1E1E1C",
                  border: "1px solid #2A2A28",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#fff",
                }}
                formatter={(value) => [`${(value * 100).toFixed(1)}%`]}
              />
              <Line
                type="monotone"
                dataKey="seed_weight"
                name="Seed Data"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={!singleDay ? false : { r: 4, fill: "#F59E0B" }}
              />
              <Line
                type="monotone"
                dataKey="real_weight"
                name="Real Data"
                stroke="#34D399"
                strokeWidth={2}
                dot={!singleDay ? false : { r: 4, fill: "#34D399" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Section 4: Coverage by Division ──

function CoverageByDivision({ divisions, loading }) {
  if (loading) {
    return (
      <div>
        <h3 style={S.sectionTitle}>Coverage by Division</h3>
        <div style={S.panel}>
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} width="100%" height={28} style={{ marginBottom: 4 }} />
          ))}
        </div>
      </div>
    );
  }

  const coverageColor = (pct) => {
    if (pct >= 80) return "#34D399";
    if (pct >= 50) return "#F59E0B";
    return "#6B7280";
  };

  return (
    <div>
      <h3 style={S.sectionTitle}>Coverage by Division</h3>
      <div style={S.panel}>
        <div style={S.tableHeader}>
          <span style={{ ...S.th, flex: "0 0 80px" }}>Division #</span>
          <span style={{ ...S.th, flex: "1 1 200px" }}>Division Name</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Scope Items</span>
          <span style={{ ...S.th, flex: "0 0 90px", textAlign: "right" }}>Spec Refs</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Coverage %</span>
        </div>
        {(divisions || []).map((d, i) => (
          <div key={d.division} style={{
            ...S.row,
            background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent",
          }}>
            <span style={{ ...S.td, flex: "0 0 80px", fontFamily: "monospace", fontWeight: 600 }}>
              {d.division}
            </span>
            <span style={{ ...S.td, flex: "1 1 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.name}
            </span>
            <span style={{ ...S.td, flex: "0 0 100px", textAlign: "right" }}>
              {d.scope_items}
            </span>
            <span style={{ ...S.td, flex: "0 0 90px", textAlign: "right" }}>
              {d.spec_refs}
            </span>
            <span style={{
              ...S.td,
              flex: "0 0 100px",
              textAlign: "right",
              fontWeight: 700,
              color: coverageColor(d.coverage_pct),
            }}>
              {d.coverage_pct}%
            </span>
          </div>
        ))}
        {(!divisions || divisions.length === 0) && (
          <div style={S.empty}>No division data available</div>
        )}
      </div>
    </div>
  );
}

// ── Section 5: Carbon Summary ──

function CarbonSummary({ carbon, loading }) {
  const cards = [
    { label: "Materials Tracked", value: carbon?.materials_tracked, color: "#10B981" },
    { label: "Avg Carbon Intensity", value: carbon?.avg_intensity != null ? `${carbon.avg_intensity} kg CO₂e` : "—", color: "#3B82F6" },
    { label: "Spec Refs with Carbon", value: carbon?.spec_refs_with_carbon, color: "#8B5CF6" },
  ];

  return (
    <div>
      <h3 style={S.sectionTitle}>Carbon Summary</h3>
      <div style={S.cardRow}>
        {loading
          ? [0, 1, 2].map(i => <SkeletonCard key={i} />)
          : cards.map((c, i) => (
              <div key={i} style={S.statCard}>
                <div style={S.statLabel}>{c.label}</div>
                <div style={{ ...S.statValue, color: c.color, fontSize: typeof c.value === "string" ? 20 : 28 }}>
                  {typeof c.value === "number" ? c.value.toLocaleString() : c.value ?? "—"}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

// ── Section 6: Top API Queries ──

function TopApiQueries({ queries, loading }) {
  if (loading) {
    return (
      <div>
        <h3 style={S.sectionTitle}>Top API Queries</h3>
        <div style={S.panel}>
          <Skeleton width="100%" height={80} />
        </div>
      </div>
    );
  }

  if (!queries || queries.length === 0) {
    return (
      <div>
        <h3 style={S.sectionTitle}>Top API Queries</h3>
        <div style={S.empty}>
          No API queries yet — make your first call to /api/v1/benchmark
        </div>
      </div>
    );
  }

  const maxCount = queries[0]?.query_count || 1;

  return (
    <div>
      <h3 style={S.sectionTitle}>Top API Queries</h3>
      <div style={S.panel}>
        {queries.map((q, i) => (
          <div key={q.csi_code} style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 10px",
            borderRadius: 6,
            background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent",
          }}>
            <span style={{
              width: 20,
              fontSize: 10,
              fontWeight: 700,
              color: i < 3 ? "#8B5CF6" : "#888780",
              textAlign: "center",
            }}>
              {i + 1}
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              fontFamily: "monospace",
              width: 80,
            }}>
              {q.csi_code}
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(139,92,246,0.1)" }}>
              <div style={{
                width: `${(q.query_count / maxCount) * 100}%`,
                height: "100%",
                borderRadius: 4,
                background: "linear-gradient(90deg, #8B5CF6, #EC4899)",
                minWidth: 4,
              }} />
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#888780",
              width: 40,
              textAlign: "right",
            }}>
              {q.query_count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Panel ──

export default function AdminIntelligencePage() {
  const C = useTheme();
  const T = C.T;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/nova-core/intelligence-data", { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[intelligence]", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (error && !data) {
    return (
      <div style={{ ...S.panel, padding: 24, textAlign: "center", color: "#EF4444", fontSize: 13 }}>
        Failed to load intelligence data: {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Pulse keyframes for skeleton */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Intelligence Dashboard</h1>
          <p style={{ fontSize: 12, color: "#888780", margin: "4px 0 0" }}>
            NOVA Core market data, benchmarks, and coverage
          </p>
        </div>
        <button onClick={fetchData} style={S.refreshBtn}>Refresh</button>
      </div>

      {/* Section 1: Market Overview */}
      <MarketOverview data={data?.market_overview} loading={loading} />

      {/* Section 2: Benchmark Explorer */}
      <BenchmarkExplorer />

      {/* Section 3: Data Velocity */}
      <DataVelocity velocity={data?.velocity} loading={loading} />

      {/* Section 4: Coverage by Division */}
      <CoverageByDivision divisions={data?.division_coverage} loading={loading} />

      {/* Section 5: Carbon Summary */}
      <CarbonSummary carbon={data?.carbon} loading={loading} />

      {/* Section 6: Top API Queries */}
      <TopApiQueries queries={data?.top_api_queries} loading={loading} />
    </div>
  );
}

// ── Styles ──

const S = {
  sectionTitle: {
    fontSize: 14, fontWeight: 600, color: "#888780", margin: "0 0 12px",
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  cardRow: {
    display: "flex", gap: 12, flexWrap: "wrap",
  },
  statCard: {
    flex: "1 1 150px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 8, padding: "16px 20px",
  },
  statLabel: {
    fontSize: 11, fontWeight: 600, color: "#888780",
    textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6,
  },
  statValue: {
    fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1,
  },
  panel: {
    background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 8, padding: 20, overflow: "hidden",
  },
  searchInput: {
    width: "100%", padding: "10px 14px", fontSize: 13,
    background: "#161614", border: "1px solid #2A2A28", borderRadius: 6,
    color: "#fff", outline: "none", fontFamily: "system-ui, sans-serif",
    marginBottom: 12, boxSizing: "border-box",
  },
  empty: {
    textAlign: "center", padding: 40, color: "#888780", fontSize: 14,
    background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28",
  },
  tableHeader: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #2A2A28", background: "#161614",
    borderRadius: "6px 6px 0 0",
  },
  th: {
    fontSize: 10, fontWeight: 600, color: "#888780",
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  row: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #1A1A18",
  },
  td: { fontSize: 13, color: "#fff" },
  detailCard: {
    background: "#161614", border: "1px solid #2A2A28",
    borderRadius: 8, padding: 20,
  },
  refreshBtn: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
};
