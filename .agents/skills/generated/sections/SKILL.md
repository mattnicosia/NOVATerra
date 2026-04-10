---
name: sections
description: "Skill for the Sections area of BLDG Estimator. 21 symbols across 12 files."
---

# Sections

21 symbols | 12 files | Cohesion: 55%

## When to Use

- Working with code in `app/`
- Understanding how callAnthropic, runVE, CoverLetterSection work
- Modifying sections-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/proposal/sections/SiteContext.jsx` | getMapImageUrl, SiteContext, generateSiteNarrative |
| `app/src/components/proposal/sections/ProjectVision.jsx` | ProjectVision, buildPrompt, generateVision |
| `app/src/utils/ai-core.js` | _trackUsage, callAnthropic |
| `app/src/components/proposal/CoverLetterSection.jsx` | generateCoverLetter, CoverLetterSection |
| `app/src/components/estimate/AIScopeGenerateModal.jsx` | AIScopeGenerateModal, handleGenerate |
| `app/src/components/proposal/sections/DesignNarrative.jsx` | DesignNarrative, generateNarrative |
| `app/src/components/proposal/sections/CostVisualization3D.jsx` | costGradient, CostVisualization3D |
| `app/src/pages/AlternatesPage.jsx` | runVE |
| `app/src/components/estimate/ItemDetailPanel.jsx` | excludeItem |
| `app/src/components/estimate/CreateBidPackageModal.jsx` | handleLoadPreset |

## Entry Points

Start here when exploring this area:

- **`callAnthropic`** (Function) — `app/src/utils/ai-core.js:77`
- **`runVE`** (Function) — `app/src/pages/AlternatesPage.jsx:87`
- **`CoverLetterSection`** (Function) — `app/src/components/proposal/CoverLetterSection.jsx:27`
- **`excludeItem`** (Function) — `app/src/components/estimate/ItemDetailPanel.jsx:172`
- **`handleLoadPreset`** (Function) — `app/src/components/estimate/CreateBidPackageModal.jsx:50`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `callAnthropic` | Function | `app/src/utils/ai-core.js` | 77 |
| `runVE` | Function | `app/src/pages/AlternatesPage.jsx` | 87 |
| `CoverLetterSection` | Function | `app/src/components/proposal/CoverLetterSection.jsx` | 27 |
| `excludeItem` | Function | `app/src/components/estimate/ItemDetailPanel.jsx` | 172 |
| `handleLoadPreset` | Function | `app/src/components/estimate/CreateBidPackageModal.jsx` | 50 |
| `AIScopeGenerateModal` | Function | `app/src/components/estimate/AIScopeGenerateModal.jsx` | 15 |
| `handleGenerate` | Function | `app/src/components/estimate/AIScopeGenerateModal.jsx` | 47 |
| `SiteContext` | Function | `app/src/components/proposal/sections/SiteContext.jsx` | 13 |
| `generateSiteNarrative` | Function | `app/src/components/proposal/sections/SiteContext.jsx` | 42 |
| `generateNarrative` | Function | `app/src/components/proposal/sections/ScopeOfWork.jsx` | 38 |
| `ProjectVision` | Function | `app/src/components/proposal/sections/ProjectVision.jsx` | 5 |
| `buildPrompt` | Function | `app/src/components/proposal/sections/ProjectVision.jsx` | 20 |
| `generateVision` | Function | `app/src/components/proposal/sections/ProjectVision.jsx` | 56 |
| `generateCoverLetter` | Function | `app/src/components/proposal/sections/IntroParagraph.jsx` | 15 |
| `DesignNarrative` | Function | `app/src/components/proposal/sections/DesignNarrative.jsx` | 5 |
| `generateNarrative` | Function | `app/src/components/proposal/sections/DesignNarrative.jsx` | 43 |
| `CostVisualization3D` | Function | `app/src/components/proposal/sections/CostVisualization3D.jsx` | 17 |
| `_trackUsage` | Function | `app/src/utils/ai-core.js` | 59 |
| `generateCoverLetter` | Function | `app/src/components/proposal/CoverLetterSection.jsx` | 6 |
| `getMapImageUrl` | Function | `app/src/components/proposal/sections/SiteContext.jsx` | 6 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RomResult → GetSession` | cross_community | 7 |
| `RomResult → ForceRefreshToken` | cross_community | 6 |
| `RomResult → _trackUsage` | cross_community | 6 |
| `DocumentsPage → GetSession` | cross_community | 6 |
| `ModelTab → ForceRefreshToken` | cross_community | 5 |
| `ModelTab → _trackUsage` | cross_community | 5 |
| `CsvImportModal → GetSession` | cross_community | 5 |
| `PlanRoomPage → ForceRefreshToken` | cross_community | 5 |
| `PlanRoomPage → _trackUsage` | cross_community | 5 |
| `PlanRoomPage → GetSession` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Contacts | 2 calls |
| Widgets | 1 calls |

## How to Explore

1. `gitnexus_context({name: "callAnthropic"})` — see callers and callees
2. `gitnexus_query({query: "sections"})` — find related execution flows
3. Read key files listed above for implementation details
