# Roadmap Production 10/10 — User-First

**Date** : 2026-04-27
**Source** : team-reports/2026-04-27_pm-prod-deployment-audit.md
**Score actuel** : 8.5/10 — **Cible** : 10/10
**Philosophie** : Chaque action doit avoir un bénéfice utilisateur visible OU réduire un risque user (perte data, plantage, fuite info, latence). Hygiène interne sans user-value = droppée.

---

## Principes appliqués

1. **User-first** (UFR-006, UFR-007) — On ne mesure pas la couverture en %, on mesure les **parcours utilisateurs réels couverts**.
2. **Tests via factories partagées** (UFR-002) — Pas d'inline. `tests/helpers/<module>/<entity>.fixtures.ts`. Test du vrai comportement (DB réelle pour intégration, pas de mock du SUT).
3. **Pas de minimal fix** (UFR-001) — Quand on touche, on règle proprement.
4. **Verify-before-validate** (UFR-005) — Tests = vérification réelle, pas alibi statistique.
5. **Stade produit** : Musaium = pré-launch museum AI companion. Optimisations B2B/SLA payants reportées. Focus = fiabilité + UX visiteur + sécurité minimale crédible.

---

## Items DROPPÉS (low user-value)

| Item | Raison drop |
|---|---|
| Branch coverage 76.68% → 80% (numéro pour numéro) | Game stat ; remplacé par "tests parcours utilisateur réels" |
| 4 unsafe-`any` middleware → narrow | Hygiène interne, 0 impact user |
| Activer OTEL_ENABLED prod | Pré-launch, pas de charge justifiant tracing distribué |
| Eslint timing-attack false-positive suppress | Cosmétique |
| ADR confirmation regex bornés | Doc interne ; tests de fuzzing à la place si on touche |
| Coverage gate ratchet auto | Game ; gate manuel suffit |
| Runbooks README index | Cherchable via Glob ; pas user-value |
| EAS quota dashboard | Process ops, pas user |
| Externaliser policy version (CMS) | Pré-launch, hardcoded OK |
| Pentest externe | Pas le stade ; après 1k users actifs |

---

## 5 piliers user-first

### P1 — Fiabilité ressentie (le visiteur ne voit jamais d'erreur)

**Bénéfice user** : pas de page blanche, pas de chat qui crashe, app qui ne plante pas en plein musée.

| Action | Effort | User-value |
|---|---|---|
| Web smoke test fonctionnel post-deploy : login admin + landing assets + `/api/health` (pas curl HTML) | 3h | Page admin marche après chaque deploy |
| Migration rollback : query DB pour applied count (pas fichier I/O) | 2h | Rollback ne casse pas DB visiteur en prod |
| Plug `pnpm smoke:api` dans CI critique BE (gate avant merge main) | 1h | Régression API détectée avant prod |
| E2E backend sur **chaque PR** (pas PR + nightly) | 30 min | Bug user detecté avant merge |
| Maestro E2E mobile wire EAS artifact + run on PR (ou dispatch sur main) | 4h | Crash détecté avant store submit |

**Sortie** : 0 régression user-visible entre deploys.

---

### P2 — Tests parcours réels (factories, DB réelle, vrais flows)

**Bénéfice user** : features fonctionnent vraiment, pas seulement "passent les tests".

**Règles tests V2** :
- Toute fixture passe par `tests/helpers/<module>/<entity>.fixtures.ts` (UFR-002)
- Intégration BE = Postgres réel via Testcontainers (pas mock)
- Mobile = jest-expo + composants montés réels (pas snapshots vides)
- Web = Vitest + jsdom + form submission + API mockée au niveau réseau (MSW), pas mock du composant

| Parcours user à couvrir | App | Effort |
|---|---|---|
| **Visiteur photographie œuvre → réponse chat avec geo + multilingue** | mobile + BE | 3h |
| **Visiteur reset password + login + first chat** | mobile + BE | 2h |
| **Admin login MFA TOTP + role change + audit log visible** | web + BE | 3h |
| **Visiteur conversation: ouvrir / supprimer / sauvegarder + sort/filter** | mobile (feature `conversation` 0 tests) | 3h |
| **Onboarding first-launch: skip, complete, slide nav + first prompt** | mobile (feature `onboarding` 0 tests) | 3h |
| **Daily art: ouverture push notification → carte → save** | mobile | 2h |
| **Museum search geo: in-museum 20min cache + city no-cache** | mobile + BE | 2h |
| **Privacy data export + delete account (RGPD Art 15+17)** | web + BE | 3h |

**Pas de tests bullshit** :
- Pas de "expect(component).toBeDefined()"
- Pas de snapshot sans assertion comportementale
- Pas de mock du SUT lui-même
- Pas de tests qui cherchent juste à monter le %coverage

