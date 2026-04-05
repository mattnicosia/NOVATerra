// ProposalUploadQueue — Upload queue panel with batch processing UI
import { useState, useMemo } from "react";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { deletePdfBase64, deletePdfBase64Batch, saveUploadQueue } from "@/hooks/usePersistence";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

function QueueStatusBadge({ status, C }) {
  const config = {
    queued: { color: C.textDim, label: "Queued", icon: "\u25CB" },
    extracting: { color: C.orange, label: "Extracting...", icon: "\u27F3" },
    extracted: { color: C.blue, label: "Ready for Review", icon: "\u25C9" },
    saved: { color: C.green, label: "Saved", icon: "\u2713" },
    failed: { color: C.red, label: "Failed", icon: "\u00D7" },
  };
  const c = config[status] || config.queued;
  return (
    <span style={{ fontSize: 9, fontWeight: 600, color: c.color, display: "flex", alignItems: "center", gap: 3 }}>
      <span style={{ fontSize: 11 }}>{c.icon}</span> {c.label}
    </span>
  );
}

export default function ProposalUploadQueue({
  C,
  T,
  uploadQueue,
  base64DataMap,
  isPaused,
  batchStatsRef,
  handleReviewQueueItem,
  handleRetry,
  handleRetryAll,
  handleTogglePause,
  handleBatchAccept,
  removeQueueItem,
  clearSavedFromQueue,
  clearFailedFromQueue,
}) {
  const [showQueue, setShowQueue] = useState(true);

  const queueExtracted = uploadQueue.filter(q => q.status === "extracted").length;
  const queueExtracting = uploadQueue.filter(q => q.status === "extracting").length;
  const queueSaved = uploadQueue.filter(q => q.status === "saved").length;
  const queueFailed = uploadQueue.filter(q => q.status === "failed").length;
  const queueQueued = uploadQueue.filter(q => q.status === "queued").length;
  const queueTotal = uploadQueue.length;
  const queueDone = queueExtracted + queueSaved;
  const queueProcessing = queueDone + queueFailed;
  const batchMode = queueTotal > 5;
  const batchPct = queueTotal > 0 ? Math.round((queueProcessing / queueTotal) * 100) : 0;

  const batchEta = useMemo(() => {
    const { completed, startTime } = batchStatsRef.current;
    if (!startTime || completed === 0) return null;
    const elapsedMs = Date.now() - startTime;
    const avgMs = elapsedMs / completed;
    const remaining = queueQueued + queueExtracting;
    const etaMs = remaining * avgMs;
    if (etaMs < 60_000) return "< 1 min";
    return `~${Math.ceil(etaMs / 60_000)} min`;
  }, [queueQueued, queueExtracting]);

  if (uploadQueue.length === 0) return null;

  return (
    <div style={{ marginBottom: 14, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      {/* Queue header */}
      <div
        onClick={() => setShowQueue(v => !v)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: C.bg2,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>Upload Queue</span>
          {queueExtracted > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${C.blue}18`, color: C.blue }}>
              {queueExtracted} ready for review
            </span>
          )}
          {queueSaved > 0 && <span style={{ fontSize: 9, color: C.textDim }}>{queueSaved} saved</span>}
          {queueFailed > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${C.red}18`, color: C.red }}>
              {queueFailed} failed
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={e => {
              e.stopPropagation();
              const ids = uploadQueue.map(q => q.id);
              ids.forEach(id => base64DataMap.delete(id));
              deletePdfBase64Batch(ids);
              ids.forEach(id => removeQueueItem(id));
              saveUploadQueue();
            }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: C.red || "#f44", fontWeight: 600, padding: "2px 6px" }}
          >
            Clear All
          </button>
          <span
            style={{
              fontSize: 10,
              color: C.textDim,
              transition: "transform 150ms",
              transform: showQueue ? "rotate(90deg)" : "rotate(0deg)",
              display: "inline-block",
            }}
          >
            \u25B8
          </span>
        </div>
      </div>

      {/* Batch Progress UI */}
      {batchMode && (
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ height: 6, borderRadius: 3, background: `${C.textDim}15`, marginBottom: 8, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                transition: "width 300ms ease",
                width: `${batchPct}%`,
                background: `linear-gradient(90deg, ${C.accent}, ${C.blue})`,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>
              {queueProcessing}/{queueTotal} processed ({batchPct}%)
            </span>
            {queueExtracting > 0 && (
              <span style={{ fontSize: 9, fontWeight: 600, color: C.orange, display: "flex", alignItems: "center", gap: 3 }}>
                <Ic d={I.ai} size={10} color={C.accent} /> {queueExtracting} active
              </span>
            )}
            {queueFailed > 0 && <span style={{ fontSize: 9, fontWeight: 600, color: C.red }}>{queueFailed} failed</span>}
            {batchEta && (queueQueued > 0 || queueExtracting > 0) && (
              <span style={{ fontSize: 9, color: C.textDim }}>{batchEta} remaining</span>
            )}
            {isPaused && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, padding: "1px 6px", borderRadius: 3, background: `${C.orange}15` }}>PAUSED</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={handleTogglePause}
              style={bt(C, {
                background: isPaused ? `${C.accent}15` : `${C.orange}15`,
                border: `1px solid ${isPaused ? C.accent + "35" : C.orange + "35"}`,
                color: isPaused ? C.accent : C.orange,
                padding: "4px 10px",
                fontSize: 9,
                fontWeight: 700,
              })}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            {queueExtracted > 0 && (
              <button
                onClick={handleBatchAccept}
                style={bt(C, { background: `${C.green}15`, border: `1px solid ${C.green}35`, color: C.green, padding: "4px 10px", fontSize: 9, fontWeight: 700 })}
              >
                Accept All {queueExtracted}
              </button>
            )}
            {queueFailed > 0 && (
              <>
                <button
                  onClick={handleRetryAll}
                  style={bt(C, { background: `${C.orange}10`, border: `1px solid ${C.orange}30`, color: C.orange, padding: "4px 10px", fontSize: 9, fontWeight: 700 })}
                >
                  Retry All {queueFailed} Failed
                </button>
                <button
                  onClick={() => {
                    const ids = uploadQueue.filter(q => q.status === "failed").map(q => q.id);
                    ids.forEach(id => base64DataMap.delete(id));
                    deletePdfBase64Batch(ids);
                    clearFailedFromQueue();
                    saveUploadQueue();
                  }}
                  style={bt(C, { background: `${C.red || "#f44"}10`, border: `1px solid ${C.red || "#f44"}30`, color: C.red || "#f44", padding: "4px 10px", fontSize: 9, fontWeight: 700 })}
                >
                  Clear {queueFailed} Failed
                </button>
              </>
            )}
          </div>
          {queueExtracting > 0 && (
            <div style={{ marginTop: 6, fontSize: 9, color: C.textDim }}>
              Extracting: {uploadQueue.filter(q => q.status === "extracting").map(q => q.fileName).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Queue items */}
      {showQueue && (
        <div style={{ padding: "4px 8px 8px", maxHeight: batchMode ? 300 : undefined, overflowY: batchMode ? "auto" : undefined }}>
          {uploadQueue.map(q => (
            <div
              key={q.id}
              onClick={() => q.status === "extracted" && q.extractedData && handleReviewQueueItem(q)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 4,
                marginBottom: 2,
                cursor: q.status === "extracted" && q.extractedData ? "pointer" : "default",
                background: q.status === "extracted" ? `${C.blue}06` : q.status === "failed" ? `${C.red || "#f44"}08` : "transparent",
              }}
            >
              <div style={{ flex: 1, overflow: "hidden" }}>
                <span style={{ fontSize: 10, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                  {q.fileName}
                </span>
                {q.status === "failed" && q.error && (
                  <span style={{ fontSize: 8, color: C.red || "#f44", opacity: 0.8, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.error}>
                    {q.error.length > 80 ? q.error.slice(0, 80) + "\u2026" : q.error}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 9, color: C.textMuted, whiteSpace: "nowrap" }}>
                {q.fileSize ? `${Math.round(q.fileSize / 1024)}KB` : ""}
              </span>
              <QueueStatusBadge status={q.status} C={C} />
              {q.status === "extracted" && q.extractedData && (
                <button
                  onClick={e => { e.stopPropagation(); handleReviewQueueItem(q); }}
                  style={bt(C, { background: C.blue, color: "#fff", padding: "3px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4 })}
                >
                  Review
                </button>
              )}
              {q.status === "extracted" && !q.extractedData && (
                <span style={{ fontSize: 8, color: C.orange, fontWeight: 600 }}>Re-upload to restore</span>
              )}
              {q.status === "failed" && (
                <button
                  onClick={e => { e.stopPropagation(); handleRetry(q); }}
                  style={bt(C, { background: `${C.orange}15`, border: `1px solid ${C.orange}35`, color: C.orange, padding: "3px 10px", fontSize: 9, fontWeight: 600 })}
                >
                  Retry
                </button>
              )}
              {q.status !== "extracting" && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    base64DataMap.delete(q.id);
                    deletePdfBase64(q.id);
                    removeQueueItem(q.id);
                    saveUploadQueue();
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }}
                >
                  <Ic d={I.x || I.close} size={10} color={C.textDim} />
                </button>
              )}
            </div>
          ))}
          {queueSaved > 0 && (
            <button
              onClick={() => {
                const ids = uploadQueue.filter(q => q.status === "saved").map(q => q.id);
                ids.forEach(id => base64DataMap.delete(id));
                deletePdfBase64Batch(ids);
                clearSavedFromQueue();
                saveUploadQueue();
              }}
              style={{ background: "none", border: "none", color: C.textDim, fontSize: 9, cursor: "pointer", padding: "4px 0", fontWeight: 600 }}
            >
              Clear {queueSaved} completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
