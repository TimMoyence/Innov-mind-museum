# 16 — Bloc 7 : Tests Phases 0-11 (transformation banking-grade)

> **Pour qui ?** Toi, qui veux comprendre comment on est passé de "on a des tests" à "5817 tests + mutation testing 80% kill ratio + chaos suite + e2e auth + property tests + 4× speedup SWC".
> **Durée de lecture :** ~18 minutes (bloc le plus dense du sprint).

---

## Le contexte

Pre-sprint : Musaium avait des tests, mais sans discipline structurée. Pas de classification claire (unit/integration/e2e), pas de mutation testing, pas de chaos, factories inconsistantes, coverage non-gated en CI.

Le sprint a fait **11 phases séquentielles** qui ont transformé la posture test. C'est le bloc le plus structurant : il produit **les filets qui te permettent de shipper sans faire trembler la prod**.

---

## Vocabulaire test

| Terme | Définition |
|-------|------------|
| **Test pyramid** | Modèle qui dit "beaucoup de tests unit (rapides), moins d'integration, encore moins d'e2e (lents mais réalistes)". |
| **Unit test** | Teste une fonction / classe isolée, avec mocks pour les dépendances. |
| **Integration test** | Teste plusieurs composants ensemble, contre des dépendances réelles (vraie DB par exemple). |
| **E2E test** | Test "end-to-end" : démarre l'app complète, parle au serveur HTTP via supertest ou navigateur. |
| **Mutation testing** | Modifie le code source (mute) et vérifie que les tests détectent le changement. Mesure la qualité réelle des tests. |
| **Kill ratio** | % des mutations détectées par les tests. 80% = bon, 100% = parfait. |
| **Chaos test** | Simule une panne de dépendance (Redis down, LLM en erreur) et vérifie que l'app dégrade gracieusement. |
| **Property test** | Vérifie une propriété mathématique sur 100+ cas générés aléatoirement. |
| **Coverage** | % du code exécuté par au moins un test. Indicateur faible (high coverage ≠ tests utiles), mais utile en complément. |
| **Testcontainer** | Lib qui démarre un Docker (Postgres, Redis) éphémère pour les tests d'intégration. |
| **Factory** | Fonction qui crée un objet test (User, Message…) avec valeurs par défaut + overrides. |
| **SWC** | Compilateur TypeScript en Rust, ~4× plus rapide que ts-jest. |

---

## Vue d'ensemble : 11 phases

