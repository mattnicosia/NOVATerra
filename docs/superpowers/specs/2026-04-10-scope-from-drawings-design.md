# Scope from Drawings — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Author:** Matt + Claude

## Problem

The ROM scan pipeline detects schedules and generates scope items, but the output is fragmented:
- `scanRunner.js` auto-injects items into the estimate with no review gate (line ~986)
- Only summary counts are persisted, not the actual scope items (line ~1031)
- Written scope generation exists across three disconnected utilities (`scopeOutlineGenerator`, `tradeScopeGenerator`, `scopeSheetGenerator`) but none are reachable from the scan UI
- Schedule-derived items mostly have `m/l/e = 0` and sometimes `qty = 0` — they are scope hints, not priced takeoff items
- `jobType` vs `buildingType` mismatch in scan pipeline causes ROM to generate off stale project type

Users need a review surface between "NOVA detected scope" and "items are in my estimate."

## Solution

A scope-first review workflow: scan generates scope items, user reviews and cherry-picks in a split-view panel, then explicitly pushes selected items to the estimate. A read-only preview on the public ROM page serves as a lead conversion tool.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where | PlanRoomPage (full) + RomPage (preview) | Full workflow for authenticated users, preview as lead magnet |
| Format | Layered: line items + AI narrative toggle | Items are the data backbone, narrative is the wow factor |
| Flow | Scope-first, then push to estimate | Review gate prevents blind injection of uncertain items |
| Purpose | Review and push to estimate only | No export, sub-distribution, or proposal integration in v1 |
| Review granularity | Item-level cherry-pick with confidence visible | Accept/reject all for speed, NOVA chat for conversational edits |
| Layout | Split view: drawings left, scope right | Matches estimator workflow — plans open, notes beside them |

## Vision Pipeline Upgrade

The scan pipeline moves from a three-call chain (GCV OCR + Haiku detect + Haiku parse) to a two-tier architecture using the best available models as of April 2026.

### Tier 1 — Triage: Gemini 3.1 Flash Lite

- **Task**: Page classification. "Does this page contain a schedule, table, or specification data worth parsing? What type?"
- **Cost**: ~$0.0003/page ($0.25/M input tokens, ~1120 tokens per image)
- **Speed**: Sub-second per page, native multimodal
- **Replaces**: Google Cloud Vision OCR ($0.0015/page) + Claude Haiku detection ($0.01/page)
- **Output**: `{ hasSchedule: bool, scheduleTypes: [], confidence: 0.XX, boundingBoxes: [] }`
- **Why Gemini Flash Lite**: Released March 2026, cheapest frontier vision model, pro-grade reasoning. Native multimodal (no separate OCR preprocessing).

### Tier 2 — Extraction: Claude Sonnet 4

- **Task**: Full structured parsing of detected schedules — fields, quantities, types, merged cells, construction abbreviations
- **Cost**: ~$0.15/page (only runs on pages that passed triage, typically ~15% of a drawing set)
- **Replaces**: Claude Haiku parsing ($0.01/page on ALL pages). Quality is the upgrade — Sonnet handles HM, GWB, WP-1, merged cells, and type labels dramatically better than Haiku.
- **Output**: Structured JSON per schedule type using existing 9 schedule-type prompt templates
- **Why Sonnet**: 9.5/10 on table extraction benchmarks (tied with Gemini Pro), prompts already tuned for Anthropic style, best at following detailed structured extraction instructions with construction domain knowledge.

### Cost Comparison (40-page drawing set, 6 pages with schedules)

| Pipeline | Triage | Extraction | Total |
|----------|--------|-----------|-------|
| Current (GCV + Haiku + Haiku) | 40 x $0.012 = $0.48 | 40 x $0.01 = $0.40 | $1.03 |
| Proposed (Flash Lite + Sonnet) | 40 x $0.0003 = $0.01 | 6 x $0.15 = $0.90 | $0.91 |

Cost is similar. Quality is dramatically better. Google Cloud Vision dependency is eliminated.

### Implementation

- New file: `app/src/utils/geminiClient.js` — Gemini API wrapper for triage calls
- Modified: `scanRunner.js` — replace GCV+Haiku detection with Gemini Flash Lite triage, replace Haiku parsing with Sonnet parsing
- New API route: `app/api/gemini-triage.js` — server-side Gemini proxy (keeps API key server-side)
- Environment: `GEMINI_API_KEY` added to Vercel env vars
- Existing `rom-ai.js` proxy continues to serve public ROM page (Haiku for free tier)

### Future Benchmarks (Post-Ship)

- GPT-5.4 single-pass engineering diagram extraction (March 2026) — could collapse triage+extraction into one call
- PaddleOCR-VL-1.5 for self-hosted triage at zero marginal cost if volume grows
- IBM Granite 4.0 3B Vision for self-hosted table extraction testing

## Architecture

### Data Flow

