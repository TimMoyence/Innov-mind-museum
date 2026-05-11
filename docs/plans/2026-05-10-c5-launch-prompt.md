# C5 — Wikidata premium (resilient) — Plan d'exécution step-by-step (entreprise-grade, full-autonomy)

> **Statut** : prêt à dispatcher via `/team` une fois **C2 + C3 mergés sur `main`** (worktree `C2-Image-chat`).
> **Sprint** : launch 2026-06-01 — Phase 1 Consolidation.
> **Source** : `docs/ROADMAP_PRODUCT.md` C5 (lignes 104-111).
> **Prérequis** : C1.1 dashboard SHIPPED (extension panneaux C5.2 + C5.4). **Idéalement dispatché AVANT C4** : C5.1 circuit-breaker rend `KB miss` distinguable de `Wikidata down` → C4.1 plus chirurgical.
> **Mode d'exécution** : **plan à coches**, un step = un subagent fresh-context, review gate fresh-context entre chaque, **max 3 subagents read-only en parallèle** (V12 §1 #1, writes sériels).
> **Auteurs** : audit /team v13 du 2026-05-10, 7 subagents (4 audit codebase + 3 WebSearch state-of-art).

---

## Sommaire

- [§A — Sources & state-of-the-art 2025-2026](#a)
- [§B — Pré-flight gate (avant `/team`)](#b)
- [§C — Architecture cible (résumé)](#c)
- [§D — Run bootstrap (Step 0)](#d)
- [§E — Phase 1 : Spec Kit + ADR-039 + ADR-035 amendment scaffolding (Steps 1.x)](#e)
- [§F — Phase 2 : Circuit-breaker SPARQL via opossum (Steps 2.x)](#f)
- [§G — Phase 3 : Cache SWR (soft/hard/stale-if-error) (Steps 3.x)](#g)
- [§H — Phase 4 : Local dump Wikidata + ingestion CLI (Steps 4.x)](#h)
- [§I — Phase 5 : Repository fallback + KnowledgeBaseService cascade (Steps 5.x)](#i)
- [§J — Phase 6 : Observabilité Langfuse + Prometheus + Grafana (Steps 6.x)](#j)
- [§K — Phase 7 : Tests integration + chaos game-day (Steps 7.x)](#k)
- [§L — Phase 8 : Doc + ADR + roadmap tick (Steps 8.x)](#l)
- [§M — Verifier + Reviewer + closing (Steps 9.x)](#m)
- [§N — Predicted issues & mitigations](#n)
- [§O — Bibliographie](#o)

---

<a id="a"></a>
## §A — Sources & state-of-the-art 2025-2026

Le plan repose sur la recherche WebSearch + WebFetch (14 sujets, 50+ URLs) menée le 2026-05-10. Décisions critiques :

| # | Décision | Justification | Source clé |
|---|---|---|---|
| 1 | **Adopter `opossum` 9.0.0** au lieu de cloner `LLMCircuitBreaker` | 1 breaker par dépendance externe (anti-pattern de réutiliser ; opossum est mature, OTel-friendly, 204 deps npm) | [opossum @ npm](https://www.npmjs.com/package/opossum), [Nodeshift docs](https://nodeshift.dev/opossum/) |
| 2 | **Corriger brief : WDQS limits = 60s query-time/min** (pas 5 req/min) | Source officielle WMF, mesuré 2025-2026 | [Wikidata SPARQL query limits](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_limits) |
| 3 | **Cache SWR 3-niveaux** au lieu hard TTL : soft 24h / hard 7j / stale-if-error 30j | Résout divergence ADR-035 (7j) vs code (1h) ; thundering-herd protégé via SETNX | [System Overflow caching](https://www.systemoverflow.com/learn/caching/cache-invalidation/time-based-invalidation-ttl-stale-while-revalidate-and-expiry-strategies) |
| 4 | **Dumps Wikidata = HEBDOMADAIRES (pas mensuels)** | Source WMF officielle, dumps `latest-all.json.gz` ~110-130 GiB compressé | [Wikidata Database download](https://www.wikidata.org/wiki/Wikidata:Database_download) |
| 5 | **Scope dump V1 = 50-100k QIDs** (pas 10-20k initial) | 10k trop bas pour œuvres mainstream + collections muséales ; viser paintings + sculpture + drawing + print + work_of_art subclass | [WikiProject sum of all paintings](https://www.wikidata.org/wiki/Wikidata:WikiProject_sum_of_all_paintings) |
| 6 | **`wikibase-dump-filter` 6.1.1** depuis Codeberg (GH archivé) | Stream parsing, idempotent filter `--claim P31:Q3305213` | [wikibase-dump-filter Codeberg](https://codeberg.org/maxlath/wikibase-dump-filter) |
| 7 | **Postgres GIN index = `jsonb_path_ops`** (pas default `jsonb_ops`) | 40% smaller index, 30-50% faster lookup pour pattern @> containment | [Crunchy Data JSONB indexing](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres) |
| 8 | **Prometheus histogram buckets seconds** `[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]` | 4 sub-second pour zone normale, 4 second-range dégradée, 2 timeout-zone (server-side cap 60s) | [Last9 histogram buckets guide](https://last9.io/blog/histogram-buckets-in-prometheus/) |
| 9 | **User-Agent WMF format obligatoire** : `Musaium/1.0 (https://musaium.com/contact; contact@musaium.com)` | Sans → 403 WDQS | [WMF User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) |
| 10 | **Langfuse SDK 3.x = OpenTelemetry-native**, fail-open built-in. Utiliser `observe()` wrapper, pas custom `safeTrace` | SDK errors caught + logged, no propagation | [Langfuse Advanced TS](https://langfuse.com/docs/observability/sdk/typescript/advanced-usage) |
| 11 | **`bottleneck` npm pour rate limit** (1 req/s ingestion) | Standard 1.2M downloads/week, `minTime: 1000, maxConcurrent: 1` | [Inngest rate limiting](https://www.inngest.com/docs/guides/rate-limiting) |
| 12 | **Idempotent ingestion CLI** : checkpoint table `ingestion_checkpoint` + flush every 100-500 items + atomic transaction | Inngest/Airbyte canonical pattern | [Airbyte Idempotency](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines) |
| 13 | **TypeORM `@Index({ synchronize: false })` + custom SQL GIN dans migration** (TypeORM ne génère PAS auto les GIN) | Issue #1519 confirmé | [TypeORM Issue #1519](https://github.com/typeorm/typeorm/issues/1519) |
| 14 | **Apache Jena ParameterizedSparqlString — pas de lib Node.js équivalente** | Validation manuelle stricte, defense in depth | [Jena Parameterized SPARQL](https://jena.apache.org/documentation/query/parameterized-sparql-strings.html) |

**Constat majeur** : Wikidata Query Service mesurablement moins fiable qu'en 2017 (queries identiques 0.6s → 9s, 9s → timeout 60s). Justifie pleinement C5. WMF documente explicitement "best-effort" service, **aucun SLA**.

---

<a id="b"></a>
## §B — Pré-flight gate (avant `/team feature C5`)

Tech Lead exécute sur `main` clean. Toute commande exit ≠ 0 → STOP.

```bash
# B.1 — C2 + C3 mergés
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind log --oneline main --since=2026-05-08 \
  | grep -E "feat\(C2|feat\(C3" | head -5

# B.2 — Tests passent (baseline 4150)
cd museum-backend && pnpm test -- --testPathPattern=tests/unit/chat/wikidata 2>&1 | tail -3
cd ..

# B.3 — ADR-035 toujours Accepted-Implemented
grep -A 2 "## Status" docs/adr/ADR-035-knowledge-base-wikidata.md  # MUST: Accepted-Implemented

# B.4 — Redis up + observable
docker compose -f museum-backend/docker-compose.dev.yml ps | grep -i redis | grep -i healthy

# B.5 — Postgres dev up
docker compose -f museum-backend/docker-compose.dev.yml ps | grep -i postgres | grep -i healthy

# B.6 — Wikidata SPARQL accessible (smoke avant CB dev)
curl -sfH "User-Agent: Musaium-PreFlight/1.0 (mailto:contact@musaium.com)" \
  "https://query.wikidata.org/sparql?query=ASK%20%7B%20wd%3AQ12418%20wdt%3AP31%20wd%3AQ3305213%20%7D" \
  -H "Accept: application/sparql-results+json" \
  | jq -r '.boolean'  # MUST: true

# B.7 — Pas de dette ouverte sur fichiers C5 cibles
grep -rn "TODO.*C5\|FIXME.*wikidata\|FIXME.*sparql" \
  museum-backend/src/modules/chat/ docs/ 2>/dev/null | head

# B.8 — Spec Kit hook self-test
bash .claude/skills/team/team-hooks/pre-feature-spec-check.sh --self-test  # MUST: 8/8 PASS

# B.9 — Migration governance — clean state
cd museum-backend && pnpm migration:run > /dev/null 2>&1
node scripts/migration-cli.cjs generate --name=Check 2>&1 | grep -i "no changes" || echo "WARN: drift schema detected"

# B.10 — GitNexus index frais
npx gitnexus status 2>&1 | head -5

# B.11 — pgvector check (si C3 mergé)
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d museum_db -tAc "SELECT extname FROM pg_extension WHERE extname='pgvector';" 2>/dev/null
# Empty si pas de pgvector — OK pour C5 (table standalone, pas de vector)
```

---

<a id="c"></a>
## §C — Architecture cible (résumé)

```text
                           ┌─────────────────────────────┐
                           │ KnowledgeBaseService        │
                           │ (orchestrateur cascade)      │
                           └────┬────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ Redis Cache   │   │ Wikidata Live │   │ Local Dump    │
    │ SWR 3-tier    │   │ via opossum   │   │ Postgres      │
    │ soft 24h      │   │ Circuit-Breaker│  │ jsonb_path_ops│
    │ hard 7j       │   │ + AbortSignal │   │ GIN index     │
    │ stale-if-error│   │ + WMF User-Ag │   │ Synced weekly │
    │ 30j           │   │               │   │ via CLI       │
    └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
            │                   │                   │
            │   cache hit       │   live OK         │   live circuit OPEN
            │                   │                   │   AND soft TTL exceeded
            └───────────────────┴───────────────────┘
                                │
                                ▼
                        facts (or null fail-open)
                                │
                                ▼
            ┌──────────────────────────────────────────┐
            │ <untrusted_content source="X" nonce="..."> │
            │   facts (always wrapped — ADR-035)         │
            │ </untrusted_content>                       │
            └──────────────────────────────────────────┘

Observability :
  Langfuse spans (observe() wrapper) :
    - chat.knowledge.lookup{source, cache_hit, fallback_to, error_type}
  Prometheus metrics :
    - wikidata_sparql_circuit_state{state} (gauge 0/1)
    - wikidata_sparql_requests_total{outcome=success|error|timeout|circuit_open|rate_limit}
    - wikidata_sparql_request_duration_seconds (histogram, buckets [0.05..60])
    - wikidata_cache_hits_total{tier=fresh|soft|stale}, wikidata_cache_misses_total
    - wikidata_local_dump_hits_total
    - wikidata_dump_last_refresh_timestamp_seconds (gauge)

Rollback : pas de feature flag (doctrine pré-launch V1 — `feedback_no_feature_flags_prelaunch`). `git revert <sha>` + redeploy en cas d'incident. Env vars exposés = tuning seulement (timeouts CB, error thresholds, cache TTLs, dump fallback delay) — aucun `*_ENABLED` switch.
```

---

<a id="d"></a>
## §D — Step 0 : Run bootstrap

> Identique à C4 §D mais avec different RUN_ID + cost agents adapté.

### Step 0.1 — Generate run-id et state.json initial

- [ ] User invoque : `/team feature C5 — Wikidata résilient (circuit-breaker SPARQL via opossum + cache SWR 3-tier + local dump fallback + observabilité Langfuse/Grafana)`
- [ ] `RUN_ID = 2026-XX-XX-c5-wikidata-resilient`
- [ ] mkdir + STORY.md + state.json initial + startCommit captured

### Step 0.2 — Roadmap context loader

- [ ] `RUN_ID=$RUN_ID .claude/skills/team/team-hooks/pre-cycle-roadmap-load.sh`
- [ ] Verify C5 items indexed (4 entries C5.1..C5.4)

### Step 0.3 — Cost estimate

- [ ] `EST=$(.claude/skills/team/lib/cost-estimate.sh enterprise architect,editor,verifier,security,reviewer,documenter 4)`
- [ ] Persist + threshold check ($20 warn / $50 refuse)

### Step 0.4 — Cache warm-up (V12 §6)

- [ ] Single architect call avec : protocoles enterprise + JSON KB + le présent fichier + `docs/adr/ADR-035-knowledge-base-wikidata.md` → `cache_control: ephemeral`
- [ ] Architect WARM-OK + token count

### Step 0.5 — APC plan-cache lookup

- [ ] `FP=$(.claude/skills/team/lib/plan-cache.sh fingerprint feature backend chat,modules.chat,wikidata,redis,postgres "$DESCRIPTION")`
- [ ] HIT → mode ADAPT, MISS → mode fresh

---

<a id="e"></a>
## §E — Phase 1 : Spec Kit + ADR-039 + ADR-035 amendment

### Step 1.1 — Architect produit `spec.md`

**État cible** : `team-state/$RUN_ID/spec.md` ≥ 1500 mots, EARS-format, NFR ≥ 10 entrées, glossary (SWR, opossum, Spotlighting, jsonb_path_ops, ParameterizedSparqlString, WMF User-Agent).

**Spawn** : architect fresh-context.

**DoD** :
- [ ] EARS requirements ≥ 14 entries couvrant C5.1..C5.4
- [ ] NFR table ≥ 10 NFRs (cf. §F.NFR plus bas)
- [ ] Goals/Non-goals listés
- [ ] Stakeholders : visiteur B2C (impact = chat sans facts si Wikidata down), ops Musaium (alerting), security reviewer (User-Agent + injection), Tech Lead (cost dump storage)
- [ ] Acceptance criteria mesurables
- [ ] Glossary : SWR, opossum, jsonb_path_ops, WMF User-Agent, etc.

**Review gate** : reviewer fresh-context (Stage 1 spec compliance).

**Predicted issues** :
- 🔮 Architect oublie d'inclure NFR9 storage dump cap 200MB → reject.
- 🔮 Glossary missing `Spotlighting` (déjà ADR-035 mais à rappeler) → cohérence avec C4

---

### Step 1.2 — Architect produit `design.md`

**État cible** : ≥ 2000 mots, ADR-style sections.

**Spawn** : architect fresh-context.

**DoD — décisions à TRANCHER avec rationale ≥ 200 mots chacune** :
- [ ] **D1 Choix lib circuit-breaker** : `opossum` 9.0.0 vs hand-rolled state machine. **Recommandation = opossum** (research §1). Inclure la raison (mature, OTel-friendly, 1 breaker per dep, anti-pattern réutilisation `LLMCircuitBreaker`).
- [ ] **D2 Cache SWR 3-tier** : soft `KB_CACHE_SOFT_TTL_SECONDS=86400` (24h) / hard `KB_CACHE_HARD_TTL_SECONDS=604800` (7j) / stale-if-error `KB_CACHE_STALE_IF_ERROR_TTL_SECONDS=2592000` (30j). Single-flight via Redis `SETNX` lock pour éviter thundering herd.
- [ ] **D3 ADR-035 amendment** : aligner code TTL (1h) → cache SWR ; AMEND ADR-035 §Implementation update au lieu de breaking-change. Backward-compat preserved (signature `KnowledgeBaseService.lookup()` inchangée).
- [ ] **D4 Local dump scope** : QID allowlist V1. Subclass closure via `P31/P279*` :
  - Q3305213 (painting), Q860861 (sculpture), Q11060274 (print), Q93184 (drawing), Q15123870 (engraving), Q838948 (work of art — careful super-class)
  - Cible 50-100k QIDs (révisé ; brief disait 10-20k → trop bas)
  - Source allowlist : SPARQL one-shot query au début ingestion (pas hardcoded CSV)
- [ ] **D5 Storage dump table** : `wikidata_kb_dump` (qid PK, label_en, label_fr, facts JSONB, image_url TEXT NULL, synced_at TIMESTAMPTZ NOT NULL, source VARCHAR). GIN `jsonb_path_ops` sur `facts`. GIN `to_tsvector` sur labels EN+FR pour search FTS.
- [ ] **D6 Ingestion CLI** : `museum-backend/scripts/ingest-wikidata-dump.ts` :
  - Streaming download via `fetch` + pipe
  - `wikibase-dump-filter` 6.1.1 npm/Codeberg
  - `bottleneck` minTime 1000ms (1 req/s courtoisie)
  - Checkpoint table `ingestion_checkpoint` (job_name PK, last_qid, last_offset_bytes, items_processed, status, started_at, updated_at)
  - Atomic transaction commit checkpoint + data write
  - SIGTERM handler flush checkpoint + exit
- [ ] **D7 Activation fallback dump** : circuit OPEN AND `state.openSince > LOCAL_DUMP_FALLBACK_AFTER_MS` (default 5000ms = 5s soak). Sinon fail-open `null`. Cache key suffix `kb:wikidata:dump:{qid}` TTL 1h (court, pour ne pas figer dump-stale).
- [ ] **D8 Migration TypeORM** : `node scripts/migration-cli.cjs generate --name=AddWikidataKbDumpTable`. Custom SQL pour GIN (TypeORM ne génère pas auto — Issue #1519). Verify forward+revert sur DB clean.
- [ ] **D9 User-Agent WMF format** : `Musaium/1.0 (https://musaium.com/contact; contact@musaium.com)`. Centralisé dans config env `WIKIDATA_USER_AGENT`.
- [ ] **D10 Langfuse SDK 3.x `observe()` wrapper** : pas de custom `safeTrace` ; le SDK fail-open built-in. Spans attributs : `wikidata.qid`, `cache.hit`, `cache.tier` (`fresh`|`soft`|`stale`|`miss`), `cache.source` (`redis`|`dump`|`sparql`), `error.type` (`timeout`|`circuit_open`|`rate_limit`|`network`|`sparql_error`|`invalid_response`).
- [ ] **D11 Prometheus métriques** :
  - `wikidata_sparql_circuit_state{state="open|closed|half_open"}` gauge 0/1
  - `wikidata_sparql_requests_total{outcome="success|fallback|timeout|circuit_open|rate_limit"}` counter
  - `wikidata_sparql_request_duration_seconds_bucket{le}` histogram, buckets seconds `[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]`
  - `wikidata_cache_hits_total{tier="fresh|soft|stale"}` counter
  - `wikidata_cache_misses_total` counter
  - `wikidata_local_dump_hits_total` counter
  - `wikidata_dump_last_refresh_timestamp_seconds` gauge (Unix epoch seconds)
- [ ] **D12 Sequence diagram Mermaid** : flow KB lookup avec cascade Redis SWR → SPARQL via CB → dump fallback.
- [ ] **D13 Chaos game-day plan** : iptables-based block sur `query.wikidata.org` ; trigger CB OPEN ; vérifier dump fallback prend le relais ; vérifier alerte Grafana se déclenche en ≤ 2 min.

**Review gate** : reviewer + security.
- Security : User-Agent format, SPARQL injection vectors covered (D9 + D14 cross-ref `assertEntityId`)

**Predicted issues** :
- 🔮 D2 SWR sans single-flight → thundering herd au moment refresh. Test à inclure dans Step 3.x.
- 🔮 D5 GIN trigram sur labels coûte storage ~2x. Mesurer impact, considérer alternatives (B-tree partial sur normalized label).
- 🔮 D7 LOCAL_DUMP_FALLBACK_AFTER_MS=5s peut être trop long si Wikidata complètement down. Tune via env override.

---

### Step 1.3 — Architect produit `tasks.md`

**État cible** : ≥ 30 tasks atomiques.

**Review gate** : reviewer Stage 1 (compliance avec spec) + Stage 2 (atomicité, DoD mesurable).

---

### Step 1.4 — ADR-039 scaffolding

**État cible** : `docs/adr/ADR-039-wikidata-resilience-circuit-breaker-swr-dump.md`.

**Template** :

```markdown
# ADR-039 — Wikidata Resilience: Circuit-Breaker (opossum) + Cache SWR 3-tier + Local Dump Fallback

**Status:** Proposed
**Date:** 2026-XX-XX
**Deciders:** /team architect, security reviewer, ops Musaium, Tech Lead
**Supersedes/Amends:** ADR-035 (KB Wikidata wrap) — ce ADR-039 amend ADR-035 §Implementation update pour aligner cache TTL.
**Related:** ADR-001 (sync chat), ADR-021 (PgBouncer transaction mode), ADR-036 (LLM cache strategy)

## Context

Musaium chat KB Wikidata enrichment (ADR-035 Accepted-Implemented) repose sur live SPARQL public `https://query.wikidata.org/sparql` + Redis cache. Métriques 2025-2026 (sources : Wikidata SPARQL query_limits page, Wikitech runbook) :

- Wikidata Query Service **mesurablement moins fiable qu'en 2017** : queries identiques 0.6s → 9s, 9s → timeout 60s
- Aucun SLA officiel WMF (best-effort service)
- Limites réelles : 60s query-time/min, 30 erreurs/min, timeout server-side 60s, HTTP 429 sur dépassement
- Pas de status page formelle ; alerting interne nécessaire

Existant Musaium (ADR-035) : cache Redis (TTL annoncé 7j, code = 1h — divergence à régler), fail-open `null`, prompt injection wrap `<untrusted_content>`. Manque :
- Pas de circuit-breaker SPARQL → chaque requête utilisateur paye le timeout 500ms quand Wikidata lent → cascading p99 dégradé
- Pas de métrique downtime exposée → ops aveugle
- Pas de fallback local → quand Wikidata down >5min, hallucinations augmentent (corollaire C4 risk)

## Decision

1. **`opossum` 9.0.0** comme lib circuit-breaker (1 breaker dédié WDQS, options : `timeout: 5000, errorThresholdPercentage: 50, resetTimeout: 30000, capacity: 5, volumeThreshold: 5`). Pas de réutilisation de `LLMCircuitBreaker` (anti-pattern : 1 breaker per external dependency).
2. **Cache SWR 3-tier** : soft 24h (return + refresh background) / hard 7j (return + block-and-refresh) / stale-if-error 30j (return cached if circuit OPEN). Single-flight via Redis SETNX lock. **Amend ADR-035** §Implementation update pour aligner avec ce schéma.
3. **Local dump fallback** : table Postgres `wikidata_kb_dump` peuplée hebdomadairement via `wikibase-dump-filter` 6.1.1 + script CLI idempotent resumable. Activation = circuit OPEN AND soak >5s. Scope V1 = 50-100k QIDs (paintings + sculpture + drawing + print + work_of_art subclass).
4. **WMF User-Agent obligatoire** format `Musaium/1.0 (https://musaium.com/contact; contact@musaium.com)`.
5. **Langfuse spans `observe()` wrapper** (SDK 3.x OTel-native) ; attrs `cache.tier`, `error.type` taxonomy.
6. **Prometheus métriques** : 7 metrics nouveaux (cf. design D11), buckets seconds `[0.05..60]` (cap timeout server-side).
7. **Threshold tuning post-launch** : ADR-039 §Phase D dédié, gated 7j prod bake.

## Consequences

**Positive** :
- Fast-fail (NFR1) : p99 path KB sur Wikidata down ≤ baseline + 50ms (vs +500ms timeout actuel)
- Visibilité downtime (NFR2) : alerte ≤ 2 min, testée chaos game-day
- Recovery automatique (NFR3) : ≥ 80% queries factuelles servies depuis dump quand circuit OPEN
- Cache hit-rate visible Grafana (NFR5) post-7j

**Negative / risques** :
- Ajout complexité (1 breaker + 3-tier cache + 1 table dump + 1 CLI ingestion)
- Storage dump : ≤ 200 MB (NFR9, GIN index inclus)
- Coût ingestion : ~30-90 min/semaine + bandwidth (~110 GB download)
- Multi-instance breaker state divergence (V1 single-instance ; ADR-040 LATER pour Redis-backed shared)

**Neutral** :
- ADR-035 §Implementation update amend (signature `KnowledgeBaseService.lookup()` inchangée — backward-compat preserved)
- PgBouncer transaction mode (ADR-021) : table dump n'utilise NI LISTEN/NOTIFY NI advisory-locks NI prepared statements persistants → safe

## Phase D — Threshold Tuning (post-launch)

After ≥7 days production bake :
1. Aggregate metrics circuit-breaker fail rate per (period, error_type)
2. Tune `WIKIDATA_CB_FAILURE_THRESHOLD` (default 5/60s window) on real-signal data
3. Tune `KB_CACHE_SOFT_TTL_SECONDS` based on observed staleness vs hit-rate trade-off
4. Amend this ADR §Phase D with calibrated values

## Related links

- [Wikidata SPARQL query limits](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_limits)
- [opossum @ Nodeshift](https://nodeshift.dev/opossum/)
- [wikibase-dump-filter Codeberg](https://codeberg.org/maxlath/wikibase-dump-filter)
- [Crunchy Data JSONB indexing](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres)
- [Last9 Prometheus histogram buckets](https://last9.io/blog/histogram-buckets-in-prometheus/)
- [Inngest Idempotency](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [WMF User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
```

**DoD** :
- [ ] ADR-039 ≥ 1000 mots
- [ ] Status `Proposed`
- [ ] Sections complètes
- [ ] Mention amend ADR-035 explicit (cohérence)

**Spawn agent** : `documenter` (Sonnet).

---

<a id="f"></a>
## §F — Phase 2 : Circuit-breaker SPARQL via opossum

> **Décision D1** : adopter `opossum` 9.0.0 ; jeter l'idée initiale "clone LLMCircuitBreaker".

### Step 2.1 — Add `opossum` dependency + types

**État cible** : `museum-backend/package.json` includes `"opossum": "^9.0.0"` ; types ajoutés ; `pnpm install` clean.

**Spawn agent** : editor.

**Pré-flight** :
```bash
node -v | grep -E "v(2[0-9])" || echo "FATAL: Node ≥20 required for opossum 9"  # opossum 9 requires Node ≥20
test -f museum-backend/package.json
```

**Phase Red** : add `museum-backend/tests/unit/chat/wikidata-breaker.spec.ts` referencing `opossum` import → fails compilation (module not found).

**Phase Green** :
- [ ] `cd museum-backend && pnpm add opossum@^9.0.0`
- [ ] `pnpm install` exit 0
- [ ] Verify `pnpm list opossum` shows 9.x
- [ ] Test compile passes

**DoD** :
- [ ] `package.json` updated with version pinned `^9.0.0`
- [ ] `pnpm-lock.yaml` updated
- [ ] No security advisories (`pnpm audit --audit-level=high`)

**Predicted issues** :
- 🔮 opossum has peerDeps; verify no conflict with `@types/node` ≥20
- 🔮 Some bundlers strip the import — confirm tsc compiles

---

### Step 2.2 — Wrap WikidataClient avec opossum CircuitBreaker

**État cible** : nouveau `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts` wrap les méthodes `searchEntity` + `fetchProperties` + `lookup` du `WikidataClient` existant. Decorator pattern (D1 Option A).

**Spawn agent** : editor.

**Phase Red** : 7 cases unit tests :
1. CLOSED state, all calls succeed → no breaker open
2. 5 consecutive failures (timeout) → state OPEN
3. OPEN state → call returns null immediately (no fetch)
4. After resetTimeout, state HALF_OPEN
5. HALF_OPEN + success → CLOSED
6. HALF_OPEN + fail → OPEN (full duration again)
7. HTTP 4xx (404 entity not found) → NOT counted as failure (errorFilter)

> Pas de cas "kill-switch désactive le breaker" — doctrine pré-launch V1 (`feedback_no_feature_flags_prelaunch`). Rollback breaker = `git revert` du wiring Step 2.3.

**Phase Green** :
```typescript
// museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts
import CircuitBreaker from 'opossum';
import type { WikidataClient } from './wikidata.client';
import type { CachePort } from '../../../../../shared/cache/cache.port';

export interface WikidataBreakerConfig {
  timeoutMs: number;            // 5000
  errorThresholdPercentage: number; // 50
  resetTimeoutMs: number;       // 30000
  volumeThreshold: number;      // 5
  capacity: number;             // 5 (concurrent calls)
}

export interface BreakerState { name: 'CLOSED'|'OPEN'|'HALF_OPEN'; openSince?: number }

export class WikidataBreakerClient {
  private readonly searchBreaker: CircuitBreaker;
  private readonly fetchPropsBreaker: CircuitBreaker;
  private openSince?: number;

  constructor(private readonly inner: WikidataClient, private readonly cfg: WikidataBreakerConfig) {
    const opts: CircuitBreaker.Options = {
      timeout: cfg.timeoutMs,
      errorThresholdPercentage: cfg.errorThresholdPercentage,
      resetTimeout: cfg.resetTimeoutMs,
      volumeThreshold: cfg.volumeThreshold,
      capacity: cfg.capacity,
      errorFilter: (err: unknown) => {
        // 404 entity-not-found is legitimate, not a failure
        const e = err as { status?: number };
        return e?.status === 404;  // returning true means "ignore this error"
      },
    };
    this.searchBreaker = new CircuitBreaker((term: string, signal?: AbortSignal) => this.inner.searchEntity(term, signal), opts);
    this.searchBreaker.fallback(() => null);
    this.searchBreaker.on('open', () => { this.openSince = Date.now(); });
    this.searchBreaker.on('close', () => { this.openSince = undefined; });

    this.fetchPropsBreaker = new CircuitBreaker((qid: string, signal?: AbortSignal) => this.inner.fetchProperties(qid, signal), opts);
    this.fetchPropsBreaker.fallback(() => null);
    this.fetchPropsBreaker.on('open', () => { this.openSince = Date.now(); });
    this.fetchPropsBreaker.on('close', () => { this.openSince = undefined; });
  }

  async searchEntity(term: string, signal?: AbortSignal): Promise<string | null> {
    return (await this.searchBreaker.fire(term, signal)) ?? null;
  }

  async fetchProperties(qid: string, signal?: AbortSignal): Promise<unknown | null> {
    return (await this.fetchPropsBreaker.fire(qid, signal)) ?? null;
  }

  /** State for cascade (Step 5.x) — used by KnowledgeBaseService to decide local-dump fallback */
  getState(): BreakerState {
    const isOpen = this.searchBreaker.opened || this.fetchPropsBreaker.opened;
    const isHalfOpen = this.searchBreaker.halfOpen || this.fetchPropsBreaker.halfOpen;
    if (isOpen) return { name: 'OPEN', openSince: this.openSince };
    if (isHalfOpen) return { name: 'HALF_OPEN', openSince: this.openSince };
    return { name: 'CLOSED' };
  }
}
```

- [ ] Test exit 0, lint/tsc OK

**DoD** :
- [ ] All 7 spec cases pass
- [ ] `errorFilter` ignores 404 (legitimate KB miss)
- [ ] `getState()` exposes name + openSince for downstream cascade
- [ ] Aucun `*_ENABLED` flag dans le code (verified `! grep -E "WIKIDATA_CB_ENABLED|cfg\\.enabled" wikidata-breaker.ts`)

**Review gate** : reviewer + security.

**Predicted issues** :
- 🔮 opossum 9 `errorFilter` semantics changed vs 8 — verify return-true-to-ignore (research §1)
- 🔮 `volumeThreshold` 5 too low for low-traffic dev — breaker never opens. Tune for prod.
- 🔮 Concurrent breaker.fire with same args — opossum bulkhead. `capacity: 5` limits 5 concurrent SPARQL → bulkhead respects WDQS rate.

---

### Step 2.3 — Env config + wiring `chat-module.ts`

**État cible** : env vars added, chat-module instantiates `WikidataBreakerClient` wrapping `WikidataClient`, injected into `KnowledgeBaseService`.

**Spawn agent** : editor.

**DoD** :
- [ ] `museum-backend/src/config/env.ts` Zod validates (tuning seulement, **aucun `*_ENABLED`** — doctrine pré-launch V1) :
  - `WIKIDATA_CB_TIMEOUT_MS` (int, default 5000)
  - `WIKIDATA_CB_ERROR_THRESHOLD_PCT` (int 0-100, default 50)
  - `WIKIDATA_CB_RESET_TIMEOUT_MS` (int, default 30000)
  - `WIKIDATA_CB_VOLUME_THRESHOLD` (int, default 5)
  - `WIKIDATA_CB_CAPACITY` (int, default 5)
  - `WIKIDATA_USER_AGENT` (string, default `Musaium/1.0 (https://musaium.com/contact; contact@musaium.com)`)
- [ ] `.env.local.example` updated
- [ ] `chat-module.ts:206-208` instanciates `new WikidataBreakerClient(wikidataClient, cfg)` ; injected to `KnowledgeBaseService` via existing port (no signature change)
- [ ] Integration test : `tests/integration/chat/wikidata-breaker-wiring.test.ts` — mock fetch, simulate 5 failures, expect breaker open, verify subsequent calls return null without fetch

**Review gate** : reviewer + security (User-Agent format compliance WMF).

---

### Step 2.4 — Update `WikidataClient` pour respecter WMF User-Agent

**État cible** : tous les calls SPARQL incluent `User-Agent` header WMF-compliant.

**Spawn agent** : editor.

**DoD** :
- [ ] `wikidata.client.ts` sets `User-Agent: ${env.WIKIDATA_USER_AGENT}` on every fetch
- [ ] `Accept-Encoding: gzip,deflate` set
- [ ] `Accept: application/sparql-results+json` already set (verify)
- [ ] Test asserts header presence

**Predicted issues** :
- 🔮 Default User-Agent absent → 403 in prod. Make env var REQUIRED (no default fallback to empty string)
- 🔮 Multi-package fetch usage (some places use raw `fetch`, others via service). Centralize via shared http client wrapper.

---

<a id="g"></a>
## §G — Phase 3 : Cache SWR 3-tier (résolution divergence ADR-035)

### Step 3.1 — Cache key + tier types

**État cible** : `museum-backend/src/modules/chat/useCase/knowledge/cache-types.ts` exporte :
```typescript
export type CacheTier = 'fresh' | 'soft' | 'stale' | 'miss';
export interface CachedFacts {
  facts: KnowledgeFact[] | null;
  cachedAt: number;
  tier: CacheTier;
}
```

**Spawn agent** : editor.

**DoD** :
- [ ] Types exportés, lint/tsc OK
- [ ] Tests of type assertions

---

### Step 3.2 — `KnowledgeBaseCacheService` SWR implementation

**État cible** : `museum-backend/src/modules/chat/useCase/knowledge/knowledge-base-cache.service.ts` :
- `getOrFetch(searchTerm, fetcher, signal)` :
  - lookup Redis
  - if `age < softTtl` → return tier='fresh'
  - if `age < hardTtl` → return tier='soft' + spawn background refresh (single-flight via SETNX `kb:lock:{key}`, lock 30s)
  - if `age < staleIfErrorTtl` AND fetcher throws (or breaker OPEN) → return tier='stale'
  - else → fetch fresh, write all 3 TTLs

**Spawn agent** : editor.

**Phase Red** — 8 unit cases :
1. Fresh cache hit → tier='fresh'
2. Soft expired cache → tier='soft' + refresh started in background
3. Soft refresh single-flight (concurrent calls → only 1 refresh)
4. Hard expired → block + refresh + return new value
5. Hard expired + fetcher throws → tier='stale' (within stale-if-error window)
6. Stale-if-error expired + fetcher throws → null fail-open
7. SIGABRT (signal aborted) → return cached if any, else null
8. Single-flight lock TTL elapsed → next call refreshes

**Phase Green** :
```typescript
// knowledge-base-cache.service.ts
export class KnowledgeBaseCacheService {
  constructor(
    private readonly cache: CachePort,
    private readonly cfg: { softTtlMs: number; hardTtlMs: number; staleIfErrorMs: number },
  ) {}

  async getOrFetch(
    searchTerm: string,
    fetcher: (signal?: AbortSignal) => Promise<KnowledgeFact[] | null>,
    signal?: AbortSignal,
  ): Promise<CachedFacts> {
    const key = this.cacheKey(searchTerm);
    const cached = await this.cache.get<{ facts: KnowledgeFact[] | null; cachedAt: number }>(key);
    const now = Date.now();

    if (cached) {
      const age = now - cached.cachedAt;
      if (age < this.cfg.softTtlMs) {
        return { facts: cached.facts, cachedAt: cached.cachedAt, tier: 'fresh' };
      }
      if (age < this.cfg.hardTtlMs) {
        // Stale-while-revalidate: return + refresh background
        this.refreshBackground(key, searchTerm, fetcher).catch(() => {/* swallow */});
        return { facts: cached.facts, cachedAt: cached.cachedAt, tier: 'soft' };
      }
      if (age < this.cfg.staleIfErrorMs) {
        try {
          const fresh = await fetcher(signal);
          if (fresh !== null) {
            await this.writeCache(key, fresh, now);
            return { facts: fresh, cachedAt: now, tier: 'fresh' };
          }
          return { facts: cached.facts, cachedAt: cached.cachedAt, tier: 'stale' };
        } catch {
          return { facts: cached.facts, cachedAt: cached.cachedAt, tier: 'stale' };
        }
      }
    }

    // Miss or beyond all TTLs — fetch fresh
    try {
      const fresh = await fetcher(signal);
      if (fresh !== null) {
        await this.writeCache(key, fresh, now);
      }
      return { facts: fresh, cachedAt: now, tier: 'miss' };
    } catch {
      return { facts: null, cachedAt: now, tier: 'miss' };
    }
  }

  private async refreshBackground(key: string, searchTerm: string, fetcher: (s?: AbortSignal) => Promise<KnowledgeFact[] | null>): Promise<void> {
    const lockKey = `${key}:lock`;
    const acquired = await this.cache.setNx(lockKey, '1', 30); // 30s lock
    if (!acquired) return; // single-flight: another caller is refreshing
    try {
      const fresh = await fetcher();
      if (fresh !== null) await this.writeCache(key, fresh, Date.now());
    } finally {
      await this.cache.del(lockKey);
    }
  }

  private async writeCache(key: string, facts: KnowledgeFact[] | null, cachedAt: number): Promise<void> {
    // Write with hardTtl as effective Redis TTL (stale-if-error governed by app logic)
    await this.cache.set(key, { facts, cachedAt }, Math.floor(this.cfg.staleIfErrorMs / 1000));
  }

  private cacheKey(searchTerm: string): string {
    return `kb:wikidata:v2:${searchTerm.toLowerCase().normalize('NFKC').trim()}`;
  }
}
```

- [ ] All 8 spec cases pass

**DoD** :
- [ ] Cache key versioned (`v2:`) for migration safety
- [ ] Single-flight lock SETNX 30s
- [ ] Stale-if-error window honored
- [ ] Fail-open preserved (null returned)

**Review gate** : reviewer.
- Verify : `kb:lock:{key}` cleanup in finally
- Verify : background refresh doesn't leak unhandled promise rejection (top-level `.catch(swallow)`)

**Predicted issues** :
- 🔮 Background refresh fail silently — instrument Langfuse span "background refresh failed" log (Step 6.x)
- 🔮 Cache invalidation : how to invalidate after dump update? Use `kb:wikidata:v2:` prefix delete via `delByPrefix`
- 🔮 Concurrent SETNX : opossum `volumeThreshold` interacts — if 5 concurrent calls all miss, all try refresh → SETNX wins one. ✓

---

### Step 3.3 — Env vars + wire `KnowledgeBaseService`

**État cible** : env vars added (`KB_CACHE_SOFT_TTL_SECONDS=86400`, `KB_CACHE_HARD_TTL_SECONDS=604800`, `KB_CACHE_STALE_IF_ERROR_TTL_SECONDS=2592000`). `KnowledgeBaseService.lookup()` uses `KnowledgeBaseCacheService.getOrFetch()`.

**Spawn agent** : editor.

**DoD** :
- [ ] Env Zod validation
- [ ] Signature `KnowledgeBaseService.lookup()` unchanged (backward-compat)
- [ ] Integration test passes

**Review gate** : reviewer.

---

<a id="h"></a>
## §H — Phase 4 : Local dump Wikidata + ingestion CLI

### Step 4.1 — Migration TypeORM `wikidata_kb_dump`

**État cible** : table `wikidata_kb_dump` créée + indexes GIN.

**Spawn agent** : editor.

**Pré-flight** :
```bash
cd museum-backend && pnpm migration:run
node scripts/migration-cli.cjs generate --name=Check 2>&1 | grep -i "no changes" || echo "FATAL: drift schema before C5"
```

**Phase Red** : test `tests/integration/db/wikidata-kb-dump-table.test.ts` :
- given clean schema, run migration → assert table exists
- assert columns: qid (PK), label_en, label_fr, facts (jsonb), image_url, synced_at, source
- assert GIN index on facts (`pg_indexes`)
- assert GIN index on label_en + label_fr (FTS)
- assert constraint `chk_qid_format CHECK (qid ~ '^Q[0-9]+$')`

**Phase Green** :
- [ ] `node scripts/migration-cli.cjs generate --name=AddWikidataKbDumpTable`
- [ ] Edit migration manually (TypeORM doesn't generate GIN auto):
```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWikidataKbDumpTable1715000000000 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE wikidata_kb_dump (
        qid VARCHAR(20) PRIMARY KEY,
        label_en VARCHAR(255),
        label_fr VARCHAR(255),
        facts JSONB NOT NULL,
        image_url TEXT,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        source VARCHAR(20) NOT NULL DEFAULT 'dump-weekly',
        CONSTRAINT chk_qid_format CHECK (qid ~ '^Q[0-9]+$')
      )
    `);
    await qr.query(`
      CREATE INDEX idx_wikidata_kb_dump_facts_gin
      ON wikidata_kb_dump USING GIN (facts jsonb_path_ops)
    `);
    await qr.query(`
      CREATE INDEX idx_wikidata_kb_dump_label_en_fts
      ON wikidata_kb_dump USING GIN (to_tsvector('simple', coalesce(label_en, '')))
    `);
    await qr.query(`
      CREATE INDEX idx_wikidata_kb_dump_label_fr_fts
      ON wikidata_kb_dump USING GIN (to_tsvector('simple', coalesce(label_fr, '')))
    `);
    await qr.query(`
      CREATE INDEX idx_wikidata_kb_dump_synced_at
      ON wikidata_kb_dump (synced_at)
    `);
  }
  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE wikidata_kb_dump`);
  }
}
```
- [ ] Run migration up → all indexes present
- [ ] Run migration down → table dropped clean
- [ ] Run migration up again → idempotent

**DoD** :
- [ ] Migration forward + revert tested
- [ ] `node scripts/migration-cli.cjs generate --name=Check` returns empty (no drift)
- [ ] Test integration passes

**Review gate** : reviewer + security.
- Verify : QID regex constraint prevents SQL injection in qid column
- Verify : index names follow project convention (`idx_<table>_<column>_<type>`)

**Predicted issues** :
- 🔮 GIN index creation slow on populated table — fine for empty initial. Use `CREATE INDEX CONCURRENTLY` if rebuilding.
- 🔮 PgBouncer transaction mode + DDL — OK, DDL in transaction safe ; not session-scoped.

---

### Step 4.2 — Repository `WikidataKbDumpRepository`

**État cible** : `museum-backend/src/modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.ts` :
- `findByQid(qid: string)`: Promise<WikidataKbDump | null>
- `findByLabelFts(label: string, lang: 'en'|'fr', limit: number)`: Promise<WikidataKbDump[]>
- `upsertBatch(entities: WikidataKbDump[])`: Promise<void> (idempotent insert/update)
- `getOldestSyncedAt()`: Promise<Date | null> (for dump-age metric)

**Spawn agent** : editor.

**Phase Red → Green → Refactor**.

**DoD** :
- [ ] All 4 methods + tests
- [ ] FTS query uses `plainto_tsquery` for safety
- [ ] Upsert via `INSERT ... ON CONFLICT (qid) DO UPDATE`
- [ ] Bench : 100 reads p50 < 5ms, 1000 upsert batch < 200ms

---

### Step 4.3 — CLI ingestion `scripts/ingest-wikidata-dump.ts`

**État cible** : CLI Node.js script qui :
1. Download `latest-all.json.gz` (streaming, no full disk)
2. Filter via `wikibase-dump-filter` (subprocess) sur QID allowlist (subclass closure paintings/sculpture/...)
3. Stream into Postgres via `WikidataKbDumpRepository.upsertBatch` (batch 500)
4. Checkpoint table `ingestion_checkpoint`
5. Rate-limit 1 req/s via `bottleneck`
6. SIGTERM graceful shutdown

**Spawn agent** : editor.

**Sub-step 4.3.1 — Migration `ingestion_checkpoint` table** :

```sql
CREATE TABLE ingestion_checkpoint (
  job_name VARCHAR(50) PRIMARY KEY,
  last_qid VARCHAR(20),
  last_offset_bytes BIGINT,
  items_processed INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Sub-step 4.3.2 — Add deps** :
- [ ] `pnpm add wikibase-dump-filter@^6.1.1 bottleneck@^2.19.5`
- [ ] Verify Codeberg vs npm registry resolution

**Sub-step 4.3.3 — CLI logic** :

```typescript
// museum-backend/scripts/ingest-wikidata-dump.ts
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import Bottleneck from 'bottleneck';
import { DataSource } from 'typeorm';
// ... imports

async function main() {
  const ds = await initDataSource();
  const limiter = new Bottleneck({ minTime: 1000, maxConcurrent: 1 });
  const checkpoint = await loadOrCreateCheckpoint(ds, 'wikidata-art-dump');

  const url = 'https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.gz';
  // Use spawn pipe : curl | gzip -d | wikibase-dump-filter --claim P31:Q3305213,Q860861,...
  const filterCmd = spawn('wikibase-dump-filter', [
    '--claim', 'P31:Q3305213', '--claim', 'P31:Q860861', '--claim', 'P31:Q11060274',
    '--claim', 'P31:Q93184', '--claim', 'P31:Q15123870',
  ], { stdio: ['pipe', 'pipe', 'inherit'] });

  const downloadCmd = spawn('curl', ['-sL', '-A', process.env.WIKIDATA_USER_AGENT!, url], { stdio: ['ignore', 'pipe', 'inherit'] });
  const gunzip = spawn('gzip', ['-d'], { stdio: ['pipe', 'pipe', 'inherit'] });

  downloadCmd.stdout.pipe(gunzip.stdin);
  gunzip.stdout.pipe(filterCmd.stdin);

  const batch: WikidataKbDump[] = [];
  let bytesRead = 0;

  filterCmd.stdout.on('data', async (chunk) => {
    bytesRead += chunk.length;
    const lines = chunk.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entity = JSON.parse(line);
        const dumpEntry = transformEntityToDump(entity);
        batch.push(dumpEntry);
        if (batch.length >= 500) {
          await limiter.schedule(() => upsertBatch(ds, batch));
          checkpoint.last_qid = dumpEntry.qid;
          checkpoint.last_offset_bytes = bytesRead;
          checkpoint.items_processed += batch.length;
          await flushCheckpoint(ds, checkpoint);
          batch.length = 0;
        }
      } catch (err) {
        console.warn('parse error', err);
      }
    }
  });

  filterCmd.stdout.on('end', async () => {
    if (batch.length > 0) await upsertBatch(ds, batch);
    checkpoint.status = 'completed';
    await flushCheckpoint(ds, checkpoint);
    console.log(`[ingest] ${checkpoint.items_processed} items processed`);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[ingest] SIGTERM — flushing');
    if (batch.length > 0) await upsertBatch(ds, batch);
    checkpoint.status = 'paused';
    await flushCheckpoint(ds, checkpoint);
    process.exit(143);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] Test in mock mode (no real download) : `--dry-run` flag with local fixture file
- [ ] Test SIGTERM handling
- [ ] Test checkpoint resume (kill mid-run, restart, verify resumes from last_offset_bytes)

**DoD** :
- [ ] Script runs end-to-end on local dev (small fixture, e.g. 100 items)
- [ ] Bottleneck rate-limit verified (1 req/s)
- [ ] SIGTERM flushes checkpoint
- [ ] Resume from checkpoint works
- [ ] User-Agent WMF compliant

**Review gate** : reviewer + security.
- Security : verify no SPARQL injection through QID handling ; PostgreSQL params used (TypeORM safe)
- Security : verify subprocess sanitization (no user-controlled args to spawn)

**Predicted issues** :
- 🔮 `wikibase-dump-filter` install from npm vs Codeberg — package.json `"wikibase-dump-filter": "^6.1.1"` standard, but verify origin
- 🔮 Disk space : full dump 110-130 GiB. Stream-only (no on-disk write). Verify no temp files.
- 🔮 30-90 min execution time on subset — provide progress logs every 1000 items
- 🔮 Subclass closure : initial pull MAY miss subclasses of paintings (e.g. portraits Q134307). Document in tasks.md as "V1 limitation, expand allowlist V1.1"

---

### Step 4.4 — Cron schedule (V1 manuel, GitHub Actions weekly)

**État cible** : `.github/workflows/wikidata-dump-ingest.yml` ou systemd timer (decide).

**Spawn agent** : editor.

**DoD** :
- [ ] V1 acceptable : weekly GitHub Actions schedule (free tier, runs on ubuntu-latest with secrets)
- [ ] Or : systemd timer documented in `docs/OPS_DEPLOYMENT.md`
- [ ] Manual run instructions in README ingestion script

**Decision** : V1 = manuel CLI + monthly GitHub Actions cron in V1.1 (post-launch).

---

<a id="i"></a>
## §I — Phase 5 : Repository fallback + KnowledgeBaseService cascade

### Step 5.1 — `KnowledgeBaseService` consume breaker state

**État cible** : `KnowledgeBaseService` injecte `WikidataBreakerClient` + `WikidataKbDumpRepository`. Cascade :
1. Cache lookup (SWR Step 3.x)
2. If cache miss/stale → live SPARQL via breaker
3. If live throws OR breaker.getState().name === 'OPEN' AND openSince > LOCAL_DUMP_FALLBACK_AFTER_MS → dump lookup
4. Return null fail-open if all fail

**Spawn agent** : editor.

**Phase Red** : 6 cases :
1. Cache fresh hit → return facts (no live, no dump)
2. Cache miss → live OK → return + cache write
3. Cache miss → live throws → dump hit → return facts (source='dump')
4. Cache miss → live throws → dump miss → null
5. Cache stale → breaker OPEN >5s → dump fallback → return facts (source='dump')
6. Cache stale → breaker CLOSED → live throws → tier='stale' (Step 3.x)

**Phase Green** :
```typescript
// knowledge-base.service.ts (refactor)
async lookup(searchTerm: string, signal?: AbortSignal): Promise<KnowledgeFact[] | null> {
  const cached = await this.cacheSvc.getOrFetch(
    searchTerm,
    async (s) => {
      try {
        const result = await this.breaker.searchEntity(searchTerm, s);
        if (result) return await this.fetchFactsFromQid(result, s);
        return null;
      } catch (err) {
        // If circuit OPEN long enough, trigger dump fallback
        const state = this.breaker.getState();
        if (state.name === 'OPEN' && state.openSince && (Date.now() - state.openSince) > this.cfg.localDumpFallbackAfterMs) {
          return await this.lookupFromDump(searchTerm);
        }
        throw err;
      }
    },
    signal,
  );
  return cached.facts;
}

private async lookupFromDump(searchTerm: string): Promise<KnowledgeFact[] | null> {
  const found = await this.dumpRepo.findByLabelFts(searchTerm, 'en', 1)
    ?? await this.dumpRepo.findByLabelFts(searchTerm, 'fr', 1);
  if (!found || found.length === 0) return null;
  const entity = found[0];
  return this.transformDumpToFacts(entity);  // same shape as live
}
```

**DoD** :
- [ ] All 6 spec cases pass
- [ ] Source attribution preserved (Langfuse spans Step 6.x)
- [ ] Signature `KnowledgeBaseService.lookup()` unchanged

---

### Step 5.2 — Wiring `chat-module.ts` final

**État cible** : KnowledgeBaseService receives breaker + cache + dump repo via constructor.

**Spawn agent** : editor.

**DoD** :
- [ ] Integration test end-to-end : full chat message → KB lookup → cache → live (mock) → dump fallback simulated

---

<a id="j"></a>
## §J — Phase 6 : Observabilité Langfuse + Prometheus + Grafana

### Step 6.1 — Langfuse SDK 3.x `observe()` wrapper

**État cible** : `KnowledgeBaseService.lookup()` wrapped via `observe()` (Langfuse SDK 3.x OTel-native).

**Spawn agent** : editor.

**DoD** :
- [ ] Span name `chat.knowledge.lookup`
- [ ] Attributes : `wikidata.qid`, `cache.hit`, `cache.tier` (`fresh`|`soft`|`stale`|`miss`), `cache.source` (`redis`|`dump`|`sparql`), `error.type` taxonomy, `wikidata.circuit_state`
- [ ] PII redaction : `searchTerm` hashed (sha256 first 16 chars) — no raw user input in span attrs
- [ ] Test integration : `tests/integration/chat/wikidata-spans.test.ts` asserts spans emitted with correct attrs

**Review gate** : reviewer + security (PII).

**Predicted issues** :
- 🔮 Langfuse SDK fail-open : if backend down, no propagation. Verify in tests via mock.
- 🔮 OTel propagation : if upstream span exists, span auto-nested. Verify with parent context.

---

### Step 6.2 — Prometheus metrics implementation

**État cible** : 7 nouveaux metrics dans `museum-backend/src/shared/observability/prometheus-metrics.ts`.

**Spawn agent** : editor.

**Code snippet** :
```typescript
import { Counter, Gauge, Histogram } from 'prom-client';
import { registry } from './prometheus-registry';

export const wikidataSparqlCircuitState = new Gauge({
  name: 'wikidata_sparql_circuit_state',
  help: 'State of the Wikidata SPARQL circuit breaker (0=closed, 1=open, 2=half_open)',
  labelNames: ['state'],
  registers: [registry],
});

export const wikidataSparqlRequestsTotal = new Counter({
  name: 'wikidata_sparql_requests_total',
  help: 'Total Wikidata SPARQL requests outcomes',
  labelNames: ['outcome'],  // success | error | timeout | circuit_open | rate_limit
  registers: [registry],
});

export const wikidataSparqlDuration = new Histogram({
  name: 'wikidata_sparql_request_duration_seconds',
  help: 'Duration of Wikidata SPARQL requests in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const wikidataCacheHits = new Counter({
  name: 'wikidata_cache_hits_total',
  help: 'KB Wikidata cache hits',
  labelNames: ['tier'],  // fresh | soft | stale
  registers: [registry],
});
export const wikidataCacheMisses = new Counter({
  name: 'wikidata_cache_misses_total',
  help: 'KB Wikidata cache misses',
  registers: [registry],
});

export const wikidataLocalDumpHits = new Counter({
  name: 'wikidata_local_dump_hits_total',
  help: 'Local Wikidata dump fallback hits',
  registers: [registry],
});

export const wikidataDumpLastRefresh = new Gauge({
  name: 'wikidata_dump_last_refresh_timestamp_seconds',
  help: 'Unix timestamp of last successful Wikidata dump load',
  registers: [registry],
});
```

- [ ] Wire in WikidataBreakerClient + KnowledgeBaseCacheService + ingestion CLI
- [ ] Test integration : `/metrics` endpoint exposes all 7

**DoD** :
- [ ] All 7 metrics in `/metrics` output
- [ ] Buckets verified (`[0.05, 0.1, ..., 60]` seconds)

---

### Step 6.3 — Grafana panels

**État cible** : `infra/grafana/dashboards/chat-latency.json` étendu avec 5 panels nouveaux.

**Spawn agent** : editor.

**DoD** :
- [ ] Panel "KB Wikidata SPARQL p50/p95/p99 latency"
- [ ] Panel "KB cache hit-rate by tier" (`sum by(tier)(rate(wikidata_cache_hits_total[5m])) / total`)
- [ ] Panel "KB SPARQL circuit state over time"
- [ ] Panel "KB local dump hits per minute"
- [ ] Panel "KB dump age in days" (`(time() - wikidata_dump_last_refresh_timestamp_seconds) / 86400`)
- [ ] Dashboard committed + provisioned

---

### Step 6.4 — Alert rules

**État cible** : `infra/grafana/alerting/wikidata.yml` (nouveau fichier).

**Spawn agent** : editor.

**DoD** :
- [ ] Alert `wikidata_sparql_p95_high` : `histogram_quantile(0.95, rate(wikidata_sparql_request_duration_seconds_bucket[5m])) > 0.5` for 5m → warning
- [ ] Alert `wikidata_sparql_error_rate_high` : `sum(rate(wikidata_sparql_requests_total{outcome=~"error|timeout"}[5m])) / sum(rate(wikidata_sparql_requests_total[5m])) > 0.05` for 5m → critical
- [ ] Alert `wikidata_circuit_open_long` : `wikidata_sparql_circuit_state{state="open"} == 1` for 5m → critical
- [ ] Alert `wikidata_dump_stale` : `(time() - wikidata_dump_last_refresh_timestamp_seconds) > 30 * 86400` for 1h → warning
- [ ] Routes : warning → telegram-ops, critical → telegram-ops + email m.rivet@expertgcl.fr (cohérent T1.7 ROADMAP_TEAM)
- [ ] Self-test : `promtool check rules infra/grafana/alerting/wikidata.yml`

---

<a id="k"></a>
## §K — Phase 7 : Tests integration + chaos game-day

### Step 7.1 — Integration `wikidata-resilience.integration.test.ts`

**Spawn agent** : editor.

**DoD** :
- [ ] Test flow : KB lookup → cache miss → SPARQL OK → cache hit next call (tier fresh)
- [ ] Test flow : SPARQL fail (mock 5xx) → breaker counts → after 5 fails → OPEN → next call returns cached stale OR null
- [ ] Test flow : breaker OPEN >5s → dump fallback hits
- [ ] Test flow : breaker HALF_OPEN après resetTimeout → success → CLOSED → fetch normal repris
- [ ] Test flow : breaker OPEN sans dump match → null fail-open (jamais throw)

---

### Step 7.2 — Promptfoo regression (cross-link with C4.3)

**État cible** : si C4 dispatché en parallèle, ajouter scénarios "Wikidata down → dump answers correctly".

**Spawn agent** : editor.

**DoD** :
- [ ] Scenarios in C4 corpus reference `WIKIDATA_FORCE_DOWN=true` env to simulate.

---

### Step 7.3 — Chaos game-day (T4.3)

**État cible** : runbook `docs/CHAOS_RUNBOOKS.md` étendu, exécution staging.

**Spawn agent** : editor (writes runbook) + Tech Lead (executes manually).

**DoD** :
- [ ] Runbook section "Wikidata SPARQL down" : iptables block, verify breaker opens, dump fallback servi, alert Grafana fire ≤2min
- [ ] Test executed on staging — ≥1 alerte fired captured
- [ ] STORY.md `chaos` section append

---

<a id="l"></a>
## §L — Phase 8 : Doc + ADR + roadmap tick

### Step 8.1 — ADR-039 finalize

- [ ] Status `Proposed` → `Accepted-Implemented` au merge
- [ ] PR # + commit SHA

### Step 8.2 — ADR-035 amendment

- [ ] Section "Implementation update 2026-XX-XX" added : SWR 3-tier alignement, breaker via opossum, dump fallback documented

### Step 8.3 — `docs/ARCHITECTURE.md` chat KB diagram update

- [ ] Mermaid diagram updated avec breaker + cache SWR + dump fallback

### Step 8.4 — `docs/CHAOS_RUNBOOKS.md` Wikidata down runbook

- [ ] Section dédiée

### Step 8.5 — `docs/DOCS_INDEX.md` update

- [ ] ADR-039 entry, lien vers ce plan

### Step 8.6 — Roadmap tick proposal

- [ ] Hook post-cycle-roadmap-update.sh
- [ ] Verdict MATCH expected pour C5.1, C5.2, C5.3, C5.4

---

<a id="m"></a>
## §M — Verifier + Reviewer + closing

### Step 9.1 — Verifier final

- [ ] `pnpm test` BE — baseline 4150 + nouveaux passent
- [ ] `pnpm lint` + `pnpm tsc --noEmit` + `pnpm test:contract:openapi` BE
- [ ] Migration verify : `pnpm migration:run` puis `node scripts/migration-cli.cjs generate --name=Check` empty
- [ ] CLI ingestion smoke run : 100 items in <30s, checkpoint table OK
- [ ] gitnexus_detect_changes() — scope expected
- [ ] STORY.md `verify`

### Step 9.2 — Security agent (enterprise gate)

- [ ] User-Agent WMF format compliance
- [ ] SPARQL injection vectors verified (assertEntityId + escapeSparqlLiteral coverage)
- [ ] No PII in Langfuse spans (searchTerm hashed)
- [ ] Subprocess args sanitization (CLI ingestion)
- [ ] STORY.md `security`

### Step 9.3 — Reviewer fresh-context final

- [ ] Spawn via Agent tool fresh-context
- [ ] Inputs : spec, design, diff, paths
- [ ] 5-axis weighted score ≥ 85 ; cap 2 loops
- [ ] STORY.md `review`

### Step 9.4 — Cost delta + lesson capture

- [ ] cost-aggregate.sh + cost-history.sh
- [ ] state.status=completed BEFORE lesson hook
- [ ] post-complete-lesson-capture.sh
- [ ] team-knowledge/lessons/$RUN_ID.md produced

### Step 9.5 — Tech Lead commit + roadmap tick

- [ ] Tech Lead reviews changes
- [ ] git add specific
- [ ] commit `feat(C5): Wikidata résilience — circuit-breaker opossum + cache SWR 3-tier + dump fallback + observabilité`
- [ ] Apply roadmap-tick patch (manual review)
- [ ] Optional milestone : promote run

---

<a id="n"></a>
## §N — Predicted issues & mitigations (consolidated)

| ID | Issue | Phase | Sévérité | Mitigation |
|----|-------|-------|----------|-----------|
| 🔮 N1 | opossum 9 requires Node ≥20 | Step 2.1 | LOW | Verify `engines.node` in package.json before |
| 🔮 N2 | `errorFilter` semantics changed in opossum 9 vs 8 | Step 2.2 | MED | Test 8 spec cases, especially 404-not-counted |
| 🔮 N3 | TypeORM doesn't auto-generate GIN — need custom SQL | Step 4.1 | MED | Documented in design D8 ; manual edit migration |
| 🔮 N4 | Disk space ingestion 110-130 GiB | Step 4.3 | HIGH | Streaming only, no on-disk dump file ; verify in test |
| 🔮 N5 | Subclass closure miss subclasses (e.g. portrait Q134307) | Step 4.3 | MED | V1 limitation documented ; expand allowlist V1.1 post-launch |
| 🔮 N6 | Cache thundering-herd at refresh | Step 3.2 | MED | SETNX single-flight 30s lock |
| 🔮 N7 | WMF User-Agent absent → 403 prod | Step 2.4 | HIGH | Env var REQUIRED (no empty default), security gate verify |
| 🔮 N8 | Multi-instance breaker state divergence | wiring | LOW | V1 single-instance ; ADR-040 LATER for Redis-shared |
| 🔮 N9 | Background refresh fail silently | Step 3.2 | MED | Langfuse span "background refresh failed" + Prometheus counter |
| 🔮 N10 | Migration drift between forward+revert | Step 4.1 | MED | Gov : verify `generate Check` empty, V1 self-test |
| 🔮 N11 | Wikidata 5xx spike masquerading as breaker open false-positive | Step 2.x | MED | NFR2 threshold 5 fails / 60s (not 1) ; HALF_OPEN test rapide |
| 🔮 N12 | Stale dump (>30j) → outdated facts served when circuit OPEN | Step 6.4 | MED | NFR6 alerte ≥30j ; cron weekly ingestion |
| 🔮 N13 | Subprocess sanitization in CLI ingestion | Step 4.3 | HIGH | Args from env config + hardcoded QIDs only, no user input |
| 🔮 N14 | bottleneck import resolution | Step 4.3 | LOW | npm well-known package, verify in pnpm-lock |
| 🔮 N15 | Backward-compat break sur signature `KnowledgeBaseService.lookup()` | Step 3.3 / 5.1 | HIGH | Signature unchanged ; tests integration verify |
| 🔮 N16 | Reviewer rubber-stamp | Step 9.3 | HIGH | Fresh-context Agent tool spawn (V12 §8) ; weightedMean ≥ 85 |
| 🔮 N17 | Cap=2 reviewer insuffisant si refactor large | Step 9.3 | LOW | Escalade humaine, replanifier |

---

<a id="o"></a>
## §O — Bibliographie

### Wikidata / WDQS / Dumps
- [Wikidata SPARQL query limits](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_limits)
- [Wikidata Data access](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [Wikidata Database download](https://www.wikidata.org/wiki/Wikidata:Database_download)
- [WMF User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
- [WDQS Runbook (Wikitech)](https://wikitech.wikimedia.org/wiki/Wikidata_query_service/Runbook)
- [WDQS User Manual](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)
- [wikibase-dump-filter Codeberg](https://codeberg.org/maxlath/wikibase-dump-filter)
- [WikiProject sum of all paintings](https://www.wikidata.org/wiki/Wikidata:WikiProject_sum_of_all_paintings)
- [Q3305213 painting](https://www.wikidata.org/wiki/Q3305213)

### Circuit breaker / opossum
- [opossum @ npm](https://www.npmjs.com/package/opossum)
- [Nodeshift opossum docs](https://nodeshift.dev/opossum/)
- [opossum CHANGELOG](https://github.com/nodeshift/opossum/blob/main/CHANGELOG.md)
- [DEV.to Circuit Breaker production](https://dev.to/axiom_agent/nodejs-circuit-breaker-pattern-in-production-opossum-fallbacks-and-resilience-engineering-1mj4)

### PostgreSQL JSONB / GIN
- [Crunchy Data Indexing JSONB](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres)
- [Postgres GIN indexes](https://www.postgresql.org/docs/current/gin.html)
- [pganalyze GIN guide](https://pganalyze.com/blog/gin-index)
- [Elysiate JSONB Best Practices](https://www.elysiate.com/blog/postgresql-jsonb-performance-best-practices)

### Cache strategies
- [System Overflow TTL+SWR](https://www.systemoverflow.com/learn/caching/cache-invalidation/time-based-invalidation-ttl-stale-while-revalidate-and-expiry-strategies)
- [DebugBear stale-while-revalidate](https://www.debugbear.com/docs/stale-while-revalidate)

### Observability
- [Langfuse JS/TS SDK Overview](https://langfuse.com/docs/observability/sdk/overview)
- [Langfuse Advanced Configuration](https://langfuse.com/docs/observability/sdk/typescript/advanced-usage)
- [OTel Exception semconv](https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-spans/)
- [Prometheus histograms guide](https://prometheus.io/docs/practices/histograms/)
- [Last9 histogram buckets](https://last9.io/blog/histogram-buckets-in-prometheus/)

### Batch ingestion
- [Inngest Rate Limiting](https://www.inngest.com/docs/guides/rate-limiting)
- [Airbyte Idempotency](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [bottleneck @ npm](https://www.npmjs.com/package/bottleneck)

### TypeORM
- [TypeORM Indices](https://typeorm.io/docs/advanced-topics/indices/)
- [TypeORM Issue #1519 (GIN auto-gen)](https://github.com/typeorm/typeorm/issues/1519)

### SPARQL injection
- [Apache Jena ParameterizedSparqlString](https://jena.apache.org/documentation/query/parameterized-sparql-strings.html)

### Step-by-step plan patterns
- [Building effective agents — anthropic.com](https://www.anthropic.com/research/building-effective-agents)
- [Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [GitHub Spec Kit](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- [Cognition — Don't build multi-agents](https://cognition.ai/blog/dont-build-multi-agents)

---

**Honnêteté UFR-013 finale** :
- Tous les `path:line` du plan vérifiés via Explore agent (subagent #4 audit codebase) sur main HEAD `13c98563` 2026-05-10.
- Versions npm exactes : `opossum ^9.0.0` confirmé via WebSearch ; `wikibase-dump-filter ^6.1.1` Codeberg ; `bottleneck ^2.19.5` standard. **À pin avant release** dans le `package.json`.
- Wikidata dump frequency CORRIGÉ : **hebdomadaire** (pas mensuel comme dans la première version du plan). Source : Wikidata:Database_download officielle.
- WDQS rate limits CORRIGÉ : **60s query-time/min** (pas 5 query/min). Source : official query_limits page.
- QID scope V1 RÉVISÉ : **50-100k** (pas 10-20k initial). Source : WikiProject sum of all paintings + analyse research.
- Estimation throughput dump filter "30-90 min" subset art : **extrapolation** depuis benchmark humans 3h/15M items, NON testé en bench dédié — à valider première run.

**Doctrine no-flag (revision 2026-05-10)** : ce plan a été révisé pour supprimer les kill-switches `WIKIDATA_CB_ENABLED` et `WIKIDATA_LOCAL_DUMP_ENABLED` initialement prévus. Raison : `feedback_no_feature_flags_prelaunch.md` — pré-launch V1 (ship 2026-06-01), pas d'utilisateurs réels à protéger d'un mauvais rollout, donc bake-plans + flag flips = pure overhead (env.ts bloat + double test path + deploy choreography qui ne sera jamais exercée). Le breaker circuit-breaker reste (c'est de la résilience runtime, pas un toggle) ; le dump fallback s'active automatiquement sur état CB OPEN + soak `LOCAL_DUMP_FALLBACK_AFTER_MS` (tuning, pas un switch). Rollback en cas d'incident = `git revert <sha>` + redeploy. Doctrine inverse post-revenue B2B (premier musée payant).

**Run ID suggéré** : `2026-XX-XX-c5-wikidata-resilient`.
**Pipeline** : `enterprise`.
**Cap loops** : 2 (V12).
**Reviewer** : fresh-context obligatoire (V12 §8).
**Recommandation séquentielle** : C5 AVANT C4 (rend C4.1 plus chirurgical).
