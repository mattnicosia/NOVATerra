// BatchIngestionPanel — UI for batch proposal ingestion from Dropbox
// Shows progress, cost tracker, log, and controls

import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBatchIngestionStore } from "@/stores/batchIngestionStore";
import { aggregateTradePricing } from "@/utils/tradePricingAggregator";
import { importBatchParsedProposals, calibrateFromImportedProposals } from "@/data/importProposals";

export default function BatchIngestionPanel() {
  const C = useTheme();
  const T = C.T;
  const {
    manifest, isRunning, isPaused, currentFile, progress, estimatedCost, log,
    syncRuns, startBatch, pause, resume, stop, getStatusSummary,
  } = useBatchIngestionStore();

  const [importing, setImporting] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [aggregateResult, setAggregateResult] = useState(null);

  useEffect(() => { syncRuns(); }, []);

  const summary = getStatusSummary();
  const pctDone = summary.total > 0
    ? Math.round(((summary.parsed + summary.skipped + summary.errors) / summary.total) * 100)
    : 0;

  const handleStart = () => {
    // For now, startBatch expects a loadBase64Fn — we'll pass null and handle via the API
    // In production, this would use Dropbox API to fetch each PDF
    startBatch(null);
  };

  const handleImportToCore = async () => {
    setImporting(true);
    try {
      const count = await importBatchParsedProposals();
      if (count) {
        await calibrateFromImportedProposals();
      }
      alert(`Imported ${count} proposals to CORE and recalibrated ROM.`);
    } catch (err) {
      alert("Import failed: " + err.message);
    }
    setImporting(false);
  };

  const handleAggregate = async () => {
    setAggregating(true);
    try {
      const result = await aggregateTradePricing();
      setAggregateResult(result);
    } catch (err) {
      setAggregateResult({ error: err.message });
    }
    setAggregating(false);
  };

  const cardStyle = {
    background: T?.cardBg || "rgba(255,255,255,0.03)",
    border: `1px solid ${T?.border || "rgba(255,255,255,0.08)"}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: T?.text, marginBottom: 8 }}>
        Batch Proposal Ingestion
      </h2>
      <p style={{ fontSize: 13, color: T?.textMuted, marginBottom: 24 }}>
        Parse {manifest.length} proposal PDFs from Dropbox into CORE's pricing engine.
      </p>

      {/* Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total", value: summary.total, color: T?.text },
          { label: "Classified", value: summary.classified, color: "#3b82f6" },
          { label: "Parsed", value: summary.parsed, color: "#22c55e" },
          { label: "Skipped", value: summary.skipped, color: "#a3a3a3" },
          { label: "Errors", value: summary.errors, color: "#ef4444" },
        ].map(c => (
          <div key={c.label} style={cardStyle}>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: T?.textMuted, marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${pctDone}%`, borderRadius: 4,
              background: "linear-gradient(90deg, #3b82f6, #22c55e)",
              transition: "width 0.3s ease",
            }} />
          </div>
          <div style={{ fontSize: 11, color: T?.textMuted, marginTop: 6 }}>
            {pctDone}% complete{currentFile ? ` — ${currentFile}` : ""}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
          ~${estimatedCost.toFixed(2)}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {!isRunning ? (
          <button onClick={handleStart}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Start Batch
          </button>
        ) : (
          <>
            {!isPaused ? (
              <button onClick={pause}
                style={{ padding: "8px 20px", borderRadius: 8, background: "#eab308", color: "#000", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Pause
              </button>
            ) : (
              <button onClick={resume}
                style={{ padding: "8px 20px", borderRadius: 8, background: "#22c55e", color: "#000", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Resume
              </button>
            )}
            <button onClick={stop}
              style={{ padding: "8px 20px", borderRadius: 8, background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>
              Stop
            </button>
          </>
        )}

        <button onClick={handleAggregate} disabled={aggregating}
          style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,0.08)", color: T?.text, border: `1px solid ${T?.border}`, cursor: "pointer", fontWeight: 600, opacity: aggregating ? 0.5 : 1 }}>
          {aggregating ? "Aggregating..." : "Build Pricing Index"}
        </button>

        <button onClick={handleImportToCore} disabled={importing}
          style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(255,255,255,0.08)", color: T?.text, border: `1px solid ${T?.border}`, cursor: "pointer", fontWeight: 600, opacity: importing ? 0.5 : 1 }}>
          {importing ? "Importing..." : "Import to CORE"}
        </button>
      </div>

      {aggregateResult && (
        <div style={{ ...cardStyle, background: aggregateResult.error ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)" }}>
          {aggregateResult.error
            ? `Error: ${aggregateResult.error}`
            : `Built ${aggregateResult.count} index entries from ${aggregateResult.fromRuns} parsed proposals.`}
        </div>
      )}

      {/* Log */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T?.text, marginBottom: 8 }}>Activity Log</div>
        <div style={{ maxHeight: 300, overflow: "auto", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}>
          {log.length === 0 && (
            <div style={{ color: T?.textMuted, padding: 12 }}>No activity yet. Click "Start Batch" to begin.</div>
          )}
          {log.map((entry, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: `1px solid ${T?.border || "rgba(255,255,255,0.04)"}`, color: T?.textMuted }}>
              <span style={{ color: entry.action === "error" ? "#ef4444" : "#3b82f6", marginRight: 8 }}>
                [{entry.action}]
              </span>
              <span style={{ color: T?.text }}>{entry.filename}</span>
              <span style={{ marginLeft: 8, opacity: 0.6 }}>{entry.result}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
