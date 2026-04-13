// AdminTrainingPage.jsx — Unified Training System admin page
// Shows architecture, model status, every training data point,
// what the model learned from each project, and active learning metrics.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";

// ── Constants ──

const CLASS_META = {
  schedule_table: { color: "#FF4444", label: "Schedule Table", short: "SCH" },
  wall_linear:    { color: "#44FF44", label: "Wall",           short: "WAL" },
  floor_area:     { color: "#4488FF", label: "Floor Area",     short: "FLR" },
  door_window:    { color: "#FF44FF", label: "Door/Window",    short: "D/W" },
  fixture:        { color: "#FFFF44", label: "Fixture",        short: "FIX" },
  annotation:     { color: "#44FFFF", label: "Annotation",     short: "ANN" },
};

const ALL_CLASSES = ["schedule_table", "wall_linear", "floor_area", "door_window", "fixture", "annotation"];

const TIERS = [
  { id: "yolo", num: 1, label: "YOLO v2", sub: "Browser ONNX", speed: "~50ms", cost: "Free", color: "#10B981" },
  { id: "vector", num: 2, label: "Vector", sub: "PyMuPDF API", speed: "~200ms", cost: "Free", color: "#3B82F6" },
  { id: "claude", num: 3, label: "Claude", sub: "Vision API", speed: "~2s", cost: "$0.01/pg", color: "#8B5CF6" },
];

// ── Component ──

