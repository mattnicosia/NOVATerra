// TrainingSystemPanel.jsx — Unified Training System architecture visualization
// Shows the 3-tier detection pipeline, model status, training data stats,
// and active learning feedback metrics in the Settings/Admin page.

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";
import Sec from "@/components/shared/Sec";

// ── Tier configuration ──
const TIERS = [
  {
    id: "yolo",
    label: "YOLO v2",
    sublabel: "Browser ONNX",
    icon: "\u26A1",
    color: "#10B981",
    speed: "~50ms",
    cost: "$0",
    desc: "YOLOv8 Nano via onnxruntime-web. Detects schedule tables, walls, doors, windows, fixtures, annotations. Runs entirely in-browser.",
  },
  {
    id: "vector",
    label: "Vector",
    sublabel: "PyMuPDF API",
    icon: "\u2B21",
    color: "#3B82F6",
    speed: "~200ms",
    cost: "$0",
    desc: "PDF vector geometry extraction via Render-hosted PyMuPDF. Returns precise wall line segments and room polygons from PDF paths.",
  },
  {
    id: "claude",
    label: "Claude",
    sublabel: "Vision API",
    icon: "\u2728",
    color: "#8B5CF6",
    speed: "~2s",
    cost: "$0.01/pg",
    desc: "Claude Haiku for schedule detection + parsing, Sonnet for interpretation. Used as fallback when YOLO unavailable, or for Phase 2 parsing.",
  },
];

const CLASSES = [
  { id: 0, name: "schedule_table", color: "#FF4444", icon: "\u2593" },
  { id: 1, name: "wall_linear", color: "#44FF44", icon: "\u2502" },
  { id: 2, name: "floor_area", color: "#4488FF", icon: "\u2592" },
  { id: 3, name: "door_window", color: "#FF44FF", icon: "\u25AF" },
  { id: 4, name: "fixture", color: "#FFFF44", icon: "\u25CB" },
  { id: 5, name: "annotation", color: "#44FFFF", icon: "\u2190" },
];

