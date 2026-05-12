# 03 — Audit-chain + Slack non configuré : trois options pour réparer

> **Pour qui ?** Toi, qui as remarqué qu'on a mis en place un cron quotidien qui pingue Slack pour signaler les casses de chaîne d'audit, **alors que tu n'as jamais branché Slack**.
> **Réponse courte :** tu as raison, dans la config actuelle le webhook Slack est vide → l'alerte est jetée silencieusement. Trois options, tu en choisis une.

---

## Le problème en une phrase

Le cron `audit-chain-nightly` vérifie chaque nuit que la table `audit_logs` n'a pas été tripotée. Si elle l'a été, le script POST une alerte sur le webhook `DEPLOY_ALERT_SLACK_WEBHOOK`. **Tu n'as jamais ajouté ce secret à GitHub Actions**, donc l'alerte se perd dans le vide. Le cron continue de tourner et de produire un log dans GitHub Actions, mais personne ne sera prévenu en cas de vraie casse.

C'est ton intuition, et elle est exacte. C'était une liberté prise par l'agent qui a wired la fonctionnalité — il a supposé que tu avais déjà un Slack ops, ce qui n'est pas le cas.

---

## D'abord : pourquoi on a une "chaîne d'audit" ?

### Analogie

Un livre de comptes manuscrit, où chaque ligne renvoie au numéro de page de la ligne précédente. Si quelqu'un arrache une page ou change un chiffre, la numérotation casse et c'est visible immédiatement. Tu ne peux pas modifier un montant sans réécrire toutes les pages suivantes.

C'est exactement le principe du `audit_logs` chez Musaium : chaque ligne contient un `prev_hash` qui doit être égal au `row_hash` de la ligne précédente. Le `row_hash` lui-même est calculé à partir du contenu de la ligne (id, actor, action, target, metadata, created_at) **plus** le `prev_hash`. Si quelqu'un édite une ligne en base directement (UPDATE SQL), le `row_hash` ne correspond plus. Cassage détectable.

### Pourquoi tu en as besoin

`audit_logs` enregistre les évènements sensibles : login, logout, MFA enrollment, role change, suppression de musée, blocage guardrail, accès admin. Si demain tu as une enquête (RGPD, plainte, autorité) et qu'on te demande "prouve qu'untel a bien fait telle action à telle heure", tu pointes la chaîne d'audit. Si la chaîne est cassée, **toute la table devient suspecte juridiquement**.

C'est pour ça qu'on appelle ça "tamper-evidence" : ça ne **prévient pas** la modification, ça la **rend visible**.

---

## Comment c'est implémenté chez Musaium

### Le verifier (pure function, pas de DB)

`museum-backend/src/shared/audit/audit-chain-verifier.ts:40-100`

```ts
export function verifyAuditChain(
  rowsInOrder: readonly AuditChainRow[],
): AuditChainVerificationResult {
  let prevHash = AUDIT_CHAIN_GENESIS_HASH;
  let i = -1;

  for (const row of rowsInOrder) {
    i++;

    if (row.prevHash !== prevHash) {
      return {
        rowsScanned: i + 1,
        intact: false,
        break: { rowId: row.id, rowIndex: i, expectedPrevHash: prevHash,
                 actualPrevHash: row.prevHash, ... },
      };
    }

    const recomputed = computeRowHash({...}, prevHash);

    if (recomputed !== row.rowHash) {
      return { rowsScanned: i + 1, intact: false, break: {...} };
    }

    prevHash = row.rowHash;
  }

  return { rowsScanned: rowsInOrder.length, intact: true, break: null };
}
```

Lecture : on parcourt les lignes dans l'ordre chronologique. Pour chacune, on vérifie 2 choses :
1. **Son `prevHash` correspond bien au `rowHash` de la ligne précédente.** Si non = quelqu'un a inséré ou supprimé une ligne entre les deux.
2. **Son `rowHash` recalculé à partir de son contenu actuel correspond bien à ce qui est stocké.** Si non = quelqu'un a édité un champ.

Au premier mismatch, on s'arrête et on renvoie l'id exact de la ligne fautive.

### Le CLI qui l'appelle

`museum-backend/scripts/audit-chain-verify.ts:102-120`

```ts
async function main(): Promise<void> {
  const fixturePath = process.env.AUDIT_CHAIN_VERIFY_FIXTURE;
  const rows = fixturePath ? loadFixtureRows(fixturePath) : await loadDbRows();

  const result = verifyChainAndFormat(rows);

  emitStdout(result.payload);

  if (result.exitCode === 1 && result.alertText) {
    await postSlackAlert(process.env.DEPLOY_ALERT_SLACK_WEBHOOK, result.alertText);
  }

  process.exit(result.exitCode);
}
```

