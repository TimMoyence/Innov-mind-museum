# 17 — Bloc 8 : Production bugs corrigés (4 réels + audit pre-roadmap)

> **Pour qui ?** Toi, qui veux comprendre les **vrais bugs prod** détectés et corrigés pendant ce sprint — preuve que l'investissement test paie.
> **Durée de lecture :** ~10 minutes.

---

## Pourquoi ce bloc compte

Les 7 phases de tests (cf. doc 16) ne sont pas du gold-plating académique : elles ont **détecté 4 vrais bugs production** sur ce sprint, plus 6 autres trouvés lors d'un audit pré-roadmap. Total **10 bugs prod surfacés en une semaine**. Sans ces tests, ils auraient atteint la prod (ou y étaient déjà).

---

## Bug 1 — TZ-sensitive cursor pagination (Sprint 10.2)

### Le symptôme

Les curseurs de pagination (qui permettent de naviguer page par page dans les listes de messages chat) **cassaient au bord de minuit** selon la timezone du serveur. Pages perdues ou dupliquées.

### Pourquoi

Postgres `TIMESTAMP WITHOUT TIME ZONE` (le default TypeORM) stocke un timestamp **sans** info de fuseau. Quand le serveur en `UTC` lit une row écrite par un serveur en `Europe/Paris`, l'interprétation diffère.

Au moment de générer un curseur basé sur `createdAt` :
- Serveur Paris (`UTC+2` en été) : `2026-05-15T23:30:00`
- Serveur UTC : `2026-05-15T21:30:00`

Si le curseur est sérialisé avec une timezone implicite, deux requêtes consécutives sur des serveurs différents (LB rotation par exemple) lisent des fenêtres différentes.

### Le fix (commit `0999cd9db`)

Migration `1777721420875-ChatTimestamptz` qui convertit les colonnes timestamp de `chat_sessions` et `chat_messages` en **`TIMESTAMP WITH TIME ZONE` (TIMESTAMPTZ)**.

TIMESTAMPTZ = Postgres stocke en UTC normalisé + récupère selon le fuseau de la session. Pas d'ambiguïté.

Vérifié sous `TZ=Europe/Paris` après fix : pagination cohérente.

### Ce que ça t'apprend

**Toujours utiliser TIMESTAMPTZ pour les timestamps qui croisent timezone.** TypeORM le supporte via `@Column({ type: 'timestamptz' })`. C'est dans `MIGRATION_GOVERNANCE.md` post-fix.

---

## Bug 2 — `MessageFeedback` SQL malformed (Sprint 10.1)

### Le symptôme

À chaque toggle thumbs up/down sur un message chat, le BE throw une exception SQL malformée. **Hot path : chaque feedback user**.

### Pourquoi

Code TypeORM :

```ts
const feedback = await this.feedbackRepo.findOne({
  where: { message: { id: messageId } },
  select: ['value'],
});
```

TypeORM, avec cette syntaxe `where: { message: { id } }` + `select: ['value']`, génère un SQL bizarre :

```sql
SELECT distinctAlias.MessageFeedback_id FROM (
  SELECT MessageFeedback.id FROM message_feedback ...
) distinctAlias
```

La colonne `value` qu'on a demandée est **jamais projected** dans le CTE intérieur. Throw au runtime dès que la table contient des rows.

### Le fix (commit `a7849fc88`)

Switch vers une lookup par FK column flat :

```ts
const feedback = await this.feedbackRepo.findOne({
  where: { messageId },         // ← colonne plate, pas relation
  select: ['value'],
});
```

Plus simple, plus rapide, et SQL bien formé.

### Pourquoi le bug n'avait pas été vu

