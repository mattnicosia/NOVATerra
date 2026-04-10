---
name: planroom
description: "Skill for the Planroom area of BLDG Estimator. 66 symbols across 30 files."
---

# Planroom

66 symbols | 30 files | Cohesion: 70%

## When to Use

- Working with code in `app/`
- Understanding how App, captureFromLoadedImage, clearCrossSheetData work
- Modifying planroom-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/planroom/DocumentsPanel.jsx` | fmtBytes, fmtDate, detectChangeType, DocumentsPanel, toggleSelect (+10) |
| `app/src/components/planroom/ScanResultsModal.jsx` | toggleItem, toggleNote, toggleGroup, toggleSection, renderNote (+5) |
| `app/src/components/planroom/BuildingSketch.jsx` | iso, toPath, signedArea, BuildingSketch |
| `app/src/utils/scanVerifier.js` | normDiv, verifyScheduleParse, verifyROM |
| `app/src/utils/scanRunner.js` | extractJSON, runFullScan, checkAbort |
| `app/src/components/resources/AutoScheduleModal.jsx` | toggle, toggleMulti |
| `app/src/utils/titleBlockExtractor.js` | mapBuildingTypeKey, inferWorkType |
| `app/src/utils/ai-scan.js` | batchAI, worker |
| `app/src/components/inbox/RfpDetailModal.jsx` | isPreviewable, RfpDetailModal |
| `app/src/components/planroom/ProjectSummaryCard.jsx` | buildProjectNarrative, ProjectSummaryCard |

## Entry Points

Start here when exploring this area:

- **`App`** (Function) — `app/src/App.jsx:1248`
- **`captureFromLoadedImage`** (Function) — `app/src/utils/firstClickTeacher.js:119`
- **`clearCrossSheetData`** (Function) — `app/src/utils/crossSheetLearning.js:153`
- **`withRetry`** (Function) — `app/src/utils/cloudSync-retry.js:24`
- **`clearProductCache`** (Function) — `app/src/services/productDataService.js:122`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `App` | Function | `app/src/App.jsx` | 1248 |
| `captureFromLoadedImage` | Function | `app/src/utils/firstClickTeacher.js` | 119 |
| `clearCrossSheetData` | Function | `app/src/utils/crossSheetLearning.js` | 153 |
| `withRetry` | Function | `app/src/utils/cloudSync-retry.js` | 24 |
| `clearProductCache` | Function | `app/src/services/productDataService.js` | 122 |
| `toggle` | Function | `app/src/components/takeoffs/AutoTakeoffModal.jsx` | 36 |
| `toggle` | Function | `app/src/components/resources/AutoScheduleModal.jsx` | 86 |
| `toggleMulti` | Function | `app/src/components/resources/AutoScheduleModal.jsx` | 124 |
| `toggleItem` | Function | `app/src/components/planroom/ScanResultsModal.jsx` | 76 |
| `toggleNote` | Function | `app/src/components/planroom/ScanResultsModal.jsx` | 320 |
| `toggleGroup` | Function | `app/src/components/planroom/ScanResultsModal.jsx` | 329 |
| `toggleSection` | Function | `app/src/components/planroom/ScanResultsModal.jsx` | 1287 |
| `toggleDiv` | Function | `app/src/components/database/SubdivisionsTab.jsx` | 43 |
| `toggleItem` | Function | `app/src/components/database/SubProposalModal.jsx` | 248 |
| `toggleSuggestion` | Function | `app/src/components/estimate/ScenariosPanel.jsx` | 316 |
| `toggleDiv` | Function | `app/src/components/estimate/DatabasePickerModal.jsx` | 33 |
| `toggleItem` | Function | `app/src/components/estimate/AIScopeGenerateModal.jsx` | 98 |
| `toggleRow` | Function | `app/src/components/contacts/SubImportModal.jsx` | 321 |
| `mapBuildingTypeKey` | Function | `app/src/utils/titleBlockExtractor.js` | 242 |
| `inferWorkType` | Function | `app/src/utils/titleBlockExtractor.js` | 276 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProposalUploadQueue → OpenDB` | cross_community | 6 |
| `ProposalUploadQueue → RequestPersistentStorage` | cross_community | 6 |
| `ModulePanel → GetItem` | cross_community | 5 |
| `RomResult → GetItem` | cross_community | 5 |
| `ProposalUploadQueue → GetItem` | cross_community | 5 |
| `App → GetItem` | cross_community | 5 |
| `HandleImportConfirm → Worker` | cross_community | 4 |
| `HandleAddendumImport → Worker` | cross_community | 4 |
| `RomResult → OpenDB` | cross_community | 4 |
| `RomResult → RequestPersistentStorage` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Pages | 6 calls |
| Resources | 5 calls |
| Hooks | 5 calls |
| Agents | 3 calls |
| Cluster_148 | 2 calls |
| Sections | 2 calls |
| Stores | 2 calls |
| Cluster_59 | 2 calls |

## How to Explore

1. `gitnexus_context({name: "App"})` — see callers and callees
2. `gitnexus_query({query: "planroom"})` — find related execution flows
3. Read key files listed above for implementation details
