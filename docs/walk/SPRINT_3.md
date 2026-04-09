# Sprint 3 — Walk Phase B: GPS + Narration

> ⚠️ **STATUS**: NOT STARTED — planning doc only, 0 code.
>
> **Duree**: 2 semaines | **Priorite**: Post-traction | **Dependances**: S2

## Goal

Navigation GPS temps reel, narration IA, audio TTS, notifications de proximite.

## User Stories

| ID | Story | Critere d'acceptation |
|----|-------|----------------------|
| MW-B01 | Position temps reel | GPS tracking, blue dot bouge sur carte |
| MW-B02 | Notification proximite | Notification locale a 150m d'un stop + vibration |
| MW-B03 | Narration culturelle | IA genere contexte de marche entre stops |
| MW-B04 | Ecoute mains libres | TTS narration, play/pause |
| MW-B05 | Progression visible | "Stop 2/5 — 12 min — ~1h30 total" |
| MW-B06 | Marquer "Je suis la" | Bouton manuel + auto-detection GPS |
| MW-B07 | Resume de balade | Card resume partageable a la fin |

## Taches Techniques

### Backend Walk module (3j)
- [ ] Entite Walk + repository + use cases
- [ ] Routes: `POST /api/walks`, `PATCH /api/walks/:id`, `POST /api/walks/:id/context`
- [ ] Migration TypeORM table `walks`
- [ ] Section LLM `walk-context` dans `llm-sections.ts`

### expo-notifications (1j)
- [ ] `npx expo install expo-notifications`
- [ ] Permission + notification locale proximite
- [ ] Channel Android

### Frontend navigation (3j)
- [ ] `app/(stack)/walk/[walkId].tsx`
- [ ] `features/walk/application/useWalkNavigation.ts`
- [ ] `features/walk/ui/WalkProgressHeader.tsx`, `NextStopCard.tsx`, `WalkAudioPlayer.tsx`
- [ ] `features/walk/ui/WalkSummaryCard.tsx`

### Tests (1j)
- [ ] 15+ tests backend Walk use cases
- [ ] Unit test proximity detection
- [ ] Unit test walk API client

## Definition of Done
- [ ] Walk bout en bout | Notifs 150m | TTS play/pause
- [ ] 15+ backend tests, 5+ frontend tests
- [ ] Nouveau build EAS (module natif)

## Risques
| Risque | Proba | Impact | Mitigation |
|--------|-------|--------|------------|
| Rejet background location | HIGH | CRITICAL | Foreground ONLY |
| Drain batterie GPS | High | Medium | Accuracy.Balanced, pause |
| Latence LLM | Medium | Medium | Pre-generer au lancement |
