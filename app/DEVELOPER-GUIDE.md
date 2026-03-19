# NOVATerra — Developer Guide & Platform Overview

**Last Updated:** March 9, 2026
**Maintainer:** Matt Nicosia

---

## 1. What Is This Software?

NOVATerra is an **AI-native construction estimating platform** built for general contractors, estimators, and subcontractors. It replaces legacy tools like Timberline, ProEst, WinEst, and STACK with a modern, offline-first web application powered by the NOVA AI engine (Anthropic Claude).

The platform occupies a unique market position: **AI-native + full estimating workflow**. Competitors are either full legacy platforms with minimal AI, or AI-native but limited to takeoff-only. NOVATerra is both.

### The Three Products (One Codebase)

| Product | What It Does | Revenue Model |
|---------|-------------|---------------|
| **NOVATerra** | Full estimating platform — takeoffs, scope, proposals, bid management | Subscription ($149-249/mo) |
| **BLDG Talent** | 85-minute estimator skills assessment + recruiter marketplace | Free for estimators, $200-1K/mo for recruiters |
| **NOVA CORE** | Aggregated cost intelligence from all users (anonymized) | Data product (future) |

All three live in one React app. Role-based routing (`appRole` in `authStore`) determines what each user sees. A NOVATerra estimator never sees BLDG Talent. A candidate taking the assessment sees the NOVATerra shell with locked features (the assessment doubles as a product demo). A recruiter sees an entirely separate admin portal.

---

## 2. Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Zustand (state) + Vite (build) |
| **3D Graphics** | Three.js + React Three Fiber (NOVA sphere/chamber) |
| **Animation** | Framer Motion |
| **Persistence** | IndexedDB (primary, offline-first) → Supabase (cloud sync) |
| **Auth** | Supabase Auth (magic links, OAuth) |
| **Database** | Supabase (PostgreSQL + pgvector + RLS) |
| **AI** | Anthropic Claude API (via `@anthropic-ai/sdk`) |
| **Email** | Resend (transactional email) |
| **Hosting** | Vercel (frontend + serverless API routes) |
| **Monitoring** | Sentry (error tracking) + Vercel Analytics |
| **File Storage** | Vercel Blob |
| **BIM** | web-ifc (IFC file parsing) |

### Data Flow

```
User Action → Zustand Store → React UI (immediate)
                    ↓
              IndexedDB (1.5-2s debounce via useAutoSave)
                    ↓
              Supabase Cloud (non-blocking background push)
```

**Offline-first principle:** IndexedDB is the source of truth. Supabase cloud is a secondary backup that syncs in the background. The app works fully offline. Cloud sync happens on app startup and after saves.

### Key Architectural Patterns

- **Zustand stores** are the single source of truth for all app state
- **`getState()`** is used inside callbacks/effects to avoid stale closures (critical pattern — see Bug Patterns section)
- **Functional `setState(s => ...)`** for atomic updates that depend on current state
- **`idbKey()`** namespaces all IndexedDB keys by user/org to isolate data
- **Soft deletes** on the server: `deleted_at` column instead of DELETE, all cloud pulls filter `deleted_at IS NULL`
- **`bldg-deleted-ids`** tracked in both IndexedDB AND localStorage for crash resilience
- **Design tokens** via `useTheme()` hook: `const C = useTheme()` provides all colors
- **Style helpers**: `inp(C, overrides)`, `nInp(C, overrides)`, `bt(C, overrides)` from `@/utils/styles`
- **DM Sans** is the sole typeface across the entire platform

---

## 3. Project Structure

```
BLDG Estimator/
├── app/                          # Main application
│   ├── src/
│   │   ├── pages/               # 28 page components (lazy-loaded)
│   │   ├── stores/              # 44 Zustand stores
│   │   ├── components/          # 179 components across 25 subdirectories
│   │   ├── hooks/               # 24 custom hooks
│   │   ├── utils/               # 52 utility modules
│   │   └── constants/           # 27 data/config files
│   ├── api/                     # ~25 Vercel serverless functions
│   ├── dist/                    # Build output (deployed to Vercel)
│   └── package.json
├── *.sql                         # 13 Supabase migration files
├── BLDG-TALENT-SPEC.md          # Full BLDG Talent specification
├── NOVATERRA-PLATFORM-SPEC.md   # Full platform strategy document
└── DEVELOPER-GUIDE.md           # This file
```