export default function AdminTrainingPage() {
  const C = useTheme();
  const T = C.T;

  const [manifest, setManifest] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [modelMeta, setModelMeta] = useState(null);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [expandedProject, setExpandedProject] = useState(null);
  const [expandedIntake, setExpandedIntake] = useState(null);
  const [imageFilter, setImageFilter] = useState("all"); // "all" | class name
  const [tab, setTab] = useState("projects"); // "projects" | "images" | "corpus"

  // Load manifest + model status
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/models/training-manifest.json");
        if (resp.ok) setManifest(await resp.json());
      } catch { /* optional */ }

      try {
        const resp = await fetch("/models/nova_takeoff_v2.onnx", { method: "HEAD" });
        setModelStatus(resp.ok);
      } catch { setModelStatus(false); }

      try {
        const resp = await fetch("/models/nova_takeoff_v2.json");
        if (resp.ok) setModelMeta(await resp.json());
      } catch { /* optional */ }

      try {
        const { getCorrectionStats } = await import("@/utils/trainingFeedback");
        setFeedbackStats(await getCorrectionStats());
      } catch { /* optional */ }
    })();
  }, []);

  // Filtered images for the images tab
  const filteredImages = useMemo(() => {
    if (!manifest?.images) return [];
    if (imageFilter === "all") return manifest.images;
    return manifest.images.filter(img => img.classCounts[imageFilter] > 0);
  }, [manifest, imageFilter]);

  const handleExport = useCallback(async () => {
    try {
      const { downloadTrainingBundle } = await import("@/utils/trainingFeedback");
      await downloadTrainingBundle();
    } catch (err) { console.error("Export failed:", err); }
  }, []);

  // ── Styles ──
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 };
  const lbl = { fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" };
  const mono = { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: C.text };
  const dim = { fontSize: 10, color: C.textMuted, lineHeight: 1.5 };
  const dot = (on) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: on === true ? "#10B981" : on === false ? "#EF4444" : "#F59E0B", boxShadow: on === true ? "0 0 8px rgba(16,185,129,0.5)" : "none" });
  const cs = card(C);
  const classPill = (name, count) => {
    const m = CLASS_META[name] || { color: "#888", short: "?" };
    return (
      <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${m.color}12`, color: m.color, border: `1px solid ${m.color}30`, whiteSpace: "nowrap" }}>
        {m.short} <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>{count.toLocaleString()}</span>
      </span>
    );
  };

  const summary = manifest?.summary || {};

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Training System</h1>
        <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5, maxWidth: 650 }}>
          Every data point used to train the detection model, what it learned, and where it came from.
        </p>
      </div>

      {/* ══════════════════════════════════════ */}
      {/* KPI ROW                               */}
      {/* ══════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { l: "Training Images", v: summary.trainImages, c: C.accent },
          { l: "Validation Images", v: summary.valImages, c: "#3B82F6" },
          { l: "Total Boxes", v: summary.totalBoxes, c: "#10B981" },
          { l: "Source Projects", v: summary.projectCount, c: "#F59E0B" },
          { l: "Avg Boxes/Image", v: summary.avgBoxesPerImage, c: "#8B5CF6" },
        ].map(k => (
          <div key={k.l} style={{ ...cs, padding: "16px 18px" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>{typeof k.v === "number" ? k.v.toLocaleString() : "..."}</div>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* MODEL PERFORMANCE                     */}
      {/* ══════════════════════════════════════ */}
      <div style={{ ...cs, padding: "20px 24px", marginBottom: 20 }}>
        <div style={sectionTitle}>Model Performance</div>
        {manifest?.evaluation?.mAP50 ? (() => {
          const ev = manifest.evaluation;
          const curve = ev.trainingCurve || [];
          // SVG training curve dimensions
          const svgW = 600, svgH = 120, padL = 30, padR = 10, padT = 10, padB = 20;
          const plotW = svgW - padL - padR, plotH = svgH - padT - padB;
          const maxEpoch = Math.max(1, curve.length - 1);

          const makeLine = (data, key, color) => {
            const maxVal = Math.max(0.01, ...data.map(d => d[key] || 0));
            const points = data.map((d, i) => {
              const x = padL + (i / maxEpoch) * plotW;
              const y = padT + plotH - ((d[key] || 0) / maxVal) * plotH;
              return `${x},${y}`;
            }).join(" ");
            return { points, color, maxVal };
          };

          const mAP50Line = makeLine(curve, "mAP50", "#10B981");
          const precLine = makeLine(curve, "precision", "#3B82F6");
          const recLine = makeLine(curve, "recall", "#F59E0B");

          return (
            <>
              {/* Metric KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { l: "mAP@50", v: ev.mAP50, fmt: v => (v * 100).toFixed(1) + "%", c: "#10B981", good: v => v > 0.5 },
                  { l: "mAP@50-95", v: ev.mAP50_95, fmt: v => (v * 100).toFixed(1) + "%", c: "#3B82F6", good: v => v > 0.3 },
                  { l: "Precision", v: ev.precision, fmt: v => (v * 100).toFixed(1) + "%", c: "#8B5CF6", good: v => v > 0.6 },
                  { l: "Recall", v: ev.recall, fmt: v => (v * 100).toFixed(1) + "%", c: "#F59E0B", good: v => v > 0.4 },
                  { l: "Best Epoch", v: ev.bestEpoch, fmt: v => `${v} / ${ev.totalEpochs}`, c: C.textDim, good: () => true },
                ].map(m => (
                  <div key={m.l} style={{ padding: "12px 14px", borderRadius: 6, background: `${m.c}08`, border: `1px solid ${m.c}20`, textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: m.good(m.v) ? m.c : "#EF4444", fontFamily: "IBM Plex Mono, monospace" }}>
                      {m.fmt(m.v)}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{m.l}</div>
                  </div>
                ))}
              </div>

              {/* Training curve SVG */}
              {curve.length > 1 && (
                <div>
                  <div style={{ ...lbl, marginBottom: 6 }}>Training Curve</div>
                  <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ borderRadius: 6, background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.border}` }}>
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                      <line key={pct} x1={padL} y1={padT + plotH * (1 - pct)} x2={padL + plotW} y2={padT + plotH * (1 - pct)} stroke={C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} strokeDasharray="4,4" />
                    ))}
                    {/* mAP50 line */}
                    <polyline points={mAP50Line.points} fill="none" stroke="#10B981" strokeWidth="2" strokeLinejoin="round" />
                    {/* Precision line */}
                    <polyline points={precLine.points} fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4,2" />
                    {/* Recall line */}
                    <polyline points={recLine.points} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4,2" />
                    {/* Epoch labels */}
                    {curve.filter((_, i) => i % Math.max(1, Math.floor(curve.length / 6)) === 0 || i === curve.length - 1).map(d => (
                      <text key={d.epoch} x={padL + (d.epoch / maxEpoch) * plotW} y={svgH - 4} textAnchor="middle" fill={C.textMuted} fontSize="9">{d.epoch}</text>
                    ))}
                    {/* Y-axis label */}
                    <text x={4} y={padT + plotH / 2} textAnchor="middle" fill={C.textMuted} fontSize="8" transform={`rotate(-90, 4, ${padT + plotH / 2})`}>score</text>
                  </svg>
                  {/* Legend */}
                  <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 6 }}>
                    {[{ l: "mAP@50", c: "#10B981", dash: false }, { l: "Precision", c: "#3B82F6", dash: true }, { l: "Recall", c: "#F59E0B", dash: true }].map(leg => (
                      <div key={leg.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke={leg.c} strokeWidth="2" strokeDasharray={leg.dash ? "4,2" : "none"} /></svg>
                        <span style={{ fontSize: 9, color: C.textMuted }}>{leg.l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interpretation */}
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 6, background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6 }}>
                  {ev.mAP50 < 0.3 && <><strong style={{ color: "#F59E0B" }}>Low mAP:</strong> Model needs more diverse training data, especially for empty classes. Auto-label the intake projects and retrain.<br /></>}
                  {ev.recall < 0.3 && <><strong style={{ color: "#F59E0B" }}>Low Recall:</strong> Model misses many objects. Class imbalance (77% fixture) is causing it to under-predict minority classes.<br /></>}
                  {ev.precision > 0.5 && ev.recall < 0.3 && <><strong style={{ color: "#3B82F6" }}>High Precision / Low Recall:</strong> When the model detects something, it&apos;s usually right — but it&apos;s too conservative. More training data will help.</>}
                  {ev.mAP50 >= 0.5 && <><strong style={{ color: "#10B981" }}>Solid performance.</strong> Model is usable for production detection. Active learning will continue improving it.</>}
                </div>
              </div>
            </>
          );
        })() : (
          <div style={{ padding: "20px", textAlign: "center", borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>No evaluation metrics yet</div>
            <div style={{ fontSize: 10, color: C.textDim }}>Train the model to see mAP, precision, recall, and training curves</div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* CLASS DISTRIBUTION BAR                */}
      {/* ══════════════════════════════════════ */}
      <div style={{ ...cs, padding: "20px 24px", marginBottom: 20 }}>
        <div style={sectionTitle}>What It Has Learned — Class Distribution</div>
        {summary.classTotals && (
          <>
            {/* Stacked bar */}
            <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", marginBottom: 12, border: `1px solid ${C.border}` }}>
              {ALL_CLASSES.map(cls => {
                const count = summary.classTotals[cls] || 0;
                const pct = count / Math.max(1, summary.totalBoxes) * 100;
                if (pct < 0.3) return null;
                const m = CLASS_META[cls];
                return (
                  <div key={cls} title={`${m.label}: ${count.toLocaleString()} (${pct.toFixed(1)}%)`} style={{ width: `${pct}%`, background: `${m.color}50`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                    {pct > 5 && <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{m.short}</span>}
                  </div>
                );
              })}
            </div>

            {/* Class breakdown grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {ALL_CLASSES.map(cls => {
                const count = summary.classTotals[cls] || 0;
                const pct = count / Math.max(1, summary.totalBoxes) * 100;
                const m = CLASS_META[cls];
                const isEmpty = count === 0;
                return (
                  <div key={cls} style={{ padding: "10px 8px", borderRadius: 6, background: isEmpty ? "rgba(239,68,68,0.06)" : `${m.color}08`, border: `1px solid ${isEmpty ? "rgba(239,68,68,0.2)" : `${m.color}20`}`, textAlign: "center" }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isEmpty ? "#EF4444" : m.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.short}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: isEmpty ? "#EF4444" : C.text, margin: "2px 0", fontFamily: "IBM Plex Mono, monospace" }}>{count.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: isEmpty ? "#EF4444" : C.textMuted }}>{isEmpty ? "NO DATA" : `${pct.toFixed(1)}%`}</div>
                    <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* PIPELINE + MODEL STATUS (compact)     */}
      {/* ══════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Pipeline tiers */}
        <div style={{ ...cs, padding: "20px 24px" }}>
          <div style={sectionTitle}>Detection Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {TIERS.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 6, background: `${t.color}08`, border: `1px solid ${t.color}20` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${t.color}18`, border: `2px solid ${t.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: t.color, flexShrink: 0 }}>{t.num}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t.label}</div>
                    <div style={{ fontSize: 9, color: C.textMuted }}>{t.sub}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ ...mono, fontSize: 11, color: t.color }}>{t.speed}</span>
                  <span style={{ fontSize: 10, color: t.cost === "Free" ? "#10B981" : "#F59E0B", fontWeight: 600 }}>{t.cost}</span>
                  <span style={dot(t.id === "yolo" ? modelStatus : true)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model status */}
        <div style={{ ...cs, padding: "20px 24px" }}>
          <div style={sectionTitle}>ONNX Model</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={dot(modelStatus)} />
            <span style={{ ...mono, fontSize: 14, fontWeight: 600 }}>nova_takeoff_v2.onnx</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4, marginLeft: "auto", background: modelStatus ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: modelStatus ? "#10B981" : "#F59E0B", border: `1px solid ${modelStatus ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}` }}>
              {modelStatus === null ? "CHECKING" : modelStatus ? "DEPLOYED" : "PENDING"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { l: "Architecture", v: "YOLOv8 Nano" },
              { l: "Input Size", v: "640 x 640" },
              { l: "Classes", v: "6" },
              { l: "ONNX Opset", v: "12" },
            ].map(m => (
              <div key={m.l}><div style={lbl}>{m.l}</div><div style={mono}>{m.v}</div></div>
            ))}
          </div>
          {!modelStatus && modelStatus !== null && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <div style={{ ...mono, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
                <span style={{ color: C.textDim }}>$</span> cd training && python3 autolabel.py<br />
                <span style={{ color: C.textDim }}>$</span> python3 prepare_and_train.py
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════ */}
      {/* SCAN PIPELINE FLOW                    */}
      {/* ══════════════════════════════════════ */}
      <div style={{ ...cs, padding: "20px 24px", marginBottom: 20 }}>
        <div style={sectionTitle}>Scan Pipeline (9 Phases)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {[
            { p: "0", l: "OCR", d: "Text extraction", c: "#6B7280" },
            { p: "0.5", l: "Segment", d: "Layout regions, viewports, title block", c: "#10B981" },
            { p: "1", l: "Detect", d: modelStatus ? "YOLO ($0)" : "Claude ($0.01/pg)", c: modelStatus ? "#10B981" : "#8B5CF6" },
            { p: "1.5", l: "Notes", d: "Drawing notes + conditions", c: "#6B7280" },
            { p: "2", l: "Parse", d: "Claude extracts schedule rows", c: "#8B5CF6" },
            { p: "2.3", l: "Count", d: "Count marks on floor plans", c: "#8B5CF6" },
            { p: "3", l: "ROM", d: "Cost estimate from schedules", c: "#F59E0B" },
            { p: "3.5", l: "Scope", d: "Map schedules to scope items", c: "#F59E0B" },
            { p: "1.7", l: "Title Block", d: "Project name, architect", c: "#6B7280" },
          ].map(ph => (
            <div key={ph.p} style={{ padding: "8px 6px", borderRadius: 6, background: `${ph.c}0A`, border: `1px solid ${ph.c}20`, textAlign: "center" }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: ph.c, textTransform: "uppercase", letterSpacing: "0.1em" }}>Phase {ph.p}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, margin: "2px 0" }}>{ph.l}</div>
              <div style={{ fontSize: 8, color: C.textMuted, lineHeight: 1.3 }}>{ph.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════ */}
      {/* DATA EXPLORER TABS                    */}
      {/* ══════════════════════════════════════ */}
      <div style={{ ...cs, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={sectionTitle}>Training Data Explorer</div>
          <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 6, padding: 2 }}>
            {[
              { id: "projects", label: `Projects (${manifest?.projects?.length || 0})` },
              { id: "images", label: `Images (${manifest?.images?.length || 0})` },
              { id: "corpus", label: "Cost Corpus" },
              { id: "intake", label: `Intake (${manifest?.intake?.length || 0})` },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "5px 14px", fontSize: 11, fontWeight: tab === t.id ? 600 : 500, borderRadius: 5,
                border: "none", cursor: "pointer", fontFamily: T.font.sans,
                background: tab === t.id ? C.accent : "transparent",
                color: tab === t.id ? "#fff" : C.textMuted,
                transition: "all 0.15s",
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── Projects Tab ── */}
        {tab === "projects" && manifest?.projects && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {manifest.projects.map(proj => {
              const isExpanded = expandedProject === proj.name;
              const projImages = isExpanded ? manifest.images.filter(i => i.project === proj.name) : [];
              return (
                <div key={proj.name}>
                  <div
                    onClick={() => setExpandedProject(isExpanded ? null : proj.name)}
                    style={{ padding: "14px 16px", borderRadius: 8, cursor: "pointer", background: C.bg2, border: `1px solid ${isExpanded ? C.accent + "40" : C.border}`, transition: "all 0.15s" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: C.textMuted, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u25B6"}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{proj.name}</div>
                          <div style={{ fontSize: 10, color: C.textMuted }}>
                            Pages {proj.pageRange[0]}{"\u2013"}{proj.pageRange[1]}
                            {" \u00B7 "}{proj.train} train / {proj.val} val
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ ...mono, fontSize: 18, fontWeight: 700 }}>{proj.images}</div>
                          <div style={{ fontSize: 8, color: C.textMuted, fontWeight: 600, textTransform: "uppercase" }}>images</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ ...mono, fontSize: 18, fontWeight: 700 }}>{proj.boxes.toLocaleString()}</div>
                          <div style={{ fontSize: 8, color: C.textMuted, fontWeight: 600, textTransform: "uppercase" }}>boxes</div>
                        </div>
                      </div>
                    </div>

                    {/* Class pills */}
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {ALL_CLASSES.map(cls => {
                        const count = proj.classCounts[cls] || 0;
                        if (count === 0) return null;
                        return classPill(cls, count);
                      })}
                      {ALL_CLASSES.filter(cls => !proj.classCounts[cls]).map(cls => {
                        const m = CLASS_META[cls];
                        return (
                          <span key={cls} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(239,68,68,0.06)", color: "rgba(239,68,68,0.4)", border: "1px solid rgba(239,68,68,0.15)", whiteSpace: "nowrap", textDecoration: "line-through" }}>
                            {m.short} 0
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expanded: image list */}
                  {isExpanded && (
                    <div style={{ marginLeft: 28, marginTop: 4, marginBottom: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px repeat(6, 42px)", gap: 0, padding: "6px 12px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}` }}>
                        <div>Filename</div>
                        <div style={{ textAlign: "center" }}>Split</div>
                        <div style={{ textAlign: "center" }}>Boxes</div>
                        {ALL_CLASSES.map(cls => <div key={cls} style={{ textAlign: "center", color: CLASS_META[cls].color }}>{CLASS_META[cls].short}</div>)}
                      </div>
                      <div style={{ maxHeight: 320, overflowY: "auto" }}>
                        {projImages.map(img => (
                          <div key={img.filename} style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px repeat(6, 42px)", gap: 0, padding: "5px 12px", fontSize: 11, borderBottom: `1px solid ${C.border}08`, alignItems: "center" }}>
                            <div style={{ ...mono, fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.filename}</div>
                            <div style={{ textAlign: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: img.split === "train" ? "rgba(16,185,129,0.1)" : "rgba(59,130,246,0.1)", color: img.split === "train" ? "#10B981" : "#3B82F6" }}>{img.split}</span>
                            </div>
                            <div style={{ ...mono, fontSize: 11, textAlign: "center", fontWeight: 600 }}>{img.boxes}</div>
                            {ALL_CLASSES.map(cls => {
                              const v = img.classCounts[cls] || 0;
                              return <div key={cls} style={{ ...mono, fontSize: 10, textAlign: "center", color: v > 0 ? CLASS_META[cls].color : `${C.textMuted}30` }}>{v || "\u00B7"}</div>;
                            })}
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: "8px 12px", fontSize: 10, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>
                        {projImages.length} images{" \u00B7 "}
                        {projImages.reduce((s, i) => s + i.boxes, 0).toLocaleString()} total boxes{" \u00B7 "}
                        avg {(projImages.reduce((s, i) => s + i.boxes, 0) / Math.max(1, projImages.length)).toFixed(1)} boxes/image
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Images Tab ── */}
        {tab === "images" && manifest?.images && (
          <div>
            {/* Class filter */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => setImageFilter("all")} style={{ padding: "4px 10px", fontSize: 10, fontWeight: imageFilter === "all" ? 600 : 500, borderRadius: 4, border: "none", cursor: "pointer", fontFamily: T.font.sans, background: imageFilter === "all" ? C.accent : C.bg2, color: imageFilter === "all" ? "#fff" : C.textMuted }}>All ({manifest.images.length})</button>
              {ALL_CLASSES.map(cls => {
                const count = manifest.images.filter(i => (i.classCounts[cls] || 0) > 0).length;
                const m = CLASS_META[cls];
                return (
                  <button key={cls} onClick={() => setImageFilter(cls)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: imageFilter === cls ? 600 : 500, borderRadius: 4, border: `1px solid ${imageFilter === cls ? m.color + "50" : C.border}`, cursor: "pointer", fontFamily: T.font.sans, background: imageFilter === cls ? `${m.color}15` : C.bg2, color: imageFilter === cls ? m.color : C.textMuted }}>
                    {m.short} ({count})
                  </button>
                );
              })}
            </div>

            {/* Image table */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 60px 50px repeat(6, 42px)", gap: 0, padding: "6px 12px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}` }}>
              <div>Filename</div>
              <div>Project</div>
              <div style={{ textAlign: "center" }}>Split</div>
              <div style={{ textAlign: "center" }}>Boxes</div>
              {ALL_CLASSES.map(cls => <div key={cls} style={{ textAlign: "center", color: CLASS_META[cls].color }}>{CLASS_META[cls].short}</div>)}
            </div>
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {filteredImages.map(img => (
                <div key={img.filename} style={{ display: "grid", gridTemplateColumns: "1fr 140px 60px 50px repeat(6, 42px)", gap: 0, padding: "5px 12px", fontSize: 11, borderBottom: `1px solid ${C.border}08`, alignItems: "center" }}>
                  <div style={{ ...mono, fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.filename}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.project}</div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: img.split === "train" ? "rgba(16,185,129,0.1)" : "rgba(59,130,246,0.1)", color: img.split === "train" ? "#10B981" : "#3B82F6" }}>{img.split}</span>
                  </div>
                  <div style={{ ...mono, fontSize: 11, textAlign: "center", fontWeight: 600 }}>{img.boxes}</div>
                  {ALL_CLASSES.map(cls => {
                    const v = img.classCounts[cls] || 0;
                    return <div key={cls} style={{ ...mono, fontSize: 10, textAlign: "center", color: v > 0 ? CLASS_META[cls].color : `${C.textMuted}30` }}>{v || "\u00B7"}</div>;
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 12px", fontSize: 10, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>
              Showing {filteredImages.length} of {manifest.images.length} images{" \u00B7 "}
              {filteredImages.reduce((s, i) => s + i.boxes, 0).toLocaleString()} boxes
            </div>
          </div>
        )}

        {/* ── Corpus Tab ── */}
        {tab === "corpus" && (
          <div>
            <div style={{ ...dim, marginBottom: 14 }}>
              Historical estimates from Dropbox — feeds the ROM engine cost benchmarks. These are cost data, not visual detection training.
            </div>

            {manifest?.corpus?.projects?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Projects ({manifest.corpus.projects.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {manifest.corpus.projects.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 4, background: C.bg2, border: `1px solid ${C.border}` }}>
                      <span style={{ ...mono, fontSize: 11, color: C.accent, fontWeight: 600, minWidth: 60 }}>{p.split(" - ")[0]}</span>
                      <span style={{ fontSize: 12, color: C.text }}>{p.split(" - ").slice(1).join(" - ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {manifest?.corpus?.sources?.length > 0 && (
              <div>
                <div style={{ ...lbl, marginBottom: 8 }}>Data Tables ({manifest.corpus.sources.length})</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 0 }}>
                  <div style={{ padding: "4px 12px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>File</div>
                  <div style={{ padding: "4px 12px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>Rows</div>
                  {manifest.corpus.sources.map(s => (
                    <div key={s.file} style={{ display: "contents" }}>
                      <div style={{ ...mono, fontSize: 11, padding: "6px 12px", borderBottom: `1px solid ${C.border}08`, color: C.accent }}>{s.file}</div>
                      <div style={{ ...mono, fontSize: 11, padding: "6px 12px", borderBottom: `1px solid ${C.border}08`, textAlign: "right" }}>{s.rows.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                {manifest.corpus.totalLineItems > 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 10, color: C.textMuted, borderTop: `1px solid ${C.border}` }}>
                    {manifest.corpus.totalLineItems.toLocaleString()} estimate line items across {manifest.corpus.projects?.length || 0} projects
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Intake Tab ── */}
        {tab === "intake" && manifest?.intake && (
          <div>
            <div style={{ ...dim, marginBottom: 14 }}>
              Blueprint plan sets ready for auto-labeling. These fill the schedule_table and door_window gaps in the training data.
              Run <code style={{ ...mono, fontSize: 10, padding: "1px 6px", borderRadius: 3, background: C.bg2 }}>python3 autolabel.py</code> to process them.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {manifest.intake.map(proj => {
                const isExpanded = expandedIntake === proj.name;
                return (
                  <div key={proj.name} onClick={() => setExpandedIntake(isExpanded ? null : proj.name)} style={{ padding: "14px 16px", borderRadius: 8, cursor: "pointer", background: C.bg2, border: `1px solid ${C.border}`, transition: "all 0.15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, color: C.textMuted, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u25B6"}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{proj.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>{proj.pdfCount}</span>
                        <span style={{ fontSize: 9, color: C.textMuted }}>PDFs</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "rgba(59,130,246,0.1)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.2)" }}>READY</span>
                      </div>
                    </div>
                    {isExpanded && proj.pdfs.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 3 }}>
                        {proj.pdfs.map(pdf => (
                          <div key={pdf} style={{ ...mono, fontSize: 10, color: C.textDim, padding: "4px 8px", borderRadius: 3, background: C.bg3 }}>
                            {pdf}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* ACTIVE LEARNING                       */}
      {/* ══════════════════════════════════════ */}
      <div style={{ ...cs, padding: "20px 24px" }}>
        <div style={sectionTitle}>Active Learning Loop</div>
        {feedbackStats && feedbackStats.total > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 24 }}>
              <div><div style={lbl}>Corrections</div><div style={mono}>{feedbackStats.total}</div></div>
              <div><div style={lbl}>Unexported</div><div style={{ ...mono, color: feedbackStats.unexported > 0 ? "#F59E0B" : C.text }}>{feedbackStats.unexported}</div></div>
              <div><div style={lbl}>Drawings</div><div style={mono}>{feedbackStats.drawings}</div></div>
            </div>
            {feedbackStats.unexported > 0 && (
              <button onClick={handleExport} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, background: C.accent, color: "#fff", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: T.font.sans }}>Export Training Data</button>
            )}
          </div>
        ) : (
          <div style={{ ...dim, marginBottom: 14, padding: "10px 14px", borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}` }}>
            No corrections recorded yet. When users adjust detections in scan results, corrections are captured automatically.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "14px 0" }}>
          {["Deploy Model", "Users Scan", "Review + Correct", "Export Labels", "Retrain"].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, padding: "5px 10px", borderRadius: 5, background: i === 0 ? "rgba(16,185,129,0.12)" : C.bg2, color: i === 0 ? "#10B981" : C.textDim, border: `1px solid ${i === 0 ? "rgba(16,185,129,0.3)" : C.border}`, whiteSpace: "nowrap" }}>{s}</div>
              {i < 4 && <span style={{ fontSize: 12, color: C.textMuted }}>{"\u2192"}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
