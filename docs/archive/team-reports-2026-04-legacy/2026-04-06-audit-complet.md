# Audit Complet Musaium — 2026-04-06

## Executive Summary

**Score global : 8.1/10**

| Axe | Score | Agent |
|-----|-------|-------|
| Structure & Config | 8/10 | repo-scanner |
| Code Quality | 8/10 | code-quality |
| Test Coverage & Features | 9/10 | feature-verify |
| Technical Debt | 7/10 | cleanup |
| Security & Privacy | 7.5/10 | security-auditor |
| Architecture & Vision | 9/10 | vision-analyst |

**Findings :** 0 critical, 1 high, 15 medium, 25 low, 50+ info
**Features completes :** 37+ (13 sprints, 165/165 items)
**Tests :** 2294 backend + 1052 frontend (93.62% coverage backend)
**Type safety :** 0 `@ts-ignore`, 0 `@ts-expect-error`, 1 `as any` prod

Musaium est un produit remarquablement abouti avec une base technique solide. Les principaux axes d'amelioration sont : (1) la transparence privacy autour des donnees envoyees aux LLM, (2) le menage des exports morts et de la documentation perimee, (3) les quelques warnings TypeScript a resoudre.

---

## Axe 1 — Structure & Config (8/10)

### Points forts
- Architecture hexagonale backend parfaitement respectee (6/7 modules)
- Feature-driven frontend avec 11 modules
- CI/CD enterprise-grade : 6 workflows, Semgrep SAST, Trivy scan, coverage gates
- ESLint config exemplaire (strictTypeChecked + boundaries + import-x + sonarjs)
- Docker production-grade (multi-stage, non-root, healthcheck)
- `.env.local.example` complet avec 80+ variables documentees

### Findings

| Sev | Finding | Action |
|-----|---------|--------|
| **MEDIUM** | CLAUDE.md dit "RN 0.79 + Expo 53" mais c'est RN 0.83 + Expo 55 | Mettre a jour CLAUDE.md + README.md |
| **MEDIUM** | CLAUDE.md decrit chat comme "domain->application->infrastructure" mais c'est "domain->useCase->adapters" | Corriger la description |
| **MEDIUM** | museum-web (Next.js 15) absent de CLAUDE.md — aucune commande, architecture, ni path alias | Ajouter section museum-web |
| **MEDIUM** | daily-art ne suit pas le pattern hexagonal (fichiers plats) | Refactorer ou documenter comme exception |
| **LOW** | design-system/ non mentionne dans CLAUDE.md | Ajouter breve section |
| **LOW** | `_deploy-backend.yml` reusable workflow jamais appele — deploy inline en doublon (~200L) | Refactorer pour eliminer duplication |
| **LOW** | Mobile CI sans concurrency group | Ajouter `concurrency: ci-cd-mobile-${{ github.ref }}` |
| **LOW** | Mobile CI ne lance pas `--coverage` — thresholds configures mais jamais actives | Ajouter `--coverage` au npm test |
| **LOW** | pre-push hook ne typecheck pas museum-web | Ajouter au hook |
| **MEDIUM** | npm audit frontend : 7 vulns (5 low, 2 moderate — markdown-it ReDoS) | Monitorer upstream fix |
| **LOW** | Pas de CHANGELOG.md | Considerer conventional-changelog |

---

## Axe 2 — Code Quality (8/10)

### Points forts
- Backend : 0 erreurs tsc, 0 warnings ESLint, full strict mode
- Zero `@ts-ignore` / `@ts-expect-error` dans tout le codebase
- 1 seul `as any` en code production backend (pool monitoring — justifie)
- Zero cross-module imports backend — boundaries hexagonales respectees
- Frontend cross-feature : graphe de dependances unidirectionnel, zero cycle

### Findings

| Sev | Finding | Action |
|-----|---------|--------|
| **HIGH** | 16 ESLint warnings frontend : 5x `@typescript-eslint/no-deprecated` (SafeAreaView, absoluteFillObject) + 1x non-null assertion prod (`conversations.tsx:127`) | Migrer SafeAreaView vers `react-native-safe-area-context`, remplacer `absoluteFillObject` par `StyleSheet.absoluteFill`, corriger `!` avec null check |
| **MEDIUM** | `chatApi.ts` 574 lignes — god-module risk | Splitter : chatSessionApi, chatMessageApi, chatMediaApi, chatStreamApi |
| **MEDIUM** | `auth.tsx` 564 lignes — mixe form, social login, GDPR, animations | Extraire : LoginForm, RegisterForm, SocialLoginButtons, GDPRConsentSection |
| **MEDIUM** | 2x `react-hooks/exhaustive-deps` disables sans raison (museum-web analytics) | Ajouter commentaires raison ou supprimer si inutiles |
| **LOW** | 10 eslint-disable sans commentaire `-- raison` (tous dans allowlist) | Ajouter suffixes raison |
| **LOW** | `as unknown as Blob` x2 dans chatApi.ts (pattern RN standard) | Definir `type RNFormDataBlob` pour documenter l'intent |
| **LOW** | `as unknown as never` dans httpRequest.ts | Revoir si un type erreur proper est possible |