---

## 4. Build, Run & Deploy

```bash
# Required: set Node path (local install)
export PATH="/Users/mattnicosia/local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Development
cd app/
npx vite              # Dev server at localhost:5173

# Build
npx vite build        # Output to app/dist/

# Deploy to production
npx vercel --prod     # Deploys to https://app-nova-42373ca7.vercel.app
```

**Git:** Main branch, initialized at app root. Tags mark architectural milestones (e.g., `pre-cost-library`).

---

## 5. State Management (Zustand Stores)

Every piece of application state lives in a Zustand store. Here are the major ones:

### Core Estimating

| Store | Purpose |
|-------|---------|
| `estimatesStore` | Estimate index, active estimate ID, draft ID, CRUD operations |
| `projectStore` | Project metadata — name, client, architect, dates, budget, building type |
| `itemsStore` | Line items, markup order, labor multipliers, location factors, change orders |
| `takeoffsStore` | Takeoff sketches, calibrations, linked items, predictions |
| `drawingsStore` | PDF canvases, drawing scales, DPI, smart labels |
| `databaseStore` | **Global cost library** (master + user overrides), assemblies, search state |
| `masterDataStore` | Clients, architects, subcontractors, historical proposals, company info |
| `specsStore` | Spec sheets, exclusions, clarifications |
| `alternatesStore` | Value engineering alternates |
| `groupsStore` | Bid context groups |
| `bidPackagesStore` | Bid packages, invitations, proposals, presets |
| `bidLevelingStore` | Sub bid leveling (subs, cells, selections, totals) |
| `correspondenceStore` | Email correspondence per estimate |
| `documentsStore` | Uploaded documents |
| `moduleStore` | Module instances (extensible estimate sections) |
| `scanStore` | Scan results, schedule parsing, learning records, calibration |
| `subdivisionStore` | Pre-con subdivision breakdowns, calibration factors |
| `reportsStore` | Report templates and export options |
| `calendarStore` | Calendar tasks, walkthrough dates, bid due dates |

### System & UI

