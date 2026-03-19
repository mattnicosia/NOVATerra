# NOVATerra — Platform Architecture, Business Model & Build Specification

> **This document defines the NOVATerra platform architecture: pricing tiers, the free ROM funnel, CORE intelligence layer, permission system, and subscription infrastructure. It complements BLDG-TALENT-SPEC.md which covers the assessment platform.**
>
> **Both specs should be read together. BLDG Talent lives inside NOVATerra. This document covers the platform that contains it.**

---

## Table of Contents

1. [Platform Strategy](#1-platform-strategy)
2. [The Data Moat — NOVA CORE](#2-the-data-moat--nova-core)
3. [Pricing Model](#3-pricing-model)
4. [The Free ROM Funnel](#4-the-free-rom-funnel)
5. [Permission Architecture](#5-permission-architecture)
6. [Auth & Signup Strategy](#6-auth--signup-strategy)
7. [Subscription Infrastructure](#7-subscription-infrastructure)
8. [Build Priority](#8-build-priority)
9. [Existing Code References](#9-existing-code-references)

---

## 1. Platform Strategy

### The One-Liner
NOVATerra is the AI-native construction estimating platform where every estimate makes the intelligence smarter for everyone.

### Competitive Position
NOVATerra occupies the only empty quadrant: **AI-native + full estimating**. No competitor is here.
- Procore ($375+/mo) and Sage ($365/mo) are full estimating but legacy/minimal AI
- Togal.AI and Attentive.ai are AI-native but takeoff-only
- NOVATerra does both: AI-powered estimating with 9-schedule parsing, ROM generation, historical calibration, and aggregated cost intelligence

### The Three Products Under One Roof

| Product | What It Is | Revenue Model |
|---------|-----------|---------------|
| **NOVATerra** | AI-powered estimating platform | $299/mo per user (single price, no tiers) |
| **BLDG Talent** | Estimator skills assessment | Free for estimators, paid for recruiters ($200/assessment or $500-$1K/mo) |
| **NOVA CORE** | Aggregated cost intelligence layer | Built into NOVATerra subscriptions; standalone data products later |

All three live in one codebase, one deploy, one URL. Role-based routing determines what each user sees. BLDG Talent candidates and NOVATerra estimators never see each other's interfaces.

### The Flywheel
```
GC uploads plans for free ROM
         ↓
Gets impressive, full-detail ROM in 60 seconds
         ↓
Sends ROM to their client → client impressed
         ↓
Client wants more detail → either client pays GC for precon
                          OR GC pays for NOVATerra to produce full estimate
         ↓
GC subscribes → creates estimates → data feeds NOVA CORE
         ↓
CORE gets smarter → ROM gets more accurate → more GCs use free ROM
         ↓
Estimators using NOVATerra take BLDG Talent assessment
         ↓
Assessment scores + NOVATerra usage data = verified skills profile
         ↓
Recruiters pay for access to scored estimators
         ↓
Recruiters' client companies discover NOVATerra
         ↓
Repeat
```

---

## 2. The Data Moat — NOVA CORE

### How It Works

Every estimate, proposal, and bid result that flows through NOVATerra feeds CORE's intelligence. Users contribute data by using the product. They get back better pricing accuracy than they could ever build alone.

**Raw data is NEVER visible to other users.** Only aggregated, anonymized intelligence is surfaced.

### Data Flow

```
Company A's proposals ──┐
Company B's proposals ──┤──→ NOVA CORE (anonymized, aggregated)
Company C's proposals ──┘         │
                                  ↓
                    ┌─────────────────────────┐
                    │ Normalized to national   │
                    │ consensus baseline       │
                    │                          │
                    │ Adjusted per-user based  │
                    │ on PROJECT LOCATION:     │
                    │ • City/metro area        │
                    │ • State/region           │
                    │ • Building type          │
                    │ • Project size           │
                    │ • Trade/CSI division     │
                    └─────────────────────────┘
                              │
                    ↓         ↓         ↓
              Company A   Company B   Company C
              (sees intel  (sees intel  (sees intel
               adjusted    adjusted     adjusted
               to THEIR    to THEIR     to THEIR
               project     project      project
               location)   location)    location)
```

### Architecture Details

The cost data pipeline:
1. **Ingest**: When a user creates an estimate, ROM, or imports a proposal, cost data points are extracted ($/SF by trade, labor rates, material costs, etc.)
2. **Normalize**: All data points are normalized back to a **national average consensus** baseline — stripping out regional variance
3. **Store**: Normalized data stored in CORE tables (never raw user data — aggregated and anonymized)
4. **Serve**: When a user creates a new estimate or generates a ROM, CORE data is retrieved and **adjusted for the project's location** using location multipliers (city cost index, state factors, metro area adjustments)
5. **The `romEngine.js` already implements this pattern** — it has BENCHMARKS by job type with low/mid/high $/SF ranges, and the scan/calibration system already adjusts based on historical proposals

### Trust Infrastructure

1. **Invisible contribution** — Data flows into CORE as a byproduct of using the product. Users don't "upload data to CORE." They create estimates, and CORE learns.
2. **Raw data never visible** — No user can see another user's actual pricing, proposals, or estimates. Only aggregated ranges and trends.
3. **Enterprise opt-out** (Phase 4+) — Enterprise customers can toggle "my data does NOT feed CORE." This loses some data richness but closes enterprise deals where legal teams require it.
4. **Differential privacy** (Phase 4+) — Mathematical guarantees that no individual company's data can be reverse-engineered from the aggregate. Marketed as a feature.
5. **Segmented intelligence** — CORE doesn't show a single national average. It shows data relevant to the user's context: building type, region, project size, trade. "Average drywall cost: $3.45/SF for commercial office in South Florida" — not "$2.80/SF nationally."

### What Makes NOVATerra's ROM Better Than an LLM

A raw LLM (ChatGPT, Claude, etc.) can produce a ROM from a text description. They're getting better at it. NOVATerra's ROM must be **demonstrably superior** to justify the funnel:

1. **Plan-based, not text-based** — NOVATerra's ROM reads actual construction drawings (9-schedule parsing), not a text prompt. It knows the REAL SF, the REAL finishes, the REAL structural system from the plans.
2. **Calibrated to real bids** — CORE intelligence is built from actual contractor bids, not training data from the internet. A GC's historical proposals calibrate the ROM to THEIR market and THEIR cost structure.
3. **Location-adjusted** — National baseline normalized and then adjusted to the project's specific metro area. An LLM says "concrete is $150/CY." NOVATerra says "concrete is $172/CY in your market based on 47 recent bids in the Miami-Dade metro."
4. **Division-level detail** — The ROM breaks down to CSI division level with $/SF ranges, not just a total. A client can see where the money goes — structure, envelope, MEP, finishes, sitework — in a format they can compare to their own budgets.
5. **Schedule-derived line items** — When plans include schedules (door, window, finish, etc.), the ROM extracts actual quantities and maps them to cost data. An LLM guesses quantities. NOVATerra reads them.
6. **Professional output** — The ROM is formatted as a professional construction document with division breakdowns, assumptions, exclusions, and ranges — not a chatbot response.

### The Client Trigger

When a GC sends this ROM to their client:
- If the client is impressed and wants more detail → **the client pays the GC for preconstruction services** (industry standard, $5K-$50K depending on project)
- If the GC needs to produce that detailed estimate → **the GC pays for NOVATerra** to do it faster and better than manually

Either way, the free ROM drives revenue — either for the GC (who credits NOVATerra) or for NOVATerra directly (when the GC subscribes). The ROM is the hook. The full estimating platform is the product.

---

## 3. Pricing Model

### Final Pricing Model — Single Price (Board Decision March 2026)

| | Details |
|---|---|
| **Free ROM** | $0 — Upload plans → get division-level ROM in 60 seconds. Email-only capture. No account required. Full output. Lead gen tool, not the product. |
| **NOVATerra** | **$299/month per user** — Full platform. Everything included. No tiers, no feature gates. Takeoffs, NOVA AI, bid packages, proposals, CORE intelligence, org features, shared data, team permissions, company defaults, contact/sub databases, assemblies library, historical proposal calibration. One price, one login. |
| **5+ seats** | Contact us — Same $299/user base, room to negotiate volume pricing as a single invoice. |

### Why $299/mo — One Price, No Tiers
- **Target customer is legacy software users**, not greenfield. They already have budget.
- ProEst: $400-$600/user/mo — NOVATerra saves $100-$300/seat
- Procore: $10K-$60K+/yr — NOVATerra is radically simpler to buy
- Sage: $365/mo — NOVATerra undercuts with 10x the intelligence
- STACK: $299/user/mo — Price parity with dramatically more capability
- Togal.AI: $299/user/mo — Takeoff only. NOVATerra is full platform at the same price.
- **Transparency is the weapon.** Competitors hide pricing behind sales calls. NOVATerra publishes one number on a clean page. No games.
- $299 signals serious software — a VP of Preconstruction sees this and thinks "competitor to ProEst," not "cheap tool"
- Free ROM is a lead gen door, not a differentiator — AI-generated ROMs are commoditizing fast. CORE intelligence and the full workflow are what people pay for.

### Why NOT Tiers
- Tiers add cognitive load. Legacy users shopping ProEst replacements want one answer, not a feature matrix.
- Feature-gating between tiers weakens the CORE data moat — every paid user should feed and benefit from CORE equally.
- One price means the pricing page IS the marketing: "$299/month. Everything. One login."

### Revenue Math
- 50 users × $299/mo = $14,950 MRR = **$179K ARR**
- 100 users × $299/mo = $29,900 MRR = **$359K ARR**
- 280 users = **$1M ARR**
- Gross margin per user: ~$225-$280/mo (after API/infrastructure costs)
- Solo-founder breakeven (~$10K/mo): **~35-40 users**

### Unit Economics
- API costs per active user: $20-$75/mo (scan volume dependent)
- Infrastructure/hosting per user: ~$5/mo
- Gross margin at $299: **75-93%**
- Power users (50+ scans/mo) may cost $150+ in API — accept as cost of building CORE. Their data is valuable.

### Deferred Decisions
- **Annual pricing**: Add at Day 90 post-launch. Target ~$2,790/yr ($232.50/mo effective, ~22% discount).
- **Volume discounts**: Negotiate per-deal for 5+ seats. No published discount schedule yet.
- **Usage-based overages**: Tabled. Monitor API costs. Revisit only if power users create margin problems.
- **Enterprise tier**: Don't build. Contact form only. Build enterprise features when a real enterprise customer is paying.

### What NOT to Build Yet
- Stripe checkout / subscription management — Phase 1 priority
- Usage-based billing (AI scans per month) — Tabled
- Enterprise tier features — Only when a real enterprise customer is paying

---

## 4. The Free ROM Funnel

### User Flow

**Step 1: Landing Page**
- Clean page: "Upload your plans. Get a ROM in 60 seconds. Free."
- One input: email address
- One button: "Upload Plans"
- No account creation. No password. No company name. Zero friction.
- After email entry → file upload modal → processing indicator

**Step 2: ROM Processing**
- Plans upload to Supabase storage (temporary bucket, auto-expire after 30 days)
- `romEngine.js` processes plans: detect building type, SF, schedules
- AI scan extracts schedule data (existing 3-phase scan pipeline)
- ROM generated using BENCHMARKS + calibration + location adjustment

**Step 3: ROM Delivery**
- Full ROM displayed on-screen immediately AND emailed to the user
- The ROM is GENEROUS — not gated, not teased, not partial:
  - Total project cost estimate (low / mid / high range)
  - Cost per SF breakdown
  - Division-level detail (every CSI division with $/SF)
  - Schedule-derived line items (when schedules detected)
  - Assumptions and exclusions clearly listed
  - "Powered by NOVA — based on [X] similar projects in our intelligence database"
- Output formatted as a professional construction document — PDF-downloadable

**Step 4: The Upsell**
Below the ROM (not replacing any content — additive):
- "Want to modify this estimate? Adjust quantities, change specs, add your own pricing, generate a formal proposal? That's what NOVATerra does."
- CTA button: "Start Your Free 14-Day Trial"
- Clicking → account creation flow → full NOVATerra access for 14 days
- The upsell is: "the ROM is the OUTPUT. NOVATerra is the WORKFLOW."

**Step 5: Nurture (email drip)**
- Day 0: "Here's your ROM. Here's how NOVA generated it." (ROM attached as PDF)
- Day 3: "See how your ROM compares to similar projects. Try CORE." (value teaser)
- Day 7: "Your free trial is waiting. Full estimates in minutes, not days." (CTA)
- Day 14: "Still using spreadsheets? Here's what NOVATerra users save per estimate." (social proof)

### Implementation Notes
- The free ROM flow uses existing `romEngine.js` + AI scan pipeline
- New route: `/rom` — public, no auth required (like `/portal/` and `/sub-dashboard` which already bypass auth)
- Email capture stored in a new `rom_leads` table
- ROM result stored for retrieval (user can access their ROM via email link)
- Analytics: track ROM-to-trial conversion rate obsessively. Target: 10-20%.

### ROM Page Components
```
pages/
  RomPage.jsx              ← Public ROM tool (no auth)
components/
  rom/
    RomUpload.jsx           ← Email capture + file upload
    RomProcessing.jsx       ← Processing animation while AI scans
    RomResult.jsx           ← Full ROM display with division breakdown
    RomPdfExport.jsx        ← PDF generation for download/email
    RomUpsell.jsx           ← "Start your trial" CTA section
```

---

## 5. Permission Architecture

### Phase 1 (Build Now) — Two Roles Only

The existing `orgStore.js` already supports `owner`, `manager`, and `estimator` roles via `org_members.role`. Simplify for launch:

| Role | What They See | What They Can Do |
|------|--------------|-----------------|
| **Admin** (org owner/manager) | All estimates in the org | Manage company defaults, invite team, set markups/boilerplate, manage contacts/subs, see all org data |
| **Estimator** (org member) | Only their own estimates | Create estimates, inherit company defaults, override defaults per-estimate (doesn't change org default), manage their own work |

### Data Sharing Model

| Data | Scope | Notes |
|------|-------|-------|
| Company Info / Branding | Org-wide | Set by admin, used by all |
| Default Markups (OH&P, contingency) | Org-wide | Admin sets defaults. Estimators can override per-estimate. **Override is flagged visually**: "Using custom markup (org default: 10%)" |
| Boilerplate (exclusions, notes) | Org-wide | Same pattern — org default + per-estimate override |
| Contacts (clients, architects) | Org-wide shared | One contact database for the company |
| Subcontractors | Org-wide shared | One sub database with prequalification data |
| Assembly Library | Org-wide shared | Company's standard assemblies |
| Historical Proposals | Org-wide shared | Feeds calibration for everyone in the org |
| Cost Database (CORE) | Platform-wide (invisible) | All companies contribute, all benefit, nobody sees others' raw data |
| Estimates | Per-estimator | Private by default, admin always has read access |
| Theme / Appearance | Per-user | Personal preferences |
| Layout Preferences | Per-user | Dashboard arrangement, panel sizes |

### Future Permission Phases (Do NOT build now)

| Phase | Feature | Trigger |
|-------|---------|---------|
| V2 | Estimate sharing (invite a colleague to view/edit a specific estimate) | When you have 10+ multi-user orgs |
| V2 | Cross-visibility toggle (admin can let all estimators see each other's estimates, read-only) | Same trigger |
| V3 | Manager role (distinct from Admin — can invite/manage estimators but can't change billing or delete org) | When you have 50+ orgs |
| V3 | Department-level scoping | First enterprise deal |
| V4 | Custom roles, permission templates, audit logs | Enterprise tier only |

---

## 6. Auth & Signup Strategy

### What to Build for Launch

1. **Email + Password** — Already implemented in `authStore.js`
2. **Google SSO** — Add via Supabase Auth (90% of small-to-mid construction firms use Google Workspace)

Add later:
- Microsoft SSO → When first enterprise customer asks for it
- Magic Link → Convenience feature, lower priority

### Sign-Up Flows

#### A. Free ROM User (no account)
1. Lands on `/rom`
2. Enters email only
3. Uploads plans → gets ROM
4. Email captured in `rom_leads` table
5. If they click "Start Trial" → redirected to account creation

#### B. New NOVATerra Customer (individual)
1. Clicks "Start Free Trial" (from ROM page, landing page, or direct)
2. Email + Password (or Google SSO) → account created
3. Lands in the app IMMEDIATELY — sees Dashboard with a dismissible "Complete Your Setup" card
4. Setup card prompts (not gates): company name, default markups, invite team
5. They can dismiss and start estimating right away
6. After 14 days → prompted to subscribe ($299/mo)

#### C. Team Member (invited by admin)
1. Admin sends invite from Settings > Team (existing `org_invitations` flow in `orgStore.js`)
2. Invitee gets email: "You've been invited to [Company] on NOVATerra"
3. Clicks link → `/invite/:token` page
4. Signs up with Email + Password or Google SSO
5. Auto-accepts invitation, lands in the org immediately
6. Lighter onboarding (company defaults already set by admin)

#### D. BLDG Talent Candidate (see BLDG-TALENT-SPEC.md)
1. Receives assessment link from recruiter or finds it organically
2. Signs up via BLDG Talent registration flow
3. `appRole` set to `candidate`
4. Sees NOVATerra shell with locked features + assessment modules

#### E. BLDG Talent Admin / Recruiter (see BLDG-TALENT-SPEC.md)
1. Signs up via BLDG Talent admin registration
2. `appRole` set to `bt_admin`
3. Sees recruiter dashboard

#### F. Domain-Based Team Discovery (Phase 2+)
When someone signs up with a `@samegccompany.com` email and that domain matches an existing org, show: "It looks like [Company Name] is already on NOVATerra. Request to join their team?" Eliminates need for admin to manually invite every person.

---

## 7. Subscription Infrastructure

### Stripe Integration (Phase 1)

| Component | Implementation |
|-----------|---------------|
| **Stripe Checkout** | Use Stripe Checkout Sessions for subscription creation. Redirect to Stripe-hosted page. |
| **Products** | One Stripe Product: "NOVATerra" ($299/mo per seat) |
| **Webhooks** | Supabase Edge Function receives Stripe webhooks. Updates `subscriptions` table. |
| **Trial** | 14-day free trial. No card required to start. Card required to continue. |
| **Seat management** | Admin adds/removes seats from Settings. Stripe prorates automatically. |
| **Cancellation** | Self-serve from Settings. Access continues until end of billing period. |

### Database Tables

```sql
-- Subscription tracking
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),          -- for Solo (no org)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'solo', 'team', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  seat_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ROM lead capture
CREATE TABLE rom_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  rom_result JSONB,                                -- stored ROM output for retrieval
  project_type TEXT,                               -- detected building type
  project_sf NUMERIC,                              -- detected square footage
  location TEXT,                                   -- if provided
  converted_to_trial BOOLEAN DEFAULT false,
  converted_to_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Feature gating
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  flag_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, flag_key)
);
```

### Feature Gating by Tier

| Feature | Free ROM | NOVATerra ($299/mo) |
|---------|----------|---------------------|
| ROM generation | Unlimited (no account) | Unlimited |
| Full estimating | No | Yes |
| Takeoff tools | No | Yes |
| NOVA AI assistant | No | Yes |
| Bid packages | No | Yes |
| Proposal generation | No | Yes |
| CORE intelligence | ROM-level only | Full |
| Historical calibration | No | Yes |
| AI plan scanning | No | Unlimited |
| Org features | No | Yes |
| Shared contacts/subs | No | Yes |
| Company defaults | No | Yes |
| Team invitations | No | Yes (admin) |
| Assembly library (shared) | No | Yes |

### Implementation Pattern

```javascript
// utils/subscription.js
import { supabase } from '@/utils/supabase';

export async function getSubscriptionTier() {
  // Check org subscription first (Team tier), then personal (Solo)
  const orgId = useOrgStore.getState().org?.id;
  const userId = useAuthStore.getState().user?.id;

  if (orgId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('tier, status')
      .eq('org_id', orgId)
      .in('status', ['trialing', 'active'])
      .maybeSingle();
    if (data) return data.tier;
  }

  const { data } = await supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active'])
    .maybeSingle();

  return data?.tier || 'free';
}

// Use in components:
// const tier = useSubscriptionStore(s => s.tier);
// if (tier === 'free') return <UpgradePrompt />;
```

---

## 8. Build Priority

### P0 — Build Now (Weeks 1-4)

**Free ROM funnel**
1. `/rom` public route (bypasses auth like `/portal/`)
2. `RomPage.jsx` — email capture + plan upload + processing + result display
3. `rom_leads` table in Supabase
4. ROM PDF export and email delivery
5. "Start Trial" CTA → account creation flow
6. ROM must output full division-level detail, formatted as professional construction document

**BLDG Talent Phase 1** (see BLDG-TALENT-SPEC.md Section 12)
1. Role system: `appRole` in authStore (`novaterra` | `candidate` | `bt_admin`)
2. Role routing in `App.jsx`
3. Candidate registration + login
4. Candidate sidebar with locked NOVATerra teasers
5. Assessment shell (timer, progress, module navigation)
6. Module 4: Cognitive Reasoning (auto-scorable)
7. Module 6: Behavioral (auto-scorable)

### P1 — Build Next (Weeks 5-8)

**Stripe subscription infrastructure**
1. Stripe Products + Prices created
2. `subscriptions` table
3. Stripe Checkout flow from Settings page
4. Webhook handler (Supabase Edge Function)
5. Tier detection in app (`useSubscriptionStore`)
6. Feature gating by tier
7. Trial management (14-day, no card required to start)

**BLDG Talent continued**
8. Module 2: Communication (AI-scored)
9. Module 5: Software Proficiency
10. Module 1: Bid Leveling (PDF viewer + grid)
11. Scoring engine + results page

### P2 — Build Soon (Weeks 9-12)

**Permission refinements**
1. Visual flagging of per-estimate markup overrides ("Using custom markup — org default: 10%")
2. Admin estimate visibility (admin sees all org estimates in a list)
3. Google SSO via Supabase Auth

**BLDG Talent recruiter portal**
4. bt_admin layout + dashboard
5. Candidate search + filter
6. Assessment invitation system
7. Report PDF generation

**ROM improvements**
8. Email nurture sequence (Day 0, 3, 7, 14)
9. ROM-to-trial conversion tracking
10. ROM comparison to historical projects ("this ROM is 8% above average for commercial office in your metro")

### P3 — Build Later (Months 4-6)

1. CORE intelligence public dashboard (anonymized market data)
2. Estimate sharing (invite colleague to view/edit specific estimate)
3. Cross-visibility toggle
4. Usage-based billing (AI scan counts)
5. Domain-based team discovery
6. BLDG Talent: multiple bid leveling scenarios, adaptive difficulty
7. NOVATerra performance → BLDG Talent score integration

### P4 — Enterprise (Only When Paid For)

1. Microsoft SSO
2. Enterprise data isolation toggle (opt out of CORE contribution)
3. Differential privacy implementation
4. Custom roles + permission templates
5. Audit logs
6. API access
7. White-label reports
8. Dedicated support infrastructure

---

## 9. Existing Code References

### Files That Already Exist and Support This Plan

| File | What It Does | Relevance |
|------|-------------|-----------|
| `utils/romEngine.js` | ROM generation with division benchmarks by job type, $/SF ranges, calibration | Foundation for free ROM funnel. Already has BENCHMARKS for 5+ job types, 18+ divisions. |
| `stores/orgStore.js` | Multi-tenant org management: create org, invite members, role-based access (owner/manager/estimator) | Permission system already built. Extend with subscription tier gating. |
| `stores/authStore.js` | Auth with email/password, magic link, sign up | Add `appRole` field for BLDG Talent role detection. Add Google SSO. |
| `App.jsx` | Top-level routing with auth gate, admin guard, public routes (portal, sub-dashboard) | Add role-based routing for candidate/bt_admin. Add `/rom` public route. |
| `utils/ai.js` | Claude API integration, `callAnthropic()`, `pdfBlock()`, `buildProjectContext()` | Used for ROM AI scanning, BLDG Talent Module 2 AI scoring. |
| `utils/cloudSync.js` | Supabase push/pull sync | Extend with CORE data contribution (anonymized). |
| `stores/scanStore.js` | 3-phase AI scan: detect schedules → parse → generate ROM | Powers the free ROM funnel's processing step. |
| `constants/constructionTypes.js` | Work type multipliers for different building types | Used in ROM location adjustment. |
| `hooks/usePersistence.js` | IndexedDB persistence with cloud sync | NOVATerra data layer — unchanged for BLDG Talent (candidates use separate stores). |
| `components/layout/Sidebar.jsx` | Main navigation sidebar | Cloned pattern for `CandidateSidebar.jsx` (locked items) and `BTAdminSidebar.jsx`. Not modified directly. |
| `pages/LoginPage.jsx` | Login/signup with Nova orb animation | Add BLDG Talent entry point (toggle or separate URL param). |

### Files to Create

See BLDG-TALENT-SPEC.md Section 9 for BLDG Talent files.

Additional files for this spec:

```
app/src/
├── pages/
│   └── RomPage.jsx                    ← Public ROM tool
├── components/
│   └── rom/
│       ├── RomUpload.jsx              ← Email + file upload
│       ├── RomProcessing.jsx          ← Processing animation
│       ├── RomResult.jsx              ← Full ROM display
│       ├── RomPdfExport.jsx           ← PDF generation
│       └── RomUpsell.jsx              ← Trial CTA
├── stores/
│   ├── subscriptionStore.js           ← Tier detection, feature gating
│   └── romStore.js                    ← ROM funnel state
├── utils/
│   └── subscription.js                ← Stripe helpers, tier checking
└── constants/
    └── tiers.js                       ← Tier definitions, feature matrix
```

### Existing Files to Modify

| File | Change | Risk Level |
|------|--------|-----------|
| `App.jsx` | Add `/rom` public route (like portal). Add role-based routing for candidate/bt_admin. | Low — additive only, existing routes unchanged |
| `stores/authStore.js` | Add `appRole` field. On login, check `bt_user_roles` table. Default: `novaterra`. | Low — backward compatible, existing users default to `novaterra` |
| `pages/LoginPage.jsx` | Add BLDG Talent entry point (URL param `?mode=talent` or separate component toggle) | Low — additive |
| `stores/orgStore.js` | No changes for Phase 1. Later: add subscription tier awareness. | None for now |
| `utils/romEngine.js` | No changes needed — already generates division-level ROM. May need a wrapper for the public funnel flow. | None |

---

## Summary

This spec + BLDG-TALENT-SPEC.md together define the complete NOVATerra platform:

1. **NOVATerra** (existing) — the AI estimating platform, unchanged for current users
2. **Free ROM funnel** (new) — public tool that generates leads and drives subscriptions
3. **BLDG Talent** (new) — assessment platform living inside NOVATerra's shell
4. **Subscription infrastructure** (new) — Stripe billing, tier gating, trial management
5. **NOVA CORE** (existing foundation, future expansion) — aggregated cost intelligence

Build priority is: **Free ROM (P0) → BLDG Talent Phase 1 (P0) → Stripe subscriptions (P1) → Recruiter portal (P2) → CORE expansion (P3) → Enterprise (P4)**.

One codebase. One deploy. One brand family. Three revenue streams.
