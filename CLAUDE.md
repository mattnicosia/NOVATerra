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
- Deploy: `npx vercel --prod` from `app/` dir (or `./deploy.sh` from repo root)
- Production: `https://app-nova-42373ca7.vercel.app`
- GitHub auto-deploy is disabled for main — always deploy via CLI
- Do NOT set Vercel rootDirectory to "app" — it breaks CLI deploys from app/

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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **BLDG Estimator** (6627 symbols, 14394 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/BLDG Estimator/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/BLDG Estimator/context` | Codebase overview, check index freshness |
| `gitnexus://repo/BLDG Estimator/clusters` | All functional areas |
| `gitnexus://repo/BLDG Estimator/processes` | All execution flows |
| `gitnexus://repo/BLDG Estimator/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Widgets area (214 symbols) | `.claude/skills/generated/widgets/SKILL.md` |
| Work in the Hooks area (211 symbols) | `.claude/skills/generated/hooks/SKILL.md` |
| Work in the Pages area (175 symbols) | `.claude/skills/generated/pages/SKILL.md` |
| Work in the Estimate area (111 symbols) | `.claude/skills/generated/estimate/SKILL.md` |
| Work in the Resources area (102 symbols) | `.claude/skills/generated/resources/SKILL.md` |
| Work in the Api area (82 symbols) | `.claude/skills/generated/api/SKILL.md` |
| Work in the Insights area (72 symbols) | `.claude/skills/generated/insights/SKILL.md` |
| Work in the Takeoffs area (68 symbols) | `.claude/skills/generated/takeoffs/SKILL.md` |
| Work in the Constants area (56 symbols) | `.claude/skills/generated/constants/SKILL.md` |
| Work in the Planroom area (52 symbols) | `.claude/skills/generated/planroom/SKILL.md` |
| Work in the Stores area (40 symbols) | `.claude/skills/generated/stores/SKILL.md` |
| Work in the Admin area (39 symbols) | `.claude/skills/generated/admin/SKILL.md` |
| Work in the Agents area (28 symbols) | `.claude/skills/generated/agents/SKILL.md` |
| Work in the Database area (23 symbols) | `.claude/skills/generated/database/SKILL.md` |
| Work in the Settings area (23 symbols) | `.claude/skills/generated/settings/SKILL.md` |
| Work in the Rom area (19 symbols) | `.claude/skills/generated/rom/SKILL.md` |
| Work in the Scripts area (19 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Blender area (18 symbols) | `.claude/skills/generated/blender/SKILL.md` |
| Work in the Building-viewer area (18 symbols) | `.claude/skills/generated/building-viewer/SKILL.md` |
| Work in the Predictive area (17 symbols) | `.claude/skills/generated/predictive/SKILL.md` |

<!-- gitnexus:end -->