Lecture des codes de sortie :
- `0` = chaîne intacte → workflow OK.
- `1` = chaîne cassée → `postSlackAlert` est appelé → workflow KO (rouge dans GitHub Actions).
- `2` = erreur inattendue (DB injoignable, etc.) → workflow KO.

Et `postSlackAlert` (lignes 45-63) :

```ts
async function postSlackAlert(webhookUrl: string | undefined, text: string): Promise<void> {
  if (!webhookUrl) return;     // ← SI VIDE, on retourne silencieusement

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      process.stderr.write(`[audit-chain-verify] slack POST failed: ...\n`);
    }
  } catch (err) {
    ...
  }
}
```

**C'est la ligne 46 le problème** : `if (!webhookUrl) return;`. Si le secret n'est pas set → on sort sans rien faire, sans même un warning loud-fail. La chaîne d'audit reste cassée, le workflow GitHub Actions affiche bien le rouge, mais aucune notif ne sort.

### Le workflow nightly

`.github/workflows/audit-chain-nightly.yml`

```yaml
on:
  schedule:
    - cron: '30 3 * * *'   # 3h30 UTC tous les jours
  workflow_dispatch:        # bouton "Run workflow" dispo dans l'UI

jobs:
  verify-prod:
    steps:
      - name: Verify audit_logs hash chain on VPS
        env:
          SLACK_WEBHOOK: ${{ secrets.DEPLOY_ALERT_SLACK_WEBHOOK }}
        with:
          ...
          script: |
            docker compose exec -T \
              -e DEPLOY_ALERT_SLACK_WEBHOOK="$SLACK_WEBHOOK" \
              backend node dist/scripts/audit-chain-verify.js

      - name: Notify Slack of unexpected workflow failure
        if: failure()
        run: |
          if [ -z "$SLACK_WEBHOOK" ]; then
            echo "::warning::DEPLOY_ALERT_SLACK_WEBHOOK secret missing — no Slack alert sent."
            exit 0
          fi
          curl -sS -X POST -H 'Content-Type: application/json' \
            --data "{\"text\":\":warning: audit-chain nightly job failed (run ${RUN_URL}). Investigate.\"}" \
            "$SLACK_WEBHOOK" || true
```

À noter : la **deuxième** étape (qui se déclenche `if: failure()`) **a un garde-fou** (`if [ -z "$SLACK_WEBHOOK" ]; then echo "::warning::...";`) qui produit un warning visible dans GitHub Actions UI. La **première** étape (le script Node lui-même) n'a pas ce garde-fou — elle retourne silencieusement.

---

## Donc concrètement, dans ton état actuel, qu'est-ce qui se passe ?

| Scénario | Résultat actuel | Résultat souhaité |
|----------|-----------------|-------------------|
| Chaîne intacte (cas normal) | Cron passe vert dans GitHub Actions, personne n'est notifié, c'est OK. | OK identique. |
| Chaîne cassée | Cron passe rouge, log GitHub Actions montre le break, **mais aucune alerte n'arrive nulle part**. Tu le découvres seulement si tu regardes l'onglet Actions. | Tu reçois une notif (Slack, email, autre) avec le rowId fautif. |
| Erreur inattendue (DB down) | Pareil : rouge dans Actions, garde-fou produit un warning, **mais aucune alerte sortante**. | Tu reçois une notif. |

L'agent qui a wired la feature a fait l'hypothèse "Tim a Slack". Faute d'avoir vérifié, l'effet net = **le cron est inutile en l'état parce que personne ne lit son output**.

---

## Tes 3 options pour fixer

### Option A — Brancher Slack (5 minutes, recommandé si tu prévois d'ajouter Slack à terme)

Si tu as un workspace Slack (perso, futur ops, peu importe) :

1. Slack → onglet "Apps" → "Manage" → "Incoming Webhooks".
2. "Add to Slack" → choisir le channel `#alerts-musaium` (ou créer-le).
3. Copier l'URL générée, format `https://hooks.slack.com/services/T.../B.../...`.
4. GitHub → ton repo → Settings → Secrets and variables → Actions → "New repository secret".
5. Name = `DEPLOY_ALERT_SLACK_WEBHOOK`, value = l'URL Slack.
6. Tester : Actions → `audit-chain-nightly` → "Run workflow" manuellement. Tu devrais voir un log "Slack POST OK" et **rien** dans Slack (parce que la chaîne est intacte). Le mock test du break, c'est différent (cf. plus bas).

**Coût ongoing :** 0 €. Slack gratuit jusqu'à 10 000 messages.

### Option B — Brancher email (2 minutes, si tu n'as pas Slack et n'en veux pas)

