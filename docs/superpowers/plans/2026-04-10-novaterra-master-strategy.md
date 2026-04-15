# NOVATERRA Master Strategy

Date: 2026-04-10
Owner: Codex
Status: Controlling document

## Mission

Build the most intelligent and complete estimating software ever created, with a margin large enough that competitors cannot catch up through incremental feature matching.

NOVATERRA means New Earth. The product should feel like a new operating system for preconstruction:

- drawings, specs, and vendor data in
- evidence-backed scope, quantity, and pricing out
- estimate, bid, proposal, and presentation unified

## Product Thesis

The moat will not come from one model, one feature, or one interface trick.

The moat will come from four compounding systems:

1. NOVA CORE
2. Blueprint Intelligence
3. Predictive Takeoff
4. Immersive Preconstruction OS

If these four systems are tightly integrated, every project improves the next one and every workflow becomes harder to replicate.

## Pillar 1: NOVA CORE

NOVA CORE is the authoritative cost intelligence layer. It is not just a cost database.

It must hold:

- canonical items
- assemblies
- vendor and subcontractor pricing
- historical proposals and quotes
- production rates
- regional and market adjustments
- estimator corrections
- job outcomes and actuals
- confidence and provenance

### Required properties

- Every price must have provenance.
- Every assembly must be versioned.
- Every correction must be learnable.
- Every recommendation must be explainable.
- Every downstream workflow must read from the same cost graph.

### Competitive objective

Compete on judgment, not just storage.

The database should become a self-improving cost graph that knows:

- what something is
- how it is usually built
- what it tends to cost
- when that cost is unreliable
- what changed in the latest market or project context

## Pillar 2: Blueprint Intelligence

Blueprint Intelligence converts construction documents into evidence-backed construction facts.

### Core rule

The primary artifact is not an estimate item.

The primary artifact is a fact with evidence.

Examples:

- wall assembly
- roof assembly
- footing type
- door type
- window type
- finish system
- plumbing fixture
- RTU
- panelboard
- paving area
- utility run

Each fact must carry:

- sheet reference
- evidence source
- extracted properties
- confidence
- normalized type
- dedupe key

### Extraction architecture

Use capability-routed hybrid extraction:

1. Native PDF/vector/layout extraction first
2. Deterministic parsing second
3. Multimodal reasoning third
4. Template and AI gap-fill last

This means:

- native PDF text and geometry become the default path for native PDFs
- vision remains a fallback and interpretation layer, not the first hammer
- schedule parsing becomes parser-first for native PDFs
- scanned or sparse-text PDFs route into OCR + vision fallback

### Why this matters

Competitors will mostly build “LLM looks at drawings.”

That is weak.

NOVATERRA should build a document intelligence system that combines:

- vector geometry
- layout structure
- OCR
- multimodal interpretation
- cross-sheet reasoning
- correction memory

That is much harder to catch.

## Pillar 3: Predictive Takeoff

Predictive Takeoff should become a ranked decision engine, not a guessing engine.

It should combine:

- geometry
- room and wall detection
- schedule references
- symbol and mark detection
- notes and detail context
- assembly knowledge
- estimator correction history
- firm-specific patterns

### Success condition

The estimator should spend time confirming and refining, not manually reconstructing scope from scratch.

### Non-goals

- no fake confidence
- no unexplained quantities
- no hidden model decisions that cannot be traced

## Pillar 4: Immersive Preconstruction OS

The interface should feel spatial, visual, and evidence-linked.

The goal is not decorative 3D.

The goal is to make scope, quantity, cost, and risk understandable at a glance.

### Product direction

- drawings, scope, estimate, and 3D views should reference the same underlying facts
- every scope item should link back to sheets and evidence
- every estimate item should expose pricing provenance
- 3D and spatial views should illuminate assemblies, systems, and quantity drivers

## Non-Negotiables

These are hard rules:

1. No silent data loss.
2. No false-success sync behavior.
3. No AI-generated pricing without provenance.
4. No duplicate pipelines that drift independently.
5. No feature added without persistence and evaluation.
6. No presentation layer allowed to outrun data integrity.

## Strategic Decisions

These decisions are now fixed unless explicitly superseded:

1. Blueprint intelligence moves to a backend job architecture.
2. Native PDF structure becomes primary for native PDFs.
3. Vision becomes fallback plus interpretation, not default.
4. Scope review stays human-gated.
5. AI outputs must include provenance, confidence, and evidence links.
6. NOVA CORE becomes the source of truth for cost intelligence.

## Current Reality

The codebase already has strong raw ingredients:

- cost and estimate workflows
- sync and persistence systems
- ROM engine
- scope review UI
- PDF text/vector extraction
- vector wall and room analysis
- predictive takeoff surfaces
- proposal and bid workflows

But the system is fragmented.

The immediate problem is not lack of ambition. It is fragmentation, weak persistence boundaries in some AI flows, and too much client-side orchestration.

## Moat Strategy

The defensible advantage will come from compounding loops:

1. Correction loop
   - estimator corrections feed future extraction and pricing

2. Quote loop
   - vendor and subcontractor pricing continuously recalibrate assemblies

3. Outcome loop
   - actual costs and awarded bids strengthen estimates

4. Document loop
   - every drawing set strengthens classification, extraction, and dedupe

5. Workflow loop
   - estimate, bid package, proposal, and portal all feed back into NOVA CORE

### Hard-to-copy assets

- evidence-backed fact graph
- corrected and calibrated cost graph
- estimator feedback history
- firm-specific and regional intelligence
- evaluation corpus of real plan sets and outcomes

## Architecture Direction

### Authoritative data layers

1. Cost Graph
2. Document Artifacts
3. Blueprint Facts
4. Scope Review Objects
5. Estimate Objects
6. Outcome and Feedback Records

### Canonical progression

Documents -> Artifacts -> Facts -> Scope Review -> Estimate -> Bid/Proposal -> Outcome -> Learning

## Immediate Priorities

Before major expansion:

1. Stabilize sync and persistence in all critical estimate and scope paths.
2. Persist scope review state and preserve pricing/provenance on push.
3. Normalize source handling across scan, ROM preview, and review UI.
4. Unify scan architecture behind one backend job system.
5. Define the NOVA CORE schema and learning model.

## What We Stop Doing

- adding isolated AI features without persistence
- growing browser-only orchestration for heavyweight scan work
- shipping ambiguous provenance
- letting template fallback masquerade as drawing-derived intelligence
- maintaining separate logic paths for the same conceptual workflow

## Evaluation Standard

Every core intelligence layer must be measured.

Required evaluation families:

- scope recall
- false-positive rate
- quantity error
- pricing error
- confidence calibration
- estimator correction rate
- sync/data-loss regressions

## Final Standard

NOVATERRA should become:

- the best place to understand a construction project
- the best place to price it
- the best place to package and win the work
- the best place to learn from every project afterward

That is the standard now.
