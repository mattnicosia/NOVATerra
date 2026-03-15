import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/* ── Skeleton block ── */
function Skeleton({ width = "100%", height = 20, C }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background: C.bg2 || "rgba(255,255,255,0.06)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, icon, color, C, loading, suffix }) {
  const T = C.T;
  return (
    <div
      style={{
        ...card(C),
        flex: "1 1 180px",
        minWidth: 180,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={icon} size={15} color={color} />
        </div>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      {loading ? (
        <Skeleton width={80} height={28} C={C} />
      ) : (
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: C.text,
            fontFamily: T.font.sans,
            lineHeight: 1,
          }}
        >
          {value ?? "—"}{suffix || ""}
        </span>
      )}
    </div>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, subtitle, C }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
      {subtitle && (
        <p style={{ fontSize: 11, color: C.textMuted, margin: "2px 0 0" }}>{subtitle}</p>
      )}
    </div>
  );
}

/* ── Note pill ── */
function Note({ text, color = "#F59E0B", C }) {
  return (
    <div
      style={{
        ...card(C),
        padding: "10px 16px",
        fontSize: 12,
        color,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ic d={I.info || "M12 16v-4 M12 8h.01"} size={14} color={color} />
      {text}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const C = useTheme();
  const T = C.T;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/nova-core/analytics-data", { credentials: "same-origin" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
      } catch (err) {
        console.error("[admin/analytics]", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{ ...card(C), padding: 24, textAlign: "center", color: "#F87171", fontSize: 13 }}>
        Failed to load analytics: {error}
      </div>
    );
  }

  const rev = data?.revenue;
  const trial = data?.trial_funnel;
  const dq = data?.data_quality;
  const api = data?.api_performance;
  const parser = data?.parser;
  const outreach = data?.outreach;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Pulse animation for skeletons */}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.8 } }`}</style>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>Platform performance & metrics</p>
      </div>

      {/* ── Section 1: Revenue ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="Revenue" C={C} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KpiCard label="MRR" value={rev ? `$${rev.mrr.toLocaleString()}` : null} icon={I.dollar} color="#10B981" C={C} loading={loading} />
          <KpiCard label="Paying Orgs" value={rev?.paying_orgs} icon={I.assembly} color="#3B82F6" C={C} loading={loading} />
          <KpiCard label="ARPU" value={rev ? `$${rev.arpu.toLocaleString()}` : null} icon={I.dollar} color="#8B5CF6" C={C} loading={loading} />
        </div>

        {/* MRR Trend Chart */}
        <div style={{ ...card(C), padding: "20px 24px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>MRR Trend — Last 30 Days</h3>
          {loading ? (
            <Skeleton width="100%" height={180} C={C} />
          ) : rev?.mrr_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={rev.mrr_trend}>
                <XAxis
                  dataKey="day"
                  tick={{ fill: C.textMuted, fontSize: 10 }}
                  tickFormatter={v => v.slice(5)}
                  axisLine={{ stroke: C.border }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: C.bg || "#1a1a2e",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: C.text,
                  }}
                  formatter={v => [`$${v}`, "MRR"]}
                />
                <Line type="monotone" dataKey="mrr" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Note text="Revenue tracking begins today — chart populates as subscriptions activate" color={C.textMuted} C={C} />
          )}
        </div>
      </div>

      {/* ── Section 2: Trial Funnel ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="Trial Funnel" C={C} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KpiCard label="Active Trials" value={trial?.active_trials} icon={I.clock} color="#3B82F6" C={C} loading={loading} />
          <KpiCard label="Expiring (7d)" value={trial?.expiring_soon} icon={I.shield} color="#F59E0B" C={C} loading={loading} />
          <KpiCard label="Converted" value={trial?.converted} icon={I.check || I.shield} color="#10B981" C={C} loading={loading} />
        </div>
        {!loading && trial && (
          <div style={{ ...card(C), padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>Conversion Rate</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>
              {trial.conversion_rate}%
            </span>
            <span style={{ fontSize: 11, color: C.textDim }}>
              ({trial.converted} of {trial.total_non_demo} non-demo orgs)
            </span>
          </div>
        )}
      </div>

      {/* ── Section 3: Data Quality ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="Data Quality" subtitle="Seed displacement increases as GCs mark estimates Won" C={C} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KpiCard label="Total Scope Items" value={dq?.total_scope_items ?? 950} icon={I.layers} color="#8B5CF6" C={C} loading={loading} />
          <KpiCard label="With Real Data" value={dq?.with_real_data} icon={I.database} color="#3B82F6" C={C} loading={loading} />
          <KpiCard label="Seed Displacement" value={dq ? `${dq.seed_displacement}%` : null} icon={I.change} color="#10B981" C={C} loading={loading} />
        </div>
        {!loading && dq?.with_real_data === 0 && (
          <Note text="No real market data yet — seed baseline active" color="#F59E0B" C={C} />
        )}
      </div>

      {/* ── Section 4: API Performance ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="API Performance" subtitle="Last 30 days" C={C} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <KpiCard label="Total Calls" value={api?.total_calls} icon={I.intelligence} color="#3B82F6" C={C} loading={loading} />
          <KpiCard label="Success Rate" value={api ? `${api.success_rate}%` : null} icon={I.shield} color="#10B981" C={C} loading={loading} />
          <KpiCard label="Avg Response" value={api ? `${api.avg_response_ms}ms` : null} icon={I.clock} color="#F59E0B" C={C} loading={loading} />
          <KpiCard label="Cache Hit Rate" value={api ? `${api.cache_hit_rate}%` : null} icon={I.layers} color="#8B5CF6" C={C} loading={loading} />
        </div>

        {/* Top CSI Codes Table */}
        {!loading && api?.top_csi_codes?.length > 0 && (
          <div style={{ ...card(C), padding: "20px 24px" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>Top 5 CSI Codes Queried</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  padding: "6px 12px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: C.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                <span style={{ flex: 1 }}>CSI Code</span>
                <span style={{ width: 80, textAlign: "right" }}>Calls</span>
              </div>
              {api.top_csi_codes.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: T.radius.sm,
                    background: i % 2 === 0 ? (C.bg2 || "rgba(255,255,255,0.03)") : "transparent",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500, fontFamily: T.font.sans }}>
                    {row.csi_code}
                  </span>
                  <span style={{ width: 80, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>
                    {row.calls.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 5: Parser Stats ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="Parser Stats" subtitle="Last 30 days" C={C} />
        {!loading && parser?.total_proposals === 0 ? (
          <Note text="No proposals parsed yet — upload one via /admin/upload" C={C} />
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <KpiCard label="Total Proposals" value={parser?.total_proposals} icon={I.upload} color="#3B82F6" C={C} loading={loading} />
            <KpiCard label="Auto-Write Rate" value={parser ? `${parser.auto_write_rate}%` : null} icon={I.ai} color="#10B981" C={C} loading={loading} />
            <KpiCard label="Avg Confidence" value={parser?.avg_confidence} icon={I.insights} color="#8B5CF6" C={C} loading={loading} />
          </div>
        )}
      </div>

      {/* ── Section 6: Outreach ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SectionHeader title="Outreach" C={C} />
        {!loading && outreach?.emails_sent === 0 ? (
          <Note text="No outreach sent yet — outreach runs daily at 9 AM UTC" C={C} />
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <KpiCard label="Emails Sent" value={outreach?.emails_sent} icon={I.inbox} color="#3B82F6" C={C} loading={loading} />
            <KpiCard label="Open Rate" value={outreach ? `${outreach.open_rate}%` : null} icon={I.intelligence} color="#10B981" C={C} loading={loading} />
            <KpiCard label="Conversion Rate" value={outreach ? `${outreach.conversion_rate}%` : null} icon={I.dollar} color="#8B5CF6" C={C} loading={loading} />
            <KpiCard label="Unsubscribed" value={outreach?.unsubscribed} icon={I.shield} color="#F87171" C={C} loading={loading} />
          </div>
        )}
      </div>
    </div>
  );
}
