import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const STATUS_COLORS = {
  passed: "#30D158",
  failed: "#FF453A",
  partial: "#FF9F0A",
  running: "#64D2FF",
};

const RESULT_COLORS = {
  pass: "#30D158",
  fail: "#FF453A",
  functional_pass_ux_fail: "#FF9F0A",
  skipped: "#8E8E93",
};

const FAILURE_BADGES = {
  correctness: { label: "Correctness", color: "#FF453A" },
  discoverability: { label: "Discoverability", color: "#FF9F0A" },
  terminology: { label: "Terminology", color: "#BF5AF2" },
  viewport: { label: "Viewport", color: "#64D2FF" },
};

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: `${color}18`, color, textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#8E8E93";
  return <Badge label={status} color={color} />;
}

function ResultBadge({ result }) {
  const label = result === "functional_pass_ux_fail" ? "PASS / UX FAIL" : result;
  const color = RESULT_COLORS[result] || "#8E8E93";
  return <Badge label={label} color={color} />;
}

function formatDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function AdminTestingPage() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const [filter, setFilter] = useState({ status: "", run_type: "" });
  const [expandedRun, setExpandedRun] = useState(null);

  const { data, loading, error, refetch } = useAdminFetch("testing", {
    params: {
      ...(filter.status && { status: filter.status }),
      ...(filter.run_type && { run_type: filter.run_type }),
      limit: 30,
    },
  });

  const runs = data?.runs || [];
  const total = data?.total || 0;

  const ff = { fontFamily: T.font.sans };
  const card = {
    background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
  };

  // ── Summary stats ──
  const totalRuns = runs.length;
  const passedRuns = runs.filter(r => r.status === "passed").length;
  const failedRuns = runs.filter(r => r.status === "failed").length;
  const partialRuns = runs.filter(r => r.status === "partial").length;

  return (
    <div style={{ padding: 24, maxWidth: 960, ...ff }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, ...ff }}>
            AI Testing
          </h1>
          <p style={{ fontSize: 12, color: C.textDim, margin: "4px 0 0", ...ff }}>
            {total} test runs — regression + estimator simulation results
          </p>
        </div>
        <button
          onClick={refetch}
          style={{
            padding: "8px 16px", borderRadius: 8,
            background: C.accent, color: "#fff", border: "none",
            fontSize: 12, fontWeight: 600, cursor: "pointer", ...ff,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Runs", value: totalRuns, color: C.text },
          { label: "Passed", value: passedRuns, color: STATUS_COLORS.passed },
          { label: "Failed", value: failedRuns, color: STATUS_COLORS.failed },
          { label: "Partial (UX)", value: partialRuns, color: STATUS_COLORS.partial },
        ].map(s => (
          <div key={s.label} style={card}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, ...ff }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, ...ff }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={filter.status}
          onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          style={{
            padding: "6px 10px", borderRadius: 6, fontSize: 11, ...ff,
            background: dk ? "rgba(255,255,255,0.06)" : "#fff",
            border: `1px solid ${C.border}`, color: C.text,
          }}
        >
          <option value="">All Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="partial">Partial</option>
          <option value="running">Running</option>
        </select>
        <select
          value={filter.run_type}
          onChange={e => setFilter(f => ({ ...f, run_type: e.target.value }))}
          style={{
            padding: "6px 10px", borderRadius: 6, fontSize: 11, ...ff,
            background: dk ? "rgba(255,255,255,0.06)" : "#fff",
            border: `1px solid ${C.border}`, color: C.text,
          }}
        >
          <option value="">All Types</option>
          <option value="logic">Logic</option>
          <option value="estimator">Estimator</option>
          <option value="deploy">Deploy</option>
          <option value="changed">Changed</option>
          <option value="build">Build</option>
        </select>
      </div>

      {/* Loading / Error */}
      {loading && <div style={{ color: C.textDim, fontSize: 12, padding: 20, textAlign: "center" }}>Loading test runs...</div>}
      {error && <div style={{ color: STATUS_COLORS.failed, fontSize: 12, padding: 20 }}>Error: {error}</div>}

      {/* Run list */}
      {!loading && runs.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 6, ...ff }}>No test runs yet</div>
          <div style={{ fontSize: 11, color: C.textMuted, ...ff }}>
            Run <code style={{ background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>/test</code> from Claude Code to create your first test run.
          </div>
        </div>
      )}

      {runs.map(run => {
        const isExpanded = expandedRun === run.id;
        const journeyCount = run.journeys?.length || 0;
        const journeyPassed = run.journeys?.filter(j => j.result === "pass").length || 0;
        const uxFails = run.journeys?.filter(j => j.result === "functional_pass_ux_fail").length || 0;

        return (
          <div key={run.id} style={card}>
            {/* Run header */}
            <div
              onClick={() => setExpandedRun(isExpanded ? null : run.id)}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
            >
              <Ic d={I.chevron} size={10} color={C.textDim} style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
              <StatusBadge status={run.status} />
              <Badge label={run.run_type} color={C.accent} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1, ...ff }}>
                {formatDate(run.started_at)}
              </span>
              <span style={{ fontSize: 10, color: C.textDim, ...ff }}>
                {formatDuration(run.duration_ms)}
              </span>
              {run.tests_total > 0 && (
                <span style={{ fontSize: 10, color: C.textDim, ...ff }}>
                  {run.tests_passed}/{run.tests_total} tests
                </span>
              )}
              {journeyCount > 0 && (
                <span style={{ fontSize: 10, color: C.textDim, ...ff }}>
                  {journeyPassed}/{journeyCount} journeys
                  {uxFails > 0 && <span style={{ color: STATUS_COLORS.partial, marginLeft: 4 }}>{uxFails} UX</span>}
                </span>
              )}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                {/* Summary */}
                {run.summary && (
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12, lineHeight: 1.5, ...ff }}>
                    {run.summary}
                  </div>
                )}

                {/* Logic test details */}
                {run.tests_total > 0 && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, ...ff }}>
                    <span style={{ color: C.textDim }}>Files: <strong style={{ color: C.text }}>{run.test_files_passed}/{run.test_files_total}</strong></span>
                    <span style={{ color: C.textDim }}>Tests: <strong style={{ color: C.text }}>{run.tests_passed}/{run.tests_total}</strong></span>
                    {run.build_passed !== null && (
                      <span style={{ color: C.textDim }}>Build: <strong style={{ color: run.build_passed ? STATUS_COLORS.passed : STATUS_COLORS.failed }}>{run.build_passed ? "PASS" : "FAIL"}</strong></span>
                    )}
                  </div>
                )}

                {/* Build error */}
                {run.build_error && (
                  <pre style={{
                    fontSize: 10, color: STATUS_COLORS.failed, background: "rgba(255,69,58,0.08)",
                    padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 150, marginBottom: 12,
                    fontFamily: T.font.mono || "monospace",
                  }}>
                    {run.build_error}
                  </pre>
                )}

                {/* Changed files */}
                {run.changed_files && run.changed_files.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, ...ff }}>Changed Files</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {run.changed_files.map((f, i) => (
                        <span key={i} style={{
                          fontSize: 9, padding: "2px 6px", borderRadius: 3,
                          background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                          color: C.textDim, fontFamily: T.font.mono || "monospace",
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Journey results */}
                {run.journeys && run.journeys.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, ...ff }}>
                      Estimator Journeys
                    </div>
                    {run.journeys.map(j => (
                      <div key={j.id} style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "8px 10px", marginBottom: 4, borderRadius: 6,
                        background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
                        border: `1px solid ${j.result === "fail" ? `${STATUS_COLORS.failed}20` : "transparent"}`,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.textDim, minWidth: 18, ...ff }}>
                          #{j.journey_number}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.text, ...ff }}>{j.journey_name}</span>
                            <ResultBadge result={j.result} />
                            {j.failure_class && FAILURE_BADGES[j.failure_class] && (
                              <Badge label={FAILURE_BADGES[j.failure_class].label} color={FAILURE_BADGES[j.failure_class].color} />
                            )}
                          </div>
                          {j.explanation && (
                            <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.4, ...ff }}>
                              {j.explanation}
                            </div>
                          )}
                          {j.component_involved && (
                            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, ...ff }}>
                              Component: <code style={{ background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>{j.component_involved}</code>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
