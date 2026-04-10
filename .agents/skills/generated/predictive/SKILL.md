---
name: predictive
description: "Skill for the Predictive area of BLDG Estimator. 17 symbols across 6 files."
---

# Predictive

17 symbols | 6 files | Cohesion: 85%

## When to Use

- Working with code in `app/`
- Understanding how buildNotesContext, groupNotesByTrade, generateTakeoffSuggestions work
- Modifying predictive-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/nova/predictive/generateSuggestions.js` | generateTakeoffSuggestions, buildScheduleDescription, parseQuantity, buildCode, scheduleConfidence (+4) |
| `app/src/nova/predictive/revisionAnnotator.js` | resizeCanvas, canvasToBase64, annotateRevisionDelta |
| `app/src/utils/notesExtractor.js` | buildNotesContext, groupNotesByTrade |
| `app/src/components/takeoffs/AutoTakeoffModal.jsx` | AutoTakeoffModal |
| `app/src/components/planroom/ScanResultsModal.jsx` | ScanResultsModal |
| `app/src/components/planroom/DrawingOverlay.jsx` | DrawingOverlay |

## Entry Points

Start here when exploring this area:

- **`buildNotesContext`** (Function) — `app/src/utils/notesExtractor.js:142`
- **`groupNotesByTrade`** (Function) — `app/src/utils/notesExtractor.js:245`
- **`generateTakeoffSuggestions`** (Function) — `app/src/nova/predictive/generateSuggestions.js:74`
- **`AutoTakeoffModal`** (Function) — `app/src/components/takeoffs/AutoTakeoffModal.jsx:14`
- **`ScanResultsModal`** (Function) — `app/src/components/planroom/ScanResultsModal.jsx:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `buildNotesContext` | Function | `app/src/utils/notesExtractor.js` | 142 |
| `groupNotesByTrade` | Function | `app/src/utils/notesExtractor.js` | 245 |
| `generateTakeoffSuggestions` | Function | `app/src/nova/predictive/generateSuggestions.js` | 74 |
| `AutoTakeoffModal` | Function | `app/src/components/takeoffs/AutoTakeoffModal.jsx` | 14 |
| `ScanResultsModal` | Function | `app/src/components/planroom/ScanResultsModal.jsx` | 22 |
| `annotateRevisionDelta` | Function | `app/src/nova/predictive/revisionAnnotator.js` | 39 |
| `DrawingOverlay` | Function | `app/src/components/planroom/DrawingOverlay.jsx` | 32 |
| `buildScheduleDescription` | Function | `app/src/nova/predictive/generateSuggestions.js` | 177 |
| `parseQuantity` | Function | `app/src/nova/predictive/generateSuggestions.js` | 242 |
| `buildCode` | Function | `app/src/nova/predictive/generateSuggestions.js` | 250 |
| `scheduleConfidence` | Function | `app/src/nova/predictive/generateSuggestions.js` | 271 |
| `buildScheduleReasoning` | Function | `app/src/nova/predictive/generateSuggestions.js` | 280 |
| `estimateCostFromRom` | Function | `app/src/nova/predictive/generateSuggestions.js` | 314 |
| `generateFromNotes` | Function | `app/src/nova/predictive/generateSuggestions.js` | 332 |
| `generateRomGapFill` | Function | `app/src/nova/predictive/generateSuggestions.js` | 388 |
| `resizeCanvas` | Function | `app/src/nova/predictive/revisionAnnotator.js` | 12 |
| `canvasToBase64` | Function | `app/src/nova/predictive/revisionAnnotator.js` | 26 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 3 calls |
| Sections | 1 calls |

## How to Explore

1. `gitnexus_context({name: "buildNotesContext"})` — see callers and callees
2. `gitnexus_query({query: "predictive"})` — find related execution flows
3. Read key files listed above for implementation details