---

## Axe 3 — Test Coverage & Features (9/10)

### Points forts
- 2294 tests backend, 1052 tests frontend — TOUS passent
- Coverage backend : 93.62% statements (threshold 88%)
- 0 tests skippes frontend, E2E conditionnel correct
- Factories partagees utilisees dans 37 fichiers (313 usages)
- Contrat OpenAPI valide (51 paths, 58 operations, contract tests PASS)
- **37+ features completes** sur 13 sprints — 165/165 items coches

### Findings

| Sev | Finding | Action |
|-----|---------|--------|
| **MEDIUM** | 3 routes manquantes dans le spec OpenAPI : `GET /museums/search`, `GET /admin/reviews`, `PATCH /admin/reviews/:id` | Ajouter les path definitions + regenerer types frontend |
| **LOW** | `langchain-orchestrator.fail-soft.test.ts` : `createMessage()` local au lieu de `makeMessage()` | Remplacer par factory partagee |
| **LOW** | `admin-repository.test.ts` : `makeReport()` et `makeAuditLog()` inline avec `as` cast | Creer factories dans tests/helpers/ |

### Inventaire features complet

<details>
<summary>37+ features — cliquer pour voir le detail</summary>

**Core AI :**
- AI Chat (text + image + audio) — SSE streaming, multi-LLM
- Art Topic Guardrail (input + output)
- OCR Image Prompt Injection Detection
- Knowledge Base (Wikidata)
- Image Enrichment (Wikidata P18 + Unsplash)
- Cross-Session User Memory
- Text-to-Speech (TTS)
- Art Keywords Sync (WIP — partial)

**Auth & GDPR :**
- Authentication (email + social Apple/Google + biometric)
- GDPR Compliance (consent, data export, account deletion, privacy policy)

**Museum :**
- Museum Directory + Geolocation (haversine sort, OSM fallback)
- Guided Museum Mode (expertise-adaptive)
- Multi-Museum Switching
- B2B Multi-Tenancy + API Key Auth

**Social :**
- Review System (create, moderate, stats)
- Support / Ticket System
- Daily Art

**UX :**
- Conversation Management (search, pagination, bulk ops)
- i18n (7 langues + RTL arabe)
- Dark Mode
- Offline Support (queue + sync)
- Onboarding Carousel
- Image Preview + Crop
- Skeleton Loading
- Haptic Feedback
- Visit Summary Modal
- Follow-up Questions + Recommendation Chips
- Markdown Rendering

**Infrastructure :**
- Redis Cache Layer
- Feature Flags (3)
- Audit Logging
- Observability (Sentry + OpenTelemetry)
- Admin Dashboard Web (Next.js 15)
- Marketing Website

</details>

---

## Axe 4 — Technical Debt (7/10)

### Points forts
- Zero blocs de code commente
- Pas de sprawl TODO/FIXME (1 seul stale)
- Backend utilise le logger proprement (pas de console.log de debug)
- Pas de fichiers .bak, .old, .tmp dans le code source

### Findings

| Sev | Finding | Action |
|-----|---------|--------|
| **MEDIUM** | `startPoolMonitor()` exporte mais jamais appele | Supprimer export ou integrer au startup |
| **MEDIUM** | `getRedisRateLimitStore()` exporte mais jamais appele | Supprimer export ou wirer au health check |
| **MEDIUM** | `probeApiHealth()` frontend exporte mais jamais appele | Supprimer si inutile |
| **MEDIUM** | `@react-navigation/bottom-tabs` dep directe redondante (deja transitif via expo-router) | Supprimer de package.json |
| **LOW** | ~58 exports morts (40+ backend, 18+ frontend) — types/interfaces internes inutilement exportes | Batch cleanup : supprimer les `export` keyword |
| **LOW** | 3 design tokens inutilises (accentScale, goldScale, surfaceColors) | Supprimer ou integrer au theme |
| **LOW** | `expo-system-ui` dep possiblement inutilisee | Verifier auto-linking Expo, supprimer si non necessaire |
| **LOW** | `SKILL.md.v2.bak` fichier backup 17.5K | Supprimer |
| **INFO** | `docs/prompts/` repertoire vide | Supprimer |
| **INFO** | `docs/archive/fullcodebase-analyse/` — 12 fichiers historiques potentiellement perimes | Archiver ou supprimer |
| **INFO** | `docs/walk/` et `docs/V3_Plan/` — duplication de planning | Consolider |
| **INFO** | 1 stale TODO : Instagram handle (18 jours) | Creer le handle ou supprimer le placeholder |

