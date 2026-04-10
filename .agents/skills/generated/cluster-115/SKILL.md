---
name: cluster-115
description: "Skill for the Cluster_115 area of BLDG Estimator. 14 symbols across 1 files."
---

# Cluster_115

14 symbols | 1 files | Cohesion: 75%

## When to Use

- Working with code in `app/`
- Understanding how getDrawingMode, detectRoomsFloodFill, detectWalls work
- Modifying cluster_115-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/utils/geometryEngine.js` | getDrawingMode, detectRoomsFloodFill, dist, lineAngle, normalizeAngle (+9) |

## Entry Points

Start here when exploring this area:

- **`getDrawingMode`** (Function) — `app/src/utils/geometryEngine.js:21`
- **`detectRoomsFloodFill`** (Function) — `app/src/utils/geometryEngine.js:95`
- **`detectWalls`** (Function) — `app/src/utils/geometryEngine.js:309`
- **`findWallChains`** (Function) — `app/src/utils/geometryEngine.js:436`
- **`detectOpenings`** (Function) — `app/src/utils/geometryEngine.js:643`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getDrawingMode` | Function | `app/src/utils/geometryEngine.js` | 21 |
| `detectRoomsFloodFill` | Function | `app/src/utils/geometryEngine.js` | 95 |
| `detectWalls` | Function | `app/src/utils/geometryEngine.js` | 309 |
| `findWallChains` | Function | `app/src/utils/geometryEngine.js` | 436 |
| `detectOpenings` | Function | `app/src/utils/geometryEngine.js` | 643 |
| `associateTagsWithWalls` | Function | `app/src/utils/geometryEngine.js` | 705 |
| `associateTagsWithRooms` | Function | `app/src/utils/geometryEngine.js` | 740 |
| `analyzeDrawingGeometry` | Function | `app/src/utils/geometryEngine.js` | 783 |
| `dist` | Function | `app/src/utils/geometryEngine.js` | 257 |
| `lineAngle` | Function | `app/src/utils/geometryEngine.js` | 261 |
| `normalizeAngle` | Function | `app/src/utils/geometryEngine.js` | 265 |
| `anglesParallel` | Function | `app/src/utils/geometryEngine.js` | 272 |
| `perpDistToLine` | Function | `app/src/utils/geometryEngine.js` | 279 |
| `lineMidpoint` | Function | `app/src/utils/geometryEngine.js` | 290 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunParameterDetection → OpenDB` | cross_community | 6 |
| `RunParameterDetection → RequestPersistentStorage` | cross_community | 6 |
| `RunParameterDetection → MultiplyMatrix` | cross_community | 6 |
| `RunParameterDetection → ApplyMatrix` | cross_community | 6 |
| `WarmPredictions → OpenDB` | cross_community | 5 |
| `WarmPredictions → RequestPersistentStorage` | cross_community | 5 |
| `WarmPredictions → MultiplyMatrix` | cross_community | 5 |
| `UseTakeoffActions → DetectScheduleRegions` | cross_community | 5 |
| `RunParameterDetection → DetectScheduleRegions` | cross_community | 5 |
| `UseTakeoffActions → GetDrawingMode` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Resources | 2 calls |
| Cluster_116 | 2 calls |
| Cluster_74 | 1 calls |
| Hooks | 1 calls |
| Planroom | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getDrawingMode"})` — see callers and callees
2. `gitnexus_query({query: "cluster_115"})` — find related execution flows
3. Read key files listed above for implementation details
