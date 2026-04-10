---
name: widgets
description: "Skill for the Widgets area of BLDG Estimator. 220 symbols across 140 files."
---

# Widgets

220 symbols | 140 files | Cohesion: 64%

## When to Use

- Working with code in `app/`
- Understanding how generateTaktData, getScaleLabel, ScheduleOfValuesPage work
- Modifying widgets-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/widgets/ProjectsWidget.jsx` | ProjectMenu, ConfirmDelete, formatValue, ProjectsWidget, handleContextMenu (+1) |
| `app/src/App.jsx` | FloatingThemePicker, cycle, SyncStatusBar, getRelativeTime, MobileGuard |
| `app/src/pages/RomPage.jsx` | AuthGate, DrawingUploadPath, BasicInfoPath, RomPageInner, setMeta |
| `app/src/components/intelligence/PureCSSChart.jsx` | BarChart, Spark, RangeBar, Ring, GradientBar |
| `app/src/components/estimate/SubResponseBoard.jsx` | SubCard, timeSince, SubResponseBoard, KPICard, fmtCurrency |
| `app/src/components/estimate/ProposalDetailModal.jsx` | ProposalDetailModal, Section, BulletItem, DetailCell |
| `app/src/components/widgets/CarbonBenchmarkWidget.jsx` | resolveType, scoreColor, scoreLabel, CarbonBenchmarkWidget |
| `app/src/pages/ReviewPage.jsx` | CostSummaryCard, StatusBadge, ReviewCard |
| `app/src/pages/InsightsPage.jsx` | InsightsPage, CompareTab, DeltaPanel |
| `app/src/components/widgets/WidgetGrid.jsx` | injectOverrides, WidgetGrid, posKey |

## Entry Points

Start here when exploring this area:

- **`generateTaktData`** (Function) — `app/src/utils/scheduleEngine.js:236`
- **`getScaleLabel`** (Function) — `app/src/utils/drawingUtils.js:102`
- **`ScheduleOfValuesPage`** (Function) — `app/src/pages/ScheduleOfValuesPage.jsx:23`
- **`getGroupSource`** (Function) — `app/src/pages/ScheduleOfValuesPage.jsx:210`
- **`InsightsPage`** (Function) — `app/src/pages/InsightsPage.jsx:31`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `generateTaktData` | Function | `app/src/utils/scheduleEngine.js` | 236 |
| `getScaleLabel` | Function | `app/src/utils/drawingUtils.js` | 102 |
| `ScheduleOfValuesPage` | Function | `app/src/pages/ScheduleOfValuesPage.jsx` | 23 |
| `getGroupSource` | Function | `app/src/pages/ScheduleOfValuesPage.jsx` | 210 |
| `InsightsPage` | Function | `app/src/pages/InsightsPage.jsx` | 31 |
| `BusinessDashboardPage` | Function | `app/src/pages/BusinessDashboardPage.jsx` | 17 |
| `AlternatesPage` | Function | `app/src/pages/AlternatesPage.jsx` | 13 |
| `useTheme` | Function | `app/src/hooks/useTheme.jsx` | 1776 |
| `useBusinessMetrics` | Function | `app/src/hooks/useBusinessMetrics.js` | 14 |
| `getAvailablePresets` | Function | `app/src/constants/widgetRegistry.js` | 282 |
| `getCurrentPreset` | Function | `app/src/constants/widgetRegistry.js` | 299 |
| `AdminNovaPage` | Function | `app/src/pages/admin/AdminNovaPage.jsx` | 545 |
| `AdminLayout` | Function | `app/src/pages/admin/AdminLayout.jsx` | 16 |
| `AdminAIConfigPage` | Function | `app/src/pages/admin/AdminAIConfigPage.jsx` | 9 |
| `WidgetWrapper` | Function | `app/src/components/widgets/WidgetWrapper.jsx` | 110 |
| `WidgetReplacePicker` | Function | `app/src/components/widgets/WidgetReplacePicker.jsx` | 10 |
| `handleSelect` | Function | `app/src/components/widgets/WidgetReplacePicker.jsx` | 49 |
| `WidgetPickerModal` | Function | `app/src/components/widgets/WidgetPickerModal.jsx` | 9 |
| `handleAdd` | Function | `app/src/components/widgets/WidgetPickerModal.jsx` | 53 |
| `WidgetGrid` | Function | `app/src/components/widgets/WidgetGrid.jsx` | 139 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CarbonBenchmarkWidget → GetItem` | cross_community | 7 |
| `ProjectsWidget → GetItem` | cross_community | 7 |
| `BenchmarksWidget → GetItem` | cross_community | 7 |
| `CarbonBenchmarkWidget → OpenDB` | cross_community | 6 |
| `CarbonBenchmarkWidget → RequestPersistentStorage` | cross_community | 6 |
| `ProjectsWidget → OpenDB` | cross_community | 6 |
| `ProjectsWidget → RequestPersistentStorage` | cross_community | 6 |
| `BenchmarksWidget → OpenDB` | cross_community | 6 |
| `BenchmarksWidget → RequestPersistentStorage` | cross_community | 6 |
| `CarbonBenchmarkWidget → _uid` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Resources | 2 calls |
| Pages | 1 calls |
| Estimate | 1 calls |

## How to Explore

1. `gitnexus_context({name: "generateTaktData"})` — see callers and callees
2. `gitnexus_query({query: "widgets"})` — find related execution flows
3. Read key files listed above for implementation details