Aucun test integration ne touchait ce path avec une vraie DB. Phase 9 a écrit ces tests (Sprint 9.4 a ajouté 41 tests d'intégration chat repo, dont 4 ont pété sur ce bug → marqués `it.skip` → fix Phase 10 → unskip).

---

## Bug 3 — `art_keywords` upsert race condition

Détaillé en [doc 10 — Spec C.2](./10-bloc-6-data-hardening.md). En résumé : read-modify-write naïf perdait des increments concurrents. Fix = `INSERT ... ON CONFLICT ... DO UPDATE SET hitCount = hitCount + 1`.

---

## Bug 4 — TypeORM `verifyEmail` ne nettoyait jamais le `verification_token` 🚨

### Le symptôme

Quand un user cliquait sur le lien de vérification d'email reçu, son token de vérification **restait valide** et pouvait être rejoué **indéfiniment**.

C'est une **vraie auth bypass production-live**. Si quelqu'un interceptait un email de verify (via leak, MITM, log scrubé incorrectement), il pouvait **continuellement re-vérifier l'email** et donc s'authentifier en tant que ce user.

### Pourquoi (commit `9d1e971a5`)

Le code original :

```ts
await this.userRepo
  .createQueryBuilder()
  .update()
  .set({
    emailVerified: true,
    verification_token: undefined,  // ← TypeORM SKIP CE FIELD
  })
  .where({ id: userId })
  .execute();
```

**Piège TypeORM** : `set({ field: undefined })` est **silencieusement skip** par le `UpdateQueryBuilder`. Le SQL généré devient :

```sql
UPDATE users SET emailVerified = true WHERE id = X
-- verification_token reste avec sa valeur précédente !
```

Donc le token consumed reste live.

### Le fix

Switch vers une expression raw qui force TypeORM à émettre `NULL` :

```ts
await this.userRepo
  .createQueryBuilder()
  .update()
  .set({
    emailVerified: true,
    verification_token: () => 'NULL',  // ← raw expression, force émission
  })
  .where({ id: userId })
  .execute();
```

Maintenant le SQL est :
```sql
UPDATE users SET emailVerified = true, verification_token = NULL WHERE id = X
```

### Recommandation post-mortem

Le bug était subtil et silencieux pendant des mois. Recommandation : **un audit security-focused agent sur tous les `set({ field: undefined })` du codebase** pour vérifier qu'aucun autre champ n'est dans le même cas.

C'est dans la roadmap post-launch.

### Pourquoi c'est le bug le plus grave du sprint

Les 3 autres bugs sont opérationnels (perf, race, pagination). Bug 4 est **sécurité auth** : token replay illimité = compte vulnérable au take-over si le token est intercepté.

---

## Bug 5 — Redis-DDoS bypass (guardrail budget)

Détaillé en [doc 06 — Ping-gate fix](./06-bloc-2-v12-orchestrator-supply-chain.md#ping-gate-fix-budget-juge-llm-commit-d7ba7f5f7). En résumé : `cache.get(...) === null` ne distinguait pas "première requête de la journée" et "Redis down". Fix = ping reachability gate.

---

## Audit pre-roadmap (`9d1e971a5`) — 6 bugs au total

Le commit `9d1e971a5` n'est pas seulement le fix de Bug 4. C'est un **audit complet** qui a surfacé 6 bugs. Récap :

### Bug 1 — testcontainers leak

Le harness `e2e` ne nettoyait pas correctement les containers Docker entre les runs Jest. À force, le VPS de CI accumulait des containers `museum-ia-e2e-*` orphelins jusqu'à saturer la RAM.

**Fix** : `harness.stop()` await maintenant le `postgres-testcontainer.stop()`. Ajout d'un `jest globalTeardown` qui sweep les containers leakés.

### Bug 2 — uuid override broke runtime

Le sprint avait initialement ajouté un override `uuid >=14.0.0` pour soi-disant fixer GHSA-w5hq-g745-h8pq. Conséquence : uuid 14 est ESM-only, casse Jest.

**Diagnosis honnête** : Musaium consomme uuid uniquement via `validate(string)`. La CVE GHSA-w5hq-g745-h8pq (buffer-bounds bug) n'est **pas applicable**.

**Fix** : override **removed**. uuid pinned à `^11.1.0` direct dans `package.json`. `pnpm audit --prod` clean.

### Bug 3 — HIBP gate breaks fixture password en e2e

L'enabler HIBP (cf. doc 01 F10) bloque les passwords leakés. Le fixture e2e utilisait `Password123!` qui est **dans la base HIBP** (très commun).

**Fix** : nouveau env flag `auth.passwordBreachCheckEnabled`. Default `true` (= toujours actif en prod). E2e harness + jest setup **pin `false`** pour les fixtures. Production sentinel rejette `false` loud.

### Bug 4 — Multi-harness AppDataSource singleton

Quand plusieurs e2e tests boot leur propre harness, ils partageaient le même singleton `AppDataSource`. Un harness 2 qui re-import le module tentait de `jest.resetModules()` pour avoir un singleton frais — mais ça cassait l'identité des classes (entity X dans module avant reset ≠ entity X après reset → `instanceof AppError` retournait false).

**Fix** : au lieu de reset modules, mutation in-place de `AppDataSource.options` (host/port/user) + `destroy()` + `initialize()`. Garde l'identité des classes.

### Bug 5 — TypeORM `verifyEmail` (le gros)

Cf. ci-dessus.

### Bug 6 — Chaos resilience contracts

Le wrapper `safeJwtVerify` ne traduisait pas correctement les exceptions de `jsonwebtoken` (TokenExpiredError, JsonWebTokenError) en `AppError 401`. Conséquence : ces erreurs bubbled comme 500 leakant la stack-trace.

**Fix** : `safeJwtVerify` catch les 3 classes d'erreur connues et throw `AppError 401`.

---

## Pourquoi c'est pertinent pour Musaium

### Démontre la valeur des tests

10 bugs détectés en 1 sprint. **Sans les phases de tests, ces bugs auraient atteint la prod V1 launch.** Coût en image : potentiellement plus élevé que tout le sprint test.

### Bug 4 spécifiquement = bullet dodgée

Si Bug 4 (verifyEmail token replay) avait atteint prod, le premier audit sécurité B2B (musée client) l'aurait flag immédiatement. Crédibilité dommage majeur.

### Pattern à retenir

Le **Bug 5 du commit audit** (uuid override mal calé) est un pattern important : **never accept a CVE override sans avoir vérifié que la CVE s'applique à ton code**. La CVE peut concerner une fonction de la lib que tu n'utilises pas → override = pure complication, zero gain.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Tester le nouveau verifyEmail | Inscription test + click sur lien + vérifier que le 2nd click echoue |
| Tester le toggle feedback | Up/down message → vérifier dans DB que la row existe sans throw |
| Tester pagination cursor en `TZ=Europe/Paris` | Si chat actif au bord minuit, vérifier qu'il n'y a pas de gap |
| Faire un security-focused audit sur les `set({ field: undefined })` | À ouvrir comme task post-launch (prioritaire) |
| Vérifier qu'`AUTH_EMAIL_SERVICE_KIND` n'est pas `'test'` en prod | Lecture rapide de `.env` prod |

---

## Tableau récap des 4 bugs principaux

| Bug | Sprint | Symptôme | Fix |
|-----|--------|----------|-----|
| TZ cursor pagination | 10.2 | Pages perdues/dupliquées au bord minuit | Migration TIMESTAMPTZ |
| MessageFeedback SQL malformed | 10.1 | Crash sur chaque thumbs up/down | Switch where à colonne flat |
| art_keywords upsert race | C.2 | Increments perdus en concurrence | INSERT ON CONFLICT atomic |
| 🚨 verifyEmail token replay | Audit | Token consumed reste live indéfiniment | `() => 'NULL'` raw expression |

Le 🚨 est celui que tu dois retenir. C'est le seul vrai sécurité critique des 4.
