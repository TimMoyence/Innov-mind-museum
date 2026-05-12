# 10 — Bloc 6 partie 1 : Data hardening (Spec C subsystem + Spec D JSONB)

> **Pour qui ?** Toi, qui veux comprendre les protections "données" mises en place dans le sprint : optimistic locking, race-conditions fixes, validation JSONB Zod runtime, garde-fou anti-réécriture de migration.
> **Durée de lecture :** ~12 minutes.

---

## Contexte

Avant ce sprint, plusieurs bugs latents existaient sur la couche données :
1. **Race condition `art_keywords` upsert** — deux requêtes concurrentes incrémentaient le compteur, l'une perdait son increment.
2. **Pas d'optimistic locking** — deux admins éditaient le même musée, le second écrasait silencieusement le premier.
3. **JSONB columns sans validation** — un bug client pouvait insérer `metadata: { "evil": "<script>" }` dans `chat_messages.metadata`, on lisait la donnée plus tard sans savoir si elle était cohérente.
4. **Migrations rewritables** — un dev pouvait modifier le contenu d'une migration déjà appliquée en prod, breaking ops.

Le sprint a fermé les 4 trous via deux specs : **C subsystem (concurrence)** et **D subsystem (validation JSONB)**.

---

## Spec C.1 — VersionColumn + `withOptimisticLockRetry`

### Le problème en une phrase

Deux opérateurs admin éditent le même musée simultanément. Sans protection, le second qui save écrase le premier — le premier ne voit jamais que sa modif a été perdue.

### Analogie

Deux serveurs qui prennent des notes sur la même commande client. Si chacun écrit "ajouter 1 dessert" sur sa propre feuille puis recopie sur la fiche commune, le second efface le travail du premier sans s'en rendre compte. **Optimistic locking** = chacun lit le numéro de version de la fiche, fait sa modif, et au moment d'écrire, vérifie que le numéro de version est toujours celui qu'il a lu. Si non, "désolé, quelqu'un est passé avant, recommence avec la nouvelle version".

### Comment c'est implémenté