---

## Axe 5 — Security & Privacy (7.5/10)

### Points forts
- **JWT exemplaire** : HS256 explicite, refresh token rotation avec detection de reutilisation, secrets separes, tokens hashes SHA-256
- **bcrypt 12 rounds** pour passwords
- **Zero SQL injection** : TypeORM parametrise partout, zero raw SQL
- **Validation input complete** : Zod schemas, magic bytes images, protection SSRF, sanitizePromptInput()
- **Prompt isolation structurelle** : boundary marker `[END OF SYSTEM INSTRUCTIONS]`, message ordering correct
- **Docker non-root**, Helmet, CORS, rate limiting dual-layer (IP + email)
- **GDPR** : deletion cascade, data export, audit trail, consent modal
- **Aucun PII direct (email, nom, ID) n'atteint le LLM** — confirme par tracage complet du flux

### Findings

| Sev | Finding | Action |
|-----|---------|--------|
| **MEDIUM** | Champ `location` (texte libre) injecte dans le prompt LLM sans opt-in explicite | Rendre le partage de localisation opt-in, documenter dans privacy policy |
| **MEDIUM** | User Memory (profil comportemental cross-session) envoye au LLM a chaque message | Ajouter toggle utilisateur pour desactiver memory LLM, documenter |
| **MEDIUM** | Visit Context (adresse musee, oeuvres discutees) envoye au LLM | Le nom de musee suffit peut-etre — l'adresse physique n'est pas necessaire |
| **MEDIUM** | AI Consent modal = simple boolean — ne detaille pas ce qui est partage (GDPR "consentement eclaire") | Enrichir le modal : lister explicitement texte/images/audio/localisation/profil comportemental |
| **MEDIUM** | Pas de PII stripping layer — si l'utilisateur tape son email/telephone dans un message, ca arrive au LLM | Creer `PiiSanitizer` port avec detection regex (email, tel, noms) |
| **MEDIUM** | Pas de politique de retention des donnees chat (messages persistent indefiniment) | Definir TTL ou retention policy, documenter |
| **LOW** | Images envoyees au LLM sans stripping EXIF (peut contenir GPS, faces) | Stripper EXIF avant envoi LLM |
| **LOW** | Audio envoye a OpenAI pour transcription — donnee biometrique GDPR Art.9 | Mentionner explicitement dans le consent modal |
| **LOW** | Guardrail keyword-based contournable (leetspeak, Unicode homoglyphes) | Defense-in-depth OK via prompt isolation, mais ajouter patterns pour plus de locales |
| **LOW** | POST /art-keywords sans role check admin | Ajouter `requireRole('admin')` |
| **LOW** | Refresh token en localStorage sur web (XSS risk) | Considerer httpOnly cookies pour le web |

### Flux de donnees vers le LLM (cartographie complete)

```
Frontend                    Backend                        LLM Provider
--------                    -------                        ------------
text message ──────────────> chat-message.service ─────────> [user_message]
image (base64) ────────────> image validation ─────────────> [vision model]
audio ─────────────────────> OpenAI Whisper ───────────────> (transcription only)
locale ────────────────────> sanitizePromptInput ──────────> [visitor_context]
location (free text) ──────> sanitizePromptInput ──────────> [visitor_context]
museumMode + guideLevel ───> prompt builder ───────────────> [system prompt vars]
                             user-memory.service ──────────> [USER MEMORY block]
                             visit-context.ts ─────────────> [VISIT CONTEXT block]
                             knowledge-base.service ───────> [KNOWLEDGE BASE block]
                             chat history (12 msgs) ───────> [conversation history]

NON envoye au LLM : email, nom, user ID, password, tokens, device info
```

---

## Axe 6 — Architecture & Vision (9/10)

### Extensibilite

| Composant | Score | Notes |
|-----------|-------|-------|
| Backend hexagonal | 9/10 | Ports/adapters, DI via barrels, nouveau module = 3 dirs + 1 wire |
| Frontend feature-driven | 8/10 | 11 modules, Expo Router file-based, nouvelle feature = 1 dir |
| AI Pipeline | 9/10 | ChatOrchestrator port, sections extensibles, KB/TTS/OCR/STT tous ports |