```
Drawing Upload
    |
    v
Gemini 3.1 Flash Lite TRIAGE (all pages, ~$0.0003/page)
    -> "Has schedule? What type? Where on page?"
    -> Pages WITHOUT schedules: skip (no further processing)
    -> Pages WITH schedules: continue
    |
    v
Claude Sonnet 4 EXTRACTION (schedule pages only, ~$0.15/page)
    -> Full structured parsing per schedule type
    -> Uses existing 9 schedule-type prompt templates (retargeted from Haiku)
    |
    v
scopeOutlineGenerator.js
    -> schedule items (confidence 0.85-0.95, m/l/e = 0)
    -> AI gap-fill items (confidence 0.55-0.65)
    |
    v
scanStore.scopeItems[]           <-- NEW: persist full items, not counts
IDB key: bldg-scope-${estimateId}
STOP auto-injecting into estimate
    |
    v
User reviews in Split View
    - confidence + source visible per item
    - NOVA chat for add/remove/modify
    - narrative toggle for prose view
    |
    "Push to Estimate"
    |
    v
Selected items -> addElement() with:
    source: "nova-scope"
    confidence: 0.XX
    m/l/e: 0 (user must price)
```

### Scope Item Schema

```js
{
  id: "si_xxx",              // unique ID
  code: "08.100",            // CSI code from schedule
  description: "HM Door Frame, Type D-1",
  division: "08 - Openings", // full label, not bare code
  quantity: 12,              // from schedule, or 0 if unknown
  unit: "EA",
  confidence: 0.94,          // 0-1, from detection/parsing
  source: "schedule" | "ai-gap" | "nova-chat",
  scheduleType: "door",      // which of the 9 schedule types
  drawingRef: "A2.1",        // source drawing sheet
  selected: true,            // user's cherry-pick state
  pushed: false,             // true after pushed to estimate
  pushedAt: null,            // ISO timestamp
  narrative: null,           // AI-generated prose, cached per session
}
```

No `material`, `labor`, or `equipment` fields. These are scope hints. Pricing happens in the estimate after push.

### Changes to Existing Code

**`scanRunner.js` ~line 986:**
Remove `addElement()` auto-inject. Store to `scanStore.scopeItems` instead.

**`scanRunner.js` ~line 1031:**
Store full `scopeOutline.items` array, not just `{ scheduleCount, lineItemCount }`.

**`scanRunner.js` ~line 865/873:**
Fix `jobType`/`buildingType` mismatch. Use `buildingType` from detection, or reconcile before ROM generation:
```js
// Before ROM generation, ensure jobType matches detected buildingType
if (detectedBuildingType && detectedBuildingType !== proj.jobType) {
  useProjectStore.getState().setProject({
    ...proj,
    jobType: detectedBuildingType,
  });
}
```

**`scanStore.js`:**
Add `scopeItems: []`, `setScopeItems`, `updateScopeItem`, `toggleScopeItemSelected`, `selectAllScopeItems`, `deselectAllScopeItems` actions.

**`RomPage.jsx` ~line 761:**
Add `generateScopeOutline()` call to the drawings upload path so the preview has real items.

## UI Design

### PlanRoomPage Split View

After scan completes, PlanRoomPage switches to a split layout:

**Left panel: Drawing viewer**
- Current drawing with page navigation (already exists)
- Detected schedule regions highlighted with colored bounding boxes
- Color-coded by schedule type: doors = blue, finishes = green, windows = amber
- Clicking a scope item on the right scrolls/highlights the corresponding region

**Right panel: Scope Review (new component: `ScopeReviewPanel`)**

Three fixed zones stacked vertically:

**Zone 1: Toolbar (fixed top)**
- Item count: "38 from schedules, 9 AI suggestions"
- Accept All / Reject All buttons
- Group-by toggle: Division (default) | Schedule Type | Confidence
- Narrative toggle: "Items / Narrative"

**Zone 2: Item list (scrollable)**
- Grouped by division with collapsible headers showing group item count
- Each item row:
  - Checkbox (checked = selected for push)
  - CSI code in purple mono font
  - Description text
  - Confidence badge: green >= 0.80, amber 0.60-0.79, red < 0.60
  - Quantity + unit (or "---" when zero/unknown)
  - Source icon: schedule vs AI gap-fill
  - Drawing ref link (clicking scrolls left panel to that sheet)
- AI gap-fill items render at lower opacity with amber badges
- Pushed items show "In estimate" badge, checkbox disabled
- Narrative mode: toggling "Narrative" fires `generateTradeNarrative()` for each visible division group. Uses Anthropic API (Haiku for cost efficiency). Result is cached in `scopeItem.narrative` field per division for the session. Subsequent toggles use cached text. If API fails, falls back to hardcoded trade narratives from `tradeScopeGenerator.js`.

