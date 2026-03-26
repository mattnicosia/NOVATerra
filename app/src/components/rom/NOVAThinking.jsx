// NOVAThinking — Shows NOVA reasoning through the estimate step by step
// Geometric status indicators: diamond (pending) → filled diamond (active) → teal dot (complete)
// Each step types out with a delay, building trust by showing the logic.

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const TYPING_SPEED = 22;
const STEP_PAUSE = 350;
const COMPLETION_PAUSE = 600;

// ── Status indicator (geometric shapes) ──
function StatusDot({ state, accentColor }) {
  // state: "pending" | "active" | "complete"
  if (state === "complete") {
    return (
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: accentColor, flexShrink: 0, marginTop: 5,
        boxShadow: `0 0 6px ${accentColor}60`,
        transition: "all 0.3s ease",
      }} />
    );
  }
  if (state === "active") {
    return (
      <div style={{
        width: 8, height: 8, flexShrink: 0, marginTop: 5,
        background: accentColor,
        transform: "rotate(45deg)",
        boxShadow: `0 0 8px ${accentColor}80`,
        transition: "all 0.3s ease",
        animation: "novaActivePulse 1.5s ease-in-out infinite",
      }} />
    );
  }
  // pending
  return (
    <div style={{
      width: 6, height: 6, flexShrink: 0, marginTop: 6,
      border: `1px solid rgba(255,255,255,0.15)`,
      transform: "rotate(45deg)",
      transition: "all 0.3s ease",
    }} />
  );
}

// ── Step definitions ──

function getStepsForBasics(buildingType, sf, opts = {}) {
  const { floors = 1, workType = "" } = opts;
  const typeLabel = buildingType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const workLabel = workType ? workType.replace(/-/g, " ") : "new construction";
  const perim = Math.round(2 * (Math.sqrt(sf / 1.5) + Math.sqrt(sf / 1.5) * 1.5));

  return [
    `Analyzing project parameters: ${typeLabel}, ${sf.toLocaleString()} SF, ${floors} floor${floors > 1 ? "s" : ""}`,
    `Estimating building envelope: ~${perim} LF perimeter`,
    `Identifying required CSI divisions for ${typeLabel.toLowerCase()} ${workLabel}`,
    ...(buildingType === "restaurant" ? [
      "Adding food service scope: kitchen exhaust, grease interceptor, walk-in cooler, ansul system",
      "Adding heavy-duty MEP: gas piping, makeup air, 3-compartment sinks, floor drains",
    ] : buildingType === "healthcare" ? [
      "Adding healthcare-specific: lead-lined walls, medical gas, anti-microbial finishes, nurse call",
      "Applying healthcare code requirements: 100% outside air HVAC, emergency generator, fire-rated assemblies",
    ] : buildingType === "education" ? [
      "Adding education scope: acoustical ceilings, AV systems, lockers, ADA drinking fountains",
    ] : buildingType.includes("residential") ? [
      "Adding residential scope: cabinetry, countertops, finish carpentry, landscaping",
    ] : [
      `Applying ${typeLabel.toLowerCase()}-specific scope requirements`,
    ]),
    ...(workType === "tenant-improvement" || workType === "renovation" ? [
      "Adding selective demolition scope for existing conditions",
      "Adjusting quantities for renovation constraints",
    ] : []),
    "Calculating cost ranges from calibrated market data",
    "Cross-referencing with historical project database",
    "Compiling scope items across all divisions",
    "Estimate complete",
  ];
}

function getStepsForWizard(answers) {
  const typeLabel = (answers.category || "commercial").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return [
    `Understanding your project: ${typeLabel}`,
    `Estimating scope for ~${(answers.size || 2500).toLocaleString()} SF`,
    "Building scope template from expert knowledge base",
    "Applying calibrated cost data from similar projects",
    "Your estimate is ready",
  ];
}

function getStepsForDrawings(scanSummary) {
  return [
    `Uploading ${scanSummary?.filesScanned || 1} drawing file${(scanSummary?.filesScanned || 1) > 1 ? "s" : ""}`,
    `Scanning ${scanSummary?.pagesScanned || 0} pages for schedules and specifications`,
    `Found ${scanSummary?.schedulesFound || 0} schedules: door, finish, plumbing, equipment`,
    "Extracting scope items from detected schedules",
    "Pricing line items from calibrated market data",
    `Generated ${scanSummary?.lineItemsGenerated || 0} detailed line items`,
    "Analysis complete",
  ];
}