**Sortie** : 8 parcours utilisateurs critiques verts via factories.

---

### P3 — Sécurité que le visiteur peut ressentir

**Bénéfice user** : trust. Email account safe, photos privées, pas de fuite.

| Action | Effort | User-value |
|---|---|---|
| Redis password 32+ char + rotation trimestrielle automatisée (script + Sentry alert) | 2h | Sessions stables, pas de hijack |
| CSP nonce per-request middleware Next.js validé + test E2E | 2h | Inline-script attacks bloqués pour visiteur web |
| Certificate pinning Expo prod build vérifié (ou activé via `expo-network-security-config`) | 2h | MITM bloqué côté mobile |
| Tests fuzz sur regex inputs bornés (chat sanitization, S3 paths, email) | 3h | DoS regex impossible sur user inputs |

**Sortie** : 3 caveats sécu confirmés + fuzzing en place.

---

### P4 — UX produit hybride réactif/proactif (cf. memory project_hybrid_product_philosophy)

**Bénéfice user** : Musaium proactif aux transitions (entrée musée, fin visite), réactif en interaction. Pas de boutons fixes 3-choix.

| Action | Effort | User-value |
|---|---|---|
| Test parcours "entrée musée → message proactif historique 1 fois" | mobile + BE | 2h |
| Test parcours "fin visite → résumé proactif" | mobile + BE | 2h |
| Vérifier 0 unicode emoji dans screens/copy (UFR memory) — script CI grep | 1h | Cohérence visuelle (PNG + Ionicons) |
| Test voix V1 : STT → LLM → TTS pipeline complet sur audio réel | mobile + BE | 3h |

**Sortie** : philosophie produit testée, pas juste documentée.

---

### P5 — Continuité ops (visiteur ne perd pas ses données)

**Bénéfice user** : conversations préservées, mots de passe récupérables, RGPD respecté.

| Action | Effort | User-value |
|---|---|---|
| Doc `docs/RUNBOOKS/V1_FALLBACKS.md` : pg_dump opérateur + certbot manuel + breach SOP (en attendant V2 paying-users SLA) | 3h | Si incident, opérateur sait quoi faire en 5 min |
| Premier rollback drill manuel staging (filmé/documenté pour onboarding ops) | 2h | Rollback maîtrisé, pas découvert en prod |
| Ratchet bump tests=2877 → 3366 + as-any tracking | 5 min | Baseline juste, prochains run KO si régression |
| Activer V2 workflows (db-backup-daily, tls-renewal) **dès qu'un visiteur paie** | trigger | Conformité activée au bon moment |

**Sortie** : 0 perte data possible sans détection en <24h.

---

## Sprint plan condensé

| Sprint | Durée | Focus | Effort |
|---|---|---|---|
| **S1** | 1 semaine | P1 fiabilité (smoke web/BE, E2E PR, rollback DB-query, ratchet bump) + P3 sécu (Redis, CSP, cert pinning) | ~13h |
| **S2** | 2 semaines | P2 tests parcours réels — 8 user flows via factories | ~21h |
| **S3** | 1 semaine | P4 UX hybride tests + voix V1 + emoji guard CI | ~8h |
| **S4** | 1 semaine | P5 ops continuité + Maestro E2E live + drill rollback | ~9h |

**Total** : ~51h sur 5 semaines. 1 dev FE + 1 dev BE 50% + ops 1j/sem.

---

## Definition of 10/10

10/10 = on peut affirmer chacune sans hedging :

1. **Pas de régression user-visible** entre deux deploys (P1)
2. **8 parcours utilisateurs critiques** verts via factories sur DB réelle (P2)
3. **3 caveats sécu** confirmés + fuzzing inputs (P3)
4. **Philosophie produit hybride** testée pas juste docée (P4)
5. **Plan continuité ops** clair, drill effectué, ratchet à jour (P5)

**Anti-checklist** (ne PAS faire pour atteindre 10) :
- Augmenter %coverage en testant des getters
- Narrow unsafe-`any` qui ne touche pas un input user
- Activer OTEL/SBOM/SLSA juste pour le badge
- Doc qui répète ce que dit `git log`
- Pentest externe sur app pré-launch

---

## Tracking

- Suivi sprint : `docs/plans/PROD_10_10_TRACKER.md` (à créer S1)
- KB updates : `.claude/team-knowledge/quality-ratchet.json` après chaque parcours user couvert
- Rapports Sentinelle : `.claude/skills/team/team-reports/2026-MM-DD_*.md` par sprint

---

## Validation

Après S4, refaire audit `/team` mode `audit` full-stack et viser score ≥9.5 sur 6 surfaces. Score 10/10 atteint si tous les piliers DoD verts ET 0 regression user-visible reportée 2 semaines post-déploiement v1.2.0.
