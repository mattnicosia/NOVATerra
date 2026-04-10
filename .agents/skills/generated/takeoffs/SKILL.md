---
name: takeoffs
description: "Skill for the Takeoffs area of BLDG Estimator. 56 symbols across 19 files."
---

# Takeoffs

56 symbols | 19 files | Cohesion: 71%

## When to Use

- Working with code in `app/`
- Understanding how evalModuleFormula, evalCondition, computeAllDerived work
- Modifying takeoffs-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/utils/moduleCalc.js` | getCachedRegex, evalModuleFormula, evalCondition, applyRounding, computeAllDerived (+3) |
| `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | TakeoffNOVAPanel, acceptProposalItem, rejectProposalItem, acceptAllInProposal, _executeOneProposal (+2) |
| `app/src/components/takeoffs/ModulePanel.jsx` | ModulePanel, resolveDesc, syncItem, renderResultRow, renderSpecs (+1) |
| `app/src/components/takeoffs/TakeoffCommandPalette.jsx` | fuzzy, getRecent, addRecent, TakeoffCommandPalette, ov |
| `app/src/components/takeoffs/TakeoffDimensionEngine.jsx` | resolveColor, getRelevantPresets, getRelevantScenarios, TakeoffDimensionEngine, updateVariable |
| `app/src/utils/novaTools.js` | previewNovaTool, clampCost, clampQty, executeNovaTool |
| `app/src/components/shared/CommandPalette.jsx` | fuzzy, getStatusColors, CommandPalette |
| `app/src/utils/takeoffHelpers.js` | _novaCacheEvict, buildNovaUserMsg, parseNovaResponse |
| `app/src/components/takeoffs/ModuleSpecsForm.jsx` | InstanceSpecsForm, applyTemplate |
| `app/src/utils/measurementCalc.js` | unitToTool, getMeasuredQtyCtx |

## Entry Points

Start here when exploring this area:

- **`evalModuleFormula`** (Function) — `app/src/utils/moduleCalc.js:413`
- **`evalCondition`** (Function) — `app/src/utils/moduleCalc.js:432`
- **`computeAllDerived`** (Function) — `app/src/utils/moduleCalc.js:457`
- **`computeAllDerivedWithInstances`** (Function) — `app/src/utils/moduleCalc.js:515`
- **`InstanceSpecsForm`** (Function) — `app/src/components/takeoffs/ModuleSpecsForm.jsx:90`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `evalModuleFormula` | Function | `app/src/utils/moduleCalc.js` | 413 |
| `evalCondition` | Function | `app/src/utils/moduleCalc.js` | 432 |
| `computeAllDerived` | Function | `app/src/utils/moduleCalc.js` | 457 |
| `computeAllDerivedWithInstances` | Function | `app/src/utils/moduleCalc.js` | 515 |
| `InstanceSpecsForm` | Function | `app/src/components/takeoffs/ModuleSpecsForm.jsx` | 90 |
| `applyTemplate` | Function | `app/src/components/takeoffs/ModuleSpecsForm.jsx` | 113 |
| `FloatingSpecsCard` | Function | `app/src/components/takeoffs/FloatingSpecsCard.jsx` | 6 |
| `TakeoffCommandPalette` | Function | `app/src/components/takeoffs/TakeoffCommandPalette.jsx` | 26 |
| `ov` | Function | `app/src/components/takeoffs/TakeoffCommandPalette.jsx` | 35 |
| `CommandPalette` | Function | `app/src/components/shared/CommandPalette.jsx` | 47 |
| `scanAllSheets` | Function | `app/src/utils/predictiveEngine.js` | 1634 |
| `TakeoffNOVAPanel` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 22 |
| `acceptProposalItem` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 173 |
| `rejectProposalItem` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 190 |
| `acceptAllInProposal` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 203 |
| `_executeOneProposal` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 233 |
| `previewNovaTool` | Function | `app/src/utils/novaTools.js` | 189 |
| `executeNovaTool` | Function | `app/src/utils/novaTools.js` | 284 |
| `_collectProposals` | Function | `app/src/components/takeoffs/TakeoffNOVAPanel.jsx` | 287 |
| `getDrivingQty` | Function | `app/src/utils/moduleCalc.js` | 487 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `UseTakeoffSync → ScaleCodeToPxPerUnit` | cross_community | 8 |
| `UseTakeoffSync → GetDrawingDpiFromCtx` | cross_community | 8 |
| `ModulePanel → OpenDB` | cross_community | 7 |
| `ModulePanel → RequestPersistentStorage` | cross_community | 7 |
| `InstanceSpecsForm → GetItem` | cross_community | 7 |
| `ComputeAllDerived → OpenDB` | cross_community | 6 |
| `ComputeAllDerived → RequestPersistentStorage` | cross_community | 6 |
| `InstanceSpecsForm → OpenDB` | cross_community | 6 |
| `InstanceSpecsForm → RequestPersistentStorage` | cross_community | 6 |
| `ModulePanel → GetItem` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 11 calls |
| Planroom | 3 calls |
| Hooks | 3 calls |
| Resources | 2 calls |
| Constants | 2 calls |
| Cluster_74 | 1 calls |
| Cluster_71 | 1 calls |
| Stores | 1 calls |

## How to Explore

1. `gitnexus_context({name: "evalModuleFormula"})` — see callers and callees
2. `gitnexus_query({query: "takeoffs"})` — find related execution flows
3. Read key files listed above for implementation details
