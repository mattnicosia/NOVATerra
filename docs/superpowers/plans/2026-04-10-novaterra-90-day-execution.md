# NOVATERRA 90-Day Execution Plan

Date: 2026-04-10
Owner: Codex
Status: Active

## Goal

Create the first durable version of the NOVATERRA architecture:

- foundation stable
- NOVA CORE direction explicit
- blueprint intelligence unified
- predictive takeoff accelerated
- presentation strategy grounded in real data

## Phase 1: Foundation Lockdown

Target: Weeks 1-3

### Objectives

- eliminate data-loss and false-success paths
- make scope review durable
- standardize provenance and persistence

### Required outcomes

1. Scope review state persists with estimates.
2. Pushing scope into estimate preserves extracted pricing and provenance.
3. Source types are canonical across scan, ROM preview, and scope review.
4. Remaining high-risk sync hazards are audited and fixed.

### Deliverables

- persisted `scopeItems`
- canonical source enum and schema
- push-to-estimate pricing preservation
- regression coverage for persistence and sync-critical paths

## Phase 2: Scan Architecture Unification

Target: Weeks 3-6

### Objectives

- move scan execution to a backend job model
- unify Plan Room and ROM drawing analysis around one pipeline

### Required outcomes

1. Browser becomes launcher, viewer, and reviewer.
2. Heavy extraction runs in backend jobs.
3. One scan job can serve both authenticated and preview flows with different output surfaces.

### Deliverables

- scan job API shape
- job persistence/state model
- browser polling/subscription path
- migration plan out of client-heavy `scanRunner`

## Phase 3: Structural Extraction First

Target: Weeks 5-8

### Objectives

- make native PDF/vector/layout extraction the primary path for native PDFs
- keep OCR/vision fallback for sparse-text and scanned sets

### Required outcomes

1. Native PDF schedule parsing becomes parser-first.
2. Capability routing determines when to use text, parser, or vision.
3. Schedule parsing cost drops while reliability increases.

### Deliverables

- capability router
- structural-first schedule path
- fallback policy
- benchmark comparison against current scan path

## Phase 4: Blueprint Facts Layer

Target: Weeks 7-10

### Objectives

- stop generating estimate-shaped outputs too early
- introduce a fact model with evidence

### Required outcomes

1. Non-schedule extraction produces facts first.
2. Facts carry sheet/evidence/confidence/properties.
3. Scope items are synthesized from facts, not directly hallucinated.

### Deliverables

- fact schema
- fact extraction pipeline
- fact normalization and dedupe
- reviewed scope synthesis layer

## Phase 5: Quantity and Pricing Upgrade

Target: Weeks 9-12

### Objectives

- increase deterministic quantities
- move pricing toward assembly-backed intelligence

### Required outcomes

1. Room areas, wall lengths, and common mark counts become deterministic where possible.
2. Scope items map into assemblies and pricing candidates.
3. ROM remains a sanity/calibration layer, not the primary item-pricing source.

### Deliverables

- quantity provenance model
- assembly matching layer
- flagged unresolved pricing path
- estimate-review explanations

## Parallel Track: NOVA CORE Definition

This runs continuously through the 90-day window.

### Objectives

- define the authoritative cost graph
- define learning signals and ingestion priorities

### Required outcomes

1. Canonical item and assembly schema.
2. Provenance model for pricing.
3. Correction ingestion model.
4. Quote and historical proposal ingestion plan.
5. Calibration feedback model.

## Parallel Track: Evaluation

No intelligence work ships without evaluation.

### Immediate decisions

- establish a benchmark corpus of real plan sets
- define scorecards for scope recall, quantity error, and price error
- add sync/data integrity regression gates

## Immediate Requests To Owner

These inputs will accelerate the system materially:

1. Real plan/spec sets across project types
2. Final estimates or awarded bid references
3. Historical quote and vendor pricing data
4. Access to any existing assembly or unit-cost source of truth

## Product Priority Order

This is the current execution order:

1. Data integrity
2. NOVA CORE
3. Blueprint intelligence
4. Predictive takeoff
5. Immersive presentation

Immersive presentation stays important, but it follows trustworthy data and intelligence.

## Success Criteria At Day 90

- no known critical sync/data-loss issues in active estimate workflows
- scope review is durable and pricing-preserving
- unified scan job architecture is in place or actively migrating
- structural extraction is primary for native PDFs
- fact model exists and is feeding reviewed scope
- NOVA CORE schema and learning loop are explicit
- evaluation harness exists with real benchmark projects

## What I Will Do Next

1. Turn this plan into a concrete technical work queue.
2. Rank the highest-leverage code changes already identified in the current codebase.
3. Start with foundation fixes and architectural unification.
