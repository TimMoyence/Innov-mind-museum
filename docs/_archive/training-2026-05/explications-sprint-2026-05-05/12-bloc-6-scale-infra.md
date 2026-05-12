# 12 — Bloc 6 partie 3 : Scale infrastructure (Spec F)

> **Pour qui ?** Toi, qui veux comprendre comment Musaium est **préparé** (mais pas encore provisionné) pour scaler de ~10 req/sec aujourd'hui à 1K puis 100K req/sec.
> **Statut important :** **design-shipped, provisioning deferred to ops**. Les 4 ADRs documentent les décisions, les "code knobs" sont en place, mais **rien n'est encore provisionné** sur ton VPS actuel.
> **Durée de lecture :** ~10 minutes.

---

## Le contexte

Ton VPS actuel = 1 backend + 1 Postgres + 1 Redis + 1 web + 1 llm-guard. Suffisant pour 10-50 visiteurs concurrents. **Le sprint a posé les fondations pour aller jusqu'à 100K req/sec sans avoir à tout réécrire**.

Le mot-clé est **fondations** : code qui sait s'adapter quand tu provisionnes l'infra correspondante. Pas de déploiement multi-instance V1.

---

## Vocabulaire infra

| Terme | Définition |
|-------|------------|
| **PgBouncer** | Pooler de connexions Postgres. Multiplexe N connexions client en M connexions DB beaucoup plus petit (typiquement 1000 → 30). |
| **Read replica** | Copie en lecture seule de la DB principale. Tu route les SELECT vers la replica, les UPDATE vers le primary. |
| **Redis Cluster** | Mode multi-instance Redis avec sharding automatique. Pour scale au-delà des limites RAM d'un seul nœud. |
| **Redis Sentinel** | Mode HA Redis : 1 master + N slaves + Sentinels qui font le failover automatique. |
| **CDN (Cloudflare)** | Réseau de caches géo-distribués pour servir les static assets près du user. |
| **DataSource** (TypeORM) | Connexion DB. Avec deux DataSources, tu peux router lecture/écriture indépendamment. |
| **PgBouncer transaction mode** | Mode où une connexion DB n'est pas dédiée à un client mais à une transaction. Plus efficace mais interdit certains patterns SQL. |

---

## Les 4 décisions ADR

### ADR-021 — PgBouncer en transaction mode

**Quoi :** Pooler PgBouncer entre `backend` et `postgres`, en mode "transaction" (pas "session").

**Pourquoi transaction mode :** dans ce mode, une connexion Postgres n'est dédiée à un client backend que le temps d'une transaction. Au commit, la connexion est libérée pour un autre client. Permet à 1000 backend instances de partager 30 connexions Postgres réelles.

**Trade-off :** **interdit** :
- `LISTEN/NOTIFY` (différent de "subscribe Postgres notifications"). Musaium n'en utilise pas.
- Session-scoped advisory locks (`pg_advisory_lock`). Audit verifié : Musaium utilise un seul advisory lock dans `audit-chain repo`, et c'est **xact-scoped** (`pg_advisory_xact_lock`), donc auto-released au COMMIT. Safe en transaction mode.
- Persistent prepared statements. TypeORM ne s'en sert pas.

