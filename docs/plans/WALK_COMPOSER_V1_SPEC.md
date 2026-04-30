# Walk Composer V1 — Spec & TODO

Status: **Pending design + product validation**
Owner: TBD
Target window: Post Phase-E (MFA wire) — next product cycle.

## Why this doc exists

`museum-frontend/app/(stack)/walk-composer.tsx` ships today as a `coming_soon` stub. Four entry points already navigate to it:

- `museum-frontend/app/(stack)/settings.tsx:181` — settings card
- `museum-frontend/app/(stack)/discover.tsx:183` — discover surface
- `museum-frontend/app/(stack)/preferences.tsx:90,258` — preferences card + footer
- `museum-frontend/features/chat/application/useStartConversation.ts:45` — chat start fallback

The audit on 2026-04-30 flagged the stub as dead-code candidate. Decision (recorded by user): **keep the stub, ship the feature in a future cycle**. This doc captures the open product and engineering questions so the next pass can start without re-discovery.

## Hypothesis (to validate before build)

A walk composer lets the visitor pre-define a **theme** for a museum visit (e.g. "Renaissance portraits", "20th-century sculpture") so Musaium proactively surfaces relevant artworks and routes through the museum, rather than the visitor reactively snapping each piece. Aligns with the hybrid reactive/proactive product philosophy already documented (`memory/project_hybrid_product_philosophy.md`).

## V1 scope candidates (need product call)

| Scope | Description | Cost estimate |
|---|---|---|
| **A — Static themes** | Curated theme list per museum (5-10 themes), tap → orchestrator pre-loads keyword set into the chat session. | S (1 sprint) |
| **B — Free-text intent** | Natural-language input ("I want to see anything related to grief in 19th-century French painting"), LLM extracts theme → keyword set + suggested route. | M (2 sprints) — needs LLM prompt + classifier |
| **C — Route map** | Adds a physical-route overlay on the museum map: ordered list of recommended rooms/positions. | L (3+ sprints) — requires per-museum room geometry, often missing in OSM. |

V1 likely = **A + skeleton of B**. C is V2.

## Open product questions

1. Does the theme persist across sessions for the same museum, or per-visit only?
2. Does it modify the proactive-museum-history opening message (already shipped) or replace it?
3. Reactive interruption: if the visitor photographs an off-theme work, does Musaium stay strict to theme or pivot?
4. Multi-language: does theme selection ship FR + EN at launch (mirrors current i18n surface)?

## Open engineering questions

1. **Backend contract**: extend chat session payload with `theme?: { id: string; locale: string }`? Or separate `WalkPlan` entity with FK to ChatSession?
2. **Orchestrator hook**: where in `langchain.orchestrator.ts` does the theme inject into the system prompt — alongside or replacing the museum history block?
3. **Storage**: theme metadata source. Wikidata can give us style/movement labels; do we accept curator overrides per museum (admin panel)?
4. **Offline**: does theme list ship in the offline pack (`OfflineMapsCard` already covers maps), or online-only?
5. **Analytics**: which themes get picked? Need `walk_theme_selected` event.

## Engineering follow-up checklist (when work resumes)

- [ ] Product validation pass (questions above)
- [ ] Backend domain model — port + adapter draft (probably hexagonal in `museum-backend/src/modules/walk/`)
- [ ] OpenAPI delta + mobile types regen
- [ ] Frontend feature folder `museum-frontend/features/walk/`
- [ ] Replace `(stack)/walk-composer.tsx` body with the real screen behind a feature flag (`FEATURE_WALK_COMPOSER`) so existing entry points keep navigating during rollout
- [ ] i18n keys `walkComposer.*` (FR + EN), update `museum-frontend/shared/i18n/`
- [ ] Tests: unit (theme selection state), integration (orchestrator-with-theme), E2E (Maestro from settings entry → theme picked → chat session opens with primed prompt)
- [ ] Remove this doc after the work lands; spec lives in source

## Why we did NOT delete the stub

A nontrivial number of UI surfaces wire to it (4 entry points). Deleting the route would also require removing the entries — and product has confirmed the feature is a future priority. Keeping the stub:

- Preserves the navigation graph users already see (no regression on settings/discover/preferences cards)
- Keeps the i18n keys (`walkComposer.title`, `walkComposer.subtitle`, `walkComposer.coming_soon`) live and translated
- Gives the future work a known landing route — no reroute needed

This file is the contract. When the next sprint picks it up, start here.