### Analyse concurrentielle

| Concurrent | Force | Faiblesse | Position |
|------------|-------|-----------|----------|
| Google Arts & Culture | 2000+ musees, AR | Pas d'IA conversationnelle, pas de personnalisation | Contenu massif, interaction faible |
| Smartify | Scan oeuvres, 150+ partenariats | Contenu statique, pas d'IA | Leader scan, faible IA |
| Bloomberg Connects | Gratuit, offline | Pas d'IA, limite aux institutions Bloomberg | Niche |
| izi.TRAVEL | Audio tours GPS, large POI DB | Pas d'IA, pre-enregistre uniquement | Leader audio GPS |

**Differenciateurs Musaium :**
- SEULE app combinant IA conversationnelle + tout musee + reconnaissance image + personnalisation
- Reponses adaptatives a l'expertise (debutant → expert)
- Memoire cross-session
- Multi-modal (texte + image + voix) dans une seule conversation
- Fonctionne dans TOUT musee (pas limite aux partenaires)
- 7 langues nativement

---

## Top 10 Actions Prioritaires

| # | Action | Sev | Effort | Impact | Statut | Commentaire |
|---|--------|-----|--------|--------|--------|-------------|
| 1 | **Privacy : Creer PiiSanitizer port** — detection regex email/tel/noms avant envoi LLM | MEDIUM | S (2 sem) | Comble le gap privacy #1 | ✅ | Port hexagonal + regex adapter (email/phone), 12 tests |
| 2 | **Privacy : Enrichir AI Consent modal** — lister explicitement toutes les donnees partagees avec les LLM | MEDIUM | S (3 jours) | Conformite GDPR "consentement eclaire" | ✅ | 5 categories listees explicitement, 8 langues |
| 3 | **Privacy : Toggle user memory LLM** — permettre a l'utilisateur de desactiver le profil comportemental dans les prompts | MEDIUM | S (1 sem) | Controle utilisateur sur ses donnees | ✅ | Toggle UI + endpoint PATCH + migration, 8 tests |
| 4 | **Docs : Mettre a jour CLAUDE.md** — versions RN/Expo, description chat module, ajouter museum-web | MEDIUM | XS (1h) | Evite confusion pour tout contributeur | ✅ | commit 42235aa6 |
| 5 | **TypeScript : Corriger 16 warnings frontend** — migrer SafeAreaView deprecated, fix non-null assertion | HIGH | S (2h) | Zero warnings = quality gate propre | ✅ | 0 warnings (etait 10), null guards dans 2 test files |
| 6 | **OpenAPI : Ajouter 3 routes manquantes** au spec + regenerer types frontend | MEDIUM | XS (1h) | Contrat API complet | ✅ | commit 42235aa6 |
| 7 | **Cleanup : Batch supprimer ~58 exports morts** | LOW-MED | S (2h) | Codebase plus lisible, imports clairs | ✅ | commit 42235aa6 — 57 exports supprimes |
| 8 | **Cleanup : Supprimer dep redondante** `@react-navigation/bottom-tabs` + verifier `expo-system-ui` | MEDIUM | XS (15min) | Deps propres | ✅ | commit 42235aa6 |
| 9 | **CI : Activer --coverage mobile + concurrency group** | LOW | XS (30min) | Coverage gate enforcee en CI | ✅ | commit 42235aa6 |
| 10 | **Privacy : Stripper EXIF images** avant envoi LLM | LOW | S (1 jour) | Elimine fuite GPS/faces dans les photos | ✅ | expo-image-manipulator re-encode JPEG strip EXIF |

---

## Feuille de Route — Features Futures

### Phase 1 — Privacy & Polish (4-6 semaines)

| Done | Feature | Effort | Prerequis | Commentaire |
|------|---------|--------|-----------|-------------|
| ✅ | PII Stripping Proxy (Tier 1 privacy) | 2 sem | Nouveau port PiiSanitizer | Port hexagonal + regex adapter (email/phone), 12 tests — commit 4bb952c9 |
| ✅ | Audio Description Mode (accessibilite) | 1 sem | TTS existant | Auto-TTS + prompt WCAG + /describe endpoint + toggle settings/chat header |
| ✅ | Art Keywords Classifier (finir WIP) | 1 sem | Code deja partiellement ecrit | Pre-filtre frontend + hint preClassified + keyword discovery loop evolutif |
| REPORTÉ | Museum Analytics Dashboard (B2B) | 2 sem | Admin dashboard existant | Reporté après sortie app + premiers retours utilisateurs |
| ☐ | Multi-Museum UX polish | 1 sem | Museum directory existant | |

