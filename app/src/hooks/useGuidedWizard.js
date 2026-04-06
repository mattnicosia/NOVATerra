// useGuidedWizard — Extracted from RomPage.jsx GuidedWizardPath
// Wizard step navigation, answer collection, scope inclusion/exclusion, ROM finalization
import { useState } from "react";
import { generateBaselineROM } from "@/utils/romEngine";

// Map scope keys to division codes for inclusion/exclusion
const SCOPE_TO_DIVISIONS = {
  demolition: ["02"],
  sitework: ["31"],
  sitedemo: ["31"],
  asbestos: ["02"],
  thirdparty: [],
  designfees: [],
  permits: [],
  kitchenequip: ["11"],
  av: ["27"],
  security: ["28"],
  windowtreatments: ["12"],
  furniture: ["12"],
  signage: ["10"],
  landscaping: ["32"],
  lowvoltage: ["27"],
  fireprotection: ["21"],
  elevator: ["14"],
};

export function useGuidedWizard({ questions, onResult }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [yesNoState, setYesNoState] = useState({});

  function finalize(finalAnswers) {
    try {
      const rawSF = parseFloat(finalAnswers.size);
      const sf = (rawSF > 0) ? rawSF : 2500;
      const buildType = finalAnswers.category || "commercial-office";
      const work = finalAnswers.work || "new-construction";
      const floorCount = finalAnswers.floors || 1;
      const laborType = finalAnswers.labor || "open-shop";
      const location = finalAnswers.location || "";
      const result = generateBaselineROM(sf, buildType, work, null, { floorCount, laborType, location });
      result.source = "wizard";

      const inclusions = finalAnswers.scopeInclusions || {};
      const excludedScopes = Object.entries(inclusions).filter(([, v]) => v === false).map(([k]) => k);
      const includedScopes = Object.entries(inclusions).filter(([, v]) => v === true).map(([k]) => k);

      if (excludedScopes.length > 0) {
        result.scopeExclusions = excludedScopes;
        result.scopeInclusions = includedScopes;
        const excludedDivs = new Set();
        excludedScopes.forEach(ex => {
          (SCOPE_TO_DIVISIONS[ex] || []).forEach(d => excludedDivs.add(d));
        });
        for (const divCode of excludedDivs) {
          if (result.divisions[divCode]) {
            const div = result.divisions[divCode];
            div.excluded = true;
            div.excludedReason = "Not required / owner-supplied";
            div.originalTotal = { ...div.total };
            div.originalPerSF = { ...div.perSF };
            div.total = { low: 0, mid: 0, high: 0 };
            div.perSF = { low: 0, mid: 0, high: 0 };
            result.totals.low -= div.originalTotal.low;
            result.totals.mid -= div.originalTotal.mid;
            result.totals.high -= div.originalTotal.high;
          }
        }
        if (inclusions.designfees) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "A/E Design Fees", pct: 8 });
        }
        if (inclusions.permits) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "Permits & Filing Fees", pct: 2 });
        }
        if (inclusions.thirdparty) {
          result.softCostInclusions = result.softCostInclusions || [];
          result.softCostInclusions.push({ label: "3rd Party Testing & Inspections", pct: 1.5 });
        }
        if (sf > 0) {
          result.perSF = {
            low: Math.round((result.totals.low / sf) * 100) / 100,
            mid: Math.round((result.totals.mid / sf) * 100) / 100,
            high: Math.round((result.totals.high / sf) * 100) / 100,
          };
        }
      }
      result.wizardAnswers = finalAnswers;
      onResult(result);
    } catch (err) {
      console.error("[ROM Wizard] Generation failed:", err);
      try {
        const sf = parseFloat(finalAnswers.size) || 2500;
        const result = generateBaselineROM(sf, finalAnswers.category || "commercial-office");
        result.source = "wizard";
        result.wizardAnswers = finalAnswers;
        onResult(result);
      } catch (err2) {
        console.error("[ROM Wizard] Fallback also failed:", err2);
      }
    }
  }

  function handleSelect(value) {
    const q = questions[step];
    const newAnswers = { ...answers, [q.id]: value };
    setAnswers(newAnswers);
    setInputValue("");
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      finalize(newAnswers);
    }
  }

  function handleInputSubmit() {
    const q = questions[step];
    if (!inputValue.trim()) return;
    const val = q.inputType === "number" ? parseFloat(inputValue) : inputValue.trim();
    if (q.inputType === "number" && (!val || val <= 0)) return;
    handleSelect(val);
  }

  function initYesNo(q) {
    if (Object.keys(yesNoState).length === 0 && q.yesNoSelect) {
      const initial = {};
      q.options.forEach(opt => { initial[opt.value] = opt.defaultYes; });
      setYesNoState(initial);
    }
  }

  function toggleYesNo(value) {
    setYesNoState(prev => ({ ...prev, [value]: !prev[value] }));
  }

  function handleYesNoContinue() {
    const q = questions[step];
    const newAnswers = { ...answers, [q.id]: { ...yesNoState } };
    setAnswers(newAnswers);
    setYesNoState({});
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      finalize(newAnswers);
    }
  }

  return {
    step,
    setStep,
    answers,
    inputValue,
    setInputValue,
    yesNoState,
    handleSelect,
    handleInputSubmit,
    initYesNo,
    toggleYesNo,
    handleYesNoContinue,
  };
}
