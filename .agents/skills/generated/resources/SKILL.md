---
name: resources
description: "Skill for the Resources area of BLDG Estimator. 112 symbols across 47 files."
---

# Resources

112 symbols | 47 files | Cohesion: 60%

## When to Use

- Working with code in `app/`
- Understanding how utilizationColor, detectSpacesForLevel, loadAudioBlob work
- Modifying resources-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/resources/ResourceFieldRenderer.js` | hitTestPos, hitTestUnassignedPos, drawNode, drawNodeLabel, drawUnassignedRing (+9) |
| `app/src/utils/pascalAlgorithms.js` | detectSpacesForLevel, buildGrid, markWallCells, floodFillFromEdges, findInteriorSpaces (+2) |
| `app/src/pages/ResourcePage.jsx` | utilizationColor, toDateStr, addDays, hexAlpha, ByHoursView (+2) |
| `app/src/utils/fieldPhysics.js` | weekdayRange, polarToXY, hitTestNodes, hexToRgb, hexAlpha (+1) |
| `app/src/components/resources/ProjectQuickActions.jsx` | save, handlePctChange, handleHoursChange, handleClearHours, handleClearPct (+1) |
| `app/src/components/resources/BoardView.jsx` | BoardView, onDragOver, onDropHandler, ProjectCard, saveHours |
| `app/src/components/resources/BarContextMenu.jsx` | doPushNextWeek, BarContextMenu, doAdjustHours, doAddCorrespondence, doAddPause |
| `app/src/components/resources/EstimatorHeatmap.jsx` | buildWeekdays, fmtDate, getMonday, EstimatorHeatmap, cellColor |
| `app/src/components/resources/WeeklyPlanView.jsx` | toDateStr, getWeekDays, WeekLabel, WeeklyPlanView |
| `app/src/components/resources/AtAGlance.jsx` | utilizationColor, hexAlpha, AtAGlance |

## Entry Points

Start here when exploring this area:

- **`utilizationColor`** (Function) — `app/src/utils/resourceColors.js:22`
- **`detectSpacesForLevel`** (Function) — `app/src/utils/pascalAlgorithms.js:26`
- **`loadAudioBlob`** (Function) — `app/src/utils/novaAudioStorage.js:33`
- **`uploadBlob`** (Function) — `app/src/utils/cloudSync-blobs.js:107`
- **`handleNewCreated`** (Function) — `app/src/pages/ProjectsPage.jsx:604`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `utilizationColor` | Function | `app/src/utils/resourceColors.js` | 22 |
| `detectSpacesForLevel` | Function | `app/src/utils/pascalAlgorithms.js` | 26 |
| `loadAudioBlob` | Function | `app/src/utils/novaAudioStorage.js` | 33 |
| `uploadBlob` | Function | `app/src/utils/cloudSync-blobs.js` | 107 |
| `handleNewCreated` | Function | `app/src/pages/ProjectsPage.jsx` | 604 |
| `InboxPage` | Function | `app/src/pages/InboxPage.jsx` | 46 |
| `handleVisibility` | Function | `app/src/hooks/useRealtimeSync.js` | 129 |
| `loadEstimate` | Function | `app/src/hooks/persistenceEstimate.js` | 33 |
| `loadPdfBase64` | Function | `app/src/hooks/persistenceCleanup.js` | 156 |
| `resolveTemplateItems` | Function | `app/src/constants/seedTemplates.js` | 18 |
| `SpatialShell` | Function | `app/src/pages/spatial/SpatialShell.jsx` | 259 |
| `spawnWorker` | Function | `app/src/components/settings/HistoricalProposalsPanel.jsx` | 213 |
| `handleReviewQueueItem` | Function | `app/src/components/settings/HistoricalProposalsPanel.jsx` | 326 |
| `handleUseTheirs` | Function | `app/src/components/shared/ConflictMergeModal.jsx` | 39 |
| `handleNewCreated` | Function | `app/src/components/shared/CommandPalette.jsx` | 190 |
| `hitTestPos` | Function | `app/src/components/resources/ResourceFieldRenderer.js` | 491 |
| `hitTestUnassignedPos` | Function | `app/src/components/resources/ResourceFieldRenderer.js` | 517 |
| `ResourceField` | Function | `app/src/components/resources/ResourceField.jsx` | 18 |
| `ByHoursView` | Function | `app/src/components/resources/ByHoursView.jsx` | 5 |
| `BoardView` | Function | `app/src/components/resources/BoardView.jsx` | 8 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ModulePanel → OpenDB` | cross_community | 7 |
| `ModulePanel → RequestPersistentStorage` | cross_community | 7 |
| `CarbonBenchmarkWidget → GetItem` | cross_community | 7 |
| `ProjectsWidget → GetItem` | cross_community | 7 |
| `BenchmarksWidget → GetItem` | cross_community | 7 |
| `InstanceSpecsForm → GetItem` | cross_community | 7 |
| `CarbonBenchmarkWidget → OpenDB` | cross_community | 6 |
| `CarbonBenchmarkWidget → RequestPersistentStorage` | cross_community | 6 |
| `NovaDashboardPage → GetItem` | cross_community | 6 |
| `HistoricalProposalsPanel → OpenDB` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 22 calls |
| Widgets | 10 calls |
| Pages | 4 calls |
| Settings | 2 calls |
| Cluster_54 | 1 calls |
| Stores | 1 calls |
| Constants | 1 calls |

## How to Explore

1. `gitnexus_context({name: "utilizationColor"})` — see callers and callees
2. `gitnexus_query({query: "resources"})` — find related execution flows
3. Read key files listed above for implementation details
