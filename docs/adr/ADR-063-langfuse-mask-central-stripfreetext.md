# ADR-063 — Langfuse central `mask` au ctor (`stripFreeText`) comme standard observabilité cross-app

> Renumbered from ADR-061 → ADR-063 on 2026-05-22 to avoid clash with the
> already-merged ADR-061 (I-SEC8 artwork-knowledge reclassification) from
> PR #294. Filename, content and decision are otherwise unchanged.


**Status:** Accepted
**Date:** 2026-05-21
**Run:** 2026-05-21-p0-c1-pii-egress
**Closes:** P0.A4 (Langfuse `mask:` SDK option NOT wired). Subsumes the cross-app default for any future Langfuse SDK instantiation (BE today ; FE/Web if either ever wraps `langfuse-core`).

---

## Context

Le pipeline observabilité Musaium émet vers Langfuse (`cloud.langfuse.com` par défaut) deux familles d'observations :

1. **Spans hand-codés** via `withLangfuseTrace` + `safeTrace` sur les 4 paths LLM non-LangChain (judge, TTS, STT, LLM-Guard) — `metadata` est contraint à la source à des champs PII-safe (`museumId`, `intent`, `locale`, `tier`, `requestId`, `inputLength`, `estimatedCostCents`).
2. **Auto-capture LangChain** via `langfuse-langchain.CallbackHandler({root, updateRoot:true})` attaché par `attachLangChainCallback` sur chaque `chat.invoke()`. Ce handler capture **automatiquement** `input.messages[*].content` (prompt user) et `output.text` (LLM completion) à chaque LLM call (`langfuse-langchain` v3.38.0 `handleLLMEnd` convention).

Avant ce run, le ctor `new Langfuse({ publicKey, secretKey, baseUrl, flushAt, flushInterval })` (`museum-backend/src/shared/observability/langfuse.client.ts:57-69`) **n'avait pas** la clé `mask` câblée. Conséquence : tout `LANGFUSE_ENABLED=true` (default `false` `config/env.ts:264`, mais activable ops-side) shippait les prompts utilisateur et complétions LLM **non maskés** vers Langfuse. Vecteur PII direct (OWASP LLM07 — PII via tracing ; GDPR Art. 5 §1.c — data minimisation ; CNIL recommandation 2022-06-23 sur observabilité).

`lib-docs/langfuse/LESSONS.md` LF-V3-05 (2026-05-18) classait initialement « no `mask` hook » en **LOW deferred**, raisonnant les spans hand-codés (déjà PII-safe à la source). Cette analyse **n'avait pas valorisé** que LF-V3-02 closing (2026-05-18 — CallbackHandler wiring) avait *ré-ouvert* le vecteur PII via les input/output auto-capturés. Le run `/team 2026-05-21-p0-c1-pii-egress` corrige cette mis-évaluation et reclasse LF-V3-05 en P0 CLOSED (`lib-docs/langfuse/LESSONS.md:49`).

Les forces en présence :

- **Langfuse SDK contract** — `langfuse-core@3.38.20` expose `mask?: MaskFunction` dans `LangfuseCoreOptions` (`lib/index.d.ts:6966`), avec signature `type MaskFunction = (params: { data: any }) => any` (`:7126-7128`). Le hook est appliqué **centralement** par `maskEventBodyInPlace` (`:7407`) sur chaque event/observation body **avant le transport SDK**. C'est **le seul endroit canonique** pour gater l'egress.
- **Defense-in-depth requirement** — un decorator adapter-level (style `CachingChatOrchestrator` ADR-036) serait fragile : il faudrait wrapper chaque caller LangChain individuellement, et tout nouveau caller régresserait silencieusement. Le mask central garantit qu'aucun event Langfuse ne peut sortir sans passer par `stripFreeText`.
- **Fail-safe requirement** — Langfuse SDK applique le mask **synchroniquement** dans `maskEventBodyInPlace`. Si le mask throw, le caller (chain.invoke) peut le voir remonter selon le path SDK. UFR (chat path stability) impose que `mask exception ≠ chat path break`.
- **Cost UI preservation** — Langfuse calcule `cost_usd_estimate` depuis `usage.*` / `usageDetails.*` + catalog model. Le mask **ne doit PAS** toucher `usage`, `usageDetails`, `model`, `metadata.*` (où vivent `museumId`, `tier`, etc.).
- **KISS / DRY / hexagonal** — FE/Web ne wrappent **pas** Langfuse côté client aujourd'hui (vérifié : aucun `from 'langfuse'` dans `museum-frontend/` ni `museum-web/`). Mutualiser `stripFreeText` dans `@musaium/shared` ajouterait du couplage cross-app pour zéro consommateur. KISS = vivre BE-only ; à reconsidérer si un FE/Web Langfuse consumer apparaît.