// ── Typing animation hook ──
function useTypingAnimation(text, speed = TYPING_SPEED) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) return;
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

// ── Single step ──
function ThinkingStep({ text, state, accentColor }) {
  const { displayed, done } = useTypingAnimation(state === "active" ? text : "", TYPING_SPEED);

  if (state === "pending") return null;

  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "flex-start", padding: "6px 0",
      opacity: state === "complete" ? 0.4 : 1,
      transition: "opacity 0.4s ease",
    }}>
      <StatusDot state={state} accentColor={accentColor} />
      <span style={{
        fontSize: 13, color: state === "complete" ? "rgba(238,237,245,0.4)" : "rgba(238,237,245,0.85)",
        fontFamily: "'Switzer', -apple-system, sans-serif",
        lineHeight: 1.55,
      }}>
        {state === "complete" ? text : displayed}
        {state === "active" && !done && (
          <span style={{
            display: "inline-block", width: 1.5, height: 13,
            background: accentColor, marginLeft: 1, verticalAlign: "middle",
            animation: "novaCursorBlink 0.7s step-end infinite",
          }} />
        )}
      </span>
    </div>
  );
}

// ── Main component ──
export default function NOVAThinking({ path, buildingType, sf, opts, scanSummary, wizardAnswers, onComplete }) {
  const C = useTheme();
  const accent = C.accent || "#00D4AA";
  const [currentStep, setCurrentStep] = useState(0);
  const completedRef = useRef(false);

  const steps = path === "drawings"
    ? getStepsForDrawings(scanSummary)
    : path === "explore"
      ? getStepsForWizard(wizardAnswers)
      : getStepsForBasics(buildingType, sf, opts);

  // Advance steps
  useEffect(() => {
    if (currentStep >= steps.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        setTimeout(() => onComplete?.(), COMPLETION_PAUSE);
      }
      return;
    }

    const stepText = steps[currentStep] || "";
    const typingDuration = stepText.length * TYPING_SPEED + STEP_PAUSE;

    const timer = setTimeout(() => {
      setCurrentStep(prev => prev + 1);
    }, typingDuration);

    return () => clearTimeout(timer);
  }, [currentStep, steps, onComplete]);

  const progress = Math.min(100, Math.round((currentStep / steps.length) * 100));

  return (
    <div style={{ width: "100%", maxWidth: 500, margin: "0 auto", padding: "40px 0" }}>
      <style>{`
        @keyframes novaCursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes novaActivePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 32,
      }}>
        <div style={{
          width: 6, height: 6, background: accent,
          boxShadow: `0 0 8px ${accent}80`,
          animation: "novaActivePulse 2s ease-in-out infinite",
        }} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: accent,
          fontFamily: "'Switzer', sans-serif",
          textTransform: "uppercase", letterSpacing: "0.18em",
        }}>
          NOVA
        </span>
        <span style={{
          fontSize: 10, fontWeight: 400, color: "rgba(238,237,245,0.3)",
          fontFamily: "'Switzer', sans-serif",
          letterSpacing: "0.05em",
        }}>
          analyzing your project
        </span>
      </div>

      {/* Steps */}
      <div style={{ marginLeft: 2 }}>
        {steps.map((text, i) => (
          <ThinkingStep
            key={i}
            text={text}
            state={i < currentStep ? "complete" : i === currentStep ? "active" : "pending"}
            accentColor={accent}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 32, display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          flex: 1, height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 1, background: accent,
            width: `${progress}%`,
            transition: "width 0.4s ease",
            boxShadow: progress > 0 ? `0 0 6px ${accent}40` : "none",
          }} />
        </div>
        <span style={{
          fontSize: 9, color: "rgba(238,237,245,0.2)",
          fontFamily: "'Switzer', sans-serif",
          fontVariantNumeric: "tabular-nums",
          minWidth: 28, textAlign: "right",
        }}>
          {progress}%
        </span>
      </div>
    </div>
  );
}
