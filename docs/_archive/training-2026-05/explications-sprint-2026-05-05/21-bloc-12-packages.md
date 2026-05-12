# 21 — Bloc 12 : Packages ajoutés / supprimés / upgradés

> **Pour qui ?** Toi, qui veux comprendre quels packages npm ont été touchés ce sprint, pourquoi, et ce qui a été un faux pas (uuid override).
> **Durée de lecture :** ~10 minutes.

---

## Vue d'ensemble par projet

| Projet | Runtime added | Dev added | Removed/slimmed |
|--------|---------------|-----------|-----------------|
| **museum-backend** | 2 (`langfuse`, `prom-client`) | 4 (`@swc/core`, `@swc/jest`, `fast-check`, plugin local) | 11 overrides slimmed |
| **museum-frontend** | 5 (`react-hook-form`, `@hookform/resolvers`, `zod`, `react-native-confetti-cannon`, `react-native-ssl-public-key-pinning`) | 2 (`bats`, plugin local) | 1 override tightened |
| **museum-web** | 0 | 7 (`@playwright/test`, `@axe-core/playwright`, `pg`, `@types/pg`, `openapi-typescript`, `prettier`, …) | TS downgrade `^6 → ~5.9.3` |
| **design-system** | 0 | 0 | — |
| **tools/eslint-plugin-…** | nouveau workspace | — | — |
| **repo root** | 0 | 0 | — |

---

## museum-backend

### Runtime added

#### `langfuse@^3.38.20` — observabilité LLM

