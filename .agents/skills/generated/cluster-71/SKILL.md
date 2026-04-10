---
name: cluster-71
description: "Skill for the Cluster_71 area of BLDG Estimator. 23 symbols across 4 files."
---

# Cluster_71

23 symbols | 4 files | Cohesion: 70%

## When to Use

- Working with code in `app/`
- Understanding how getLearningMultiplier, getWarmData, scoreTagRelevance work
- Modifying cluster_71-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/utils/predictiveEngine.js` | getLearningMultiplier, getWarmData, scoreTagRelevance, detectDifferentiator, findNearbyLines (+6) |
| `app/src/utils/pdfExtractor.js` | registerExternalScheduleRegions, getScheduleRegions, mergeScheduleRegions, isLikelyTag, findNearestTag (+4) |
| `app/src/utils/extractionAdapter.js` | getOrDetectScheduleRegions, getTagInstancesOnPlan |
| `app/src/utils/geometryEngine.js` | generateAutoMeasurements |

## Entry Points

Start here when exploring this area:

- **`getLearningMultiplier`** (Function) — `app/src/utils/predictiveEngine.js:296`
- **`getWarmData`** (Function) — `app/src/utils/predictiveEngine.js:376`
- **`scoreTagRelevance`** (Function) — `app/src/utils/predictiveEngine.js:668`
- **`detectDifferentiator`** (Function) — `app/src/utils/predictiveEngine.js:732`
- **`predictCounts`** (Function) — `app/src/utils/predictiveEngine.js:965`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getLearningMultiplier` | Function | `app/src/utils/predictiveEngine.js` | 296 |
| `getWarmData` | Function | `app/src/utils/predictiveEngine.js` | 376 |
| `scoreTagRelevance` | Function | `app/src/utils/predictiveEngine.js` | 668 |
| `detectDifferentiator` | Function | `app/src/utils/predictiveEngine.js` | 732 |
| `predictCounts` | Function | `app/src/utils/predictiveEngine.js` | 965 |
| `predictWalls` | Function | `app/src/utils/predictiveEngine.js` | 1001 |
| `predictAreas` | Function | `app/src/utils/predictiveEngine.js` | 1072 |
| `runSmartPredictions` | Function | `app/src/utils/predictiveEngine.js` | 1120 |
| `registerExternalScheduleRegions` | Function | `app/src/utils/pdfExtractor.js` | 29 |
| `getScheduleRegions` | Function | `app/src/utils/pdfExtractor.js` | 42 |
| `isLikelyTag` | Function | `app/src/utils/pdfExtractor.js` | 391 |
| `findNearestTag` | Function | `app/src/utils/pdfExtractor.js` | 423 |
| `findAdjacentText` | Function | `app/src/utils/pdfExtractor.js` | 445 |
| `findAllTagInstances` | Function | `app/src/utils/pdfExtractor.js` | 468 |
| `detectScheduleRegions` | Function | `app/src/utils/pdfExtractor.js` | 493 |
| `findPlanTagInstances` | Function | `app/src/utils/pdfExtractor.js` | 688 |
| `generateAutoMeasurements` | Function | `app/src/utils/geometryEngine.js` | 883 |
| `getOrDetectScheduleRegions` | Function | `app/src/utils/extractionAdapter.js` | 50 |
| `getTagInstancesOnPlan` | Function | `app/src/utils/extractionAdapter.js` | 73 |
| `findNearbyLines` | Function | `app/src/utils/predictiveEngine.js` | 852 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UseTakeoffEffects → OpenDB` | cross_community | 6 |
| `UseTakeoffEffects → RequestPersistentStorage` | cross_community | 6 |
| `TakeoffNOVAPanel → FindAllTagInstances` | cross_community | 5 |
| `TakeoffNOVAPanel → DetectScheduleRegions` | cross_community | 5 |
| `UseTakeoffActions → DetectScheduleRegions` | cross_community | 5 |
| `UseTakeoffEffects → MultiplyMatrix` | cross_community | 5 |
| `UseTakeoffEffects → ApplyMatrix` | cross_community | 5 |
| `UseTakeoffEffects → InferDiscipline` | cross_community | 5 |
| `UseTakeoffEffects → GetLegendContext` | cross_community | 5 |
| `UseTakeoffEffects → ForceRefreshToken` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Resources | 6 calls |
| Cluster_72 | 4 calls |
| Hooks | 2 calls |
| Cluster_74 | 1 calls |
| Cluster_34 | 1 calls |
| Cluster_115 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getLearningMultiplier"})` — see callers and callees
2. `gitnexus_query({query: "cluster_71"})` — find related execution flows
3. Read key files listed above for implementation details
