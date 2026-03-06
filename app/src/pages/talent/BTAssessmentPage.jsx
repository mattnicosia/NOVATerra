import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBTAssessmentStore } from "@/stores/btAssessmentStore";
import {
  BT_MODULES,
  BT_P0_MODULE_KEYS,
  BT_BRAND,
  BT_COLORS,
  BT_CERT_LEVELS,
  BT_GRADE_SCALE,
} from "@/constants/btBrand";
import { card, accentButton, sectionLabel } from "@/utils/styles";

import ModuleIntro from "@/components/talent/assessment/ModuleIntro";
import AssessmentShell from "@/components/talent/assessment/AssessmentShell";
import CognitiveModule from "@/components/talent/assessment/CognitiveModule";
import BehavioralModule from "@/components/talent/assessment/BehavioralModule";

// ── Module icon map (simple SVG-free text icons) ──
const MODULE_ICONS = {
  brain: "\u{1F9E0}",
  user: "\u{1F464}",
  scale: "\u2696\uFE0F",
  message: "\u{1F4AC}",
  ruler: "\u{1F4D0}",
  monitor: "\u{1F5A5}\uFE0F",
};

// ── Helper: format seconds → "X min" ──
function formatTime(seconds) {
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

// ── Helper: get certification from score ──
function getCertFromScore(score) {
  if (score == null) return null;
  const entries = Object.entries(BT_CERT_LEVELS);
  for (const [, cert] of entries) {
    if (score >= cert.min && score <= cert.max) return cert;
  }
  if (score > 100) return BT_CERT_LEVELS.master;
  return null;
}

// ── Helper: get grade from score ──
function getGradeFromScore(score) {
  if (score == null) return "N/A";
  for (const g of BT_GRADE_SCALE) {
    if (score >= g.min) return g.grade;
  }
  return "F";
}

export default function BTAssessmentPage() {
  const C = useTheme();
  const T = C.T;

  const status = useBTAssessmentStore(s => s.status);
  const activeModule = useBTAssessmentStore(s => s.activeModule);
  const completedModules = useBTAssessmentStore(s => s.completedModules);
  const moduleScores = useBTAssessmentStore(s => s.moduleScores);
  const overallScore = useBTAssessmentStore(s => s.overallScore);
  const overallGrade = useBTAssessmentStore(s => s.overallGrade);
  const behavioralProfile = useBTAssessmentStore(s => s.behavioralProfile);
  const startAssessment = useBTAssessmentStore(s => s.startAssessment);
  const startModule = useBTAssessmentStore(s => s.startModule);
  const getNextModule = useBTAssessmentStore(s => s.getNextModule);

  // Track whether we're showing "module complete" interstitial
  const [showModuleComplete, setShowModuleComplete] = useState(false);
  const [justCompletedKey, setJustCompletedKey] = useState(null);

  // Track whether we're showing module intro
  const [showIntro, setShowIntro] = useState(false);
  const [introModuleKey, setIntroModuleKey] = useState(null);

  // P0 and P1 module lists
  const p0Modules = useMemo(() => BT_P0_MODULE_KEYS.map(k => BT_MODULES[k]), []);
  const p1Modules = useMemo(
    () =>
      Object.values(BT_MODULES)
        .filter(m => !m.p0)
        .sort((a, b) => a.order - b.order),
    [],
  );

  // Total estimated time
  const totalTimeMins = useMemo(() => Math.round(p0Modules.reduce((sum, m) => sum + m.timeLimit, 0) / 60), [p0Modules]);

  // Cert object for results
  const certObj = useMemo(() => getCertFromScore(overallScore), [overallScore]);

  // ── Handler: module completed callback (from AssessmentShell) ──
  const handleModuleCompleted = moduleKey => {
    setJustCompletedKey(moduleKey);
    setShowModuleComplete(true);
    setShowIntro(false);
  };

  // ── Handler: continue to next module ──
  const handleContinue = () => {
    setShowModuleComplete(false);
    setJustCompletedKey(null);
    const next = getNextModule();
    if (next) {
      setIntroModuleKey(next);
      setShowIntro(true);
    }
    // If no next module, the store will set status to 'completed'
  };

  // ── Handler: begin assessment → show first module intro ──
  const handleBeginAssessment = () => {
    startAssessment();
    const first = BT_P0_MODULE_KEYS[0];
    setIntroModuleKey(first);
    setShowIntro(true);
  };

  // ── Handler: start module from intro ──
  const handleStartModule = moduleKey => {
    setShowIntro(false);
    setIntroModuleKey(null);
    startModule(moduleKey);
  };

  // ── Render: Active Module ──
  if (status === "in_progress" && activeModule) {
    const ModuleComponent = activeModule === "cognitive" ? CognitiveModule : BehavioralModule;
    return (
      <div style={pageWrapper(T)}>
        <AssessmentShell onModuleComplete={() => handleModuleCompleted(activeModule)}>
          <ModuleComponent />
        </AssessmentShell>
      </div>
    );
  }

  // ── Render: Module Complete Interstitial ──
  if (status === "in_progress" && showModuleComplete && justCompletedKey) {
    const mod = BT_MODULES[justCompletedKey];
    const score = moduleScores[justCompletedKey];
    const allDone = BT_P0_MODULE_KEYS.every(k => completedModules.includes(k) || k === justCompletedKey);

    return (
      <div style={pageWrapper(T)}>
        <div style={centeredCard(C, T)}>
          <div
            style={{
              fontSize: T.fontSize.xl,
              fontWeight: T.fontWeight.bold,
              color: C.text,
              textAlign: "center",
              marginBottom: T.space[2],
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Module Complete
          </div>
          <div
            style={{
              fontSize: T.fontSize.md,
              color: C.textMuted,
              textAlign: "center",
              marginBottom: T.space[5],
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {mod.label}
          </div>

          {/* Score display (only for auto-scored modules) */}
          {score && score.pct != null && justCompletedKey !== "behavioral" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: T.space[4],
                marginBottom: T.space[5],
              }}
            >
              <div
                style={{
                  fontSize: 48,
                  fontWeight: T.fontWeight.heavy,
                  color: BT_COLORS.primary,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {Math.round(score.pct)}%
              </div>
              <div
                style={{
                  fontSize: T.fontSize.lg,
                  fontWeight: T.fontWeight.semibold,
                  color: C.textMuted,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {score.grade || getGradeFromScore(score.pct)}
              </div>
            </div>
          )}

          {/* Behavioral: show a brief "responses recorded" message */}
          {justCompletedKey === "behavioral" && (
            <div
              style={{
                fontSize: T.fontSize.base,
                color: BT_COLORS.success,
                textAlign: "center",
                marginBottom: T.space[5],
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Responses recorded successfully
            </div>
          )}

          <button
            onClick={handleContinue}
            style={accentButton(C, {
              width: "100%",
              justifyContent: "center",
              padding: "12px 18px",
              fontSize: T.fontSize.md,
              background: `linear-gradient(135deg, ${BT_COLORS.primary}, #9B7DFC)`,
            })}
          >
            {allDone ? "View Results" : "Continue to Next Module"}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Module Intro ──
  if (status === "in_progress" && showIntro && introModuleKey) {
    const mod = BT_MODULES[introModuleKey];
    return (
      <div style={pageWrapper(T)}>
        <ModuleIntro moduleKey={introModuleKey} module={mod} onStart={() => handleStartModule(introModuleKey)} />
      </div>
    );
  }

  // ── Render: Assessment Complete ──
  if (status === "completed") {
    return (
      <div style={pageWrapper(T)}>
        <div style={centeredCard(C, T, { maxWidth: 800 })}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: T.space[6] }}>
            <div
              style={{
                fontSize: T.fontSize.sm,
                color: BT_COLORS.success,
                fontWeight: T.fontWeight.semibold,
                textTransform: "uppercase",
                letterSpacing: 2,
                marginBottom: T.space[2],
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Assessment Complete
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: T.fontWeight.heavy,
                color: C.text,
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: T.space[1],
              }}
            >
              {BT_BRAND.name} Results
            </div>

            {/* Congratulatory message */}
            {certObj && (
              <div
                style={{
                  fontSize: T.fontSize.base,
                  color: C.textMuted,
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: T.lineHeight.relaxed,
                  marginTop: T.space[2],
                }}
              >
                {overallScore >= 96
                  ? "Outstanding performance. You have demonstrated mastery-level estimating capability."
                  : overallScore >= 90
                    ? "Excellent results. Your expertise in construction estimating is clearly evident."
                    : overallScore >= 80
                      ? "Strong performance. You have demonstrated solid estimating proficiency."
                      : overallScore >= 70
                        ? "Good work. You have met the certification threshold for construction estimating."
                        : "Thank you for completing the assessment. Review your results below."}
              </div>
            )}
          </div>

          {/* Score + Certification row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: T.space[7],
              marginBottom: T.space[7],
              flexWrap: "wrap",
            }}
          >
            {/* Overall score */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: T.fontWeight.heavy,
                  color: BT_COLORS.primary,
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1,
                }}
              >
                {overallScore != null ? Math.round(overallScore) : "--"}%
              </div>
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  color: C.textDim,
                  marginTop: T.space[1],
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Overall Score
              </div>
            </div>

            {/* Grade */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: T.fontWeight.heavy,
                  color: C.text,
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1,
                }}
              >
                {overallGrade || "--"}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  color: C.textDim,
                  marginTop: T.space[1],
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Grade
              </div>
            </div>

            {/* Certification badge */}
            {certObj && (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: T.radius.full,
                    background: `${certObj.color}18`,
                    border: `2px solid ${certObj.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    boxShadow: `0 0 20px ${certObj.color}25`,
                  }}
                >
                  <span
                    style={{
                      fontSize: T.fontSize.lg,
                      fontWeight: T.fontWeight.heavy,
                      color: certObj.color,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {certObj.badge[0]}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.sm,
                    fontWeight: T.fontWeight.semibold,
                    color: certObj.color,
                    marginTop: T.space[2],
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {certObj.badge}
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textDim,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {certObj.label}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              marginBottom: T.space[5],
            }}
          />

          {/* Per-module breakdown */}
          <div style={{ marginBottom: T.space[6] }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Module Breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
              {BT_P0_MODULE_KEYS.map(key => {
                const mod = BT_MODULES[key];
                const score = moduleScores[key];
                const pct = score?.pct != null ? Math.round(score.pct) : null;
                const grade = score?.grade || (pct != null ? getGradeFromScore(pct) : "N/A");

                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: `${T.space[3]}px ${T.space[4]}px`,
                      background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      borderRadius: T.radius.sm,
                      border: `1px solid ${C.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                      <span style={{ fontSize: 16 }}>{MODULE_ICONS[mod.icon] || ""}</span>
                      <span
                        style={{
                          fontSize: T.fontSize.base,
                          fontWeight: T.fontWeight.medium,
                          color: C.text,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {mod.label}
                      </span>
                      <span
                        style={{
                          fontSize: T.fontSize.xs,
                          color: C.textDim,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        ({Math.round(mod.weight * 100)}%)
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
                      {pct != null && (
                        <span
                          style={{
                            fontSize: T.fontSize.md,
                            fontWeight: T.fontWeight.bold,
                            color: BT_COLORS.primary,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {pct}%
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.semibold,
                          color: C.textMuted,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {grade}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Behavioral profile bars */}
          {behavioralProfile?.dimensionScores && (
            <div style={{ marginBottom: T.space[6] }}>
              <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Behavioral Profile</div>
              <div style={{ display: "flex", flexDirection: "column", gap: T.space[3] }}>
                {Object.entries(behavioralProfile.dimensionScores).map(([dim, score]) => (
                  <div key={dim}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: T.space[1],
                      }}
                    >
                      <span
                        style={{
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.medium,
                          color: C.text,
                          textTransform: "capitalize",
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {dim.replace(/_/g, " ")}
                      </span>
                      <span
                        style={{
                          fontSize: T.fontSize.sm,
                          fontWeight: T.fontWeight.semibold,
                          color: C.textMuted,
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {Math.round(score)}
                      </span>
                    </div>
                    {/* Bar */}
                    <div
                      style={{
                        height: 8,
                        borderRadius: T.radius.full,
                        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(Math.max(score, 0), 100)}%`,
                          borderRadius: T.radius.full,
                          background: `linear-gradient(90deg, ${BT_COLORS.primary}, #9B7DFC)`,
                          transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Full Results button */}
          <button
            onClick={() => {
              // Placeholder — will navigate to /bt/results in the future
            }}
            style={accentButton(C, {
              width: "100%",
              justifyContent: "center",
              padding: "12px 18px",
              fontSize: T.fontSize.md,
              background: `linear-gradient(135deg, ${BT_COLORS.primary}, #9B7DFC)`,
            })}
          >
            View Full Results
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Not Started (Welcome) ──
  return (
    <div style={pageWrapper(T)}>
      <div style={centeredCard(C, T, { maxWidth: 800 })}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: T.space[6] }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: T.fontWeight.heavy,
              color: C.text,
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: T.space[2],
            }}
          >
            {BT_BRAND.name} Assessment
          </div>
          <div
            style={{
              fontSize: T.fontSize.base,
              color: C.textMuted,
              lineHeight: T.lineHeight.relaxed,
              maxWidth: 520,
              margin: "0 auto",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            This assessment measures your construction estimating skills across multiple dimensions. Complete the
            available modules to receive your certification.
          </div>
        </div>

        {/* P0 Modules */}
        <div style={{ marginBottom: T.space[5] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Available Modules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {p0Modules.map(mod => (
              <div
                key={mod.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${T.space[3]}px ${T.space[4]}px`,
                  background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                  borderRadius: T.radius.sm,
                  border: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
                  <span style={{ fontSize: 20 }}>{MODULE_ICONS[mod.icon] || ""}</span>
                  <div>
                    <div
                      style={{
                        fontSize: T.fontSize.md,
                        fontWeight: T.fontWeight.semibold,
                        color: C.text,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {mod.label}
                    </div>
                    <div
                      style={{
                        fontSize: T.fontSize.sm,
                        color: C.textDim,
                        fontFamily: "'DM Sans', sans-serif",
                        marginTop: 2,
                      }}
                    >
                      {formatTime(mod.timeLimit)} &middot; {mod.maxPoints} pts &middot; {Math.round(mod.weight * 100)}%
                      weight
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    fontWeight: T.fontWeight.semibold,
                    color: BT_COLORS.success,
                    background: `${BT_COLORS.success}12`,
                    padding: "3px 10px",
                    borderRadius: T.radius.full,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Ready
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* P1 Modules (Coming Soon) */}
        <div style={{ marginBottom: T.space[6] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Coming Soon</div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
            {p1Modules.map(mod => (
              <div
                key={mod.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${T.space[3]}px ${T.space[4]}px`,
                  background: C.isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.01)",
                  borderRadius: T.radius.sm,
                  border: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"}`,
                  opacity: 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
                  <span style={{ fontSize: 20, opacity: 0.4 }}>{MODULE_ICONS[mod.icon] || ""}</span>
                  <div>
                    <div
                      style={{
                        fontSize: T.fontSize.md,
                        fontWeight: T.fontWeight.medium,
                        color: C.textMuted,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {mod.label}
                    </div>
                    <div
                      style={{
                        fontSize: T.fontSize.sm,
                        color: C.textDim,
                        fontFamily: "'DM Sans', sans-serif",
                        marginTop: 2,
                      }}
                    >
                      {formatTime(mod.timeLimit)} &middot; {mod.maxPoints} pts &middot; {Math.round(mod.weight * 100)}%
                      weight
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    fontWeight: T.fontWeight.semibold,
                    color: C.textDim,
                    background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                    padding: "3px 10px",
                    borderRadius: T.radius.full,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Coming Soon
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Estimated time */}
        <div
          style={{
            textAlign: "center",
            fontSize: T.fontSize.sm,
            color: C.textDim,
            marginBottom: T.space[5],
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Estimated time: {totalTimeMins} minutes
        </div>

        {/* Begin button */}
        <button
          onClick={handleBeginAssessment}
          style={accentButton(C, {
            width: "100%",
            justifyContent: "center",
            padding: "14px 18px",
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            background: `linear-gradient(135deg, ${BT_COLORS.primary}, #9B7DFC)`,
          })}
        >
          Begin Assessment
        </button>
      </div>
    </div>
  );
}

// ── Layout styles ──
const pageWrapper = T => ({
  display: "flex",
  justifyContent: "center",
  padding: `${T.space[8]}px ${T.space[5]}px`,
  minHeight: "100%",
  fontFamily: "'DM Sans', sans-serif",
});

const centeredCard = (C, T, overrides = {}) => ({
  ...card(C),
  width: "100%",
  maxWidth: overrides.maxWidth || 800,
  padding: `${T.space[7]}px ${T.space[6]}px`,
  ...overrides,
});
