# 11 — Bloc 6 partie 2 : Retention policies + scheduled prune (Spec E)

> **Pour qui ?** Toi, qui veux comprendre comment Musaium nettoie automatiquement les vieilles données pour rester conforme RGPD et garder la base légère.
> **Durée de lecture :** ~10 minutes.

---

## Le problème en deux phrases

Sans nettoyage automatique, ta DB grossit indéfiniment. Au-delà des coûts de stockage, **tu deviens hors-la-loi RGPD** (article 5.1.e : "data minimization" — pas de conservation au-delà du nécessaire).

---

## Analogie : le grenier

Tu peux tout garder au grenier (factures, courriers, vieux jouets, photos). Au bout de quelques années, c'est un cauchemar à fouiller, ça pollue ta maison, ça coûte cher en assurance. Une routine "tous les 6 mois je trie ce qui doit partir" garde le grenier utile et léger.

Spec E met cette routine en place pour 3 tables : `support_tickets`, `reviews`, `art_keywords`.

---

## Vocabulaire

| Terme | Définition |
|-------|------------|
| **Retention policy** | Règle qui dit "telle donnée doit être supprimée au bout de X jours dans tel état". |
| **Hard delete** | Suppression réelle de la ligne en base (vs soft delete = flag `deleted_at`). |
| **Cron** | Tâche programmée qui tourne à intervalle régulier (ici, daily à 03:15 UTC). |
| **Idempotent** | Tu peux relancer la tâche 10 fois, ça donne le même résultat. Important si la tâche plante en milieu de course. |
| **Pure function** | Fonction qui prend ses inputs, retourne un output, sans effet de bord caché. Facile à tester. |

---

## Les 3 policies adoptées

| Table | Critère de purge | ADR |
|-------|------------------|-----|
| `support_tickets` | `status IN (closed, resolved) AND updatedAt < NOW()-365d` | ADR-018 |
| `reviews` | `status='rejected' AND createdAt<NOW()-30d` OU `status='pending' AND createdAt<NOW()-60d` | ADR-019 |
| `art_keywords` | `hitCount<=1 AND updatedAt<NOW()-90d` | ADR-020 |

### Pourquoi ces seuils

**Support tickets 365 jours :**
- Closed/resolved = la conversation est terminée, plus aucune valeur opérationnelle.
- 365 jours = couvre les "cas remontés en année N+1 par le user qui se rappelle de son ancien ticket" + obligations légales courantes.
- Pas de soft-delete : le user qui demande la suppression de ses données via GDPR a la garantie que c'est vraiment parti.

