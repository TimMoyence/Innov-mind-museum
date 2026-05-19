# HANDOFF — W3 Géo + Walk intra-musée (pilote Bordeaux)

> **Author:** Claude Opus 4.7 (1M context) · **Date:** 2026-05-18 (mis à jour 11:00 CEST)
> **Run ID:** `2026-05-17-w3-geo-walk-intra` + `2026-05-18-audit-dev-backend-bullmq-noise`
> **Commits:** `064c632f` (W3 livraison) · `35c43988` (handoff + TD-41/42/43) · `b7f12183` (infra hardening TD-44 + PGDATABASE no-fallback + 2 sentinels) sur `feat/audit-360-w3-geo-walk-intra`
> **Deadline merge :** mercredi **2026-05-20 EOD**
> **Pilote :** weekend **2026-05-23 / 2026-05-24** à Bordeaux

Ce document est le point d'entrée unique pour reprendre W3.

## 🟢 Flow recommandé pour fresh agent (mis à jour 2026-05-18)

> Donne ce flow tel quel au prochain agent (humain ou fresh Claude session) :
>
> 1. **Ouvre `docs/HANDOFF_W3_GEO_PILOT.md`** (ce fichier). Lis intégralement (~10 min).
> 2. **Phase A — Validation locale : ✅ DONE 2026-05-18** (cf. §5 — n'a PAS besoin d'être refaite ; le commit `b7f12183` documente les fixes appliqués au passage).
> 3. **Phase B — Merge W4 : 🟡 À FAIRE.** Avant : lis le **RECAP W4** que l'utilisateur va te fournir (pas committé dans ce repo). Puis applique §5 Phase B.
> 4. **Phase C — QR génération : 🟡 À FAIRE.** Bloquant pour le pilote samedi 23.
> 5. **Phase D — On-device test : 🟡 À FAIRE.** Avant samedi 23.
> 6. **Phase E — Push + PR : 🟡 À FAIRE** (W3 + W4 mergé dans un seul PR).
>
> Si le user dit `/team` sur l'une de ces phases : utilise le pipeline `micro` ou `standard` selon le scope. Ne refais PAS Phase A.

---

## 1. Statut final

| Axe | Résultat |
|---|---|
| **Verdict reviewer** | **APPROVED** — score 90.2/100 (5 axes : spec 92 · KISS 85 · sécurité 92 · tests 92 · honnêteté 90) |
| **Findings reviewer** | 0 blocker · 2 important (les deux fixés post-review) · 4 minor (TECH_DEBT) · 2 nice-to-have |
| **Findings sécurité** | 0 high · 1 MED (fixé) · 1 LOW (TECH_DEBT, mitigations en place) |
| **Tests BE** | 442/442 suites, 5699/0 fail, coverage 89.27 % statements |
| **Tests FE** | 271/272 suites (2 fails *pré-existants* onboarding, non W3) |
| **Lint / typecheck / OpenAPI / contract** | Tous PASS |
| **Pre-commit gates (7/7)** | Tous PASS (Gate 7 = compose-parity ajouté 2026-05-18) |
| **Roadmap** | W1.4 / W1.5 / W1.6 cochés (W1.6 partiel, footnote SigLIP-2 différé) |
| **Phase A (validation locale)** | ✅ **DONE 2026-05-18** — cf. §5 + bonus infra hardening (TD-44) commit `b7f12183` |
| **dev-stack** | dev-redis `--requirepass` activé · noise BullMQ/ioredis = 0 · 2 sentinels compose-parity + env-drift wired pre-commit + CI |
| **PGDATABASE** | `required()` sans fallback (UFR-013 fail-loud, miroir JWT) · setupFile pin pour unit-integration + e2e tests |
| **verify-postgis-migration.sh** | 4 bugs corrigés · exit 0 end-to-end · ARM64 support via `POSTGIS_VERIFY_PLATFORM=linux/amd64` |

**Rien n'est différé côté code W3.** Les seuls follow-ups sont (a) coordination W4 pour les slugs musées, (b) tests on-device, (c) `pnpm bootstrap` après pull.

