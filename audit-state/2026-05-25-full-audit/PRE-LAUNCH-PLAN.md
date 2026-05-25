# 🚀 Plan pré-lancement Musaium V1 — J-13 (launch 2026-06-07) — v2 (produit-first)

> Source : full-audit 2026-05-25 (82 agents). Décisions intégrées : **MFA → post-V1**. Focus **produit, pas optimisation** (l'optim part en Wave 4 différée). Pas d'estimations en jours (mes estimations solo sont 50-70 % trop hautes — ta vélocité gouverne).
> **Principe de groupage** : on ne groupe PAS par "type de bug" mais par **zone de code disjointe** (backend / frontend / web / infra-CI / ops-humain). Deux tracks dans des zones disjointes ne se marchent pas dessus → vrai parallèle. Le seul point chaud intra-backend est le **chat-pipeline** (plusieurs items s'y croisent) → à faire en série entre eux.

---

> **✅ DÉCISIONS TRANCHÉES (2026-05-25)** : ① NPS = **FULL SCOPE** (0-10 + global + per-museum, B2B-ready) — PAS de descope. ② museum_manager = **FULL SCOPE Aligner FE/BE** (scoper getStats + routes + branding consumer mobile). ③ MFA = **post-V1** (V1 = neutraliser l'entrée enroll). **Groupage révisé : par FEATURE verticale (1 worktree = 1 slice BE+FE+web cohérente), pas par environnement.** Prompts prêts : [`WORKTREE-PROMPTS.md`](WORKTREE-PROMPTS.md).

## 1. DEUX DÉCISIONS À TRANCHER D'ABORD (elles descopent du travail)

> Pourquoi d'abord ? Parce que selon ton choix, on **écrit du code OU on n'en écrit pas**. Trancher = potentiellement supprimer un item entier de la Wave 1.

### Décision ① — KR2 NPS (objectif OKR « NPS post-session ≥ 7/10 »)
**État réel** : impossible à mesurer aujourd'hui. `aggregateNps()` est du dead-code (0 appelant), `StarRating.tsx:31` plafonne à **5 étoiles** (donc aucune note 0-10 possible), et `users.museum_id` n'est jamais assigné (l'axe per-museum est inerte).

| Option | Ce qu'on fait | Ce que ça coûte | Ce que ça descope |
|---|---|---|---|
| **A — NPS global minimal (RECOMMANDÉ)** | Ajouter une question 0-10 post-session (ou élargir StarRating à 0-10) + 1 endpoint qui agrège un NPS **global** (promoters/passives/detractors) | Petit (S) — 1 input FE + 1 lecture BE qui existe déjà (`aggregateNps` à câbler) | Le NPS **par musée** (inutile en V1 : 0 musée contracté) → V1.1 B2B |
| **B — Descoper KR2** | Mesurer la satisfaction hors-app (Typeform post-session OU signal rétention Plausible KR4). Marquer KR2 « non instrumenté in-app V1 » | Zéro code | Tout le NPS in-app |

**Reco prof** : Option **A-global**. KR2 est *la* question produit (« est-ce que l'expérience donne envie de revenir ? ») — tu veux la réponse. Le per-museum n'a aucun sens sans client B2B, donc on le jette. C'est un petit ajout produit, pas de l'over-engineering.

### Décision ② — rôle `museum_manager` (admin multi-tenant B2B)
**État réel** : le rôle est à moitié construit et **cassé**. Il est dans l'allow-list `AdminShell.tsx:195` (la porte FE s'ouvre), mais le backend n'autorise que `/stats` → **7 des 8 liens de nav renvoient 403**, et le seul qui marche (`/stats`) **fuit l'agrégat global cross-tenant** (`getStats` ignore le museumId). Le branding admin écrit dans le vide (zéro consumer). Or **0 musée n'est contracté** en V1 (B2C-first).

| Option | Ce qu'on fait | Ce que ça coûte | Ce que ça descope |
|---|---|---|---|
| **A — Retirer le rôle de la V1 (RECOMMANDÉ)** | Retirer `museum_manager` de l'allow-list FE + masquer la nav. Le rôle reste en base pour plus tard | Très petit (S) — 1-2 lignes | Tout l'admin multi-tenant → V1.1/V1.2 (M1.2) quand un musée signe |
| **B — Aligner FE/BE** | Câbler les 7 routes + scoper `getStats` par museumId + brancher le branding consumer | Gros (L) | Rien, mais c'est du travail B2B prématuré |

**Reco prof** : Option **A-retirer**. Une feature B2B *cassée* fait plus de mal que pas de feature (elle expose la fuite stats + 7 liens morts). Tu n'as pas de client B2B à servir en V1. La retirer est honnête, minuscule, et **fait disparaître le risque de fuite C8 du même coup**. Le vrai admin multi-tenant se construira quand un musée sera contracté (pitch B2B = démo image-compare + co-branding, pas un dashboard cassé).

---

## 2. TODO PRÉ-LANCEMENT — OPS (Tim, humain, hors-code — démarre en parallèle MAINTENANT)

> Ces tâches ne sont pas du code : elles débloquent la conformité légale et la prod. Aucune ne dépend des autres → toutes parallèles.

- [ ] **B17 — Révoquer la clé Anthropic** exposée (`.env:108`, `sk-ant-…`). Dead côté code, mais re-exposée par l'audit → révoquer sur le dashboard Anthropic. *(5 min)*
- [ ] **B12 — Générer la clé PGP réelle** (Ed25519, 2 ans) et remplacer le placeholder `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP` dans `museum-web/public/.well-known/pgp-key.txt`. Procédure : `docs/operations/PGP_KEY_GENERATION.md`.
- [ ] **B13 — Provisionner la mailbox `security@musaium.com`** (alias OVH → Gmail) + smoke test RFC 9116 (sinon `SECURITY.md` ment).
- [ ] **B14 — Signer le DPA Langfuse** + archiver dans `docs/legal/dpa-signed/` (Langfuse Cloud est actif en prod, traite de la donnée).
- [ ] **B19 — S3 bucket Public-Access-Block** : activer le PAB sur le bucket prod (console OVH/AWS) — il stocke voix biométrique + images EXIF. *(le sentinel CI de garde = côté code, Wave 2)*
- [ ] **C7.5 — Smoke device TTS sur iPhone réel** avant submit TestFlight (le STT/TTS Opus ne se teste qu'en device).
- [ ] **Seed prod + no-drift** : exécuter le seed démo (Aquitaine, cf C4) sur la prod, PUIS vérifier `migration:run` → `generate Check` **vide** (zéro drift de schéma) avant le bake.

---

## 3. `.env` À AJOUTER / VÉRIFIER (vérifié dans le code, UFR-013)

> Le `.env` prod réel est hors-repo (gitignored) — voici la checklist canonique à confronter à ton `.env` prod.

### 3.1 À AJOUTER (confirmés manquants par l'audit)
| Var | Où | Pourquoi | Sans ça |
|---|---|---|---|
| **`EXPO_PUBLIC_PLAUSIBLE_DOMAIN`** | FE (`.env.production` / EAS) | Funnel analytics KR4 | `resolveDomain()` no-op silencieux → **dashboard KR4 vide en prod** |
| **`EXPO_PUBLIC_SENTRY_DSN_ANDROID` + `_IOS`** | FE prod / EAS | Crash reporting mobile | Présents dans `.env.prod-test` mais PAS dans `.env.production.example` → **KR3 crash-free non mesuré** si absents du build EAS prod |
| **`SIGLIP_ONNX_SHA256`** | CI build-arg (`Dockerfile.prod`) | Pin du modèle SigLIP (C1) | `fetch-models.sh` avale le 404 → cold start `/chat/compare` = **503** |

### 3.2 À VÉRIFIER présents dans le `.env` prod BE (sinon boot fail-fast)
Le code `env.production-validation.ts` **refuse de démarrer** si l'un manque :
`CORS_ORIGINS` · `CSRF_SECRET` · `EXPORT_PSEUDONYM_SALT` (≥32 chars) · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` · `MEDIA_SIGNING_SECRET` · `MFA_ENCRYPTION_KEY` · `MFA_SESSION_TOKEN_SECRET` · `OPENAI_API_KEY` · `DEEPSEEK_API_KEY` · `GOOGLE_API_KEY` · `PGDATABASE` · `REDIS_PASSWORD`.
**+ corrections C6 (utilisées mais non-required)** à confirmer : `APP_VERSION`, `GOOGLE_OAUTH_CLIENT_ID`, `BREVO_API_KEY`, `REDIS_MAXMEMORY`/`REDIS_MAXMEMORY_POLICY`.

### 3.3 À RETIRER du `.env` prod
- **`ANTHROPIC_API_KEY`** — dead config (zéro usage code), à supprimer **après** révocation (cf. TODO ops).

---

## 4. LES WAVES (groupées par zone disjointe = parallélisables)

### 🔴 WAVE 1 — Bloquants launch (produit + légal)
**Objectif** : rien qui rende le produit *cassé*, *illégal* ou *aveugle* ne doit shipper. C'est le minimum non-négociable pour ouvrir aux 100 premiers visiteurs.
**Ce qu'on fait** (4 tracks parallèles, apps disjointes) :
- **1A · FE** — **Neutraliser l'entrée MFA enroll** : `app/(stack)/mfa-enroll.tsx` doit être inatteignable en V1 (cacher le lien/route) pour qu'aucun user ne s'auto-verrouille (le challenge n'est pas câblé). Le **flow MFA complet → post-V1** (backlog). *Petit.*
- **1B · BE** — **Consent location bypass** (P0-FA3) : couper le fallback raw-coords (`prepare-message.pipeline.ts:482` + `llm-prompt-builder.ts:196-200`) → ne ship AUCUNE location si consent refusé. *Légal RGPD Art.7.*
- **1C · infra+BE** — **Alertes prod** (I-OPS2 : backend-down / 5xx / DB / Redis + severity) **+ merger #300** (cap coût anon + judge fail-OPEN, `34bf280fc`). Sans ça : un crash ne page personne et la facture LLM peut déraper.
- **1D · BE** — **Daily-art images** (P0-FA5) : re-sourcer les 14/30 URLs cassées (Wikimedia stable) + sentinel CI de liveness. C'est la **première impression** (47 % des jours = icône fallback, dont Mona Lisa).
- **1E · CI/ops** — **SigLIP provisioning** (C1) : provision GCS + injecter `SIGLIP_ONNX_SHA256` en CI, sinon `/chat/compare` = 503 (l'image-compare, argument B2B, est morte).
**Pourquoi groupé ainsi** : ce sont les 5 défaillances qui cassent l'expérience cœur ou violent la loi. Zones disjointes (auth FE / chat BE / infra / data BE / CI) → tout en parallèle.
**Ce que ça défère explicitement** : le **flow MFA complet** (post-V1), le **NPS per-museum** et le **multi-tenant admin** (selon décisions §1, probablement retirés/minimisés), toute optimisation.

### 🟠 WAVE 2 — Conformité & honnêteté (le "dossier légal" du launch)
**Objectif** : que toute promesse publique légale soit **vraie**, et que la doc ne mente pas (un launch B2C EU = obligations RGPD Art.13/28/30 + EAA). Un placeholder PGP ou une privacy policy fausse = signal "vendor négligent" + risque conformité.
**Ce qu'on fait** (4 tracks parallèles) :
- **CI** : PGP CI-gate (bloque le deploy si placeholder) + S3 PAB sentinel (boot-check `GetPublicAccessBlock`).
- **Legal/docs** : ajouter Langfuse/CARTO/Expo à `SUBPROCESSORS.md` (Art.28) + `ROPA.md` (Art.30) + créer `docs/legal/dpa-signed/`.
- **KR4** : ajouter `EXPO_PUBLIC_PLAUSIBLE_DOMAIN` (cf §3) — sinon le funnel d'adoption est muet.
- **Honnêteté** (UFR-013/024) : retirer/merger `LOT-P0-STABILITY-CLOSURE.md` (claim creux) · réécrire prose I-SEC4/I-SEC6 (bugs "live" fixés) · réconcilier I-SEC8 (CRITIQUE→LOW) · `ADR-038:76`+`ADR-065:20` `llm:v1`→`v2` · doc-anchors `c4b/c2` + créer `doc-anchor-check.mjs` (cité, inexistant).
**Pourquoi groupé** : c'est l'hygiène **légale et de vérité**, indépendante du produit, donc parallèle à tout le reste.
**Ce que ça défère** : rien de produit. (Si tu manques de temps, B12/B13/B14/B19 côté Tim sont le vrai gate ; le code Wave 2 peut suivre dans la fenêtre hotfix.)

### 🟠 WAVE 3 — Debt PRODUIT à zéro (ce que l'utilisateur voit/vit)
**Objectif** : les bugs qui **dégradent l'expérience** sans la bloquer. C'est le sens utile de "debt à zéro" pour un launch produit.
**Ce qu'on fait** (Backend ∥ Frontend ∥ Web = 3 apps en parallèle) :
- **Backend** (point chaud chat-pipeline → série entre eux) : logger sans scrub (PII en stdout) · Langfuse vision PII array · TTS non consent-gated (B7) · DSAR `artwork_matches` (export Art.15 incomplet) · leads durabilité (lead perdu si Brevo down) · smoke account teardown + `verification_token` no-op · TOTP atomic.
- **Frontend** (features disjointes → sub-parallèle) : **settings sync** (5 réglages ne persistent pas — `PATCH /me/preferences` + `audioDescriptionMode` jamais appelés) · TTS cache `.mp3`→`.opus` · Accept-Language `fr-FR` (users FR ont l'anglais) · a11y bulle USER masquée (I-CMP3) · 2 Maestro stale sur shards CI · C3.5 useCompareImage (câbler ou enterrer).
- **Web** : I-CMP4 contraste badge 2.15:1 · I-CMP5 refs `.app` (contact a11y injoignable).
**Pourquoi groupé** : tout est *visible par l'utilisateur* ou *conformité a11y*. Réparti par app = 3 fronts parallèles.
**Ce que ça défère** : toute la perf/scale → Wave 4.

### 🟡 WAVE 4 — Optimisation & dette technique pure (DIFFÉRÉE V1.0.x — décision assumée)
**Objectif** : ce qui n'a **aucun impact** sur l'utilisateur à 100 visiteurs/semaine. Tu as dit « produit, pas optimisation » → **on défère explicitement**.
**Ce qu'on défère** : indices DB manquants (I-OPS7) · migration single-path (I-OPS3) · guard pgvector ≥0.7.0 (I-OPS6) · cost-breaker dailySpend (I-OPS/A6, single-instance) · CI gates théâtre (I-OPS8) · media backup IaC (I-OPS5) · CC-BY-SA (inerte) · burials dead-code (seed-pilot Paris, WelcomeCard, reviews.userName, SSE callbacks) · C3.7 score-floor · C4.3 promptfoo · W2.2 branding consumer.
**Pourquoi défer est le bon call (UFR-001)** : à faible volume, zéro effet ; la fenêtre hotfix V1.0.x (06-07 → 06-21) existe exactement pour ça. Forcer ces items à zéro pré-launch coûte du temps qui devrait aller au produit.

---

## 5. Vue d'ensemble parallélisme + gate final

```
J-13 ──────────────────────────────────────────────────────► launch 06-07
  Décisions §1 (NPS, museum_manager) ← trancher en premier (descope)
  Wave OPS (Tim) ─────────────────────────────────┐  (parallèle dès maintenant)
  Wave 1 : 1A∥1B∥1C∥1D∥1E (apps disjointes) ───────┤── GATE LAUNCH
  Wave 2 : CI ∥ legal ∥ KR4 ∥ honnêteté ───────────┘
  Wave 3 : Backend ∥ Frontend ∥ Web ──── debt PRODUIT à zéro
  Wave 4 : ──── DIFFÉRÉE V1.0.x (optimisation, assumé)
  ▶ GATE FINAL : smoke prod local Docker ≥48h (auth+chat+photo+DSAR+geofence) AVANT bake
```

**"Debt à zéro" honnête** = Wave 1 + 2 (obligatoire) + Wave 3 (debt produit) à zéro ; Wave 4 (optimisation) **différée assumée** — c'est cohérent avec « focus produit ».
