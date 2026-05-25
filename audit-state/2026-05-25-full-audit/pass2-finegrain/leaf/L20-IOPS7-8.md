# L20 — I-OPS7 / I-OPS8 (stabilité) — fresh-context re-dérivation

Branche `dev` @ HEAD `1fb32f5ba`. READ-ONLY. Aucun audit/marqueur antérieur cru — chaque claim re-confirmé par le code (path:line). Roadmap source: `docs/ROADMAP_PRODUCT.md:249-250`.

Légende verdict: **CONFIRMÉ** = le problème existe tel que décrit ; **PARTIEL** = nuance ; **INFIRMÉ** = faux ; **NON-VÉRIFIABLE** = hors du repo.

---

## I-OPS7 — Indices manquants

### (a) chat-purge cron seq-scan (`purgedAt`/`updatedAt` non-indexés) — **CONFIRMÉ**

Requête de sélection des candidats (`museum-backend/src/modules/chat/jobs/chat-purge.job.ts:173-179`):
```
.where('session.purgedAt IS NULL')
.andWhere(`session.updatedAt < NOW() - INTERVAL '...'`)
```
→ filtre sur `chat_sessions.purged_at` + `chat_sessions.updatedAt`.

Indices RÉELS existant sur `chat_sessions` (re-dérivé en lisant TOUTES les migrations):
- PK `id` (uuid) — `1771427010387-InitDatabase.ts:21`
- `IDX_chat_sessions_userId` sur `("userId")` single-col — `1777568348067-AddCriticalChatIndexesP0.ts:36-39` + entity `chatSession.entity.ts:24`
- `IDX_chat_sessions_museum_id` sur `("museum_id")` — `1774300000000-CreateMuseumsAndTenantFKs.ts:42`

`purged_at` ajouté SANS index (`1777022752054-AddChatSessionPurgedAt.ts:26-29`, simple `ADD COLUMN`). `updatedAt` jamais indexé (auto `UpdateDateColumn`). Grep exhaustif migrations : aucun index ne couvre `purged_at` ni `updatedAt`.

**Verdict** : la requête purge fait un Seq Scan sur `chat_sessions`. Sur prod V1 la table est petite (B2C pre-launch, faible volume) ; le cron tourne 1×/jour avec `LIMIT 100`. Impact réel ≈ nul à court terme. **P1/scale** (pas blocker V1). Un index partiel idéal serait `(updatedAt) WHERE purged_at IS NULL`.

### (b) `api_keys.user_id` CASCADE FK non-indexé — **CONFIRMÉ**

`1773955771280-CreateApiKeysTable.ts`:
- ligne 12 : colonne `"user_id" integer NOT NULL`
- ligne 15 : `FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`
- Aucun `CREATE INDEX` sur `user_id` dans cette migration ni nulle part ailleurs.

Entity `apiKey.entity.ts:34-39` : `@ManyToOne(() => User, { onDelete: 'CASCADE' })` sur `user_id`, **PAS de `@Index`**. Contraste : `api_keys.museum_id` EST indexé (`IDX_api_keys_museum_id`, `1774300000000-CreateMuseumsAndTenantFKs.ts:49`) — l'oubli `user_id` est donc une vraie asymétrie, pas un choix.

Conséquences:
1. CASCADE delete d'un user → Postgres scanne `api_keys` (les FK indexés évitent ça ; non-indexé = Seq Scan par row de parent supprimé). Pertinent pour le path GDPR suppression de compte.
2. `findByUserId` (`apiKey.repository.pg.ts:19-21`, `where: { userId }`) appelé par `listApiKeys.useCase.ts:18` → Seq Scan.

**Verdict** : index manquant réel et confirmé. Table `api_keys` quasi-vide en V1 B2C (les API keys sont une feature B2B/admin, audience B2B = hypothèse future per CLAUDE.md). Impact V1 ≈ nul. **P1/scale**, mais c'est le candidat le plus net (asymétrie évidente avec `museum_id`).

### (c) `listSessions` sans composite `(userId, updatedAt DESC)` — **CONFIRMÉ**

`chat.repository.typeorm.ts:273-301` (le path:line roadmap `:265` est approximatif, le bon est 273+):
```
.where('session."userId" = :userId', { userId })
.orderBy('session.updatedAt', 'DESC')
... cursor: (updatedAt < :c OR (updatedAt = :c AND id < :id))
```
Pagination keyset sur `(updatedAt DESC, id)` filtré par `userId`. Le seul index utile est `IDX_chat_sessions_userId` (single-col `userId`) : Postgres peut l'utiliser pour le filtre `userId` mais doit ensuite **trier** les lignes matchées par `updatedAt` (pas de tri couvert par l'index). Un composite `(userId, updatedAt DESC)` rendrait le ORDER BY + keyset index-only sur l'ordering.

Appelé par `chat-session.route.ts:126` → `chat.service.ts:188` → `chat-session.service.ts:217` → repo. C'est le « carnet de visites » de l'utilisateur (écran user-facing, hot path lecture).

