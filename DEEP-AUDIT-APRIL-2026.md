# NOVATerra Deep Audit — April 5, 2026

> 10 parallel agents audited every area of the codebase: bugs, UX gaps, performance, feature ideas, competitive positioning. This is the consolidated report.

---

## CRITICAL BUGS (Fix Immediately)

### P0 — Data Loss / Calculation Errors

| # | Area | Bug | Impact | Effort |
|---|------|-----|--------|--------|
| 1 | **Estimates** | Floating-point markup stacking — compound markups accumulate FP drift. On $1M+ estimates, error reaches $10K-$50K | Overbid/underbid | 2h |
| 2 | **Estimates** | Rounding inconsistency — `fmt()` vs `fmt2()` show different totals in header vs detail ($25-$500 gap) | Trust erosion | 1h |
| 3 | **Persistence** | IDB quota not enforced — if IndexedDB fills, writes fail silently. User has no idea data wasn't saved | Data loss | 4h |
| 4 | **Persistence** | Zombie resurrection — deleted estimate can be re-pushed to cloud if auto-save timer fires during delete | Ghost estimates | 3h |
| 5 | **Persistence** | Org switch during save — idbKey() returns wrong org-scoped key, save goes to wrong namespace | Data loss | 3h |
| 6 | **ROM** | SF=0 produces $0 ROM result page — no validation before rendering. Email capture accepts garbage leads | Bad UX + junk leads | 1h |
| 7 | **Collaboration** | Lock expires while user offline — save silently fails, user thinks work is saved, other user's changes win | Data loss | 4h |

### P1 — Logic Errors / Silent Failures

| # | Area | Bug | Impact | Effort |
|---|------|-----|--------|--------|
| 8 | **Estimates** | Labor multiplier only applies to labor, not equipment — HVAC/MEP systematically underestimated | 5-10% cost error | 4h |
| 9 | **Estimates** | Alternates use separate calculation chain from base — two paths diverge on markups | Cost mismatch | 3h |
| 10 | **Takeoffs** | Measurement scale sync — mixed-scale sheets return NULL instead of partial sum | Incomplete quantities | 3h |
| 11 | **Takeoffs** | Canvas race condition — static + overlay canvases not synchronized during rapid measurement | Visual glitches | 2h |
| 12 | **Inbox** | Race condition in PDF + Discovery — runFullScan reads stale/empty drawings after loadEstimate | Incomplete scan | 2h |
| 13 | **Inbox** | Real-time subscription leak — channel errors create new subscriptions without unsubscribing old | Memory leak | 2h |
| 14 | **ROM** | Trade-specific labor multipliers not used in ROM generation — plumbing/electrical ~10% underestimated under union | Cost error | 3h |
| 15 | **App Shell** | Toast queue overwrites — second toast kills first. Users miss important messages | Missed notifications | 2h |
| 16 | **Collaboration** | Correspondence/RFIs not persisted to backend — page reload loses all work | Data loss | 6h |
| 17 | **Bid Mgmt** | No double-award prevention — two managers can simultaneously award same package | Business logic error | 3h |
| 18 | **Settings** | Org creation rollback incomplete — if membership insert fails, orphaned org left in DB | Orphaned records | 2h |

---

## SECURITY ISSUES

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| 1 | Mapbox token hardcoded in MapRadarWidget.jsx | HIGH | Move to backend API endpoint |
| 2 | Invitation tokens generated client-side with uid() — not cryptographically secure | HIGH | Generate server-side with crypto.randomBytes |
| 3 | Org data isolation relies on client-side `.eq("org_id")` — no RLS enforcement | CRITICAL | Add RLS policy for org isolation |
| 4 | Session token in localStorage (not httpOnly) — XSS can steal it | MEDIUM | Consider httpOnly cookie approach |
| 5 | Formula evaluation uses `Function()` constructor — potential injection if variables come from untrusted source | MEDIUM | Use safe math parser library |
| 6 | Spotify/iframe widgets allow arbitrary URL embeds — no CSP headers | MEDIUM | Whitelist allowed iframe sources |

---

## GOD FILES TO SPLIT (Next Tech Debt Sprint)

| File | Lines | Recommended Split |
|------|-------|-------------------|
| ContactsPage.jsx | 1,934 | 7 components (ClientsTab, SubsTab, DuplicateDetectionPanel, etc.) |
| SettingsPage.jsx | 1,862 | 6 tab panels (CompanyProfiles, DefaultMarkups, OrgSettings, Team, Access, Email) |
| ProjectInfoPage.jsx | 1,841 | 6 sections (Basics, Bid, Location, Advanced, LostBidAnalysis, BidTimeline) |
| ScanResultsModal.jsx | 1,803 | Review needed |
| LevelingView.jsx | 1,742 | 8 components (BidLevelingGrid, BidCell, CellContextMenu, VarianceBadge, etc.) |
| RomPage.jsx | 1,692 | Review needed |
| ProjectsPage.jsx | 1,684 | Review needed |
| EstimatePage.jsx | 1,556 | Review needed |
| App.jsx | 1,487 | Defer — mostly routing config |
| ScenariosPanel.jsx | 1,435 | 7 components (ScenarioTree, ScenarioCard, CostingCard, VersionHistory, etc.) |
| TakeoffNOVAPanel.jsx | 1,368 | Review needed |
| drawingPipelineStore.js | 1,030 | Split by domain (drawings, takeoffs, scan, annotations) |