---

## 2. Ce qui a été livré (commit `064c632f`)

### BE Geo Foundation (Cluster A)
- `GET /api/museums/detect-museum?lat=X&lng=Y` → `{museumId, confidence, distance, name}`. Auth + rate-limit 30/min `byUserId`. Mounted **avant** `/:idOrSlug` pour éviter le clash.
- `DetectMuseumUseCase` : geofence-hit short-circuit → fallback Haversine via `findNearbyMuseums`. Confidence = `1.0` si geofence, sinon `max(0, 1 - distance/500)` arrondi 2 décimales.
- **`NearbyMuseum` enrichi avec `id`** → `DetectMuseumUseCase` n'appelle plus `findAll` deux fois (fix IMP-1 reviewer).
- `MuseumRepositoryPg.findByCoords` : bootstrap-cached mode pick (PostGIS `ST_Contains` ou JSONB bbox in-app filter).

### BE Migrations (4 nouvelles)
| Timestamp | Migration | Effet |
|---|---|---|
| `1779051738966` | `AddMuseumGeofence` | Hybrid PostGIS-or-JSONB. `CREATE EXTENSION postgis` probé via `SAVEPOINT` (conditionnel sur `queryRunner.isTransactionActive`). Succès → `geometry(Polygon,4326)` + GIST index. Échec → `geofence_bbox jsonb` fallback. |
| `1779051850000` | `SeedPilotMuseumGeofences` | Backfill polygons pour les 3 musées bordelais (cf. §4). Skip avec `console.warn` si slug absent (idempotent). |
| `1779051900000` | `AddChatSessionCurrentRoomAndArtwork` | `current_room uuid NULL` + `current_artwork_id uuid NULL` sur `chat_sessions`. |
| `1779051950000` | `AddArtworkKnowledgeRoomId` | `room_id uuid NULL` sur `artwork_knowledge` (préparation SigLIP W1.6b différé). |

### BE Intra-musée (Cluster D — Phase 1)
- `PATCH /api/chat/sessions/:id/context` → propage `currentArtworkId` + `currentRoom` au prompt builder. Auth + rate-limit 60/min + Zod UUID v4 validation server-side (défense en profondeur).
- LLM prompt builder injecte `[CURRENT ARTWORK]` section **avant** `[END OF SYSTEM INSTRUCTIONS]` quand `currentArtworkId` set. Titre passe par `sanitizePromptInput()`.

### BE Observability
- 3 spans Langfuse : `geo.detect_museum`, `geo.nominatim.reverse`, `geo.detect_museum.error`
- 3 metrics Prom : `geo_detect_museum_total{outcome}`, `nominatim_requests_total{outcome}`, `nominatim_request_duration_seconds` (histogram)
- Coords loguées **arrondies 3-dec** (~110 m, conformité GDPR/LLM06)

### BE Scripts
- `scripts/generate-qr-cartels.cjs` : génère un PDF A4 (4×3 grille = 12 QR/page) à partir d'un CSV `{artworkId,title,roomId}`. Deps `qrcode` + `pdfkit` ajoutées en `devDependencies`.
- `scripts/verify-postgis-migration.sh` : one-shot `postgis/postgis:16-3.5`, applique les 4 W3 migrations, asserte la branche PostGIS (geometry column + GIST index), revert chain, teardown. Exit 0 = branche prod validée end-to-end (réponse à IMP-2 reviewer).
- `fixtures/pilot-artworks.csv` : placeholder pour le générateur QR (à remplacer par les UUIDs réels).

### FE Geo Consume (Cluster B)
- `museumApi.detectMuseum({lat, lng})` ajouté
- `useDetectMuseum(lat, lng)` hook avec de-dup par tile rounded 3-dec
- `useStartConversation` auto-detect (opt-in via flag `autoDetectMuseum`) → `confidence > 0.8` set museumId/museumMode auto ; sinon fallback `MuseumPicker`

