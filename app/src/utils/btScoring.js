// ─── BLDG Talent — Scoring Engine ───────────────────────────────────────
// Auto-score cognitive (tolerance matching), behavioral dimension scoring,
// grade/certification calculation, and composite overall score

import { BT_GRADE_SCALE, BT_MODULES, BT_P0_MODULE_KEYS } from "@/constants/btBrand";

// ── Grade from percentage ──
export function getGrade(pct) {
  for (const { min, grade } of BT_GRADE_SCALE) {
    if (pct >= min) return grade;
  }
  return "F";
}

// ── Certification level from percentage ──
export function getCertification(pct) {
  if (pct >= 96) return "master";
  if (pct >= 90) return "expert";
  if (pct >= 80) return "advanced";
  if (pct >= 70) return "certified";
  return null;
}

// ── Score Cognitive Module (Module 4) ──
// Compares responses against answer keys with tolerance
export function scoreCognitive(responses, questions) {
  let raw = 0;
  let max = 0;
  const perQuestion = [];

  for (const q of questions) {
    const userAnswer = parseFloat(responses[q.id]);
    const correct = q.answer;
    const tol = q.tolerance;
    max += q.points;

    let earned = 0;
    let isCorrect = false;

    if (!isNaN(userAnswer)) {
      if (tol === 0) {
        // Exact match (with floating point tolerance)
        isCorrect = Math.abs(userAnswer - correct) < 0.01;
      } else {
        // Within tolerance range
        isCorrect = Math.abs(userAnswer - correct) <= tol;
      }
      if (isCorrect) earned = q.points;
    }

    raw += earned;
    perQuestion.push({
      id: q.id,
      userAnswer: responses[q.id] || "",
      correctAnswer: correct,
      tolerance: tol,
      earned,
      maxPoints: q.points,
      correct: isCorrect,
    });
  }

  const pct = max > 0 ? Math.round((raw / max) * 100) : 0;

  return {
    raw,
    max,
    pct,
    grade: getGrade(pct),
    perQuestion,
  };
}

// ── Score Behavioral Module (Module 6) ──
// Computes 7 dimension scores from Likert responses
export function scoreBehavioral(responses, items) {
  // Group items by dimension
  const dimensionItems = {};
  for (const item of items) {
    if (!dimensionItems[item.dimension]) dimensionItems[item.dimension] = [];
    dimensionItems[item.dimension].push(item);
  }

  const dimensionScores = {};
  let totalNormalized = 0;
  let dimensionCount = 0;

  for (const [dim, dimItems] of Object.entries(dimensionItems)) {
    let sum = 0;
    let count = 0;

    for (const item of dimItems) {
      const raw = parseInt(responses[item.id]);
      if (isNaN(raw)) continue;

      // Reverse-score negative direction items
      const score = item.direction === "negative" ? 6 - raw : raw;
      sum += score;
      count++;
    }

    // Normalize to 0-100 scale (1-5 Likert → 0-100)
    const avg = count > 0 ? sum / count : 3; // Default to neutral if no answers
    const normalized = Math.round(((avg - 1) / 4) * 100);
    dimensionScores[dim] = Math.max(0, Math.min(100, normalized));
    totalNormalized += dimensionScores[dim];
    dimensionCount++;
  }

  // Overall behavioral score = average of all dimensions
  const pct = dimensionCount > 0 ? Math.round(totalNormalized / dimensionCount) : 0;

  return {
    dimensionScores,
    raw: pct,
    max: 100,
    pct,
    grade: getGrade(pct),
  };
}

// ── Compute Overall Score ──
// Weighted average of all module scores
export function computeOverall(moduleScores) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of BT_P0_MODULE_KEYS) {
    const mod = BT_MODULES[key];
    const score = moduleScores[key];
    if (!mod || !score) continue;

    // Re-normalize weights for P0 modules only
    totalWeight += mod.weight;
    weightedSum += score.pct * mod.weight;
  }

  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    score,
    grade: getGrade(score),
    cert: getCertification(score),
  };
}
