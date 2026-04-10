---
name: settings
description: "Skill for the Settings area of BLDG Estimator. 37 symbols across 10 files."
---

# Settings

37 symbols | 10 files | Cohesion: 73%

## When to Use

- Working with code in `app/`
- Understanding how computeEstimatorExperience, computeMatchScore, computeAllExperiences work
- Modifying settings-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/components/settings/EstimatorSettingsPanel.jsx` | ExperiencePills, getInitials, EstimatorSettingsPanel, resetForm, handleSave (+8) |
| `app/src/components/settings/HistoricalProposalsPanel.jsx` | HistoricalProposalsPanel, generateLearningFromProposal, handleRecalibrate, handleDelete, handleOutcomeChange |
| `app/src/utils/estimatorExperience.js` | computeEstimatorExperience, computeMatchScore, computeAllExperiences, fmtSF |
| `app/src/utils/costHistoryMigration.js` | migrateJobType, mapStatusToOutcome, migrateIndexEntry, migrateProposal |
| `app/src/utils/costEscalation.js` | extractYear, getEscalationFactor, normalizeEntry, formatEscalation |
| `app/src/utils/autoScheduler.js` | isWeekday, subtractWeekdays, autoSchedule |
| `app/src/components/shared/EstimatorScorecard.jsx` | EstimatorScorecard |
| `app/src/components/resources/AutoScheduleModal.jsx` | AutoScheduleModal |
| `app/src/components/costHistory/ProposalTable.jsx` | ProposalTable |
| `app/src/hooks/useEstimatorStats.js` | useAllEstimatorStats |

## Entry Points

Start here when exploring this area:

- **`computeEstimatorExperience`** (Function) — `app/src/utils/estimatorExperience.js:14`
- **`computeMatchScore`** (Function) — `app/src/utils/estimatorExperience.js:123`
- **`computeAllExperiences`** (Function) — `app/src/utils/estimatorExperience.js:242`
- **`autoSchedule`** (Function) — `app/src/utils/autoScheduler.js:40`
- **`EstimatorScorecard`** (Function) — `app/src/components/shared/EstimatorScorecard.jsx:21`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `computeEstimatorExperience` | Function | `app/src/utils/estimatorExperience.js` | 14 |
| `computeMatchScore` | Function | `app/src/utils/estimatorExperience.js` | 123 |
| `computeAllExperiences` | Function | `app/src/utils/estimatorExperience.js` | 242 |
| `autoSchedule` | Function | `app/src/utils/autoScheduler.js` | 40 |
| `EstimatorScorecard` | Function | `app/src/components/shared/EstimatorScorecard.jsx` | 21 |
| `AutoScheduleModal` | Function | `app/src/components/resources/AutoScheduleModal.jsx` | 15 |
| `EstimatorSettingsPanel` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 439 |
| `resetForm` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 498 |
| `handleSave` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 508 |
| `handleRemove` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 566 |
| `handleInvite` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 596 |
| `handleResendInvite` | Function | `app/src/components/settings/EstimatorSettingsPanel.jsx` | 615 |
| `migrateJobType` | Function | `app/src/utils/costHistoryMigration.js` | 9 |
| `mapStatusToOutcome` | Function | `app/src/utils/costHistoryMigration.js` | 62 |
| `migrateIndexEntry` | Function | `app/src/utils/costHistoryMigration.js` | 79 |
| `migrateProposal` | Function | `app/src/utils/costHistoryMigration.js` | 102 |
| `HistoricalProposalsPanel` | Function | `app/src/components/settings/HistoricalProposalsPanel.jsx` | 73 |
| `extractYear` | Function | `app/src/utils/costEscalation.js` | 13 |
| `getEscalationFactor` | Function | `app/src/utils/costEscalation.js` | 74 |
| `normalizeEntry` | Function | `app/src/utils/costEscalation.js` | 85 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProposalTable → GetItem` | cross_community | 7 |
| `CostHistoryAnalytics → GetCompositeIndex` | cross_community | 6 |
| `ProposalTable → OpenDB` | cross_community | 6 |
| `ProposalTable → RequestPersistentStorage` | cross_community | 6 |
| `HistoricalProposalsPanel → OpenDB` | cross_community | 6 |
| `HistoricalProposalsPanel → RequestPersistentStorage` | cross_community | 6 |
| `HistoricalProposalsPanel → GetItem` | cross_community | 6 |
| `ProposalTable → ContactToRow` | cross_community | 5 |
| `HistoricalProposalsPanel → ForceRefreshToken` | cross_community | 5 |
| `HistoricalProposalsPanel → _trackUsage` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Hooks | 6 calls |
| Widgets | 5 calls |
| Constants | 4 calls |
| Resources | 3 calls |
| Cluster_67 | 1 calls |
| Planroom | 1 calls |
| Database | 1 calls |

## How to Explore

1. `gitnexus_context({name: "computeEstimatorExperience"})` — see callers and callees
2. `gitnexus_query({query: "settings"})` — find related execution flows
3. Read key files listed above for implementation details
