# ADR-041 — W1 walk transitions (multi-POI proactive) deferred to V1.1

- **Status** : Deferred
- **Owner** : Tim
- **Created** : 2026-05-12 (cleanup sprint audit-cleanup-2026-05-12)
- **Source** : `docs/audit-cleanup-2026-05-12/PLAN_MASTER.md` (hors-scope V1)

## Context

W1 = "walk transitions" — proactive AI nudges as the visitor moves between points-of-interest in a guided walk (e.g. summary of last POI, preview of next, museum-history bridge content). Listed on `docs/ROADMAP_PRODUCT.md`.

The current product philosophy is hybrid reactive/proactive (per [[hybrid-product-philosophy]] memory): proactive at *transitions* (museum history, summary), reactive in interaction. W1 is the proactive-at-transitions arm.

## Decision

Defer to V1.1. V1 (2026-06-01) ships with single-POI conversational chat only. No multi-POI walk sequencing, no transition triggers, no museum-history bridge content.

## Why

- Geo per-message pipeline (see [[geolocation-pipeline]] memory) is wired but only used reactively in chat — not yet triggering proactive content.
- Transition logic requires a state machine (visitor route + current POI + next POI prediction) that has no implementation today.
- B2B pilot value of W1 unclear — solo-museum visitors may prefer reactive chat.

## Consequences

- V1 keeps the geo pipeline scope tight.
- W1 reopening will need: state-machine ADR, POI graph data model decision, latency budget for transition LLM calls.

## Reopen trigger

Any of: B2B pilot requests guided-tour mode, visitor user-test (>10 sessions) shows discoverability gap for next POI, museum admin panel needs walk-authoring feature.