### FE Walk UX (Cluster C)
- `useProactiveMuseumSuggestion` **refactorée** : `searchMuseums + filtre <200m` → `detectMuseum`. **Dead code burié** (UFR-016) : `SearchMuseumEntryLike`, `EligibleSearchMuseumEntry`, `isEligibleEntry`, `bucketDistance`, `PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M`, `SEARCH_RADIUS_M`.
- `ProactiveMuseumBanner` : variant confirm-sheet quand `confidence ∈ (0.5, 0.8]`, banner auto-pickup quand `> 0.8`.
- `MuseumPickerScreen` : recherche debounced + favoris horizontaux + FlatList nearby triée par distance. A11y labels sur chaque Pressable.
- `app/(stack)/museums-picker.tsx` : route Expo Router en modal stack.
- `features/museum/infrastructure/favourites.ts` : AsyncStorage CRUD tolerant aux écritures qui échouent.

### FE Intra-musée (Cluster D)
- `parseMusaiumDeeplink(raw): { museumId, artworkId, roomId } | null` : regex UUID v4 strict, fallback alphanum existant intact.
- `CartelScannerSheetContent` : dispatch deeplink → alphanum. `onScanned` signature étendue `string | DeeplinkResult`.
- `chatApi/metadata.setSessionContext` côté FE.
- Maestro flow `chat-cartel-deeplink.yaml` dans shard `chat` (registered dans `.maestro/shards.json`).

### i18n
9 clés ajoutées en FR + EN (parité 886 clés chacun) : `chat.proactive.confirm_sheet.{title,body,yes,choose_another}`, `museumPicker.{search_placeholder,favorites_section,nearby_section,empty_state}`, `chat.cartelScanner.detected_artwork.title`.

### Artefacts du run
- `.claude/skills/team/team-state/2026-05-17-w3-geo-walk-intra/{spec,design,tasks,STORY}.md`
- `.claude/skills/team/team-reports/2026-05-17-w3-geo-walk-intra/code-review.json`
- `.claude/skills/team/team-knowledge/lessons/2026-05-17-w3-geo-walk-intra.md`
- Cost-history + quality-scores appended

---

## 3. Findings reviewer & sécurité — statut