---

## STORE ARCHITECTURE (31 stores remaining)

### Hub Risk
`estimatesStore` imports 11 other stores — central orchestrator but tight coupling. Consider facade pattern or event bus for decoupling.

### Store Split Candidates
- **drawingPipelineStore** (1,030 lines, 363 properties) — cursor position changes re-render all 30+ takeoff components. Need Zustand shallow selectors.
- **collaborationStore** (702 lines) — 4 domains (locks, reviews, correspondence, auto-response) should be separate stores or namespaced slices.

---

## UX IMPROVEMENTS BY AREA

### Inbox / RFP Pipeline
1. **Bid/No-Bid Decision Engine** — ML scoring: GO/MAYBE/PASS with reasoning based on GC reputation, capacity, win probability
2. **Deadline warnings** — Red banner for RFPs due in 24h, calendar integration
3. **Email threading** — Fetch Gmail thread, show conversation context for addenda/scope changes
4. **Bulk actions** — Checkbox select, bulk dismiss, bulk mark-as-read
5. **GC reputation scoring** — Pay history, project size, industry, regional presence

### Dashboard / Widgets
1. **Missing widgets**: Cash Flow Projection, Profitability Tracker, Cost Trend, Team Workload, Pipeline Funnel
2. **Drill-down**: All widgets should filter/navigate on click (Pipeline Hero status → Projects, Win Rate donut → estimates)
3. **Date range filtering**: Global selector + per-widget overrides (last 30d, YTD, custom)
4. **Real-time updates**: Polling or WebSocket subscriptions — data only refreshes on page reload today
5. **Mobile**: Single-column layout on phones, disable drag/resize, increase touch targets to 44px
6. **Market data**: Replace hardcoded mock data in Live Feed/Market Intel with real RS Means/supplier feeds

### Takeoffs / Measurement
1. **Undo per-measurement** — Keep last 10 measurements in side stack, Cmd+Z to undo (Bluebeam/PlanSwift have this)
2. **Measurement templates** — Save "Drywall Finish" = measure LF + Height → auto-formula → auto-link rates
3. **Scale calibration prominence** — Red banner when scale not set, require calibration before measurement
4. **Measurement labels on canvas** — Show "142 LF", "1,250 SF" with toggle
5. **Cross-sheet measurement view** — Aggregate measurements across all sheets with thumbnails
6. **Dimension snapping** — Detect printed dimensions on PDF, snap measurement tools to them
7. **Canvas performance** — Implement spatial index (quadtree) for large drawings with 100+ measurements

### NOVA AI / Learning
1. **Inject correction context into Vision prompts** — searchSimilarCorrections() + buildCorrectionContext() before every analysis
2. **Track dismissals as false positives** — discoveryStore.dismiss should call logFalsePositive()
3. **Display evaluation summary** — Admin dashboard showing phase-level accuracy, top corrections, learning trends
4. **Re-enable firm context** — TakeoffNOVAPanel should call buildFirmContext() before each chat
5. **Predictive pricing from every estimate** — Learn cost multipliers per firm + project type, show confidence
6. **Scope gap auto-close** — When gap detected, suggest line items from ROM templates + firm history
7. **GC preference learning** — Track material/labor split per GC, pre-fill next estimate

### Estimates / Cost Database
1. **Bulk edit** — Select 10 items → apply 5% labor increase to all
2. **Copy division between estimates** — Reuse boilerplate (saves 5 min/bid)
3. **Side-by-side comparison** — Estimate A vs B with cost delta
4. **What-if scenarios** — Toggle alternates on/off with real-time total update
5. **Change order tracking** — RFI → scope change → audit trail to original
6. **Per-item markup override** — High-profit items get different margin
7. **Prevailing wage lookup** — Auto-lookup by county/union jurisdiction

### ROM / Free ROM / Lead Gen
1. **NOVA chatbot for ROM** — "What if we remove demolition?" → AI recalculates in real-time (planned next feature)
2. **Wizard step 7 dropout** — 17 scope toggles cause abandonment. A/B test 5-item version
3. **Conversion tracking** — No analytics on ROM→Email→Proposal funnel. Add Segment/Mixpanel
4. **Benchmark confidence** — Show "Commercial Office — Strong (20 projects)" vs "Hospitality — Low (4 projects)"
5. **Market factor freshness** — NYC multipliers 2+ years old, need quarterly BLS update
6. **Result page simplification** — 6 collapsible sections = decision paralysis. Surface: mid estimate, $/SF, top 3 drivers, PDF, CTA