Modifier le script pour utiliser un envoi email au lieu d'un POST Slack. C'est très simple, on a déjà Brevo dans `museum-backend` (`BREVO_API_KEY` dans l'env).

Patch suggéré (à valider avant merge) :

```ts
// museum-backend/scripts/audit-chain-verify.ts
async function postAlert(text: string): Promise<void> {
  const webhookUrl = process.env.DEPLOY_ALERT_SLACK_WEBHOOK;
  const alertEmail = process.env.AUDIT_ALERT_EMAIL ?? 'm.rivet@expertgcl.fr';

  // Slack si configuré
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      process.stderr.write(`[audit-chain-verify] slack POST error: ${err}\n`);
    }
  }

  // Email fallback (toujours, même si Slack a marché)
  if (process.env.BREVO_API_KEY) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: 'noreply@musaium.app', name: 'Musaium Audit' },
        to: [{ email: alertEmail }],
        subject: '[Musaium] AUDIT CHAIN BREAK',
        textContent: text,
      }),
    });
  }
}
```

Puis ajouter dans GitHub secrets : `AUDIT_ALERT_EMAIL = m.rivet@expertgcl.fr` (ou direct dans le code en fallback comme ci-dessus).

**Coût ongoing :** 0 €, dans le quota Brevo gratuit.

### Option C — Désactiver le cron (10 secondes, si tu veux mettre ça de côté pour V1)

Si tu décides "je m'occuperai de l'alerting plus tard, en attendant je ne veux pas avoir un cron rouge fantôme dans Actions" :

```bash
# Renommer le workflow pour le désactiver (GitHub n'exécute pas .yml.disabled)
git mv .github/workflows/audit-chain-nightly.yml .github/workflows/audit-chain-nightly.yml.disabled
git commit -m "chore(ci): disable audit-chain nightly until alert channel is wired"
```

**Inconvénient :** plus aucune vérif automatique de la chaîne d'audit. Tu es aveugle si quelqu'un tripote la table. Pour V1 launch ça reste acceptable (la table est encore vide).

**Recommandation :** ré-activer dans le mois post-launch quand tu auras choisi entre A et B.

---

## Ma recommandation honnête

**Option B (email)** pour ton cas, parce que :

1. Tu n'as pas de Slack, ne veux pas en monter un juste pour ça.
2. Brevo est déjà dans l'app, tu paies déjà rien pour l'usage actuel.
3. Un audit-chain break est rare (typiquement jamais) — tu veux une alerte qui reste visible, l'email convient.
4. Si tu mets Slack plus tard, le code Option B garde Slack ET ajoute l'email — pas de retour en arrière.

Si tu valides, je peux faire le patch (~10 minutes).

---

## Question annexe : pourquoi 03h30 UTC ?

Le cron est calé à `30 3 * * *` (3h30 UTC = 4h30 ou 5h30 heure de Paris selon DST). Pourquoi ?

- **03:17 UTC** = mutation testing nightly (Stryker).
- **03:23 UTC** = Playwright nightly.
- **03:30 UTC** = audit-chain.

C'est sérialisé pour éviter que 3 jobs lourds tournent en parallèle sur le même VPS. Tu peux changer si tu veux, l'ordre n'a pas d'importance fonctionnelle.

---

## Pourquoi c'est pertinent pour Musaium

Cas d'usage concret : un dev mécontent a accès à la base prod (cas typique : ancien admin qui n'a pas encore été révoqué). Il édite une ligne `audit_logs` pour effacer la trace de son login admin précédent. Sans le verifier, on ne le saura jamais. Avec le verifier qui tourne nightly et qui alerte, on le sait dans les 24 heures.

Autre cas : restoration de backup partielle. Tu restaures les 6 derniers mois mais pas avant. Le verifier détecte la "discontinuity" entre la dernière ligne pré-restauration et la première post-restauration. Pas un attaque, juste un bug ops, mais c'est important de savoir.

---

## Est-ce overkill ?

Non, **mais l'implémentation est inutile sans canal d'alerte branché**. C'est le point que tu as soulevé et il est juste. Trois options ci-dessus, tu choisis et on patch.

---

## Récap : ce que tu dois faire

1. **Choisir une option** entre A (Slack), B (email Brevo), C (désactiver).
2. **Si A** : créer le webhook Slack, ajouter le secret GitHub, tester via "Run workflow" manuel.
3. **Si B** : me dire "go option B", je patche `audit-chain-verify.ts` pour ajouter l'email Brevo, on commit et on test.
4. **Si C** : `git mv` du workflow et noter dans le ROADMAP_TEAM "ré-activer audit-chain alerting post-launch".
5. **Indépendamment** : ouvrir une fois Actions UI, lancer manuellement le cron, vérifier qu'il passe vert sur la base de prod. Tu confirmes que l'infra de base marche.
