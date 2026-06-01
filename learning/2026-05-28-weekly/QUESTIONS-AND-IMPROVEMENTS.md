# Interrogations & améliorations — formation semaine 2026-05-21 → 2026-05-28

> **Principe** (Tim) : « c'est en discutant du code que l'on va l'améliorer. »
> Ce fichier capture, au fil de la formation, **(1)** mes questions et leur réponse, **(2)** les
> améliorations concrètes à porter au code qu'elles révèlent.
>
> **Gouvernance** — ce fichier est un *backlog de discussion*, pas une implémentation.
> Toute modif de code applicatif passe ensuite par le pipeline `/team` fresh-context 5-phase
> (UFR-022 : spec → plan → red → green → verify → review). Les items `READY` validés peuvent
> être promus vers `docs/TECH_DEBT.md` et/ou `docs/ROADMAP_PRODUCT.md`.
>
> Statuts : `OPEN` (en discussion) · `ANSWERED` (question close) · `READY` (amélioration spécifiée, prête pour /team) · `DONE` (mergée) · `WONTFIX` (décidé de ne pas faire).

---

## 1. Interrogations (journal des questions)

| ID | Date | Thème · item | Question | Réponse (résumé) | Statut |
|----|------|--------------|----------|------------------|--------|
| Q1 | 2026-05-28 | A.2 · sentinel `requireUser` | Le sanity-check `expect(total).toBeLessThanOrEqual(7)` — pourquoi 7 et pas 1 ? N'autorise-t-il pas 7 régressions une fois le sweep fini ? | Non. Le vrai garde-fou anti-régression = les assertions **par fichier** `expect(match).toBeNull()` (tolérance **0** dans chaque fichier cible). Le `<= 7` est un *méta-check de qualité de la regex au moment du gel* : `> 7` = regex trop lâche. La valeur `<= 7` est imposée par le **frozen-test** (le même test, byte-for-byte, doit passer en Red où count=7 ET en Green où count=0 ; `<= 7` est la seule borne stable des deux côtés). Le sanity ne peut pas attraper une regex *trop stricte* (<7) sans casser le frozen-test → borne basse abandonnée volontairement (`route-discipline-requireUser-codemod.test.ts:138-141`). | ANSWERED |
| Q2 | 2026-05-28 | A.2 · sentinel `requireUser` | Le sentinel ne couvre-t-il pas qu'une liste figée de fichiers ? | Oui — `TARGETS` est une liste figée de 4 fichiers (`route-discipline-requireUser-codemod.test.ts:42-47`). Un **nouveau** fichier hors liste qui réintroduit le pattern est invisible. → voir amélioration **IMP-1**. | ANSWERED → IMP-1 |

---

## 2. Améliorations à porter au code (backlog)

### IMP-1 — Sentinel par liste figée → interdiction repo-wide du throw 401 inline

- **Thème / origine** : A.2 (codemod `requireUser`), question Q2.
- **Problème** : `tests/unit/chat/route-discipline-requireUser-codemod.test.ts` ne scanne que 4 fichiers figés (`TARGETS`). Il *verrouille un sweep accompli* mais n'*empêche pas une réintroduction ailleurs* : un nouveau fichier route/controller qui copie `throw new AppError({ ... code: 'UNAUTHORIZED' ... })` inline passe inaperçu. Même limite probable sur les autres sentinels par liste de la vague (PR-3 `notFound`, PR-5/8 pagination, etc. — **à auditer**).
- **Fix proposé (préféré)** : règle ESLint custom dans `tools/eslint-plugin-musaium-test-discipline` qui **bannit repo-wide** le `throw new AppError({...code:'UNAUTHORIZED'...})` inline dans les fichiers HTTP (`**/adapters/primary/http/**`), avec message « use `requireUser(req)` / `unauthorized()` ». Avantage : couvre automatiquement tout nouveau fichier, intégré au gate `pnpm lint` existant.
- **Alternative** : convertir le sentinel d'une liste `TARGETS` figée vers un **scan d'arbre** (glob `src/modules/**/adapters/primary/http/**/*.ts`). Moins cher à écrire, mais plus bruyant (faux positifs sur usages légitimes) et hors du frozen-test une fois le sweep fini.
- **Décision de design à trancher en discussion** : ESLint (interdiction permanente, à l'échelle repo) vs scan d'arbre (sentinel élargi) — cf. Insight « le bon outil dépend de la question » (verrouiller un refacto ≠ bannir un pattern partout).
- **Statut** : `OPEN` — à spécifier puis passer par `/team`.
- **Effort estimé** : à chiffrer ensemble (rappel UFR-019 : mes propres estimations sont à diviser).

---

## Comment on alimente ce fichier

À chaque session de formation : après avoir creusé un item, on ajoute (a) la question dans §1, (b) toute amélioration révélée dans §2 avec un ID `IMP-N`. Quand un `IMP-N` passe `READY`, on décide ensemble de le promouvoir vers `TECH_DEBT.md` / roadmap et de lancer `/team`.
