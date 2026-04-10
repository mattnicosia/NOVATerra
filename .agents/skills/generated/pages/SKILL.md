---
name: pages
description: "Skill for the Pages area of BLDG Estimator. 134 symbols across 52 files."
---

# Pages

134 symbols | 52 files | Cohesion: 73%

## When to Use

- Working with code in `app/`
- Understanding how isHigherRevision, detectRevisions, analyzeRevisionImpact work
- Modifying pages-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/pages/ContactsPage.jsx` | ContactsPage, getAllItems, checkDuplicate, handleFieldUpdate, CompanyGroup (+5) |
| `app/src/pages/ProjectInfoPage.jsx` | calcCompletion, ProjectInfoPage, isInContacts, handleSaveToContacts, autoTag (+5) |
| `app/src/utils/uploadPipeline.js` | isHigherRevision, detectRevisions, analyzeRevisionImpact, autoLabelDrawings, autoDetectOutlines (+4) |
| `app/src/utils/bidPackageAutoGenerator.js` | groupItemsByTrade, mergeSmallTrades, getSheetPrefix, matchDrawingsToTrades, matchSubsToTrades (+4) |
| `app/src/pages/SettingsPage.jsx` | SettingsPage, handleLogoUpload, CompanyProfilesSection, updateField, handleProfileLogoUpload (+2) |
| `app/src/pages/ReportsPage.jsx` | buildPDF, handleDownloadPDF, handlePreviewPDF, ReportsPage, getTotal (+1) |
| `app/src/pages/CostDatabasePage.jsx` | CostDatabasePage, initCustomBundles, updateBundle, addBundle, removeBundle |
| `app/src/utils/contactDedup.js` | levenshtein, normalizeCompany, findDuplicateContact, mergeContact, processContact |
| `app/src/pages/ProjectsPage.jsx` | getStatusColors, isDueThisWeek, KanbanCard, ProjectsPage, handleDuplicate |
| `app/src/pages/ProposalViewerPage.jsx` | trackEvent, ProposalViewerPage, handleScroll, handleAccept |

## Entry Points

Start here when exploring this area:

- **`isHigherRevision`** (Function) — `app/src/utils/uploadPipeline.js:374`
- **`detectRevisions`** (Function) — `app/src/utils/uploadPipeline.js:389`
- **`analyzeRevisionImpact`** (Function) — `app/src/utils/uploadPipeline.js:439`
- **`autoLabelDrawings`** (Function) — `app/src/utils/uploadPipeline.js:489`
- **`autoDetectOutlines`** (Function) — `app/src/utils/uploadPipeline.js:831`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `isHigherRevision` | Function | `app/src/utils/uploadPipeline.js` | 374 |
| `detectRevisions` | Function | `app/src/utils/uploadPipeline.js` | 389 |
| `analyzeRevisionImpact` | Function | `app/src/utils/uploadPipeline.js` | 439 |
| `autoLabelDrawings` | Function | `app/src/utils/uploadPipeline.js` | 489 |
| `autoDetectOutlines` | Function | `app/src/utils/uploadPipeline.js` | 831 |
| `processSpecBook` | Function | `app/src/utils/uploadPipeline.js` | 923 |
| `aiClassifyDocument` | Function | `app/src/utils/uploadPipeline.js` | 974 |
| `extractBidInfoFromDocument` | Function | `app/src/utils/uploadPipeline.js` | 1020 |
| `handleFileUpload` | Function | `app/src/utils/uploadPipeline.js` | 1250 |
| `computePolygonArea` | Function | `app/src/utils/outlineDetector.js` | 221 |
| `matchScaleKey` | Function | `app/src/utils/drawingUtils.js` | 82 |
| `classifyFile` | Function | `app/src/utils/drawingUtils.js` | 148 |
| `isDuplicateFile` | Function | `app/src/utils/drawingUtils.js` | 255 |
| `rescanDrawings` | Function | `app/src/utils/discoveryScan.js` | 6 |
| `PlanRoomPage` | Function | `app/src/pages/PlanRoomPage.jsx` | 34 |
| `DocumentsPage` | Function | `app/src/pages/DocumentsPage.jsx` | 326 |
| `DiscoveryPanel` | Function | `app/src/components/discovery/DiscoveryPanel.jsx` | 32 |
| `stripAndUploadBlobs` | Function | `app/src/utils/cloudSync-blobs.js` | 263 |
| `SettingsPage` | Function | `app/src/pages/SettingsPage.jsx` | 24 |
| `CostDatabasePage` | Function | `app/src/pages/CostDatabasePage.jsx` | 24 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProposalTable → GetItem` | cross_community | 7 |
| `CarbonBenchmarkWidget → GetItem` | cross_community | 7 |
| `ProjectsWidget → GetItem` | cross_community | 7 |
| `BenchmarksWidget → GetItem` | cross_community | 7 |
| `InstanceSpecsForm → GetItem` | cross_community | 7 |
| `DashboardCalendar → GetItem` | cross_community | 6 |
| `NovaDashboardPage → GetItem` | cross_community | 6 |
| `HistoricalProposalsPanel → GetItem` | cross_community | 6 |
| `HandlePdfFilesSelected → GetItem` | cross_community | 6 |
| `HandleAddendumImport → GetItem` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 18 calls |
| Hooks | 9 calls |
| Sections | 6 calls |
| Resources | 5 calls |
| Database | 4 calls |
| Planroom | 3 calls |
| Stores | 3 calls |
| Agents | 2 calls |

## How to Explore

1. `gitnexus_context({name: "isHigherRevision"})` — see callers and callees
2. `gitnexus_query({query: "pages"})` — find related execution flows
3. Read key files listed above for implementation details
