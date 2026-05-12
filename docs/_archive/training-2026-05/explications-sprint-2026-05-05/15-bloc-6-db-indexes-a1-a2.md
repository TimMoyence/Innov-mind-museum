# 15 — Bloc 6 partie 6 : DB indexes A1+A2 + EXPLAIN bench

> **Pour qui ?** Toi, qui veux comprendre pourquoi 7 nouveaux indexes ont été ajoutés en zero-downtime, et pourquoi ça donne des speedups de 368× à 1075×.
> **Durée de lecture :** ~10 minutes.

---

## Le problème en une phrase

Sept colonnes critiques (foreign keys + tokens d'auth) n'avaient pas d'index. Conséquence : Postgres faisait des **Sequential Scans** (lit toute la table) sur chaque requête, latence en seconde au lieu de millisecondes.

---

## Analogie : l'index d'un livre

Tu cherches le mot "Renaissance" dans un livre de 800 pages.

- **Sans index** : tu lis chaque page jusqu'à le trouver (= Sequential Scan en SQL).
- **Avec index** : tu vas à l'index alphabétique en fin d'ouvrage, tu trouves "Renaissance → page 247", tu sautes directement (= Index Scan).

Le coût de l'index ? L'éditeur a passé du temps à le construire (= temps de migration). Le coût de la lecture ? L'index occupe quelques pages supplémentaires (= ~10 % de stockage en plus). Bénéfice ? **Tu trouves en secondes au lieu d'heures**.

---

## Vocabulaire DB indexes

| Terme | Définition |
|-------|------------|
| **Index B-tree** | Structure de données arborescente qui permet de chercher en O(log n) au lieu de O(n). Standard Postgres. |
| **Sequential Scan (Seq Scan)** | Postgres lit toute la table ligne par ligne. Lent dès que la table grandit. |
| **Index Scan** | Postgres traverse l'index, trouve les rows à lire, lit uniquement ces rows. Rapide. |
| **Index Only Scan** | Postgres trouve tout dans l'index, sans même lire la table. Le plus rapide. |
| **CONCURRENTLY** | Mot-clé Postgres qui permet de créer un index sans locker la table. Plus lent à construire mais zéro downtime. |
| **Foreign key (FK)** | Colonne qui référence l'id d'une autre table. Postgres ne crée PAS d'index automatiquement sur les FKs. |
| **EXPLAIN ANALYZE** | Commande Postgres qui exécute la requête et te donne le plan détaillé + temps mesuré. |

---

## Pourquoi un sprint entier sur les indexes ?

Quand tu génères une table TypeORM avec une `@ManyToOne`, Postgres crée automatiquement la contrainte FK mais **pas l'index** sur la colonne. C'est un piège classique.

Symptôme : tout marche en dev (10 rows par table). Tout casse en prod à 100K rows. Et c'est **silencieux** : la requête réussit, juste de plus en plus lente.

Le sprint a fait 2 passes :
- **A1 (P0)** : 3 indexes critiques sur le hot path chat.
- **A2 (P1)** : 4 indexes sur les tokens auth + tickets.

Plus un harness `seed-perf-load` qui peuple la base avec 10M rows pour mesurer correctement.

---

## A1 — Les 3 indexes P0 (hot path chat)

### Ce qui a été ajouté

`museum-backend/src/data/db/migrations/1777568348067-AddCriticalChatIndexesP0.ts`

```ts
export class AddCriticalChatIndexesP01777568348067 implements MigrationInterface {
  name = 'AddCriticalChatIndexesP01777568348067';
  public readonly transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_messages_sessionId" ` +
        `ON "chat_messages" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId" ` +
        `ON "chat_sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_artwork_matches_messageId" ` +
        `ON "artwork_matches" ("messageId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_artwork_matches_messageId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId"`);
  }
}
```

Trois choses critiques à noter :

### 1. `transaction = false`

```ts
public readonly transaction = false as const;
```

**Pourquoi** : Postgres refuse d'exécuter `CREATE INDEX CONCURRENTLY` à l'intérieur d'une transaction. TypeORM par défaut wrap chaque migration dans `BEGIN ... COMMIT`. Désactiver le wrapper permet le CONCURRENTLY.

**Conséquence** : si la migration plante au milieu (3 indexes à créer), tu peux te retrouver avec 1 ou 2 créés. C'est OK grâce à `IF NOT EXISTS` : tu re-runs, ça reprend là où ça s'est arrêté.

### 2. `CONCURRENTLY`

**Pourquoi** : sans CONCURRENTLY, `CREATE INDEX` lock la table en écriture (`ACCESS EXCLUSIVE` lock). Pendant la création (peut durer plusieurs minutes sur grosse table), aucun INSERT / UPDATE / DELETE ne passe. Pour Musaium prod = chat down pendant la migration.

**Avec CONCURRENTLY** : Postgres construit l'index en arrière-plan en deux passes, en lisant la table pendant que les INSERT / UPDATE continuent. Pas de downtime.

**Coût** : la création est ~2-3× plus lente. Acceptable parce que c'est offline ops.

### 3. `IF NOT EXISTS` + `IF EXISTS`

**Idempotency** : tu peux re-runs la migration sans erreur. Crucial pour les CONCURRENTLY qui peuvent partiellement échouer.

### Recovery : index INVALID

Si un `CREATE INDEX CONCURRENTLY` est tué en cours (Postgres restart, signal kill), l'index reste en état `INVALID` — il existe mais Postgres ne l'utilise pas. Le runbook `docs/DB_BACKUP_RESTORE.md` documente la procédure :
1. `SELECT * FROM pg_indexes WHERE schemaname='public' AND indexdef LIKE '%INVALID%';`
2. `DROP INDEX CONCURRENTLY <nom_invalid>;`
3. Re-run la migration.

---

## A2 — Les 4 indexes P1 (auth tokens + tickets)

Migration `1777617893834-AddP1FKAndTokenIndexes.ts` (structure similaire) ajoute :
- `IDX_support_tickets_assignedToId` — pour les listings admins "tickets qui me sont assignés".
- `IDX_users_passwordResetToken` — pour la lookup du token de reset password.
- `IDX_users_emailChangeToken` — pour la lookup du token de change-email.
- 1 autre FK index.

---

## Le double-pass : migration + `@Index` decorator

Important : ajouter l'index dans la migration **n'est pas suffisant**. La prochaine fois que tu fais `migration:generate`, TypeORM va voir "ah, il manque un index dans le code mais il existe en DB" et **proposer une migration qui le supprime** (ou pas le générer correctement).

Pour éviter ça, le sprint a ajouté `@Index()` decorator sur la propriété TypeORM correspondante :

```ts
// modules/chat/domain/message/chatMessage.entity.ts
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  @Index('IDX_chat_messages_sessionId')   // ← ajouté
  session!: Relation<ChatSession>;
  ...
}
```

Ensuite, un test d'idempotence vérifie que `migration:generate` produit une migration vide (commits `16e6e88c7` et `773ff7874`). Si jamais quelqu'un re-add `@Index` au mauvais endroit, le test plante.

---

## Le bench EXPLAIN ANALYZE (commit `bbec37022`)

Le sprint a peuplé la base avec un harness `seed-perf-load` (10M chat_messages, 1M chat_sessions, 500K artwork_matches) et mesuré 7 requêtes hot avant/après :

| Query | Pre | Post | Speedup | Target |
|-------|-----|------|---------|--------|
| Hot 1 — messages d'une session | 1559 ms | 4.2 ms | **368×** | <10 ms |
| Hot 2 — sessions d'un user | 106 ms | 0.18 ms | **579×** | <20 ms |
| Hot 3 — artwork matches d'un msg | 156 ms | 2.0 ms | **77×** | <5 ms |
| Hot 4 — cascade delete user (GDPR) | 5003 ms | 26.4 ms | **190×** | <100 ms |
| P1.a — tickets assignés | 3.7 ms | 0.26 ms | 14× | (déjà OK) |
| P1.b — reset_token lookup | 22.6 ms | 0.021 ms | **1075×** | (auth security) |
| P1.c — email_change_token | 21.8 ms | 0.035 ms | 622× | (auth security) |

### Lecture des 3 résultats les plus intéressants

**Hot 4 — cascade delete user (5 sec → 26 ms, 190×)**

C'est la requête de **suppression de compte GDPR**. Avant, supprimer un user = supprimer ses sessions, messages, etc. via FK cascade. Sans index sur `chat_sessions.userId`, Postgres devait scanner toute la table sessions pour trouver celles qui pointent vers ce user. À 1M users, c'était **5 secondes** par delete. À l'échelle de 100 deletes GDPR/jour = **8 minutes de DB occupée par jour**, plus le fait que l'utilisateur attend 5 sec qu'on lui dise "compte supprimé".

Avec index : 26 ms. Imperceptible.

**P1.b — reset_token lookup (1075×)**

Quand un user clique le lien dans son email "réinitialiser mon mot de passe", le BE fait `SELECT * FROM users WHERE passwordResetToken = $1`. Sans index, Seq Scan sur la table users entière. À 1M users = 22 ms juste pour cette lookup.

**Et c'est pire que la latence** : un attaquant qui essaie tous les tokens possibles (brute-force) saturait Postgres. Avec index = 0.02 ms = pas de surface DDoS via ce vecteur.

**Hot 1 — messages d'une session (368×)**

À chaque ouverture d'écran chat, le client fetch tous les messages de la session. Sans index, 1.5 sec d'attente. Avec, 4 ms. UX night/day.

---

## Pourquoi c'est pertinent pour Musaium

### Performance UX

Sans ces indexes, dès que tu auras 100 sessions chat de plus de 50 messages, l'écran de chat met 1-2 sec à charger. Inacceptable pour un usage voice-first où chaque seconde compte.

### Sécurité

Le speedup 1075× sur reset_token = **fenêtre brute-force fermée**. Un attaquant qui essayait des tokens random saturait la DB. Plus maintenant.

### GDPR compliance

Le cascade delete user en 26 ms vs 5 sec = différence entre "RGPD article 17 compliant en SLA correct" et "pratique inutilisable, on diffère".

---

## Le harness `seed-perf-load`

Important : le bench a tourné sur **10M rows**, pas sur la base prod actuelle. Pourquoi ?

À petite échelle (1000 rows en dev), Postgres choisit souvent le Seq Scan parce que c'est plus rapide qu'un Index Scan (l'overhead de l'index n'est pas amorti). Tu pourrais croire "tout marche" en dev et te planter en prod.

Le seed-perf-load reproduit l'échelle prod future. Sans ce harness, on n'aurait pas vu les speedups réels avant de rencontrer les problèmes en prod.

**Tech debt** : le harness est dev/staging only. **EXPLAIN against current prod scale (small) won't catch future regression**. Il faut le rerunner régulièrement (annuel ou avant chaque migration majeure).

---

## Est-ce overkill ?

**Non, c'est minimum vital.** Un système Postgres en prod sans indexes sur les FKs et tokens est un bug en attente.

Le seul cas où ce serait "trop précoce" = projet jouet jamais déployé. Musaium V1 = pas dans ce cas.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Vérifier que les 2 migrations sont appliquées en prod | `pnpm migration:run` doit dire "no pending migrations" |
| Re-générer la migration de check | `node scripts/migration-cli.cjs generate --name=DriftCheck` doit produire une migration vide |
| Vérifier qu'aucun index n'est en INVALID | `SELECT * FROM pg_indexes WHERE indexname LIKE 'IDX%'` puis croiser avec `pg_class.relkind` |
| Re-runner `seed-perf-load` annuellement | Voir `docs/DB_BACKUP_RESTORE.md` |
| Relire le runbook INVALID | Pour savoir comment réagir si une migration index est tuée |

---

## Pièges à éviter à l'avenir

1. **Toujours utiliser `transaction = false` quand tu fais CONCURRENTLY.** Sinon Postgres throw immédiatement.
2. **Toujours mettre `IF NOT EXISTS` / `IF EXISTS`.** Sinon une re-run plante.
3. **Toujours faire le double-pass migration + `@Index` decorator.** Sinon `migration:generate` génère un drop suivant.
4. **Ne pas oublier les FK quand tu ajoutes une `@ManyToOne` ou `@OneToMany`.** Réflexe à automatiser : tout FK = index nécessaire.
5. **Ne pas indexer tout aveuglément.** Chaque index ralentit les writes (~5-10 % par index). Les indexes ne servent que si la colonne est dans une `WHERE` ou une `ORDER BY`.