---

## Decision

**`mask: stripFreeText` est câblé directement au ctor `new Langfuse({ … })` comme `MaskFunction` Musaium-canonical. C'est l'unique exit-path PII pour Langfuse cross-app — aucun caller LangChain ou hand-codé ne contourne le mask. `stripFreeText` est fail-safe (idempotent + try/catch + logger.warn).**

### D1 — Mask au ctor, jamais en decorator adapter-level

Le mask est passé au constructeur `new LangfuseCtor({ …, mask: stripFreeText })` (`museum-backend/src/shared/observability/langfuse.client.ts:68`). C'est **le seul point d'enforcement** : `langfuse-core` applique `maskEventBodyInPlace` (`langfuse-core@3.38.20 lib/index.d.ts:7407`) sur chaque event/observation body avant transport SDK. Aucun decorator adapter-level (style ADR-036 `CachingChatOrchestrator` retired) n'est ajouté — la centralité du hook ctor rend tout decorator redondant et fragile.

Conséquence : **toute future instanciation Langfuse cross-app (FE/Web hypothétique) DOIT passer le même `stripFreeText` (ou équivalent fail-safe respectant la même contract).** Cf. D5 ci-dessous pour le path de mutualisation si un 2e consommateur émerge.

### D2 — `stripFreeText` est fail-safe par contrat (try/catch + retour `data` inchangé + `logger.warn`)

`museum-backend/src/shared/observability/strip-free-text.ts:258-286` (fonction `stripFreeText`) enroule la logique de scrub dans `try { … } catch (error) { logger.warn('langfuse_mask_failed', { … }); return params; }`. Garanties :

- **Idempotent** : appliquer `stripFreeText` deux fois consécutives ne change pas le résultat (R6).
- **Pas de PII dans le log** : seul `error.message` est loggé, **jamais** le `data` (qui vient justement de faire fail le mask).
- **Pas de bubble-up** : `maskEventBodyInPlace` ne reçoit jamais d'exception → `flush()` / `enqueue()` ne casse jamais le chat path. UFR-conform.

### D3 — Marker `'[STRIPPED]'`, distinct de Sentry `'[redacted]'`

`stripFreeText` remplace les portions free-text par le marker littéral `'[STRIPPED]'`. Choix d'un marker **distinct** de Sentry's `'[redacted]'` (`packages/musaium-shared/src/observability/sentry-scrubber.ts:65`) pour éviter ambiguïté à la lecture des logs Langfuse vs Sentry. `'[STRIPPED]'` est le marker idiomatic Musaium pour PII Langfuse ; pas de collision (vérifié grep codebase). Préserve la lisibilité humaine du payload Langfuse.

### D4 — `stripFreeText` couvre les shapes LangChain + paths manuels, préserve metadata/usage/model

Shapes scrubbées :
- LangChain `CallbackHandler` : `data.input.messages[*].content` (string scalar OU array de content parts), top-level `data.messages` defensive branch.
- Paths manuels (hand-coded spans potentiels) : `data.input.prompt`, `data.input.text`, `data.output.text`, `data.output.completion`, `data.output.content`.

Préservés **byte-pour-byte** : `messages[*].role`, `messages[*].name`, `data.model`, `data.usage.*`, `data.usageDetails.*`, `data.metadata.*` (où vivent `museumId`, `intent`, `locale`, `tier`, `requestId`, `inputLength`, `estimatedCostCents`). Cost UI Langfuse continue de fonctionner ; trace tree shape inchangé.

### D5 — `stripFreeText` reste **BE-only** pour ce run (KISS)

FE/Web n'instancient pas Langfuse côté client. Mutualiser dans `@musaium/shared/observability` ajouterait du couplage cross-app pour zéro consommateur (UFR-001 — pas de minimal fix prématuré). À reconsidérer **uniquement** si un 2e consommateur Langfuse apparaît (FE Langfuse v3 client OU Web admin Langfuse SDK). Le path de migration : déplacer `strip-free-text.ts` vers `packages/musaium-shared/src/observability/strip-free-text.ts`, ajouter un sentinel parity équivalent à `sentry-scrubber-parity.mjs`, re-exporter depuis BE.

