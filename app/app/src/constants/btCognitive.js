// ─── BLDG Talent — Module 4: Cognitive Reasoning & Cost Logic ───────────
// 15 fill-in-the-blank questions across 5 sections
// All questions, answers, tolerances, and explanations from the spec

export const BT_COGNITIVE_SECTIONS = [
  { key: "takeoff", label: "Quantity Takeoff & Measurement", questions: ["cog_01", "cog_02", "cog_03"] },
  { key: "cost", label: "Cost Estimation & Adjustments", questions: ["cog_04", "cog_05", "cog_06"] },
  { key: "productivity", label: "Productivity & Scheduling", questions: ["cog_07", "cog_08", "cog_09"] },
  { key: "contract", label: "Contract & Risk Analysis", questions: ["cog_10", "cog_11", "cog_12"] },
  { key: "realworld", label: "Real-World Problem Solving", questions: ["cog_13", "cog_14", "cog_15"] },
];

export const BT_COGNITIVE_QUESTIONS = [
  // ── Section 1: Quantity Takeoff & Measurement ──
  {
    id: "cog_01",
    section: "takeoff",
    question: "A concrete slab measures 60' x 40' x 6\" thick. How many cubic yards of concrete are required?",
    inputType: "number",
    unit: "CY",
    answer: 44.44,
    tolerance: 0.5,
    points: 13,
    explanation: "60 \u00d7 40 \u00d7 0.5 = 1,200 CF \u00f7 27 = 44.44 CY",
  },
  {
    id: "cog_02",
    section: "takeoff",
    question:
      'A brick wall is 100\' long and 10\' high with 5% waste. If bricks are 3.5" x 2.25" x 8" and mortar joints are 3/8", estimate the number of bricks needed.',
    inputType: "number",
    unit: "bricks",
    answer: 7200,
    tolerance: 500, // Accept 6700–7700
    points: 13,
    explanation:
      'Wall area = 1,000 SF. Standard modular brick with 3/8" joints \u2248 6.86 bricks/SF. 1,000 \u00d7 6.86 = 6,860 \u00d7 1.05 waste \u2248 7,203',
  },
  {
    id: "cog_03",
    section: "takeoff",
    question:
      "A roofing project requires 30 squares of shingles. If each bundle covers 1/3 of a square and costs $35, what is the total material cost?",
    inputType: "number",
    unit: "$",
    answer: 3150,
    tolerance: 0,
    points: 13,
    explanation: "30 squares \u00d7 3 bundles/square = 90 bundles \u00d7 $35 = $3,150",
  },

  // ── Section 2: Cost Estimation & Adjustments ──
  {
    id: "cog_04",
    section: "cost",
    question: "If 1,000 LF of ductwork costs $12,500, what is the cost per LF if a 7% escalation is applied?",
    inputType: "number",
    unit: "$/LF",
    answer: 13.375,
    tolerance: 0.01,
    points: 13,
    explanation: "$12,500 \u00d7 1.07 = $13,375 \u00f7 1,000 = $13.375/LF",
  },
  {
    id: "cog_05",
    section: "cost",
    question:
      "Labor productivity is 12 man-hours per ton of steel. If the crew is paid $55/hour, what is the labor cost for 25 tons?",
    inputType: "number",
    unit: "$",
    answer: 16500,
    tolerance: 0,
    points: 13,
    explanation: "12 \u00d7 25 = 300 man-hours \u00d7 $55 = $16,500",
  },
  {
    id: "cog_06",
    section: "cost",
    question:
      "A project's original estimate was $1.2M. After value engineering, costs drop 8%, but a 5% contingency is added. What is the new estimate?",
    inputType: "number",
    unit: "$",
    answer: 1159200,
    tolerance: 100,
    points: 13,
    explanation: "$1.2M \u00d7 0.92 = $1,104,000 \u00d7 1.05 = $1,159,200",
  },

  // ── Section 3: Productivity & Scheduling ──
  {
    id: "cog_07",
    section: "productivity",
    question:
      "A crew of 6 workers can install 1,200 SF of flooring in 3 days. How many workers are needed to install 3,000 SF in 2 days?",
    inputType: "number",
    unit: "workers",
    answer: 23,
    tolerance: 0.5, // Accept 22.5 or 23
    points: 13,
    explanation:
      "Rate = 1,200 / (6 \u00d7 3) = 66.67 SF/worker/day. Need 3,000 / 2 = 1,500 SF/day. Workers = 1,500 / 66.67 = 22.5 \u2192 23",
  },
  {
    id: "cog_08",
    section: "productivity",
    question: "If a task takes 80 hours at an 11% inefficiency rate, what is the adjusted duration?",
    inputType: "number",
    unit: "hours",
    answer: 88.8,
    tolerance: 0.1,
    points: 13,
    explanation: "80 \u00d7 1.11 = 88.8 hours",
  },
  {
    id: "cog_09",
    section: "productivity",
    question:
      "An excavation crew removes 150 CY/day. If the site has 1,800 CY, how many days are needed with a 15% weather delay factored in?",
    inputType: "number",
    unit: "days",
    answer: 14,
    tolerance: 0.2, // Accept 13.8 or 14
    points: 13,
    explanation: "1,800 / 150 = 12 days \u00d7 1.15 = 13.8 \u2192 14 days",
  },

  // ── Section 4: Contract & Risk Analysis ──
  {
    id: "cog_10",
    section: "contract",
    question:
      "A subcontractor quotes $85,000 for a scope but excludes 10% of the work. What should the estimator adjust the bid to?",
    inputType: "number",
    unit: "$",
    answer: 94444.44,
    tolerance: 50,
    points: 13,
    explanation: "$85,000 / 0.90 = $94,444.44 \u2014 quote covers 90% of scope",
  },
  {
    id: "cog_11",
    section: "contract",
    question:
      "If a contract has a 5% retainage and the project is 60% complete with $500,000 billed, how much retainage is held?",
    inputType: "number",
    unit: "$",
    answer: 25000,
    tolerance: 0,
    points: 13,
    explanation: "$500,000 \u00d7 0.05 = $25,000",
  },
  {
    id: "cog_12",
    section: "contract",
    question:
      "A change order adds $25,000 in direct costs. With 10% overhead and 8% profit, what is the total revised cost?",
    inputType: "number",
    unit: "$",
    answer: 29700,
    tolerance: 0,
    points: 13,
    explanation: "$25,000 \u00d7 1.10 = $27,500 \u00d7 1.08 = $29,700",
  },

  // ── Section 5: Real-World Problem Solving ──
  {
    id: "cog_13",
    section: "realworld",
    question:
      "Concrete is $150/CY, labor is $65/CY, and equipment is $20/CY. If the project needs 120 CY, what is the total cost if overhead is 12%?",
    inputType: "number",
    unit: "$",
    answer: 31584,
    tolerance: 0,
    points: 14,
    explanation: "(150 + 65 + 20) \u00d7 120 = $28,200 \u00d7 1.12 = $31,584",
  },
  {
    id: "cog_14",
    section: "realworld",
    question: `Tenant fit-out bid calculation:
\u2022 Direct Materials: $68,000
\u2022 Direct Labor: $42,000
\u2022 Equipment Rental: $5,500
\u2022 Subcontractor Fees: $12,000
\u2022 Company Overhead: 10% of direct costs (materials + labor + equipment)
\u2022 5% profit margin applied after overhead
\u2022 2% contingency for design changes

Calculate the total bid price (before bid bond).`,
    inputType: "number",
    unit: "$",
    answer: 147903,
    tolerance: 1500, // Accept reasonable order-of-operations variations
    points: 14,
    explanation:
      "Direct costs = $115,500. OH = $11,550. Subtotal = $139,050. Profit = $6,952.50. Sub = $146,002.50. Contingency = $2,920.05. Total \u2248 $147,903",
  },
  {
    id: "cog_15",
    section: "realworld",
    question: `Supplier comparison:
\u2022 Need 1,200 LF of electrical conduit
\u2022 Supplier A: $18.50/LF, no discounts, $1,200 flat freight
\u2022 Supplier B: $20.00/LF, 10% discount if order exceeds $25,000, $800 freight

What is Supplier A's total cost?`,
    inputType: "number",
    unit: "$",
    answer: 23400,
    tolerance: 0,
    points: 14,
    explanation:
      "1,200 \u00d7 $18.50 + $1,200 = $23,400. Supplier B: 1,200 \u00d7 $20 = $24,000 (< $25K, no discount) + $800 = $24,800. A is cheaper by $1,400.",
  },
];
