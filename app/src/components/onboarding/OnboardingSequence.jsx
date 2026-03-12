/**
 * OnboardingSequence — Guided tour from login to first estimate in <10 minutes
 *
 * Sprint 4.3: Replaces the basic 3-step card with an immersive walkthrough:
 *   Step 1: Welcome + NOVA introduction
 *   Step 2: Company Profile setup (name, location, specialty)
 *   Step 3: Upload sample project plans
 *   Step 4: Create first estimate + watch NOVA scan
 *   Step 5: Review results + celebrate
 *
 * Features:
 *   - Progress bar with step indicators
 *   - Contextual help tooltips
 *   - Skip any step
 *   - Sample project auto-import option
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to NOVATerra",
    subtitle: "Your AI-powered construction estimating platform",
    description:
      "NOVA is your intelligent assistant that reads construction drawings, detects schedules, and suggests takeoff items — so you can estimate faster and more accurately.",
    icon: I.ai,
    color: "accent",
  },
  {
    id: "company",
    title: "Set Up Your Company",
    subtitle: "Tell us about your business",
    description:
      "Add your company name, specialization, and location. This helps NOVA calibrate cost data and customize recommendations for your market.",
    icon: I.settings,
    color: "accent",
    action: "company",
  },
  {
    id: "plans",
    title: "Upload Your First Plans",
    subtitle: "Let NOVA analyze your drawings",
    description:
      "Upload a set of construction drawings (PDF). NOVA will detect schedules, extract notes, classify sheets, and generate a rough order of magnitude estimate — all automatically.",
    icon: I.upload || I.image,
    color: "green",
    action: "plans",
  },
  {
    id: "estimate",
    title: "Create Your First Estimate",
    subtitle: "Build scope from NOVA's suggestions",
    description:
      "Start with NOVA's predictive takeoffs or build from scratch. Add line items, assign costs, and organize by CSI division. Your estimate auto-saves continuously.",
    icon: I.estimate || I.folder,
    color: "purple",
    action: "estimate",
  },
  {
    id: "complete",
    title: "You're All Set!",
    subtitle: "Start estimating with NOVA",
    description:
      "Your workspace is ready. As you estimate, NOVA learns your corrections and preferences — getting smarter with every project. Welcome to the future of construction estimating.",
    icon: I.check,
    color: "green",
  },
];

export default function OnboardingSequence() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const updateSetting = useUiStore(s => s.updateSetting);
  const companyName = useMasterDataStore(s => s.masterData.companyInfo.name);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const [currentStep, setCurrentStep] = useState(0);
  const [companyInput, setCompanyInput] = useState(companyName || "");
  const [specialtyInput, setSpecialtyInput] = useState("");

  const step = STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      // Complete onboarding
      updateSetting("onboardingDismissed", true);
      localStorage.setItem("nova_onboarding_complete", "true");
      navigate("/dashboard");
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  }, [isLast, updateSetting, navigate]);

  const handleBack = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleSkip = useCallback(() => {
    updateSetting("onboardingDismissed", true);
    localStorage.setItem("nova_onboarding_complete", "true");
    navigate("/dashboard");
  }, [updateSetting, navigate]);

  const handleAction = useCallback(() => {
    switch (step.action) {
      case "company":
        // Save company name if entered
        if (companyInput.trim()) {
          useMasterDataStore.getState().updateCompanyInfo("name", companyInput.trim());
        }
        if (specialtyInput.trim()) {
          useMasterDataStore.getState().updateCompanyInfo("specialty", specialtyInput.trim());
        }
        handleNext();
        break;
      case "plans":
        // Navigate to plan room, but come back
        updateSetting("onboardingStep", currentStep + 1);
        navigate("/planroom");
        break;
      case "estimate":
        updateSetting("onboardingStep", currentStep + 1);
        navigate("/dashboard");
        break;
      default:
        handleNext();
    }
  }, [step, companyInput, specialtyInput, handleNext, navigate, currentStep, updateSetting]);

  const stepColor = C[step.color] || C.accent;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: T.space[6],
        background: `radial-gradient(ellipse at center, ${C.accent}06, ${C.bg} 70%)`,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: T.space[6] }}>
        <NovaTerraLogo size={28} />
      </div>

      {/* Progress bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: T.space[6],
          width: 280,
        }}
      >
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= currentStep ? stepColor : C.bg3,
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Step indicator */}
      <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, marginBottom: T.space[2] }}>
        STEP {currentStep + 1} OF {STEPS.length}
      </div>

      {/* Card */}
      <div
        style={{
          ...card(C),
          maxWidth: 480,
          width: "100%",
          padding: T.space[6],
          textAlign: "center",
          border: `1px solid ${stepColor}15`,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${stepColor}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            marginBottom: T.space[4],
          }}
        >
          <Ic d={step.icon} size={24} color={stepColor} />
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            margin: 0,
            marginBottom: 4,
            letterSpacing: -0.3,
          }}
        >
          {step.title}
        </h2>
        <div style={{ fontSize: 12, color: stepColor, fontWeight: 600, marginBottom: T.space[3] }}>
          {step.subtitle}
        </div>
        <p
          style={{
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.7,
            margin: 0,
            marginBottom: T.space[5],
            maxWidth: 380,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {step.description}
        </p>

        {/* Step-specific content */}
        {step.id === "company" && (
          <div style={{ marginBottom: T.space[4], display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              placeholder="Company Name"
              value={companyInput}
              onChange={e => setCompanyInput(e.target.value)}
              style={{
                padding: "10px 14px",
                fontSize: 13,
                borderRadius: T.radius.md,
                border: `1px solid ${C.border}`,
                background: C.bg2,
                color: C.text,
                outline: "none",
                fontFamily: T.font.sans,
                textAlign: "center",
              }}
            />
            <select
              value={specialtyInput}
              onChange={e => setSpecialtyInput(e.target.value)}
              style={{
                padding: "10px 14px",
                fontSize: 13,
                borderRadius: T.radius.md,
                border: `1px solid ${C.border}`,
                background: C.bg2,
                color: specialtyInput ? C.text : C.textDim,
                outline: "none",
                fontFamily: T.font.sans,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <option value="">Select Specialty...</option>
              <option value="General Contractor">General Contractor</option>
              <option value="Subcontractor">Subcontractor</option>
              <option value="Owner/Developer">Owner / Developer</option>
              <option value="Construction Manager">Construction Manager</option>
              <option value="Design-Build">Design-Build</option>
              <option value="Specialty Contractor">Specialty Contractor</option>
            </select>
          </div>
        )}

        {step.id === "complete" && (
          <div
            style={{
              fontSize: 40,
              marginBottom: T.space[3],
              lineHeight: 1,
            }}
          >
            🎉
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {!isFirst && (
            <button
              onClick={handleBack}
              style={bt(C, {
                padding: "10px 20px",
                fontSize: 12,
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
              })}
            >
              Back
            </button>
          )}
          <button
            onClick={step.action ? handleAction : handleNext}
            style={bt(C, {
              padding: "10px 28px",
              fontSize: 12,
              fontWeight: 600,
              background: `linear-gradient(135deg, ${stepColor}, ${C.purple || stepColor})`,
              color: "#fff",
              boxShadow: `0 2px 12px ${stepColor}30`,
            })}
          >
            {isLast
              ? "Go to Dashboard"
              : step.action === "plans"
                ? "Open Plan Room →"
                : step.action === "estimate"
                  ? "Create Estimate →"
                  : step.action === "company"
                    ? "Save & Continue"
                    : "Continue"}
          </button>
        </div>
      </div>

      {/* Skip link */}
      {!isLast && (
        <button
          onClick={handleSkip}
          style={{
            marginTop: T.space[4],
            background: "none",
            border: "none",
            fontSize: 11,
            color: C.textDim,
            cursor: "pointer",
            padding: 4,
          }}
        >
          Skip setup — I know what I'm doing
        </button>
      )}

      {/* Contextual tips */}
      {step.id === "plans" && (
        <div
          style={{
            marginTop: T.space[4],
            maxWidth: 420,
            padding: T.space[3],
            background: `${C.accent}06`,
            borderRadius: T.radius.md,
            border: `1px solid ${C.accent}15`,
            fontSize: 10,
            color: C.textDim,
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          <strong style={{ color: C.accent }}>💡 Tip:</strong> NOVA works best with architectural sheets (A-series).
          Upload door, window, and finish schedules for the most accurate predictive takeoffs.
        </div>
      )}
    </div>
  );
}
