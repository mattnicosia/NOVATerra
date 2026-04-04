/**
 * OnboardingSequence — NOVA-guided first-estimate wizard
 *
 * Sprint 4.4: Rewritten as a 5-minute "time-to-first-ROM" wizard:
 *   Step 1: NOVA greeting with accent pulse animation
 *   Step 2: Company Profile setup (skip-friendly)
 *   Step 3: Upload plans OR skip to manual entry
 *   Step 4: Quick ROM — project name, building type, SF, location
 *   Step 5: ROM results summary with top divisions + CTAs
 *
 * Features:
 *   - Progress bar with step indicators
 *   - NOVA personality throughout
 *   - Skip-friendly at every step
 *   - Inline ROM generation (the "aha moment")
 */

import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { generateBaselineROM } from "@/utils/romEngine";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";

const BUILDING_TYPES = [
  { value: "commercial-office", label: "Commercial Office" },
  { value: "residential-single", label: "Residential (Single Family)" },
  { value: "residential-multi", label: "Residential (Multi-Family)" },
  { value: "mixed-use", label: "Mixed Use" },
  { value: "restaurant", label: "Restaurant" },
  { value: "retail", label: "Retail" },
  { value: "industrial", label: "Industrial / Warehouse" },
  { value: "healthcare", label: "Healthcare" },
  { value: "hospitality", label: "Hospitality / Hotel" },
  { value: "education", label: "Education" },
  { value: "government", label: "Government" },
  { value: "religious", label: "Religious" },
];