**Zone 3: NOVA Chat + Push (fixed bottom)**
- Compact chat input with placeholder examples
- NOVA responds inline (1-2 lines, not a full chat window)
- Supported intents:
  - Add items: "Add fire caulking to Div 07" -> new scope item, confidence 0.5, source "nova-chat"
  - Remove items: "Remove all lighting fixtures" -> unchecks matching (does not delete)
  - Modify items: "Change D-1 quantity to 15" -> updates in place
  - Ask questions: "What schedule did the GWB come from?" -> answers from scan context
  - Bulk operations: "Select only Div 08 and 09" -> adjusts checkboxes
- "Push to Estimate" button with selected count

### RomPage Preview (Lead Conversion)

Appears below ROM pricing breakdown after scan:
- "NOVA detected X scope items from your drawings" header
- Top 8-10 items, grouped by 2-3 divisions
- Same visual language: code, description, confidence badge, quantity
- Items beyond preview are blurred with overlay: "Sign up to see all N items"
- CTA: "Get Full Scope -> Create Free Account"
- No checkboxes, no chat, no narrative, no export
- New component: `RomScopePreview` — takes `scopeItems[]`, renders first N with blur gate

## Push-to-Estimate Mechanics

### Push Flow

1. Collect selected items: `scopeItems.filter(si => si.selected && !si.pushed)`
2. For each selected item, call `addElement(division, preset)`:
   ```js
   addElement(si.division, {
     code: si.code,
     name: si.description,
     unit: si.unit || "EA",
     quantity: si.quantity || 1,
     material: 0,
     labor: 0,
     equipment: 0,
     _scopeSource: "nova-scope",
     _scopeConfidence: si.confidence,
     _scopeItemId: si.id,
   });
   ```
3. Mark scope items as pushed: `pushed: true`, `pushedAt: new Date().toISOString()`
4. Navigate to Estimate tab with toast: "24 scope items added --- price them to complete your estimate"

### Traceability in Estimate

Items from scope carry `_scopeSource` and `_scopeConfidence` metadata. In `EstimateItemRow`, items with `_scopeSource === "nova-scope"` show a subtle NOVA icon. This lets the estimator distinguish scan-generated items from manual entry.

### Edge Cases

- **Re-push**: Only items with `pushed: false` are eligible. No duplicates.
- **Estimate has existing items**: Push appends, does not replace.
- **User deletes pushed item from estimate**: Scope item stays `pushed: true`. Scope is the reference, estimate is the working copy.
- **Multiple scans**: New scan replaces `scopeItems[]`. Previous pushed items remain in the estimate. User gets a confirmation dialog if scope items exist: "New scan will replace current scope. X items already pushed to estimate will not be affected."

## New Files

| File | Purpose |
|------|---------|
| `app/src/components/planroom/ScopeReviewPanel.jsx` | Right-side scope review with items, confidence, NOVA chat |
| `app/src/components/planroom/ScopeItemRow.jsx` | Individual scope item with checkbox, confidence badge, drawing ref |
| `app/src/components/planroom/ScopeNarrativeBlock.jsx` | AI-generated prose summary per division group |
| `app/src/components/planroom/ScopeNovaChat.jsx` | Compact NOVA chat with scope-editing intents |
| `app/src/components/rom/RomScopePreview.jsx` | Read-only preview for public ROM page |
| `app/src/utils/geminiClient.js` | Gemini API wrapper for Flash Lite triage calls |
| `app/api/gemini-triage.js` | Server-side Gemini proxy (keeps API key server-side) |

## Modified Files

| File | Change |
|------|--------|
| `app/src/stores/scanStore.js` | Add `scopeItems[]` state + CRUD actions |
| `app/src/utils/scanRunner.js` | Replace GCV+Haiku with Flash Lite triage + Sonnet extraction; stop auto-inject; persist full scope items; fix jobType/buildingType |
| `app/src/utils/scheduleParsers.js` | Retarget parsing prompts from Haiku to Sonnet (prompt quality improvements for stronger model) |
| `app/src/pages/PlanRoomPage.jsx` | Split view layout after scan, mount ScopeReviewPanel |
| `app/src/pages/RomPage.jsx` | Add scope outline generation, mount RomScopePreview |
| `app/src/components/estimate/EstimateItemRow.jsx` | Show NOVA icon for `_scopeSource` items |

## Out of Scope (v1)

- Scope export (PDF, Word, plain text) — future
- Send scope to subs — future, needs contact management
- Proposal integration — future, connect to Living Proposals
- Scope template customization UI — future
- Price matching from seed elements — future enhancement to populate m/l/e before push
- Parameter correction feedback loop — future
- Calibration learning from pushed scope vs actual estimate — future

## Testing Strategy

- Unit test `scanStore` scope item CRUD
- Unit test push-to-estimate logic (selected items only, no duplicates, metadata preserved)
- Integration test: mock scan output -> scope items persisted -> push -> items in estimate
- Manual test: upload real drawing set, verify detection highlights, review scope, push, confirm in estimate