| Phase | Quoi | Statut |
|-------|------|--------|
| 0+1 | Test pyramid taxonomy (ADR-012) | ✅ |
| 2 | (placeholder, partagé avec d'autres specs) | — |
| 3 | (placeholder) | — |
| 4 | Stryker mutation testing | ✅ |
| 5 | E2E auth completeness | ✅ |
| 6 | Chaos resilience | ✅ |
| 7 | Factory + shape-match enforcement | ✅ |
| 8 | Coverage gate CI | ✅ |
| 9 | Coverage-driven uplift | ✅ |
| 10 | Fix 2 prod bugs surfaced + close integration suite | ✅ |
| 11 | SWC speedup + Vitest scope refine | ✅ |

---

## Phase 0+1 — Test pyramid taxonomy (ADR-012)

### Le problème

Avant : un test Jest dans `tests/integration/` pouvait n'utiliser que des in-memory repos (en fait du unit test). Un autre dans `tests/unit/` pouvait démarrer un Postgres testcontainer (en fait un integration test). Confusion totale.

### La règle (ADR-012)

**Un test est `tests/integration/` ssi** il importe `tests/helpers/e2e/postgres-testcontainer.ts` (ou un sibling Redis/S3) **OU** il instancie une vraie `DataSource` TypeORM contre testcontainer.

**Tout le reste = `tests/unit/`** — y compris les tests qui mock une DB en mémoire.

### Le sentinel CI

Un script `integration-tier-signature.mjs` walk `tests/integration/` au moment du PR check. Si un fichier dedans n'importe ni le testcontainer ni n'instancie une DataSource → CI rouge.

Symétriquement, si un fichier dans `tests/unit/` importe le testcontainer, le sentinel re-jette aussi.

### Pourquoi c'est pertinent

Ça **clarifie le SLA de chaque tier** : unit = rapide (<100 ms par test), integration = lent (~1-5 sec par test, démarre Postgres), e2e = très lent (~5-30 sec, démarre toute l'app).

Tu peux runner uniquement `tests/unit/` en pre-commit hook (rapide), et garder `tests/integration/` pour CI complet.

### Est-ce overkill ?

Non. Sans cette règle, tu te retrouves avec une suite "intégration" qui prend 20 min en CI et inclut 80% de fake intégration.

---

## Phase 4 — Stryker mutation testing

### Le problème

Coverage à 90% peut cacher des tests **bidons**. Exemple :

```ts
function divide(a: number, b: number): number {
  if (b === 0) throw new Error('div by zero');
  return a / b;
}

// Test couvre 100% des lignes mais ne vérifie rien :
test('divide', () => {
  divide(10, 2);  // pas d'assertion sur le résultat !
});
```

100% coverage. Test inutile. Mutation testing détecte ça.

### Comment Stryker travaille

Stryker prend ton code, applique des "mutations" automatiques :
- Remplace `if (b === 0)` par `if (b !== 0)`.
- Remplace `return a / b` par `return a * b`.
- Etc.

Pour chaque mutation, il re-runs ta suite de tests. Si **un test échoue**, la mutation est **killed** (= tes tests ont fait leur boulot). Si **tous passent**, la mutation **survit** = tes tests n'ont pas détecté le changement = ils sont mauvais.

### Les hot files Musaium (`.stryker-hot-files.json`)

7 fichiers banking-grade marqués comme **hot**, avec un `killRatioMin: 80%` strict :

1. `art-topic-guardrail.ts` — la sécurité chat.
2. `cursor-codec.ts` — l'encodage des curseurs de pagination (bugs ici = pages perdues).
3. `sanitizePromptInput` — sanitization des inputs LLM.
4. `audit-chain.ts` — la chaîne d'audit immutable.
5. `llm-circuit-breaker.ts` — le circuit breaker LLM.
6. `refresh-token.repository.pg` — la rotation des refresh tokens auth.
7. `authSession.service.ts` (puis `session-issuer.service.ts` post-split, cf. doc 07) — l'issuance de session.

Si l'un de ces fichiers tombe sous 80% kill ratio, **CI plante hard et bloque le PR**.

### Thresholds globaux

- `high=85` : si la moyenne globale est ≥85%, vert.
- `low=70` : entre 70 et 85, jaune (warning).
- `break=70` : sous 70, rouge (CI fail).

### Quand ça tourne

- **Pre-commit** : uniquement si tu as touché un fichier de la liste `mutate:` config. Sinon skip (économie de temps).
- **CI push** : incrémental (Stryker cache permet de ne re-tester que ce qui a changé).
- **Nightly cron** (03:17 UTC) : full run sur tout le code.

### Coût

- Premier run cold cache = 20-40 minutes. CLAUDE.md recommande `pnpm mutation:warm` overnight pour amorcer.
- Run incrémental après ça = ~1-3 minutes.

### Pourquoi c'est pertinent

Pour les 7 hot files banking-grade, **mutation testing > coverage**. Coverage te dit "mes tests touchent toutes les lignes". Mutation te dit "mes tests détectent les vrais bugs".

Ces 7 fichiers sont les chemins critiques où un bug = incident sécurité. Tu veux la garantie que les tests sont solides.

### Est-ce overkill ?

**Non pour ces 7 fichiers**. Pour le reste du codebase, ce serait du gold-plating. L'approche "hot files only" est le bon ratio.

---

## Phase 5 — E2E auth completeness

### Ce qui a été ajouté

4 fichiers e2e auth, **25 cas total** :

| Fichier | Cas | Quoi |
|---------|-----|------|
| `auth-verify-email.e2e.test.ts` | 7 | Token de verify email : consume, replay, tampered, padded, empty, unknown |
| `auth-social-login.e2e.test.ts` | 9 | Apple/Google nonce binding F3, replay, expired, wrong audience, mobile audience |
| `auth-refresh-rate-limit.e2e.test.ts` | 4 | F1 contract : 30 ok, 31st 429, per-family bucket, no token leak in 429 body |
| `auth-refresh-rotation.e2e.test.ts` | 5 | A→B rotation, A revoked, replay-attack revokes family, chained rotations, logout |

### Le harness `TestEmailService` + `social-jwt-spoof`

**TestEmailService** (`AUTH_EMAIL_SERVICE_KIND=test`) — au lieu d'envoyer des vrais emails via Brevo, stocke en mémoire ce que le BE essaie d'envoyer. Le test peut alors récupérer le token de verify et l'utiliser. **Production sentinel** rejette `'test'` loud-fail (impossible d'oublier de désactiver en prod).

**social-jwt-spoof** (`tests/helpers/auth/social-jwt-spoof.ts`) — boote un serveur HTTP JWKS local, signe des ID tokens RS256 valides. Le BE Apple/Google verifier les vérifie comme s'ils venaient vraiment de Apple. **Exerce le vrai code path verifier**, pas un mock.

### Pourquoi c'est pertinent

Avant ces e2e, on testait l'auth **séparément** : login, refresh, social, MFA. Mais pas le **flow complet**. Les bugs apparaissent souvent à la jointure.

Bug réel détecté en passant : `verifyEmail` ne nettoyait jamais le token (cf. doc 17 Bug 4). C'est cette suite qui a permis la détection.

---

## Phase 6 — Chaos resilience

### Le contract banking-grade

Pour chaque dépendance externe, on doit prouver :
- **Defaillance dépendance → dégradation gracieuse** (pas crash 5xx).
- **Pas de stack-trace leak** au client.
- **Pas de provider-name leak** (si OpenAI tombe, ne pas dire "OpenAI tombé" au user).

### 4 suites chaos, 23 cas total

| Dépendance | Failure simulée | Cas |
|------------|-----------------|-----|
| Redis cache | `BrokenRedisCache` always-throw + flaky 50% | 7 |
| LLM provider | `StubLLMOrchestrator` configurable error | 5 |
| Circuit breaker | CLOSED → OPEN → HALF_OPEN forced transitions | 6 |
| BullMQ worker | Knowledge-extraction worker offline | 6 |

### Exemple : Redis cache down

```ts
// tests/helpers/chaos/broken-redis-cache.ts
export class BrokenRedisCache implements CacheService {
  async get<T>(key: string): Promise<T | null> {
    throw new Error('ECONNREFUSED 127.0.0.1:6379');
  }
  // etc.
}
```

Test :
```ts
const harness = await createE2EHarness({ cacheService: new BrokenRedisCache() });
const res = await request(harness.app)
  .post('/api/chat/sessions')
  .set('Authorization', `Bearer ${token}`);
expect(res.status).toBe(201);  // ← chat continue, malgré Redis down
expect(res.body.error).toBeUndefined();
```

### Pourquoi c'est pertinent

Sans ces tests : un incident Redis en prod = on ne sait pas si l'app dégrade ou crash. Avec : on a la **garantie testée** que les chemins critiques tiennent.

C'est aussi un **filet pour les futurs refactors** : si quelqu'un wired naïvement Redis dans un nouveau path sans gestion d'erreur, le chaos test pète.

### Est-ce overkill ?

Non. Le chaos est **mandatory pour tout système distribué en prod**. Tu peux décider de skip dev/test, mais en prod c'est non-négociable.

---

## Phase 7 — Factory + shape-match ESLint plugin

### Le problème

Avant : chaque test fichier créait ses entités à la main.

```ts
// tests/unit/foo.test.ts
const user = { id: 1, email: 'x@y.com', passwordHash: 'abc' } as User;
```

Conséquences :
- Quand le schema `User` change (ajout d'un champ `role` requis), tu dois éditer **N fichiers de tests**.
- Inconsistance : certains tests mettent `role: 'admin'`, d'autres oublient.

### La discipline factory

**Toute entité doit être créée via une factory** qui vit en `tests/helpers/<module>/<entity>.fixtures.ts` (BE) ou `__tests__/helpers/factories/` (FE).

```ts
// tests/helpers/auth/user.fixtures.ts
export function makeUser(overrides?: Partial<User>): User {
  return {
    id: 1,
    email: 'test@test.com',
    passwordHash: 'hashed',
    role: 'visitor',
    createdAt: new Date(),
    ...overrides,
  } as User;
}
```

Test :
```ts
import { makeUser } from '@tests/helpers/auth/user.fixtures';
const user = makeUser({ role: 'admin' });   // override seulement ce qui compte
```

### L'ESLint plugin custom

`tools/eslint-plugin-musaium-test-discipline` est un plugin ESLint workspace-private qui interdit de créer inline des entités. 4 détections :

1. **Cast direct** : `... as User` → erreur.
2. **Type assertion** : `<User>{...}` → erreur.
3. **Annotated declarator** : `const u: User = {...}` → erreur.
4. **Shape match (Phase 7)** : un objet littéral qui contient les props signatures d'une entité (`{id, email, passwordHash}`) → erreur, **même sans cast**.

### Le baseline cap

Au lancement de la règle, on avait des centaines de fichiers historiques en violation. Plutôt que tout migrer d'un coup, on a fait une **baseline** (liste des fichiers exemptés) à `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json`.

**Règle d'or** : la baseline ne peut **que rétrécir**, jamais grossir. Un test CI vérifie que le count actuel ≤ count précédent. Si tu ajoutes une violation = CI rouge.

Phase 7 a réduit la baseline à **0**. Plus aucune exception.

### Pourquoi c'est pertinent

Sans factory discipline, **chaque schema change devient un sprint de migration de tests**. Avec, c'est un changement local dans `<entity>.fixtures.ts`.

### Est-ce overkill ?

Non, c'est exactement la pratique recommandée par les bouquins de test (Khorikov, "Unit Testing"). Le plugin ESLint custom est un peu de gold-plating mais s'amortit dès que la suite passe ~500 tests.

---

## Phase 8 — Coverage gate CI

### Les seuils

| Projet | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| BE | 89 | 75 | 87 | 89 |
| FE | 91 | 78 | 80 | 91 |
| Web Vitest (focused) | 68 | 54 | 64 | 70 |

Si une métrique tombe sous le seuil, `pnpm run test:coverage` exit 1 et le CI plante.

### Pourquoi 75% branches BE pas plus ?

Branches = chaque condition `if/else`, chaque `||`, chaque `?:`. Aller au-dessus de ~80% force des tests cosmétiques (test du `else` qui ne fait rien). ADR-007 documente ce choix.

**Pour les hot files banking-grade**, on a Stryker (Phase 4) qui mesure la **qualité** des tests, pas leur couverture. C'est ça le filet, pas le branches coverage.

### Le pre-commit gate

`.claude/hooks/pre-commit-gate.sh` :

```bash
# Si tu touches du code BE source :
if git diff --cached --name-only | grep -q "museum-backend/src/"; then
  pnpm --filter museum-backend run test:coverage || exit 1
fi
# Pareil pour FE
```

Si tu n'as touché que de la doc → skip (0 sec d'overhead).

**Escape hatch** : `SKIP_COVERAGE_GATE=1 git commit ...` pour les itérations rapides locales. **CI enforce inconditionnellement** (impossible de bypass au merge).

### Bug fixé en Phase 8 — `coveragePathIgnorePatterns` Jest 29

`coveragePathIgnorePatterns` est project-scoped en Jest 29 quand tu utilises `projects:`. Si tu le mets au top-level uniquement, il est silencieusement ignoré. Bug subtil. Phase 8 a déplacé la config dans `sharedProjectOptions` pour qu'il soit re-appliqué par projet.

### Est-ce overkill ?

**Non. Sans coverage gate, la couverture dérive lentement vers 0** sur des mois. Avec gate, tu as une rampe qui ne peut que monter.

---

## Phase 9 — Coverage-driven uplift

4 sprints (9.1 → 9.4) de "remplir les trous de coverage" :
- 9.1 — FE easy wins
- 9.2 — FE mid-effort
- 9.3 — FE high-effort
- 9.4 — BE testability uplift (avec **41 nouveaux tests d'intégration chat repo** qui ont surfacé 2 bugs prod, cf. doc 17)

C'est ce sprint qui a pris BE de ~85% à 89%, FE de ~85% à 91%.

---

## Phase 10 — Fix bugs Phase 9 + close integration suite

Phase 9 a surfacé 2 bugs prod réels (TZ cursor pagination, MessageFeedback SQL malformé). Phase 10 les fixe + flip 6 `it.skip` markers.

Détails dans doc 17.

---

## Phase 11 — SWC speedup + Vitest scope refine

### Sprint 11.2 — SWC swap (le gros gain)

**Avant** : ts-jest, full BE suite = **519 secondes** (8.5 minutes).
**Après** : @swc/jest, full BE suite = **119 secondes** (~2 minutes). **4× speedup**.

### Pourquoi le swap a échoué en Phase 10 (Sprint 10.4)

Première tentative : `ts-jest → @swc/jest` direct. Crash :
```
ReferenceError: Cannot access 'X' before initialization
```

**Cause** : SWC en mode legacy decorators émet le code différemment de ts-jest. Quand TypeORM a des entités qui se référencent mutuellement (User ↔ ChatSession via @ManyToOne / @OneToMany), SWC produit un cycle d'init qui plante.

### Le fix Phase 11 — `Relation<T>` wrapper

```ts
// AVANT (cassait sous SWC)
@Entity()
export class ChatSession {
  @ManyToOne(() => User)
  user!: User;
}

// APRÈS (OK sous SWC)
@Entity()
export class ChatSession {
  @ManyToOne(() => User)
  user!: Relation<User>;
}
```

`Relation<T>` est un type alias TypeORM-recommended (cf. docs TypeORM) qui sert de **marker type-only**. Runtime semantique inchangée, mais ça casse le cycle d'init côté SWC.

12 entités BE updatées. Tous les tests passent.

### Bonus inattendu

SWC `decoratorMetadata: true` exposait des nodes que ts-jest stripait (le code généré pour `@Column`, `@ManyToOne`). Conséquence : function coverage **monte** de 85.80 → 87.19 alors qu'on a juste swappé le compilateur. Bonus fortuit.

### Sprint 11.1 — Web Vitest scope refine

**Avant** : Vitest tentait de couvrir aussi les pages marketing du landing. Mais ces pages sont mieux couvertes par Playwright + a11y + Lighthouse (qui sont déjà dans la stack).

**Après** : Vitest cible `src/lib` (logic pure) + admin/auth/shared. Marketing exclu. Thresholds adaptés à ce scope plus narrow (68/54/64/70 au lieu de viser 80+).

C'est l'application du principe : **chaque outil a son scope, ne pas faire faire à un outil ce qu'un autre fait mieux**.

---

## Récap : statistiques finales

| Mesure | Valeur |
|--------|--------|
| **Tests BE par défaut** | 3801 |
| **Tests BE avec `RUN_INTEGRATION=true`** | 3851 |
| **Tests FE** | 1966 |
| **Tests Web Vitest** | 226 |
| **Total** | ~5817 tests |
| **Tests ajoutés ce sprint** | ~350 |
| **BE Jest runtime pre-Phase 11** | 519 sec |
| **BE Jest runtime post-Phase 11** | 119 sec |
| **Stryker hot files killRatioMin** | 80% (chaque, jamais en-dessous) |
| **Coverage BE / FE / Web** | 89/75/87/89 — 91/78/80/91 — 68/54/64/70 |
| **ESLint disable baseline** | 0 (Phase 7 cap = 0) |

---

## Pourquoi c'est pertinent pour Musaium

### V1 launch nécessite confiance déploiement

Sans cette infrastructure test, chaque deploy prod = stress. Avec : tu mergeas, tests CI passent, tu deploys. Si quelque chose pète, c'est probablement entre les mailles très spécifiques.

### Banking-grade vs MVP

Pour un MVP "j'ai 10 users", coverage 50% + 30 tests suffit. Pour Musaium V1 qui vise 50K visiteurs sur 6 mois + B2B musées qui paient une licence, **la barre est plus haute**.

5817 tests semblent énormes mais **correspondent à ~20% de la taille du codebase** (~80K LOC). C'est le ratio standard pour un système prod sérieux.

### Stryker = la vraie qualité

Coverage te ment. Stryker non. Pour les 7 hot files, tu sais que les tests ne sont pas bidons.

---

## Est-ce overkill ?

**Non, mais avec nuances.**

**Pas overkill du tout** :
- ADR-012 taxonomy
- Factory discipline
- Coverage gate
- E2E auth complets
- Chaos suite
- SWC speedup

**Discutable mais défendable** :
- Stryker mutation testing — utile mais cher en CI. Justifié par les hot files banking-grade.
- Property tests — utiles pour `sanitizePromptInput` qui mange du Unicode arbitraire. Limited scope.

**Si tu n'avais que 50% du temps**, tu aurais drop Stryker. Mais Musaium ayant le temps via le parallélisme V12, c'était disponible.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Lancer `pnpm mutation:warm` une nuit | Recommandé pour amorcer le cache Stryker |
| Vérifier que CI run vert sur tous les jobs | À chaque PR, regarder l'onglet Actions |
| Si tu écris un nouveau test | Toujours utiliser une factory existante OU créer une factory au lieu de inline |
| Si tu touches un hot file Stryker | Pre-commit hook va lancer Stryker (~3 min). Patient. |
| Surveiller coverage trend | Si jamais ça descend → CI plante → tu dois remonter avant de merger |
| Lire `CLAUDE.md` § "Test Discipline" | Doc canonique des règles |

---

## Pièges classiques à éviter

1. **Ne pas désactiver le coverage gate avec `SKIP_COVERAGE_GATE=1` trop souvent.** Ça ratifie une descente de la qualité.
2. **Ne pas inline-create une entité dans un test.** ESLint plante. Crée une factory.
3. **Ne pas mettre un `it.skip()` sans suivi.** Si tu skip un test, ouvre un ticket de re-activation.
4. **Ne pas runner `pnpm test:e2e` sans Postgres up.** Le testcontainer va essayer mais c'est plus rapide d'avoir docker compose dev déjà up.
5. **Ne jamais lower un threshold coverage** sans approbation explicite + ADR. La règle ratchet ne va que dans un sens.
