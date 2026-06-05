# Thème A — La vague DRY / refactor (23 mai 2026)

> **Période** : 23-24 mai 2026 · **Commits couverts** : PR-1 à PR-16 (backend) + web Phases 1-4 · **Branche** : `dev`
>
> Ce que tu vas apprendre :
> - La mécanique du "extract helper + sweep" et pourquoi c'est différent d'un find-replace
> - Comment un circuit-breaker 3-états s'implémente proprement en TypeScript
> - Pourquoi le rate-limiting avec Redis nécessite un script Lua pour être correct
> - Le pattern XFetch / probabilistic early expiration pour éviter les cache stampedes
> - Composition React 19 : `BaseModal`, `useFetchData` avec `AbortController`

---

## Vue d'ensemble — pourquoi une semaine de refactor avant un launch ?

Le 23 mai, un audit KISS/DRY du backend a révélé **trois catégories de dette** :

1. **Duplications comportementales** : le même bloc de code (3-10 lignes) copié-collé dans 4 à 12 endroits. Si un bug existait dans l'original, il existait dans toutes les copies — en silence.
2. **Divergences silencieuses** : les copies avaient légèrement dérivé (messages d'erreur différents, `trim()` présent ou absent, status HTTP `400` vs `401`). Ces divergences étaient invisibles à la lecture d'un seul fichier.
3. **Surface d'audit grande** : code de sécurité (génération de tokens, rate-limit) répliqué → un correctif de sécu devait être appliqué à N endroits.

La stratégie adoptée : **extract helper + sweep mécanique**, 16 PR incrémentaux, chacun fermant un finding d'audit. Chaque PR suit le pipeline UFR-022 (Spec → Plan → Red → Green → Verify+Review).

---

## Concept transversal : le "extract helper + sweep" et le codemod

### Qu'est-ce qu'un codemod ?

Un codemod est une transformation mécanique du code source : on identifie un pattern répété, on crée une abstraction, puis on remplace chaque occurrence. L'adjectif "mécanique" est important : l'intention est de ne pas changer le comportement.

Dans ce projet, les codemods sont appliqués **à la main** (modification fichier par fichier), pas via un outil comme jscodeshift. La discipline est compensée par :

1. Un **test sentinel** écrit AVANT le sweep (phase Red UFR-022). Ce test lit les fichiers source sur disque avec `readFileSync` et vérifie l'absence du pattern inline + la présence de l'import du helper. Il échoue avant le sweep, passe après.
2. Des **assertions de comportement** qui prouvent que le wire-format (codes HTTP, codes machine-lisibles, messages) est préservé bit à bit.

### Pourquoi c'est plus sûr qu'un find-replace ?

Un find-replace aveugle peut :
- Supprimer un import encore utilisé ailleurs dans le même fichier
- Manquer une variante légèrement reformulée du pattern
- Introduire une divergence subtile (ex. `trim()` oublié dans un des sites)

Le sentinel test filesystem-scan détecte les deux premiers cas. Les tests comportementaux détectent le troisième. L'ensemble constitue un filet que le simple grep ne peut pas offrir.

---

## Décortiqué #1 : ThreeStateCircuit — la machine à états circuit-breaker (commit `8504b1e8`)

### L'intention

Avant ce PR, trois circuit-breakers (`LLMCircuitBreaker` 116 LOC, `LlmCostCircuitBreaker` 260 LOC, `GuardrailCircuitBreaker` 182 LOC) implémentaient chacun leur propre FSM CLOSED/OPEN/HALF_OPEN. Total : 558 LOC de logique FSM dupliquée. Un bug dans la transition lazy OPEN→HALF_OPEN existait potentiellement dans les 3 copies.

### L'automate à trois états

```
         failure × N           cooldown écoulé
CLOSED ────────────────► OPEN ─────────────────► HALF_OPEN
  ▲                                                  │ │
  │               probe success                      │ │ probe failure
  └──────────────────────────────────────────────────┘ │
                                                        ▼
                                                      OPEN
```

- **CLOSED** : fonctionnement normal. Chaque failure est enregistrée. Si la stratégie décide de "tripper" (`shouldTrip(now)`), passage en OPEN.
- **OPEN** : toutes les requêtes sont rejetées immédiatement (`CircuitOpenError`). Économise les ressources en aval (LLM API, guardrail).
- **HALF_OPEN** : après le cooldown, on admet un nombre limité de "probes" (1 par défaut). Si le probe réussit → CLOSED ; si il échoue → retour OPEN.

### La transition lazy (`museum-backend/src/shared/circuit-breaker/three-state-circuit.ts:96-114`)

```typescript
get state(): CircuitState {
  if (this.currentState === 'OPEN' && this.openedAtMs !== null) {
    const elapsed = this.nowFn() - this.openedAtMs;
    if (elapsed >= this.openDurationMs) {
      this.halfOpenedAtMs = this.nowFn();
      this.availableProbes = this.halfOpenMaxProbes;
      this.transitionTo('HALF_OPEN');
      this.openedAtMs = null;
    }
  }
  return this.currentState;
}
```

La transition OPEN→HALF_OPEN est **lazy** : elle se produit au moment où on lit `state`, pas dans un timer. Avantage : pas de `setInterval`, pas de goroutine, zéro thread. La primitive est pure (pas d'I/O), testable de manière déterministe en injectant `now` via le constructeur.

### Le pattern Strategy (interface `CircuitTripStrategy`)

La primitive ne sait pas QUAND tripper. Elle délègue cette décision à une stratégie pluggable :

```typescript
export interface CircuitTripStrategy {
  shouldTrip(now: number): boolean;
  pruneExpired(now: number): void;
  reset(): void;
  resetTransient(): void;
}
```

Deux stratégies concrètes dans `shared/circuit-breaker/strategies/` :
- `SlidingWindowFailureStrategy` : fenêtre glissante de timestamps d'échecs. Si N échecs en T ms → trip.
- `CostTripStrategy` : cumul de coût par heure et par jour UTC. Trip si cap dépassé.

La distinction `reset()` vs `resetTransient()` est une subtilité importante :
- `reset()` : réinitialise TOUT, y compris les accumulateurs durables (cap journalier dépensé). Réservé au kill-switch opérateur.
- `resetTransient()` : réinitialise la fenêtre de spike, mais **préserve** le cumul du jour. Appelé au retour HALF_OPEN→CLOSED pour ne pas "rembourser" l'argent LLM déjà dépensé.

### Le piège : `openedAt` et le callback `onStateChange`

```typescript
// openedAtMs est intentionnellement préservé à travers transitionTo
// pour que les callbacks onStateChange puissent lire le timestamp original.
// Il est effacé APRÈS le callback.
this.transitionTo('HALF_OPEN');
this.openedAtMs = null;
```

Si on avait effacé `openedAtMs` avant d'appeler `transitionTo`, les handlers Prometheus dans les wrappers n'auraient pas pu lire la durée d'ouverture du circuit. L'ordre des instructions est intentionnel et commenté.

### Comment c'est testé

Les tests injectent `now` via le constructeur : `new ThreeStateCircuit({ now: () => fakeTime })`. Pour simuler le passage du cooldown, on change `fakeTime` sans attendre. Déterministe, pas de `jest.advanceTimersByTime`.

---

## Décortiqué #2 : Redis Lua atomique pour le rate-limit (commit `e0cbe00f`)

### Le problème : race condition sur 2 round-trips

L'ancien `daily-chat-limit.middleware.ts` utilisait `CacheService.get` + `CacheService.set` :

```
[Client A]  GET daily-chat:user123  → 4
[Client B]  GET daily-chat:user123  → 4   ← lit la même valeur !
[Client A]  SET daily-chat:user123 = 5 (limite = 5 → autorisé)
[Client B]  SET daily-chat:user123 = 5 (limite = 5 → autorisé aussi !)
```

Résultat : sur N requêtes concurrentes (multi-device, rafale réseau), il est possible de dépasser le quota journalier freemium. Exploitable en production.

### La solution : script Lua atomique (`museum-backend/src/shared/middleware/redis-rate-limit-store.ts:16-28`)

```typescript
const INCR_EXPIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  return {count, tonumber(ARGV[1])}
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return {count, pttl}
`;
```

Ce script s'exécute via `redis.eval(INCR_EXPIRE_LUA, 1, redisKey, String(windowMs))`.

### Pourquoi Lua résout le problème

Redis est single-threaded côté exécution des commandes, mais les MULTI/EXEC (transactions) peuvent être interrompus par d'autres clients entre chaque commande. Les scripts Lua en revanche sont exécutés **atomiquement** : aucune autre commande Redis ne peut s'intercaler pendant l'exécution du script. C'est l'équivalent Redis d'un `SELECT ... FOR UPDATE` en SQL.

Le script :
1. `INCR` : incrémente le compteur (crée la clé à 1 si elle n'existe pas).
2. Si le compteur vient d'être créé (`count == 1`), pose l'expiration `PEXPIRE` — cela garantit que la clé a toujours une TTL même si `PEXPIRE` avait échoué séparément.
3. Sinon lit `PTTL` pour retourner le temps restant au client (utilisé pour le header `Retry-After`).
4. Garde-fou : si `PTTL < 0` (clé sans TTL, ne devrait pas arriver), repose l'expiration.

### La garde-fou TTL manquant

`PTTL < 0` peut arriver si la clé a été créée par un autre code sans TTL (migration de l'ancien keyspace `daily-chat:*` → `ratelimit:daily-chat:*`). Le script est défensif contre ce cas : il repose une expiration plutôt que de laisser une clé persister indéfiniment.

### Le fallback in-memory

```typescript
} catch (err) {
  logger.warn('redis_rate_limit_fallback', { ... });
  return this.incrementFallback(key, windowMs);
}
```

Si Redis est indisponible, on bascule sur un `InMemoryBucketStore`. Ce fallback est par définition non-distribué : deux instances du backend peuvent accepter 2× le quota pendant une outage Redis. C'est documenté et accepté (`fail-OPEN → fail-CLOSED-in-prod` géré via `env.rateLimit.failClosed`).

### Net : `~130 LOC → ~30 LOC` dans `daily-chat-limit.middleware.ts`

Le middleware est devenu un appel à `createRateLimitMiddleware`, une factory générique paramétrée par `keyGenerator`, `windowMs`, `statusCode`, etc. Le `keyGenerator` retourne `null` pour les requêtes anonymes → middleware skippé (ligne de sécurité : un user non authentifié n'a pas de quota journalier à décrémenter).

---

## Décortiqué #3 : Probabilistic early refresh — prévenir le cache stampede (commit `0e6bb3d2`)

### Le problème : thundering herd à l'expiration

Imagine une entrée en cache avec une TTL de 10 minutes. À t=10min, 500 requêtes arrivent simultanément, trouvent le cache expiré, et déclenchent toutes un refresh vers la source de vérité (Nominatim, Overpass). La source s'effondre sous la charge. C'est un **cache stampede** (ou thundering herd).

### La solution : XFetch / probabilistic early expiration

L'algorithme (publié par Vattani et al., 2015) est simple : avant l'expiration réelle, on commence à déclencher des refreshs "opportunistes" avec une probabilité croissante.

Le code exact dans `museum-backend/src/shared/cache/probabilistic-refresh.ts:57-68` :

```typescript
export function shouldEarlyRefresh<T>(
  entry: RefreshableEntry<T>,
  nowMs: number,
  threshold: number = EARLY_REFRESH_THRESHOLD_DEFAULT, // 0.9
): boolean {
  const ttlMs = entry.ttlSeconds * 1_000;
  if (ttlMs <= 0) return false;
  const elapsedRatio = (nowMs - entry.storedAtMs) / ttlMs;
  if (elapsedRatio < threshold) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- non-security: TTL jitter
  return Math.random() < (elapsedRatio - threshold) / (1 - threshold);
}
```

### Le math

- `elapsedRatio` = fraction de la TTL consommée. Si la TTL est 10min et qu'il s'est écoulé 9min, `elapsedRatio = 0.9`.
- En dessous du seuil (`0.9` par défaut) : pas de refresh anticipé.
- Au-dessus du seuil : probabilité = `(elapsedRatio - threshold) / (1 - threshold)`.
  - À `elapsedRatio = 0.9` → probabilité = `0 / 0.1 = 0` (aucune chance)
  - À `elapsedRatio = 0.95` → probabilité = `0.05 / 0.1 = 0.5` (50%)
  - À `elapsedRatio = 1.0` → probabilité = `0.1 / 0.1 = 1` (100%, la TTL est atteinte)

La probabilité monte **linéairement** dans la fenêtre `[threshold, 1.0]`. Chaque requête roule indépendamment son dé. Statistiquement, une seule requête parmi les N concurrentes déclenchera le refresh dans la fenêtre anticipée — les autres servent le cache encore valide.

### Le `createBackgroundRefresh` — fire-and-forget (`probabilistic-refresh.ts:121-143`)

```typescript
export function createBackgroundRefresh<T>(deps: BackgroundRefreshDeps<T>) {
  return function trigger(args: BackgroundRefreshTriggerArgs<T>): void {
    void (async () => {
      try {
        const value = await refresh();
        const ttlSeconds = deps.isEmpty(value) ? negativeTtlSeconds : positiveTtlSeconds;
        await deps.cache.set(cacheKey, entry, ttlSeconds);
      } catch (error) {
        deps.logger.warn(deps.failureMessage, { op, cacheKey, error: String(error) });
      }
    })();
  };
}
```

La fonction retourne `void` : l'appelant ne l'`await` pas. Le refresh se produit en arrière-plan pendant que la requête courante sert le cache existant. Si le refresh échoue, on log un `warn` et on garde l'ancienne entrée — il vaut mieux servir un résultat légèrement périmé que planter la requête.

Le choix `positiveTtlSeconds` vs `negativeTtlSeconds` : certaines APIs (Overpass, Nominatim) peuvent retourner un résultat vide. On cache ces résultats vides avec une TTL plus courte (negative TTL) pour éviter de bloquer trop longtemps sur une zone sans données.

### Avant ce PR : un commentaire Stryker avait signalé le problème

Dans `nominatim.client.ts:336` (avant le commit), un commentaire disait littéralement "Same pattern as shared/http/overpass-cache.ts:113". La duplication était docummentée par le code lui-même — signe qu'il fallait extraire.

---

## Décortiqué #4 : Le codemod `requireUser` + le sentinel qui l'enforce (commit `be7e3712`)

### Le pattern répété (7 sites dans `chat/adapters/primary/http/`)

```typescript
// Avant — 4 lignes répétées 7 fois :
const currentUser = getRequestUser(req);
if (!currentUser?.id) {
  throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
}
```

```typescript
// Après — 1 ligne :
const user = requireUser(req);
```

Le helper `requireUser` (dans `shared/http/requireUser.ts:11`) fait la même chose mais est canonique : message aligné sur `'Authentication required'`, code `'UNAUTHORIZED'` identique, throw garanti ou retour typé `UserJwtPayload`.

### Subtilité : les 3 choses à vérifier par fichier

La divergence entre l'ancien code et le helper : le message texte change de `'Token required'` à `'Authentication required'`. Est-ce safe ? Le frontend détecte les erreurs auth sur le **code machine-lisible** (`code: 'UNAUTHORIZED'`), pas sur le message texte. La revue de sécurité l'a confirmé.

### Le sentinel qui empêche la régression (`tests/unit/chat/route-discipline-requireUser-codemod.test.ts`)

```typescript
const INLINE_UNAUTH_THROW_RE =
  /if\s*\(\s*!\s*[A-Za-z_$][\w$]*\?\.id\s*\)\s*\{[\s\S]*?throw\s+new\s+AppError\s*\(\s*\{[\s\S]*?code:\s*['"]UNAUTHORIZED['"][\s\S]*?\}\s*\)\s*;?\s*\}/;
```

Ce test lit les 4 fichiers cibles avec `readFileSync` et asserte :
1. L'expression régulière ci-dessus ne matche aucun résultat (pattern inline absent).
2. Aucun `throw new AppError({ ... code:'UNAUTHORIZED' ... })` inline (reshuffle detecté).
3. `import { requireUser } from '@shared/http/requireUser'` est présent.

Le test tourne à chaque `pnpm test`. Un futur développeur qui re-copie le pattern inline verra son PR bloqué. C'est un **invariant architectural encodé en test**.

### Pourquoi `getRequestUser` est conservé dans certains fichiers

Dans `chat-session.route.ts` et `chat-media.route.ts`, `getRequestUser` est toujours importé. C'est volontaire : il y a des routes qui lisent optionnellement l'utilisateur (`req.user` peut être `undefined`) — ces routes ne lèvent pas d'erreur si non authentifié, elles adaptent simplement leur réponse. Seuls les sites qui **exigeaient** l'auth ont été migrés vers `requireUser`.

---

## Décortiqué #5 : Web — `BaseModal` et `useFetchData` avec `AbortController` (commits `eda20d50`, `eda3539d`)

### Phase 2 : `BaseModal` — composition React 19 sans lib tierce

**Avant** : 8 modals admin réimplémentaient le même scaffold overlay/panel/ARIA. La duplication était mesurable : `eslint-disable jsx-a11y/no-noninteractive-element-interactions` copié dans 5/8 sites pour le backdrop click ; annonce dialog ARIA absente sur 3/8 sites.

**Décision ADR-067** : custom React 19 sans Radix UI (différé V2). Raison principale : pas d'ajout de dépendance 2 semaines avant le launch, pas de migration risquée de 8 sites en 2 jours.

L'implémentation réelle (`museum-web/src/components/ui/BaseModal.tsx`) repose sur trois patterns React 19 :

**1. `useId` + `aria-labelledby` avec `title`/`titleId` mutuellement exclusifs** (`BaseModal.tsx:88-92`, `:171-175`) :
```tsx
const generatedId = useId();

// title et titleId sont mutuellement exclusifs :
//  - titleId fourni → le consommateur rend son propre <h2 id={titleId}> dans children
//  - sinon title fourni → BaseModal rend <h2 id={generatedId}> lui-même
//  - ni l'un ni l'autre → pas d'aria-labelledby du tout (undefined)
const resolvedLabelledBy: string | undefined =
  titleId ?? (title !== undefined ? generatedId : undefined);
// ...
{title !== undefined && titleId === undefined && (
  <h2 id={generatedId} className={HEADING_CLASSES}>{title}</h2>
)}
```
`useId()` donne un ID stable entre renders, unique par instance, sans collision — exactement ce qu'il faut pour relier `aria-labelledby` à un `<h2 id=...>` généré. La subtilité pédagogique : le composant gère **deux modes de titre** (interne vs fourni par le consommateur) et n'émet `aria-labelledby` que s'il existe réellement un heading à pointer.

**2. Compose-ref (React 19 ref-as-prop, plus de `forwardRef`)** (`BaseModal.tsx:149-156`) :
```tsx
// panelRef?: Ref<HTMLDivElement> est passé comme PROP normale (React 19)
const composedPanelRef = (node: HTMLDivElement | null) => {
  internalPanelRef.current = node;          // ref interne (gestion du focus)
  if (typeof panelRef === 'function') {
    panelRef(node);                          // ref-callback du consommateur
  } else if (panelRef !== null && panelRef !== undefined) {
    (panelRef as { current: HTMLDivElement | null }).current = node; // ref-objet
  }
};
```
C'est le vrai enseignement : le composant a besoin de SA propre ref (pour `.focus()` à l'ouverture) **tout en** forwardant la ref du parent. La callback-ref `composedPanelRef` écrit les deux, et gère les deux formes de ref (fonction OU objet `{ current }`). En React 19 la ref arrive en prop ordinaire — plus besoin de `forwardRef`.

**3. Backdrop click via `e.target === e.currentTarget`** (`BaseModal.tsx:136-146`) :
```tsx
const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
  if (!dismissable) return;
  // ne ferme QUE si le clic a touché le backdrop lui-même ;
  // un clic remontant depuis le panel a target !== currentTarget → ignoré
  if (e.target === e.currentTarget) onClose();
};
```
Si le clic a eu lieu directement sur l'overlay (pas sur son contenu), `target === currentTarget`. Simple et correct, **sans `stopPropagation`** sur le panel — l'approche inverse (stopPropagation) marche aussi mais pollue tous les enfants.

**Gestion du focus à l'ouverture** (`BaseModal.tsx:111-130`) — ordre de priorité : élément marqué `[data-autofocus]` → premier élément focusable (`FOCUSABLE_SELECTOR`) → le panel lui-même (`tabIndex={-1}`).

**Ce qui est délibérément absent en V1** : focus-trap (Tab/Shift+Tab), return-focus à la fermeture, scroll-lock du body. Documenté `@todo Phase V2` dans le JSDoc (`BaseModal.tsx:25-27`), migration Radix différée. Zéro régression vs l'existant.

### Phase 3 : `useFetchData` — hook avec annulation correcte

**Avant** : 9 pages admin répétaient ~25 lignes chacune :
```tsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const fetchX = useCallback(async () => { ... }, [deps]);
useEffect(() => { void fetchX(); }, [fetchX]);
```

**Pattern closure-cell / `AbortController`** (`museum-web/src/lib/hooks/useFetchData.ts:163-228`) :

```typescript
const controllerRef = useRef<AbortController | null>(null);

const refetch = useCallback((): Promise<void> => {
  controllerRef.current?.abort();   // annule l'éventuel fetch précédent

  const controller = new AbortController();
  controllerRef.current = controller;
  const signal = controller.signal;

  setLoading(true);
  setError(null);

  const settle = apiGet<unknown>(url, { signal }).then(
    (raw) => {
      if (signal.aborted) return;   // guard closure-cell
      // ... setData, setLoading(false)
    },
    (err: unknown) => {
      if (signal.aborted || isAbortError(err)) return;
      // ... setError
    },
  );

  void settle;
  return Promise.resolve();  // résout au kick-off, pas à la fin
}, [url, ...deps]);

useEffect(() => {
  void refetch();
  return () => { controllerRef.current?.abort(); };  // cleanup unmount
}, [refetch, url]);
```

Trois sources d'annulation couvertes :
1. **Changement de `url` ou `deps`** → `useCallback` reconstruit → `useEffect` relance → `abort()` en tête de `refetch`.
2. **Unmount du composant** → le `return` du `useEffect` appelle `abort()`.
3. **`refetch()` manuel** → `abort()` en tête annule l'appel précédent.

Le guard `if (signal.aborted) return` à l'intérieur du `.then` est la "closure-cell" : même si la Promise résout après l'abort, les setState ne sont pas appelés. Pas de "setState on unmounted component".

**Le contrat `refetch()` : fire-and-forget**

Spec et design disaient "résout après settle". L'implémentation et les tests disent "résout au kick-off". Le reviewer a approuvé avec follow-up doc-only : c'est un exemple de divergence spec/impl documentée dans le JSDoc plutôt que masquée ou corrigée en silence. Les 6 call-sites font tous `void refetch()` — la distinction est sans conséquence V1.

**heuristique paginated vs single** :
```typescript
function isPaginatedWrapper(value: unknown): value is PaginatedWrapper<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!('data' in v)) return false;
  return 'totalPages' in v || 'total' in v;
}
```
Le hook détecte automatiquement si la réponse est une enveloppe paginée `{ data: T[], totalPages, total }` ou une ressource simple. Les 9 pages migrées n'ont pas eu à configurer ce paramètre manuellement (sauf `museums/page.tsx` qui a un format légèrement différent et passe `parseData`).

---

## Le reste en bref

| PR | Ce que ça factorise | Pattern | Sites |
|---|---|---|---|
| PR-1 (`5440713e`) | `unauthorized(msg, code?)` — factory trop étroite forçait 6 modules à réimplémenter la leur | Extension de factory, sweep | 6 locales |
| PR-3 (`5e93b82c`) | `throw new AppError({...404...})` → `notFound()` en auth | Codemod + sentinel | 4 useCases |
| PR-5 (`fb906e80`) | Validation `page`/`limit` (6 LOC identiques) → `assertPagination(params, opts?)` | Helper pur + sentinel | 7 useCases |
| PR-6 (`3d639324`) | Dead code UFR-016 — 4 fichiers supprimés | Burial (jamais reverted car git garde) | 4 fichiers |
| PR-7 (`b4d5f70c`) | `actorType:'user', ip: ?? null, requestId: ?? null` → `logActorAction(service, input)` | Helper, force type au niveau TS (`Omit` sur actorType) | 12 useCases |
| PR-8 (`436ddbb8`) | Scaffold offset-pagination TypeORM → `paginate(qb, params, mapper?)` | Helper générique + `getManyAndCount` (1 round-trip vs 2) | 4 repos |
| PR-9 (`81a840b1`) | `getUserById → social-check → bcrypt.compare` → `assertPasswordReauth()` | Helper, unification statusCode 400→401 (win sécurité) | 3 useCases |
| PR-12 (`a2cc2383`) | Extraction domaine email (`@foo.com`) → `extractEmailDomain()` | Helper pur | 5 sites |
| PR-14 (`29109e82`) | `fetch` + timeout manuel → `fetchWithTimeout(url, opts, ms)` | Helper + AbortController | 2 adapters |
| PR-15 (`ed275e27`) | `randomBytes(32).hex + sha256` × 6 → `issueEmailToken()` + `hashEmailTokenForLookup()` | Helper crypto, divergence C2 no-trim **préservée** explicitement | 6 useCases |
| PR-16 (`9aff378b`) | Algorithme confidence-based upsert (~87 LOC × 2) → `confidenceUpsert<T>()` | Helper générique TypeScript | 2 repos KE |
| Web P1 (`40e0671e`) | `apiPut`, regexes de validation, `Spinner`/`AlertBanner`/`FormFieldError` | Composants fondation + centralisation | 48 sites |
| Web P4 (`76fdda2f`) | `HoneypotField`, `TableHeaderCell`, `TableDataCell` | Composants + ARIA (`scope="col"`) | 13 sites |

---

## À retenir — takeaways transférables

**1. Le sentinel test est le vrai gardien du codemod.**
Un codemod sans sentinel se re-pollue dans les 3 mois. Le test qui lit les fichiers avec `readFileSync` et asserte l'absence du pattern inline n'a aucun faux positif — il est basé sur le fichier réel, pas sur un mock.

**2. Les scripts Lua Redis sont le seul moyen correct de faire du rate-limiting distribué.**
`GET + INCR` avec deux appels Redis n'est jamais atomique. Si ton rate-limiter ne passe pas par un script Lua ou une transaction MULTI/EXEC, il est race-conditionné. Pour les quotas de sécurité (freemium, anti-abuse), c'est inacceptable.

**3. Le probabilistic early refresh n'est pas compliqué — c'est 2 lignes de math.**
`Math.random() < (elapsedRatio - threshold) / (1 - threshold)`. Mémorise la formule. Elle évite les stampedes sur tout cache avec TTL longue (geoloc, CMS, traductions).

**4. La distinction `reset()` vs `resetTransient()` dans un circuit-breaker.**
Sur un probe success, ne jamais remettre à zéro les accumulateurs durables (budget journalier dépensé). Sinon le circuit peut "récupérer" 288 fois par jour et dépenser 288× le cap.

**5. `AbortController` dans les hooks React : 3 sources d'annulation à couvrir.**
Changement de deps → annule. Unmount → annule. Refetch manuel → annule le précédent d'abord. Le guard `if (signal.aborted) return` dans le `.then` est la fermeture du circuit côté Promise.

**6. Préserver les divergences comportementales explicitement (UFR-013).**
PR-15 : `resetPassword` ne trim pas le token. Plutôt que d'harmoniser silencieusement, le helper expose `{ trim: false }`. La divergence qui était muette devient visible et auditée. C'est de l'honnêteté encodée en code.

---

## Questions de compréhension

1. Dans le circuit-breaker `ThreeStateCircuit`, pourquoi la transition OPEN→HALF_OPEN est-elle implémentée dans un `getter` plutôt que dans un `setInterval` ou un timer ?

2. Explique pourquoi `INCR + PEXPIRE` en deux appels Redis séparés ne suffit pas à garantir l'atomicité d'un rate-limiter. Quel mécanisme Redis résout ce problème et pourquoi ?

3. Dans `shouldEarlyRefresh`, que se passe-t-il à exactement `elapsedRatio = threshold` (ex. `0.9`) ? Et à `elapsedRatio = 0.85` ? Pourquoi la probabilité est-elle linéaire et pas exponentielle ?

4. Dans `useFetchData`, le `controllerRef` est un `useRef` (pas un `useState`). Quelle est la différence et pourquoi ce choix ici ?

5. Dans le codemod PR-2 (`requireUser`), certains fichiers conservent l'import de `getRequestUser` même après le sweep. Pourquoi ? Comment le sentinel le détecte-t-il (ou pas) ?
