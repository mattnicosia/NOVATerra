# NOVATerra — Project Instructions

## Response Protocol (Every Prompt)
On every user prompt, start with a brief header before working:
1. **Processing**: One line restating what you're about to do
2. **Leverage**: List which tools/agents/hooks/skills are being applied (parallel agents, Supabase MCP, Vercel MCP, git context hook, build check hook, memory, etc.)
3. Then execute. No permission-asking, just go.

## Build & Deploy
- Node path: `/Users/mattnicosia/local/node/bin/node`
- PATH: `export PATH="/Users/mattnicosia/local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"`
- Build: `npx vite build` from `app/` dir
- Deploy: `npx vercel --prod` from `app/` dir
- Production: `https://app-nova-42373ca7.vercel.app`

## Architecture
- React 18 + Zustand + IndexedDB (offline-first, Supabase cloud secondary)
- Design tokens: `const C = useTheme(); const T = C.T;`
- Style helpers: `inp()`, `nInp()`, `bt()` from `@/utils/styles`
- Key stores: takeoffsStore, drawingsStore, builderStore, estimatesStore, uiStore, orgStore, scanStore
- Zustand store actions are stable references (defined inline in `create()`)
- Zustand getter properties don't work — use exported selector functions (`selectIsManager`, etc.)

## Bug Patterns to Avoid
- **Stale takeoff ID references**: Builder store persists `itemTakeoffIds` separately. After reload, IDs may not exist. Always validate via `useTakeoffsStore.getState().takeoffs.some(t => t.id === toId)` before using.
- **Stale closures with useCallback**: With `[]` deps, read from `useTakeoffsStore.getState()` / `useDrawingsStore.getState()` instead of closure variables.
- **Debug strategy**: Use `document.title` to surface debug info visually when console.log isn't practical.

## Persistence & Sync Patterns
- IndexedDB primary, Supabase cloud secondary (background push/pull)
- Server-side soft-delete: `deleted_at` column on `user_estimates`
- `usePersistence.js` first-load pull checks `bldg-deleted-ids` before restoring
- Auto-save debounce callbacks re-check `activeEstimateId` from fresh Zustand state
- `orgReady` flag gates persistence + cloud sync hooks (timing race prevention)

## Context Management (Do This Automatically)
- **Proactively run `/compact`** before pivoting to a different type of work within a long session (e.g., finishing DB work before starting UI work). Don't wait for auto-compact at 87%.
- **Suggest `--continue`** when a conversation ends mid-task. Matt won't remember — remind him.
- Matt's workflow is prompt-and-go. Handle context hygiene silently. Don't ask, just do it.

## Parallel Agents (Default Behavior)
- **Default to parallel subagents** whenever tasks are independent. Don't work single-threaded.
- Codebase exploration: fan out across stores, components, and utils simultaneously
- Multi-file fixes: if changes don't touch the same files, run agents in parallel
- Post-implementation: run build check + code review + regression check concurrently
- Research: when asked "how does X work", explore multiple entry points at once
- **Stay sequential when**: steps depend on each other, files overlap, or you need output from step A to inform step B

## Conventions
- Takeoff CRUD: use `useTakeoffsStore.getState()` to avoid stale closures
- `syncDerivedToTakeoffs` validates stale references before processing
- Builder items have `renderWidth` metadata for scale-aware rendering
- Error tracking: Sentry in `main.jsx` with error boundary fallback UI
- Session enforcement: `user_active_session` table, 30s polling, kick on mismatch

## Themes
- 4 themes: NOVA, Aurora, Neutral, Linear
- Design token file: `app/src/constants/designTokens.js`
- Fonts: Switzer primary, Inter fallback. Theme-specific: Barlow/Barlow Condensed (Construct), IBM Plex Mono (data)

## Scan / ROM Pipeline
- 3-phase: detect schedules -> parse each -> generate ROM (PlanRoomPage)
- 9 schedule types: wall-types, door, window, finish, plumbing-fixture, equipment, lighting-fixture, mechanical-equipment, finish-detail
- Tiered AI: Haiku for detection/parsing ($0.01/page), Sonnet for interpretation ($0.15/page)
- Key files: scanStore, scheduleParsers.js, romEngine.js, normalizationEngine.js, proposalValidation.js, scopeTemplates.js
