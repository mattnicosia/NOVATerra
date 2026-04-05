// ═══════════════════════════════════════════════════════════════════════════════
// NOVA Autopilot Panel — Full-pipeline estimate generation UI
//
// Modal overlay with: PDF upload → config → launch → progress → results
// Triggered via useAutopilotModal() hook from dashboard or projects page.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useMemo } from "react";
import { create } from "zustand";
import { useTheme } from "@/hooks/useTheme";
import { bt, inp, card } from "@/utils/styles";
import { T } from "@/utils/designTokens";
import { I } from "@/constants/icons";
import { BUILDING_TYPES } from "@/constants/constructionTypes";
import Modal from "@/components/shared/Modal";

// ─── Global modal state ──────────────────────────────────────────────────────
export const useAutopilotModal = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

// ─── Icon helper ─────────────────────────────────────────────────────────────
const Ic = ({ d, size = 20, color = "currentColor", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
    style={style}>
    <path d={d} />
  </svg>
);

// ─── Phases ──────────────────────────────────────────────────────────────────
const PHASE_LABELS = {
  init: "Initializing",
  pdf: "Loading PDFs",
  scan: "Scanning drawings",
  knowledge: "Loading knowledge",
  rom: "Generating ROM",
  items: "Building scope",
  score: "Computing confidence",
  done: "Complete",
};

// ═══════════════════════════════════════════════════════════════════════════════
// AutopilotPanel
// ═══════════════════════════════════════════════════════════════════════════════
export default function AutopilotPanel() {
  const C = useTheme();
  const { open, hide } = useAutopilotModal();

  // Form state
  const [files, setFiles] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [buildingType, setBuildingType] = useState("commercial-office");
  const [projectSF, setProjectSF] = useState("");
  const [location, setLocation] = useState("");

  // Run state
  const [phase, setPhase] = useState(null); // null = idle, string = running, "done" = complete
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const fileRef = useRef(null);

  const isRunning = phase && phase !== "done";

  // ── File handling ──────────────────────────────────────────────────────────
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files || [])
      .filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (dropped.length) setFiles(prev => [...prev, ...dropped]);
  }, []);

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Launch autopilot ───────────────────────────────────────────────────────
  const launch = useCallback(async () => {
    setError(null);
    setResult(null);
    setPhase("init");
    setProgress(0);
    setMessage("Starting...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { runAutopilot } = await import("@/utils/novaAutopilot");
      const res = await runAutopilot({
        pdfFiles: files,
        buildingType,
        projectSF: parseInt(projectSF) || 0,
        location,
        projectName: projectName || "Autopilot Estimate",
        onProgress: (p, pct, msg) => {
          setPhase(p);
          setProgress(pct);
          setMessage(msg);
        },
        signal: controller.signal,
      });
      setResult(res);
      setPhase("done");
    } catch (err) {
      if (err.name === "AutopilotAbortError") {
        setPhase(null);
        setMessage("");
      } else {
        setError(err.message || "Autopilot failed");
        setPhase(null);
      }
    }
  }, [files, buildingType, projectSF, location, projectName]);

  // ── Abort ──────────────────────────────────────────────────────────────────
  const abort = useCallback(() => {
    abortRef.current?.abort();
    setPhase(null);
    setMessage("");
  }, []);

  // ── Reset to run again ─────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setFiles([]);
    setProjectName("");
    setBuildingType("commercial-office");
    setProjectSF("");
    setLocation("");
    setPhase(null);
    setProgress(0);
    setMessage("");
    setResult(null);
    setError(null);
  }, []);

  // ── Navigate to estimate ───────────────────────────────────────────────────
  const openEstimate = useCallback(() => {
    if (!result?.estimateId) return;
    const { useEstimatesStore } = require("@/stores/estimatesStore");
    useEstimatesStore.setState({ activeEstimateId: result.estimateId });
    hide();
    // Navigate via uiStore or direct
    try {
      const { useUiStore } = require("@/stores/uiStore");
      useUiStore.getState().setPage?.("estimate");
    } catch { /* fallback: user can navigate manually */ }
  }, [result, hide]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const ff = { fontFamily: T.font.sans };
  const accent = C.accent || "#8B5CF6";
  const dimText = C.isDark ? "rgba(238,237,245,0.45)" : "rgba(0,0,0,0.4)";
  const dimTextFaint = C.isDark ? "rgba(238,237,245,0.25)" : "rgba(0,0,0,0.25)";

  const sectionLabel = {
    fontSize: 10,
    color: dimText,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 4,
    ...ff,
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={isRunning ? undefined : hide} wide>
      <div style={{ ...ff }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 12px ${accent}60`,
            animation: isRunning ? "nova-ap-pulse 1.5s ease-in-out infinite" : "none",
          }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0, ...ff }}>
            NOVA Autopilot
          </h2>
          <span style={{ fontSize: 11, color: dimText, marginLeft: "auto", ...ff }}>
            Full-pipeline estimate generation
          </span>
          {!isRunning && (
            <span onClick={hide} style={{ cursor: "pointer", color: dimText, fontSize: 18 }}>
              <Ic d={I.x} size={16} color={dimText} />
            </span>
          )}
        </div>

        {/* ── RESULTS VIEW ────────────────────────────────────────────── */}
        {result && phase === "done" && (
          <ResultsView
            result={result} C={C} accent={accent} ff={ff}
            dimText={dimText} dimTextFaint={dimTextFaint}
            onOpenEstimate={openEstimate} onReset={reset}
          />
        )}

        {/* ── PROGRESS VIEW ───────────────────────────────────────────── */}
        {isRunning && (
          <ProgressView
            phase={phase} progress={progress} message={message}
            C={C} accent={accent} ff={ff} dimText={dimText}
            onAbort={abort}
          />
        )}

        {/* ── CONFIG VIEW (idle) ──────────────────────────────────────── */}
        {!isRunning && !result && (
          <>
            {error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                fontSize: 12, color: "#EF4444", ...ff,
              }}>
                {error}
              </div>
            )}

            {/* Upload zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`,
                borderRadius: 12,
                padding: files.length ? "16px 20px" : "40px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                marginBottom: 16,
              }}
            >
              <input
                ref={fileRef} type="file" accept=".pdf" multiple
                style={{ display: "none" }}
                onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
              />

              {files.length === 0 ? (
                <>
                  <Ic d={I.upload} size={28} color={dimText} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: dimText, ...ff }}>
                    Drop construction PDFs here or click to browse
                  </div>
                  <div style={{ fontSize: 11, color: dimTextFaint, marginTop: 6, ...ff }}>
                    Architectural, structural, MEP drawing sets
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "left" }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                      <Ic d={I.check} size={12} color="#00D4AA" />
                      <span style={{ fontSize: 12, color: C.text, ...ff }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: dimTextFaint, ...ff }}>
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        style={{ fontSize: 11, color: dimText, cursor: "pointer", marginLeft: "auto" }}
                      >
                        <Ic d={I.x} size={12} color={dimText} />
                      </span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: dimTextFaint, marginTop: 6, ...ff }}>
                    + Drop more files or click to add
                  </div>
                </div>
              )}
            </div>

            {/* Config fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <label style={sectionLabel}>Project Name</label>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="28 Liberty - 22nd Floor"
                  style={inp(C, { fontSize: 12, padding: "6px 10px" })}
                />
              </div>
              <div>
                <label style={sectionLabel}>Building Type</label>
                <select
                  value={buildingType}
                  onChange={e => setBuildingType(e.target.value)}
                  style={inp(C, { fontSize: 12, padding: "6px 10px" })}
                >
                  {BUILDING_TYPES.map(bt => (
                    <option key={bt.key} value={bt.key}>{bt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={sectionLabel}>Project SF</label>
                <input
                  type="number"
                  value={projectSF}
                  onChange={e => setProjectSF(e.target.value)}
                  placeholder="25,000"
                  style={inp(C, { fontSize: 12, padding: "6px 10px" })}
                />
              </div>
              <div>
                <label style={sectionLabel}>Location</label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="New York, NY"
                  style={inp(C, { fontSize: 12, padding: "6px 10px" })}
                />
              </div>
            </div>

            {/* Launch button */}
            <button
              onClick={launch}
              disabled={files.length === 0 && !projectSF}
              style={{
                ...bt(C),
                width: "100%",
                padding: "12px 0",
                fontSize: 14,
                fontWeight: 600,
                background: accent,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                opacity: (files.length === 0 && !projectSF) ? 0.4 : 1,
                boxShadow: `0 4px 20px ${accent}40`,
                justifyContent: "center",
              }}
            >
              <Ic d={I.ai} size={16} color="#fff" style={{ marginRight: 8 }} />
              Launch Autopilot
            </button>

            <div style={{ fontSize: 10, color: dimTextFaint, textAlign: "center", marginTop: 8, ...ff }}>
              NOVA will scan PDFs, detect schedules, generate ROM, and build a complete estimate
            </div>
          </>
        )}
      </div>

      {/* Pulse animation for the NOVA dot */}
      <style>{`
        @keyframes nova-ap-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ProgressView — Phase-by-phase progress indicator
// ═══════════════════════════════════════════════════════════════════════════════
function ProgressView({ phase, progress, message, C, accent, ff, dimText, onAbort }) {
  const phases = Object.keys(PHASE_LABELS);
  const currentIdx = phases.indexOf(phase);

  return (
    <div style={{ padding: "20px 0" }}>
      {/* Phase dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        {phases.map((p, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: isDone ? "#00D4AA" : isCurrent ? accent : `${dimText}40`,
                boxShadow: isCurrent ? `0 0 8px ${accent}80` : "none",
                animation: isCurrent ? "nova-ap-pulse 1.5s ease-in-out infinite" : "none",
                transition: "all 0.3s",
              }} />
              {i < phases.length - 1 && (
                <div style={{
                  width: 16, height: 1,
                  background: isDone ? "#00D4AA50" : `${dimText}20`,
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3, borderRadius: 2,
        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        overflow: "hidden", marginBottom: 16,
      }}>
        <div style={{
          height: "100%", width: `${progress}%`,
          background: `linear-gradient(90deg, ${accent}, #00D4AA)`,
          borderRadius: 2,
          transition: "width 0.5s ease-out",
        }} />
      </div>

      {/* Phase label + message */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4, ...ff }}>
          {PHASE_LABELS[phase] || phase}
        </div>
        <div style={{ fontSize: 12, color: dimText, ...ff }}>
          {message}
        </div>
      </div>

      {/* Abort */}
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <button onClick={onAbort} style={{
          ...bt(C),
          fontSize: 11, padding: "6px 16px",
          color: dimText, justifyContent: "center",
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ResultsView — Estimate summary + knowledge stats
// ═══════════════════════════════════════════════════════════════════════════════
function ResultsView({ result, C, accent, ff, dimText, dimTextFaint, onOpenEstimate, onReset }) {
  const fmt = (n) => {
    if (!n) return "$0";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const nk = result.novaKnowledge || {};
  const ls = result.learningStats || {};

  // Build knowledge summary line
  const knowledgeParts = [];
  if (nk.correctionPatternsApplied > 0)
    knowledgeParts.push(`${nk.correctionPatternsApplied} correction patterns`);
  if (nk.firmPatternsApplied > 0)
    knowledgeParts.push(`${nk.firmPatternsApplied} firm patterns`);
  if (nk.proposalsInBenchmarks > 0)
    knowledgeParts.push(`compared against ${nk.proposalsInBenchmarks} proposals`);
  const knowledgeLine = knowledgeParts.length > 0
    ? `Applied ${knowledgeParts.join(", ")}`
    : "Baseline knowledge applied";

  return (
    <div>
      {/* Estimate range */}
      <div style={{
        ...card(C),
        padding: "20px 24px",
        marginBottom: 16,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: dimText, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", ...ff }}>
          Estimate Range
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: dimTextFaint, ...ff }}>Low</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: dimText, ...ff }}>{fmt(result.totalLow)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: accent, ...ff }}>Mid</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.text, ...ff }}>{fmt(result.totalMid)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: dimTextFaint, ...ff }}>High</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: dimText, ...ff }}>{fmt(result.totalHigh)}</div>
          </div>
        </div>

        {result.perSF > 0 && (
          <div style={{ fontSize: 13, color: accent, marginTop: 8, ...ff }}>
            ${result.perSF.toFixed(2)} / SF
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <StatCard
          label="Confidence" value={`${result.confidence}%`}
          accent={accent} C={C} ff={ff} dimText={dimText}
        />
        <StatCard
          label="Scope Items" value={result.itemCount}
          accent={accent} C={C} ff={ff} dimText={dimText}
        />
        <StatCard
          label="Schedules" value={result.scheduleCount}
          accent={accent} C={C} ff={ff} dimText={dimText}
        />
      </div>

      {/* Knowledge stats */}
      <div style={{
        ...card(C),
        padding: "12px 16px",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Ic d={I.intelligence} size={14} color={accent} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, ...ff }}>NOVA Learning</span>
        </div>
        <div style={{ fontSize: 11, color: dimText, lineHeight: 1.5, ...ff }}>
          {knowledgeLine}
        </div>
        {nk.similarProposalsFound > 0 && (
          <div style={{ fontSize: 11, color: dimText, ...ff }}>
            Found {nk.similarProposalsFound} similar historical proposal{nk.similarProposalsFound !== 1 ? "s" : ""} for benchmarking
          </div>
        )}
        <div style={{ fontSize: 10, color: dimTextFaint, marginTop: 4, ...ff }}>
          Knowledge base: {(nk.knowledgeBaseWords || 0).toLocaleString()} words | {ls.corrections || 0} corrections learned | {result.elapsedFormatted}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onOpenEstimate} style={{
          ...bt(C),
          flex: 1,
          padding: "10px 0",
          fontSize: 13,
          fontWeight: 600,
          background: accent,
          color: "#fff",
          border: "none",
          borderRadius: 10,
          boxShadow: `0 4px 16px ${accent}30`,
          justifyContent: "center",
        }}>
          Open in Estimate
        </button>
        <button onClick={onReset} style={{
          ...bt(C),
          padding: "10px 20px",
          fontSize: 12,
          color: dimText,
          justifyContent: "center",
        }}>
          Run Another
        </button>
      </div>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, C, ff, dimText }) {
  return (
    <div style={{
      ...card(C),
      padding: "10px 12px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: dimText, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2, ...ff }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, ...ff }}>
        {value}
      </div>
    </div>
  );
}
