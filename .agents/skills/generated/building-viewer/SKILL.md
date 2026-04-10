---
name: building-viewer
description: "Skill for the Building-viewer area of BLDG Estimator. 18 symbols across 6 files."
---

# Building-viewer

18 symbols | 6 files | Cohesion: 100%

## When to Use

- Working with code in `app/`
- Understanding how generateBuildingCubes, computeMetrics, BuildingStructureViewer work
- Modifying building-viewer-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/building-viewer/CommandTable.jsx` | getStatus, WireframeBuilding, layoutBuildings, CommandTable, estimateToBuilding (+1) |
| `app/src/lib/building-generator.js` | uid, randomScatter, generateBuildingCubes, getCubeType, computeMetrics |
| `app/src/components/building-viewer/BuildingCubes.jsx` | easeOutQuart, easeOutCubic, BuildingCubes |
| `app/src/components/building-viewer/DimensionPanel.jsx` | DimensionPanel, update |
| `app/src/components/building-viewer/index.jsx` | BuildingStructureViewer |
| `app/src/components/building-viewer/BuildingScene.jsx` | SceneContent |

## Entry Points

Start here when exploring this area:

- **`generateBuildingCubes`** (Function) — `app/src/lib/building-generator.js:24`
- **`computeMetrics`** (Function) — `app/src/lib/building-generator.js:233`
- **`BuildingStructureViewer`** (Function) — `app/src/components/building-viewer/index.jsx:19`
- **`BuildingCubes`** (Function) — `app/src/components/building-viewer/BuildingCubes.jsx:22`
- **`DimensionPanel`** (Function) — `app/src/components/building-viewer/DimensionPanel.jsx:46`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `generateBuildingCubes` | Function | `app/src/lib/building-generator.js` | 24 |
| `computeMetrics` | Function | `app/src/lib/building-generator.js` | 233 |
| `BuildingStructureViewer` | Function | `app/src/components/building-viewer/index.jsx` | 19 |
| `BuildingCubes` | Function | `app/src/components/building-viewer/BuildingCubes.jsx` | 22 |
| `DimensionPanel` | Function | `app/src/components/building-viewer/DimensionPanel.jsx` | 46 |
| `update` | Function | `app/src/components/building-viewer/DimensionPanel.jsx` | 49 |
| `CommandTable` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 317 |
| `uid` | Function | `app/src/lib/building-generator.js` | 6 |
| `randomScatter` | Function | `app/src/lib/building-generator.js` | 8 |
| `getCubeType` | Function | `app/src/lib/building-generator.js` | 204 |
| `SceneContent` | Function | `app/src/components/building-viewer/BuildingScene.jsx` | 158 |
| `easeOutQuart` | Function | `app/src/components/building-viewer/BuildingCubes.jsx` | 13 |
| `easeOutCubic` | Function | `app/src/components/building-viewer/BuildingCubes.jsx` | 18 |
| `getStatus` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 21 |
| `WireframeBuilding` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 24 |
| `layoutBuildings` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 197 |
| `estimateToBuilding` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 212 |
| `Scene` | Function | `app/src/components/building-viewer/CommandTable.jsx` | 225 |

## How to Explore

1. `gitnexus_context({name: "generateBuildingCubes"})` — see callers and callees
2. `gitnexus_query({query: "building-viewer"})` — find related execution flows
3. Read key files listed above for implementation details