const STEPS = [
  {
    id: "welcome",
    title: "Meet NOVA",
    subtitle: "Your construction estimating AI",
    description:
      "I'm NOVA, your construction estimating AI. Let's get your first project estimated in under 5 minutes.",
    icon: I.ai,
    color: "accent",
  },
  {
    id: "company",
    title: "Your Company",
    subtitle: "Optional — helps calibrate cost data",
    description:
      "Tell NOVA your company name and specialty so cost recommendations match your market. You can always set this up later.",
    icon: I.settings,
    color: "accent",
    action: "company",
  },
  {
    id: "plans",
    title: "Upload Plans",
    subtitle: "Let NOVA analyze your drawings",
    description:
      "Upload construction drawings (PDF) and NOVA will detect schedules, classify sheets, and extract scope automatically.",
    icon: I.upload || I.image,
    color: "green",
    action: "plans",
  },
  {
    id: "estimate",
    title: "Quick ROM",
    subtitle: "Your first estimate in 60 seconds",
    description:
      "Enter basic project info and NOVA will generate a Rough Order of Magnitude estimate using real market data from 57+ completed projects.",
    icon: I.estimate || I.folder,
    color: "purple",
    action: "rom",
  },
  {
    id: "complete",
    title: "Your ROM Estimate",
    subtitle: "Powered by NOVA",
    description: "",
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
  const [currentStep, setCurrentStep] = useState(0);
  const [companyInput, setCompanyInput] = useState(companyName || "");
  const [specialtyInput, setSpecialtyInput] = useState("");

  // Quick ROM state
  const [romProjectName, setRomProjectName] = useState("");
  const [romBuildingType, setRomBuildingType] = useState("");
  const [romSF, setRomSF] = useState("");
  const [romLocation, setRomLocation] = useState("");
  const [romResult, setRomResult] = useState(null);
  const [romGenerating, setRomGenerating] = useState(false);

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

  const handleGenerateROM = useCallback(() => {
    if (!romBuildingType || !romSF) return;
    setRomGenerating(true);
    // Small timeout so spinner renders
    setTimeout(() => {
      try {
        const result = generateBaselineROM(
          parseFloat(romSF) || 0,
          romBuildingType,
          {}, // no calibration factors for quick ROM
          undefined,
          { location: romLocation || "" }
        );
        result._projectName = romProjectName || "Quick ROM Estimate";
        setRomResult(result);
        setRomGenerating(false);
        setCurrentStep(4); // Jump to results
      } catch (e) {
        console.error("ROM generation failed:", e);
        setRomGenerating(false);
      }
    }, 600);
  }, [romBuildingType, romSF, romLocation, romProjectName]);

  // Top 3 divisions by mid total (for results display)
  const topDivisions = useMemo(() => {
    if (!romResult?.divisions) return [];
    return Object.entries(romResult.divisions)
      .sort(([, a], [, b]) => (b.total?.mid || 0) - (a.total?.mid || 0))
      .slice(0, 3);
  }, [romResult]);

  const handleAction = useCallback(() => {
    switch (step.action) {
      case "company":
        if (companyInput.trim()) {
          useMasterDataStore.getState().updateCompanyInfo("name", companyInput.trim());
        }
        if (specialtyInput.trim()) {
          useMasterDataStore.getState().updateCompanyInfo("specialty", specialtyInput.trim());
        }
        handleNext();
        break;
      case "plans":
        updateSetting("onboardingStep", currentStep + 1);
        navigate("/planroom");
        break;
      case "rom":
        handleGenerateROM();
        break;
      default:
        handleNext();
    }
  }, [step, companyInput, specialtyInput, handleNext, navigate, currentStep, updateSetting, handleGenerateROM]);

  const stepColor = C[step.color] || C.accent;

  const fmtCost = (n) => {
    if (!n) return "$0";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const inputStyle = {
    padding: "10px 14px",
    fontSize: 13,
    borderRadius: T.radius.md,
    border: `1px solid ${C.border}`,
    background: C.bg2,
    color: C.text,
    outline: "none",
    fontFamily: T.font.sans,
    width: "100%",
    boxSizing: "border-box",
  };

  const romReady = romBuildingType && romSF && parseFloat(romSF) > 0;

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
      {/* NOVA pulse animation — CSS keyframes injected once */}
      <style>{`
        @keyframes novaPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${C.accent}25; }
          50% { box-shadow: 0 0 40px 12px ${C.accent}18; }
        }
        @keyframes novaFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nova-pulse { animation: novaPulse 2.4s ease-in-out infinite; }
        .nova-fadein { animation: novaFadeIn 0.5s ease-out both; }
      `}</style>

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
        className="nova-fadein"
        key={step.id}
        style={{
          ...card(C),
          maxWidth: step.id === "complete" && romResult ? 540 : 480,
          width: "100%",
          padding: T.space[6],
          textAlign: "center",
          border: `1px solid ${stepColor}15`,
          transition: "max-width 0.3s ease",
        }}
      >
        {/* Icon — with pulse on welcome step */}
        <div
          className={step.id === "welcome" ? "nova-pulse" : ""}
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
        <div style={{ fontSize: 12, color: stepColor, fontWeight: 600, marginBottom: T.space[3] }}>{step.subtitle}</div>
        {step.description && (
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
        )}

        {/* ── Step-specific content ── */}

        {/* Company setup */}
        {step.id === "company" && (
          <div style={{ marginBottom: T.space[4], display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              placeholder="Company Name"
              value={companyInput}
              onChange={e => setCompanyInput(e.target.value)}
              style={{ ...inputStyle, textAlign: "center" }}
            />
            <select
              value={specialtyInput}
              onChange={e => setSpecialtyInput(e.target.value)}
              style={{
                ...inputStyle,
                textAlign: "center",
                color: specialtyInput ? C.text : C.textDim,
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

        {/* Quick ROM inputs */}
        {step.id === "estimate" && (
          <div style={{ marginBottom: T.space[4], display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Project Name
              </label>
              <input
                placeholder="e.g. Maple Street Renovation"
                value={romProjectName}
                onChange={e => setRomProjectName(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Building Type <span style={{ color: C.red || "#e55" }}>*</span>
              </label>
              <select
                value={romBuildingType}
                onChange={e => setRomBuildingType(e.target.value)}
                style={{
                  ...inputStyle,
                  marginTop: 4,
                  color: romBuildingType ? C.text : C.textDim,
                  cursor: "pointer",
                }}
              >
                <option value="">Select building type...</option>
                {BUILDING_TYPES.map(bt => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Square Footage <span style={{ color: C.red || "#e55" }}>*</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={romSF}
                  onChange={e => setRomSF(e.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                  min="1"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Location
                </label>
                <input
                  placeholder="Zip or city"
                  value={romLocation}
                  onChange={e => setRomLocation(e.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </div>
            </div>
            {romGenerating && (
              <div style={{ textAlign: "center", padding: T.space[3], color: C.accent, fontSize: 12, fontWeight: 600 }}>
                NOVA is generating your ROM...
              </div>
            )}
          </div>
        )}

        {/* ROM Results */}
        {step.id === "complete" && romResult && (
          <div style={{ marginBottom: T.space[4], textAlign: "left" }}>
            {/* Project header */}
            <div style={{
              textAlign: "center",
              marginBottom: T.space[4],
              padding: T.space[3],
              background: `${C.accent}08`,
              borderRadius: T.radius.md,
              border: `1px solid ${C.accent}12`,
            }}>
              <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                {romResult._projectName}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted }}>
                {BUILDING_TYPES.find(b => b.value === romResult.buildingType)?.label || romResult.buildingType}
                {" | "}{Number(romResult.projectSF).toLocaleString()} SF
                {romResult.marketRegion ? ` | ${romResult.marketRegion.label}` : ""}
              </div>
            </div>

            {/* Cost summary */}
            <div style={{ display: "flex", gap: 8, marginBottom: T.space[4] }}>
              {[
                { label: "Low", value: romResult.totals.low, perSF: romResult.perSF.low, color: C.green || "#4a9" },
                { label: "Mid", value: romResult.totals.mid, perSF: romResult.perSF.mid, color: C.accent },
                { label: "High", value: romResult.totals.high, perSF: romResult.perSF.high, color: C.red || "#e55" },
              ].map(r => (
                <div
                  key={r.label}
                  style={{
                    flex: 1,
                    padding: T.space[3],
                    background: `${r.color}08`,
                    borderRadius: T.radius.md,
                    border: `1px solid ${r.color}15`,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: r.color, letterSpacing: -0.5 }}>
                    {fmtCost(r.value)}
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                    ${r.perSF.toFixed(2)}/SF
                  </div>
                </div>
              ))}
            </div>

            {/* Top 3 divisions */}
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
              Top Divisions by Cost
            </div>
            {topDivisions.map(([code, div]) => (
              <div
                key={code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  marginBottom: 4,
                  background: C.bg2,
                  borderRadius: T.radius.sm,
                  fontSize: 11,
                }}
              >
                <span style={{ color: C.text, fontWeight: 500 }}>
                  <span style={{ color: C.textDim, marginRight: 6 }}>Div {code}</span>
                  {div.label}
                </span>
                <span style={{ color: C.accent, fontWeight: 600 }}>{fmtCost(div.total.mid)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Fallback complete state when no ROM was generated */}
        {step.id === "complete" && !romResult && (
          <div style={{ fontSize: 40, marginBottom: T.space[3], lineHeight: 1 }}>
            ---
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          {!isFirst && !isLast && (
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

          {/* ROM step: Generate button */}
          {step.action === "rom" ? (
            <button
              onClick={handleGenerateROM}
              disabled={!romReady || romGenerating}
              style={bt(C, {
                padding: "10px 28px",
                fontSize: 12,
                fontWeight: 600,
                background: romReady
                  ? `linear-gradient(135deg, ${stepColor}, ${C.purple || stepColor})`
                  : C.bg3,
                color: romReady ? "#fff" : C.textDim,
                boxShadow: romReady ? `0 2px 12px ${stepColor}30` : "none",
                opacity: romGenerating ? 0.6 : 1,
                cursor: romReady && !romGenerating ? "pointer" : "default",
              })}
            >
              {romGenerating ? "Generating..." : "Generate ROM"}
            </button>
          ) : isLast && romResult ? (
            /* Results step: two CTAs */
            <>
              <button
                onClick={() => {
                  // Store ROM for import as real estimate
                  localStorage.setItem("rom_prefill", JSON.stringify({
                    buildingType: romResult.buildingType,
                    sf: romResult.projectSF,
                    location: romResult.location,
                    projectName: romResult._projectName,
                    romData: romResult,
                  }));
                  updateSetting("onboardingDismissed", true);
                  localStorage.setItem("nova_onboarding_complete", "true");
                  navigate("/dashboard");
                }}
                style={bt(C, {
                  padding: "10px 24px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${stepColor}, ${C.purple || stepColor})`,
                  color: "#fff",
                  boxShadow: `0 2px 12px ${stepColor}30`,
                })}
              >
                Refine This Estimate
              </button>
              <button
                onClick={() => {
                  updateSetting("onboardingDismissed", true);
                  localStorage.setItem("nova_onboarding_complete", "true");
                  navigate("/dashboard");
                }}
                style={bt(C, {
                  padding: "10px 20px",
                  fontSize: 12,
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                })}
              >
                Start New Project
              </button>
            </>
          ) : (
            /* Default: Continue / Go to Dashboard */
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
                  ? "Open Plan Room"
                  : step.action === "company"
                    ? "Save & Continue"
                    : "Continue"}
            </button>
          )}
        </div>
      </div>

      {/* Skip options — contextual per step */}
      {!isLast && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: T.space[3] }}>
          {/* Step-specific skip */}
          {step.id === "company" && (
            <button
              onClick={handleNext}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: C.accent,
                cursor: "pointer",
                padding: "4px 8px",
                fontWeight: 500,
              }}
            >
              Skip for now — set up later
            </button>
          )}
          {step.id === "plans" && (
            <button
              onClick={handleNext}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: C.accent,
                cursor: "pointer",
                padding: "4px 8px",
                fontWeight: 500,
              }}
            >
              Skip — I'll enter project details manually
            </button>
          )}
          {/* Global skip */}
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              fontSize: 10,
              color: C.textDim,
              cursor: "pointer",
              padding: 4,
            }}
          >
            Skip entire setup
          </button>
        </div>
      )}

      {/* Contextual tips */}
      {step.id === "plans" && (
        <div
          style={{
            marginTop: T.space[3],
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
          <strong style={{ color: C.accent }}>Tip:</strong> NOVA works best with architectural sheets (A-series).
          Upload door, window, and finish schedules for the most accurate predictive takeoffs.
        </div>
      )}
      {step.id === "estimate" && (
        <div
          style={{
            marginTop: T.space[3],
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
          <strong style={{ color: C.accent }}>How it works:</strong> NOVA uses benchmark data from 57+ real construction proposals
          to generate cost ranges by CSI division, adjusted for building type and market location.
        </div>
      )}
    </div>
  );
}
