# BLDG Talent — Complete Build Specification

> **This document captures the full product vision, architecture, content, business model, and execution plan for BLDG Talent — a verified estimator skills assessment platform built inside NOVATerra.**
>
> **CRITICAL: BLDG Talent is NOT a separate app. It lives inside the NOVATerra codebase as role-gated routes and components. One repo, one deploy, one set of shared components.**

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Roles & Access Control](#2-user-roles--access-control)
3. [The "Inside the Club" UX](#3-the-inside-the-club-ux)
4. [Assessment Modules — Complete Content](#4-assessment-modules--complete-content)
5. [Scoring & Certification System](#5-scoring--certification-system)
6. [Results Report](#6-results-report)
7. [Recruiter / Admin Portal](#7-recruiter--admin-portal)
8. [Database Schema](#8-database-schema)
9. [File Structure](#9-file-structure)
10. [Architecture Decisions](#10-architecture-decisions)
11. [Business Model](#11-business-model)
12. [Execution Plan — Phased Build](#12-execution-plan--phased-build)
13. [Future Vertical Steps](#13-future-vertical-steps)
14. [Market Context](#14-market-context)
15. [Brand Constants](#15-brand-constants)

---

## 1. Product Overview

### What It Is
BLDG Talent is a verified estimator skills assessment platform. Estimators take a comprehensive 85-minute test covering bid leveling, communication, math/logic, plan reading, software proficiency, and personality. They receive a score, a professional badge, and a shareable profile. Recruiters and employers pay to access scored candidate data.

### Why It Exists
- Zero competitors offer a practical, simulation-based estimator assessment
- GCs pay recruiters $17K-$40K per estimator placement with no quality guarantee
- 94% of contractors report trouble filling estimator roles (AGC)
- 65% of senior estimators retire within 7 years
- Existing certifications (ASPE CPE, AACE CEP) take months and cost thousands — they're credentialing programs, not hiring screens
- Indeed/LinkedIn assessments are shallow multiple-choice quizzes — LinkedIn discontinued theirs entirely

### The Funnel
Every estimator who takes the BLDG Talent assessment experiences the NOVATerra UI. They're literally inside the app — seeing the sidebar, the theme, the layout — with most features teased/locked. The assessment is a 90-minute product demo for NOVATerra.

### Brand Family
- **BLDG** — parent brand
- **NOVATerra** — AI-powered construction estimating platform (the main app)
- **BLDG Talent** — verified estimator skills platform (lives inside NOVATerra)
- **NOVA** — AI personality powering both ("Powered by NOVA")

---

## 2. User Roles & Access Control

**Login determines what you see. Three completely separate experiences in one app.**

### Role: `novaterra` (NOVATerra Customer)
- **Sees**: The full NOVATerra app exactly as it exists today
- **Does NOT see**: Any BLDG Talent routes, nav items, or UI elements
- **No changes needed** to the existing NOVATerra experience
- This is the default role for existing users

### Role: `candidate` (Estimator Taking Assessment)
- **Sees**: The NOVATerra shell (sidebar, header, theme) with BLDG Talent assessment content
- **Sidebar shows**: All NOVATerra nav items, but most are LOCKED/TEASED
- **Unlocked routes**: `/assessment/*`, `/bt/profile`, `/bt/results`
- **Locked sections**: Dashboard, Inbox, NOVA Core, Intelligence, People, Settings — visible but grayed out with teasers
- **Signs up via**: A separate registration flow (not the standard NOVATerra signup)
- **Does NOT load**: NOVATerra stores, persistence hooks, cloud sync, auto-save — only BLDG Talent stores

### Role: `bt_admin` (Recruiter / BLDG Talent Admin)
- **Sees**: The BLDG Talent admin portal — candidate management, search, scoring, reports
- **Routes**: `/bt/admin/*` (dashboard, candidates, assessments, reports, settings)
- **Sidebar shows**: BLDG Talent admin nav (completely different from NOVATerra nav)
- **Can**: Search/filter candidates, send assessment invitations, view detailed reports, compare candidates side-by-side, manage assessment configurations
- **Does NOT see**: NOVATerra estimating features

### Role Determination
- Stored in Supabase `auth.users.user_metadata.app_role` or a `bt_user_roles` table
- Checked on login in `App.jsx` — routes to the appropriate experience
- `authStore` extended with a `appRole` field: `'novaterra' | 'candidate' | 'bt_admin'`
- Default role for existing users: `novaterra` (backward compatible — nothing changes)

### Route Guard Pattern
```jsx
// In App.jsx — top-level routing by role
function AppRouter() {
  const appRole = useAuthStore(s => s.appRole);

  if (appRole === 'candidate') return <CandidateLayout />;
  if (appRole === 'bt_admin') return <BTAdminLayout />;
  return <NOVATerraLayout />; // existing app, unchanged
}
```

---

## 3. The "Inside the Club" UX

### Candidate Experience — NOVATerra Shell with Locked Features

When a candidate logs in, they see the real NOVATerra interface. Same sidebar, same header, same theme, same ambient effects. But they're in guest mode.

#### Sidebar Nav — What Candidates See

| Nav Item | State | Behavior |
|----------|-------|----------|
| **BLDG Talent** (section header) | Active | Section label for assessment items |
| **Assessment** | **Unlocked** | Their active modules — where they work |
| **My Profile** | **Unlocked** | Candidate profile (name, experience, location) |
| **Results** | **Unlocked** (post-completion) | Score card, badge, breakdown |
| --- divider --- | | |
| **NOVATerra** (section header) | Dimmed | Section label for teased features |
| Dashboard | **Locked** | Grayed out — hover: "AI-powered project dashboard" |
| Inbox | **Locked** | Hover: "Automated RFP and bid management" |
| NOVA Core | **Locked** | Hover: "Cost database and assemblies" |
| Intelligence | **Locked** | Hover: "AI-driven project intelligence" |
| People | **Locked** | Hover: "Subcontractor network management" |
| Settings | **Locked** | Hover: "Customizable themes and preferences" |

#### Locked Section Behavior
- Nav items are visible but styled at 40% opacity with a lock icon
- Clicking a locked item shows a modal with:
  - A blurred/dimmed screenshot of the feature in action
  - Feature name + 1-line description
  - "Explore NOVATerra" CTA button → links to NOVATerra marketing page or signup
- The tease is subtle and premium — not a hard sell, just a glimpse

#### During the Assessment
- The PDF viewer in Module 1 (bid leveling) uses the same split-pane layout NOVATerra uses for plan viewing
- Input fields use the same `inp()` styled inputs from `@/utils/styles`
- The timer pill in the corner follows the ActivityTimerPill pattern
- The overall feel is: "I'm using a real professional tool, not a quiz website"

#### After Completion
- Results page shows score + badge + radar chart
- Below results: "You just experienced a fraction of NOVATerra. See what the full platform can do."
- CTA: "Explore NOVATerra" button
- "Share Your Score" → generates a branded LinkedIn/email card
- "Download Report" → PDF export matching the Steve C. results template

---

## 4. Assessment Modules — Complete Content

### Module 1: Bid Leveling (Flagship — 25 minutes)

**What it tests**: Can the estimator read real subcontractor proposals, identify scope inclusions/exclusions, spot gaps, and make a recommendation?

**Setup**: Candidate receives 3 subcontractor proposals (rendered as PDFs in a split-pane viewer) for a Division 09 Finishes scope on a ground-up commercial building, plus an internal estimate baseline.

**The 3 Proposals**:

#### ABC Contracting (PDF 1)
- Format: Professional typed proposal with itemized pricing
- Scope: Drywall, framing, ACT ceilings, finishing
- **Intentional gaps to catch**:
  - Missing Partition Type D
  - Missing ACT-2 (WoodWorks Grille)
  - No hung ceilings included
  - No FRP (Fiber Reinforced Panel)
  - Excludes certain door types

#### Blue Sky Builders (PDF 2)
- Format: More casual, paragraph-style proposal with embedded pricing
- Scope: Drywall, framing, ACT ceilings, some finishing
- **Intentional issues to catch**:
  - Substitutes Armstrong Dune for the specified WoodWorks Grille on ACT-2 (material substitution)
  - Different format makes direct comparison harder
  - Some scope items described differently than the internal estimate

#### Elevate Interiors (PDF 3)
- Format: Detailed line-item breakdown
- Scope: Comprehensive drywall and finish package
- **Intentional issues to catch**:
  - Excludes weather barrier
  - Only covers 8 of 16 doors (partial scope)
  - Most complete overall but with specific exclusions

**Candidate Tasks**:
1. For each line item in the internal estimate: identify whether it's included, excluded, or unclear in each proposal
2. Fill in placeholder numbers where scope is missing using data from other proposals
3. Highlight all assumed numbers (yellow flag equivalent in the UI)
4. Reverse engineer any missing unit costs where possible
5. Write a 4-6 sentence summary evaluating the bids and identifying which subcontractor they'd recommend and why

**Scoring**: Auto-scored against answer key for scope identification (partial credit for close answers). Summary evaluated by AI for reasoning quality, clarity, and accuracy of recommendation.

**Future variants** (Phase 4+): Add scenarios for mechanical, electrical, sitework, tenant improvement — randomly assigned to prevent test-sharing.

---

### Module 2: Communication & Judgment (15 minutes)

**What it tests**: Can the estimator communicate professionally with clients, subs, PMs, and leadership under realistic pressure?

**Format**: 10 scenario prompts. Candidate writes a response as if composing a real email or message. AI-scored for tone, professionalism, clarity, and judgment.

#### The 10 Scenarios:

**1. Client — Padding Accusation**
> "Why is the estimate so much higher than I expected? You must be padding it somewhere."

**2. Subcontractor — Missing Scope**
> Your drywall sub submits a proposal that's missing major scope. How do you professionally address this without souring the relationship?

**3. Client — Schedule Pressure**
> The client wants a faster turnaround on an estimate, but you're waiting on critical vendor pricing. How do you respond to set expectations?

**4. Architect — Design Changes**
> Midway through the estimate, the architect issues a revised drawing set with significant changes. How do you communicate the impact and next steps?

**5. PM — Internal Pressure**
> A project manager is pushing for you to "just throw a number on it" for a scope you don't have drawings for. How do you respond while maintaining professionalism and risk awareness?

**6. Client — Allowance Challenge**
> The client responds to a submitted bid asking you why you have included allowances and why you can't provide firm pricing for specific items.

**7. Client — Cost Cutting**
> Client asks, "How can we get this price down by 15% without changing the scope?"

**8. Client — Incomplete Design**
> The plans are clearly schematic but the client wants a hard number. How do you communicate the limitations of your estimate?

**9. Boss — Post-Bid Loss Assessment**
> "We didn't win the job. Can you give me a brief breakdown of where you think we lost it and how we can improve next time?"

**10. Boss — Time & Priority Management**
> "You've got a huge GMP due Friday, your inbox is flooded with questions from subcontractors, and the architect just issued revised drawings midstream. You haven't even reviewed the structural yet, and it's Wednesday morning. What do you do first and how do you make sure we don't blow the deadline or submit a half-baked number?"

**Scoring Criteria** (AI-evaluated per response):
- Professional tone (0-10)
- Real-world judgment quality (0-10)
- Business logic and clarity (0-10)
- Weighted heavier for scenarios 9 and 10 (boss scenarios test leadership)

**Anti-cheat**: AI text detection on all responses. Tab-switch monitoring. Responses flagged if they match known AI writing patterns.

---

### Module 3: Plan Reading & Quantity Takeoff (15 minutes)

**What it tests**: Can the estimator look at construction drawings and extract quantities?

**Format**: Interactive — candidate views floor plans, elevations, and wall sections in the browser and answers quantity-based questions.

**Question Types**:
- "Calculate the total SF of flooring for the highlighted rooms"
- "Count the number of interior doors shown on this plan"
- "What is the linear footage of partition type A on this elevation?"
- "Calculate the SF of drywall on the north wall, including deductions for openings"
- "Identify which rooms have ACT ceiling vs. GWB ceiling based on the finish schedule"

**Implementation**: Static plan images with interactive measurement overlays. Candidate types answers. Auto-scored against pre-calculated answer key with tolerance ranges (e.g., +/- 5% for area calculations).

**NOTE**: This module needs plan images created. For MVP, can use simplified/synthetic floor plans. Phase 2 adds real-world complexity.

---

### Module 4: Cognitive Reasoning & Cost Logic (15 minutes)

**What it tests**: Practical math, scheduling logic, productivity thinking, cost estimation, and contract awareness.

**Format**: 15 fill-in-the-blank questions across 5 sections. Calculator allowed. Auto-scored.

#### Section 1: Quantity Takeoff & Measurement

**Q1**: A concrete slab measures 60' x 40' x 6" thick. How many cubic yards of concrete are required?
> Answer: 44.44 CY (60 × 40 × 0.5 = 1,200 CF ÷ 27 = 44.44)

**Q2**: A brick wall is 100' long and 10' high with 5% waste. If bricks are 3.5" x 2.25" x 8" and mortar joints are 3/8", estimate the number of bricks needed.
> Answer: ~7,560 bricks. Wall area = 1,000 SF. Standard modular brick with 3/8" joints = ~6.86 bricks/SF (based on 8.375" × 2.625" coursing). 1,000 × 6.86 = 6,860 × 1.05 waste = ~7,203. (Accept range: 6,800-7,700 depending on method)

**Q3**: A roofing project requires 30 squares of shingles. If each bundle covers 1/3 of a square and costs $35, what is the total material cost?
> Answer: $3,150 (30 squares × 3 bundles/square = 90 bundles × $35 = $3,150)

#### Section 2: Cost Estimation & Adjustments

**Q4**: If 1,000 LF of ductwork costs $12,500, what is the cost per LF if a 7% escalation is applied?
> Answer: $13.375/LF ($12,500 × 1.07 = $13,375 ÷ 1,000 = $13.375)

**Q5**: Labor productivity is 12 man-hours per ton of steel. If the crew is paid $55/hour, what is the labor cost for 25 tons?
> Answer: $16,500 (12 × 25 = 300 man-hours × $55 = $16,500)

**Q6**: A project's original estimate was $1.2M. After value engineering, costs drop 8%, but a 5% contingency is added. What is the new estimate?
> Answer: $1,159,200 ($1.2M × 0.92 = $1,104,000 × 1.05 = $1,159,200)

#### Section 3: Productivity & Scheduling

**Q7**: A crew of 6 workers can install 1,200 SF of flooring in 3 days. How many workers are needed to install 3,000 SF in 2 days?
> Answer: 22.5 → 23 workers. (Rate = 1,200 / (6 × 3) = 66.67 SF/worker/day. Need 3,000 / 2 = 1,500 SF/day. Workers = 1,500 / 66.67 = 22.5 → round up to 23)

**Q8**: If a task takes 80 hours at an 11% inefficiency rate, what is the adjusted duration?
> Answer: 88.8 hours (80 × 1.11 = 88.8)

**Q9**: An excavation crew removes 150 CY/day. If the site has 1,800 CY, how many days are needed with a 15% weather delay factored in?
> Answer: 13.8 → 14 days (1,800 / 150 = 12 days × 1.15 = 13.8 → 14 days)

#### Section 4: Contract & Risk Analysis

**Q10**: A subcontractor quotes $85,000 for a scope but excludes 10% of the work. What should the estimator adjust the bid to?
> Answer: $94,444.44 ($85,000 / 0.90 = $94,444.44 — the quote covers 90% of scope, so full scope = quote ÷ 0.90)

**Q11**: If a contract has a 5% retainage and the project is 60% complete with $500,000 billed, how much retainage is held?
> Answer: $25,000 ($500,000 × 0.05 = $25,000)

**Q12**: A change order adds $25,000 in direct costs. With 10% overhead and 8% profit, what is the total revised cost?
> Answer: $29,700 ($25,000 × 1.10 = $27,500 × 1.08 = $29,700)

#### Section 5: Real-World Problem Solving

**Q13**: Concrete is $150/CY, labor is $65/CY, and equipment is $20/CY. If the project needs 120 CY, what is the total cost if overhead is 12%?
> Answer: $31,584 ((150 + 65 + 20) × 120 = $28,200 × 1.12 = $31,584)

**Q14**: You're preparing a bid for a tenant fit-out. The estimated costs are:
- Direct Materials: $68,000
- Direct Labor: $42,000
- Equipment Rental: $5,500
- Subcontractor Fees: $12,000
- Company Overhead: 10% of direct costs (materials + labor + equipment)
- 5% profit margin applied after overhead
- 5% bid bond (based on total bid price)
- 2% contingency for design changes

Task: Calculate the total bid price including overhead, profit, and contingency. Determine the bid bond cost. If the client negotiates a 3% discount, what is the final adjusted bid?

> Answer:
> - Direct costs = $68,000 + $42,000 + $5,500 = $115,500
> - Overhead = $115,500 × 0.10 = $11,550
> - Subtotal = $115,500 + $11,550 + $12,000 = $139,050
> - Profit = $139,050 × 0.05 = $6,952.50
> - Subtotal with profit = $145,002.50 (accept $146,002.50 if sub fees included in overhead base)
> - Contingency = $145,002.50 × 0.02 = $2,900.05
> - Total bid = $147,902.55
> - Bid bond = $147,902.55 × 0.05 = $7,395.13
> - 3% discount = $147,902.55 × 0.97 = $143,465.47
> (Accept reasonable variations based on order of operations — this tests whether they understand the BUILD-UP sequence, not just the math)

**Q15**: You need 1,200 LF of electrical conduit for a project.
- Supplier A charges $18.50/LF with no discounts.
- Supplier B offers $20.00/LF but gives a 10% discount if the order exceeds $25,000.
- Freight costs are $1,200 flat fee for Supplier A and $800 for Supplier B.

Task:
1. Calculate the total cost for both suppliers.
2. Determine which supplier is cheaper and by how much.
3. If the project budget is $24,000, can you afford Supplier B without the discount?

> Answer:
> - Supplier A: 1,200 × $18.50 + $1,200 = $23,400
> - Supplier B (check if discount applies): 1,200 × $20.00 = $24,000 > $25,000? No. So no discount.
> - Supplier B without discount: $24,000 + $800 = $24,800
> - Supplier A is cheaper by $1,400
> - Can afford Supplier B on $24,000 budget? $24,800 > $24,000 → No

---

### Module 5: Software Proficiency (5 minutes)

**What it tests**: Has the estimator actually used common estimating tools, or are they just listing them on their resume?

**Format**: Visual recognition — screenshots/mockups of software interfaces with questions about tool identification, function identification, and workflow knowledge.

**Question Types** (10-12 questions):
- Show a Bluebeam Revu toolbar: "Which tool would you use to measure the perimeter of an irregular shape?"
- Show an Excel formula: "What does this VLOOKUP calculate in an estimating context?"
- Show an On-Screen Takeoff interface: "What measurement mode is currently active?"
- Show a PlanSwift screen: "Identify what type of takeoff condition is being created"
- Show a Procore dashboard: "What section would you navigate to for submittals?"
- "Which software would you use to create a quantity takeoff from a PDF plan set?"
- "What file format do most plan rooms distribute electronic drawings in?"

**Scoring**: Multiple choice, auto-scored. Tests recognition and practical knowledge, not just "I've heard of it."

**NOTE**: Need to create or source screenshot mockups. Can use simplified representations for MVP.

---

### Module 6: Behavioral & Work Style (10 minutes)

**What it tests**: Personality traits, work style preferences, communication tendencies — replaces the external Tony Robbins DISC assessment.

**Format**: Forced-choice pairs or Likert scale statements. 30-40 items.

**Dimensions Measured** (maps to DISC-equivalent):
1. **Drive / Dominance** — Decision speed, risk tolerance, competitiveness
2. **Influence / Communication** — Persuasion style, collaboration, social energy
3. **Steadiness / Consistency** — Patience, reliability, change tolerance
4. **Conscientiousness / Detail** — Accuracy orientation, rule-following, thoroughness

**Additional Construction-Specific Dimensions**:
5. **Deadline Management** — How they handle time pressure (proactive vs reactive)
6. **Risk Assessment** — Tendency to flag risks vs. bury them
7. **Conflict Resolution** — Avoidance vs confrontation vs collaboration

**Output**: A behavioral profile summary that feeds into the results report. Maps to sections: "Behavioral Style," "Professional Strengths," "Growth Considerations," "Top Motivators," "Workplace Impact."

**NOTE**: This module's questions need to be written. Base on validated psychometric frameworks (Big Five or DISC structure) adapted for construction context. For MVP, can start with 20 items covering the 4 primary dimensions.

---

## 5. Scoring & Certification System

### Module Weights

| Module | Weight | Max Points |
|--------|--------|------------|
| 1. Bid Leveling | 30% | 300 |
| 2. Communication | 20% | 200 |
| 3. Plan Reading | 15% | 150 |
| 4. Cognitive Reasoning | 20% | 200 |
| 5. Software Proficiency | 5% | 50 |
| 6. Behavioral | 10% | 100 |
| **Total** | **100%** | **1000** |

### Certification Levels

| Level | Score Range | Badge Color | Label |
|-------|------------|-------------|-------|
| Not Certified | < 70% | None | — |
| **BLDG Certified** | 70-79% | Bronze | Certified Estimator |
| **BLDG Advanced** | 80-89% | Silver | Advanced Estimator |
| **BLDG Expert** | 90-95% | Gold | Expert Estimator |
| **BLDG Master** | 96-100% | Platinum | Master Estimator |

### Grading Scale

| Grade | Range |
|-------|-------|
| A+ | 97-100% |
| A | 93-96% |
| A- | 90-92% |
| B+ | 87-89% |
| B | 83-86% |
| B- | 80-82% |
| C+ | 77-79% |
| C | 73-76% |
| C- | 70-72% |
| D+ | 67-69% |
| D | 60-66% |
| F | < 60% |

### Time Tracking
- Each module individually timed
- Total assessment time recorded
- Time benchmarks displayed on results (vs average)
- Significantly fast completion flagged (potential gaming)
- Significantly slow completion noted (efficiency concern)

### Percentile Ranking
- Calculated against all test-takers once database reaches 50+ assessments
- Displayed as: "Scored better than 73% of estimators"
- Per-module percentiles also calculated

---

## 6. Results Report

**Modeled after the Steve Catalanotto results PDF the client created.** Must match this quality and format.

### Page 1 — Quantitative + Profile

- **Header**: BLDG Talent logo + "Powered by NOVA"
- **Candidate Info**: Photo (optional), name, email, phone, location
- **Assessment Date** and **Total Duration**
- **Module Scores**: Each module with individual score, duration, and grade
- **Overall Score**: Weighted composite + letter grade + certification level badge
- **Percentile Ranking**: "Scored better than X% of estimators"
- **Radar Chart**: Visual breakdown across all 6 modules
- **Salary Recommendation**: Based on score, experience, and location data

### Page 2 — Qualitative Insights (AI-Generated by NOVA)

- **Overall Assessment**: 3-4 sentence narrative summarizing performance
- **Behavioral Style**: Based on Module 6 results — communication style, work preferences
- **Professional Strengths**: Top 3-4 identified strengths from assessment data
- **Growth Considerations**: Areas for development (diplomatically framed)
- **Top Motivators**: What drives this estimator (from behavioral assessment)
- **Workplace Impact**: How they'd fit in a team environment
- **Final Recommendation**: Hiring guidance for the recruiter/employer

### Delivery
- Displayed in-app on the Results page
- Downloadable as PDF
- Shareable via unique URL (public profile)
- LinkedIn badge card generator (image they can post)

---

## 7. Recruiter / Admin Portal

### Dashboard (`/bt/admin/dashboard`)
- Total candidates assessed
- Average scores by module
- Recent assessment completions
- Score distribution chart
- Pipeline summary

### Candidate Search (`/bt/admin/candidates`)
- Searchable database of all assessed estimators
- Filters: score range, location, experience level, trade focus, salary expectations, availability, certification level, assessment date
- Sort by: overall score, individual module scores, completion date
- Side-by-side candidate comparison (select 2-3 candidates)

### Assessment Management (`/bt/admin/assessments`)
- Send assessment invitations (branded link via email)
- Track invitation status (sent, started, completed, expired)
- Bulk invite capability
- Custom invitation messaging

### Candidate Detail (`/bt/admin/candidates/:id`)
- Full results report (same as candidate sees)
- Module-by-module deep dive
- AI-generated hiring recommendation
- Contact info + action buttons
- Notes field for recruiter annotations

### Reports (`/bt/admin/reports`)
- Downloadable PDF reports per candidate
- Batch export capability
- Custom report branding (white-label — Phase 3)

### Settings (`/bt/admin/settings`)
- Company profile
- Team member management (invite other recruiters)
- Subscription/billing management
- Assessment configuration preferences
- Notification preferences

---

## 8. Database Schema

All BLDG Talent tables use the `bt_` prefix to distinguish from NOVATerra tables. They live in the same Supabase project.

```sql
-- ═══════════════════════════════════════════════════════
-- BLDG TALENT — Database Schema
-- ═══════════════════════════════════════════════════════

-- User role assignment (extends Supabase auth)
CREATE TABLE bt_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'bt_admin', 'novaterra')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Candidate profiles (estimator-facing)
CREATE TABLE bt_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location_city TEXT,
  location_state TEXT,
  years_experience INTEGER,
  current_employer TEXT,
  past_employers JSONB DEFAULT '[]',  -- [{name, years, role}]
  trade_focus JSONB DEFAULT '[]',     -- CSI divisions they specialize in
  project_types JSONB DEFAULT '[]',   -- ['commercial', 'healthcare', 'multifamily', etc.]
  software_tools JSONB DEFAULT '[]',  -- self-reported tool list
  salary_min INTEGER,
  salary_max INTEGER,
  availability TEXT,                   -- 'immediately', '2_weeks', '1_month', 'not_looking'
  avatar_url TEXT,
  linkedin_url TEXT,
  resume_url TEXT,
  profile_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Assessment sessions
CREATE TABLE bt_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES bt_candidates(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),  -- recruiter who sent invite (nullable for self-initiated)
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'expired')),
  scenario_variant TEXT,              -- which bid leveling scenario was assigned
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_seconds INTEGER,
  overall_score NUMERIC(5,2),
  overall_grade TEXT,
  certification_level TEXT,           -- 'certified', 'advanced', 'expert', 'master', null
  percentile_rank NUMERIC(5,2),
  ai_summary TEXT,                    -- AI-generated overall assessment narrative
  ai_recommendation TEXT,             -- AI-generated hiring recommendation
  salary_recommendation JSONB,        -- {min, max, notes}
  report_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual module results
CREATE TABLE bt_module_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES bt_assessments(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('bid_leveling', 'communication', 'plan_reading', 'cognitive', 'software', 'behavioral')),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  raw_score NUMERIC(5,2),
  max_score NUMERIC(5,2),
  weighted_score NUMERIC(5,2),
  grade TEXT,
  percentile_rank NUMERIC(5,2),
  responses JSONB DEFAULT '{}',       -- all answers/responses for this module
  scoring_details JSONB DEFAULT '{}', -- per-question scoring breakdown
  ai_feedback TEXT,                   -- AI-generated module-specific feedback
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Behavioral assessment results (Module 6 detail)
CREATE TABLE bt_behavioral_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES bt_assessments(id) ON DELETE CASCADE,
  drive_score NUMERIC(3,1),           -- Dominance / Drive (0-100)
  influence_score NUMERIC(3,1),       -- Influence / Communication (0-100)
  steadiness_score NUMERIC(3,1),      -- Steadiness / Consistency (0-100)
  conscientiousness_score NUMERIC(3,1), -- Detail / Conscientiousness (0-100)
  deadline_mgmt_score NUMERIC(3,1),
  risk_assessment_score NUMERIC(3,1),
  conflict_resolution_score NUMERIC(3,1),
  behavioral_style TEXT,              -- AI-generated summary
  professional_strengths TEXT,
  growth_considerations TEXT,
  top_motivators TEXT,
  workplace_impact TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recruiter / Admin organizations
CREATE TABLE bt_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('recruiter', 'gc', 'staffing_firm', 'other')),
  contact_email TEXT,
  website TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  subscription_status TEXT DEFAULT 'active',
  max_assessments_month INTEGER,      -- null = unlimited
  white_label_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recruiter org membership
CREATE TABLE bt_org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES bt_organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Assessment invitations
CREATE TABLE bt_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES bt_organizations(id),
  invited_by UUID REFERENCES auth.users(id),
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,
  message TEXT,                        -- custom invitation message
  token TEXT UNIQUE NOT NULL,          -- unique invitation link token
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'opened', 'started', 'completed', 'expired')),
  assessment_id UUID REFERENCES bt_assessments(id), -- linked once started
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Recruiter notes on candidates
CREATE TABLE bt_recruiter_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES bt_organizations(id),
  candidate_id UUID REFERENCES bt_candidates(id),
  author_id UUID REFERENCES auth.users(id),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Assessment question bank (for future randomization)
CREATE TABLE bt_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL,
  question_type TEXT,                  -- 'multiple_choice', 'fill_in', 'text_response', 'interactive'
  difficulty TEXT CHECK (difficulty IN ('junior', 'mid', 'senior')),
  content JSONB NOT NULL,             -- question text, options, media references
  answer_key JSONB,                   -- correct answer(s) + scoring rubric
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE bt_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_module_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_behavioral_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_recruiter_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_question_bank ENABLE ROW LEVEL SECURITY;

-- RLS policies (candidates see own data, admins see their org's data)
-- TODO: Define specific policies during implementation
```

---

## 9. File Structure

New files to add inside the existing NOVATerra codebase:

```
app/src/
├── components/
│   └── talent/                        ← ALL BLDG Talent components
│       ├── assessment/
│       │   ├── AssessmentShell.jsx     ← Timer, progress, module navigation
│       │   ├── BidLevelingModule.jsx   ← Module 1: PDF viewer + leveling grid
│       │   ├── CommunicationModule.jsx ← Module 2: Scenario prompts + text responses
│       │   ├── PlanReadingModule.jsx   ← Module 3: Interactive plan viewer
│       │   ├── CognitiveModule.jsx     ← Module 4: Math/logic questions
│       │   ├── SoftwareModule.jsx      ← Module 5: Visual recognition
│       │   ├── BehavioralModule.jsx    ← Module 6: Personality assessment
│       │   ├── ModuleIntro.jsx         ← Pre-module instruction screen
│       │   ├── ModuleComplete.jsx      ← Post-module summary before next
│       │   └── AntiCheat.jsx           ← Tab detection, copy prevention
│       ├── candidate/
│       │   ├── CandidateProfile.jsx    ← Profile editor
│       │   ├── CandidateResults.jsx    ← Score card + badge + radar chart
│       │   ├── CandidateBadge.jsx      ← Shareable badge component
│       │   ├── ScoreRadarChart.jsx     ← 6-axis radar visualization
│       │   └── ShareCard.jsx           ← LinkedIn/email share card generator
│       ├── recruiter/
│       │   ├── RecruiterDashboard.jsx  ← Admin home
│       │   ├── CandidateSearch.jsx     ← Search + filter + sort
│       │   ├── CandidateCompare.jsx    ← Side-by-side comparison
│       │   ├── CandidateDetail.jsx     ← Full results view for recruiter
│       │   ├── InvitationManager.jsx   ← Send/track assessment invitations
│       │   └── ReportExport.jsx        ← PDF report generation
│       ├── layout/
│       │   ├── CandidateSidebar.jsx    ← NOVATerra shell sidebar (locked items)
│       │   ├── BTAdminSidebar.jsx      ← Recruiter admin sidebar
│       │   └── LockedFeatureModal.jsx  ← "Explore NOVATerra" teaser modal
│       └── shared/
│           ├── BTTimer.jsx             ← Assessment timer pill
│           ├── BTProgressBar.jsx       ← Module progress indicator
│           └── PDFViewer.jsx           ← In-browser PDF rendering
│
├── pages/
│   └── talent/                         ← BLDG Talent page routes
│       ├── BTAssessmentPage.jsx        ← Main assessment page (module router)
│       ├── BTProfilePage.jsx           ← Candidate profile page
│       ├── BTResultsPage.jsx           ← Candidate results page
│       ├── BTRegisterPage.jsx          ← Candidate registration (separate from NOVATerra signup)
│       ├── BTLoginPage.jsx             ← Candidate login (BLDG Talent branded)
│       └── admin/
│           ├── BTAdminDashboard.jsx
│           ├── BTAdminCandidates.jsx
│           ├── BTAdminCandidateDetail.jsx
│           ├── BTAdminAssessments.jsx
│           ├── BTAdminReports.jsx
│           └── BTAdminSettings.jsx
│
├── stores/
│   ├── btCandidateStore.js             ← Candidate profile + assessment state
│   ├── btAssessmentStore.js            ← Active assessment session, module state, timer
│   ├── btScoringStore.js               ← Answer keys, scoring logic, grade calculation
│   └── btRecruiterStore.js             ← Recruiter dashboard state, search filters
│
├── constants/
│   ├── btBrand.js                      ← BLDG Talent brand constants
│   ├── btModules.js                    ← Module definitions, weights, time limits
│   ├── btAnswerKeys.js                 ← Correct answers for Modules 3, 4, 5
│   ├── btScenarios.js                  ← Module 2 communication scenarios
│   └── btBehavioral.js                 ← Module 6 question items + dimension mapping
│
├── utils/
│   └── btScoring.js                    ← Scoring engine: auto-score, AI-score, composite calc
│
└── assets/
    └── talent/
        ├── proposals/                  ← PDF files for bid leveling
        │   ├── abc-contracting.pdf
        │   ├── blue-sky-builders.pdf
        │   └── elevate-interiors.pdf
        ├── plans/                      ← Plan images for Module 3
        └── software/                   ← Screenshot mockups for Module 5
```

### Modified Existing Files

| File | Change |
|------|--------|
| `App.jsx` | Add role-based routing: `candidate` → CandidateLayout, `bt_admin` → BTAdminLayout, default → existing NOVATerraLayout |
| `stores/authStore.js` | Add `appRole` field, role detection on login via `bt_user_roles` table |
| `LoginPage.jsx` | Add toggle or separate entry point for BLDG Talent candidate/admin login |

---

## 10. Architecture Decisions

### Why Inside NOVATerra (Not Separate)
- One codebase, one deploy, one set of bug fixes
- Shared components (Modal, buttons, inputs, theme) stay in sync automatically
- The "inside the club" UX is REAL — candidates are literally in the app
- No maintenance duplication — update a theme, it updates everywhere
- Matt is one developer — two codebases is a tax paid forever

### Role Separation is in Routing and Data, Not Code
- `App.jsx` checks `appRole` and renders the appropriate layout
- NOVATerra users never see BLDG Talent routes
- Candidates never see NOVATerra data (different stores load)
- Recruiters see only BLDG Talent admin views
- Shared components (Modal, inputs, sidebar structure) are reused — NOT duplicated

### Supabase is the Only Integration Point
- BLDG Talent tables are prefixed `bt_`
- Same Supabase project, same auth
- RLS policies enforce data isolation between roles
- No code-level coupling between NOVATerra stores and BLDG Talent stores

### Lazy Loading
- ALL BLDG Talent pages/components are lazy-loaded
- NOVATerra users never download BLDG Talent code (it's not in their routes)
- Candidates never download NOVATerra page components (they can't access those routes)
- Bundle size impact on existing users: zero

### NOVATerra References in BLDG Talent Code
- NOVATerra is referenced as a BRAND, never as a code dependency
- Brand constants live in `btBrand.js` — one file for all NOVATerra references
- Teasers reference NOVATerra by name and link to its marketing/signup page
- "Powered by NOVA" appears in assessment UI and results reports

---

## 11. Business Model

### Revenue Streams

| Stream | Pricing | Notes |
|--------|---------|-------|
| **Estimators** | **Free** | Supply side — maximize adoption |
| **Per-Assessment Report** | $200/candidate | One-off buyers, small GCs |
| **Recruiter Pro** | $500/mo (10 assessments) or $1,000/mo (unlimited) | Core revenue |
| **Enterprise** | $15-25K/year | Large staffing firms, national GCs |
| **White-Label** | $5K setup + $500/mo | GCs brand and administer internally |
| **Workforce Analytics** | $2-5K/report | Industry associations, trade publications |
| **Training Referrals** | Revenue share | Referral fees for skill gap → training partner |

### Unit Economics
- CAC (recruiter): ~$500
- LTV (recruiter @ $1K/mo, 18-month retention): $18,000
- LTV:CAC ratio: 36:1
- Marginal cost per assessment: ~$0.50 (Claude API)
- Gross margin: 95%+

### Year 1 Target: $145K ARR
### Year 3 Target: $1.2M ARR

---

## 12. Execution Plan — Phased Build

### Phase 0: Revenue Now (Days 1-14) — MANUAL OPERATIONS
- Landing page + Stripe payment links
- Outreach to 50 construction recruiting firms
- Deliver assessments manually (Excel + PDFs via email)
- Score with AI assistance, generate PDF reports
- Target: 3-5 paying recruiters, $2-5K MRR

### Phase 1: Core Assessment Flow (Weeks 3-6)
**Build order:**
1. Role system in authStore + App.jsx routing
2. Candidate registration + login flow (BLDG Talent branded)
3. Candidate sidebar with locked NOVATerra teasers
4. Assessment shell (timer, progress, module navigation)
5. Module 4: Cognitive Reasoning (auto-scorable, fastest to build)
6. Module 6: Behavioral/Work Style (auto-scorable)
7. Module 2: Communication (text responses, AI-scored)
8. Module 5: Software Proficiency (multiple choice, auto-scored)
9. Module 1: Bid Leveling (PDF viewer + grid — most complex)
10. Module 3: Plan Reading (interactive drawings — needs assets)

### Phase 2: Scoring & Results (Weeks 7-8)
1. Scoring engine (weighted composite, grades, certification levels)
2. Results page (score card, radar chart, badge)
3. AI-generated narrative sections (NOVA)
4. PDF report export
5. Shareable profile URL + LinkedIn badge card

### Phase 3: Recruiter Portal (Weeks 9-12)
1. bt_admin role + admin layout
2. Recruiter dashboard
3. Candidate search + filter
4. Side-by-side comparison
5. Assessment invitation system
6. Report management

### Phase 4: Flywheel (Months 4-6)
1. Multiple bid leveling scenarios (randomization)
2. Adaptive difficulty for Module 4
3. Percentile ranking (requires 50+ assessments)
4. Annual recertification system
5. NOVATerra performance data integration (estimators using NOVATerra get "Verified by Usage" enhancement)

---

## 13. Future Vertical Steps

### Near-Term (6-12 months)
1. **Multiple project scenarios** — Add mechanical, electrical, sitework bid leveling exercises that rotate randomly
2. **Adaptive difficulty** — Start mid-level, adjust based on performance. Junior vs senior tracks.
3. **CSI division knowledge module** — Quick assessment of division knowledge breadth
4. **Change order / RFI module** — Can they price a change order? Interpret an RFI?
5. **Training recommendations** — Based on weak areas, suggest specific training resources

### Mid-Term (12-18 months)
6. **NOVATerra live score integration** — Real estimating work in NOVATerra feeds back into BLDG Talent score as "Verified Performance" data
7. **Workforce analytics product** — "State of Estimator Talent" annual report. Sell to AGC, ABC, NAHB, ENR.
8. **Salary benchmarking tool** — Recruiters pay for real-time salary data correlated with skills
9. **Geographic talent density mapping** — Where are the estimators? Where are the gaps?
10. **Company profiles** — Employers build profiles, become NOVATerra leads

### Long-Term (18-36 months)
11. **Expand beyond estimators** — Add assessments for PMs, superintendents, safety managers, project engineers. "BLDG Talent" becomes the verified skills platform for all of construction.
12. **AI-supervision assessment** — As AI handles more routine estimating, test "can this person supervise AI output?" (catch errors, verify assumptions, make judgment calls on AI-generated estimates)
13. **Marketplace** — Full talent marketplace where recruiters post positions, estimators apply with verified profiles, matching happens through skills data
14. **API access** — ATS integrations so recruiters see BLDG Talent scores inside their existing hiring software
15. **White-label enterprise** — National GCs run their own branded version internally for onboarding assessment + continuing education
16. **International expansion** — Adapt for UK, Australian, Canadian construction markets (different standards, same concept)
17. **Certification as industry standard** — Partner with AGC, ABC, NAHB to make "BLDG Talent Certified" the recognized standard for estimator qualification

---

## 14. Market Context

### The Opportunity
- **23,000+ open estimator positions** on LinkedIn right now
- **94% of contractors** report trouble filling roles
- **$17K-$40K** recruiter placement fee per estimator with ZERO quality guarantee
- **Zero competitors** in practical estimator assessment
- **65% of senior estimators** retire within 7 years
- **170,000+ hiring events** projected over the next decade
- Assessment SaaS market: **$1.3-2.8B**, growing at **9% CAGR**

### Why This Won't Become Obsolete
- AI handles routine takeoffs in 3-5 years, but judgment/communication/bid leveling is 10-15 years out
- Retirement wave creates hiring demand that exceeds AI productivity gains through 2035
- As AI handles more estimating, the assessment evolves from "can you estimate?" to "can you supervise AI estimating?"
- The data asset (scored estimator profiles) appreciates regardless of how estimating technology changes
- Minimum 10-year runway before meaningful demand reduction

---

## 15. Brand Constants

```javascript
// src/constants/btBrand.js

export const BT_BRAND = {
  // Product identity
  name: 'BLDG Talent',
  tagline: 'Verified Estimator Intelligence',
  parent: 'BLDG',
  aiEngine: 'NOVA',
  poweredBy: 'Powered by NOVA',

  // NOVATerra cross-reference (brand only, never code dependency)
  novaTerraName: 'NOVATerra',
  novaTerraUrl: 'https://app-nova-42373ca7.vercel.app',
  novaTerraTagline: 'Construction Intelligence',

  // Certification levels
  certLevels: {
    certified:  { label: 'Certified Estimator',  minScore: 70, maxScore: 79, color: '#CD7F32', badge: 'Bronze' },
    advanced:   { label: 'Advanced Estimator',   minScore: 80, maxScore: 89, color: '#C0C0C0', badge: 'Silver' },
    expert:     { label: 'Expert Estimator',     minScore: 90, maxScore: 95, color: '#FFD700', badge: 'Gold' },
    master:     { label: 'Master Estimator',     minScore: 96, maxScore: 100, color: '#E5E4E2', badge: 'Platinum' },
  },

  // Module definitions
  modules: {
    bid_leveling:  { label: 'Bid Leveling',           weight: 0.30, timeLimit: 25 * 60, icon: 'scale' },
    communication: { label: 'Communication & Judgment', weight: 0.20, timeLimit: 15 * 60, icon: 'message' },
    plan_reading:  { label: 'Plan Reading & Takeoff',   weight: 0.15, timeLimit: 15 * 60, icon: 'ruler' },
    cognitive:     { label: 'Cognitive Reasoning',       weight: 0.20, timeLimit: 15 * 60, icon: 'brain' },
    software:      { label: 'Software Proficiency',      weight: 0.05, timeLimit: 5 * 60,  icon: 'monitor' },
    behavioral:    { label: 'Behavioral & Work Style',   weight: 0.10, timeLimit: 10 * 60, icon: 'user' },
  },

  // Teaser descriptions for locked NOVATerra sections
  teasers: {
    dashboard:    { title: 'Project Dashboard',     desc: 'AI-powered project overview with real-time cost tracking' },
    inbox:        { title: 'Inbox & RFP Management', desc: 'Automated RFP processing and bid communication' },
    core:         { title: 'NOVA Core',              desc: 'Cost database, assemblies, and historical intelligence' },
    intelligence: { title: 'Intelligence',           desc: 'AI-driven project insights and predictive analytics' },
    contacts:     { title: 'People',                 desc: 'Subcontractor network with trade tracking and ratings' },
    settings:     { title: 'Settings',               desc: 'Customizable themes, palettes, and preferences' },
  },
};
```

---

## Source Materials

The following files contain the original assessment content used to create this spec:

- **Excel assessment**: `/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Talent/Certification/BLDG Talent Assessment.xlsm`
- **PDF Proposal 1**: `/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Talent/Certification/ABC Contracting.pdf`
- **PDF Proposal 2**: `/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Talent/Certification/Blue Sky Builders.pdf`
- **PDF Proposal 3**: `/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Talent/Certification/Elevate Interiors.pdf`
- **Sample results report**: `/Users/mattnicosia/Matt Nicosia Dropbox/BLDG/BLDG Talent/Certification/BLDG Talent Assessment - Steve Catalanotto.pdf`

---

## Implementation Notes for the Builder

1. **Do NOT modify existing NOVATerra functionality.** All BLDG Talent code goes in new files under `components/talent/`, `pages/talent/`, `stores/bt*.js`, `constants/bt*.js`.
2. **The only existing files that need modification**: `App.jsx` (add role routing), `authStore.js` (add appRole detection), and potentially `LoginPage.jsx` (add BLDG Talent entry point).
3. **Lazy-load everything.** NOVATerra users must never download BLDG Talent code.
4. **Use existing NOVATerra patterns.** Same `useTheme()` hook, same `inp()`/`bt()` helpers, same Modal component, same design tokens. Don't reinvent — reuse.
5. **The candidate sidebar is a NEW component** (`CandidateSidebar.jsx`) that mimics NOVATerra's Sidebar.jsx but with locked items. It is NOT a modification of the existing Sidebar.
6. **PDF proposals** for Module 1 need to be included as static assets or fetched from Supabase storage.
7. **Module 3 (Plan Reading)** needs plan images created — can use simplified synthetic plans for MVP.
8. **Module 5 (Software Proficiency)** needs screenshot mockups — can use simplified representations for MVP.
9. **Module 6 (Behavioral)** questions need to be written — base on DISC framework adapted for construction.
10. **AI scoring** for Module 2 (Communication) uses the Claude API via the existing `ai.js` utility pattern.
