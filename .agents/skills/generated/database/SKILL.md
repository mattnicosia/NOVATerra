---
name: database
description: "Skill for the Database area of BLDG Estimator. 36 symbols across 12 files."
---

# Database

36 symbols | 12 files | Cohesion: 81%

## When to Use

- Working with code in `app/`
- Understanding how getTradeMultiplier, normalizePerSF, denormalizePerSF work
- Modifying database-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/utils/normalizationEngine.js` | resolveLaborKey, getTradeMultiplier, getLaborFactor, getCombinedLocationFactor, normalizePerSF (+2) |
| `app/src/utils/csvExport.js` | exportUserElementsCsv, parseImportCsv, parseCsvLine, mapColumns, findCol (+2) |
| `app/src/components/database/ItemsListPanel.jsx` | ItemsListPanel, editField, delta, dColor |
| `app/src/components/database/SubProposalModal.jsx` | SubProposalModal, updateExtractedItem, processFile |
| `app/src/components/shared/AIAssemblyGenerator.jsx` | AIAssemblyGenerator, generate, updateElement |
| `app/src/utils/xlsxParser.js` | parseXLSX, parseAllSheets, parseSheet |
| `app/src/utils/csvParser.js` | parseCSV, detectDelimiter |
| `app/src/utils/subdivisionAI.js` | parseSubdivisionResponse, generateSubdivisionBreakdown |
| `app/src/components/database/SubdivisionsTab.jsx` | handleGenerateDiv, handleGenerateAll |
| `app/src/constants/locationFactors.js` | resolveLocationFactors |

## Entry Points

Start here when exploring this area:

- **`getTradeMultiplier`** (Function) — `app/src/utils/normalizationEngine.js:78`
- **`normalizePerSF`** (Function) — `app/src/utils/normalizationEngine.js:118`
- **`denormalizePerSF`** (Function) — `app/src/utils/normalizationEngine.js:143`
- **`normalizeProposal`** (Function) — `app/src/utils/normalizationEngine.js:163`
- **`resolveLocationFactors`** (Function) — `app/src/constants/locationFactors.js:652`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getTradeMultiplier` | Function | `app/src/utils/normalizationEngine.js` | 78 |
| `normalizePerSF` | Function | `app/src/utils/normalizationEngine.js` | 118 |
| `denormalizePerSF` | Function | `app/src/utils/normalizationEngine.js` | 143 |
| `normalizeProposal` | Function | `app/src/utils/normalizationEngine.js` | 163 |
| `resolveLocationFactors` | Function | `app/src/constants/locationFactors.js` | 652 |
| `SubProposalModal` | Function | `app/src/components/database/SubProposalModal.jsx` | 21 |
| `updateExtractedItem` | Function | `app/src/components/database/SubProposalModal.jsx` | 264 |
| `exportUserElementsCsv` | Function | `app/src/utils/csvExport.js` | 14 |
| `AIAssemblyGenerator` | Function | `app/src/components/shared/AIAssemblyGenerator.jsx` | 43 |
| `generate` | Function | `app/src/components/shared/AIAssemblyGenerator.jsx` | 58 |
| `updateElement` | Function | `app/src/components/shared/AIAssemblyGenerator.jsx` | 130 |
| `ItemsListPanel` | Function | `app/src/components/database/ItemsListPanel.jsx` | 12 |
| `editField` | Function | `app/src/components/database/ItemsListPanel.jsx` | 432 |
| `delta` | Function | `app/src/components/database/ItemsListPanel.jsx` | 949 |
| `dColor` | Function | `app/src/components/database/ItemsListPanel.jsx` | 953 |
| `handleSend` | Function | `app/src/components/estimate/SendToDbModal.jsx` | 24 |
| `parseImportCsv` | Function | `app/src/utils/csvExport.js` | 55 |
| `handleFile` | Function | `app/src/components/database/CsvImportPreviewModal.jsx` | 20 |
| `parseXLSX` | Function | `app/src/utils/xlsxParser.js` | 11 |
| `parseAllSheets` | Function | `app/src/utils/xlsxParser.js` | 37 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RomResult → GetSession` | cross_community | 7 |
| `RomResult → ForceRefreshToken` | cross_community | 6 |
| `RomResult → _trackUsage` | cross_community | 6 |
| `ProposalsTab → ResolveLaborKey` | cross_community | 6 |
| `RomResult → ParseSubdivisionResponse` | cross_community | 5 |
| `ProposalsTab → ResolveLocationFactors` | cross_community | 5 |
| `ProcessFile → GetSession` | cross_community | 4 |
| `CsvImportModal → ParseSheet` | cross_community | 3 |
| `ProcessFile → ParseSheet` | intra_community | 3 |
| `ProcessFile → DetectDelimiter` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Sections | 2 calls |
| Widgets | 2 calls |
| Contacts | 1 calls |
| Constants | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getTradeMultiplier"})` — see callers and callees
2. `gitnexus_query({query: "database"})` — find related execution flows
3. Read key files listed above for implementation details