**Pourquoi :** V12 W1 — toute call LLM enrobée dans `safeTrace`. Détaillé en [doc 06](./06-bloc-2-v12-orchestrator-supply-chain.md#langfuse--lobservabilité-llm).

**Pin sur la ligne 3.38.x** : la 4.x sortie courant 2026-05 a un nouveau callback API incompatible avec LangChain Callbacks. Pin pour stabilité, à upgrade quand LangChain v0.4 stable.

#### `prom-client@^15.1.3` — Prometheus client Node.js

**Pourquoi :** Spec H — endpoint `/metrics` + counters business. Détaillé en [doc 14](./14-bloc-6-observability-slo.md).

**Standard de facto** : utilisé par 90 % des services Node.js en prod. Pas de débat lib alternative.

### Dev added

#### `@swc/core@^1.15.32` + `@swc/jest@^0.2.39` — compilateur Rust

**Pourquoi :** Phase 11 — speedup test 4× (519 sec → 119 sec). Détaillé en [doc 16](./16-bloc-7-tests-phases-0-11.md#phase-11--swc-speedup--vitest-scope-refine).

**Caveat** : SWC + TypeORM legacy decorators = circular emit. Phase 11 fix = `Relation<T>` type alias sur les FK.

#### `fast-check@^3.23.2` — property-based testing

**Pourquoi :** V12 W6 — property tests sur `sanitizePromptInput`. Détaillé en [doc 06](./06-bloc-2-v12-orchestrator-supply-chain.md#property-tests-fast-check-sur-sanitizepromptinput).

**Pin v3** : v4 nécessite Jest 30+ (on est sur Jest 29).

#### `eslint-plugin-musaium-test-discipline` (workspace local)

**Pourquoi :** Phase 7 — enforce factory discipline + shape-match + disable justification. Détaillé en [doc 16](./16-bloc-7-tests-phases-0-11.md#phase-7--factory--shape-match-eslint-plugin).

**Privé au workspace** : pas publié npm, vit dans `tools/eslint-plugin-musaium-test-discipline/`.

### Overrides slimmed (14 → 3)

Les "overrides" dans `package.json` forcent une version pour les transitive deps. Maintenance lourde (à valider à chaque audit).

**Gardés (3) :**
- `langsmith >=0.5.20` — defensive sur CVEs LangChain stack.
- `protobufjs >=7.5.5` — defense CVE-2023-36665 (prototype pollution).
- `handlebars >=4.7.9` — legacy CVE family.

**Removed (11) :**
- `brace-expansion@1/2/4`, `diff`, `form-data`, `js-yaml`, `jws`, `minimatch@3/9`, `qs`, `path-to-regexp`, `picomatch` — tous satisfied par défaut upstream après cleanup.

**Pourquoi nettoyer** : chaque override = un risque de blocage du `pnpm install` quand un package amont change ses peer-deps. Moins d'overrides = moins de friction.

### Reverted : `uuid >=14.0.0` override

C'est le **vrai faux pas** du sprint, documenté honnêtement dans le commit `9d1e971a5`.

**Tentative initiale** : ajouter override `uuid >=14.0.0` pour fixer GHSA-w5hq-g745-h8pq (transitive via `langsmith → @langchain/core`).

**Diagnosis post-tentative** :
- Musaium consomme `uuid` uniquement via `validate(string)`.
- La CVE GHSA-w5hq-g745-h8pq concerne le **buffer-bounds bug** dans uuid v3, **non applicable** à `validate()`.
- L'override a cassé Jest (uuid 14 = ESM-only, Jest CJS).

**Fix** : override **removed**. uuid pinned `^11.1.0` direct dans `package.json`.

**`pnpm audit --prod`** clean per commit message.

**Leçon** : avant d'override pour fixer une CVE, **vérifier que la CVE s'applique à ton usage**. Si tu utilises 1 % de la lib, la CVE des autres 99 % est non-applicable.

---

## museum-frontend

### Runtime added

#### `react-hook-form@^7.74.0` + `@hookform/resolvers@^5.2.2` + `zod@^4.4.1`

**Pourquoi :** ADR-025 (state management governance mobile). Le formulaire `app/auth.tsx` (login/register) utilise maintenant rhf + zod resolver pour validation client-side.

**Note zod 4 FE / zod 3 BE** : décision documentée ADR-034 (renumérotée depuis ADR-031 le 2026-05-07) + ADR-033. **Pas de schemas partagés FE↔BE** (le contract est OpenAPI). Donc OK d'avoir 2 versions zod en parallèle.

#### `react-native-confetti-cannon@^1.5.2`

**Pourquoi :** T5.1 — confetti animation au submit d'une review (UX wahoo). Pure JS, simple.

**Honest gap** : lib taggée 1.5.2 il y a 2 ans, pas de New Architecture CI testing. Risque de breakage avec future RN. Acceptable parce que :
- Usage très limité (un seul appel sur submit review).
- Si breakage, on peut downgrade ou switch lib.

#### `react-native-ssl-public-key-pinning@^1.2.6`

**Pourquoi :** Cert pinning Phase 2 scaffold (V1 ship-disabled). Détaillé en [doc 05](./05-cert-pinning-kill-switch.md).

**Choix de cette lib** : maintained, supporte iOS TrustKit (mandatory pour 2-pin) + Android OkHttp CertificatePinner. Pas d'alternative sérieuse.

### Dev added

#### `bats@^1.10.0` — Bash test runner

**Pourquoi :** test des helper scripts Maestro (cf. CLAUDE.md § Phase 2). Les `museum-frontend/scripts/maestro-runner-setup.sh` etc. sont testés via Bats pour garantir leur robustesse.

#### `eslint-plugin-musaium-test-discipline` (workspace)

Même que BE. Plugin partagé.

### Override tightened : `@xmldom/xmldom`

`>=0.8.13` → `^0.8.10` (caps `<0.9.0`). Détaillé en [doc 01 F12](./01-bloc-1-banking-grade-hardening.md#f12--override-xmldomxmldom-pour-ne-pas-casser-expo-prebuild).

**Caveat** : floor `^0.8.10` permet 0.8.10/0.8.11 (sous le 0.8.12 advisory fix). Lockfile pin actuel = `0.8.13` = runtime safe. Recommandation : tighten à `^0.8.12` post-launch.

### Stack baseline (unchanged)

Les versions principales mobile **n'ont pas bougé** au sprint (sauf RN Pods iOS). Pour mémoire :

```
react-native@0.83.6
expo@^55.0.11
expo-router@~55.0.10
@sentry/react-native@^8.9.1   ← bumped 8.7→8.9.1, ADR-027
@maplibre/maplibre-react-native@11.0.0
@tanstack/react-query@^5.99.2
react-native-reanimated@4.2.1
axios@^1.15.1
zustand@^5.0.12
```

**Note RN bump** : la "0.83.4 → 0.83.6 bump" était **iOS Pods only**. `package.json` était déjà à 0.83.6 avant.

---

## museum-web

### Dev added

#### `@playwright/test@^1.49.0`

**Pourquoi :** Phase 3 e2e admin web. 4 admin flow specs (admin-login, users, audit-logs, reports-moderation).

#### `@axe-core/playwright@^4.10.0`

**Pourquoi :** Phase 3 a11y suite. 6 specs WCAG 2.1 AA contre 3 routes publiques + 3 routes admin.

#### `pg@^8.13.0` + `@types/pg@^8.11.0`

**Pourquoi :** utilisé **uniquement en E2E `globalSetup`** pour `UPDATE users SET role='admin'` post-register (afin de pouvoir tester les routes admin).

Pas un usage runtime dans museum-web (qui n'a pas de DB direct, juste des appels API au backend).

#### `openapi-typescript@^7.13.0`

**Pourquoi :** miroir du script FE `generate:openapi-types`. Permet à museum-web aussi de générer ses types depuis l'OpenAPI spec backend.

#### `prettier@^3.8.3`

**Pourquoi :** formatter pour la sortie de `openapi-typescript`. Standard.

### TypeScript downgrade `^6.0.3 → ~5.9.3`

ADR-032 — alignment monorepo. Avant le sprint, museum-web utilisait TS 6.x (beta-ish). Aligné à 5.9 LTS comme BE et FE.

**Conséquence** : pas de breakage observé. TS 5.9 est stable, 6.x apportait peu pour Musaium.

---

## design-system

**Aucun changement.** Reste sur `tsx@^4.19.0` + `typescript@^5.7.0`.

---

## tools/eslint-plugin-musaium-test-discipline

Brand-new workspace package créé ce sprint. Version `0.1.0`. Peer `eslint >=8 <11`. Ships :
- 2 enforcement rules : `no-inline-test-entities`, `no-undisabled-test-discipline-disable`.
- Ast-grep YAML rules.
- Cap test enforcing `PHASE_0_CAP = 0`.

Détaillé en [doc 16 — Phase 7](./16-bloc-7-tests-phases-0-11.md#phase-7--factory--shape-match-eslint-plugin).

---

## Critical CVE fixes

| Fix | Status | Resolution |
|-----|--------|-----------|
| GHSA-w5hq-g745-h8pq (uuid <14) | **Accepted as non-applicable** | Override added then removed. Pin `^11.1.0` direct. |
| @xmldom/xmldom 0.9.x breaks expo prebuild | **Tightened override** | `^0.8.10`, recommend tighten to `^0.8.12` |
| protobufjs CVE-2023-36665 | **Defensive override kept** | `>=7.5.5` |
| LangChain stack 3 CVEs 2024-2025 | **Renovate pinning** | LangChain pinned, manual review at minor |

---

## Pourquoi c'est pertinent pour Musaium

### Discipline supply-chain

3 nouveaux packages runtime BE (`langfuse`, `prom-client` + leur deps) = 3 nouveaux risques supply-chain. Renovate (cf. doc 06) + audit `pnpm audit --prod` les surveille.

### Convergence stack

TS aligné `5.9.x` partout. zod 3/4 toléré FE/BE séparé (justifié). ESLint à harmoniser plus tard (ADR-010 deferred). Plus on converge, moins on a de surface "ça marche en BE mais pas en FE".

### Coût pnpm install

Ajouter ~10 packages = `pnpm install` un peu plus lent (~2-5 sec en plus). Acceptable.

---

## Est-ce overkill ?

**Non.** Chaque ajout est tracé, justifié, et chaque override slim ferme une dette de maintenance.

Le seul vrai faux pas = uuid override hâtif. Honest, documenté, reversed.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Re-run `pnpm install` après pull | Standard |
| Vérifier que les 4 nouveaux packages BE buildent en Docker prod | Au prochain CI |
| Tighten `@xmldom/xmldom` à `^0.8.12` | Backlog post-launch (1 ligne) |
| Surveiller Renovate PRs pour les bumps minor LangChain | Au cas par cas, manual review |
| Lire les ADRs 029/032/033 | Pour comprendre les décisions de version |

---

## Anti-pattern à éviter à l'avenir

**Ne JAMAIS ajouter un override CVE sans vérifier que la CVE s'applique à ton usage**. La leçon uuid est claire : la CVE peut concerner une fonction de la lib que tu n'utilises pas. Override = pure complication, zero gain.

Procédure correcte :
1. CVE annoncée.
2. Lire la description : quelle fonction est touchée ?
3. Grep ton codebase : utilises-tu cette fonction ?
4. Si non → mark as "non-applicable", documenter dans `package.json` ou un ADR.
5. Si oui → override OU upgrade.

Cette procédure aurait évité le faux pas uuid.
