// ─── BLDG Talent — Module 6: Behavioral & Work Style ────────────────────
// 7 dimensions, ~24 Likert-scale items (1-5: Strongly Disagree → Strongly Agree)
// Maps to DISC-equivalent + construction-specific dimensions

export const BT_BEHAVIORAL_DIMENSIONS = [
  { key: "drive", label: "Drive / Dominance", description: "Decision speed, risk tolerance, competitiveness" },
  {
    key: "influence",
    label: "Influence / Communication",
    description: "Persuasion style, collaboration, social energy",
  },
  { key: "steadiness", label: "Steadiness / Consistency", description: "Patience, reliability, change tolerance" },
  {
    key: "conscientiousness",
    label: "Conscientiousness / Detail",
    description: "Accuracy orientation, rule-following, thoroughness",
  },
  {
    key: "deadline_mgmt",
    label: "Deadline Management",
    description: "How they handle time pressure (proactive vs reactive)",
  },
  { key: "risk_assessment", label: "Risk Assessment", description: "Tendency to flag risks vs. bury them" },
  {
    key: "conflict_resolution",
    label: "Conflict Resolution",
    description: "Avoidance vs confrontation vs collaboration",
  },
];

// Likert scale labels
export const BT_LIKERT_LABELS = [
  { value: 1, label: "Strongly Disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly Agree" },
];

// Behavioral items — each maps to one dimension
// direction: 'positive' = higher score → more of that dimension
// direction: 'negative' = higher score → LESS of that dimension (reverse-scored)
export const BT_BEHAVIORAL_ITEMS = [
  // ── Drive / Dominance (4 items) ──
  {
    id: "beh_01",
    statement: "I prefer to make decisions quickly, even with incomplete information.",
    dimension: "drive",
    direction: "positive",
  },
  {
    id: "beh_02",
    statement: "I thrive in competitive environments where my performance is measured.",
    dimension: "drive",
    direction: "positive",
  },
  {
    id: "beh_03",
    statement: "I would rather wait for consensus than push my opinion on others.",
    dimension: "drive",
    direction: "negative",
  },
  {
    id: "beh_04",
    statement: "When I see a problem, I take charge and start solving it immediately.",
    dimension: "drive",
    direction: "positive",
  },

  // ── Influence / Communication (3 items) ──
  {
    id: "beh_05",
    statement: "I enjoy presenting ideas and persuading others to see my perspective.",
    dimension: "influence",
    direction: "positive",
  },
  {
    id: "beh_06",
    statement: "I naturally build rapport with new people — clients, subs, and colleagues.",
    dimension: "influence",
    direction: "positive",
  },
  {
    id: "beh_07",
    statement: "I prefer to work independently rather than collaborating in groups.",
    dimension: "influence",
    direction: "negative",
  },

  // ── Steadiness / Consistency (3 items) ──
  {
    id: "beh_08",
    statement: "I prefer a predictable routine over constantly changing priorities.",
    dimension: "steadiness",
    direction: "positive",
  },
  {
    id: "beh_09",
    statement: "Frequent changes to project scope don't bother me — I adapt easily.",
    dimension: "steadiness",
    direction: "negative",
  },
  {
    id: "beh_10",
    statement: "I am patient when processes take longer than expected.",
    dimension: "steadiness",
    direction: "positive",
  },

  // ── Conscientiousness / Detail (4 items) ──
  {
    id: "beh_11",
    statement: "I double-check my calculations before submitting any estimate.",
    dimension: "conscientiousness",
    direction: "positive",
  },
  {
    id: "beh_12",
    statement: "I follow established procedures even when shortcuts are available.",
    dimension: "conscientiousness",
    direction: "positive",
  },
  {
    id: "beh_13",
    statement: "Small errors in quantities don't concern me if the overall number is close.",
    dimension: "conscientiousness",
    direction: "negative",
  },
  {
    id: "beh_14",
    statement: "I maintain organized files and documentation for every project.",
    dimension: "conscientiousness",
    direction: "positive",
  },

  // ── Deadline Management (3 items) ──
  {
    id: "beh_15",
    statement: "I plan my work backward from the deadline and build in buffer time.",
    dimension: "deadline_mgmt",
    direction: "positive",
  },
  {
    id: "beh_16",
    statement: "I work best under pressure when a deadline is approaching.",
    dimension: "deadline_mgmt",
    direction: "positive",
  },
  {
    id: "beh_17",
    statement: "I have sometimes missed deadlines because I was perfecting the details.",
    dimension: "deadline_mgmt",
    direction: "negative",
  },

  // ── Risk Assessment (4 items) ──
  {
    id: "beh_18",
    statement: "I proactively flag potential risks to my team, even if it creates more work.",
    dimension: "risk_assessment",
    direction: "positive",
  },
  {
    id: "beh_19",
    statement: "I include contingency in my estimates even when the client pushes back.",
    dimension: "risk_assessment",
    direction: "positive",
  },
  {
    id: "beh_20",
    statement: "I tend to be optimistic about project costs and timelines.",
    dimension: "risk_assessment",
    direction: "negative",
  },
  {
    id: "beh_21",
    statement: "If something looks off in a sub's proposal, I investigate before leveling.",
    dimension: "risk_assessment",
    direction: "positive",
  },

  // ── Conflict Resolution (3 items) ──
  {
    id: "beh_22",
    statement: "I address disagreements directly rather than avoiding confrontation.",
    dimension: "conflict_resolution",
    direction: "positive",
  },
  {
    id: "beh_23",
    statement: "When a subcontractor pushes back on scope, I find a collaborative solution.",
    dimension: "conflict_resolution",
    direction: "positive",
  },
  {
    id: "beh_24",
    statement: "I tend to defer to authority figures even when I disagree with their approach.",
    dimension: "conflict_resolution",
    direction: "negative",
  },
];
