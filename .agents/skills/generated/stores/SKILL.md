---
name: stores
description: "Skill for the Stores area of BLDG Estimator. 38 symbols across 12 files."
---

# Stores

38 symbols | 12 files | Cohesion: 69%

## When to Use

- Working with code in `app/`
- Understanding how pushData, pullData, pullDataWithOrgId work
- Modifying stores-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/utils/cloudSync-pull.js` | pullData, pullDataWithOrgId, pullAllEstimatesWithOrgId, pullDataAnyScope, pullAllEstimatesAnyScope (+6) |
| `app/src/stores/moduleStore.js` | _uid, getDefaultCatSpecs, getDefaultSpecs, getDefaultExpanded, getDefaultCategoryInstances (+2) |
| `app/src/utils/romEngine.js` | isNone, generateScheduleLineItems, findSeedByVector, findSeedByKeywords |
| `app/src/stores/authStore.js` | getDeviceInfo, writeSessionToken, adoptSessionToken |
| `app/src/components/layout/NovaHeader.jsx` | CompanyDropdown, select, renderItem |
| `app/src/stores/novaStore.js` | searchSimilarCorrections, getEvaluationSummary, _getLocalEvalSummary |
| `app/src/components/widgets/NovaInsightsWidget.jsx` | NovaInsightsWidget, metricRow |
| `app/src/utils/cloudSync-push.js` | pushData |
| `app/src/stores/orgStore.js` | attemptFetch |
| `app/src/components/estimate/AIPricingModal.jsx` | AIPricingModal |

## Entry Points

Start here when exploring this area:

- **`pushData`** (Function) — `app/src/utils/cloudSync-push.js:16`
- **`pullData`** (Function) — `app/src/utils/cloudSync-pull.js:14`
- **`pullDataWithOrgId`** (Function) — `app/src/utils/cloudSync-pull.js:86`
- **`pullAllEstimatesWithOrgId`** (Function) — `app/src/utils/cloudSync-pull.js:104`
- **`pullDataAnyScope`** (Function) — `app/src/utils/cloudSync-pull.js:127`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `pushData` | Function | `app/src/utils/cloudSync-push.js` | 16 |
| `pullData` | Function | `app/src/utils/cloudSync-pull.js` | 14 |
| `pullDataWithOrgId` | Function | `app/src/utils/cloudSync-pull.js` | 86 |
| `pullAllEstimatesWithOrgId` | Function | `app/src/utils/cloudSync-pull.js` | 104 |
| `pullDataAnyScope` | Function | `app/src/utils/cloudSync-pull.js` | 127 |
| `pullAllEstimatesAnyScope` | Function | `app/src/utils/cloudSync-pull.js` | 175 |
| `pullDataWithMeta` | Function | `app/src/utils/cloudSync-pull.js` | 195 |
| `pullSoloFallback` | Function | `app/src/utils/cloudSync-pull.js` | 256 |
| `pullAllEstimatesWithMeta` | Function | `app/src/utils/cloudSync-pull.js` | 279 |
| `pullAllEstimatesSoloFallback` | Function | `app/src/utils/cloudSync-pull.js` | 308 |
| `pullAllEstimates` | Function | `app/src/utils/cloudSync-pull.js` | 391 |
| `pullEstimatesIndex` | Function | `app/src/utils/cloudSync-pull.js` | 418 |
| `attemptFetch` | Function | `app/src/stores/orgStore.js` | 63 |
| `AIPricingModal` | Function | `app/src/components/estimate/AIPricingModal.jsx` | 15 |
| `searchSimilar` | Function | `app/src/utils/vectorSearch.js` | 32 |
| `generateScheduleLineItems` | Function | `app/src/utils/romEngine.js` | 721 |
| `searchSimilarCorrections` | Function | `app/src/stores/novaStore.js` | 656 |
| `AssemblySearch` | Function | `app/src/components/shared/AssemblySearch.jsx` | 10 |
| `migrateModuleInstances` | Function | `app/src/stores/moduleStore.js` | 323 |
| `getEvaluationSummary` | Function | `app/src/stores/novaStore.js` | 538 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CarbonBenchmarkWidget → _uid` | cross_community | 5 |
| `ProjectsWidget → _uid` | cross_community | 5 |
| `HandleNovaChat → GetSession` | cross_community | 5 |
| `BenchmarksWidget → _uid` | cross_community | 5 |
| `HandleImportConfirm → _uid` | cross_community | 4 |
| `NovaDashboardPage → _uid` | cross_community | 4 |
| `HandleAddendumImport → _uid` | cross_community | 4 |
| `AdminInvitesPage → Select` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 4 calls |
| Widgets | 4 calls |
| Resources | 3 calls |
| Pages | 2 calls |
| Proposal | 1 calls |
| Sections | 1 calls |

## How to Explore

1. `gitnexus_context({name: "pushData"})` — see callers and callees
2. `gitnexus_query({query: "stores"})` — find related execution flows
3. Read key files listed above for implementation details