**TypeORM `@VersionColumn`** sur les entités sensibles (Museum, UserMemory, ChatSession). À chaque save, TypeORM :
1. Lit la version courante de l'entité.
2. Sur l'UPDATE SQL, ajoute `WHERE version = <ancienne valeur>`.
3. Incrémente la version dans le SET.
4. Si `affectedRows === 0` (parce qu'un autre commit a déjà incrémenté la version), TypeORM throw `OptimisticLockVersionMismatchError`.

Migration : `ADD COLUMN version integer NOT NULL DEFAULT 1` puis `DROP DEFAULT` (metadata-only sur Postgres 16).

**Helper `withOptimisticLockRetry`** pour absorber la contention courte :

`museum-backend/src/shared/db/optimistic-lock-retry.ts:35-68`

```ts
export async function withOptimisticLockRetry<T>(opts: OptimisticLockRetryOptions<T>): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await opts.mutation();
    } catch (err) {
      const isOptimistic =
        err instanceof Error && err.name === 'OptimisticLockVersionMismatchError';
      if (!isOptimistic) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        logger.warn('optimistic_lock_retry', { attempt, maxAttempts, context: opts.context });
        await opts.refetch();
        const jitter = Math.floor(Math.random() * Math.max(1, baseDelayMs));
        const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
        await new Promise<void>((resolve) => { setTimeout(resolve, delay); });
      }
    }
  }

  throw lastError;
}
```

Lecture :
- **3 tentatives par défaut** avec backoff exponentiel + jitter (50 ms, 100 ms, 200 ms environ).
- **Refetch entre tentatives** — récupère la version fraîche pour que la prochaine mutation ait des données à jour.
- **Throw d'autres erreurs immédiatement** — pas de retry sur un FK violation, par exemple.
- Après les 3 tentatives, **rethrow** → la couche HTTP renvoie un 409 Conflict.

### Pourquoi c'est pertinent

Pour Musaium, le cas concret = un admin musée qui édite la fiche `Louvre` pendant qu'un autre admin met à jour les horaires. Sans optimistic lock, le second efface la modif du premier. Avec optimistic lock + retry, le second voit "ah, tu as une version stale, je récupère la fraîche et je tente de re-merger".

Pour les contentions sustained (10 admins sur la même fiche), tu obtiens un 409 propre et tu sais que tu dois re-faire ta modif.

### Est-ce overkill ?

Non. C'est la pratique standard dès qu'on a plus d'1 admin sur une ressource. Coût marginal : 1 colonne `version` par entité + un wrapper de 30 lignes. Bénéfice : zéro perte silencieuse.

---

## Spec C.2 — Atomic UPSERT pour `art_keywords` (vrai bug fix prod)

### Le problème en une phrase

Pre-fix : `art_keywords.upsert()` faisait read-modify-write (lit le row, incrémente `hitCount`, save). Deux requêtes concurrentes sur le même mot-clé → race → un increment perdu.

### Le scenario qui casse

Imagine deux users qui demandent simultanément "qui est Vincent van Gogh ?". Le service essaie de tracker que "van gogh" est demandé.

```
T0  Request A : SELECT * FROM art_keywords WHERE keyword='van gogh'  → hitCount=10
T1  Request B : SELECT * FROM art_keywords WHERE keyword='van gogh'  → hitCount=10
T2  Request A : UPDATE ... SET hitCount=11 WHERE id=X
T3  Request B : UPDATE ... SET hitCount=11 WHERE id=X    ← devrait être 12 !
```

Résultat : 2 demandes, +1 seul incrément en base. Bug subtil mais réel.

### Le fix (commit `56d035f46`)

Switch vers **PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE`** :

```sql
INSERT INTO art_keywords (keyword, locale, hitCount, createdAt, updatedAt)
VALUES ($1, $2, 1, NOW(), NOW())
ON CONFLICT (keyword, locale) DO UPDATE
  SET hitCount = art_keywords.hitCount + 1,
      updatedAt = NOW()
RETURNING *;
```

C'est **un seul round-trip SQL, atomique au niveau row**. Postgres garantit que les deux requêtes concurrentes seront sérialisées (l'une attend l'autre), et chacune verra la valeur incrémentée par la précédente. Pas de perte.

### Le @Unique constraint qui rend ça possible

Pour que `ON CONFLICT (keyword, locale)` marche, il faut un index unique sur `(keyword, locale)`. Ajouté via `@Unique` decorator + migration. Commit `384e4eace`.

### Pourquoi c'est pertinent

`art_keywords` est utilisé pour :
- Tracker les mots-clés populaires (analytics produit).
- Décider quels keywords purger en retention (peu fréquents = supprimés, cf. doc 11).

Si l'increment est perdu de moitié, les analytics sont fausses et on purge à tort des keywords qui devaient être gardés. Bug silent, conséquences invisibles à l'oeil mais réelles.

### Est-ce overkill ?

**Non, c'est un vrai bug fix**. Pas de débat overkill. La technique `INSERT ... ON CONFLICT` est la solution canonique Postgres pour ce pattern.

---

## Spec C.4 — `Check1776 DO-NOT-REWRITE` + MIGRATION_GOVERNANCE.md

### Le problème en une phrase

Un dev a réécrit le contenu d'une migration déjà appliquée en prod. Conséquence : `migration:run` sur un nouveau env disait "déjà appliqué" en se basant sur le numéro, mais le schéma résultant ne match pas. Drift silencieux.

### La parade : `Check1776 DO-NOT-REWRITE`

Migration spéciale (numéro `1776`) qui ne fait **rien fonctionnellement**, juste affirme : "à partir d'ici, toute migration est immuable, ne jamais éditer post-merge".

Plus le runbook `docs/MIGRATION_GOVERNANCE.md` qui codifie 8 règles :
1. Toujours générer via `node scripts/migration-cli.cjs generate --name=X`.
2. Jamais hand-write SQL.
3. Jamais réécrire post-merge — créer une nouvelle migration de fix.
4. CONCURRENTLY → `transaction = false`.
5. `DB_SYNCHRONIZE` jamais `true` en prod.
6. Etc.

### Pourquoi c'est pertinent

Sans ce garde-fou, à 6 mois on aurait des incohérences entre staging et prod sans savoir d'où ça vient. Le runbook + la migration sentinel = mémoire institutionnelle.

### Est-ce overkill ?

Non. C'est de la doc + 1 migration vide. Coût zéro, gain énorme en discipline.

---

## Spec D — JSONB Zod runtime validation

### Le problème en deux phrases

Postgres permet de stocker du JSON arbitraire dans une colonne `jsonb`. Très flexible, mais sans validation : un bug app peut écrire `metadata: { "$$evil": "<script>" }` et la prochaine lecture servira ce contenu sans broncher.

### Analogie

Une boîte aux lettres qui accepte tout : courriers normaux, sacs poubelle, animaux morts. Pratique pour la flexibilité, désastre pour le facteur. Spec D met un **filtre à l'entrée** : tu peux écrire dans la boîte, mais on vérifie d'abord que c'est bien une lettre conforme.

### Comment c'est implémenté

`museum-backend/src/shared/db/jsonb-validator.ts:23-49`

```ts
export function jsonbValidator(schema: ZodSchema, fieldName: string): ValueTransformer {
  return {
    to(value: unknown): unknown {
      if (value === null || value === undefined) return value;
      const result = schema.safeParse(value);
      if (result.success) {
        return result.data;
      }
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn('jsonb_validation_failed', { field: fieldName, issues });
      throw new AppError({
        message: `Invalid JSONB shape for ${fieldName}`,
        statusCode: 422,
        code: 'JSONB_VALIDATION',
        details: { field: fieldName, issues },
      });
    },
    from(value: unknown): unknown {
      return value;
    },
  };
}
```

Lecture :
- **`to`** (write direction) : Zod `.safeParse(value)`. Si succès → retourne la valeur typée. Si échec → throw `AppError(422)` avec field path + issue list.
- **`from`** (read direction) : identity. Pas de validation à la lecture — les rows existantes (legacy avant le wiring) sont tolérées. Si tu veux strict reads, tu valides au use case layer.

### Wiring sur les 12 colonnes

Le sprint a wiré la validation sur 12 colonnes JSONB clés :

- `chat_messages.metadata` (loose schema)
- `user_memories.notableArtworks` (strict)
- `museums.config` (loose)
- `museum_qa_seed.metadata` (loose)
- `museum_enrichment.openingHours` (strict)
- `museum_enrichment.admissionFees` (strict)
- `museum_enrichment.collections` (strict)
- `museum_enrichment.currentExhibitions` (strict)
- `museum_enrichment.accessibility` (strict)
- `museum_enrichment.sourceUrls` (strict)
- `totp_secrets.recovery_codes` (strict)
- `audit_logs.metadata` (loose)

**Loose vs strict** :
- **Strict** = schéma exact, pas de propriété additionnelle, types fixes. Pour les données critiques (recovery codes MFA, horaires musée).
- **Loose** = schéma large avec `passthrough()` autorisé pour propriétés extra. Pour les bags génériques (metadata).

### Pas de migration DB

Important : le transformer fire **uniquement à l'application layer**, pas en DB. Aucune migration ALTER TABLE n'a été nécessaire. Les rows existantes restent stockées telles quelles ; seules les **nouvelles** writes passent par la validation.

C'est le **bon trade-off** :
- Pas de risque de bloquer un déploiement parce qu'une vieille row ne match pas le schéma.
- Backfill manuel possible si un jour on veut tout valider strict.

### Pourquoi c'est pertinent

Cas concret Musaium : un client mobile en V1.2 envoie `metadata: { "newFeature": "..." }` que le BE V1.0 ne connaît pas. Sans schema strict (loose), ça passe. Si un client malicieux envoie `metadata: { "$$inject": "..." }`, l'AppError 422 est claire.

Pour les colonnes strict comme `totp_secrets.recovery_codes`, c'est de la **defense-in-depth** : un bug interne qui écrirait une mauvaise structure est attrapé avant de corrompre la base.

### Est-ce overkill ?

Non. Coût d'implémentation : un transformer de 30 lignes + 12 schemas Zod. Coût runtime : ~0.1 ms par write JSONB (Zod safeParse est rapide). Bénéfice : tous les bugs de structure JSONB sont attrapés à l'écriture, jamais en lecture.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Tester un edit concurrent sur Museum | À faire en validation : ouvrir 2 sessions admin, éditer le même musée → l'un doit avoir 409 |
| Tester l'upsert atomique art_keywords | Test e2e via load-test 100 reqs concurrent sur même keyword |
| Tester JSONB validation | Envoyer un `POST /chat/sessions` avec `metadata: { invalid: "<script>" }` → doit retourner 422 |
| Lire `docs/MIGRATION_GOVERNANCE.md` une fois | Recommandé avant le prochain `migration:generate` |
| Vérifier que `Check1776` migration existe | `ls museum-backend/src/data/db/migrations/ | grep 1776` |

---

## Tech debt assumée

- **Pas de validation strict on read** — les vieilles rows pré-wiring sont tolérées. Si jamais besoin de strict reads, ajouter un job de backfill validation + migration cleanup.
- **`art_keywords.upsert` atomic SQL est non-portable** — si on switch à un autre SGBD un jour (MySQL, SQLite), faudra réécrire. Bas risque (Postgres est notre standard).
