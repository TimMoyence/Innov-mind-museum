# FINAL REPORT — Audit 360° Musaium

**Pour** : Tim
**De** : Claude Opus 4.7 (1M ctx) — pilote multi-agents
**Date** : 2026-05-13 (audit nocturne ~8h)
**Budget** : 31 fresh-context agents, ~280 web searches, ~3000 tool calls
**Verdict global** : **GO V1 sous conditions** | **STOP 100k sans 4-6 semaines infra**

---

## 0. TL;DR (à lire en premier)

**Le code de Musaium est bon, l'architecture est bonne, la discipline qualité est bonne.** Banking-grade par endroits (audit chain, JWT, supply chain). Au-dessus de la médiane d'une pré-launch B2C.

**MAIS** : tu as **14 bugs/blockers concrets** à fixer en 19 jours avant 2026-06-01 (~5-7 jours de travail concentré). Ils sont sourcés file:line par les agents forensiques.

**ET** : tu n'es **PAS scalable à 100k MAU** dans le code actuel. Trois bottlenecks structurels — `pg_advisory_xact_lock` sérialise tous les audit writes (50-200/s plafond), `LLM Guard sidecar` cap 8 inflight, `DB_POOL_MAX=50` sans PgBouncer. Capacité courante = ~5-10k MAU. Atteindre 100k = **4-6 semaines de travail infra** sur V1.1+V1.2 (PgBouncer + replica + Cloudflare + sidecar scaling + audit chain Merkle redesign).

**ET ENCORE** : EU CRA t'oblige à publier VDP avant **2026-09-11**, EU AI Act Art. 53 GPAI avant **2026-08-02**. EAA WCAG 2.2 = €25k/an d'amende si non-conformant et plaintes commencent (premières mises en demeure FR nov 2025).

**Et sur 10 ans** : ton stack tient. Pas de lib mourante critique. TypeORM v1.0 + audit chain Merkle + WebAuthn V1.1 = path crédible.

**Score moyen pondéré** : V1 = **3.3/5** | 100k = **2.6/5** | 10y = **3.6/5**.

