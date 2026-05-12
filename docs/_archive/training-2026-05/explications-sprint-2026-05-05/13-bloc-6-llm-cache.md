# 13 — Bloc 6 partie 4 : LLM response cache (Spec G)

> **Pour qui ?** Toi, qui veux comprendre comment Musaium évite de payer plusieurs fois le même appel LLM pour des questions identiques.
> **Durée de lecture :** ~8 minutes.

---

## Le problème en deux phrases

Sans cache, deux visiteurs qui posent la même question (`"qui est Vincent van Gogh ?"`) à 1 minute d'intervalle = 2 appels LLM = 2 fois le coût + 2 fois la latence.

Avec un cache bien fait, le second visiteur reçoit la réponse en ~50 ms (lookup Redis) au lieu de ~2 sec (LLM round-trip), et tu n'as payé qu'un seul appel LLM.

---

## Analogie : la FAQ

Une boutique en ligne qui reçoit chaque jour 100 fois la question "où est mon colis ?" peut soit :
- Faire répondre un humain à chaque fois (= LLM sans cache).
- Avoir une FAQ qui répond à 80 % automatiquement, l'humain ne voit que les 20 % vraiment uniques (= LLM avec cache).

Spec G met en place cette FAQ pour Musaium. Plus subtil : la FAQ ne répond que si la question est "générique" — pour une question personnalisée à un visiteur précis, on retombe sur le LLM.

---

## Vocabulaire LLM cache

