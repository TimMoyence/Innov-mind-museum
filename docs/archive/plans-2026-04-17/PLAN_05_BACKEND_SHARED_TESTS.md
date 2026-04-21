# PLAN 05 — Backend shared/ Tests Coverage

**Phase** : 2 (Refactor Structurel)
**Effort** : 2-3 jours
**Pipeline /team** : standard
**Prérequis** : Aucun (autonome)
**Débloque** : P04 (prérequis de sécurité)

## Context

L'audit backend a identifié 3 modules critiques sans coverage :
- `shared/audit.service.ts` — logs d'audit sécurité (compliance)
- `shared/cache.port.ts` + adapters — caching distribué
- `shared/feature-flags.port.ts` + adapters — feature flags runtime

Sans tests, ces modules deviennent des points aveugles : un bug dans l'audit service = risque compliance, un bug dans le cache = inconsistance de données, un bug dans feature-flags = bascule intempestive en prod.

**Objectif** : 100% coverage sur les 3 modules, factories DRY partagées, contrat stable.

## Actions

### 1. Cartographier l'existant

Pour chaque module, identifier :
- Ports (interfaces)
- Adapters (implémentations)
- Consommateurs (modules qui en dépendent)

```bash
cd museum-backend
# Audit service
find src/shared -name "audit*" -type f
grep -rn "from.*audit.service" src/modules/ --include="*.ts"

# Cache
find src/shared -name "cache*" -type f
grep -rn "from.*cache" src/modules/ --include="*.ts"

# Feature flags
find src/shared -name "feature-flag*" -type f
grep -rn "from.*feature-flag" src/modules/ --include="*.ts"
```

### 2. Tests `shared/audit.service.ts`

Créer `src/shared/audit/__tests__/audit.service.test.ts` :

```typescript
describe('AuditService', () => {
  describe('log()', () => {
    it('enregistre un event avec timestamp + user + action');
    it('sérialise les metadata complexes sans perte');
    it('échoue proprement si repo down (retry + dead letter)');
  });

  describe('query()', () => {
    it('filtre par userId + dateRange');
    it('paginer les résultats');
    it('respecte les permissions RBAC');
  });

  describe('retention', () => {
    it('purge les events au-delà de la rétention configurée');
  });
});
```

Factory DRY : `tests/helpers/shared/audit.fixtures.ts` avec `makeAuditEvent(overrides?)`.

### 3. Tests `shared/cache.port.ts`

Tests pour chaque adapter :
- `in-memory.cache.adapter.ts` (par défaut dev/test)
- `redis.cache.adapter.ts` (prod si présent)
- `null.cache.adapter.ts` (désactivation)

Tests ports contract (run contre chaque adapter) :

```typescript
describe.each([
  ['in-memory', () => new InMemoryCacheAdapter()],
  ['null', () => new NullCacheAdapter()],
])('CacheAdapter %s — contract', (name, factory) => {
  let cache: CachePort;

  beforeEach(() => { cache = factory(); });

  it('set + get round trip');
  it('TTL expiration');
  it('delete invalide la clé');
  it('clear supprime tout');
  it('has() true/false correctement');
  it('getOrSet évite cache stampede');
});
```

Factory DRY : `tests/helpers/shared/cache.fixtures.ts` avec `makeCacheEntry()`.

### 4. Tests `shared/feature-flags.port.ts`

Tests pour :
- `static.feature-flags.adapter.ts` (config file)
- `env.feature-flags.adapter.ts` (variables d'env)
- `unleash.feature-flags.adapter.ts` (si utilisé)

Tests contract :

```typescript
describe.each([
  ['static', () => new StaticFeatureFlagsAdapter(baseConfig)],
  ['env', () => new EnvFeatureFlagsAdapter()],
])('FeatureFlagsAdapter %s — contract', (name, factory) => {
  it('isEnabled(flag) retourne bool');
  it('isEnabled(flag, context) avec user/group');
  it('retourne false pour flag inconnu');
  it('variant() retourne variant actif');
  it('ne leak pas les flags internes à l\'extérieur');
});
```

Factory DRY : `tests/helpers/shared/feature-flags.fixtures.ts`.

### 5. Tests d'intégration

Vérifier que les consommateurs utilisent bien les ports (pas les adapters directement) :

```bash
# Aucun module ne doit importer directement un adapter
grep -rn "from.*audit.service'" src/modules/ --include="*.ts" | grep -v "\.port"
# Si match : refactor en P05.5
```

### 6. CI — Ratchet coverage

Dans `.github/workflows/ci-cd-backend.yml`, ajouter seuil coverage :
```yaml
- name: Coverage check
  run: |
    pnpm test -- --coverage --coverageThreshold='{"global":{"branches":75,"functions":80,"lines":80,"statements":80}}'
```

Pour les modules shared/ critiques, seuil spécifique :
```yaml
--coverageThreshold='{"src/shared/audit/**":{"lines":95},"src/shared/cache/**":{"lines":95},"src/shared/feature-flags/**":{"lines":95}}'
```

## Verification

```bash
cd museum-backend

# Nouveaux fichiers tests existent
ls src/shared/audit/__tests__/ 2>/dev/null
ls src/shared/cache/__tests__/ 2>/dev/null
ls src/shared/feature-flags/__tests__/ 2>/dev/null

# Factories créées
ls tests/helpers/shared/ 2>/dev/null

# Tests verts
pnpm test -- --testPathPattern=shared

# Coverage sur les 3 modules
pnpm test -- --testPathPattern=shared --coverage
# Attendu: ≥ 95% lines sur shared/audit, shared/cache, shared/feature-flags

# Aucune régression globale
pnpm test
pnpm lint
```

## Fichiers Critiques

### À créer
- `museum-backend/src/shared/audit/__tests__/audit.service.test.ts`
- `museum-backend/src/shared/cache/__tests__/cache.port.test.ts`
- `museum-backend/src/shared/cache/__tests__/in-memory.cache.adapter.test.ts`
- `museum-backend/src/shared/feature-flags/__tests__/feature-flags.port.test.ts`
- `museum-backend/src/shared/feature-flags/__tests__/static.adapter.test.ts`
- `museum-backend/tests/helpers/shared/audit.fixtures.ts`
- `museum-backend/tests/helpers/shared/cache.fixtures.ts`
- `museum-backend/tests/helpers/shared/feature-flags.fixtures.ts`

### À préserver
- Signatures des ports (backward compat)
- Imports actuels dans `modules/*` (pas de casse)

### CI à modifier
- `.github/workflows/ci-cd-backend.yml` — ajouter coverage threshold

## Risques

- **Faible** : découverte de bugs latents dans les modules non testés (positif — à fixer avant P04 via issue ciblée).
- **Faible** : coverage threshold CI trop strict — ajuster à baseline + 5%.

## Done When

- [ ] 3 modules shared/ couverts ≥ 95% lines
- [ ] Tests contract courent pour chaque adapter
- [ ] Factories DRY dans `tests/helpers/shared/`
- [ ] CI enforced avec coverage threshold
- [ ] Aucune régression globale (pnpm test vert)
- [ ] Ratchet coverage bumped (baseline 2655 → 2655 + N tests)
