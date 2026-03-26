// NOVAThinking — Shows NOVA reasoning through the estimate step by step
// Each step types out with a delay, building trust by showing the logic.
// When all steps complete, calls onComplete() to reveal the deliverable.

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const TYPING_SPEED = 25; // ms per character
const STEP_PAUSE = 400; // ms between steps
const COMPLETION_PAUSE = 800; // ms after last step before revealing result

// ── Step definitions by path ──

function getStepsForBasics(buildingType, sf, opts = {}) {
  const { floors = 1, workType = "" } = opts;
  const typeLabel = buildingType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const workLabel = workType ? workType.replace(/-/g, " ") : "new construction";

  return [
    { icon: "🔍", text: `Analyzing project parameters: ${typeLabel}, ${sf.toLocaleString()} SF, ${floors} floor${floors > 1 ? "s" : ""}` },
    { icon: "📐", text: `Estimating building envelope: ~${Math.round(2 * (Math.sqrt(sf / 1.5) + Math.sqrt(sf / 1.5) * 1.5))} LF perimeter` },
    { icon: "🏗️", text: `Identifying required CSI divisions for ${typeLabel.toLowerCase()} ${workLabel}...` },
    ...(buildingType === "restaurant" ? [
      { icon: "🍽️", text: "Adding food service scope: kitchen exhaust, grease interceptor, walk-in cooler, ansul system" },
      { icon: "⚡", text: "Adding heavy-duty MEP: gas piping, makeup air, 3-compartment sinks, floor drains" },
    ] : buildingType === "healthcare" ? [
      { icon: "🏥", text: "Adding healthcare-specific: lead-lined walls, medical gas, anti-microbial finishes, nurse call" },
      { icon: "⚕️", text: "Applying healthcare code requirements: 100% outside air HVAC, emergency generator, fire-rated assemblies" },
    ] : buildingType === "education" ? [
      { icon: "🎓", text: "Adding education scope: acoustical ceilings, AV systems, lockers, ADA drinking fountains" },
    ] : buildingType.includes("residential") ? [
      { icon: "🏠", text: "Adding residential scope: cabinetry, countertops, finish carpentry, landscaping" },
    ] : [
      { icon: "📋", text: `Applying ${typeLabel.toLowerCase()}-specific scope requirements` },
    ]),
    ...(workType === "tenant-improvement" || workType === "renovation" ? [
      { icon: "🔨", text: "Adding selective demolition scope for existing conditions" },
      { icon: "📝", text: "Adjusting quantities for renovation constraints (limited access, protection of existing)" },
    ] : []),
    { icon: "💰", text: "Calculating cost ranges from calibrated market data..." },
    { icon: "📊", text: "Cross-referencing with historical project database for pricing accuracy" },
    { icon: "🔗", text: `Compiling scope items across all divisions...` },
    { icon: "✅", text: "Estimate complete. Generating deliverable." },
  ];
}

function getStepsForWizard(answers) {
  const typeLabel = (answers.category || "commercial").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return [
    { icon: "🧠", text: `Understanding your project: ${typeLabel}` },
    { icon: "📐", text: `Estimating scope for ~${(answers.size || 2500).toLocaleString()} SF` },
    { icon: "🏗️", text: "Building scope template from expert knowledge base..." },
    { icon: "💰", text: "Applying calibrated cost data from similar projects..." },
    { icon: "✅", text: "Your estimate is ready." },
  ];
}

function getStepsForDrawings(scanSummary) {
  return [
    { icon: "📄", text: `Uploading ${scanSummary?.filesScanned || 1} drawing file${(scanSummary?.filesScanned || 1) > 1 ? "s" : ""}...` },
    { icon: "🔍", text: `Scanning ${scanSummary?.pagesScanned || 0} pages for schedules and specifications...` },
    { icon: "📋", text: `Found ${scanSummary?.schedulesFound || 0} schedules: door, finish, plumbing, equipment...` },
    { icon: "🏗️", text: "Extracting scope items from detected schedules..." },
    { icon: "💰", text: "Pricing line items from calibrated market data..." },
    { icon: "📊", text: `Generated ${scanSummary?.lineItemsGenerated || 0} detailed line items` },
    { icon: "✅", text: "Analysis complete. Your detailed estimate is ready." },
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

// ── Single step component ──
function ThinkingStep({ step, active, completed }) {
  const C = useTheme();
  const { displayed, done } = useTypingAnimation(active ? step.text : "", TYPING_SPEED);

  if (!active && !completed) return null;

  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0",
      opacity: completed ? 0.5 : 1,
      transition: "opacity 0.5s ease",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{step.icon}</span>
      <span style={{
        fontSize: 13, color: completed ? "rgba(238,237,245,0.4)" : "#EEEDF5",
        fontFamily: "'Switzer', -apple-system, sans-serif",
        lineHeight: 1.6,
      }}>
        {completed ? step.text : displayed}
        {active && !done && (
          <span style={{
            display: "inline-block", width: 2, height: 14, background: C.accent || "#00D4AA",
            marginLeft: 2, verticalAlign: "middle",
            animation: "novaCursorBlink 0.8s step-end infinite",
          }} />
        )}
      </span>
    </div>
  );
}

// ── Main component ──
export default function NOVAThinking({ path, buildingType, sf, opts, scanSummary, wizardAnswers, onComplete }) {
  const C = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [stepDone, setStepDone] = useState(false);
  const completedRef = useRef(false);

  // Select steps based on path
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

    // Wait for current step typing to finish
    const stepText = steps[currentStep]?.text || "";
    const typingDuration = stepText.length * TYPING_SPEED + STEP_PAUSE;

    const timer = setTimeout(() => {
      setStepDone(true);
      setTimeout(() => {
        setCurrentStep(prev => prev + 1);
        setStepDone(false);
      }, 200);
    }, typingDuration);

    return () => clearTimeout(timer);
  }, [currentStep, steps, onComplete]);

  return (
    <div style={{
      width: "100%", maxWidth: 540, margin: "0 auto", padding: "32px 0",
    }}>
      {/* Inject cursor blink animation */}
      <style>{`@keyframes novaCursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>

      {/* NOVA branding */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 28,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.accent || "#00D4AA"}, #06B6D4)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#000", fontWeight: 700,
        }}>N</div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: C.accent || "#00D4AA",
          fontFamily: "'Switzer', sans-serif",
          textTransform: "uppercase", letterSpacing: "0.15em",
        }}>
          NOVA IS ANALYZING YOUR PROJECT
        </div>
      </div>

      {/* Steps */}
      <div style={{ borderLeft: `2px solid ${C.border || "rgba(255,255,255,0.08)"}`, paddingLeft: 20, marginLeft: 13 }}>
        {steps.map((step, i) => (
          <ThinkingStep
            key={i}
            step={step}
            active={i === currentStep}
            completed={i < currentStep}
          />
        ))}
      </div>

      {/* Progress */}
      <div style={{
        marginTop: 24, display: "flex", alignItems: "center", gap: 12,
      }}>
        <div style={{
          flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: `linear-gradient(90deg, ${C.accent || "#00D4AA"}, #06B6D4)`,
            width: `${Math.min(100, (currentStep / steps.length) * 100)}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
        <span style={{
          fontSize: 10, color: "rgba(238,237,245,0.3)",
          fontFamily: "'Switzer', sans-serif", minWidth: 30, textAlign: "right",
        }}>
          {Math.min(100, Math.round((currentStep / steps.length) * 100))}%
        </span>
      </div>
    </div>
  );
}