### D6 — Pas de feature flag `MASK_PII_ENABLED`

Conforme UFR-015 (no feature flags pre-launch). Le mask ship LIVE. Rollback = `git revert <merge-sha>` + redeploy. `LANGFUSE_ENABLED` reste un flag pré-existant (gating de tout Langfuse, default `false` `config/env.ts:264`) ; il n'y a **pas** de flag spécifique au mask. Si `LANGFUSE_ENABLED=false`, `getLangfuse()` early-return → mask jamais instancié (R9, 0 µs overhead).

### D7 — Sentinel CI obligatoire pour tout futur consommateur Langfuse

Tout futur caller `new Langfuse({ … })` ou `new LangfuseCore({ … })` cross-app DOIT passer le `mask`. Enforcement post-V1 envisagé : ast-grep rule (à co-shipper avec un PR qui ajouterait un 2e Langfuse caller) qui refuse `new Langfuse({` sans clé `mask:` literal. Pas wiré aujourd'hui (un seul caller BE) — à wirer **dans le PR qui ajoute le 2e caller**, pas avant (KISS).

---

## Consequences

### Positives

- **Vecteur PII Langfuse fermé structurellement** : impossible pour un caller (LangChain auto-capture OU hand-coded span) de bypass le scrub. OWASP LLM07 + GDPR Art. 5 §1.c + CNIL 2022-06-23 — couverts pour le path Langfuse.
- **Cost UI préservée** : `usage.*` / `usageDetails.*` / `model` / `metadata.*` non touchés — le dashboard Langfuse cost continue de fonctionner.
- **Fail-safe garantit chat path stability** : exception du mask ne casse jamais le LLM call. UFR-conform.
- **Test seed-PII (R8) verrouille l'invariant** contre régression future (`museum-backend/tests/integration/observability/langfuse-pii-seed.test.ts`).
- **0 latence overhead quand `LANGFUSE_ENABLED=false`** (default) → pas de coût caché en environnement où Langfuse est OFF.

### Negatives

