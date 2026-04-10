---
name: proposal
description: "Skill for the Proposal area of BLDG Estimator. 19 symbols across 11 files."
---

# Proposal

19 symbols | 11 files | Cohesion: 69%

## When to Use

- Working with code in `app/`
- Understanding how handleAddendumImport, handleCreate, getDrawingBase64 work
- Modifying proposal-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/inbox/AttachmentPreview.jsx` | AttachmentPreview, fetchAndRender, renderPage |
| `app/src/components/proposal/ProposalBuilder.jsx` | ProposalBuilder, handleLayoutSwitch, handleSave |
| `app/src/components/proposal/CostTreemap.jsx` | generatePalette, adjustColor, CostTreemap |
| `app/src/components/proposal/ProposalDesignPanel.jsx` | getDrawingBase64, handleGenerateRendering |
| `app/src/components/proposal/CostSnapshot3D.jsx` | costColor, SimplifiedBuilding |
| `app/src/utils/cloudSync-blobs.js` | downloadBlobOnce |
| `app/src/stores/inboxStore.js` | getSession |
| `app/src/pages/InboxPage.jsx` | handleAddendumImport |
| `app/src/components/proposal/ProposalShareModal.jsx` | handleCreate |
| `app/src/hooks/useDragReorder.js` | useDragReorder |

## Entry Points

Start here when exploring this area:

- **`handleAddendumImport`** (Function) — `app/src/pages/InboxPage.jsx:661`
- **`handleCreate`** (Function) — `app/src/components/proposal/ProposalShareModal.jsx:38`
- **`getDrawingBase64`** (Function) — `app/src/components/proposal/ProposalDesignPanel.jsx:52`
- **`handleGenerateRendering`** (Function) — `app/src/components/proposal/ProposalDesignPanel.jsx:95`
- **`AttachmentPreview`** (Function) — `app/src/components/inbox/AttachmentPreview.jsx:8`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `handleAddendumImport` | Function | `app/src/pages/InboxPage.jsx` | 661 |
| `handleCreate` | Function | `app/src/components/proposal/ProposalShareModal.jsx` | 38 |
| `getDrawingBase64` | Function | `app/src/components/proposal/ProposalDesignPanel.jsx` | 52 |
| `handleGenerateRendering` | Function | `app/src/components/proposal/ProposalDesignPanel.jsx` | 95 |
| `AttachmentPreview` | Function | `app/src/components/inbox/AttachmentPreview.jsx` | 8 |
| `fetchAndRender` | Function | `app/src/components/inbox/AttachmentPreview.jsx` | 29 |
| `renderPage` | Function | `app/src/components/inbox/AttachmentPreview.jsx` | 74 |
| `useDragReorder` | Function | `app/src/hooks/useDragReorder.js` | 2 |
| `loadMonographFonts` | Function | `app/src/constants/proposalStyles.js` | 291 |
| `ProposalBuilder` | Function | `app/src/components/proposal/ProposalBuilder.jsx` | 12 |
| `handleLayoutSwitch` | Function | `app/src/components/proposal/ProposalBuilder.jsx` | 45 |
| `handleSave` | Function | `app/src/components/proposal/ProposalBuilder.jsx` | 68 |
| `CostTreemap` | Function | `app/src/components/proposal/CostTreemap.jsx` | 38 |
| `downloadBlobOnce` | Function | `app/src/utils/cloudSync-blobs.js` | 198 |
| `getSession` | Function | `app/src/stores/inboxStore.js` | 11 |
| `generatePalette` | Function | `app/src/components/proposal/CostTreemap.jsx` | 14 |
| `adjustColor` | Function | `app/src/components/proposal/CostTreemap.jsx` | 30 |
| `costColor` | Function | `app/src/components/proposal/CostSnapshot3D.jsx` | 14 |
| `SimplifiedBuilding` | Function | `app/src/components/proposal/CostSnapshot3D.jsx` | 73 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RomResult → GetSession` | cross_community | 7 |
| `HandleAddendumImport → GetItem` | cross_community | 6 |
| `DocumentsPage → GetSession` | cross_community | 6 |
| `CsvImportModal → GetSession` | cross_community | 5 |
| `PlanRoomPage → GetSession` | cross_community | 5 |
| `HandleAddendumImport → OpenDB` | cross_community | 5 |
| `HandleAddendumImport → RequestPersistentStorage` | cross_community | 5 |
| `TakeoffNOVAPanel → GetSession` | cross_community | 5 |
| `HandleNovaChat → GetSession` | cross_community | 5 |
| `BidPackagesPanel → GetSession` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 2 calls |
| Resources | 1 calls |
| Planroom | 1 calls |
| Hooks | 1 calls |
| Pages | 1 calls |
| Constants | 1 calls |

## How to Explore

1. `gitnexus_context({name: "handleAddendumImport"})` — see callers and callees
2. `gitnexus_query({query: "proposal"})` — find related execution flows
3. Read key files listed above for implementation details