**Verdict** : composite réellement absent. Pour un user donné le nombre de sessions est petit (un humain n'a pas 10k sessions) → le tri post-filtre est trivial. **P1/scale**, pas blocker V1. Le plus « théorique » des trois.

### I-OPS7 — Synthèse
Les 3 indices décrits sont **réellement manquants** (vérifié migrations + entities, pas supposé). AUCUN n'est blocker V1 : volumes pre-launch B2C minuscules (chat_sessions petit, api_keys quasi-vide, sessions/user bas). C'est de la dette **P1/scale** correctement cotée par la roadmap. Le plus défendable comme « vrai » oubli = (b) `api_keys.user_id` (asymétrie flagrante avec `museum_id`).

---

## I-OPS8 — CI gates partiellement théâtre

### (a) `ai-tests` `if: workflow_dispatch` (jamais PR) — **CONFIRMÉ**

`.github/workflows/ci-cd-backend.yml:447-449`:
```
ai-tests:
  needs: [quality, coverage-merge]
  if: github.event_name == 'workflow_dispatch'
```
Le job n'a AUCUN trigger PR/push/schedule — uniquement dispatch manuel. Il appelle `pnpm run test:ai` avec `OPENAI_API_KEY` réel (coût tokens). Donc s'il est annoncé comme « required » ou « gate qualité », c'est du théâtre : il ne tourne jamais automatiquement. **CONFIRMÉ.** Note : c'est un choix défendable (coût LLM) — le théâtre est dans la *présentation*, pas dans l'existence du gate manuel.

### (b) web/mobile `paths-filter` « pending forever » — **CONFIRMÉ (avec mécanisme précis)**

Distinction importante re-dérivée :
- **Backend** (`ci-cd-backend.yml:35-50`) utilise le pattern SÛR : trigger sans `paths:`, job `changes` (dorny/paths-filter) + downstream conditionnel. Job skippé = **success** → required check satisfait. ✅ Pas de risque pending.
- **Web** (`ci-cd-web.yml:4-11`) et **Mobile** (`ci-cd-mobile.yml:32-43`) utilisent des **`paths:` au niveau workflow** (`pull_request: paths: [museum-web/** ...]`). Si une PR ne touche aucun de ces paths, le **workflow entier ne démarre jamais** → si un de ses jobs (ex `quality`) est en required-checks branch-protection, GitHub le laisse en **« Expected — Waiting/Pending » indéfiniment** → la PR ne peut pas merger (le trou classique « skipped-by-paths required check stays pending »).

Aucun `merge_group:` trigger nulle part (grep sur les 3 workflows = 0) → pas de mitigation. **CONFIRMÉ** : le risque pending est réel POUR web/mobile si leurs jobs sont en required-checks. Le verdict final dépend de la branch-protection (cf. (d), non-vérifiable par fichier). Si web/mobile NE sont PAS required, alors pas de pending mais le claim « théâtre » tombe aussi (rien à bloquer).

### (c) Expo Doctor `continue-on-error` — **CONFIRMÉ**

`ci-cd-mobile.yml:85-87`:
```
- name: Expo Doctor
  run: npx expo-doctor
  continue-on-error: true
```
Le step ne peut JAMAIS faire échouer le job `quality`. C'est un gate purement informatif. **CONFIRMÉ théâtre.** (Note : les autres `continue-on-error` du repo — SBOM mobile L110, SBOM web L400, cosign attest L409 — sont des artefacts/attestations explicitement advisory, légitimes, PAS du théâtre de gate.)

### (d) Pas de CI gate anti-drift migration — **CONFIRMÉ**

Re-dérivé : le seul check migration dans le quality-gate backend est `ci-cd-backend.yml:119-120` « Migrations are reversible (down() present) » → `scripts/check-migration-down.cjs` (vérifie présence d'un `down()` non-vide, par regex source — PAS un check de drift schéma).

`migration:run` apparaît uniquement dans des jobs deploy/e2e/promptfoo (`ci-cd-backend.yml:973,1555`, web `139/247`, promptfoo `92`, smoke `101`) → ils APPLIQUENT les migrations, ils ne détectent PAS la dérive entités↔migrations. AUCUN job ne fait le pattern `migration:run` puis `migration-cli generate --name=Check` + assert-output-vide (le garde-fou décrit dans CLAUDE.md § Migration Governance). **CONFIRMÉ** : pas de CI gate anti-drift. C'est une discipline doc-only (CLAUDE.md), non enforcée par CI → un dev qui modifie une entity sans générer la migration ne sera pas catché en CI (sera catché au prochain `migration:run` deploy si la table casse, mais drift silencieux sinon).

### (d-bis) `sentinel-mirror` dans required-checks — **NON-VÉRIFIABLE par fichier**

`.github/workflows/sentinel-mirror.yml` existe (re-run server-side des gates anti-bypass hook). Mais savoir s'il est dans la liste *required-checks* de la branch-protection `main`/`dev` = config GitHub côté serveur, PAS dans le repo. Confirmable seulement via `gh api repos/:owner/:repo/branches/main/protection` ou Settings UI. **NON-VÉRIFIABLE par audit fichier** (conforme à la note roadmap 2026-05-25 D4). Idem pour (b) : savoir si web/mobile quality sont required nécessite la même API.

### I-OPS8 — Synthèse
- (a) `ai-tests` workflow_dispatch-only : **CONFIRMÉ théâtre** (si présenté comme gate auto).
- (b) web/mobile `paths:` workflow-level → pending-forever : **CONFIRMÉ comme risque réel** (mécanisme exact identifié), verdict net dépend de branch-protection (non-vérifiable fichier).
- (c) Expo Doctor `continue-on-error` : **CONFIRMÉ théâtre** (gate purement informatif).
- (d) anti-drift migration : **CONFIRMÉ absent** de la CI (seul `check-migration-down.cjs` ≠ drift).
- (d-bis) sentinel-mirror required : **NON-VÉRIFIABLE par fichier** (besoin `gh api branch protection`).

Blocker V1 : aucun de ces points n'est un blocker fonctionnel V1, mais (b) pending-forever PEUT bloquer le merge des PR (blocker process, pas produit) SI web/mobile sont required ; (d) absence d'anti-drift est un risque de régression DB silencieuse à corriger avant scale. Le reste = honnêteté/présentation (gates annoncés ≠ gates effectifs).
