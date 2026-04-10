# Scope from Drawings — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-10-scope-from-drawings-design.md`
**Date:** 2026-04-10

## Phase 1: Store & Data Layer (no UI changes)

### 1A. scanStore.js — Add scopeItems state + CRUD
- Add `scopeItems: []` to state
- Add actions: `setScopeItems`, `updateScopeItem`, `toggleScopeItemSelected`, `selectAllScopeItems`, `deselectAllScopeItems`, `pushScopeItemsToEstimate`
- Persist to IDB key `bldg-scope-${estimateId}`
- Load on hydration

### 1B. scanRunner.js — Stop auto-inject, persist full scope items
- Lines 999-1013: Remove `addElement()` loop — store to `scanStore.scopeItems` instead
- Lines 1031-1046: Store full `scopeResult.items` array, not just stats
- Lines 865-873: Fix jobType/buildingType reconciliation before ROM generation
- Wire `generateScopeOutline()` result into new `setScopeItems()` with proper schema mapping

## Phase 2: Vision Pipeline Upgrade

### 2A. geminiClient.js — New Gemini API wrapper
- `triagePages(pages[])` — batch classify pages via Gemini 3.1 Flash Lite
- Returns `{ hasSchedule, scheduleTypes[], confidence, boundingBoxes[] }` per page
- Image encoding: base64 from canvas/blob

### 2B. api/gemini-triage.js — Server-side proxy
- POST endpoint accepting `{ images: [base64[]], prompt }` 
- Uses `GEMINI_API_KEY` env var
- Rate limiting consistent with rom-ai.js pattern

### 2C. scanRunner.js — Swap detection pipeline
- Phase 1 (lines 206-278): Replace Haiku detection with Gemini Flash Lite triage
- Phase 2 (lines 488-830): Retarget parsing from SCAN_MODEL to Sonnet 4
- Keep OCR pre-pass as fallback context (Gemini is native multimodal but OCR text aids Sonnet)

### 2D. scheduleParsers.js — Retarget prompts for Sonnet
- `buildDetectionPrompt()` → refactor into `buildTriagePrompt()` for Gemini format
- `buildParsePrompt()` → enhance for Sonnet's stronger capabilities (more structured instructions, leverage construction domain knowledge)

## Phase 3: Scope Review UI

### 3A. ScopeItemRow.jsx — Individual item component
- Checkbox, CSI code (purple mono), description, confidence badge, qty+unit, source icon, drawing ref
- Confidence colors: green >= 0.80, amber 0.60-0.79, red < 0.60
- AI gap-fill items at lower opacity with amber badges
- Pushed items show "In estimate" badge, checkbox disabled

### 3B. ScopeNarrativeBlock.jsx — AI prose per division
- Calls Haiku via existing `/api/ai` proxy for narrative generation
- Caches result in `scopeItem.narrative` field
- Falls back to hardcoded narratives from `tradeScopeGenerator.js`

### 3C. ScopeNovaChat.jsx — Compact NOVA chat
- Intent parsing: add, remove, modify, ask, bulk select
- Inline response (1-2 lines, not full chat)
- Calls existing `/api/ai` proxy with scope context

### 3D. ScopeReviewPanel.jsx — Container with 3 zones
- Zone 1: Toolbar (counts, accept/reject all, group-by, narrative toggle)
- Zone 2: Scrollable item list grouped by division
- Zone 3: NOVA chat + Push to Estimate button
- Reads from `scanStore.scopeItems`, writes via store actions

### 3E. PlanRoomPage.jsx — Split view layout
- After scan completes, switch from grid to split: drawings left (60%), scope right (40%)
- DrawingLightbox fills left panel
- ScopeReviewPanel fills right panel
- Clicking drawing ref in scope scrolls left panel

## Phase 4: Push to Estimate

### 4A. Push flow in ScopeReviewPanel
- Collect `scopeItems.filter(si => si.selected && !si.pushed)`
- Call `itemsStore.addElement(division, preset)` with `_scopeSource`, `_scopeConfidence`, `_scopeItemId` metadata
- Mark items `pushed: true`, `pushedAt: timestamp`
- Navigate to Estimate tab with toast

### 4B. EstimateItemRow.jsx — NOVA source badge
- Items with `_scopeSource === "nova-scope"` show subtle NOVA icon
- Tooltip: "Added from NOVA scope review"

## Phase 5: ROM Preview (Lead Conversion)

### 5A. RomScopePreview.jsx — Read-only preview
- Takes `scopeItems[]`, renders first 8-10 grouped by 2-3 divisions
- Same visual language as ScopeItemRow but no checkboxes/chat
- Blur gate after preview: "Sign up to see all N items"
- CTA: "Get Full Scope → Create Free Account"

### 5B. RomPage.jsx — Wire scope generation
- After scan in DrawingUploadPath, call `generateScopeOutline()`
- Pass result to RomScopePreview
- Mount below ROM pricing breakdown

## Build Order

**Ship incrementally. Each phase is independently useful:**

1. **Phase 1** (store + data) — Foundation. No visible change but stops auto-inject.
2. **Phase 3** (UI) — The main feature. Users can review scope items.
3. **Phase 4** (push) — Completes the review→estimate workflow.
4. **Phase 5** (ROM preview) — Lead conversion enhancement.
5. **Phase 2** (vision upgrade) — Quality improvement. Can ship last since current pipeline still works.

**Phases 1→3→4 are the critical path. Phase 5 is independent. Phase 2 is an upgrade to existing functionality.**

## Files Created
| File | Phase |
|------|-------|
| `app/src/components/planroom/ScopeReviewPanel.jsx` | 3D |
| `app/src/components/planroom/ScopeItemRow.jsx` | 3A |
| `app/src/components/planroom/ScopeNarrativeBlock.jsx` | 3B |
| `app/src/components/planroom/ScopeNovaChat.jsx` | 3C |
| `app/src/components/rom/RomScopePreview.jsx` | 5A |
| `app/src/utils/geminiClient.js` | 2A |
| `app/api/gemini-triage.js` | 2B |

## Files Modified
| File | Phase |
|------|-------|
| `app/src/stores/scanStore.js` | 1A |
| `app/src/utils/scanRunner.js` | 1B, 2C |
| `app/src/utils/scheduleParsers.js` | 2D |
| `app/src/pages/PlanRoomPage.jsx` | 3E |
| `app/src/pages/RomPage.jsx` | 5B |
| `app/src/components/estimate/EstimateItemRow.jsx` | 4B |
