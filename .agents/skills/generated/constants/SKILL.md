---
name: constants
description: "Skill for the Constants area of BLDG Estimator. 45 symbols across 18 files."
---

# Constants

45 symbols | 18 files | Cohesion: 77%

## When to Use

- Working with code in `app/`
- Understanding how getBuildingParamMultipliers, generateBaselineROM, getMarketMultiplier work
- Modifying constants-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/constants/tradeGroupings.js` | getActiveBundles, getActiveMap, getTradeLabel, getTradeSortOrder, getTradeKeyFromLabel (+2) |
| `app/src/constants/markupTaxonomy.js` | classifyMarkup, groupMarkupsByCategory, getComparableMarkups, detectMarginGrouping, isInsuranceAssumedInOP (+1) |
| `app/src/constants/proposalSections.js` | isPageBreak, isSpacer, isUploadedDoc, isSpecialSection, getSpecialSectionMeta |
| `app/src/constants/constructionCostIndex.js` | getCompositeIndex, getDivisionIndex, getAllDivisionIndices, getAvailableYears, getYoYChange |
| `app/src/utils/costEscalation.js` | escalateCost, escalateDivisionCost, escalateDivisions |
| `app/src/utils/moduleCalc.js` | computeFramingContext, buildCalcContext, computeSteelContext |
| `app/src/utils/romEngine.js` | getBuildingParamMultipliers, generateBaselineROM |
| `app/src/constants/constructionTypes.js` | getMarketMultiplier, detectMarketRegion |
| `app/src/components/onboarding/OnboardingSequence.jsx` | OnboardingSequence, fmtCost |
| `app/src/constants/palettes.js` | findDarkestSurface, buildDarkPanel |

## Entry Points

Start here when exploring this area:

- **`getBuildingParamMultipliers`** (Function) — `app/src/utils/romEngine.js:295`
- **`generateBaselineROM`** (Function) — `app/src/utils/romEngine.js:381`
- **`getMarketMultiplier`** (Function) — `app/src/constants/constructionTypes.js:72`
- **`detectMarketRegion`** (Function) — `app/src/constants/constructionTypes.js:101`
- **`OnboardingSequence`** (Function) — `app/src/components/onboarding/OnboardingSequence.jsx:93`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getBuildingParamMultipliers` | Function | `app/src/utils/romEngine.js` | 295 |
| `generateBaselineROM` | Function | `app/src/utils/romEngine.js` | 381 |
| `getMarketMultiplier` | Function | `app/src/constants/constructionTypes.js` | 72 |
| `detectMarketRegion` | Function | `app/src/constants/constructionTypes.js` | 101 |
| `OnboardingSequence` | Function | `app/src/components/onboarding/OnboardingSequence.jsx` | 93 |
| `fmtCost` | Function | `app/src/components/onboarding/OnboardingSequence.jsx` | 193 |
| `getTradeLabel` | Function | `app/src/constants/tradeGroupings.js` | 47 |
| `getTradeSortOrder` | Function | `app/src/constants/tradeGroupings.js` | 57 |
| `getTradeKeyFromLabel` | Function | `app/src/constants/tradeGroupings.js` | 67 |
| `autoTradeFromCode` | Function | `app/src/constants/tradeGroupings.js` | 74 |
| `fuzzyMatchTrade` | Function | `app/src/constants/tradeGroupings.js` | 230 |
| `isPageBreak` | Function | `app/src/constants/proposalSections.js` | 50 |
| `isSpacer` | Function | `app/src/constants/proposalSections.js` | 51 |
| `isUploadedDoc` | Function | `app/src/constants/proposalSections.js` | 52 |
| `isSpecialSection` | Function | `app/src/constants/proposalSections.js` | 53 |
| `getSpecialSectionMeta` | Function | `app/src/constants/proposalSections.js` | 55 |
| `ProposalSection` | Function | `app/src/components/proposal/ProposalSection.jsx` | 49 |
| `getMeta` | Function | `app/src/components/proposal/ProposalBuilder.jsx` | 60 |
| `escalateCost` | Function | `app/src/utils/costEscalation.js` | 36 |
| `escalateDivisionCost` | Function | `app/src/utils/costEscalation.js` | 48 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CostHistoryAnalytics → GetCompositeIndex` | cross_community | 6 |
| `ModulePanel → UnitToTool` | cross_community | 5 |
| `ModulePanel → ParseRebarSpec` | cross_community | 5 |
| `HistoricalProposalsPanel → ForceRefreshToken` | cross_community | 5 |
| `HistoricalProposalsPanel → _trackUsage` | cross_community | 5 |
| `ModulePanel → ComputeSteelContext` | cross_community | 4 |
| `HandleSaveEntry → GetCompositeIndex` | cross_community | 4 |
| `HistoricalProposalsPanel → PdfBlock` | cross_community | 4 |
| `HistoricalProposalsPanel → ClassifyMarkup` | cross_community | 4 |
| `ProposalBuilder → IsPageBreak` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 2 calls |
| Takeoffs | 1 calls |
| Sections | 1 calls |
| Settings | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getBuildingParamMultipliers"})` — see callers and callees
2. `gitnexus_query({query: "constants"})` — find related execution flows
3. Read key files listed above for implementation details