| Terme | Définition |
|-------|------------|
| **ContextClass** | Catégorie de question selon son contexte. Détermine le TTL (time-to-live) du cache. |
| **TTL** | Durée de validité d'une entrée de cache. Au-delà, l'entrée expire et l'appel LLM est refait. |
| **Cache hit** | La question est déjà en cache, on retourne la réponse cachée. |
| **Cache miss** | Pas dans le cache, on appelle le LLM, on stocke la réponse. |
| **Invalidate** | Supprimer une entrée du cache forcement (ex : la fiche d'un musée a été modifiée). |
| **prefix-key** | Toutes les keys qui commencent par X. Permet de purger un sous-ensemble du cache. |

---

## Les 3 ContextClass adoptées

### `generic` — TTL 7 jours

**Quoi :** question sans contexte musée et sans préférences user. Type "qui est Vincent van Gogh ?", "qu'est-ce que l'impressionnisme ?".

**Pourquoi 7 jours :** la réponse à "qui est van Gogh" ne change pas. 7 jours est un compromis entre fraîcheur (au cas où on update notre prompt système) et hit ratio.

### `museum-mode` — TTL 24 heures

**Quoi :** question avec un `museumId` actif. Type "quelles sont les œuvres principales du Louvre ?", "horaires du musée d'Orsay".

**Pourquoi 24h :** les fiches musée bougent (horaires, expositions courantes). 24h = staleness max acceptable. Tu peux invalider plus tôt en éditant la fiche depuis l'admin (cf. tech debt plus bas).

### `personalized` — TTL 1 heure

**Quoi :** question avec contexte UserMemory (langue préférée, durée P90). Type "résume-moi van Gogh" pour un user FR-FR avec sessions courtes → réponse adaptée.

**Pourquoi 1h :** par construction, c'est presque toujours un cache miss (chaque user a sa hash distincte de préférences). 1h pour les rares cas où le même user repose la même question.

---

## La logique de classification

`museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:32-42` (référencé)

```ts
classify(input: LlmCacheKeyInput): LlmContextClass {
  if (input.userPreferencesHash) {
    return 'personalized';
  }
  if (input.museumContext?.museumId !== undefined && input.museumContext.museumId !== null) {
    return 'museum-mode';
  }
  return 'generic';
}
```

Lecture :
1. **Si `userPreferencesHash` présent** → personalized. La hash est générée à partir des champs UserMemory (langue, durée P90, etc.). Différent user = différente hash = différente cache key.
2. **Sinon, si `museumId` présent** → museum-mode.
3. **Sinon** → generic.

L'ordre est important : le **plus restrictif d'abord** (personalized < museum < generic). Une question avec `museumId` ET `userPreferencesHash` est `personalized`.

---

## La key shape (cruciale)

Format : `llm:v1:<contextClass>:<museumId|none>:<userId|anon>:<sha256>`

Exemples :
- Question générique sans login : `llm:v1:generic:none:anon:abc123...`
- Question Louvre par anon : `llm:v1:museum-mode:42:anon:def456...`
- Question Louvre par user 100 personnalisée : `llm:v1:personalized:42:100:ghi789...`

Le `<sha256>` est le hash du **prompt complet** (système + user + contexte) pour distinguer deux questions différentes.

**Pourquoi `museumId AVANT userId` ?** Parce que ça permet `delByPrefix(llm:v1:museum-mode:42:)` pour invalider tout le cache d'un musée donné, à travers tous les users. Si l'ordre était inversé (`userId` avant), on devrait scanner tous les namespaces user pour purger un musée.

---

## Le lookup et store

```ts
async lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>> {
  const contextClass = this.classify(input);
  const key = this.buildKey(input, contextClass);
  const value = await this.cache.get<T>(key);
  if (value !== null) {
    llmCacheHitsTotal.inc({ context_class: contextClass });
  } else {
    llmCacheMissesTotal.inc({ context_class: contextClass });
  }
  return { hit: value !== null, value, contextClass };
}
```

Lecture :
- Lookup Redis avec la key.
- **Counter Prometheus** `llm_cache_hits_total` / `llm_cache_misses_total` par contextClass — exposé via `/metrics`, visible dans Grafana (cf. doc 14).
- Retourne `{ hit, value, contextClass }`.

Le `chat.service` enchaîne :
1. `cache.lookup(input)` → si hit, return `value`.
2. Sinon, appelle le LLM.
3. `cache.store(input, response)` avec le TTL adaptatif.

---

## Pourquoi c'est pertinent pour Musaium

### Cost control

Coût LLM moyen par appel : ~$0.001-0.005 selon provider + tokens. Sur 10 000 messages/jour à 30 % hit rate cache = 3 000 appels LLM économisés = ~$3-15/jour épargnés. À l'échelle de 1M users = milliers d'€/mois.

### Latence

Cache hit = ~50 ms (Redis lookup). Cache miss = ~1.5-2.5 sec (LLM round-trip). Pour le user qui pose une question populaire, **expérience 30x plus rapide**.

### Première surface de cost-control sur LLM spend

Avant Spec G, Musaium n'avait **aucun moyen** de plafonner les coûts LLM hors throttling de l'API. Avec le cache, tu as une vraie levier : la première question coûte, les suivantes sont gratuites.

---

## Pourquoi 3 TTL plutôt qu'un seul ?

Si on met 24h pour tout : les questions personnalisées remplissent inutilement Redis (presque tous des miss). Si on met 1h pour tout : les questions génériques ne profitent jamais du long-terme.

**TTL adaptatif** = chaque classe a son TTL optimal pour son hit rate attendu.

---

## Tech debt (documentée et assumée)

### `invalidateMuseum` defined but admin wiring deferred

Le service expose une méthode `invalidateMuseum(museumId)` qui fait `cache.delByPrefix("llm:v1:museum-mode:42:")`. C'est pensé pour qu'**à chaque update de fiche musée par un admin, on invalide automatiquement le cache de ce musée**.

**Mais le wiring depuis l'admin n'est pas branché**. Pourquoi ? Parce que ça créerait une **circular dependency** entre le module `museum` (qui produit l'event "museum updated") et le module `chat` (qui possède `LlmCacheService`).

Solutions possibles :
- Event bus interne (publish/subscribe).
- Dependency injection inverse (museum injecte un callback `onMuseumUpdated`).

**Conséquence en V1 :** un admin met à jour les horaires du Louvre → la cache museum-mode tient jusqu'à 24h de staleness avant de se renouveler. Pas catastrophique, mais sub-optimal.

**Fix recommandé post-launch :** event bus minimal (ou direct callback registered au boot de `chat-module.ts`).

### Cache key versionné `v1`

Si un jour tu changes le format de prompt (donc la sémantique de la réponse), tu peux bump `v1 → v2` dans la key shape. Toutes les vieilles entrées deviennent dead naturally (elles expirent), et le nouveau code écrit sous `v2`. Pas de migration, pas de purge manuelle.

C'est **prévoyant** — ça t'évitera des bugs subtils où un changement de prompt système ne se reflète pas dans les réponses cachées.

---

## Est-ce overkill ?

**Non**, c'est même un must pour tout système chat LLM en prod. Coût d'implémentation : ~120 LOC + 11 unit tests. Coût runtime : un lookup Redis par message (~5 ms).

L'alternative (pas de cache) = **coûts LLM linéaires en nb messages**, sans optimisation possible. Pour 100 000 visiteurs, divergence rapide.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Vérifier que le cache est wired en prod | Logs Prometheus `llm_cache_hits_total` doivent apparaître dans `/metrics` |
| Surveiller le hit ratio dans Grafana | Cf. doc 14 — panel "LLM cache hit ratio" (vert ≥60%, jaune ≥30%, rouge <30%) |
| Wirer `invalidateMuseum` post-launch | Tech debt à fermer pour V1.1 |
| Tester `cache.invalidateMuseum(42)` à la main | Via REPL : SET puis call invalidate puis vérifier que les keys sont gone |
| Tuner les TTLs si données réelles l'indiquent | Env vars dédiées si tu en ajoutes |

---

## Métrique à observer

| Métrique | Cible | Alerte si |
|----------|-------|-----------|
| `llm_cache_hits_total{context_class="generic"}` | hit ratio ≥60% | <30% = revoir les keys (peut-être que les questions ne se ressemblent pas autant qu'on pensait) |
| `llm_cache_hits_total{context_class="museum-mode"}` | hit ratio ≥40% | <20% = peut-être TTL trop court ou keys mal stratifiées |
| `llm_cache_hits_total{context_class="personalized"}` | hit ratio ≥10% | <5% normal — le perso est presque toujours unique |
| RAM Redis | <1 GB en V1 | >2 GB = soit purge stale, soit augmenter le node Redis |