| ID | Type | Description | Statut |
|---|---|---|---|
| **IMP-1** | reviewer | `DetectMuseumUseCase` double `findAll` (haversine path) | ✅ **Fixé** dans commit (NearbyMuseum porte `id`) |
| **IMP-2** | reviewer | Branche PostGIS non testée live | ✅ **Adressé** via `scripts/verify-postgis-migration.sh` |
| **MED-1** | sécurité | PATCH /context manquait rate-limiter | ✅ **Fixé** corrective loop (60/min byUserId) |
| **LOW-1** | sécurité | `sanitizePromptInput` ne strip pas `[`/`]` → 2nd-order injection via DB | ⚠️ **TECH_DEBT** — touche un util shared hors-scope W3 ; mitigations en place (titre issu d'enrichment trusted + counter-marker `[END OF CURRENT ARTWORK]` + cap 200 chars + reminder LLM). À ouvrir dans `docs/TECH_DEBT.md`. |
| MIN-1 | reviewer | Cache `cachedGeofenceMode` jamais invalidé (service-lifetime) | TECH_DEBT — V1 OK (migration pre-boot) |
| MIN-2 | reviewer | Seed bordelais skip si slugs absents | **Action W4** (cf. §5) |
| MIN-3 | reviewer | STORY.md éditeur #3 reconstruit retrospectivement | TECH_DEBT — ajouter dispatcher post-hook |
| MIN-4 | reviewer | GitNexus index stale | **Action manuelle** — `npx gitnexus analyze --force` |
| NTH-1 | reviewer | Étendre `sanitizePromptInput` (= LOW-1) | TECH_DEBT |
| NTH-2 | reviewer | Span `geo.detect_museum.error` distinct du `miss` | TECH_DEBT obsé sprint |

---

## 4. Données pilote Bordeaux

Seed migration `SeedPilotMuseumGeofences` (slugs DOIVENT exister en DB — sinon skipped) :

| Slug | Musée | Centroid (lat, lng) | Polygon (~±110 m) |
|---|---|---|---|
| `musee-d-aquitaine` | Musée d'Aquitaine | 44.8346, -0.5745 | NW (44.8356, -0.5759) · NE (44.8356, -0.5731) · SE (44.8336, -0.5731) · SW (44.8336, -0.5759) |
| `capc-musee-d-art-contemporain` | CAPC Musée d'art contemporain | 44.8497, -0.5714 | NW (44.8507, -0.5728) · NE (44.8507, -0.5700) · SE (44.8487, -0.5700) · SW (44.8487, -0.5728) |
| `la-cite-du-vin` | La Cité du Vin | 44.8625, -0.5502 | NW (44.8635, -0.5516) · NE (44.8635, -0.5488) · SE (44.8615, -0.5488) · SW (44.8615, -0.5516) |

Coords sourcées de `museum-backend/scripts/seed-museums.ts`. Polygons à raffiner on-site post-pilote avec input curateur.

---

## 5. Plan d'action restant

### Phase A — Validation locale ✅ **DONE 2026-05-18**

**Résumé d'exécution (commit `b7f12183`)** :

| Étape | Résultat |
|---|---|
| A.1 Bootstrap | Skipped — @musaium/shared symlinks frais (17-18 mai), workspace-links sentinel PASS |
| A.2 Stack Docker | Déjà up depuis 23h + force-recreate post-fix (dev-postgres :5433, dev-redis :6379 healthy avec `--requirepass`, dev-backend :3000, dev-adminer :8082) |
| A.3 Migration round-trip | `pnpm migration:run` no-op, `generate Check` montre drift pré-existant (HNSW pgvector / halfvec / partial index / FK auto-naming) **AUCUN W3** |
| A.4 Revert chain ×4 | 4/4 `down()` fonctionnent. Re-run propre. `la-cite-du-vin` skip = idempotent attendu (W4 seedera ce slug) |
| A.5 verify-postgis-migration.sh | **Exit 0** end-to-end après 4 fixes script (PLATFORM env, PGDATABASE export, pgvector apt install runtime, IDX_..._gist). Mac ARM64 supporté via `POSTGIS_VERIFY_PLATFORM=linux/amd64` |
| A.6 BE tests | **442/442 suites · 5699/0 fail · cov 89.27% stmt** · 257s · match exact handoff §1 |
| A.6 lint + openapi + contract | Tous PASS |
| A.7 FE tests | 271/272 suites · 2899 pass · 2 fails attendus pré-existants `onboarding.test.tsx` (non-W3) |
| A.7 FE lint | PASS |
| A.8 Smoke | `/api/health` → 200 (DB up, 81 ms) · `/api/museums/detect-museum` → 401 sans auth (route mountée + middleware fire) · ordre vérifié source (museum.route.ts:212 avant :233) |

**Bonus infra appliqués au passage (TD-44) :**
- `museum-backend/docker-compose.dev.yml § redis` aligné sur prod (`--requirepass ${REDIS_PASSWORD:-dev-redis-password}` + healthcheck avec AUTH)
- `museum-backend/docker-compose.dev.yml § backend` `environment:` block injecte `REDIS_HOST/PORT/PASSWORD/URL` (override env_file stale)
- Force-recreate validé : 0 erreur `Stream isn't writeable`, 0 warn `password was supplied` sur 60s
- Sentinels `scripts/sentinels/compose-parity.mjs` + `scripts/sentinels/dev-container-env-drift.sh` wired pre-commit Gate 7 + sentinel-mirror P15 + morning-check.sh
- TD-44 fermé dans `docs/TECH_DEBT.md` (audit `2026-05-18-audit-dev-backend-bullmq-noise` → diagnostic.md 482 lignes, gitignored)
- `museum-frontend/RUN_LOCAL.md § Redis auth en local` documente convention dev-redis-password

**PGDATABASE no-fallback (parallèle):**
- `src/config/env.ts:72` : `required('PGDATABASE', ...)` au lieu de `|| 'museumAI'`
- `tests/helpers/jest-env-pgdatabase.setup.ts` + jest.config.ts unit-integration setupFile pin
- e2e/jest-env.setup.ts pin PGDATABASE placeholder
- env.test.ts helper default + nouveau test no-fallback assertion

#### Si tu veux re-valider Phase A from scratch (utile en cas de doute) :

```bash
# A.1 — Re-index GitNexus + workspace sanity
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind-W3
npx gitnexus analyze --force
pnpm bootstrap                                    # rematérialise @musaium/shared dans les 3 apps

# A.2 — Stack local
docker compose -f docker-compose.dev.yml up -d    # Postgres 5433 + Adminer 8082

# A.3 — Migration BE round-trip
cd museum-backend
pnpm install                                      # qrcode + pdfkit ajoutés
pnpm migration:run                                 # applique les 4 W3 migrations
node scripts/migration-cli.cjs generate --name=Check  # → output VIDE attendu (verify-clean)

# A.4 — Revert chain
pnpm migration:revert                              # ×4 pour annuler les 4 W3 migrations
node scripts/migration-cli.cjs generate --name=Check  # → output toujours vide
pnpm migration:run                                 # ré-applique pour la suite

# A.5 — PostGIS prod-mode (IMP-2)
# Sur Mac ARM64, override platform :
POSTGIS_VERIFY_PLATFORM=linux/amd64 bash scripts/verify-postgis-migration.sh
# Sur Linux/x86_64 (serveur/CI) :
bash scripts/verify-postgis-migration.sh
# → exit 0 attendu, postgis container teardown auto

# A.6 — Suite de tests
pnpm lint                                          # PASS attendu
pnpm test                                          # 5699/0 attendu (442/442 suites)
pnpm openapi:validate                              # PASS
pnpm test:contract:openapi                         # PASS

# A.7 — FE
cd ../museum-frontend
npm run lint                                       # PASS
npm test                                           # 2 fails onboarding PRE-EXISTANTS (non W3)
# Si tu veux check:openapi-types : tag de BE doit être lancé en parallèle (cf. package.json script)

# A.8 — Smoke route detect-museum (BE en dev)
cd ../museum-backend
pnpm dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
# → 200

# (Si tu as un token JWT dev en main, via test.http)
# GET /api/museums/detect-museum?lat=44.8346&lng=-0.5745
# → 200 confidence=0..1, museumId si seed bordelais en DB
```

**Critère GO Phase A :** tous les exit 0, pas de régression dans `pnpm test` BE, FE = 2 fails onboarding identiques au start commit.

### Phase B — Merge W4 🟡 **À FAIRE** (lis le RECAP W4 d'abord)

> **Prérequis** : lire le **RECAP W4** que l'utilisateur va te fournir (pas dans ce repo — il va te le coller ou pointer vers la branche W4). Comprends son scope avant de merger pour anticiper les conflits.

```bash
# B.1 — Récupérer le merge target
git fetch origin
git merge origin/<branche-W4>                      # ou rebase, selon ta préférence

# B.2 — Résoudre conflits attendus
# Probables zones de conflit :
# - museum-backend/scripts/seed-museums.ts  (si W4 a touché les slugs bordelais)
# - museum-frontend/features/chat/application/useChatSession.ts  (si W4 touche aussi)
# - lockfiles
# Stratégie : favoriser le code W3 sur le useCase detect-museum ; favoriser le code W4 sur les seeds.

# B.3 — Re-bootstrap après merge
pnpm bootstrap

# B.4 — Re-run tests post-merge
cd museum-backend && pnpm lint && pnpm test
cd ../museum-frontend && npm run lint && npm test

# B.5 — Re-seed pour pilote bordelais
cd ../museum-backend
pnpm migration:revert  # annule SeedPilotMuseumGeofences
pnpm migration:run     # re-applique → cette fois les slugs bordelais EXISTENT (seedés par W4)
# Vérifier en DB :
docker exec -it <postgres-container> psql -U <user> -d museumAI \
  -c "SELECT slug, geofence_bbox IS NOT NULL OR geofence IS NOT NULL AS has_geo FROM museums WHERE slug IN ('musee-d-aquitaine','capc-musee-d-art-contemporain','la-cite-du-vin');"
# → 3 rows, has_geo=t
```

**Critère GO Phase B :** seed bordelais effectivement appliqué (3 rows `has_geo=t`), tests post-merge verts.

### Phase C — QR génération (avant samedi 23 — bloquant pilote)

```bash
cd museum-backend

# C.1 — Récupère les UUIDs des œuvres pilote (en DB après W4 seed + enrichment)
# Exemple :
docker exec -i <postgres-container> psql -U <user> -d museumAI -t -A -F, -c "
  SELECT ak.id, ak.title, COALESCE(ak.room_id::text, '')
  FROM artwork_knowledge ak
  JOIN museums m ON m.id = ak.museum_id
  WHERE m.slug IN ('musee-d-aquitaine','capc-musee-d-art-contemporain','la-cite-du-vin')
  LIMIT 30
" > fixtures/pilot-artworks-bordeaux.csv

# C.2 — Générer le PDF (1 par musée, ou 1 global)
node scripts/generate-qr-cartels.cjs \
  --museum-id=<uuid-musee-aquitaine> \
  --input=fixtures/pilot-artworks-bordeaux.csv \
  --out=cartels-pilote-bordeaux.pdf

# C.3 — Impression + plastification + pose
# → action manuelle / partenaire pilote
```

### Phase D — On-device test (avant samedi)

1. Build dev client iOS / Android via EAS (`eas build --profile preview --platform ios`) OU lancer Metro local (`cd museum-frontend && npm run dev`)
2. Authentifier dans l'app avec ton compte dev
3. Scanner un QR généré en Phase C
4. **Vérifier** :
   - Bottom-sheet "Tu sembles proche de [œuvre] / [salle]" apparaît
   - Envoyer un message → réponse LLM cite explicitement l'œuvre scannée
   - Langfuse trace contient la section `[CURRENT ARTWORK]` dans le system prompt
5. Tester aussi le **proactive sheet** : se déplacer GPS-mock près d'un des 3 musées → confirm-sheet apparaît (confidence 0.5–0.8) ou auto-banner (>0.8)

### Phase E — Push + PR

```bash
git push -u origin feat/audit-360-w3-geo-walk-intra

gh pr create --base main \
  --title "feat(w3): visitor position detection — detect-museum + geofence + intra-musée QR" \
  --body-file <(printf "%s\n" "## Summary" \
    "- Detect-museum endpoint + hybrid PostGIS/JSONB geofence + Bordeaux pilot seeds" \
    "- FE auto-detect on session-create, MuseumPicker fallback, proactive confirm-sheet" \
    "- Intra-musée: QR deeplink scanner + \`[CURRENT ARTWORK]\` LLM prompt section" \
    "- Code review: 90.2/100 APPROVED · 5699/0 BE tests fail · 0 security blocker" \
    "" \
    "Voir \`docs/HANDOFF_W3_GEO_PILOT.md\` pour le détail." \
    "" \
    "## Test plan" \
    "- [x] Phase A — local stack + migration round-trip + verify-postgis" \
    "- [x] Phase B — merge W4 + re-seed bordelais + tests post-merge" \
    "- [ ] Phase C — QR PDF généré pour le pilote" \
    "- [ ] Phase D — on-device scan + Langfuse trace [CURRENT ARTWORK] vérifié" \
    "" \
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

---

## 6. Risques résiduels

| Risque | Mitigation en place | Action user |
|---|---|---|
| PostGIS prod absent | Hybrid migration auto-fallback JSONB | Vérifier `\dx vector\|postgis` sur VPS avant deploy ; ou run `verify-postgis-migration.sh` |
| Slugs W4 ≠ slugs hard-codés | Migration skip + RAISE NOTICE | Phase B re-seed après merge |
| FlatList nearby in-app JSONB filter scale | V1 < 100 musées OK | Re-considérer si > 500 musées (V2 PostGIS R-tree obligatoire) |
| `cachedGeofenceMode` not invalidated post-deploy | Migrations pre-boot via deploy script | Restart service après hot-migration (rolling deploy hazard) |
| 2nd-order prompt injection via artwork_knowledge.title | Counter-marker + cap 200 chars + reminder | TECH_DEBT LOW-1 |
| 2 FE tests onboarding pre-existing | Out of W3 scope | Traiter dans run dédié (start commit 6c39e9365 origin) |

---

## 7. Refs essentielles

| Ressource | Path |
|---|---|
| Run state | `.claude/skills/team/team-state/2026-05-17-w3-geo-walk-intra/` |
| Reviewer JSON | `.claude/skills/team/team-reports/2026-05-17-w3-geo-walk-intra/code-review.json` |
| Lesson | `.claude/skills/team/team-knowledge/lessons/2026-05-17-w3-geo-walk-intra.md` |
| Spec / Design / Tasks | `.../team-state/.../{spec,design,tasks}.md` |
| Commit | `064c632f` (branch `feat/audit-360-w3-geo-walk-intra`) |
| Verify PostGIS | `museum-backend/scripts/verify-postgis-migration.sh` |
| QR generator | `museum-backend/scripts/generate-qr-cartels.cjs` |
| Roadmap | `docs/ROADMAP_PRODUCT.md` (W1.4/W1.5/W1.6 ticked) |
| Seed source de vérité | `museum-backend/scripts/seed-museums.ts` (slugs bordelais existants) |

---

## 8. Si la nouvelle session reprend ici

Lire dans l'ordre :
1. **Ce fichier** — vue d'ensemble + flow recommandé en haut (lis le rectangle 🟢 en intro)
2. `git log --oneline 064c632f..HEAD -- museum-backend/ docs/ scripts/` — voir tous les commits depuis livraison W3 (livraison W3, handoff, TD-44 hardening)
3. `.claude/skills/team/team-state/2026-05-17-w3-geo-walk-intra/STORY.md` — narratif append-only des 4 spawns d'agents (livraison W3)
4. `.claude/skills/team/team-state/2026-05-18-audit-dev-backend-bullmq-noise/diagnostic.md` (gitignored, local) — diagnostic infra qui a produit TD-44 fix
5. `.claude/skills/team/team-reports/2026-05-17-w3-geo-walk-intra/code-review.json` — findings détaillés
6. Demande à l'utilisateur le **RECAP W4** (pas committé ici)
7. **Phase A = DONE** — saute. Va directement Phase B (§5 Phase B).

### État dev-stack attendu après cold-start

Si l'utilisateur lance `bash scripts/dev-stack.sh` (ou `pnpm dev:stack`) :
- 4 containers up : `dev-postgres :5433`, `dev-redis :6379` (avec `--requirepass`), `dev-backend :3000`, `dev-adminer :8082`
- `docker logs dev-backend --since 5m | grep -cE "(Stream isn't writeable|password was supplied)"` → **0** (TD-44 fix)
- `pnpm sentinel:compose-parity` → PASS (WARN sur `--appendonly` acceptable, dev n'a pas besoin de persistence Redis)
- `pnpm sentinel:dev-container-env-drift` → PASS (.env aligné prod-like, vars `.env`-controlled match container)
- `/api/health` → 200 avec `{"checks":{"database":"up"}}`

### Si la nouvelle session voit du noise BullMQ revenir

C'est probablement parce que l'utilisateur a édité `.env` après que le container ait démarré. Fix :
```bash
docker compose -f museum-backend/docker-compose.dev.yml up -d --force-recreate backend
```
Le sentinel `dev-container-env-drift.sh` (intégré dans `scripts/morning-check.sh`) tire à ce moment-là.

Ne PAS re-lancer `/team` sur les features W3 (livraison) ou TD-44 (infra hardening) — c'est complet.

Pour reprendre après merge W4 et test : tu peux soit faire les commandes Phase B/C/D directement, soit demander à Claude de les exécuter (la session aura tout le contexte via ce handoff).
