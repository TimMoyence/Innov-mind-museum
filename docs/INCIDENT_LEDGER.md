# Incident Ledger — bugs échappés en aval des gates

> Registre des bugs qui ont atteint dev / main / TestFlight / prod **malgré** les gates shift-left.
> Vue humaine ; la vue machine est `team-knowledge/lessons/` (`post-complete-lesson-capture.sh`), cross-référencée par `INC-id`.
>
> **Pourquoi ce registre** — industrialiser le réflexe réactif. Aujourd'hui, après un incident, on improvise un sentinel. La colonne **`Tier-qui-l'aurait-pris`** force le post-mortem à répondre à une question mécanique : *« à quel niveau de la pyramide de test ce bug devient-il visible ? »*. Quand un run `/team` corrige un `INC-id`, `pre-complete-incident-regression-check.sh` (Gate D) exige que le `test-contract.md` du fix contienne un UC `Catégorie: regression` lié à cet INC-id, **avec un `Tier` ≥ celui de cette colonne**. On ne peut pas « corriger » un bug pg-réel avec un unit mocké.
>
> **Comment ajouter une ligne** — au post-mortem d'un bug échappé : choisir un `INC-id` (`INC-YYYY-MM-DD-slug`), décrire le symptôme, le niveau atteint, et surtout le `Tier-qui-l'aurait-pris` (le niveau de test minimal qui aurait rendu le bug visible AVANT le merge). `UC-régression` et `Fix commit` se remplissent quand le fix passe par `/team`.

| INC-id | Symptôme | Échappé jusqu'à | Tier-qui-l'aurait-pris | UC-régression | Fix commit |
|--------|----------|-----------------|------------------------|---------------|------------|
| INC-2026-06-05-quota-noblock | Quota free ne bloque jamais — 402 jamais émis ; `result[0]=[]` truthy → `next()` → 201, compteur jamais incrémenté (forme du tuple `INSERT…RETURNING` = `[rows, count]`, pas une row) | prod | integration (vrai driver pg — un unit mocké n'aurait jamais vu la forme du tuple) | — (prédate le mécanisme) | f74ce7de |
| INC-2026-06-06-build-localhost | Binaire TestFlight pointe `localhost` (aucun backend) — compilé en local Xcode hors profil EAS → `app.config.ts` retombe `variant=development` + `API_BASE_URL=localhost` | TestFlight | contract (build-env : variant→URL — un test de contrat build aurait prouvé que le build prod résout l'URL prod) | — (prédate le mécanisme) | — (fix : build via EAS profil prod OU dériver variant de `$CONFIGURATION` Xcode) |
| INC-2026-06-05-rollback-sha | Auto-rollback prod mort depuis le SHA-pinning — capture/restore `:previous`/`:latest` vs compose `image:...:${IMAGE_TAG}` → FATAL « No such image :previous » au 1er rollback réel | prod (1er rollback réel) | e2e (répétition du chemin de rollback — seul un rehearsal end-to-end l'aurait exercé) | — (prédate le mécanisme) | 1fd9755e |