export default function TrainingSystemPanel() {
  const C = useTheme();
  const T = C.T;

  const [modelStatus, setModelStatus] = useState(null); // null = checking, true/false
  const [modelMeta, setModelMeta] = useState(null);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [expanded, setExpanded] = useState(null); // which tier is expanded

  // Check model availability + load metadata
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/models/nova_takeoff_v2.onnx", { method: "HEAD" });
        setModelStatus(resp.ok);
      } catch {
        setModelStatus(false);
      }

      try {
        const resp = await fetch("/models/nova_takeoff_v2.json");
        if (resp.ok) setModelMeta(await resp.json());
      } catch { /* optional */ }

      try {
        const { getCorrectionStats } = await import("@/utils/trainingFeedback");
        const stats = await getCorrectionStats();
        setFeedbackStats(stats);
      } catch { /* optional */ }
    })();
  }, []);

  const handleExportFeedback = useCallback(async () => {
    try {
      const { downloadTrainingBundle } = await import("@/utils/trainingFeedback");
      await downloadTrainingBundle();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, []);

  // ── Styles ──
  const labelSt = {
    fontSize: 9,
    fontWeight: 700,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  const valueSt = {
    fontSize: 12,
    color: C.text,
    fontFamily: "IBM Plex Mono, monospace",
  };

  const dimSt = {
    fontSize: 10,
    color: C.textMuted,
  };

  const cardSt = (active, color) => ({
    padding: "14px 16px",
    borderRadius: T.radius.sm,
    background: active ? `${color}12` : C.bg2,
    border: `1px solid ${active ? `${color}40` : C.border}`,
    cursor: "pointer",
    transition: "all 0.2s ease",
  });

  const pipeSt = {
    width: 2,
    height: 20,
    background: C.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    margin: "0 auto",
    position: "relative",
  };

  const arrowSt = {
    fontSize: 9,
    color: C.textMuted,
    textAlign: "center",
    lineHeight: 1,
  };

  const statusDot = (active) => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: active ? "#10B981" : active === false ? "#EF4444" : "#F59E0B",
    marginRight: 6,
    boxShadow: active ? "0 0 6px rgba(16,185,129,0.5)" : "none",
  });

  return (
    <Sec title="Training System">
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 16 }}>
        Unified detection pipeline — YOLO runs free in-browser, Claude is the paid fallback.
        When the ONNX model is deployed, Phase 1 scan detection costs drop to $0.
      </div>

      {/* ── Architecture Diagram ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...labelSt, marginBottom: 10 }}>Detection Pipeline</div>

        {/* Tier cards with flow arrows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, alignItems: "center" }}>
          {TIERS.map((tier, i) => (
            <div key={tier.id} style={{ width: "100%" }}>
              {/* Tier card */}
              <div
                style={cardSt(
                  tier.id === "yolo" ? modelStatus : tier.id === "vector" ? true : true,
                  tier.color
                )}
                onClick={() => setExpanded(expanded === tier.id ? null : tier.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Tier number badge */}
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: `${tier.color}20`, border: `2px solid ${tier.color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: tier.color,
                    }}>
                      {i + 1}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{tier.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{tier.label}</span>
                        <span style={{ fontSize: 10, color: C.textMuted, fontStyle: "italic" }}>{tier.sublabel}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {/* Speed */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...labelSt, fontSize: 8 }}>Speed</div>
                      <div style={{ ...valueSt, fontSize: 11, color: tier.color }}>{tier.speed}</div>
                    </div>
                    {/* Cost */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...labelSt, fontSize: 8 }}>Cost</div>
                      <div style={{ ...valueSt, fontSize: 11, color: tier.cost === "$0" ? "#10B981" : "#F59E0B" }}>{tier.cost}</div>
                    </div>
                    {/* Status */}
                    <div>
                      {tier.id === "yolo" && <span style={statusDot(modelStatus)} />}
                      {tier.id === "vector" && <span style={statusDot(true)} />}
                      {tier.id === "claude" && <span style={statusDot(true)} />}
                    </div>
                  </div>
                </div>

                {/* Expanded description */}
                {expanded === tier.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, ...dimSt, lineHeight: 1.5 }}>
                    {tier.desc}
                  </div>
                )}
              </div>

              {/* Flow arrow between tiers */}
              {i < TIERS.length - 1 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0" }}>
                  <div style={pipeSt} />
                  <div style={arrowSt}>
                    {i === 0 ? "fallback if model unavailable" : "fallback / complement"}
                  </div>
                  <div style={{ ...pipeSt, marginBottom: 2 }}>
                    <div style={{
                      position: "absolute", bottom: -3, left: "50%", transform: "translateX(-50%)",
                      width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
                      borderTop: `5px solid ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                    }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scan Flow ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...labelSt, marginBottom: 10 }}>Scan Pipeline Flow</div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
        }}>
          {[
            { phase: "Phase 0", label: "OCR", detail: "Text extraction", color: "#6B7280" },
            { phase: "Phase 1", label: "Detect", detail: modelStatus ? "YOLO ($0)" : "Claude ($0.01/pg)", color: modelStatus ? "#10B981" : "#8B5CF6" },
            { phase: "Phase 2", label: "Parse", detail: "Claude Haiku", color: "#8B5CF6" },
            { phase: "Phase 3", label: "ROM", detail: "Cost engine", color: "#F59E0B" },
          ].map(p => (
            <div key={p.phase} style={{
              padding: "10px 8px", borderRadius: T.radius.sm,
              background: `${p.color}10`, border: `1px solid ${p.color}30`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {p.phase}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "2px 0" }}>{p.label}</div>
              <div style={{ fontSize: 9, color: C.textMuted }}>{p.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Model Status ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...labelSt, marginBottom: 10 }}>ONNX Model</div>
        <div style={{
          padding: "14px 16px", borderRadius: T.radius.sm,
          background: C.bg2, border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={statusDot(modelStatus)} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                nova_takeoff_v2.onnx
              </span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
              background: modelStatus ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
              color: modelStatus ? "#10B981" : "#F59E0B",
            }}>
              {modelStatus === null ? "CHECKING" : modelStatus ? "DEPLOYED" : "PENDING TRAINING"}
            </span>
          </div>

          {modelMeta && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <div style={labelSt}>Input Size</div>
                <div style={valueSt}>{modelMeta.input_size}x{modelMeta.input_size}</div>
              </div>
              <div>
                <div style={labelSt}>Classes</div>
                <div style={valueSt}>{modelMeta.num_classes}</div>
              </div>
              <div>
                <div style={labelSt}>Training Images</div>
                <div style={valueSt}>{modelMeta.training?.dataset_images || "—"}</div>
              </div>
            </div>
          )}

          {!modelStatus && modelStatus !== null && (
            <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 4, background: `rgba(245,158,11,0.08)`, border: `1px solid rgba(245,158,11,0.2)` }}>
              <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 600, marginBottom: 4 }}>To activate YOLO detection:</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.6 }}>
                cd training<br />
                python3 autolabel.py --visualize<br />
                python3 prepare_and_train.py<br />
                <span style={{ color: C.textDim }}># Model auto-deploys to app/public/models/</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 6-Class System ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...labelSt, marginBottom: 10 }}>Detection Classes (6)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {CLASSES.map(cls => (
            <div key={cls.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              borderRadius: T.radius.sm, background: C.bg2, border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 4,
                background: `${cls.color}20`, border: `2px solid ${cls.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: cls.color, fontWeight: 800,
              }}>
                {cls.id}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{cls.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active Learning ── */}
      <div>
        <div style={{ ...labelSt, marginBottom: 10 }}>Active Learning</div>
        <div style={{
          padding: "14px 16px", borderRadius: T.radius.sm,
          background: C.bg2, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
            User corrections to YOLO detections are captured and can be exported as training data for model retraining.
          </div>

          {feedbackStats ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={labelSt}>Corrections</div>
                  <div style={valueSt}>{feedbackStats.total}</div>
                </div>
                <div>
                  <div style={labelSt}>Unexported</div>
                  <div style={valueSt}>{feedbackStats.unexported}</div>
                </div>
                <div>
                  <div style={labelSt}>Drawings</div>
                  <div style={valueSt}>{feedbackStats.drawings}</div>
                </div>
              </div>

              {feedbackStats.unexported > 0 && (
                <button
                  onClick={handleExportFeedback}
                  style={bt(C, {
                    padding: "6px 14px", fontSize: 11, fontWeight: 600,
                    background: C.accent, color: "#fff", borderRadius: T.radius.sm,
                  })}
                >
                  Export Training Data
                </button>
              )}
            </div>
          ) : (
            <div style={dimSt}>No corrections recorded yet. Corrections are captured when users adjust YOLO detections in the scan results.</div>
          )}

          {/* Feedback loop diagram */}
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {["Deploy Model", "Users Correct", "Export Labels", "Retrain", "Deploy Better Model"].map((step, i) => (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  fontSize: 9, fontWeight: 600, color: i === 0 || i === 4 ? "#10B981" : C.textDim,
                  padding: "3px 8px", borderRadius: 4,
                  background: i === 0 || i === 4 ? "rgba(16,185,129,0.1)" : C.bg3,
                  border: `1px solid ${i === 0 || i === 4 ? "rgba(16,185,129,0.3)" : C.border}`,
                  whiteSpace: "nowrap",
                }}>
                  {step}
                </div>
                {i < 4 && <span style={{ fontSize: 10, color: C.textMuted }}>\u2192</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sec>
  );
}