→ Aller à [§4 Plan 2 semaines](#4-plan-2-semaines-2026-05-13--2026-06-01) si tu veux juste agir.

---

## 1. Réalité du code (honnête)

### 1.1 Ce qui est **fort** (à garder, à célébrer)

| Domaine | Évidence |
|---|---|
| **Architecture backend hexagonale** | 24 entités, modules barrel/composition-root cohérents, alias `@modules/*`/`@shared/*`/`@data/*` discipliné. Hexagonal réel, pas marketing |
| **Audit chain SHA-256** | hash-chained avec `pg_advisory_xact_lock` (réf : `audit.repository.pg.ts:58`). Tamper-evident, EU AI Act Art. 12 prêt — mais sérialisé (cf §3) |
| **JWT algo-pinning** | Tous les `verify()` passent `algorithms: ['HS256']` explicit — **immune au cluster CVE 2026 Q1 algorithm-confusion** (Hono, HarbourJwt, Keycloak). C'est rare et c'est bien |
| **Refresh token rotation** | Reuse detection + family revocation + sliding window + Stryker mutation-pinned. Solide |
| **CSRF signed double-submit HMAC** | Pas le naïve. HMAC-SHA256 lié au access token, SameSite=Strict. **Au-dessus de l'industrie** |
| **AES-256-GCM TOTP at-rest** | Fresh 12B IV par appel. Correct |
| **HIBP k-anonymity** | Add-Padding + 2s timeout + fail-open + Sentry escalation. Correct |
| **Rate limiting Redis atomic Lua** | Sliding window, fail-CLOSED prod. Correct |
| **LLM Guard fail-CLOSED + breaker + semaphore + audit** | Restauré commit `e45490c1` 2026-05-12. **Architecturalement ahead-of-industry 2026** |
| **Promptfoo + Garak + smoke CI** | 85 prompts × 8 locales × 10 attack families weekly, smoke recall ≥80%. P0 = G1 (cf §3) mais la baseline est top |
| **OTel SDK v2 + Sentry + Langfuse cohabitation** | Hotfix 2026-05-12 `skipOpenTelemetrySetup: true` = correct per Sentry 2026 docs. RouterInstrumentation off (gotcha mémorisé) |
| **Prometheus 27 metrics cardinality-bounded** | Discipline rare. Pas de label-explosion |
| **CSP nonce per-request + strict-dynamic (web)** | Au-dessus médiane |
| **CycloneDX SBOM + cosign keyless + Rekor v2 + SLSA L3** | SLSA Build L3 effectif. CI signed. Solide |
| **Stryker mutation 89-100% (covered)** | Discipline élevée |
| **ESLint 10 + 7 plugins + custom `eslint-plugin-musaium-test-discipline` + `--max-warnings=0`** | Très strict. Bien |
| **393 BE tests + 220 FE tests + 29 web tests** | Coverage gates 91/78/80/91 enforced |
| **pgvector HNSW + halfvec_ip_ops + SigLIP ONNX** | Stack vector image SOTA 2026 (CLAUDE.md "IVFFlat" était stale, le code utilise déjà HNSW) |
| **8 locales mobile parité 100%** | `check-i18n-completeness.js` gate CI. 745 keys identiques sur en/fr/es/de/it/ja/zh/ar |
| **Migration discipline** | 56 migrations via `migration-cli.cjs`, transaction each, ADR-based |

### 1.2 Ce qui est **moyen** (à améliorer pas urgent)

| Domaine | État | Reco |
|---|---|---|
| **TypeORM 0.3.28** | Stable mais écosystème stale (last release mai 2025, v1.0 vaporware) | Keep V1. Log TD post-launch. |
| **Express 5.2.1** | ACTIVE LTS jusqu'≥2026-04, MAINTENANCE ≥2027-04 | Keep. Pas de Fastify avant Q4 2026 |
| **LangChain 1.1.45** | Past CVE-2025-68665 ; bump à 1.1.46 trivial | Bump. Add provider failover (Gemini 429 = #1 issue prod) |
| **Helmet 8.1** | Default CSP + HSTS preload 2y | OK |
| **bcrypt cost-12** | OWASP 2026 marque "legacy only" — Argon2id recommandé | Migrate rehash-on-login post-launch |
| **MFA TOTP only** | Pas de WebAuthn/passkeys | V1.1 admin web (B2B blocker) |
| **CSP `style-src 'unsafe-inline'`** (web) | Faiblit CSP pour CSS injection | Tighten post-launch |
| **Tailwind Labs 75% layoff jan 2026** | Risque long terme | Watch, Vercel+Google sponsoring annoncé |
| **Recharts 3.8** | SSR React 19 frictions | Workaround `'use client'` déjà appliqué dans `admin/analytics` |
| **Playwright 1.49 (web)** | 10 minor en retard (1.59 = AI healer, MCP) | Bump quand pratique |
| **Visual regression web** | Absent | Add Playwright `toHaveScreenshot()` |
| **MSW** | Absent | Add pour contract tests |
| **No staging server** | Pré-launch V1 doctrine acceptée (memory) | Keep, mais smoke local Docker discipliné |
| **iOS E2E per-PR** | Nightly seulement | Maestro Cloud iOS ($250/mo) ou Mac mini self-host |

### 1.3 Ce qui est **cassé / risqué** (à fixer)

**14 P0 launch blockers** (cf §3.1 pour détail file:line + patch suggéré) :
1. iOS 26 / A18 Pro crash (R11) — pas de fix amont. Soit fixer, soit ship Android-first
2. AI Act 5.1.2(i) breach : AiConsentModal ne nomme pas le provider AI
3. UIBackgroundModes=audio sans background playback réel
4. StoreButton href='#' (jamais overridé)
5. admin/users/[id] = stub `---`
6. Cert pinning `PLACEHOLDER_SPKI_HASHES_TBD_PROD`
7. chatSessionStore persiste messages plaintext AsyncStorage
8. Sharp `limitInputPixels` manquant (6 sites)
9. 3 TypeORM `.set({ field: undefined })` silent skip (password reset replayable, email change replayable, stale reset token)
10. `museum-frontend/android/sentry.properties:3 project=apple-ios` (maps Android misrouted)
11. HEIC mitigation undocumented (silent dep `imageUploadOptimization.ts:76`)
12. MFA page hard-coded English
13. RTL Arabic broken (8+ components left/right au lieu de start/end)
14. EAA non-conformant (€25k/an FR amende possible)

**6 P1 100k-scaling blockers** :
- Audit chain `pg_advisory_xact_lock` sérialise (50-200/s ceiling)
- LLM Guard sidecar 8 inflight saturé à 30 QPS (besoin 100k MAU)
- DB_POOL_MAX=50 sans PgBouncer
- No CDN devant OVH
- TTS cache `tts:<messageId>` (UUID) au lieu de content-hash
- Pas de per-user TTS budget cap (Denial-of-Wallet)

**10 P2 strategic / 10y** : EU CRA VDP, EU AI Act GPAI doc, EAA WCAG audit, Langfuse v3→v5, WebAuthn V1.1, Llama Prompt Guard 2 sidecar, audit chain Merkle redesign, Stripe pre-bake, pgBackRest archived (plan WAL-G), bcrypt→Argon2id.

---

## 2. Libs utilisées — verdict par couche

### 2.1 Backend (Node.js 22 / Express 5 / TypeORM / PG 16)

| Lib | Version | Verdict | Détail |
|---|---|---|---|
| Express | 5.2.1 | ✅ **KEEP** | ACTIVE LTS. Fastify 1.76× plus rapide mais workload Musaium dominé par LLM upstream (2-5s). Migration ROI négatif (6-10j dev pour 0 gain perçu) |
| TypeORM | 0.3.28 | ⚠️ **KEEP V1, watch** | Écosystème stale (last release 2025-05). v1.0 vaporware H1 2026. Drizzle = 6-10w migration. Pas urgent |
| PostgreSQL | 16 + pgvector ≥0.7 | ✅ **KEEP** | halfvec(768) + HNSW + halfvec_ip_ops = SOTA. PG 17 disponible mais 16 OK |
| Redis | (version à vérif) | ✅ **KEEP** | Single-node V1, cluster V1.2 (Sentinel) |
| LangChain.js | 1.1.45 | ✅ **KEEP, bump → 1.1.46** | Past CVE-2025-68665. Add manual provider failover |
| ONNX Runtime Node | 1.26 | ✅ **KEEP** | Pour SigLIP CPU inference |
| Sharp | 0.34.5 / libvips 8.17.3 | ✅ **KEEP** mais **PATCH limitInputPixels** | DoS vector sans patch |
| jsonwebtoken | (version à vérif) | ✅ **KEEP** | Algo-pinning manuel correct |
| argon2 | absent (bcrypt) | ⚠️ **MIGRATE post-launch** | OWASP 2026 = Argon2id |
| Helmet | 8.x | ✅ **KEEP** | CSP + HSTS preload correct |
| @sentry/node | 8.x ou 9.x | ✅ **KEEP** | Hotfix coexist OTel 2026-05-12 correct |
| @opentelemetry/sdk-node | v2 | ✅ **KEEP** | Migration v1→v2 faite 2026-05-12 |
| prom-client | 15.1.3 | ✅ **KEEP** | Cardinality-bounded. Add exemplars |
| @langfuse/tracing | 3.x | 🔴 **MIGRATE → v5** | v5 OTel-native, unifie trace tree, 4-6h effort |
| Stryker | 9.6 | ✅ **KEEP** | Excellent. Vérifier le 99.75% claim |
| ESLint | 10 + 7 plugins | ✅ **KEEP** | Discipline rare |
| Jest | 29 + SWC | ✅ **KEEP** | Jest 30 a memory leak régression. Pas de Vitest pour BE Node |
| k6 | OSS | ✅ **KEEP** | Pas de k6 Cloud / operator pré-launch. Scripts à refondre (R28) |
| opossum | 8.x | ✅ **KEEP** | Circuit breaker bien intégré |
| LLM Guard sidecar | Python protectai | ✅ **KEEP** | Best OSS choice. Scale horizontalement (cf F1) |
| protectai/llm-guard | latest | ✅ **KEEP** | Anonymize scanner = à vérifier P0 |

### 2.2 Mobile (React Native 0.83 / Expo 55)

| Lib | Version | Verdict | Détail |
|---|---|---|---|
| react-native | 0.83.6 | ⚠️ **KEEP, watch 0.86 GA** | 0.83 = End of Cycle officiel ; 0.86 rc.0 = 2026-05-07. Pas de fix iOS 26 amont |
| expo | ^55.0.11 | ✅ **KEEP** | SDK 55 GA 2026-02-25, canonique. SDK 56 = beta |
| expo-router | ~55.0.10 | ✅ **KEEP** | Routing solide |
| react | 19.2.0 | ✅ **KEEP** | Latest stable. React Compiler v1 actif (gains 12-30%) |
| hermes | V1 (Static Hermes proposé Meta) | ✅ **KEEP** | Stable |
| @shopify/flash-list | 2.0.2 | ✅ **KEEP** | v2 a regressions chat documentées issue #1844 — surveiller |
| **expo-image** | **ABSENT** | 🔴 **INSTALL P0** | 10 usages `<Image>` RN built-in = no disk cache, no blurhash, no AVIF |
| expo-audio | ^55.0.11 | ✅ **KEEP** | Mais `enableBackgroundPlayback=true` default = mismatch (cf F3) |
| react-native-reanimated | 4.2.1 | ✅ **KEEP** | Worklets correct |
| zustand | ^5.0.12 | ✅ **KEEP** | 5 selector ref-equality footgun (no `useShallow` audit) — fix avant V1 |
| @tanstack/react-query | ^5.99.2 | ✅ **KEEP** | + persist client + AsyncStorage. Allowlist OK |
| expo-secure-store | ~55.0.11 | ✅ **KEEP** | Keychain/EncryptedSharedPreferences. Add Class 3 biometric gate (5 lignes) |
| @react-native-async-storage/async-storage | 2.2.0 | ✅ **KEEP** | Pas MMKV pré-launch (peer dep churn, perf gap invisible @ workload Musaium) |
| react-native-ssl-public-key-pinning | ^1.2.6 | ✅ **KEEP** | Choix correct. **Mais SPKI placeholder = P0** (1j fix) |
| expo-local-authentication | ~55.0.13 | ✅ **KEEP** | Biometric flows correctes |
| @sentry/react-native | ^8.9.1 | ✅ **KEEP** | Mais `android/sentry.properties` bug P0 |
| i18next + react-i18next | 26.0.6 + 17.0.4 | ✅ **KEEP** | 8 locales parité 100% |
| axios | ^1.16.0 | ✅ **KEEP** | Single-flight refresh interceptor solide |

### 2.3 Web (Next.js 15 / React 19 / Tailwind 4)

| Lib | Version | Verdict | Détail |
|---|---|---|---|
| next | ^15.5.18 | ✅ **KEEP** | May-2026 coordinated CVE floor (CVE-2026-23869 +12). Defer Next 16 |
| react | ^19.2.0 | ✅ **KEEP** | Latest stable. Adopt useActionState + useFormStatus dans 3-4 admin forms |
| tailwindcss | ^4.1.8 | ⚠️ **KEEP, bump 4.3** | v4.3 = scrollbar/zoom/tab-size. Tailwind Labs layoff 75% jan 2026 = risk long terme |
| framer-motion | ^12.38.0 | ✅ **KEEP** mais rename → `motion/react` | Rebrand fin 2024 |
| recharts | ^3.8.1 | ✅ **KEEP** | Frictions SSR React 19 workaroundées |
| maplibre-gl | ^5.23.0 | ✅ **KEEP, bump 5.24** | Perf -40% halo/glyph |
| vitest | ^4.1.3 | ✅ **KEEP** | Latest 4. Browser Mode unadopted (pas urgent) |
| vite | ^8.0.7 | ✅ **KEEP** | Latest 8 |
| @playwright/test | ^1.49.0 | ⚠️ **BUMP → 1.59** | AI healer, MCP, screencast. 30min effort |
| @axe-core/playwright | ^4.10.0 | ✅ **KEEP** | mais coverage 6/17 routes seulement |
| @sentry/nextjs | ^10.49.0 | ✅ **KEEP** | Latest |
| jsdom | ^29.0.2 | ⚠️ **WATCH** | happy-dom 2-4× plus rapide. Pas urgent |

---

## 3. Algorithmes — verdict critique

### 3.1 Algos qui sont **bons**

- **HNSW + halfvec_ip_ops + SigLIP normalize [-1,1]** : SOTA recognition artwork 2026. Recall ≥ 0.85 (NFR). Migration SigLIP-2-base FixRes V1.1 = +2.4 pts ImageNet zero-shot pour +4.6 pts COCO R@1
- **JWT HS256 algo-pinning** : immune au cluster algorithm-confusion 2026 Q1
- **CSRF signed double-submit HMAC** : pas le naïve double-submit (subdomain takeover defeat-able), signé HMAC-SHA256 lié au access token
- **Sliding window rate limit Redis atomic Lua** : fail-CLOSED prod
- **Single-flight refresh token rotation** : avec reuse detection + family revocation
- **Hash chain audit SHA-256** : `prev_hash` chaîné, tamper-evident. Mais **sérialisé par mutex global** = bottleneck (cf §3.2)
- **HIBP k-anonymity + add-padding + 2s timeout fail-open** : correct
- **Three-layer guardrails** input keyword → LLM Guard sidecar → output keyword : defense-in-depth OWASP LLM07 ahead-of-industry

### 3.2 Algos qui sont **suboptimaux** (à corriger)

1. **Audit chain `pg_advisory_xact_lock(GLOBAL_KEY)`** — `audit.repository.pg.ts:58`
   - **Problème** : sérialise TOUS les audit INSERTs (cluster-wide). Plafond 50-200/s régardless CPU
   - **Impact** : 8-30× sous le throughput nécessaire @ 100k MAU
   - **Fix** : Crosby-Wallach Merkle pattern (R27) — 4 phases, ~1 sprint
     - Phase 1 : drop lock, switch PK UUIDv7, remove per-row prev_hash (1-2j)
     - Phase 2 : batcher 10s → Merkle root chaîné dans `audit_chain_batches` + PG triggers BEFORE UPDATE/DELETE (1-2j)
     - Phase 3 : daily Sigstore TSA anchor (3-5j, V1.1)
     - Phase 4 : monthly partitioning via pg_partman (1j, V1.2)
   - **Verdict** : algo correct mais design lock-based KO @ scale. Merkle batch = 2026 SOTA (Trillian, Sigstore Rekor, AWS QLDB, Azure SQL Ledger, immudb tous convergent)

2. **TTS cache key `tts:<messageId>`** (`text-to-speech.openai.ts`)
   - **Problème** : UUID-scoped, <5% hit rate, jamais dedup cross-user
   - **Fix** : re-key `tts:v1:<voice>:<speed>:<sha256(content)>` (ADR-036 amendment)
   - **Impact** : -30 à -58% TTS cost @ 100k MAU (validé F2)

3. **LLM cache exact-match only** (`LlmCacheServiceImpl`)
   - **Fix V1.1** : semantic L2 cache (Redis VL / LangCache) on top, threshold 0.88
   - **Impact** : +20-40 pp hit rate sur `generic` context class

4. **Sharp sans `limitInputPixels`** (`image-processing.service.ts:52,60,61` + 3 autres sites)
   - **Problème** : décompression bomb DoS vector. 3 MB PNG crafted → 268M pixels → 768 MB RAM
   - **Fix** : ajouter `{ limitInputPixels: 24_000_000, failOn: 'error' }` partout

5. **Cert pinning `PLACEHOLDER_SPKI_HASHES_TBD_PROD`** (`shared/config/cert-pinning.ts:34`)
   - **Problème** : aucune défense MitM en build prod actuel
   - **Fix** : extraire SPKI prod via OpenSSL + générer backup pin offline + flip env (1j runbook R13)

6. **TypeORM `.set({ undefined })` silently no-op** — 3 sites NON-patchés :
   - `user.repository.pg.ts:115-116` updatePassword — stale reset_token uncleared
   - `user.repository.pg.ts:139-140` consumeResetTokenAndUpdatePassword — **password reset token REPLAYABLE** (HIGH)
   - `user.repository.pg.ts:230-232` consumeEmailChangeToken — **email change token REPLAYABLE** (HIGH)
   - **Fix** : `field: () => 'NULL'` partout (pattern verifyEmail confirme la bonne approche). 3 lignes BE + 3 tests update + 2 e2e regression. Ajouter ESLint rule custom

7. **Sentry trace propagation cassée à API boundary** (F9)
   - Mobile/Web injectent `sentry-trace` header, backend parse W3C `traceparent` via OTel mais pas Sentry tracing → trace tree split
   - **Fix** : décider doctrine — soit Sentry propagator bridge BE, soit accepter split trace doctrine

### 3.3 Algos **manquants**

- **Per-user TTS budget cap** : Redis-Lua daily quota (anon 2 min, free 10 min, premium 60). Denial-of-wallet vector LLM10 OWASP
- **Per-user `/chat` rate limit** : Redis-backed, ~20 msg/min/user, en amont LLM Guard
- **Llama Prompt Guard 2 22M** : sidecar ML pre-filter, ~0.99 AUC, BERT CPU, 75% lower latency que 86M
- **Indirect injection corpus** : Wikidata grounding = surface, pas testée en CI
- **Multi-turn / Crescendo adversarial** : pas dans le corpus actuel
- **Garak REST target swap** : aujourd'hui Garak attaque `Phi-3-mini` PAS Musaium endpoint (ADR-049 Phase 1.5 planifié mais pas implémenté — le badge vert ne prouve rien)
- **Source code obfuscation** : pas nécessaire pour B2C cultural — Hermes bytecode = 80th-percentile defense
- **App Attestation (App Attest / Play Integrity)** : defer post-B2B revenue

---

## 4. Plan 2 semaines (2026-05-13 → 2026-06-01)

**Budget réaliste solo founder** = ~70-100h sur 19 jours.

### 4.1 Semaine 1 (J0-J7) — 14 P0 launch blockers

| Jour | Action | Effort | Source |
|---|---|---|---|
| J0 (today) | TypeORM `.set undefined` patches (3 fixes + tests) | 3h | F8 |
| J0 | Sharp `limitInputPixels: 24_000_000` (6 sites) | 1h | F4 |
| J0 | `android/sentry.properties` fix `project=apple-ios` → `musaium-android` | 15min | F9 |
| J1 | Cert pinning : extract SPKI prod via OpenSSL + backup pin + flip env | 1j | R13 |
| J1 | chatSessionStore : drop persist OU re-keyer avec SecureStore (Zustand) | 0.5j | F4, R12 |
| J2 | StoreButton : passer real hrefs (Apple TestFlight + Google internal track) | 30min | verified |
| J2 | admin/users/[id]/page.tsx : implémenter détail user (R+W back-API) | 1j | verified |
| J2 | RoleGuard : aligner JSDoc ou implémenter super_admin implicit promotion | 1h | F4 |
| J3 | UIBackgroundModes audit : soit retirer `audio` mode OU implémenter background TTS lock-screen | 0.5j | F3, F4 |
| J3 | AiConsentModal : ajouter "Powered by OpenAI/Deepseek/Google" (5.1.2(i) compliance) | 1h | F3 |
| J3 | install `expo-image` + migrer 10 usages `<Image>` | 1j | F4, R15 |
| J4 | MFA page i18n : extraire 20+ raw English strings vers dictionary | 0.5j | F10 |
| J4 | HEIC mitigation : documenter le dep silent OR ajouter au MIME allowlist | 30min | F4 |
| J5 | RTL Arabic : remplacer 8+ left/right par start/end + RTL render tests | 1j | F10 |
| J6 | Sentry alerts wiring (15 alerts non-provisioned per F9) | 0.5j | F9 |
| J6 | LLM Guard `Anonymize` scanner verify (P0 R4) | 1h | R4 |
| J7 | Promptfoo : Garak REST target swap to Musaium endpoint | 2j | F5 G1 |
| J7 | Stryker `99.75%` claim verify + update docs ou ratchet | 1h | F4 |

### 4.2 Semaine 2 (J8-J14) — CRA / VDP / EAA + iOS26 + ops

| Jour | Action | Effort | Source |
|---|---|---|---|
| J8 | Ship SECURITY.md + security.txt + /security page + VDP runbook (templates F6 prêts) | 5h | F6 |
| J9 | Ship SUBPROCESSORS.md (référencé par DPIA mais manquant) | 2h | R22 |
| J9 | Incident response runbook GDPR 72h + CRA 24h/72h/14d | 4h | R22, R30 |
| J10 | Lighthouse CI : `warn → error` thresholds (no_flags_prelaunch doctrine) | 30min | R18 |
| J10 | Cloudflare Free DNS swap : OVH origin behind CDN (zero-downtime DNS) | 2-3h | R21 |
| J10 | OVH backup drill image switch → `pgvector/pgvector:pg16` | 30min | R25 |
| J11 | EAA accessibility statement + axe-core extend 6→17 web routes | 1j | F10 |
| J11-J12 | iOS 26 crash : TurboModule isolation + TestFlight + iPhone 16/17 Pro physical hardware test | 2j | R11, F3 |
| J13 | EU AI Act Art. 53 GPAI doc draft (dû 2026-08-02 mais préparer maintenant) | 4h | R22 |
| J13 | App store listing : screenshots, privacy URL, demo account, age questionnaire | 0.5j | F3 |
| J14 | Final smoke (Docker compose local) + sanity check 14 P0 fixed | 0.5j | doctrine |

### 4.3 Semaine 3 (J15-J18) — Préparation submission + bake

| Jour | Action |
|---|---|
| J15 | App store submission (D-7) — TestFlight phased 1% |
| J16-J17 | Bake : monitoring 24/7, vérif Sentry alerts firing correctly, vérif tests AI prompt injection vert |
| J18 | Pre-launch checkpoint : tous P0 verts. Décision GO/NO-GO 2026-06-01 |

**Effort total estimé** : ~80h sur 18 jours = ~4.5h/jour. Tenable pour Tim solo si focus discipliné.

**Décision GO/NO-GO 2026-06-01** dépend de :
- ✅ Tous les 14 P0 verts
- ✅ iOS 26 crash : fixé OU décision Android-first
- ✅ App store soumis et accepté (Phased Release 1%)
- ✅ CDN devant + VDP publié + smoke OK

---

## 5. Plan post-launch (V1.1, V1.2 — 100k path)

### 5.1 V1.1 (2026-06 → 2026-08) — Hardening

| Sprint | Action | Source |
|---|---|---|
| 1 (2 sem) | Llama Prompt Guard 2 22M sidecar pre-filter | R4, F5 |
| 1 | LLM Guard horizontal `docker compose --scale 2` + per-user rate limit | F1 |
| 1 | TTS cache content-hash rekey + Redis-Lua daily cap | F2 |
| 2 | PgBouncer transaction-mode + `DB_REPLICA_URL` wire + DB_POOL_MAX 50→15 | R8 |
| 2 | Switch LLM default model → gpt-4.1-nano (3× cheaper) | R23 |
| 2 | Langfuse v3 → v5 OTel-native | R6 |
| 3 | WebAuthn admin web (passkeys sole-factor AAL2 + TOTP fallback) | R26 |
| 3 | Audit chain Merkle batch redesign Phase 1+2 (drop mutex) | R27 |
| 4 | k6 5 new TS scripts + data pools + CI gate | R28 |

**Deadline EU CRA reporting** : 2026-09-11 — VDP, ENISA SRP onboarding, 24h/72h/14d runbook. Doit être 100% prêt avant.
**Deadline EU AI Act Art. 50 + GPAI** : 2026-08-02 — Art. 50 déjà shipped, Art. 53 GPAI doc à écrire.

### 5.2 V1.2 (2026-09 → 2026-12) — Scale

- Sentinel Redis cluster
- Stripe activation B2B pilot (architecture pre-bake J5-J9 V1)
- Audit chain Phase 3 Sigstore TSA anchor + Phase 4 partitioning
- SigLIP-2-base FixRes drop-in upgrade
- Maestro iOS Cloud per-PR
- pgBackRest → WAL-G migration (pgBackRest archivé avril 2026)
- bcrypt → Argon2id (rehash-on-login)
- Mobile RN passkeys

### 5.3 V2.0 (2027+) — Enterprise

- Multi-region (B2B sales-driven)
- TypeORM v1.0 migration (si shipped) OU Drizzle (si v1 GA mature)
- React Native New Architecture full audit
- SOC 2 Type 1
- B2B SSO (SAML/OIDC)

---

## 6. Verdict enterprise-grade et 10 ans

### 6.1 100k clients — peut-on tenir ?

**Réponse honnête : NON aujourd'hui, OUI avec V1.1 + V1.2 = 4-6 semaines de travail infra.**

| Test | Capacité actuelle estimée | Capacité 100k requise | Gap |
|---|---|---|---|
| Audit chain writes/s | 50-200 | 1500-6000 | 8-30× |
| LLM Guard sidecar QPS | 8-15 burst | 30 sustained | 2-4× |
| DB connections | 50 × 2 workers = 100 | 200 effective | 2× (PgBouncer) |
| Chat p95 latency | 3-6s | <6s | OK (LLM-dominé) |
| Image processing p95 | 1.2-2.5s | <3s | OK |
| CDN bandwidth | 0 (direct origin) | 10TB/mo | Cloudflare |

Coût @ 100k MAU = **€2200-2900/mo** (LLM 40-60%, infra ~€900, CDN R2 ~€170, OpenAI TTS €1000-1500). Voir R24 pour modèle complet.

### 6.2 No leak / no data loss / no flux loss — vérification

| Risque | État actuel | Mitigation existante | Reste à faire |
|---|---|---|---|
| **Secrets leak (code/git)** | ✅ Sain | `.env` gitignored, JWT secrets ≥32 chars validés au boot, cosign verify pré-deploy | Add `gitleaks` pre-commit hook |
| **Data loss (DB)** | ⚠️ Drill cassé | pg_dump daily + GPG + S3 + monthly drill | **Drill image manque pgvector** → migrate `pgvector/pgvector:pg16`. Add audit chain integrity check post-restore |
| **Data loss (audit chain)** | ⚠️ Single-VPS | Hash chain tamper-evident | Wire DB_REPLICA_URL + S3 offsite 2e copie + WAL archiving 5min |
| **PII leak (logs)** | ✅ Solide | Sentry PII scrubber dans 3 apps, sendDefaultPii: false, sensitive headers filtrés | Backfill ADR-045 (référencé mais inexistant) |
| **Token leak (mobile)** | ⚠️ Cert pinning OFF | expo-secure-store correct, biometric gate | **Flip cert pinning ON avec real SPKI** = P0 |
| **Audit log loss** | ⚠️ Single PG | pg_advisory_xact_lock + hash chain | Migration Merkle batch + S3 stream (R27) |
| **Chat message leak (mobile)** | 🔴 Plain-text Async | -- | chatSessionStore re-key SecureStore OR drop persist = P0 |
| **DoS via image upload** | 🔴 limitInputPixels missing | Multer 3MB cap (nécessaire pas suffisant) | Add Sharp limitInputPixels = P0 |
| **Replay attacks reset/email change** | 🔴 TypeORM .set undefined | -- | 3 patches `() => 'NULL'` = P0 |

**Verdict** : 4 leaks/data-loss vectors P0 ouverts aujourd'hui. Plan 2 semaines les ferme tous.

### 6.3 Tient-il 10 ans ?

**Réponse honnête : OUI, sous réserve de 3 migrations majeures**.

**Bases solides (10-year safe)** :
- PostgreSQL 16/17 — tient 10 ans facile
- Node.js 22 LTS jusqu'≥2027-04, puis 24/26 path
- Hexagonal architecture — pas dépendant de framework
- Audit chain Merkle (post-redesign) — patterns Trillian/Sigstore/AWS QLDB sont 10y-stables

**Migrations probables/inévitables sur 10 ans** :
1. **TypeORM** : si v1.0 ne ship pas en 2026, migration Drizzle vers H2 2027 (6-10w effort)
2. **React Native version cycle** : RN 0.83 EOL, next 0.86 GA juin 2026. Path standard upgrade-by-upgrade. Risque iOS/Android changement OS majeur (iOS 27 ARM64e enforcement ?)
3. **LLM provider mix** : OpenAI tarification volatile. Multi-provider failover + nano-tier routing déjà sur la table. Pas un risque structurel mais opérationnel

**Risques 10y identifiés** :
- Tailwind Labs 75% layoff jan 2026 — si abandon, migration vers CSS pure ou vanilla-extract (~2-4w)
- LangChain.js ecosystem volatility — déjà mitigé par surface minimale chez Musaium
- EU regulatory creep — CRA, AI Act, EAA, DSA — il faut un budget compliance permanent (~1-2w/quarter)
- Solo-founder dependency — Tim seul = bus factor 1. Documentation déjà disciplinée, mais hiring inevitable post-revenue

**Score 10y-sustain : 3.6/5** — stack solide, mais 3 chantiers migration majeurs prévisibles + budget compliance permanent.

---

## 7. Best patterns (à célébrer + à généraliser)

1. **`/team` Spec Kit** — spec.md + design.md + tasks.md par feature non-trivial. Dispatch CLAUDE.md cite. Pattern rare et excellent
2. **ADR-driven decisions** — 37+ ADRs avec immutabilité + revert via `git log`. Best practice
3. **CLAUDE.md / AGENTS.md / GitNexus integration** — l'index du knowledge, le piège-mémoire, l'impact-analysis avant edit. Discipline exemplaire
4. **Audit chain hash-chained** (concept correct, fix le mutex et c'est SOTA)
5. **3-layer guardrails AI** (input → sidecar → output)
6. **Coverage gates ratchet** — `as-any=0` + `tests=3805` baseline qui ne peut grandir. Pression continue
7. **`eslint-plugin-musaium-test-discipline`** — custom rule pour bloquer inline test entities
8. **Honesty doctrine UFR-013** — non-negotiable, applied par Claude lui-même cet audit
9. **Sentry PII scrubber dans 3 apps** mirrored — discipline cross-app
10. **CSP nonce per-request avec strict-dynamic** — au-dessus médiane

## 8. Patterns à introduire (manquants)

1. **Llama Prompt Guard 2 22M sidecar** comme ML pre-filter — orthogonal aux keyword filters
2. **Crosby-Wallach Merkle batch audit chain** — pattern Trillian
3. **Per-user budget caps** (chat tokens + TTS minutes + image uploads) — Redis-Lua
4. **Semantic LLM cache L2** au-dessus de exact-match — RedisVL threshold 0.88
5. **VDP + SECURITY.md + RFC 9116 security.txt** — disclosure infra
6. **Content-hash TTS cache key** — dedup cross-user
7. **Sigstore TSA anchor** sur audit chain — eIDAS-grade non-repudiation
8. **PgBouncer transaction-mode** — connection pool scale
9. **Cloudflare in front** — CDN + WAF + DDoS basic
10. **Stripe webhook idempotency key store Redis TTL=30j** — pas 24h, Stripe retry 3 jours

---

## 9. Risk Heat Map consolidé

| # | Risque | Sév | Impact | Prob | Fichier:ligne | Mitigation | Délai |
|---|---|---|---|---|---|---|---|
| 1 | iOS 26 / A18 Pro crash | 🔴 P0 | Catastrophe | Élevée | `museum-frontend/docs/IOS26_CRASH_DIAG.md` | Fix OR Android-first | 19j |
| 2 | TypeORM .set undefined replayable tokens | 🔴 P0 | Données sécurité | Confirmée | `user.repository.pg.ts:115,139,230` | 3 patches `() => 'NULL'` | 3h |
| 3 | Sharp limitInputPixels DoS | 🔴 P0 | DoS prod | Élevée | `image-processing.service.ts:52,60,61` ×2 | Ajouter option (6 sites) | 1h |
| 4 | Cert pinning placeholder SPKI | 🔴 P0 | MitM | Faible-Moyenne | `shared/config/cert-pinning.ts:34` | Extract real SPKI + flip env | 1j |
| 5 | chatSessionStore plaintext | 🔴 P0 | GDPR | Confirmée | `chatSessionStore.ts:50,91` | SecureStore OR drop persist | 0.5j |
| 6 | AiConsentModal AI provider non nommé | 🔴 P0 | App Store rejet | Élevée | `shared/locales/en/translation.json` | Add "Powered by OpenAI/..." | 1h |
| 7 | UIBackgroundModes mismatch | 🔴 P0 | App Store rejet | Moyenne | `ios/Musaium/Info.plist:86-89` | Retirer audio OR implémenter | 0.5j |
| 8 | StoreButton href='#' | 🔴 P0 | UX cassé | Confirmée | `LandingDownloadCTA.tsx:57-58` | Passer real hrefs | 30min |
| 9 | admin/users/[id] stub | 🔴 P0 | Admin cassé | Confirmée | `app/[locale]/admin/users/[id]/page.tsx` | Implémenter détail user | 1j |
| 10 | expo-image absent | 🔴 P0 | Perf jank | Confirmée | 10 sites `<Image>` RN | npm i expo-image + migrer | 1j |
| 11 | sentry.properties Android bug | 🔴 P0 | Crash maps misroutées | Confirmée | `android/sentry.properties:3` | Fix `project=musaium-android` | 15min |
| 12 | RTL Arabic broken | 🔴 P0 | UX cassé 1/8 locales | Confirmée | 8+ components physical left/right | Remplacer start/end | 1j |
| 13 | MFA page hard-coded English | 🔴 P0 | i18n gap | Confirmée | `admin/mfa/page.tsx:69-164` | Extract to dictionary | 0.5j |
| 14 | EAA non-conformant | 🔴 P0 | €25k/an FR | Moyenne | -- | Accessibility statement + axe-core 6→17 routes | 1j |
| 15 | Audit chain mutex bottleneck | 🟠 P1 | Plafond 100k | Confirmée | `audit.repository.pg.ts:58` | Merkle batch (R27) | 4-6 sem |
| 16 | LLM Guard 8 inflight | 🟠 P1 | Plafond 100k chat | Confirmée | `config/env.ts:429` | Scale horizontal + rate limit | 1 sem |
| 17 | DB_POOL_MAX=50 no PgBouncer | 🟠 P1 | Connection saturation | Confirmée | `config/env.ts:69` | PgBouncer transaction-mode | 1 sem |
| 18 | No CDN devant OVH | 🟠 P1 | LCP / coût | Confirmée | -- | Cloudflare Free DNS swap | 3h |
| 19 | TTS cache messageId | 🟠 P1 | Cost waste | Confirmée | `text-to-speech.openai.ts` | Content-hash rekey | 1-2j |
| 20 | TTS no per-user cap | 🟠 P1 | Denial-of-wallet | Faible | -- | Redis-Lua quota | 1j |
| 21 | Garak target Phi-3 PAS Musaium | 🟠 P1 | Faux positif sécurité | Confirmée | ADR-049 Phase 1.5 | REST target swap | 2j |
| 22 | EU CRA VDP deadline | 🟠 P1 | €15M / 2.5% turnover | Sûre | -- | SECURITY.md + security.txt + runbook (F6 templates) | 5h |
| 23 | Sentry trace propagation cassée | 🟡 P2 | Debug DX | Confirmée | -- | Décider doctrine BE Sentry tracing | 1j |
| 24 | Langfuse v3 stale | 🟡 P2 | Tech debt | -- | -- | v5 migration | 4-6h |
| 25 | bcrypt cost-12 (OWASP legacy) | 🟡 P2 | -- | -- | -- | Argon2id rehash-on-login | 1 sprint |
| 26 | WebAuthn absent | 🟡 P2 | B2B blocker | Future | -- | V1.1 admin passkey | 2 sprints |
| 27 | pgBackRest archived | 🟡 P2 | Tooling | Future | -- | WAL-G plan V1.2 | -- |
| 28 | Solo-founder bus factor 1 | 🟡 P2 | Long-term | Future | -- | Docs continue + hiring | -- |

---

## 10. Sources externes citées (30 agents, ~280 web searches)

Index complet inline dans chaque R*.md / F*.md. Domaines principaux :

**Standards** : OWASP (Top 10 2025, LLM Top 10 2025, ASVS, MASVS, API Security Top 10), NIST (SP 800-63B-4, AAL2/AAL3), W3C WebAuthn L3, W3C WCAG 2.2, RFC 9116 (security.txt), RFC 6962 (Certificate Transparency), RFC 6238 (TOTP), W3C DTCG (design tokens), eIDAS, ISO 29147 (vulnerability disclosure).

**Régulation EU** : EU CRA (DLA Piper, Bird & Bird, Orrick), EU AI Act (artificialintelligenceact.eu), GDPR (gdpr.eu, edpb.europa.eu, CNIL), EAA (ec.europa.eu/social), ENISA SRP, DSA Art. 11.

**Docs officielles** : reactnative.dev, expo.dev/changelog, nextjs.org, react.dev, vercel.com/blog, postgresql.org, postgresql.org/docs/16, pgvector.dev, redis.io, tailwindcss.com/blog, motion.dev, recharts.org, maplibre.org, tanstack.com, sentry.io, opentelemetry.io, langfuse.com, openai.com/pricing, anthropic.com, ai.google.dev, deepseek.com, stripe.com/docs, lemonsqueezy.com, paddle.com, sigstore.dev, slsa.dev, github.com (Issues + Releases).

**Communauté / blogs** : Discord Engineering, Pinterest Engineering, Crunchy Data, Tembo, Cloudflare Blog, web.dev, Apple Developer, Google Play Console docs, SRE Google book.

**Threat intel** : Snyk advisories, CISA KEV catalog, Shai-Hulud worm reports, Polyfill.io incident, tj-actions postmortem.

---

## 11. Mes erreurs et corrections (UFR-013 honest)

Au cours de l'audit, mes agents ont parfois survendu. J'ai corrigé :

- **`.env` "committed"** (frontend deep-dive) — FAUX. Le fichier `.env` existe localement avec tokens mais est gitignored et JAMAIS commit en git history. Risque LOCAL seulement.
- **CLAUDE.md "IVFFlat with vector_cosine_ops"** — STALE. Le code utilise HNSW + halfvec_ip_ops depuis migration `1778406339944` (R5 + verified).
- **CLAUDE.md "34 migrations"** — STALE. Réel = 56.
- **`shared/env/env.ts` (backend agent path)** — Réel = `src/config/env.ts`.
- **Stryker 99.75%** — NON VÉRIFIÉ. Réel via `stryker-incremental.json` = 89.42% classical ou 100% covered-only (F4). À updater dans `PHASE_HISTORY.md`.

Quand un agent a survendu, je l'ai indiqué dans le rapport. Quand un agent a sous-vendu (e.g. F4 a trouvé 6 sites Sharp pas 3, 10 usages `<Image>` pas 8), j'ai gardé le chiffre corrigé.

---

## 12. Conclusion honnête

Tim — voici ce que j'ai vu objectivement :

**Le code est bon.** Vraiment. La discipline qualité, l'architecture hexagonale, les patterns sécurité (algo-pinning JWT, signed double-submit, refresh rotation), l'observability stack (OTel v2 hotfixé hier, Sentry 3-app mirror), la CI/CD (cosign, SLSA L3, Promptfoo+Garak weekly), la mutation testing, le test discipline ESLint custom — c'est au-dessus de la médiane d'une startup pré-launch. Ahead-of-industry sur plusieurs axes.

**Mais tu n'es pas encore enterprise-grade 100k.** Trois bottlenecks structurels (audit chain mutex, LLM Guard cap, pas de PgBouncer) plafonnent le système à ~5-10k MAU. Pour atteindre 100k il faut **4-6 semaines de travail infra** (V1.1+V1.2) — pas du code, mais du wiring infra + redesign audit chain Merkle.

**Et il y a 14 bugs concrets P0 à fixer en 19 jours**. Tous identifiés, sourcés file:line, avec patch suggéré. C'est faisable en ~80h (4.5h/jour discipliné). Aucun n'est insoluble.

**Sur 10 ans, le stack tient.** Trois migrations majeures attendues mais pas un effondrement. Le risque réel = solo founder bus factor + EU regulatory creep.

**Pour le launch 2026-06-01** : tu peux ship si tu valides J0-J18 (semaines 1-2 du plan §4). Décision GO/NO-GO réelle = 2026-05-31, basée sur les 14 P0 verts + iOS 26 résolu (ou Android-first) + VDP/SECURITY.md publié + CDN actif.

**Sois honnête avec toi-même** : prends 2 jours sur les 19 pour lire tous les rapports R1-R30 et F1-F10. Pas tout d'un coup. Mais en profondeur sur ceux qui te concernent (R8 scaling, R27 audit chain, F4 bugs, F6 VDP, F8 TypeORM). C'est le rapport préparatoire dont tu m'as parlé — il s'applique mieux à toi qu'à moi.

Le verdict du launch 2026-06-01 n'est pas mon verdict. C'est le tien. Cet audit te donne les preuves pour le porter.

**Bon courage. Le projet en vaut la peine.**

— Claude Opus 4.7