**Rationale :** Privacy-first est le plus fort argument B2B et une exigence reglementaire. Ce sont des quick wins construits sur l'infrastructure existante.

### Phase 2 — Navigation & Low-Data Resilience (6-8 semaines)

| Done | Feature | Effort | Prerequis | Commentaire |
|------|---------|--------|-----------|-------------|
| ☐ | **Walking Guide to Museum** (navigation + contexte progressif) | 4 sem | Maps SDK, Directions API, geofencing | |
| ☐ | **Smart Low-Data Mode** (cache LLM partage + pre-fetch contextuel + degradation gracieuse) | 3 sem | Redis cache responses, expo-sqlite local, adaptive prompts | Remplace "Full Offline Mode" — le segment cible n'est pas offline complet mais low-data en musee |
| ☐ | On-device image classification (privacy Tier 2) | 2 sem | CoreML/ONNX, MobileNetV3 fine-tune | |
| ☐ | On-device STT whisper.cpp (privacy Tier 2) | 2 sem | react-native-whisper | |

**Rationale :** La navigation est la feature que ZERO concurrent IA propose. Le Smart Low-Data Mode preserve l'experience IA conversationnelle en signal faible/intermittent (realite des musees) plutot que de la remplacer par du contenu statique. Le on-device avance la story privacy.

### Phase 3 — City Explorer & Social (8-12 semaines)

| Done | Feature | Effort | Prerequis | Commentaire |
|------|---------|--------|-----------|-------------|
| ☐ | **Urban Cultural Walking Guide** (explorateur ville) | 6 sem | Overpass API, Wikidata SPARQL, background location | |
| ☐ | Social Features (partage visite, communaute) | 3 sem | Deep linking, expo-sharing | |
| ☐ | Gamification (badges, parcours, quiz) | 3 sem | User memory existant, nouveau module | |
| ☐ | Notifications geolocalisees (POI culturels) | 2 sem | Geofencing, expo-notifications | |

**Rationale :** Transforme Musaium de "app musee" en "compagnon culturel". Expansion massive du TAM — de visiteurs de musee a tous les touristes culturels.

### Phase 4 — Enterprise & AR (12-16 semaines)

| Done | Feature | Effort | Prerequis | Commentaire |
|------|---------|--------|-----------|-------------|
| ☐ | Self-Hosted LLM (privacy Tier 3, B2B) | 4 sem | ChatOrchestrator port deja abstrait | |
| ☐ | Integration billetterie musee | 3 sem | API partenaires | |
| ☐ | AR Overlay prototype | 6 sem | expo-camera, modele reconnaissance | |
| ☐ | Navigation indoor (plans d'etage) | 4 sem | Donnees partenaires musee | |

**Rationale :** Features enterprise pour grands clients institutionnels. AR = fort pour demos et presse.

---

## Architecture Privacy-First — Recommandation

### Tier 1 — Quick Win (2 semaines)
**PII Stripping Proxy cote serveur**
- Nouveau port `PiiSanitizer` dans `domain/ports/`
- Implementation regex : email, telephone, noms (NER basique)
- Insertion entre `ChatMessageService.prepare()` et `orchestrator.generate()`
- Impact qualite AI : **ZERO** — le LLM n'a pas besoin des PII pour parler d'art
- Couvre 80% des preoccupations privacy

### Tier 2 — Moyen terme (1-2 mois)
**On-device classification + STT**
- Image : MobileNetV3 fine-tune "art vs personnel" — evite l'envoi de photos personnelles au LLM
- Audio : whisper.cpp via react-native-whisper — elimine l'upload audio vers OpenAI
- Modeles : ~5MB (image) + ~40MB (whisper tiny)

### Tier 3 — Long terme (3-6 mois)
**Self-hosted LLM pour B2B**
- Le port `ChatOrchestrator` rend ca architecturalement propre
- Nouvel adapter pour API LLM self-hosted (Llama 3, Mistral)
- Souverainete totale des donnees — rien ne quitte l'infrastructure du client

---

## Definition of Done

- [x] 6 agents SCAN ont complete
- [x] Findings consolides et cross-valides
- [x] Rapport ecrit dans team-reports/
- [x] Score global calcule (8.1/10)
- [x] Top 10 actions identifiees
- [x] Roadmap 4 phases proposee
- [x] Architecture privacy-first detaillee