**Reviews :**
- Approved : kept forever (ce sont des avis publics utiles, plus rien à supprimer).
- Rejected : 30 jours (le temps qu'un modérateur reverse sa décision en cas d'erreur).
- Pending : 60 jours (au-delà, c'est un avis abandonné par le user ou le modérateur).

**Art_keywords :**
- `hitCount<=1` = mot-clé recherché 0 ou 1 fois dans les 90 derniers jours = signal tellement faible qu'il n'aide ni les analytics ni les recommandations.
- Garder ces rows pollue le tableau analytics et fausse les distributions.

### Pourquoi pas plus court / plus long

Le sprint a explicitement débattu chaque seuil dans son ADR. Citation ADR-018 : "365 jours est le minimum pour couvrir un cycle de saisonnalité B2B (musées qui rouvrent leurs problèmes l'année suivante au moment équivalent)".

Tu peux ajuster via env vars (`RETENTION_SUPPORT_TICKETS_DAYS`, etc.) sans toucher au code.

---

## L'architecture du prune

### Pure function par table

Chaque purge est une **pure function** : input = `DataSource` + config, output = résultat. Pas de cron embedded, pas de Slack notif, pas d'effet de bord caché.

Squelette :

```ts
export async function pruneSupportTickets(
  dataSource: DataSource,
  config: { days: number; batchLimit: number },
): Promise<{ deletedRows: number; iterations: number }> {
  let totalDeleted = 0;
  let iterations = 0;
  while (true) {
    const result = await dataSource.query(`
      DELETE FROM support_tickets
      WHERE id IN (
        SELECT id FROM support_tickets
        WHERE status IN ('closed', 'resolved')
          AND updatedAt < NOW() - INTERVAL '${config.days} days'
        LIMIT $1
      )
    `, [config.batchLimit]);
    totalDeleted += result.affectedRows;
    iterations++;
    if (result.affectedRows < config.batchLimit) break;  // dernière page
  }
  return { deletedRows: totalDeleted, iterations };
}
```

Lecture :
- **Chunked DELETE LIMIT 1000** par transaction. Évite le long-running transaction qui lock toute la table.
- **Loop tant qu'on supprime ≥ batchLimit** — quand on est en-dessous, c'est qu'on a tout fini.
- **Pure** : input config, output statistics. Pas de log, pas de Slack. Le wrapper s'en occupe.

### Le cron registrar

Une fonction thin qui wrap la pure function dans un BullMQ schedule (E1) :

```ts
registerScheduledJob({
  name: 'prune-support-tickets',
  cron: env.retention.cronPattern,  // default '15 3 * * *'
  handler: async () => {
    if (!env.retention.enabled) return;  // toggle off pour dev/test
    const result = await pruneSupportTickets(dataSource, {
      days: env.retention.supportTicketsDays,
      batchLimit: env.retention.batchLimit,
    });
    logger.info('retention_prune_support_tickets', result);
  },
});
```

Trois propriétés :
1. **Toggle `RETENTION_PRUNE_ENABLED`** — `false` en dev/test pour ne pas effacer tes fixtures.
2. **Logs structurés** — résultat trackable dans Sentry.
3. **Pas de retry automatique** — si ça plante, le cron suivant retentera demain (idempotent).

### `startRetentionCrons()` orchestration

Une seule fonction enregistre les 3 crons en chaîne au boot, derrière le toggle `RETENTION_PRUNE_ENABLED`. Si tu désactives, aucun cron n'est posé.

### Manual escape hatch

```bash
pnpm prune:retention
```

Wrapper du script `scripts/prune-retention.ts` qui appelle les 3 pure functions en série. Utile pour :
- Tester en local : "vérifions que la purge marche sur ma fixture".
- Forcer une purge un jour où le cron a planté.
- Audit GDPR : "sors-moi le total deleted des 30 derniers jours".

---

## Pourquoi pure functions + BullMQ wrapper ?

Pattern classique, **séparation des concerns** :

1. **Pure function = testable seule.** Tu lui donnes une `DataSource` mock-pg (ou un testcontainer Postgres réel), tu vérifies l'output. Pas de mock cron, pas de mock Slack.
2. **Wrapper = composition.** Le wrapper sait comment scheduler et logger. Si demain tu changes BullMQ pour autre chose, tu touches uniquement le wrapper.
3. **Manual script = dev experience.** Tu peux runner sans démarrer BullMQ.

C'est l'application directe du squelette hexagonal (cf. doc 07) : domain pur (la logique de purge) + adapter (BullMQ scheduler).

---

## Pourquoi c'est pertinent pour Musaium

### RGPD compliance

Article 5.1.e RGPD : "[les données personnelles doivent être] conservées sous une forme permettant l'identification des personnes concernées pendant une durée n'excédant pas celle nécessaire au regard des finalités pour lesquelles elles sont traitées".

Sans retention policy, **tu es en infraction par défaut** sur les vieilles données. Avec, tu as une preuve documentée (ADR-018/019/020) que tu as réfléchi aux durées et que tu les appliques.

### Performance

Une table de 100K reviews avec 60 % `rejected/pending` accumulées sur 5 ans = 60K rows mortes. Les indexes sont 60 % plus gros que nécessaire, les SCANs sont plus lents, les backups + restores plus longs.

Avec retention, la table reste lean. EXPLAIN ANALYZE plus rapide (cf. doc 15).

### Coût stockage + backups

Postgres VPS = ~5 €/GB/mois. Pas critique à petite échelle. À 1M users = différence visible.

---

## Trade-offs assumés

### Hard delete = irréversible

Si un user demande à un admin "rappelle-moi mon ticket d'il y a 18 mois", on ne peut pas. C'est intentional :
- C'est ce que l'utilisateur lui-même demande implicitement (s'il faisait un GDPR delete).
- Soft delete = données toujours présentes en base = pas vraiment supprimées au sens RGPD.

### Pas de "soft archive" intermédiaire

On aurait pu faire :
- 365j → archive dans une table `support_tickets_archive` (immutable).
- 7 ans → hard delete (obligation légale fiscale).

Décision Musaium : pas d'archive, hard delete direct. Réduit la surface réglementaire (pas de question sur "qui a accès aux archives").

### Cron 03:15 UTC = créneau partagé

`03:15 UTC` est juste avant les autres crons (`03:17` Stryker, `03:23` Playwright, `03:30` audit-chain). Si un jour tu as 4 crons qui sautent simultanément, prévoir de re-séquencer.

---

## Est-ce overkill ?

**Non, c'est obligatoire RGPD à partir du moment où tu collectes de la donnée user**. Si tu ne le faisais pas, c'est une amende potentielle en cas d'audit.

Coût d'implémentation : 3 pure functions (~150 LOC chacune) + 1 wrapper + 3 ADRs. ~3-4 jours de travail concentré.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Vérifier que `RETENTION_PRUNE_ENABLED=true` en prod | À vérifier dans `/srv/museum/.env` |
| Vérifier que les 3 crons sont registered au boot | Logs Sentry "retention_prune_*" doivent apparaître chaque jour ~03:15 UTC |
| Tester `pnpm prune:retention` en local | Avec fixtures, voir que le résultat affiche les rows deleted |
| Tuner les seuils si besoin | Env vars : `RETENTION_SUPPORT_TICKETS_DAYS`, etc. Pas obligatoire pour V1. |
| Vérifier que `DELETE /auth/me` purge bien les `support_tickets` du user | Test GDPR end-to-end |

---

## Question fréquente

**"Et si demain on a une obligation légale de garder 5 ans certains tickets ?"**

Tu modifies `RETENTION_SUPPORT_TICKETS_DAYS=1825`. Pas de migration, pas de redéploiement, juste une env var. Restart BullMQ et c'est pris en compte au prochain cron.

Si l'obligation est plus complexe (genre "tickets fiscaux 7 ans, autres 1 an"), tu rajoutes une colonne `category` et tu rends la pure function category-aware. Le coût marginal est faible parce que la structure est déjà là.
