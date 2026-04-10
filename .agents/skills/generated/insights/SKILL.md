---
name: insights
description: "Skill for the Insights area of BLDG Estimator. 57 symbols across 13 files."
---

# Insights

57 symbols | 13 files | Cohesion: 75%

## When to Use

- Working with code in `app/`
- Understanding how ensureDrawingImage, generateElementsFromTakeoffs, generateRoomElements work
- Modifying insights-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/insights/BlueprintTab.jsx` | getFloorColor, _convexHull, cross, _expandPolygon, _isFloorPlanDrawing (+7) |
| `app/src/components/insights/SceneViewer.jsx` | WallElement, SlabElement, BoxElement, IFCMeshElement, getElementVisuals (+2) |
| `app/src/utils/geometryBuilder.js` | getSpecValue, _roomsToFeetSpace, _findContainingRoom, generateElementsFromTakeoffs, generateRoomElements (+1) |
| `app/src/utils/modelExport.js` | buildExportScene, elementToMesh, getMaterialProps, exportToGLB, exportToGLTF (+1) |
| `app/src/utils/coverageGrid.js` | pointInPolygon, pointNearSegment, buildCoverageGrid, testCoverage, computeCoverageStats |
| `app/src/utils/scheduleEngine.js` | generateActivities, buildDependencies, topoSort, computeCPM, generateSchedule |
| `app/src/utils/materialEngine.js` | getMaterial, searchMaterials, getCategories, getMaterialsForElement, computeSwapImpact |
| `app/src/components/insights/ModelTab.jsx` | _cross, _convexHull, _expandPolygon, ModelTab |
| `app/src/utils/outlineDetector.js` | loadPdfJs, ensureDrawingImage |
| `app/src/components/insights/ArchitectSketch.jsx` | WallLine, makeLine |

## Entry Points

Start here when exploring this area:

- **`ensureDrawingImage`** (Function) — `app/src/utils/outlineDetector.js:38`
- **`generateElementsFromTakeoffs`** (Function) — `app/src/utils/geometryBuilder.js:141`
- **`generateRoomElements`** (Function) — `app/src/utils/geometryBuilder.js:407`
- **`pointInPolygon`** (Function) — `app/src/utils/coverageGrid.js:12`
- **`buildCoverageGrid`** (Function) — `app/src/utils/coverageGrid.js:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ensureDrawingImage` | Function | `app/src/utils/outlineDetector.js` | 38 |
| `generateElementsFromTakeoffs` | Function | `app/src/utils/geometryBuilder.js` | 141 |
| `generateRoomElements` | Function | `app/src/utils/geometryBuilder.js` | 407 |
| `pointInPolygon` | Function | `app/src/utils/coverageGrid.js` | 12 |
| `buildCoverageGrid` | Function | `app/src/utils/coverageGrid.js` | 49 |
| `testCoverage` | Function | `app/src/utils/coverageGrid.js` | 97 |
| `computeCoverageStats` | Function | `app/src/utils/coverageGrid.js` | 159 |
| `ModelTab` | Function | `app/src/components/insights/ModelTab.jsx` | 61 |
| `BlueprintTab` | Function | `app/src/components/insights/BlueprintTab.jsx` | 424 |
| `getExplodedElev` | Function | `app/src/components/insights/BlueprintTab.jsx` | 702 |
| `generateActivities` | Function | `app/src/utils/scheduleEngine.js` | 9 |
| `buildDependencies` | Function | `app/src/utils/scheduleEngine.js` | 79 |
| `computeCPM` | Function | `app/src/utils/scheduleEngine.js` | 167 |
| `generateSchedule` | Function | `app/src/utils/scheduleEngine.js` | 282 |
| `getTradeColor` | Function | `app/src/utils/geometryBuilder.js` | 88 |
| `ScheduleTab` | Function | `app/src/components/insights/ScheduleTab.jsx` | 17 |
| `buildExportScene` | Function | `app/src/utils/modelExport.js` | 14 |
| `exportToGLB` | Function | `app/src/utils/modelExport.js` | 152 |
| `exportToGLTF` | Function | `app/src/utils/modelExport.js` | 183 |
| `exportModelFromStore` | Function | `app/src/utils/modelExport.js` | 211 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ModelSidebar → GetMaterial` | cross_community | 7 |
| `ModelTab → GetSheetPrefix` | cross_community | 5 |
| `ModelTab → ForceRefreshToken` | cross_community | 5 |
| `ModelTab → _trackUsage` | cross_community | 5 |
| `ModelTab → ScaleCodeToPxPerFoot` | cross_community | 5 |
| `ModelSidebar → GetItem` | cross_community | 5 |
| `BlueprintTab → ScaleCodeToPxPerFoot` | cross_community | 4 |
| `ModelTab → GroupItemsByTrade` | cross_community | 4 |
| `ModelTab → MergeSmallTrades` | cross_community | 4 |
| `ModelTab → MatchSubsToTrades` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 5 calls |
| Widgets | 5 calls |
| Spatial | 3 calls |
| Cluster_78 | 2 calls |
| Cluster_95 | 2 calls |
| Cluster_96 | 2 calls |
| Estimate | 1 calls |
| Cluster_113 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "ensureDrawingImage"})` — see callers and callees
2. `gitnexus_query({query: "insights"})` — find related execution flows
3. Read key files listed above for implementation details
