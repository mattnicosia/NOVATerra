---
name: hooks
description: "Skill for the Hooks area of BLDG Estimator. 235 symbols across 83 files."
---

# Hooks

235 symbols | 83 files | Cohesion: 67%

## When to Use

- Working with code in `app/`
- Understanding how calculateLevelMiters, idbKey, saveAtomically work
- Modifying hooks-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/hooks/useCloudSync.js` | readDeletedIds, syncEstimates, syncSettings, syncAssemblies, syncUserElements (+9) |
| `app/src/utils/scheduleParser.js` | groupIntoRows, detectColumns, assignToColumns, detectScheduleType, parseWallScheduleRow (+6) |
| `app/src/hooks/persistenceGlobal.js` | saveMasterData, saveSettings, saveAssemblies, saveUserLibrary, saveCalendar (+5) |
| `app/src/hooks/useWorkloadData.js` | isWeekday, countWeekdays, subtractWeekdays, addWeekdays, weekdaysBetween (+5) |
| `app/src/hooks/persistenceCleanup.js` | saveUploadQueue, savePdfBase64, deletePdfBase64, deletePdfBase64Batch, resetAllStores (+3) |
| `app/src/hooks/useTimerSync.js` | cleanup, useTimerSync, handleMessage, handleVisibility, handleUnload (+2) |
| `app/src/hooks/useGuidedWizard.js` | useGuidedWizard, finalize, handleSelect, handleInputSubmit, initYesNo (+2) |
| `app/src/hooks/useBidIntelligence.js` | useBidIntelligence, computeClientHistory, computeArchitectHistory, computeJobTypeStats, computeRomPreview (+2) |
| `app/src/hooks/useLevelingBids.js` | getCell, getCellComputedValue, getSkSubTotal, setBidSelection, getSelectedBidValue (+1) |
| `app/src/hooks/useActivityTracker.js` | useActivityTracker, handleBeforeUnload, appendSessionToEstimate, appendSessionToEstimateSync, peekPendingSessions (+1) |

## Entry Points

Start here when exploring this area:

- **`calculateLevelMiters`** (Function) — `app/src/utils/pascalAlgorithms.js:398`
- **`idbKey`** (Function) — `app/src/utils/idbKey.js:11`
- **`saveAtomically`** (Function) — `app/src/utils/cloudSyncProfiles.js:123`
- **`pullAndApplyEstimate`** (Function) — `app/src/utils/cloudSync.js:76`
- **`pullAndApplyData`** (Function) — `app/src/utils/cloudSync.js:109`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `calculateLevelMiters` | Function | `app/src/utils/pascalAlgorithms.js` | 398 |
| `idbKey` | Function | `app/src/utils/idbKey.js` | 11 |
| `saveAtomically` | Function | `app/src/utils/cloudSyncProfiles.js` | 123 |
| `pullAndApplyEstimate` | Function | `app/src/utils/cloudSync.js` | 76 |
| `pullAndApplyData` | Function | `app/src/utils/cloudSync.js` | 109 |
| `logAICall` | Function | `app/src/stores/novaStore.js` | 489 |
| `recordOutcome` | Function | `app/src/stores/novaStore.js` | 521 |
| `handleSave` | Function | `app/src/pages/SettingsPage.jsx` | 97 |
| `useAutoSave` | Function | `app/src/hooks/useAutoSave.js` | 48 |
| `recoverFromCloud` | Function | `app/src/hooks/persistenceRecovery.js` | 20 |
| `saveMasterData` | Function | `app/src/hooks/persistenceGlobal.js` | 19 |
| `saveSettings` | Function | `app/src/hooks/persistenceGlobal.js` | 49 |
| `saveAssemblies` | Function | `app/src/hooks/persistenceGlobal.js` | 64 |
| `saveUserLibrary` | Function | `app/src/hooks/persistenceGlobal.js` | 77 |
| `saveCalendar` | Function | `app/src/hooks/persistenceGlobal.js` | 90 |
| `saveTasks` | Function | `app/src/hooks/persistenceGlobal.js` | 103 |
| `saveBidPackagePresets` | Function | `app/src/hooks/persistenceGlobal.js` | 116 |
| `saveSubdivisionConfig` | Function | `app/src/hooks/persistenceGlobal.js` | 125 |
| `saveAutoResponseConfig` | Function | `app/src/hooks/persistenceGlobal.js` | 136 |
| `saveAutoResponseDrafts` | Function | `app/src/hooks/persistenceGlobal.js` | 145 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UseTakeoffSync → ScaleCodeToPxPerUnit` | cross_community | 8 |
| `UseTakeoffSync → GetDrawingDpiFromCtx` | cross_community | 8 |
| `ProposalTable → GetItem` | cross_community | 7 |
| `ExtractSchedules → OpenDB` | cross_community | 7 |
| `ExtractSchedules → RequestPersistentStorage` | cross_community | 7 |
| `DashboardCalendar → GetItem` | cross_community | 6 |
| `ProposalTable → OpenDB` | cross_community | 6 |
| `ProposalTable → RequestPersistentStorage` | cross_community | 6 |
| `NovaDashboardPage → GetItem` | cross_community | 6 |
| `HistoricalProposalsPanel → GetItem` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Resources | 34 calls |
| Pages | 19 calls |
| Widgets | 14 calls |
| Planroom | 10 calls |
| Cluster_71 | 6 calls |
| Sections | 6 calls |
| Takeoffs | 4 calls |
| Stores | 4 calls |

## How to Explore

1. `gitnexus_context({name: "calculateLevelMiters"})` — see callers and callees
2. `gitnexus_query({query: "hooks"})` — find related execution flows
3. Read key files listed above for implementation details
