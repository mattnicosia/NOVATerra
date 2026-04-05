import React, { useCallback, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import useExtractionStore from "@/stores/extractionStore";
import { useUiStore } from "@/stores/uiStore";
import { extractProposal, extractProposalBatch } from "@/utils/proposalExtractor";

const STATUS_LABELS = {
  pending: "Queued",
  uploading: "Uploading...",
  converting: "Converting PDF...",
  classifying: "Classifying...",
  extracting: "Extracting data...",
  normalizing: "Normalizing...",
  done: "Complete",
  error: "Error",
};

const TYPE_LABELS = {
  "gc-proposal": "GC Proposal",
  "sub-proposal": "Sub Proposal",
  "vendor-quote": "Vendor Quote",
  "other": "Other Document",
};

export default function ProposalUploader() {
  const C = useTheme();
  const T = C.T;
  const queue = useExtractionStore(s => s.queue);
  const results = useExtractionStore(s => s.results);
  const apiKey = useUiStore(s => s.appSettings?.datalabApiKey);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files) => {
    if (!apiKey) {
      alert("Set your Datalab API key in Settings first.");
      return;
    }
    const pdfs = Array.from(files).filter(f =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) return;

    if (pdfs.length === 1) {
      await extractProposal(pdfs[0], apiKey);
    } else {
      await extractProposalBatch(pdfs, apiKey, 2);
    }
  }, [apiKey]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onFileInput = useCallback((e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  }, [handleFiles]);

  return (
    <div style={{ padding: 16 }}>
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          borderRadius: 8,
          padding: 32,
          textAlign: "center",
          background: dragOver ? C.accent + "10" : C.bg1,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
        onClick={() => document.getElementById("proposal-file-input")?.click()}
      >
        <div style={{ fontSize: 14, color: C.textDim, marginBottom: 8 }}>
          Drop proposal PDFs here or click to browse
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          GC proposals, sub proposals, vendor quotes
        </div>
        <input
          id="proposal-file-input"
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={onFileInput}
        />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {queue.map(entry => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                borderRadius: 6,
                background: C.bg1,
                marginBottom: 4,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.fileName}
                </div>
                <div style={{ fontSize: 11, color: entry.status === "error" ? C.red : C.textMuted }}>
                  {entry.status === "error" ? entry.error : STATUS_LABELS[entry.status]}
                  {entry.documentType && ` \u2014 ${TYPE_LABELS[entry.documentType] || entry.documentType}`}
                </div>
              </div>
              {entry.status !== "done" && entry.status !== "error" && (
                <div style={{ width: 60, height: 4, borderRadius: 2, background: C.border }}>
                  <div style={{
                    width: `${entry.progress}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: C.accent,
                    transition: "width 0.3s",
                  }} />
                </div>
              )}
              {entry.status === "done" && (
                <span style={{ fontSize: 12, color: C.green }}>Done</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Results Preview */}
      {Object.entries(results).map(([id, result]) => (
        <div key={id} style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          background: C.bg,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
            {TYPE_LABELS[result.type] || result.type}
            {result.proposal && ` \u2014 ${result.proposal.projectName}`}
          </div>

          {result.type === "gc-proposal" && result.proposal && (
            <div style={{ fontSize: 12, color: C.textDim }}>
              <div>Total: ${result.proposal.totalCost?.toLocaleString()}</div>
              {result.proposal.projectSF && <div>$/SF: ${(result.proposal.totalCost / result.proposal.projectSF).toFixed(2)}</div>}
              <div>Divisions: {Object.keys(result.proposal.divisions || {}).length}</div>
              {result.sfRates?.length > 0 && <div>SF Rates: {result.sfRates.length}</div>}
            </div>
          )}

          {result.type === "sub-proposal" && result.proposal && (
            <div style={{ fontSize: 12, color: C.textDim }}>
              <div>Total: ${result.proposal.totalCost?.toLocaleString()}</div>
              <div>Line Items: {result.items?.length || 0}</div>
              <div>Unit Rates: {result.unitRates?.length || 0}</div>
            </div>
          )}

          {result.type === "vendor-quote" && (
            <div style={{ fontSize: 12, color: C.textDim }}>
              <div>Vendor: {result.vendor}</div>
              <div>Materials: {result.materialRates?.length || 0}</div>
              <div>Total: ${result.totalCost?.toLocaleString()}</div>
            </div>
          )}
        </div>
      ))}

      {/* API Key Warning */}
      {!apiKey && (
        <div style={{
          marginTop: 12,
          padding: 8,
          borderRadius: 6,
          background: C.orange + "15",
          fontSize: 12,
          color: C.orange,
        }}>
          Set your Datalab API key in Settings to enable extraction.
        </div>
      )}
    </div>
  );
}