- **`metadata` non couvert par le mask** — assumption design (callers Musaium n'écrivent que des champs PII-safe dans `metadata`) **non enforced**. Risque : un futur caller ajoute `metadata.userEmail` accidentellement et la PII traverse. **Suivi** : `TD-OBS-PII-METADATA-ALLOWLIST` (LOW, NON_BLOCKER) — ajouter sentinel OU assertion runtime côté caller.
- **`scrubRecord` recursion sans cycle/depth cap** — Sentry-scrubber traversal est aujourd'hui structurellement défendu par le contrat JSON Sentry, mais defense-in-depth manquante. **Suivi** : `TD-OBS-SCRUBRECORD-CYCLE-HARDENING` (LOW, NON_BLOCKER) — ajouter `WeakSet` seen-guard + `MAX_DEPTH=10`.
- **Coupling `stripFreeText` ↔ `langfuse-core MaskFunction` signature** — si Langfuse v4 change la signature `MaskFunction`, il faudra adapter `stripFreeText`. Risque borné par le pin `langfuse@3.38.20` + `langfuse-langchain@3.38.0` (cf. `lib-docs/INDEX.json`) ; ADR-050 acte le V3-EOL stance jusqu'à H1 2026.
- **`MaskFunction` parameter type = `any`** — la signature SDK est `(params: { data: any }) => any` (`langfuse-core@3.38.20 lib/index.d.ts:7126-7128`). Notre wrapper accepte donc `any`. Un `eslint-disable @typescript-eslint/no-explicit-any` byte-conform SDK est appliqué dans `strip-free-text.ts` (Justification: + Approved-by: per LINT_DISCIPLINE.md, declared dans phase=green deviation #1).

### Neutres

- **Aucune migration DB / OpenAPI / contract API** — pure couche observability. Pas de regen FE types.
- **Aucun nouveau span / metric Prometheus émis** — le mask scrub, n'enrichit pas (cf. design.md §10).
- **Trace tree shape inchangé** côté Langfuse UI — seuls les champs free-text sont remplacés ; structure visible (sessions / generations / events) identique.

---

## Alternatives considered

| Alternative | Rejection reason |
|---|---|
| **(a) Decorator adapter-level qui wrappe chaque caller LangChain individuellement** | Fragile (chaque nouveau caller régresse silencieusement) ; n'utilise pas le hook SDK central conçu pour ce use-case ; duplicate de logique. Rejet. |
| **(b) `mask` qui throw au lieu de fail-safe (`return data`)** | Casse le chat path sur la moindre data malformée (Symbol, Proxy throw, cycle). UFR (chat path stability) interdit. Rejet. |
| **(c) Marker `'[REDACTED]'` partagé avec Sentry** | Ambiguïté à la lecture des logs Langfuse vs Sentry (impossible de savoir quel scrubber a tagué). `'[STRIPPED]'` distinct = lisibilité humaine + grep distincte. Rejet. |
| **(d) Mutualiser `stripFreeText` dans `@musaium/shared` dès maintenant** | Zéro consommateur FE/Web aujourd'hui. UFR-001 (no minimal fix prématuré) + KISS. Migrer **uniquement** quand un 2e consumer apparaît. Rejet pour ce run, accepté pour le futur (D5 path explicite). |
| **(e) Feature flag `MASK_PII_ENABLED`** | UFR-015 — no feature flags pre-launch. Rollback = `git revert`. Rejet. |
| **(f) Presidio sidecar dual-pass regex+ML PII detection (WebSearch Wave 2 §1 recommendation)** | Out of scope C1 — couvre déjà 95% RGPD V1 sans sidecar (cf. roadmap NOW C9.8 — Presidio adapter wired conditional `chat-module.ts:11,441-445`, manque sidecar Dockerfile, decision V1.1 OR V1 si pivot scale). À reconsidérer V1.1 si telemetry montre un gap free-text non couvert par le simple `stripFreeText`. Deferred V1.1. |

---

## References

- **Run artefacts** : `team-state/2026-05-21-p0-c1-pii-egress/{spec.md,design.md,tasks.md,STORY.md}`, code review `code-review.json` (APPROVED 96.25).
- **Lib reference** :
  - `langfuse-core@3.38.20 lib/index.d.ts:6966` — `mask?: MaskFunction` sur `LangfuseCoreOptions`.
  - `langfuse-core@3.38.20 lib/index.d.ts:7126-7128` — `type MaskFunction = (params: { data: any }) => any`.
  - `langfuse-core@3.38.20 lib/index.d.ts:7407` — `private maskEventBodyInPlace` central application.
  - `langfuse-langchain@3.38.0` — `CallbackHandler({root, updateRoot:true})` auto-capture wiring (`museum-backend/src/shared/observability/langfuse-langchain.ts:57-68`).
- **Impl** :
  - `museum-backend/src/shared/observability/langfuse.client.ts:68` (`mask: stripFreeText` ctor wiring).
  - `museum-backend/src/shared/observability/strip-free-text.ts:68-286` (helpers + `stripFreeText` impl + R7 fail-safe).
  - `museum-backend/tests/integration/observability/langfuse-pii-seed.test.ts` (R8 invariant lock).
  - `museum-backend/tests/unit/observability/{strip-free-text,langfuse-mask-ctor-wiring}.test.ts` (R5/R6/R7 unit coverage).
- **Lib-docs** :
  - `lib-docs/langfuse/LESSONS.md:49` — LF-V3-05 RECLASSED P0 → CLOSED 2026-05-21.
  - `lib-docs/langfuse/PATTERNS.md` §2.1 (mask ctor option) + §3 DO #13 (central mask) + §8.1 (trace tree shape unaffected).
- **Cross-ADR** :
  - ADR-045 — shared observability package extraction (sentry-scrubber lives in `@musaium/shared` ; ce ADR-063 NE migre PAS `strip-free-text` cross-app — voir D5).
  - ADR-050 — accept Langfuse v3 EOL (pin `langfuse@3.38.20` justifié H1 2026).
  - ADR-058 — selective hexagonal ports policy (observability est cross-cutting, pas domain port — `stripFreeText` vit shared/observability/, pas dans un `*.port.ts`).
- **Tech debt suivi** :
  - `TD-OBS-PII-METADATA-ALLOWLIST` (`docs/TECH_DEBT.md`) — LOW follow-up, defense-in-depth metadata allow-list.
  - `TD-OBS-SCRUBRECORD-CYCLE-HARDENING` (`docs/TECH_DEBT.md`) — LOW follow-up, scrubRecord recursion cycle/depth cap.
- **Roadmap** : P0.A3 + P0.A4 + P0.A9 + « Sécurité hardening V1.1 : Sentry event.tags walked by scrubEvent » → `[x]` shipped 2026-05-21 (`docs/ROADMAP_PRODUCT.md`).
