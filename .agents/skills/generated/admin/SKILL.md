---
name: admin
description: "Skill for the Admin area of BLDG Estimator. 32 symbols across 13 files."
---

# Admin

32 symbols | 13 files | Cohesion: 74%

## When to Use

- Working with code in `app/`
- Understanding how useAdminFetch, AdminUsersPage, AdminUserDetail work
- Modifying admin-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `app/src/pages/admin/AdminUnitRatesPage.jsx` | titleCase, normalizeUnit, AdminUnitRatesPage, findDbMatches, saveDecision (+2) |
| `app/src/pages/admin/AdminInvitesPage.jsx` | AdminInvitesPage, loadInvites, createInvite, revokeInvite, copyLink (+1) |
| `app/src/pages/admin/AdminFeedbackPage.jsx` | timeAgo, AdminFeedbackPage, loadFeedback, toggleResolved, updateNotes |
| `app/src/pages/admin/AdminEmbeddingsPage.jsx` | getKindColors, AdminEmbeddingsPage |
| `app/src/pages/admin/AdminDashboard.jsx` | getKpiDefs, AdminDashboard |
| `app/src/utils/proposalValidation.js` | getStatusColor, getStatusLabel |
| `app/src/pages/admin/AdminNovaPage.jsx` | fmt, ProposalsTab |
| `app/src/hooks/useAdminFetch.js` | useAdminFetch |
| `app/src/pages/admin/AdminUsersPage.jsx` | AdminUsersPage |
| `app/src/pages/admin/AdminUserDetail.jsx` | AdminUserDetail |

## Entry Points

Start here when exploring this area:

- **`useAdminFetch`** (Function) — `app/src/hooks/useAdminFetch.js:5`
- **`AdminUsersPage`** (Function) — `app/src/pages/admin/AdminUsersPage.jsx:8`
- **`AdminUserDetail`** (Function) — `app/src/pages/admin/AdminUserDetail.jsx:63`
- **`AdminEstimatesPage`** (Function) — `app/src/pages/admin/AdminEstimatesPage.jsx:6`
- **`AdminEstimateDetail`** (Function) — `app/src/pages/admin/AdminEstimateDetail.jsx:6`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `useAdminFetch` | Function | `app/src/hooks/useAdminFetch.js` | 5 |
| `AdminUsersPage` | Function | `app/src/pages/admin/AdminUsersPage.jsx` | 8 |
| `AdminUserDetail` | Function | `app/src/pages/admin/AdminUserDetail.jsx` | 63 |
| `AdminEstimatesPage` | Function | `app/src/pages/admin/AdminEstimatesPage.jsx` | 6 |
| `AdminEstimateDetail` | Function | `app/src/pages/admin/AdminEstimateDetail.jsx` | 6 |
| `AdminEmbeddingsPage` | Function | `app/src/pages/admin/AdminEmbeddingsPage.jsx` | 12 |
| `AdminDashboard` | Function | `app/src/pages/admin/AdminDashboard.jsx` | 59 |
| `AdminUnitRatesPage` | Function | `app/src/pages/admin/AdminUnitRatesPage.jsx` | 31 |
| `findDbMatches` | Function | `app/src/pages/admin/AdminUnitRatesPage.jsx` | 62 |
| `saveDecision` | Function | `app/src/pages/admin/AdminUnitRatesPage.jsx` | 161 |
| `startEdit` | Function | `app/src/pages/admin/AdminUnitRatesPage.jsx` | 183 |
| `saveEdit` | Function | `app/src/pages/admin/AdminUnitRatesPage.jsx` | 193 |
| `AdminInvitesPage` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 19 |
| `loadInvites` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 31 |
| `createInvite` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 45 |
| `revokeInvite` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 63 |
| `copyLink` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 70 |
| `getStatus` | Function | `app/src/pages/admin/AdminInvitesPage.jsx` | 77 |
| `getStatusColor` | Function | `app/src/utils/proposalValidation.js` | 378 |
| `getStatusLabel` | Function | `app/src/utils/proposalValidation.js` | 394 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProposalsTab → ResolveLaborKey` | cross_community | 6 |
| `ProposalsTab → ResolveLocationFactors` | cross_community | 5 |
| `AdminInvitesPage → Select` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Widgets | 9 calls |
| Stores | 3 calls |
| Cluster_70 | 3 calls |
| Database | 2 calls |
| Pages | 2 calls |
| Cluster_67 | 1 calls |

## How to Explore

1. `gitnexus_context({name: "useAdminFetch"})` — see callers and callees
2. `gitnexus_query({query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
