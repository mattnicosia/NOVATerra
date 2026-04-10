---
name: rom
description: "Skill for the Rom area of BLDG Estimator. 38 symbols across 15 files."
---

# Rom

38 symbols | 15 files | Cohesion: 86%

## When to Use

- Working with code in `app/`
- Understanding how fmt, fmtSF, fmtNum work
- Modifying rom-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/rom/RomResult.jsx` | RomResult, getDivisionMultiplier, updateSoftCost, commitSoftCostEdit, adjustDivision (+5) |
| `app/src/components/rom/RomChat.jsx` | buildContext, parseResponse, applyActions, RomChat, handleSend (+1) |
| `app/src/components/rom/NOVAThinking.jsx` | getStepsForBasics, getStepsForWizard, getStepsForDrawings, NOVAThinking, useTypingAnimation (+1) |
| `app/src/components/rom/romFormatters.jsx` | fmt, fmtSF, fmtNum, ConfidenceDot |
| `app/src/constants/scopeTemplates.js` | estimatePerimeter, generateScopeTemplate |
| `app/src/components/rom/RomSoftCosts.jsx` | RomSoftCosts |
| `app/src/components/rom/RomProjectSummary.jsx` | RomProjectSummary |
| `app/src/components/rom/RomDivisionTable.jsx` | RomDivisionTable |
| `app/src/utils/autoResponseEngine.js` | generateAlternatives |
| `app/src/utils/ai-core.js` | callAnthropicStreamPublic |

## Entry Points

Start here when exploring this area:

- **`fmt`** (Function) — `app/src/components/rom/romFormatters.jsx:49`
- **`fmtSF`** (Function) — `app/src/components/rom/romFormatters.jsx:54`
- **`fmtNum`** (Function) — `app/src/components/rom/romFormatters.jsx:59`
- **`RomSoftCosts`** (Function) — `app/src/components/rom/RomSoftCosts.jsx:5`
- **`RomResult`** (Function) — `app/src/components/rom/RomResult.jsx:17`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `fmt` | Function | `app/src/components/rom/romFormatters.jsx` | 49 |
| `fmtSF` | Function | `app/src/components/rom/romFormatters.jsx` | 54 |
| `fmtNum` | Function | `app/src/components/rom/romFormatters.jsx` | 59 |
| `RomSoftCosts` | Function | `app/src/components/rom/RomSoftCosts.jsx` | 5 |
| `RomResult` | Function | `app/src/components/rom/RomResult.jsx` | 17 |
| `getDivisionMultiplier` | Function | `app/src/components/rom/RomResult.jsx` | 108 |
| `updateSoftCost` | Function | `app/src/components/rom/RomResult.jsx` | 177 |
| `commitSoftCostEdit` | Function | `app/src/components/rom/RomResult.jsx` | 188 |
| `adjustDivision` | Function | `app/src/components/rom/RomResult.jsx` | 203 |
| `resetDivisionAdjustment` | Function | `app/src/components/rom/RomResult.jsx` | 213 |
| `generateNarrative` | Function | `app/src/components/rom/RomResult.jsx` | 223 |
| `RomProjectSummary` | Function | `app/src/components/rom/RomProjectSummary.jsx` | 5 |
| `RomDivisionTable` | Function | `app/src/components/rom/RomDivisionTable.jsx` | 5 |
| `generateAlternatives` | Function | `app/src/utils/autoResponseEngine.js` | 185 |
| `callAnthropicStreamPublic` | Function | `app/src/utils/ai-core.js` | 305 |
| `handleSuggestAlts` | Function | `app/src/components/shared/DraftApprovalPanel.jsx` | 87 |
| `RomChat` | Function | `app/src/components/rom/RomChat.jsx` | 171 |
| `handleSend` | Function | `app/src/components/rom/RomChat.jsx` | 199 |
| `relTime` | Function | `app/src/components/rom/RomChat.jsx` | 343 |
| `generateScopeTemplate` | Function | `app/src/constants/scopeTemplates.js` | 466 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RomResult → GetSession` | cross_community | 7 |
| `RomResult → ForceRefreshToken` | cross_community | 6 |
| `RomResult → _trackUsage` | cross_community | 6 |
| `RomResult → GetItem` | cross_community | 5 |
| `RomResult → ParseSubdivisionResponse` | cross_community | 5 |
| `RomResult → ComputeEffectiveWeights` | cross_community | 5 |
| `RomResult → OpenDB` | cross_community | 4 |
| `RomResult → RequestPersistentStorage` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 3 calls |
| Planroom | 2 calls |
| Sections | 1 calls |
| Cluster_44 | 1 calls |
| Cluster_51 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "fmt"})` — see callers and callees
2. `gitnexus_query({query: "rom"})` — find related execution flows
3. Read key files listed above for implementation details