**Code knobs :** dans `museum-backend/deploy/docker-compose.prod.yml`, le service `pgbouncer` est déjà là (en attente d'utilisation). Le backend pointe `DB_HOST=pgbouncer DB_PORT=6432`.

```yaml
pgbouncer:
  image: edoburu/pgbouncer:v1.24.1-p1
  hostname: pgbouncer
  depends_on:
    db:
      condition: service_healthy
  environment:
    DB_USER: ${DB_USER}
    DB_PASSWORD: ${DB_PASSWORD}
  volumes:
    - ./deploy/pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
  ...
```

**Provisioning à faire un jour :** rien à activer côté code, juste s'assurer que `pgbouncer.ini` est bien configuré pour transaction mode (cf. fichier dans `museum-backend/deploy/pgbouncer/`).

### ADR-022 — Postgres read replica

**Quoi :** Une replica Postgres en lecture seule pour décharger les SELECTs lourds.

**Pourquoi :** au-delà de ~500 req/sec en lecture (analytics admin, listings musées, KB queries), une seule instance PG sature. Replica permet de doubler / tripler la capacité lecture sans rien changer aux writes.

**Code knob : `DataSourceRouter`** — un router lazy qui expose deux getters `read()` et `write()`. Tant que `DB_REPLICA_URL` n'est pas set, les deux retournent le même `AppDataSource`. Dès que tu mets `DB_REPLICA_URL=postgres://...`, le `read()` initialise une seconde DataSource pointée sur la replica.

Squelette logique :

```ts
// shared/db/data-source-router.ts
export const dataSourceRouter = {
  write(): DataSource {
    return AppDataSource;  // primary
  },
  read(): DataSource {
    if (!env.dbReplicaUrl) return AppDataSource;
    if (!replicaDataSource) {
      replicaDataSource = new DataSource({ url: env.dbReplicaUrl, ... });
    }
    return replicaDataSource;
  },
};
```

Les use cases qui font du read-heavy peuvent appeler `dataSourceRouter.read().query(...)`. Les writes restent sur `dataSourceRouter.write()`.

**Provisioning à faire un jour :** monter une 2e instance PG en streaming replication, set `DB_REPLICA_URL` dans `.env`, restart backend.

### ADR-023 — Redis Cluster vs Sentinel

**Quoi :** À 100K rps, un Redis seul sature en RAM (cache LLM + sessions + rate-limit + nonce). Deux options : Cluster (sharding) ou Sentinel (HA).

**Décision :** **Cluster** pour Musaium. Raisons :
- Sharding permet d'agrandir le cache au-delà de la RAM d'un nœud.
- Sentinel = HA mais pas de sharding → tu reste limité par la RAM d'un master.
- Multi-tenant (B2B musées) accentue le besoin de scale RAM.

**Code knob : `createRedisClusterClient`** — fonction qui retourne `null` si `REDIS_CLUSTER_NODES` n'est pas set, ou un client `ioredis Cluster` si défini :

```ts
// shared/cache/redis-cluster.ts
export function createRedisClusterClient(): Cluster | null {
  if (!env.redis.clusterNodes) return null;
  const nodes = env.redis.clusterNodes.split(',').map(s => {
    const [host, port] = s.split(':');
    return { host, port: parseInt(port, 10) };
  });
  return new Redis.Cluster(nodes, { ... });
}
```

**Provisioning à faire un jour :** monter 3+ Redis nodes (master+slaves), set `REDIS_CLUSTER_NODES=host1:6379,host2:6379,host3:6379`, redémarrer backend.

### ADR-024 — Cloudflare CDN pour statics + landing

**Quoi :** Cloudflare devant `museum-web` (landing) et les assets statiques (images uploadées, OpenAPI spec).

**Pourquoi :** un user à Tokyo qui visite la landing aujourd'hui = round-trip à ton VPS OVH France = ~250 ms. Avec Cloudflare = cache local Tokyo = ~30 ms.

**Code knob : `httpCacheHeaders` middleware Express** — pose les bons `Cache-Control` headers pour 4 classes d'assets :

| Classe | Header | Usage |
|--------|--------|-------|
| static-immutable | `Cache-Control: public, max-age=31536000, immutable` | JS/CSS hashés (filename change si content change) |
| index-html | `Cache-Control: public, max-age=0, must-revalidate` | Pages HTML, doit revalider à chaque request |
| openapi-json | `Cache-Control: public, max-age=300, stale-while-revalidate=86400` | Le `openapi.json` change à chaque deploy |
| landing | `Cache-Control: public, max-age=60, stale-while-revalidate=3600` | Pages marketing, peut tolérer 1h de staleness |

**Provisioning à faire un jour :** créer un compte Cloudflare, ajouter les domaines `musaium.com` + `api.musaium.app`, configurer les Page Rules. Le code `httpCacheHeaders` envoie déjà les bons headers.

---

## Pourquoi avoir buildé tout ça en V1 ?

C'est la question légitime, pareil que pour cert pinning (cf. doc 05).

**Réponse honnête :** parce que les 4 ADRs + les code knobs ont coûté ~1 jour de design + ~1 jour de scaffold. **Étalé sur le sprint via parallélisme V12, ce n'est pas du temps "pris" sur d'autres features critiques V1.**

**Ce que ça t'apporte :**
1. **Plan d'action clair.** Le jour où tu dois scaler, tu ouvres l'ADR correspondant, tu suis les étapes, tu provisionnes. Pas de re-design.
2. **Code prêt.** Le jour où tu provisionnes, tu set 1-2 env vars, tu restart. Pas de refactor.
3. **Décisions tradées documentées.** Si dans 6 mois tu veux changer d'avis (ex : Sentinel au lieu de Cluster), l'ADR-023 explique pourquoi on a fait ce choix → tu peux le challenger en connaissance de cause.

**Ce que ça ne t'apporte PAS :**
- Aucune amélioration runtime aujourd'hui. Ton VPS V1 ne bénéficie de rien tant que tu ne provisionnes pas.
- Si tu ne lis jamais les ADRs, tout cet effort est perdu.

---

## Tableau récap "tier de capacité"

C'est documenté dans `docs/CAPACITY_PLAN.md`.

| Tier | Capacity | Infra requise | Statut Musaium |
|------|----------|---------------|----------------|
| Tier 1 | ~10 req/sec | 1 backend + 1 PG + 1 Redis | **Actuel V1** |
| Tier 2 | ~1K req/sec | 3 backends + PgBouncer + 1 PG + 1 replica + 1 Redis Cluster (3 nodes) | À provisionner si KR1 atteint |
| Tier 3 | ~100K req/sec | 50 backends + PgBouncer pooled + 1 PG + 5 replicas + Redis Cluster (10 nodes) + Cloudflare CDN | Hypothétique post-launch+12mois |

**Trigger de migration Tier 1 → Tier 2** : si tu dépasses 100 req/sec en pic (Grafana, cf. doc 14).

---

## Pourquoi c'est pertinent pour Musaium

### Pas pour V1, pour V1.1+

V1 launch = ~50-200 visiteurs concurrents max attendu. Tier 1 OK.

V1.1 si succès = signups sponsor, scale x10. Tier 2 nécessaire. Avoir le code prêt = tu provisionnes en 1 weekend au lieu de 2 semaines de refactor.

V1.2+ si vraie traction = tier 3. Le scaffold est là.

### Anti-pattern évité

**Ne PAS provisionner Tier 2/3 en V1**. Coûts :
- Tier 2 ≈ +200 €/mois (replica + Redis cluster + 3e backend instance).
- Tier 3 ≈ +5000 €/mois.

Pour 50 visiteurs/jour, c'est **gigantesquement overkill**. Le sprint a posé le **code**, pas l'**infra**. La distinction est cruciale.

---

## Est-ce overkill ?

**Le scaffold code = non.** ~2 jours de dev étalés sur le sprint via parallélisme.

**Le provisioning Tier 2/3 = oui, en V1.** Tu attends d'avoir les utilisateurs avant de payer l'infra.

C'est le bon ratio : **pay-as-you-grow** sur l'infra, **prepare-in-advance** sur le code.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Provisionner PgBouncer | **Pas en V1.** Le service est dans `docker-compose.prod.yml` mais déclenche peu de bénéfice tant que tu n'as qu'1 backend instance. |
| Provisionner read replica PG | **Pas en V1.** Trigger : pic >100 req/sec en lecture sur Grafana. |
| Provisionner Redis Cluster | **Pas en V1.** Trigger : Redis RAM >1 GB ou >50K ops/sec. |
| Configurer Cloudflare | **Optionnel V1, recommandé pour la landing publique.** ~30 min : créer compte, pointer DNS, configurer cache rules. Gratuit jusqu'à 100K rps. |
| Lire `docs/CAPACITY_PLAN.md` une fois | Recommandé pour avoir la map mentale. |
| Lire les 4 ADRs (021/022/023/024) | À ouvrir le jour où tu envisages le scaling. |

---

## Tech debt / risques

- **Aucun test e2e contre PgBouncer en CI.** Si demain tu actives le pooler, vérifier en staging d'abord (au cas où un endpoint exotique utiliserait un pattern interdit en transaction mode).
- **Code knobs jamais runtime-tested en multi-instance.** Le `DataSourceRouter` et `createRedisClusterClient` ont des unit tests mais pas d'intégration multi-instance. Premier vrai test = quand tu provisionnes.
- **CDN cache pourra mettre 1h à se purger sur les routes landing si tu deploy** — `stale-while-revalidate=3600`. Soit tu acceptes, soit tu set à 60s pendant la phase launch.