| Store | Purpose |
|-------|---------|
| `authStore` | User session, `appRole` (novaterra / candidate / bt_admin) |
| `orgStore` | Organization mode, membership, role (owner/manager/member) |
| `uiStore` | Sidebar state, toasts, app settings (palette, density, font size), `persistenceLoaded` flag |
| `collaborationStore` | Lock holder, presence (who's online), real-time updates |

### Intelligence & AI

| Store | Purpose |
|-------|---------|
| `novaStore` | NOVA AI conversation state, chat history |
| `novaAudioStore` | Voice input/output buffers |

### BLDG Talent

| Store | Purpose |
|-------|---------|
| `btAssessmentStore` | Assessment session, module progress, scoring |

---

## 6. Persistence & Cloud Sync

### How Data Flows Through the System

1. **Boot Load** (`usePersistence.js`): On app mount, reads all global data from IndexedDB — estimates index, master data, settings, assemblies, user cost library, calendar, etc. Sets `persistenceLoaded = true` when done.

2. **Estimate Load** (`loadEstimate()`): When user opens an estimate, reads the estimate blob from IndexedDB and populates all estimate-specific stores (items, takeoffs, drawings, specs, etc.).

3. **Auto-Save** (`useAutoSave.js`): Watches all stores via Zustand subscriptions. Changes trigger debounced saves (1.5-2s delay). Two patterns:
   - **Estimate stores** (items, takeoffs, etc.): Imperative `subscribe()` API — no React re-renders
   - **Global stores** (master data, assemblies, settings, cost library): React `useEffect` with deps

4. **Cloud Sync** (`useCloudSync.js`): After boot load completes AND user is authenticated, runs bidirectional sync:
   - Pull cloud data, merge with local (union by ID, local wins on conflict)
   - Push merged result back to cloud
   - Handles master data, estimates, settings, assemblies, user cost library, calendar

5. **Initial Cloud Seed** (`useInitialCloudSeed.js`): One-time migration that pushes all existing local data to Supabase when a user first gets cloud sync. Sets a flag so it never runs again.

### Key IDB Keys

| Key | Content |
|-----|---------|
| `bldg-index` | Estimates index array |
| `bldg-est-{id}` | Individual estimate blob |
| `bldg-master` | Master data (clients, subs, company info) |
| `bldg-settings` | App settings |
| `bldg-assemblies` | Assembly templates |
| `bldg-user-elements` | **Global user cost library** (overrides + custom items) |
| `bldg-calendar` | Calendar tasks |
| `bldg-deleted-ids` | Deleted estimate IDs (zombie resurrection prevention) |

All keys are namespaced via `idbKey()` — prefixed with `u-{userId}-` (solo mode) or `org-{orgId}-` (org mode).

---

## 7. The Cost Database Architecture

This was recently redesigned (March 2026). Understanding it is critical.

### Two-Layer System

The cost database has two layers:

1. **MASTER_COST_DB** — Curated baseline items shipped with the app (in `constants/masterCostDb.js`). These are immutable at runtime. Tagged with `source: "master"`.

2. **User Elements** — User overrides and custom items. Tagged with `source: "user"`. Two kinds:
   - **Overrides**: Modified versions of master items (have `masterItemId` pointing to the master item they override)
   - **Custom Items**: User-created items with no master equivalent (no `masterItemId`)

### Merge Logic (`databaseStore.js`)

```
mergeElements(userElements):
  1. For each master item: if a user override exists (by masterItemId), use the override; otherwise use master
  2. Append all user-only custom items (no masterItemId)
  3. Return full resolved list
```

The `elements` state in `databaseStore` always holds the full resolved list. All UI reads from `elements` — same shape as before the architecture change.

### Persistence (Global, Not Per-Estimate)

- The cost library is **global** — it loads once at boot from `bldg-user-elements` IDB key
- Switching estimates does **NOT** reload the cost library
- Creating a new estimate does **NOT** reset the cost library
- `saveEstimate()` still snapshots `getUserElements()` into the estimate blob for backward compatibility, but it's never loaded back into the store
- `saveUserLibrary()` saves user elements to IDB + cloud push (debounced via auto-save)

### Key Operations

| Action | What Happens |
|--------|-------------|
| Edit a master item | Auto-creates a user override (new ID, `masterItemId` set) |
| "Send to Database" from estimate | Adds/updates item in global cost library |
| Delete a user override | Reverts to master version |
| Delete a custom item | Removes entirely |
| Delete a master item | Blocked (master items can't be deleted) |

---

## 8. Pages & Features

### Estimating Workflow

| Route | Page | Purpose |
|-------|------|---------|
| `/` | NovaDashboardPage | Widget-based dashboard, estimate creation, quick access |
| `/estimate/:id/info` | ProjectInfoPage | Project metadata — client, architect, dates, budget |
| `/estimate/:id/plans` | PlanRoomPage | PDF upload, drawing scales, 9-schedule scan, ROM generation |
| `/estimate/:id/takeoffs` | TakeoffsPage | Sketch-based quantity takeoffs on uploaded drawings |
| `/estimate/:id/alternates` | AlternatesPage | Value engineering, line-item variants |
| `/estimate/:id/sov` | ScheduleOfValuesPage | Payment schedule tied to items |
| `/estimate/:id/reports` | ReportsPage | PDF export, professional estimate formatting |
| `/estimate/:id/insights` | InsightsPage | Per-estimate benchmarking and cost analysis |
| `/estimate/:id/bids` | BidPackagesPage | Bid packages, sub invitations, scope gap analysis |

### Global Features

| Route | Page | Purpose |
|-------|------|---------|
| `/projects` | ProjectsPage | All estimates, filtering, bulk operations |
| `/core` | CorePage | Cost database browser (CORE items + models) |
| `/intelligence` | IntelligencePage | NOVA CORE cost intelligence, market briefs |
| `/resources` | ResourcePage | Gantt chart, crew scheduling, what-if modeling |
| `/inbox` | InboxPage | Email threading, RFP import, auto-response |
| `/contacts` | ContactsPage | Subcontractor directory |
| `/settings` | SettingsPage | App preferences, historical proposals, calibration |
| `/business` | BusinessDashboardPage | Owner analytics, team performance |
| `/rom` | RomPage | Free ROM generation (public, lead funnel) |

### BLDG Talent (Role-Gated)

| Route | Page | Role |
|-------|------|------|
| `/talent/register` | BTRegisterPage | Public |
| `/talent/login` | BTLoginPage | Public |
| Candidate layout | CandidateLayout | `candidate` |
| Admin layout | BTAdminLayout | `bt_admin` |

### Admin Portal (Email Whitelist)

| Route | Page | Purpose |
|-------|------|---------|
| `/admin` | AdminDashboard | System health, user overview |
| `/admin/users` | AdminUsersPage | User management |
| `/admin/estimates` | AdminEstimatesPage | All estimates across system |

---

## 9. AI Integration

The app uses Anthropic Claude throughout:

### Where AI Is Used

| Feature | How |
|---------|-----|
| **9-Schedule Scan** | PDF pages → Claude vision → structured schedule data |
| **ROM Generation** | Scanned schedules → romEngine.js → cost rollup |
| **Scope Gap Analysis** | Compare bid packages to find missing scope |
| **Auto-Response** | Draft professional emails from templates + context |
| **NOVA Chat** | In-app AI assistant with project context |
| **Historical Calibration** | Import past proposals → Claude extracts line items → calibration factors |
| **Smart Labels** | Auto-label drawing pages from title blocks |
| **Subdivision Breakdown** | AI-generated pre-con cost breakdowns by building type |
| **BLDG Talent Scoring** | AI scores communication and bid leveling modules |

### Key AI Utilities

- **`ai.js`** — Core module: `callAnthropic()`, `callAnthropicStream()`, `pdfBlock()`, `projectContext()`
- **`novaTools.js`** — NOVA tool definitions for function calling
- **`scanRunner.js`** — Orchestrates 3-phase scan pipeline
- **`scheduleParsers.js`** — Parses 9 schedule types from AI output
- **`romEngine.js`** — ROM calculation engine
- **`vectorSearch.js`** — Semantic search via pgvector embeddings

---

## 10. Multi-Tenant Organization System

Phase 1 complete (March 2026). Key concepts:

- **Solo Mode**: User's own data, IDB keys prefixed `u-{userId}-`
- **Org Mode**: Shared data, IDB keys prefixed `org-{orgId}-`, RLS scoped by `org_id`
- **Roles**: `owner` (full admin), `manager` (most features), `member` (basic access)
- **`orgReady` flag** gates persistence + cloud sync hooks to prevent timing races
- **Collaboration**: Lock-based editing — only one user can edit an estimate at a time. Real-time presence via Supabase realtime.

---

## 11. Serverless API Routes (`app/api/`)

| Category | Key Endpoints |
|----------|--------------|
| **Email** | `inbound-email.js`, `estimate-emails.js`, `send-auto-response.js`, `send-bid-invite.js`, `send-proposal.js` |
| **Files** | `blob.js` (upload), `fetch-cloud-files.js`, `proxy-cloud-file.js`, `cleanup-cloud-files.js` |
| **Documents** | `import-rfp.js`, `parse-proposal.js`, `ocr.js`, `retry-parse.js` |
| **Bids** | `bid-package.js`, `award-bid.js`, `sub-pool.js`, `sub-magic-link.js` |
| **Intelligence** | `embed.js`, `seed-embeddings.js`, `vector-search.js` |
| **Portal** | `portal.js`, `portal-upload.js`, `portal-confirm.js` |
| **AI** | `ai.js`, `nova-voice.js`, `scope-gap-narrative.js` |

---

## 12. Database Schema (Supabase)

### Core Tables

| Table | Purpose |
|-------|---------|
| `user_data` | Key-value store per user (mirrors IDB pattern) |
| `user_estimates` | Estimate blobs per user (`deleted_at` for soft delete) |
| `embeddings` | pgvector table for semantic search |
| `user_email_mappings` | Email whitelist per user |
| `pending_rfps` | Incoming emails before parsing |

### Organization & Collaboration

| Table | Purpose |
|-------|---------|
| `orgs` | Organization records |
| `memberships` | User-to-org membership with role |
| `estimate_locks` | Who is currently editing which estimate |
| `estimate_presence` | Real-time presence (who's online) |

### Communication

| Table | Purpose |
|-------|---------|
| `email_threads` | Email conversation threads |
| `email_messages` | Individual messages in threads |
| `email_senders` | Sender profiles |

### BLDG Talent

All tables prefixed `bt_`: `bt_user_roles`, `bt_assessments`, `bt_scores`, `bt_modules`, `bt_responses`

### RLS Policies

All tables have row-level security. User data scoped to `auth.uid()`. Org data scoped to `org_id` with membership check.

---

## 13. Critical Bug Patterns (Read This)

These patterns have caused real bugs. Understand them before writing code.

### 1. Stale Closures with useCallback

**Problem:** `useCallback` with `[]` deps captures a snapshot of state at mount time. If you read store state from a closure variable, it's stale.

**Fix:** Always use `useSomeStore.getState()` inside callbacks:
```javascript
// BAD — stale closure
const takeoffs = useTakeoffsStore(s => s.takeoffs);
const handleClick = useCallback(() => {
  console.log(takeoffs); // stale!
}, []);

// GOOD — fresh state
const handleClick = useCallback(() => {
  const takeoffs = useTakeoffsStore.getState().takeoffs; // always current
}, []);
```

### 2. Non-Atomic State Updates

**Problem:** Read-then-write patterns with `get()` can race with concurrent updates.

**Fix:** Use functional `set()`:
```javascript
// BAD — race condition
const current = get().estimatesIndex;
set({ estimatesIndex: [...current, newEntry] });

// GOOD — atomic
set(s => ({ estimatesIndex: [...s.estimatesIndex, newEntry] }));
```

### 3. Zombie Estimate Resurrection

**Problem:** If a deleted estimate's ID isn't tracked before the index is updated, a crash between the two operations can cause the estimate to reappear on next cloud sync.

**Fix:** Track deleted IDs FIRST (in both IDB and localStorage), THEN remove from index. The `bldg-deleted-ids` list is checked before any cloud pull restores data.

### 4. Zustand Getter Properties Don't Work

**Problem:** Zustand `create()` doesn't support ES5 getters. `get isManager() { ... }` won't work.

**Fix:** Use exported selector functions instead:
```javascript
// In the store file
export const selectIsManager = (s) => s.role === 'manager' || s.role === 'owner';

// In components
const isManager = useOrgStore(selectIsManager);
```

---

## 14. Styling Conventions

### Design Tokens

```javascript
const C = useTheme();  // Always destructure theme first

// Available tokens (partial list):
C.bg        // Background
C.bg2       // Secondary background
C.text      // Primary text
C.textDim   // Dimmed text
C.textMuted // Muted text
C.accent    // Accent color
C.accentBg  // Accent background
C.border    // Border color
C.green     // Material cost color
C.blue      // Labor cost color
C.orange    // Equipment cost color
C.red       // Danger/error
C.purple    // Code/special
```

### Style Helpers

```javascript
import { inp, nInp, bt } from '@/utils/styles';

// Input field
<input style={inp(C, { width: '100%', fontSize: 12 })} />

// Numeric input
<input style={nInp(C, { textAlign: 'right' })} />

// Button
<button style={bt(C, { background: C.accent, color: '#fff', padding: '6px 14px' })}>
```

### Typography

- **Font:** DM Sans only. No DM Mono, no Outfit, no Inter.
- **Font feature settings:** `fontFeatureSettings: "'tnum'"` for tabular numbers in cost columns.

---

## 15. Future Goals & Roadmap

### Near-Term (In Progress / Next)

1. **BLDG Talent Assessment** — 6 assessment modules, candidate/recruiter portals, scoring engine, certification system. Full spec in `BLDG-TALENT-SPEC.md`.

2. **Free ROM Funnel** — Public `/rom` route, email capture, 60-second ROM from uploaded plans, email delivery, trial conversion CTA.

3. **Stripe Subscription** — Single price ($299/mo per user), no tiers, trial management.

4. **NOVA CORE Intelligence** — Aggregated, anonymized cost intelligence from all users. Location-adjusted, building-type-adjusted pricing that improves with every estimate.

### Medium-Term

5. **Adaptive Difficulty** for BLDG Talent (questions adjust based on performance)
6. **Percentile Ranking** once 50+ assessments collected
7. **White-Label Assessment** for enterprise recruiting firms
8. **Cloud Provider Integration** — Google Drive, Dropbox, S3 as plan sources
9. **Real-Time Collaboration** improvements — multi-user editing (beyond current lock-based)

### Long-Term Vision

The flywheel:
```
Free ROM → NOVATerra subscription → Estimates feed NOVA CORE →
CORE gets smarter → ROM gets more accurate → More users →
Users take BLDG Talent → Recruiters pay for scored candidates →
Recruiters' clients discover NOVATerra → Repeat
```

**Revenue Target:** $2-3M+ ARR by Year 3 across all three products.

**Defensibility:** Matt is an expert estimator, GC company owner, AND the software builder. This combination doesn't exist anywhere else in construction tech. The data moat (NOVA CORE) compounds with every user.

---

## 16. Key Files Reference

| File | What It Does | When You'd Touch It |
|------|-------------|-------------------|
| `App.jsx` | Route definitions, role gating, lazy imports | Adding new pages |
| `stores/estimatesStore.js` | Estimate CRUD, index management | Estimate operations |
| `stores/databaseStore.js` | Cost library (master + user), assemblies | Cost database features |
| `stores/itemsStore.js` | Line items, markups, labor | Estimate content |
| `hooks/usePersistence.js` | Boot load, save functions, migrations | Persistence changes |
| `hooks/useAutoSave.js` | Debounced auto-save subscriptions | Adding new auto-saved stores |
| `hooks/useCloudSync.js` | Bidirectional cloud sync | Cloud sync for new data types |
| `hooks/useInitialCloudSeed.js` | First-time cloud push | New data types needing cloud seed |
| `hooks/useTheme.jsx` | Design tokens, color themes | Theming |
| `utils/ai.js` | Claude API integration | AI features |
| `utils/cloudSync.js` | Supabase push/pull helpers | Cloud operations |
| `utils/styles.js` | `inp()`, `nInp()`, `bt()` | Styling |
| `utils/format.js` | `uid()`, `fmt2()`, `nn()`, `titleCase()` | Formatting |
| `constants/masterCostDb.js` | Seed cost database | Cost data updates |
| `constants/palettes.js` | 40+ color themes | Theming |

---

## 17. Environment & Secrets

The app uses environment variables for API keys and service connections. These are configured in Vercel and in local `.env` files (not committed to git):

- **Supabase URL + Anon Key** — Database connection
- **Anthropic API Key** — Claude AI
- **Resend API Key** — Email service
- **Vercel Blob Token** — File storage
- **Sentry DSN** — Error tracking

Contact Matt for access to these services.

---

## 18. Getting Started Checklist

1. Clone the repo and run `npm install` in `app/`
2. Get environment variables from Matt (Supabase, Anthropic, etc.)
3. Run `npx vite` for local development
4. Read this document fully
5. Read `BLDG-TALENT-SPEC.md` for the assessment platform spec
6. Read `NOVATERRA-PLATFORM-SPEC.md` for the full platform strategy
7. Explore the Zustand stores — they are the heart of the application
8. Understand the persistence flow: Zustand → IDB → Cloud
9. Review the Critical Bug Patterns section (Section 13) before writing code
10. Ask Matt about current priorities and where to start

---

*This document covers the application as of March 2026. The codebase is ~600 files across stores, components, pages, hooks, utils, constants, API routes, and SQL migrations.*