### Bid Management / Collaboration
1. **Bid day countdown timer** — Color-coded (green→yellow→red), auto-notify at 24h/1h/15m
2. **Auto-fire time-based triggers** — bidDue48h/24h should fire via Cron, not manual click
3. **Bid tabulation report** — Auto-generate low/high/average per package with PDF export
4. **Sub prequalification** — Insurance verification, bonding check, safety record, structured questionnaire
5. **Award letter generation** — Template-based with auto-fill from bid data
6. **Persist RFIs and reviews** — Currently in-memory only, lost on page reload

### Settings / Admin
1. **Split SettingsPage** into tabbed interface (Company, Markups, Org, Team, Access, Email)
2. **Onboarding wizard** — Interactive setup for first-time org (profile, markups, team invite)
3. **Audit log** — Track all settings changes (who, what, when)
4. **Settings export/import** — Backup config, standardize across team
5. **Role-based visibility** — Estimators see profile only; managers see team; owners see billing

### App Shell / Layout
1. **Breadcrumb navigation** — "Dashboard > My Project > Takeoffs" always visible
2. **Keyboard shortcut help** — "?" opens modal with all shortcuts
3. **iPad split-screen** — Currently blocked at 500-700px width; should allow iPad
4. **Dark/light mode auto-detection** — Respect prefers-color-scheme on first visit
5. **Centralize z-index hierarchy** — Modals, overlays, floating UI currently conflict

### Persistence / Sync
1. **Version tracking + conflict detection** — Add `_version` field, detect conflicts on push
2. **IDB quota monitoring** — Show "Storage full" dialog with cleanup options when approaching limit
3. **Retry after cooldown** — Failed pushes enter 30s cooldown but never retry automatically
4. **Delta sync** — Push only changed fields, not full estimate JSON (200-500KB each)

---

## COMPETITIVE POSITIONING

### Where BLDG Wins
- **AI learning loop** — Correction → pattern → context pipeline (no competitor has this)
- **Module system** — Construction-specific scope building (unique)
- **Formula-based quantities** — Variables + expressions in takeoffs (stronger than competitors)
- **Free ROM** — No competitor offers free AI-powered ROM with this depth
- **Scope gap detection** — Comparing estimate items to proposed scope (unmatched)

### Where BLDG Loses
- **Multi-user collaboration** — Reviews, RFIs, correspondence don't persist (BuildingConnected, SmartBid do)
- **Bid day workflow** — No countdown timer, tabulation, or auto-fire reminders (SmartBid does)
- **Cross-sheet measurement** — Per-sheet only; Bluebeam/PlanSwift aggregate across sheets
- **Undo per-measurement** — All competitors support this; BLDG doesn't
- **Market data** — Mock/static data vs. RS Means real-time integration
- **Sub prequalification** — No insurance verification, bonding check, or questionnaire

### The Moat
Matt's competitive advantage: **expert estimator + GC owner + software builder**. This combo doesn't exist elsewhere. The correction learning loop + firm memory + calibrated ROM benchmarks from 160 real proposals = proprietary data moat that compounds with every estimate.

---

## RECOMMENDED SPRINT PRIORITIES

### Sprint A: Critical Fixes (1 week)
- [ ] Fix floating-point markup stacking (round each step to 2 decimals)
- [ ] Fix rounding inconsistency (standardize fmt/fmt2)
- [ ] Add IDB quota monitoring + user warning
- [ ] Fix toast queue (FIFO, stack 2-3 vertically)
- [ ] Validate ROM SF > 0 before rendering results
- [ ] Fix Mapbox token security (move to backend)

### Sprint B: Persistence Hardening (1 week)
- [ ] Add version tracking to estimates (conflict detection on push)
- [ ] Fix zombie resurrection (check deleted-IDs before IDB write)
- [ ] Fix org-switch during save (validate namespace before write)
- [ ] Persist correspondence/RFIs to Supabase
- [ ] Add retry after cooldown expires

### Sprint C: NOVA Intelligence (1 week)
- [ ] Inject correction context into ALL AI prompts (Vision, ROM, chat)
- [ ] Track dismissals as false positives
- [ ] Re-enable firm context in NOVA chat
- [ ] Display evaluation summary in admin dashboard
- [ ] Fix trade-specific labor multipliers in ROM

### Sprint D: UX Quick Wins (1 week)
- [ ] Add measurement-level undo (Cmd+Z for last 10 measurements)
- [ ] Add scale calibration banner (red warning when not set)
- [ ] Add breadcrumb navigation
- [ ] Add keyboard shortcut help modal
- [ ] Fix iPad split-screen detection

### Sprint E: God File Splits (1 week)
- [ ] Split SettingsPage into 6 tab panels
- [ ] Split ContactsPage into 7 components
- [ ] Split ProjectInfoPage into 6 sections
- [ ] Split LevelingView into 8 components

### Sprint F: Competitive Features (2 weeks)
- [ ] NOVA chatbot for ROM (interactive adjustment via natural language)
- [ ] Bulk edit in estimates
- [ ] Bid day countdown timer
- [ ] Cross-sheet measurement aggregation
- [ ] Cash Flow Projection widget

---

*Generated by 10 parallel audit agents on April 5, 2026. Covers: Inbox, Widgets, Takeoffs, NOVA AI, Estimates, App Shell, Persistence, Settings, ROM, and Bid Management.*
