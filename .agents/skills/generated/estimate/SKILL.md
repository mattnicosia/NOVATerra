---
name: estimate
description: "Skill for the Estimate area of BLDG Estimator. 91 symbols across 28 files."
---

# Estimate

91 symbols | 28 files | Cohesion: 71%

## When to Use

- Working with code in `app/`
- Understanding how generateScopeSheet, CreateBidPackageModal, handleCreate work
- Modifying estimate-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/estimate/SpatialTreemap.jsx` | squarify, worst, frame, drawGrid, drawBoundary (+10) |
| `app/src/components/estimate/ScenariosPanel.jsx` | buildTree, ScenariosPanel, handleAdd, menuItemStyle, formatCompact (+4) |
| `app/src/components/estimate/LevelingView.jsx` | CellContextMenu, BidCell, LevelingView, addSubBidSub, updateSubBidSubName (+3) |
| `app/src/components/estimate/AutoBidPackageReview.jsx` | handleSendAll, AutoBidPackageReview, updatePkg, toggleEnabled, toggleItem (+2) |
| `app/src/components/estimate/ComputationChain.jsx` | resolveColor, buildNarrative, DimensionCard, ComputationChain, computeResult (+1) |
| `app/src/utils/scopeGapEngine.js` | normalizeCSI, getDivisionName, findExclusionConflicts, analyzeGaps, getItemTotal |
| `app/src/hooks/useScenarioDrag.js` | useScenarioDrag, handleDropOnNode, isDescendant, handleDragStart, handleDragOverNode |
| `app/src/components/estimate/ItemDetailPanel.jsx` | getItemCO2e, computeDirective, ItemDetailPanel, costField |
| `app/src/components/estimate/EstimatePanelView.jsx` | getSourceLabel, getSourceCategory, SourcePill, EstimatePanelView |
| `app/src/utils/scopeSheetGenerator.js` | roundQty, formatRoundedQty, generateScopeSheet |

## Entry Points

Start here when exploring this area:

- **`generateScopeSheet`** (Function) — `app/src/utils/scopeSheetGenerator.js:27`
- **`CreateBidPackageModal`** (Function) — `app/src/components/estimate/CreateBidPackageModal.jsx:23`
- **`handleCreate`** (Function) — `app/src/components/estimate/CreateBidPackageModal.jsx:174`
- **`canNext`** (Function) — `app/src/components/estimate/CreateBidPackageModal.jsx:241`
- **`handleSendAll`** (Function) — `app/src/components/estimate/AutoBidPackageReview.jsx:102`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `generateScopeSheet` | Function | `app/src/utils/scopeSheetGenerator.js` | 27 |
| `CreateBidPackageModal` | Function | `app/src/components/estimate/CreateBidPackageModal.jsx` | 23 |
| `handleCreate` | Function | `app/src/components/estimate/CreateBidPackageModal.jsx` | 174 |
| `canNext` | Function | `app/src/components/estimate/CreateBidPackageModal.jsx` | 241 |
| `handleSendAll` | Function | `app/src/components/estimate/AutoBidPackageReview.jsx` | 102 |
| `normalizeCSI` | Function | `app/src/utils/scopeGapEngine.js` | 14 |
| `analyzeGaps` | Function | `app/src/utils/scopeGapEngine.js` | 143 |
| `ScopeGapReport` | Function | `app/src/components/estimate/ScopeGapReport.jsx` | 14 |
| `ProposalComparisonMatrix` | Function | `app/src/components/estimate/ProposalComparisonMatrix.jsx` | 16 |
| `AwardBidModal` | Function | `app/src/components/estimate/AwardBidModal.jsx` | 20 |
| `fireAutoResponse` | Function | `app/src/utils/autoResponseEngine.js` | 79 |
| `BidPackagesPage` | Function | `app/src/pages/BidPackagesPage.jsx` | 29 |
| `useAutoResponseTimers` | Function | `app/src/hooks/useAutoResponseTimers.js` | 10 |
| `checkDeadlines` | Function | `app/src/hooks/useAutoResponseTimers.js` | 14 |
| `BidPackagesPanel` | Function | `app/src/components/estimate/BidPackagesPanel.jsx` | 250 |
| `handleRemoveInvitation` | Function | `app/src/components/estimate/BidPackagesPanel.jsx` | 282 |
| `handleAward` | Function | `app/src/components/estimate/AwardBidModal.jsx` | 64 |
| `useScenarioDrag` | Function | `app/src/hooks/useScenarioDrag.js` | 4 |
| `handleDropOnNode` | Function | `app/src/hooks/useScenarioDrag.js` | 25 |
| `isDescendant` | Function | `app/src/hooks/useScenarioDrag.js` | 32 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `LevelingView → GetItem` | cross_community | 5 |
| `HandleNovaChat → GetSession` | cross_community | 5 |
| `BidPackagesPanel → GetSession` | cross_community | 5 |
| `BidPackagesPage → GetSession` | cross_community | 5 |
| `LevelingView → OpenDB` | cross_community | 4 |
| `LevelingView → RequestPersistentStorage` | cross_community | 4 |
| `BidPackagesPanel → GetItemTotal` | cross_community | 4 |
| `BidPackagesPanel → GetDivisionName` | cross_community | 4 |
| `BidPackagesPanel → ForceRefreshToken` | cross_community | 4 |
| `BidPackagesPanel → _trackUsage` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 17 calls |
| Contacts | 3 calls |
| Hooks | 3 calls |
| Sections | 2 calls |
| Rom | 1 calls |
| Proposal | 1 calls |
| Takeoffs | 1 calls |
| Pages | 1 calls |

## How to Explore

1. `gitnexus_context({name: "generateScopeSheet"})` — see callers and callees
2. `gitnexus_query({query: "estimate"})` — find related execution flows
3. Read key files listed above for implementation details
