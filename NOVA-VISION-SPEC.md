# NOVA Vision — Knowledge System & Predictive Takeoff Specification

> **This document specifies the complete NOVA Vision system: the AI-powered predictive takeoff engine that identifies construction elements on drawings and suggests measurements before the user clicks. Performance and speed are first-class constraints — every design decision prioritizes sub-2-second response times.**
>
> **Companion to:** `NOVATERRA-PLATFORM-SPEC.md` (platform architecture), `BLDG-TALENT-SPEC.md` (assessment platform)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Performance Budget](#2-performance-budget)
3. [Prediction Cascade](#3-prediction-cascade)
4. [Context Assembly Engine](#4-context-assembly-engine)
5. [Legend Parser](#5-legend-parser)
6. [First-Click Example Teaching](#6-first-click-example-teaching)
7. [Blueprint Knowledge Base Integration](#7-blueprint-knowledge-base-integration)
8. [Cross-Sheet Learning](#8-cross-sheet-learning)
9. [Caching Architecture](#9-caching-architecture)
10. [Accuracy Measurement & Guardrails](#10-accuracy-measurement--guardrails)
11. [File Manifest](#11-file-manifest)
12. [Build Phases](#12-build-phases)

---

## 1. System Overview

### What NOVA Vision Does
When a user starts a takeoff (e.g., "count light fixtures"), NOVA Vision analyzes the active drawing and predicts where every matching element is located — before the user clicks. Predictions appear as semi-transparent markers on the drawing. The user accepts (click) or rejects (dismiss) each one. Every interaction teaches the system.

### Why It Matters
Manual takeoffs on a 40-sheet commercial drawing set take 3-8 hours. Predictive takeoffs reduce this to 20-60 minutes. For scanned/raster PDFs (the majority of real-world plans), there is no text layer — Vision is the *only* path to predictions.

### Current State (March 2026)
| Component | Status | Notes |
|-----------|--------|-------|
| Tag-based predictions (Phase 1) | ✅ Working | Requires PDF text layer — rare on real plans |
| Geometry predictions (Phase 2) | ✅ Working | Requires PDF vector data — rare on scanned plans |
| Vision predictions (Phase 3) | 🟡 Scaffold built | API calls succeed but accuracy is low (~15%) |
| Legend Parser | ❌ Not built | Critical for symbol identification |
| First-Click Teaching | ❌ Not built | Dramatically improves per-session accuracy |
| Blueprint KB integration | ❌ Not built | Knowledge files exist but aren't fed to Vision |
| Cross-Sheet Learning | ❌ Not built | Session-local only, no persistence |

### Design Principles
1. **Speed over perfection** — A 70% accurate prediction in 1.5s beats a 95% prediction in 8s. Users can dismiss wrong ones faster than they can wait.
2. **Progressive enrichment** — Start with the cheapest context, add more only if accuracy is insufficient.
3. **Zero-hallucination preference** — Missing a real element is acceptable. Predicting phantom elements is not. When uncertain, abstain.
4. **Offline-first** — Predictions must work without cloud. Vision API is the exception, clearly communicated to the user.

---

## 2. Performance Budget

### Latency Targets

| Operation | Target | Hard Limit | Notes |
|-----------|--------|------------|-------|
| **Warm prediction lookup** | <50ms | 100ms | Pre-computed tag data from cache |
| **Tag-based prediction** (Phase 1) | <200ms | 500ms | Local text extraction + pattern matching |
| **Geometry prediction** (Phase 2) | <300ms | 800ms | Local vector analysis |
| **Vision prediction** (Phase 3) | <2.0s | 4.0s | API call with optimized context |
| **Legend parse** (per sheet) | <3.0s | 6.0s | One-time during Discovery, cached forever |
| **First-Click crop + re-query** | <2.5s | 5.0s | Crop region → API call with example |
| **Context assembly** | <20ms | 50ms | Local string building, no I/O |

### Token Budgets (per Vision API call)

| Context Layer | Max Tokens | Priority |
|---------------|-----------|----------|
| System prompt (base) | 400 | Always included |
| Takeoff description + type | 50 | Always included |
| First-Click example image | ~1,600 (image) | When available |
| Legend data (parsed) | 200 | When available |
| Schedule data (parsed) | 300 | When relevant |
| Sheet metadata (title, scale, discipline) | 100 | When available |
| Blueprint KB excerpt | 300 | Discipline-matched only |
| Cross-sheet hints | 150 | When prior sheets done |
| **Total budget** | **≤3,100 tokens** | — |

**Why 3,100 tokens:** Sonnet processes ~2,000 input tokens in <1s. Image tokens are separate (~1,600 for a 1200px JPEG). Total input ≈4,700 tokens (text + image) keeps response time under 2s with network overhead. Larger prompts push toward 3-4s which breaks the UX.

### Image Optimization

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max dimension | 1200px | Sonnet sweet spot: enough detail for symbols, under token limit |
| JPEG quality | 0.85 | Good compression, minimal detail loss |
| Estimated image tokens | ~1,600 | Based on Anthropic's image token formula |
| Crop region (First-Click) | 400×400px | Focused area around user's click |

### Cost Budget

| Operation | Est. Cost | Frequency |
|-----------|----------|-----------|
| Vision prediction (per sheet) | $0.01-0.02 | Once per takeoff type per sheet |
| Legend parse (per sheet) | $0.02-0.03 | Once per project, cached |
| First-Click re-query | $0.01-0.02 | 0-3 times per takeoff |
| **Full 40-sheet project** | **$1.50-3.00** | One-time |

---

## 3. Prediction Cascade

### Three-Phase Waterfall

When a user starts a takeoff on a drawing, predictions fire in sequence. Each phase is attempted only if the previous one yields insufficient results.

```
Phase 1: TEXT/TAG (free, <200ms)
  ├─ Extract text layer from PDF
  ├─ Find tag patterns matching takeoff description
  ├─ Score relevance: description ↔ nearby text
  └─ Result: tagged predictions with high confidence
      ↓ if <3 predictions found

Phase 2: GEOMETRY (free, <300ms)
  ├─ Extract vector data (lines, rectangles)
  ├─ Detect wall runs, room boundaries, fixture outlines
  ├─ Match geometry to takeoff type (linear → walls, area → rooms)
  └─ Result: geometry-based predictions
      ↓ if <3 predictions found

Phase 3: VISION (API call, <2s)
  ├─ Assemble context (Section 4)
  ├─ Optimize drawing image (1200px, 0.85 quality)
  ├─ Send to Claude Sonnet with construction-aware prompt
  ├─ Parse response: locations[], confidence, notes
  └─ Result: vision-based predictions with coordinates
```

### Phase 3 Decision Gate

Vision is only called when:
1. Phases 1+2 yielded fewer than 3 predictions, AND
2. Drawing has image data (`drawing.data` exists), AND
3. User hasn't disabled Vision in settings (future), AND
4. No cached Vision result exists for this drawing+takeoff combination

### Response Merging

When multiple phases return results, merge with priority: Phase 1 > Phase 2 > Phase 3. Deduplicate predictions within 30px radius (keep highest confidence).

---

## 4. Context Assembly Engine

### Architecture

The Context Assembly Engine builds the optimal prompt for each Vision API call. It selects from available context layers based on what's been discovered about the project, and stays within the token budget.

```
contextAssembler.js (new file)
  ├─ assembleVisionContext(drawing, takeoff, projectData)
  │   ├─ Layer 0: Base system prompt (always)
  │   ├─ Layer 1: Takeoff description + measurement type (always)
  │   ├─ Layer 2: First-Click example (when available)
  │   ├─ Layer 3: Legend data for this discipline (when parsed)
  │   ├─ Layer 4: Schedule data for this takeoff type (when scanned)
  │   ├─ Layer 5: Sheet metadata (title, number, scale, discipline)
  │   ├─ Layer 6: Blueprint KB excerpt (discipline-matched)
  │   ├─ Layer 7: Cross-sheet hints (prior sheets' results)
  │   └─ Layer 8: Negative examples (known false positives)
  └─ Returns: { systemPrompt, userContent[], estimatedTokens }
```

### Layer Details

**Layer 0 — Base System Prompt (400 tokens, always included)**
```
You are NOVA, an expert construction estimating AI analyzing a
construction drawing. Identify all instances of the specified element.

Rules:
- Return ONLY elements you can see with high confidence
- Use percentage-based coordinates (0-100 for both x and y)
- If you find zero instances, return {"found": false}
- Never guess or hallucinate locations
- Construction drawings use standardized symbols per discipline
```

**Layer 1 — Takeoff Description (50 tokens, always included)**
```
Find all instances of: "${takeoff.description}"
Measurement type: ${measurementType}
// For count: return center points
// For linear: return start/end points of each run
// For area: return corner points of each region
```

**Layer 2 — First-Click Example (image + 100 tokens, when available)**
```
The user has identified one instance at the marked location.
[400×400 crop image centered on user's click]
Find all other instances of this same element on the full drawing.
```

**Layer 3 — Legend Data (200 tokens max, when parsed)**
```
Drawing legend maps these symbols to descriptions:
- Circle with 4 lines = 2x4 Recessed Troffer
- Circle with dot = Downlight
- Half circle on wall = Wall Sconce
Match the takeoff description to the appropriate symbol.
```

**Layer 4 — Schedule Data (300 tokens max, when relevant)**
```
Project schedule for ${scheduleType}:
| Type | Description | Size | Notes |
| A    | Flush Wood  | 3070 | SC hardware |
| B    | Hollow Metal| 3070 | Panic hardware |
Find marks matching type codes from this schedule.
```

**Layer 5 — Sheet Metadata (100 tokens, when available)**
```
Sheet: ${drawing.sheetNumber} — ${drawing.label}
Scale: ${drawing.scale}
Discipline: ${discipline} (E=Electrical, P=Plumbing, M=Mechanical, A=Architectural)
```

**Layer 6 — Blueprint KB Excerpt (300 tokens max, discipline-matched)**
Selected from `memory/blueprint-*.md` based on discipline and takeoff type:
- Electrical takeoff → lighting fixture symbols from `blueprint-estimating-data.md`
- Architectural takeoff → door/window conventions from `blueprint-visual-literacy.md`
- Structural takeoff → rebar notation from `blueprint-estimating-data.md`

**Layer 7 — Cross-Sheet Hints (150 tokens, when prior data exists)**
```
On previous sheets for this takeoff, NOVA found:
- Sheet E1.1: 23 instances (18 accepted, 2 rejected, 3 pending)
- Common symbol: circle with 4 radiating lines
- Average spacing: ~8ft on center
Expect similar density and symbol style on this sheet.
```

**Layer 8 — Negative Examples (100 tokens, when rejection data exists)**
```
The user has REJECTED predictions at these locations on this sheet:
- (45%, 32%): was a text label, not a fixture
- (12%, 78%): was a different fixture type
Avoid similar false positives.
```

### Token Counting

Use simple heuristic: `Math.ceil(text.length / 4)` for English text. No need for a tokenizer library — we're budgeting, not billing. Overestimate by 10% as safety margin.

### Assembly Priority

When total exceeds budget, shed layers in reverse priority (L8 first, then L7, L6, etc.). Layers 0-1 are never shed. Layer 2 (First-Click) is shed only as absolute last resort since it provides the highest accuracy lift.

---

## 5. Legend Parser

### Purpose
Construction drawings contain symbol legends that map graphical symbols to textual descriptions. Parsing these once per project gives NOVA a "decoder ring" for every subsequent Vision call.

### Architecture

```
legendParser.js (new file)
  ├─ detectLegendRegions(drawing) → regions[]
  ├─ parseLegend(drawing, region) → symbolMap
  ├─ getLegendForDiscipline(discipline) → symbolMap (cached)
  └─ formatLegendForPrompt(symbolMap, maxTokens) → string
```

### Detection Strategy

Legends typically appear:
1. On sheet E0.1, P0.1, M0.1 (discipline cover sheets — numbered X.0 or X0.1)
2. On the right side or bottom of plan sheets
3. Near text containing "LEGEND", "SYMBOL LEGEND", "FIXTURE SCHEDULE", "LUMINAIRE SCHEDULE"

**Detection flow:**
1. During Discovery auto-label phase, flag sheets whose title/label contains "LEGEND", "SYMBOL", "SCHEDULE", or are numbered `X0.1` / `X.0`
2. On flagged sheets, run a focused Vision call: "Identify the symbol legend on this drawing. For each entry, describe the graphical symbol and its text label."
3. Store results in `legendStore` (new Zustand store, persisted to IDB)

### Legend Data Structure

```javascript
{
  projectId: string,
  discipline: "E" | "P" | "M" | "A" | "S" | "C",
  sourceSheet: string,
  symbols: [
    {
      description: "2x4 Recessed Troffer LED",
      symbolDescription: "Rectangle with X pattern",  // text description of the graphic
      code: "A",  // schedule type code if present
      category: "lighting-fixture",
      cropBase64: string | null  // 80×80 crop of the symbol (Phase 2)
    }
  ],
  parsedAt: timestamp,
  confidence: 0.0-1.0
}
```

### Performance Notes
- Legend parsing happens **during Discovery** (background), not during takeoff
- Results cached in IDB — zero cost on subsequent sessions
- One API call per legend sheet (~$0.02, <3s)
- If no legend sheet detected, gracefully skip — Vision works without it (lower accuracy)

---

## 6. First-Click Example Teaching

### Purpose
When the user places their first takeoff click, NOVA crops a region around that click point and sends it back to Vision as a reference image: "find all other instances of THIS." This is the single highest-impact accuracy improvement available.

### Architecture

```
firstClickTeacher.js (new file)
  ├─ captureFirstClick(drawing, point, takeoff) → exampleData
  ├─ buildExamplePrompt(exampleData) → content[]
  └─ invalidateExample(takeoffId) → void
```

### Flow

```
1. User starts takeoff "Count: 2x4 Recessed Troffers"
2. NOVA Vision fires Phase 3 → returns predictions (maybe inaccurate)
3. User clicks their first real point (or accepts a prediction)
4. captureFirstClick():
   a. Crop 400×400px region centered on click point from drawing.data
   b. Store crop as base64 in session memory (Map, not IDB — session only)
   c. Mark the click point on the crop with a small red circle overlay
5. On the SAME sheet: re-fire Vision with crop as Layer 2 context
6. On SUBSEQUENT sheets: include crop in initial Vision call
```

### Re-fire Decision
Only re-fire Vision on the current sheet if:
- Initial prediction count was <5, OR
- User rejected >50% of initial predictions

This avoids wasting an API call when initial predictions were already good.

### Crop Specification
- Size: 400×400 CSS pixels from the drawing canvas
- If click is near edge, shift crop to keep it on-canvas (no black bars)
- Overlay: 3px red circle (radius 15px) at click point
- Format: JPEG, quality 0.9
- Store in `_firstClickCache` Map keyed by `${takeoffId}`

### Performance Notes
- Crop is instant (<5ms, canvas operation)
- Re-fire adds one API call (~$0.01-0.02, <2.5s)
- The crop image adds ~800 tokens to the prompt (small image)
- Net effect: 2-3x accuracy improvement based on construction symbol research

---

## 7. Blueprint Knowledge Base Integration

### Existing Assets (455 lines, ~27KB across 4 files)

| File | Lines | Content | Token Estimate |
|------|-------|---------|---------------|
| `blueprint-markers.md` | 143 | 12 marker types (section cuts, details, elevations, grids) | ~1,900 |
| `blueprint-visual-literacy.md` | 121 | Line weights, hatch patterns, sheet numbering, abbreviations | ~1,800 |
| `blueprint-estimating-data.md` | 92 | Rebar notation, steel, MEP symbols, schedules, wall types | ~1,400 |
| `blueprint-master-patterns.md` | 99 | Drawing completeness, TYP detection, RFI triggers, scope boundaries | ~1,700 |
| **Total** | **455** | — | **~6,800** |

### Problem
6,800 tokens is too large to include in every Vision call (would blow the 3,100 text token budget and add 1-2s latency). But the knowledge IS valuable — NOVA needs to understand that a circle with radiating lines is a light fixture, not a compass rose.

### Solution: Discipline-Matched Excerpts

Pre-build focused excerpts (~300 tokens each) for each discipline × takeoff category combination:

```javascript
// blueprintExcerpts.js (new file, compile-time constant)

const EXCERPTS = {
  "E:lighting": `
    Lighting symbols on electrical plans:
    - Circle = generic fixture/junction box
    - Circle with 4 lines = 2x4 fluorescent/LED troffer
    - Filled circle = recessed downlight
    - Circle with "WP" = weatherproof fixture
    - Half circle on wall line = wall sconce/bracket
    - Rectangle = surface-mount fixture
    - Triangle/arrow = emergency/exit light
    - Subscript letters (A, B, C...) = fixture type from schedule
    Fixtures are typically shown at center of room or on regular grid spacing.
  `,
  "E:power": `
    Power symbols on electrical plans:
    - Circle with parallel lines = duplex receptacle
    - Circle with "WP" = weatherproof receptacle
    - Triangle = switch (S, S3, SD = single, 3-way, dimmer)
    - Rectangle with number = panel board
    Lines between symbols = circuit homeruns, not physical conduit paths.
  `,
  "A:doors": `
    Door symbols on architectural floor plans:
    - Arc with line = swing door (arc shows swing direction)
    - Double arc = double door
    - Arc into wall pocket = pocket door
    - Parallel lines at opening = sliding door
    - Circle/diamond with number = door number tag
    - Door number references door schedule (size, type, hardware)
    Door tags typically contain: number, sometimes prefix by floor.
  `,
  "A:windows": `...`,
  "P:fixtures": `...`,
  "M:equipment": `...`,
  "S:structural": `...`,
  // ~15 combinations total
};
```

### Mapping Logic

```javascript
function selectExcerpt(discipline, takeoffDescription) {
  // Map takeoff description to category
  const category = classifyTakeoffCategory(takeoffDescription);
  // e.g., "2x4 recessed troffer" → "lighting"

  const key = `${discipline}:${category}`;
  return EXCERPTS[key] || EXCERPTS[`${discipline}:general`] || "";
}
```

### Performance Notes
- Excerpts are compile-time constants — zero runtime cost to select
- ~300 tokens per excerpt — fits comfortably in Layer 6 budget
- No API calls, no file I/O, no async
- Excerpts are curated from the full KB — human-quality, not auto-generated

---

## 8. Cross-Sheet Learning

### Purpose
When the user completes takeoffs on Sheet E1.1, the accept/reject data from that sheet should inform predictions on E1.2, E1.3, etc. Same building, same symbol set, similar density.

### Architecture

```
Existing: _learningRecord (session Map in predictiveEngine.js)
Enhancement: Persist to crossSheetCache (new IDB store)
```

### Data Captured Per Sheet

```javascript
{
  sheetId: string,
  takeoffId: string,
  description: string,
  discipline: string,
  results: {
    totalPredicted: number,
    accepted: number,
    rejected: number,
    userAdded: number,  // manual clicks not from predictions
    avgConfidence: number,
    dominantSymbol: string | null,  // description of most-accepted symbol
    density: number,  // instances per sheet
  },
  timestamp: number
}
```

### How It's Used

1. **Confidence modulation**: If E1.1 had 80% accept rate, boost confidence multiplier for E1.2 predictions by 1.15×
2. **Density anchoring** (Layer 7 context): "Previous sheet had 23 fixtures. Expect similar density." This prevents Vision from hallucinating 50 or returning 3.
3. **Symbol reinforcement**: "The accepted symbol was a rectangle with X pattern." This helps Vision lock onto the right symbol.
4. **Negative learning**: If a specific coordinate pattern was consistently rejected (e.g., text labels misidentified as fixtures), add to Layer 8 negative examples.

### Persistence

- **Session cache**: `_crossSheetMap` (Map in memory) — fast lookup during active session
- **IDB persistence**: `bldg-cross-sheet` store — survives page reload within same estimate
- **NOT persisted to cloud**: Cross-sheet data is project-specific and session-scoped. Not valuable long-term.
- **Eviction**: Clear when switching to a different estimate

### Performance Notes
- Write to IDB is async/non-blocking — fires after user accepts/rejects, doesn't slow UI
- Read from IDB only on session start (once)
- Cross-sheet context adds ~150 tokens — minimal impact on API latency

---

## 9. Caching Architecture

### Cache Hierarchy

```
Layer 1: In-Memory (instant, session-only)
  ├─ warmPredictionCache (5 entries, LRU) — pre-computed tag analysis
  ├─ extractionCache (20 entries, LRU) — PDF text/vector data per drawing
  ├─ pdfRawCache (Map) — raw PDF ArrayBuffers by filename
  ├─ _firstClickCache (Map) — crop images by takeoffId
  ├─ _learningRecord (Map, 50 cap) — accept/reject per tag
  ├─ _crossSheetMap (Map) — per-sheet prediction results
  └─ _visionResultCache (Map, 40 cap) — Vision API responses (NEW)

Layer 2: IndexedDB (persistent, offline)
  ├─ bldg-pdf-raw — raw PDF files by filename
  ├─ bldg-legends — parsed legend data by projectId (NEW)
  ├─ bldg-cross-sheet — cross-sheet learning by estimateId (NEW)
  └─ bldg-est-* — full estimate data (existing)

Layer 3: Supabase (cloud, multi-device)
  └─ Not used for Vision data — all local/session
```

### Vision Result Cache (NEW)

**Key**: `${drawingId}:${takeoffDescription}:${measurementType}`
**Value**: `{ predictions[], timestamp, contextHash }`
**TTL**: Valid for current session. Invalidated when:
- User uploads new drawings
- Legend is re-parsed
- First-Click example changes
- User explicitly requests "re-scan"

**Size cap**: 40 entries (LRU eviction). At ~2KB per entry, max 80KB memory.

### Cache Invalidation Rules

| Event | Caches Invalidated |
|-------|-------------------|
| New drawing uploaded | extractionCache, warmCache for that drawing |
| Legend parsed | _visionResultCache (all entries for that discipline) |
| First-Click captured | _visionResultCache (entries for that takeoffId) |
| Estimate switched | _crossSheetMap, _firstClickCache, _visionResultCache (all) |
| Session reload | All in-memory caches (rebuilt from IDB where applicable) |

---

## 10. Accuracy Measurement & Guardrails

### Metrics Tracked

```javascript
// visionMetrics.js (new file)
{
  sessionMetrics: {
    visionCalls: number,
    totalPredictions: number,
    accepted: number,
    rejected: number,
    userAdded: number,  // manual, not from predictions
    avgLatency: number,
    avgConfidence: number,
    contextLevelsUsed: { L0: n, L1: n, L2: n, ... L8: n },
    costEstimate: number,
  },
  perTakeoffMetrics: Map<takeoffId, {
    strategy: string,
    predictions: number,
    accepted: number,
    rejected: number,
    precision: number,  // accepted / (accepted + rejected)
    recall: number,     // accepted / (accepted + userAdded)
    f1: number,
    latencyMs: number,
    contextLayers: string[],
  }>
}
```

### Guardrails Against Hallucination

1. **Quantity Anchor**: If cross-sheet data suggests ~20 fixtures per sheet, flag responses with >40 or <5 for low confidence (0.3×)
2. **Coordinate Clustering**: If >60% of predictions cluster in one quadrant, something is wrong — reduce confidence to 0.4×
3. **Confidence Floor**: Suppress predictions below 0.35 confidence entirely (don't show to user)
4. **Max Predictions Cap**: Never return more than 200 predictions per sheet. If Vision returns more, take top 200 by confidence.
5. **Edge Avoidance**: Predictions within 2% of drawing edges are likely artifacts — penalize confidence by 0.5×
6. **Duplicate Suppression**: Merge predictions within 30px radius, keep highest confidence

### A/B Testing Framework (Future)

Track prediction accuracy across context configurations to empirically find the optimal prompt:

```javascript
// Not built in Phase 1 — but data structure supports it
{
  experimentId: "legend-vs-no-legend",
  variant: "A",  // A = with legend, B = without
  takeoffId: string,
  precision: number,
  recall: number,
  latencyMs: number,
}
```

Store in `_experimentLog` (session-only). Review in dev console. No UI needed initially.

---

## 11. File Manifest

### New Files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `app/src/utils/contextAssembler.js` | Build optimal Vision prompts from available context | ~250 |
| `app/src/utils/legendParser.js` | Detect and parse symbol legends from drawings | ~200 |
| `app/src/utils/firstClickTeacher.js` | Capture click examples and build teaching prompts | ~120 |
| `app/src/utils/blueprintExcerpts.js` | Compile-time KB excerpts by discipline × category | ~300 |
| `app/src/utils/visionMetrics.js` | Track prediction accuracy and performance | ~100 |
| `app/src/stores/legendStore.js` | Persist parsed legends (Zustand + IDB) | ~80 |

### Modified Files

| File | Changes |
|------|---------|
| `app/src/utils/predictiveEngine.js` | Replace inline Vision prompt with contextAssembler call; add cross-sheet writes; integrate First-Click; use visionResultCache |
| `app/src/utils/ai.js` | Add `cropImageRegion()` enhancements for First-Click; no other changes needed |
| `app/src/utils/uploadPipeline.js` | During auto-label phase, flag legend sheets for parsing |
| `app/src/utils/scheduleParsers.js` | Export schedule data in a format consumable by contextAssembler (Layer 4) |
| `app/src/stores/takeoffsStore.js` | Add First-Click trigger after first accept/manual click |
| `app/src/stores/scanStore.js` | Expose schedule data for contextAssembler consumption |
| `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | Wire up First-Click capture; display accuracy metrics (optional) |
| `app/src/pages/PlanRoomPage.jsx` | Trigger legend parsing during Discovery flow |

### Unchanged Files
- `app/src/stores/drawingsStore.js` — no changes needed
- `app/src/utils/pdfExtractor.js` — Phase 1/2 extraction unchanged
- All Blueprint KB files in `memory/` — consumed at compile time via excerpts, not modified

---

## 12. Build Phases

### Phase A — Context Assembly + Blueprint Excerpts (3-4 hours)
**Goal**: Replace the hardcoded Vision prompt with the dynamic context assembler. Immediate accuracy improvement from discipline-matched KB excerpts.

**Build order:**
1. `blueprintExcerpts.js` — Curate ~15 discipline×category excerpts from existing KB files
2. `contextAssembler.js` — Implement Layers 0, 1, 5, 6 (base prompt + description + metadata + KB excerpt)
3. Update `predictiveEngine.js` — Replace inline prompt with `assembleVisionContext()` call
4. Add `_visionResultCache` to predictiveEngine — cache Vision responses

**Test**: Run takeoff on lighting plan. Vision prompt should now include electrical lighting symbol knowledge. Expect moderate accuracy improvement.

**Performance impact**: None. Context assembly is <20ms of string building. Prompt is same size or smaller than current hardcoded prompt (more focused).

### Phase B — Legend Parser (3-4 hours)
**Goal**: Automatically parse symbol legends during Discovery. Legends become Layer 3 context in all subsequent Vision calls for that discipline.

**Build order:**
1. `legendStore.js` — Zustand store with IDB persistence
2. `legendParser.js` — Detection (sheet naming heuristics) + parsing (Vision API call with focused prompt)
3. Update `uploadPipeline.js` — Flag legend sheets during auto-label
4. Update `PlanRoomPage.jsx` — Trigger legend parsing after Discovery scan completes
5. Update `contextAssembler.js` — Wire Layer 3 (legend data) into prompt assembly

**Test**: Upload a drawing set with an electrical legend sheet. After Discovery, check legendStore. Then run a lighting takeoff — prompt should include parsed symbol mappings.

**Performance impact**: Legend parsing adds 2-3s during Discovery (one-time, background). Zero impact during takeoff — cached data.

### Phase C — First-Click Example Teaching (2-3 hours)
**Goal**: After user's first click/accept, crop the region and use it as a visual reference for all subsequent predictions on this and other sheets.

**Build order:**
1. `firstClickTeacher.js` — Capture, crop, store, overlay marker
2. Update `takeoffsStore.js` — After first measurement or first accept, call `captureFirstClick()`
3. Update `contextAssembler.js` — Wire Layer 2 (First-Click image) into prompt assembly
4. Update `predictiveEngine.js` — Re-fire Vision on current sheet when First-Click captured (conditional)

**Test**: Start a lighting takeoff. Accept one prediction or click manually. Observe re-fire on same sheet with improved accuracy. Navigate to next sheet — First-Click context should be included in initial Vision call.

**Performance impact**: One additional API call on first sheet (~2s). All subsequent sheets benefit without extra cost.

### Phase D — Cross-Sheet Learning (2-3 hours)
**Goal**: Predictions on Sheet 5 should be informed by accept/reject patterns from Sheets 1-4.

**Build order:**
1. Add `_crossSheetMap` + IDB persistence to `predictiveEngine.js`
2. After each sheet's takeoff is complete (user navigates away), write summary to cross-sheet cache
3. Update `contextAssembler.js` — Wire Layer 7 (cross-sheet hints) and Layer 8 (negative examples)
4. Implement quantity anchor guardrail (Section 10, item 1)

**Test**: Complete takeoffs on 2 sheets. Navigate to sheet 3. Cross-sheet context should appear in prompt. Density anchor should prevent wildly different prediction counts.

**Performance impact**: Zero. Cross-sheet data is local reads + ~150 tokens in prompt.

### Phase E — Metrics + Guardrails (1-2 hours)
**Goal**: Track accuracy, enforce guardrails, surface metrics for development.

**Build order:**
1. `visionMetrics.js` — Session metrics tracking
2. Wire metrics into `predictiveEngine.js` — Track every call, accept, reject
3. Implement guardrails from Section 10 (confidence floor, max cap, edge avoidance, clustering check)
4. Add dev-only metrics display (console.table on demand, no UI)

**Test**: Run several takeoffs. Call `getVisionMetrics()` in console. Verify precision/recall tracking. Verify guardrails suppress low-confidence predictions.

### Phase F — Cleanup (1 hour)
1. Remove pink debug overlay bar from TakeoffsPage
2. Remove diagnostic `console.log` statements from pdfExtractor, predictiveEngine, uploadPipeline
3. Remove REPAIR PDF button from TakeoffsPage
4. Final review of all error handling and edge cases

---

## Appendix A: Prompt Template (Phase A baseline)

```
SYSTEM:
You are NOVA, an expert construction estimating AI analyzing a construction
drawing. Your task is to identify all instances of a specified element.

Sheet: {sheetNumber} — {sheetLabel}
Scale: {scale}
Discipline: {discipline}

{blueprintExcerpt}

{legendData}

{crossSheetHints}

Rules:
- Return ONLY elements you can visually confirm with high confidence
- Coordinates are percentages: x=0 is left edge, x=100 is right edge
- If you find zero instances, return {"found": false, "reason": "..."}
- Never fabricate locations — missing one is better than a false positive
- Ignore title blocks, revision clouds, and drawing borders

USER:
[Drawing image — 1200px max dimension, JPEG 0.85]

{firstClickImage + "The user identified one instance at the red circle. Find all others."}

Find all instances of: "{takeoffDescription}"
Measurement type: {measurementType}

Return JSON:
{
  "found": true/false,
  "locations": [{"x": 0-100, "y": 0-100, "label": "optional description"}],
  "confidence": 0.0-1.0,
  "symbolDescription": "what the symbol looks like",
  "instanceCount": number,
  "notes": "any relevant observations"
}
```

## Appendix B: Legend Parser Prompt

```
SYSTEM:
You are analyzing a construction drawing legend/symbol schedule.
Extract every symbol-to-description mapping visible on this sheet.

USER:
[Legend sheet image]

Find all symbol legends, fixture schedules, or symbol keys on this sheet.
For each entry, provide:
1. A text description of the graphical symbol (shape, fill, lines)
2. The text label/description next to it
3. Any type code (A, B, C, etc.)
4. The category (lighting, power, plumbing, mechanical, fire, etc.)

Return JSON:
{
  "legends": [
    {
      "symbolDescription": "rectangle with X pattern inside",
      "label": "2x4 LED Recessed Troffer",
      "code": "A",
      "category": "lighting"
    }
  ],
  "confidence": 0.0-1.0
}
```

---

*Spec version: 1.0 — March 2026*
*Author: NOVA / Matt Nicosia*
