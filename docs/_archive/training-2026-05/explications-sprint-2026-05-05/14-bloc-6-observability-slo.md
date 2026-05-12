# 14 — Bloc 6 partie 5 : Observability + SLO + chaos (Spec H)

> **Pour qui ?** Toi, qui veux comprendre comment Musaium devient mesurable en production : Prometheus metrics, Grafana dashboard, SLOs définis, k6 load test runbook.
> **Durée de lecture :** ~10 minutes.

---

## Pourquoi parler "observability" ?

Avant ce sprint, tu avais Sentry (qui capture les exceptions) + Langfuse (qui trace les appels LLM). Mais aucun moyen de répondre à des questions opérationnelles type :
- "Combien de requêtes/seconde le backend traite en ce moment ?"
- "Quelle est la latence p99 de `/chat/messages` ?"
- "Le hit rate du cache LLM est-il en train de chuter ?"
- "Combien d'erreurs 5xx en cumulé sur les 24 dernières heures ?"

Ces questions nécessitent des **métriques temporelles** (séries de chiffres avec timestamp), pas des logs textuels. C'est ce qu'apportent Prometheus + Grafana.

---

## Vocabulaire observability

| Terme | Définition |
|-------|------------|
| **Metric** | Une série temporelle de valeurs numériques avec timestamp + labels. |
| **Counter** | Métrique qui ne fait qu'augmenter (nb requests, nb hits cache). Tu calcules le delta entre deux ticks. |
| **Histogram** | Métrique qui mesure la distribution (latence : combien de requests <50 ms, <100 ms, <500 ms…). |
| **Gauge** | Métrique qui peut monter ou descendre (RAM utilisée, nb users connectés). Pas utilisé chez Musaium pour le moment. |
| **RED** | Rate (req/s), Errors (taux d'erreur), Duration (latence). Trio de base pour observer un service HTTP. |
| **SLO** | Service Level Objective. La promesse que tu te fais ("99.9 % de uptime"). |
| **SLI** | Service Level Indicator. La métrique qui mesure si tu tiens ton SLO. |
| **Error budget** | Tolérance d'erreur dans ta période. Pour 99.9 %/mois = 43 minutes d'indisponibilité acceptable. |

---

## Le `/metrics` endpoint et `prom-client`

Lib npm : `prom-client@^15`. Standard Prometheus côté Node.

`museum-backend/src/shared/observability/prometheus-metrics.ts`

```ts
export const registry = new Registry();

// Default Node.js process metrics (CPU, memory, event-loop lag, etc).
collectDefaultMetrics({ register: registry });

/** RED — Rate. Total HTTP requests by route + status + method. */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests served',
  labelNames: ['route', 'status', 'method'] as const,
  registers: [registry],
});

/** RED — Duration. HTTP request latency histogram. */
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['route', 'method'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Subsystem G — LLM cache hit counter, partitioned by context class. */
export const llmCacheHitsTotal = new Counter({
  name: 'llm_cache_hits_total',
  help: 'Total LLM response cache hits',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

export const llmCacheMissesTotal = new Counter({
  name: 'llm_cache_misses_total',
  help: 'Total LLM response cache misses',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

/** Returns the Prometheus-format metrics dump. */
export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
```

Lecture :

1. **Registry** : conteneur des métriques.
2. **`collectDefaultMetrics`** : ajoute automatiquement les métriques Node.js par défaut (CPU, RAM, event loop lag, GC).
3. **`httpRequestsTotal`** : Counter avec 3 labels. Permet de filtrer "combien de POST /chat/messages avec status 500".
4. **`httpRequestDurationSeconds`** : Histogram avec 10 buckets. Permet de calculer p50, p95, p99 latence.
5. **`llmCacheHitsTotal` / `llmCacheMissesTotal`** : counters business spécifiques (cf. doc 13).
6. **`renderMetrics()`** : retourne le format texte Prometheus pour le scrape.

### Le middleware Express qui alimente

`museum-backend/src/helpers/metrics-middleware.ts` (47L) — middleware qui :
- Au début de la requête : démarre un timer.
- À la fin : `httpRequestsTotal.inc({ route, status, method })` + `httpRequestDurationSeconds.observe({ route, method }, durationSeconds)`.

Et `museum-backend/src/app.ts` mount `GET /metrics` qui appelle `renderMetrics()`.

### Comment Prometheus l'utilise

Tu installes un Prometheus server (sur le VPS ou ailleurs) qui scrape `https://api.musaium.app/metrics` toutes les 15-60 secondes. Il stocke les valeurs avec timestamps.

---

## Grafana dashboard

`docs/observability/musaium-backend-dashboard.json` — fichier exportable Grafana 11+ avec 5 panels :

1. **HTTP request rate** — courbe req/sec par route.
2. **p50 / p95 / p99 latency by route** — courbes de percentiles latence.
3. **5xx error rate** — taux d'erreur avec threshold colouring (vert si <0.1%, jaune <1%, rouge ≥1%).
4. **LLM cache hit ratio** — vert ≥60 %, jaune ≥30 %, rouge <30 %.
5. **Process RSS + heap** — RAM Node.js.

Pour l'utiliser : tu installes Grafana, tu pointes ton Prometheus, tu importes ce JSON via UI ("Dashboards → Import → upload JSON").

---

## SLO + error budget (`docs/SLO.md`)

Le sprint a explicitement défini les SLOs Musaium :

| SLI | SLO | Error budget |
|-----|-----|--------------|
| API uptime (% de requests réussies) | **99.9 %** | 0.1 %/mois = **43 minutes/mois** |
| `/chat/messages` p99 latency | **<5 secondes** | (mesuré, pas un quota) |
| LLM cache hit ratio | **≥30 %** | (signal d'optimisation, pas un quota strict) |

### Que faire de l'error budget

`docs/SLO.md` codifie 2 seuils :
- **Soft freeze ≥50 % consommé** : on ralentit les feature releases, on priorise la fiabilité.
- **Hard freeze ≥80 % consommé** : aucune feature ne merge, uniquement bug fixes + improvements de fiabilité.

C'est la pratique standard "SLO-driven engineering" (popularisée par Google SRE book).

---

## k6 load test runbook : `stress-100k-rps.k6.js`

**Quoi :** un script k6 qui simule 100 000 requêtes/seconde contre l'API.

**Statut :** **NOT auto-run in CI**. C'est trop coûteux et risqué pour tourner en CI sur chaque PR. C'est un runbook pour les tests de capacité ponctuels avant des launches majeures.

**Pre-flight checklist** (documentée dans `helpers/100k-runbook.md`) :
- ≥50 backend replicas
- PgBouncer provisionné
- PG read replicas provisionnés
- Redis Cluster provisionné
- Cloudflare CDN actif
- k6 distributed mode (1 instance ne tient pas 100K rps)
- On-call notifié

C'est cohérent avec doc 12 : tu n'utiliseras pas ce script avant Tier 3, ce qui est hypothétique pour V1.

---

## Pourquoi c'est pertinent pour Musaium

### Sans observability tu pilotes à l'aveugle

Tu déploies V1 le 1er juin. Le 5 juin un user te dit "le chat est lent". Sans Prometheus + Grafana :
- Tu ne sais pas si c'est lent depuis hier ou depuis 5 minutes.
- Tu ne sais pas si c'est tous les users ou un seul.
- Tu ne sais pas quelle route est lente (login ? chat ? upload image ?).

Avec : tu ouvres Grafana, tu vois "ah, p99 chat/messages a explosé à 2026-06-05 14:32 sur tous les users", tu corrèles avec un Sentry release, tu rollback.

### SLO = contract avec toi-même

Sans SLO défini, tu ne sais pas si une indispo de 30 minutes est tolérable ou catastrophique. Avec SLO 99.9 % et error budget 43 min, tu sais :
- 30 min consommées = 70 % budget restant = tu peux continuer à shipper.
- 35 min consommées = 81 % = HARD FREEZE.

Ça transforme la décision "ship ou pas" d'une intuition en chiffre.

---

## Trade-offs honnêtes

### Provisioning Prometheus + Grafana

**Pas inclus dans le sprint.** Tu dois monter :
- Prometheus server (1 container Docker).
- Grafana (1 container Docker).
- Persistent volume pour Prometheus (idéalement TSDB compressé).

Pour V1 sur 1 VPS, ~30 min de setup. Tu peux aussi utiliser Grafana Cloud free tier (jusqu'à 10 K séries gratuites).

### Pas d'alerting Prometheus

Prometheus a un Alertmanager natif (envoie sur Slack/email/PagerDuty quand une métrique dépasse un seuil). Pas configuré en V1. À ajouter post-launch :
- Alert "uptime <99.9% sur 5 min" → Slack ops.
- Alert "p99 chat/messages >5s" → Slack ops.

### Métriques business limitées

Tu as les RED + le LLM cache. Tu n'as pas :
- Nb signups par jour.
- Nb messages par session.
- Conversion freemium → paid.

C'est volontaire : ces métriques business sont mieux trackées par un produit dédié (Mixpanel, Plausible, ou agent SQL custom). Ne pas mélanger ops metrics et product metrics.

---

## Est-ce overkill ?

**Non**, c'est même la **base** pour shipper un service en prod sérieux. Coût d'implémentation : 1 fichier `prometheus-metrics.ts` (50L) + 1 middleware (47L) + 1 dashboard JSON. ~1 jour de dev étalé.

L'effort de provisioning Prometheus + Grafana = ~1 jour ops séparé, pas dans le sprint.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Vérifier que `/metrics` répond | `curl https://api.musaium.app/metrics` doit retourner du texte type `# HELP http_requests_total ...` |
| Provisionner Prometheus + Grafana sur le VPS | À faire pour V1 launch (~1 jour ops) |
| Importer `docs/observability/musaium-backend-dashboard.json` dans Grafana | Une fois Grafana up |
| Lire `docs/SLO.md` | Pour avoir le contract en tête |
| Configurer alertes Alertmanager | Recommandé post-launch (~1 jour) |
| Surveiller l'error budget mensuel | À chaque fin de mois, regarder l'uptime cumulé |
| Lancer k6 stress-100k-rps | **Pas avant Tier 3**, hypothétique post-launch+12mois |

---

## Bonus : 4 nouvelles métriques utiles à ajouter post-launch

Quand tu auras du recul prod, tu voudras peut-être :

1. **`auth_login_attempts_total{result}`** — distinguer login OK / KO / rate-limited.
2. **`tts_synthesis_duration_seconds`** — pour repérer si la synthèse TTS dérive.
3. **`stt_transcription_duration_seconds`** — pour repérer si le STT dérive (Whisper).
4. **`db_query_duration_seconds{repository}`** — pour repérer les requêtes DB lentes.

Coût : 4 lignes dans `prometheus-metrics.ts` + .inc()/.observe() au call site. ~30 min/métrique.
