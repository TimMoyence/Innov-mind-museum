# Registre des Activités de Traitement (ROPA — RGPD Art. 30)

**Statut** : DRAFT v1.0 — à valider par DPO externe avant 2026-06-01.
**Dernière revue éditoriale** : 2026-05-12
**Date de rédaction technique** : 2026-05-13 (audit P0-1).
**Responsable du traitement** : Tim Moyence — Entrepreneur Individuel (InnovMind / Musaium).
**Coordonnées** : `tim.moyence@gmail.com` — France.
**Représentant UE** : non applicable (responsable de traitement établi en France).
**Contact DPO** : `dpo@musaium.com` (alias de redirection vers `tim.moyence@gmail.com` en attente de mandat). DPO externe à mandater — **deadline ferme : 2026-05-25** (D-7 du launch V1, audit P0-1 du 2026-05-13). Cabinet pressenti : <!-- DPO MANDATE PENDING: shortlist cabinets, sign mandate by 2026-05-25 --> à confirmer.

Le présent registre satisfait l'obligation prévue à l'article 30 du RGPD (Règlement (UE) 2016/679) ainsi que les recommandations CNIL sur la tenue du registre des activités de traitement pour les responsables de traitement.

> **Note d'audit (2026-05-13)** : ce document a fait l'objet d'un audit technique (P0-1) destiné à aligner les rubriques Art. 30 sur le code de production réel (durées de conservation cross-vérifiées contre `museum-backend/src/config/env.ts`, sous-traitants alignés sur `docs/compliance/SUBPROCESSORS.md` post-réconciliation P0-3 — DeepSeek non actif en prod EU, statut Tavily/S3/Sentry confirmé). Toutes les sections marquées `<!-- DPO ACTION REQUIRED: ... -->` requièrent une décision juridique d'un DPO mandaté avant signature. Le suivi consolidé DPIA + ROPA est tenu dans `docs/legal/DPIA_ROPA_READINESS.md`.

> **Source de vérité technique** : ce registre s'appuie sur `docs/compliance/SUBPROCESSORS.md` (inventaire Art. 28) et `docs/compliance/DATA_FLOW_MAP.md` (cartographie des flux). Toute modification de traitement (ajout de sous-traitant, changement de finalité, extension de durée) doit déclencher une mise à jour ICI dans la même PR.

---

## Index des traitements

| # | Nom du traitement | Finalité principale | Base légale (Art. 6) | Statut |
|---|---|---|---|---|
| TR-01 | Gestion des comptes utilisateurs | Authentification, identification | 6(1)(b) | Actif V1 |
| TR-02 | Chat IA conversationnel | Réponses IA aux questions visiteurs | 6(1)(a) + 6(1)(b) | Actif V1 |
| TR-03 | Traitement vocal (STT + TTS) | Mode mains libres | 6(1)(a) | Actif V1 |
| TR-04 | Géolocalisation au message | Pertinence des réponses LLM | 6(1)(a) | Actif V1 |
| TR-05 | Support client (tickets) | Résolution d'incidents utilisateurs | 6(1)(b) + 6(1)(f) | Actif V1 |
| TR-06 | Observabilité & sécurité | Détection d'erreurs, monitoring | 6(1)(f) | Actif V1 |
| TR-07 | Modération de contenu (reviews) | Conformité contenu publié | 6(1)(f) | Actif V1 |

---

## TR-01 — Gestion des comptes utilisateurs

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Gestion des comptes utilisateurs (inscription, authentification, profil) |
| **Finalité(s)** | Création de compte ; authentification email/password ou social login (Google/Apple) ; gestion du profil ; consentements RGPD ; suppression de compte (Art. 17). |
| **Base légale (Art. 6)** | **6(1)(b) uniquement** — exécution du contrat (CGU acceptées à l'inscription) (controller decision 2026-05-13, à ratifier par DPO). Le scope `tos_privacy` est conservé comme évidence d'acceptation des CGU mais N'EST PAS traité comme base légale autonome — conforme à EDPB 03/2022 qui découple consentement-contrat. |
| **Catégories de personnes concernées** | Visiteurs B2C (≥15 ans), administrateurs musée (B2B), modérateurs internes. |
| **Catégories de données** | Identifiants : email (unique), password bcrypt, identifiants Apple/Google (subject token), prénom/nom optionnels, date de naissance (DOB), date d'inscription. Sécurité : refresh tokens (hashés, `JWT_REFRESH_TTL=14d` absolu + sliding idle window `JWT_REFRESH_IDLE_WINDOW_SECONDS=86400`), MFA secrets (chiffrés AES-256-GCM via `MFA_ENCRYPTION_KEY`), API keys (hashées, `msk_*`). Audit : audit_logs hash-chain (IP anonymisée après 13 mois par `audit-ip-anonymizer.job.ts`). |
| **Destinataires** | Personnel interne autorisé (Tim Moyence). Brevo (envoi email vérification + reset password). Apple/Google (vérification ID token). |
| **Transferts hors UE** | Apple (US, DPF). Google (US, DPF). |
| **Durée de conservation** | Compte : jusqu'à suppression utilisateur (Art. 17). Refresh tokens : **14 jours absolus** (durcissement F8 2026-04-30 ; antérieurement 30j) + sliding 24 h. Token de reset mot de passe : **1 heure** (`forgotPassword.useCase.ts:49`). Audit logs : 13 mois (hot + cold) — IP anonymisée à l'expiration. **Rationale Art. 5(1)(e) (minimisation, controller decision 2026-05-13)** : 13 mois cale la rétention sur (i) lignes directrices CNIL anti-fraude (12 mois floor) + (ii) délai-type de contestation Art. 22 RGPD + (iii) cycle annuel d'audit. À ratifier par DPO ; révision si la jurisprudence resserre. |
| **Mesures de sécurité (Art. 32)** | TLS 1.3 (HSTS prod), bcrypt `BCRYPT_ROUNDS=12`, JWT access 15min + refresh rotatif 14j, cookies HttpOnly + Secure + SameSite + CSRF double-submit (`CSRF_SECRET` obligatoire en prod), MFA `admin`/`super_admin`, rate-limiting register/login/forgot-password (express-rate-limit + Redis store), input validation Zod, secrets côté FE en `expo-secure-store`. |
| **Sous-traitants associés** | SUBPROCESSORS #3 (Google), #4 (Apple), #5 (Brevo), #20 (OVH hosting), #6 (Sentry — observabilité). |

---

## TR-02 — Chat IA conversationnel

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Chat IA conversationnel — questions visiteur sur œuvres / musées + réponses générées par LLM tiers. |
| **Finalité(s)** | Fournir des réponses culturelles contextuelles via LLM tiers ; améliorer la qualité du service (audit logs, mesures qualitatives anonymisées). |
| **Base légale (Art. 6)** | **Cumul 6(1)(b) + 6(1)(a)** (aligné DPIA T1, controller decision 2026-05-13). 6(1)(b) — la conversation IA EST le service souscrit. 6(1)(a) — consentement spécifique pour le toggle optionnel `location_to_llm` (case décochée par défaut, opt-in libre). Le scope `tos_privacy` est évidence d'acceptation CGU, pas base légale autonome. |
| **Catégories de personnes concernées** | Visiteurs ≥ 15 ans ; visiteurs mineurs sous autorisation parentale (V1 : flux statique). |
| **Catégories de données** | Texte de la question, historique conversation (12 derniers messages max), `userId` interne (corrélation), `sessionId`, `museumId` éventuel, `expertiseLevel` (tag soft), images uploadées (vision, EXIF stripé via `sharp().rotate()` re-encode), audio (traité dans TR-03). |
| **Destinataires** | LLM provider sélectionné par configuration `LLM_PROVIDER` (défaut `openai`) : OpenAI (par défaut), Google (option activable), Deepseek (fournisseur alternatif **non activé en prod EU** par configuration — voir P0-3 réconciliation 2026-05-12). |
| **Transferts hors UE** | OpenAI US (SCC 2021/914 + DPF). **Décision controller 2026-05-13 : OpenAI EU data zone non activée pour V1**, ré-évaluation post-revenue B2B (rationale : SCC + DPF couvrent le risque résiduel à 5k MAU ; coûts d'activation > bénéfice tant que volume reste sous le palier B2B). Google US (SCC + DPF). Deepseek CN : **pas d'adéquation, non activé en prod EU**. |
| **Durée de conservation** | Messages côté Musaium : **purge automatique 180 jours** (`CHAT_PURGE_RETENTION_DAYS=180`, cron quotidien `chat-purge-daily`) — effacement anticipé sur demande Art. 17 via `/api/auth/account/delete`. Côté LLM tiers : OpenAI 30j max (DPA), Google 60j max (DPF). Deepseek : non utilisé en prod EU. |
| **Mesures de sécurité** | Input/output guardrails (`art-topic-guardrail`), circuit breaker LLM-Guard sidecar fail-CLOSED (ADR-047, 2026-05-12) + inflight semaphore + audit payload, prompt isolation (system avant user, boundary marker `[END OF SYSTEM INSTRUCTIONS]`), sanitization Unicode NFC + zero-width sur champs user-controlled (`sanitizePromptInput()`), LLM cache layer (`LlmCacheServiceImpl` ADR-036), `LLM_PROVIDER=deepseek` bloqué en prod EU par configuration. AI Act Art. 50 disclosure visible sur 3 surfaces. |
| **Sous-traitants associés** | SUBPROCESSORS #1 (OpenAI — défaut), #3 (Google — alternative), #2 (Deepseek — alternative non activée en prod EU). |

---

## TR-03 — Traitement vocal (STT entrant + TTS sortant)

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Mode vocal : transcription des questions parlées (STT) + synthèse vocale des réponses (TTS). |
| **Finalité(s)** | Permettre l'usage mains libres en visite ; améliorer l'accessibilité (déficiences motrices, dyslexie). |
| **Base légale (Art. 6)** | 6(1)(a) consentement explicite (permission micro iOS/Android au premier appel). |
| **Catégories de personnes concernées** | Visiteurs choisissant le mode vocal (~30% des messages V1 estimés). |
| **Catégories de données** | Buffer audio entrant (MP3/M4A ≤12 Mo, en mémoire uniquement) ; texte transcrit (traité comme TR-02 ensuite) ; buffer audio TTS sortant (MP3, persisté S3 sous `ChatMessage.audioUrl`). |
| **Destinataires** | OpenAI : `gpt-4o-mini-transcribe` (STT) + `gpt-4o-mini-tts` (TTS). |
| **Transferts hors UE** | OpenAI US (SCC + DPF). |
| **Durée de conservation** | Buffer entrée : durée de la requête HTTP (jamais persisté). Audio sortant TTS : aligné sur le message parent (purge `CHAT_PURGE_RETENTION_DAYS=180` ; effacement Art. 17 supprime URL S3 + objet). **Vérifié audit P0-1 (2026-05-13)** : la cascade S3 est orchestrée par `chat-purge.job.ts:23-28` (option `mediaPurger`) câblé en prod via `chat-purge-cron.registrar.ts` vers `chat-media-purger.ts:7,108-158` qui appelle `deleteObjectsBatch` (`s3-operations.ts`). Le résultat de la purge expose `failedMedia` pour traçabilité. Défense en profondeur : `s3-orphan-purge.job.ts` ratisse les orphelins indépendamment. |
| **Mesures de sécurité** | TLS 1.3 obligatoire, certificate pinning iOS (R17), pas de persistance du buffer entrant, OpenAI DPA interdit usage entrées pour entraînement client. |
| **Sous-traitants associés** | SUBPROCESSORS #1 (OpenAI STT + TTS), #8 (S3 object storage pour audio sortant — endpoint prod `s3.eu-west-3.amazonaws.com` AWS Paris, résolu 2026-05-12). |

---

## TR-04 — Géolocalisation au message

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Résolution de la position du visiteur (coarse, ville/pays) pour améliorer la pertinence des réponses. |
| **Finalité(s)** | Détecter le musée actuel (in-museum mode, cache 20min) ; enrichir les réponses LLM avec un contexte de localisation coarse hors-musée (city-level, no cache). |
| **Base légale (Art. 6)** | 6(1)(a) consentement explicite (toggle `location_to_llm` persisté dans `user_consents`). Révocable à tout moment via le profil. |
| **Catégories de personnes concernées** | Visiteurs ayant explicitement activé le toggle `location_to_llm`. |
| **Catégories de données** | Lat/lng brutes (arrondies côté serveur, NON persistées) ; ville + pays résolus via Nominatim (persistés sous `ChatMessage.locationContext`) ; `museum_id` si in-museum. |
| **Destinataires** | Nominatim (reverse geocoding), Overpass API (POI lookup), OpenAI/Google (transmis dans le prompt LLM sous forme ville/pays uniquement). |
| **Transferts hors UE** | Nominatim UK + DE mirrors. **Adéquation UK : Décision (UE) 2025/2531 du 17 décembre 2025 renouvelle 2021/1772 jusqu'au 27 décembre 2031** (sources : EDPB Opinions 06/2025 + 26/2025 favorables ; surveillance continue sur Data Protection and Digital Information Act 2024 UK — vérifié 2026-05-13). Overpass DE (EU). OpenAI/Google : transmis sous forme déjà coarsifiée, US (DPF). |
| **Durée de conservation** | Lat/lng : jamais persisté (rounding serveur dans `LocationResolver`, payload jeté en fin de requête). Coarse (ville/pays) : durée du message parent (purge `CHAT_PURGE_RETENTION_DAYS=180`), effacement Art. 17 anticipé. |
| **Mesures de sécurité** | Arrondi côté serveur dans `LocationResolver` (in-museum cache 20 min, city-level no-cache), sanitization avant prompt, consentement révocable à tout moment via le profil (toggle `location_to_llm` dans `user_consents`). |
| **Sous-traitants associés** | SUBPROCESSORS #12 (Nominatim), #13 (Overpass), #1 (OpenAI), #3 (Google). |

---

## TR-05 — Support client (tickets)

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Gestion des tickets de support utilisateur. |
| **Finalité(s)** | Résoudre les incidents fonctionnels, traiter les demandes Art. 15 (export), Art. 17 (effacement). |
| **Base légale (Art. 6)** | 6(1)(b) exécution du contrat. 6(1)(f) intérêt légitime (sécurité). |
| **Catégories de personnes concernées** | Utilisateurs ayant ouvert un ticket. |
| **Catégories de données** | Email, contenu du ticket (message + pièces jointes texte), statut, audit-trail des actions modérateur. |
| **Destinataires** | Modérateurs internes (rôles `moderator`, `admin`, `super_admin`). Brevo pour envoi des réponses email. |
| **Transferts hors UE** | Aucun (Brevo FR EU). |
| **Durée de conservation** | **365 jours après création** (`RETENTION_SUPPORT_TICKETS_DAYS=365`, cron quotidien `15 3 * * *`), puis purge automatique. **Rationale Art. 5(1)(e) (controller decision 2026-05-13)** : 365j couvre une fenêtre de réouverture utilisateur d'un an (cycle saisonnier visite culturelle) tout en restant nettement sous la prescription civile générale FR (5 ans, Code civil Art. 2224) — preuve recompose-able via export DSAR Art. 15 dans l'intervalle. À ratifier par DPO. |
| **Mesures de sécurité** | Accès gated par rôle (RBAC), MFA obligatoire admin/super_admin, audit-chain hash-link. |
| **Sous-traitants associés** | SUBPROCESSORS #5 (Brevo). |

---

## TR-06 — Observabilité & sécurité

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Détection d'erreurs applicatives + monitoring de performance + audit-chain. |
| **Finalité(s)** | Garantir la fiabilité du service, détecter les incidents de sécurité, fournir les éléments en cas d'enquête (Art. 32 RGPD). |
| **Base légale (Art. 6)** | 6(1)(f) intérêt légitime — sécurité + fiabilité du service. |
| **Catégories de personnes concernées** | Tous les utilisateurs (de manière indirecte, via les events Sentry). |
| **Catégories de données** | Stack traces, request metadata (URL, méthode, status, headers post-scrubbing), user-agent, `userId` hashé (8-char fingerprint, pas l'email en clair), payloads scrubés (tokens/passwords/secrets/emails redactés, emails → SHA-256 fingerprint). |
| **Destinataires** | Sentry (EU ingestion `*.eu.sentry.io` confirmée 2026-04-26) ; OTLP collector éventuel (si activé, opérateur-contrôlé). |
| **Transferts hors UE** | Sentry EU region confirmée. Aucun transfert hors UE par défaut. |
| **Durée de conservation** | Sentry : 30j events / 90j attachments (plan). Logs structurés Pino : **rétention logs configurée côté OVH le 2026-05-27** (operator-confirmed). **Durée exacte à enregistrer dans `docs/OPS_DEPLOYMENT.md`** (operator à confirmer). Aucune claim de conformité plus stricte que la valeur réellement enforced côté OVH. |
| **Mesures de sécurité** | PII scrubber triplicé `sentry-scrubber.ts` × BE/FE/Web aligné post-2026-05-12 (P1-1 : dédup via `packages/musaium-shared` en post-launch), email→SHA-256 fingerprint, breadcrumb drop sur paths auth-adjacents. |
| **Sous-traitants associés** | SUBPROCESSORS #6 (Sentry), #7 (OTLP optionnel), #9 (Better Stack uptime). |

---

## TR-07 — Modération de contenu (reviews)

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Modération des reviews utilisateurs publiées sur la galerie d'œuvres. |
| **Finalité(s)** | Garantir la conformité aux CGU + lois applicables (diffamation, contenu illégal, etc.). |
| **Base légale (Art. 6)** | 6(1)(f) intérêt légitime — sécurité éditoriale + responsabilité éditeur. |
| **Catégories de personnes concernées** | Utilisateurs publiant des reviews. |
| **Catégories de données** | Texte de review, `userId`, timestamp, statut (`pending`, `approved`, `rejected`), motif de rejet le cas échéant. |
| **Destinataires** | Modérateurs internes (RBAC), service email pour notification de décision (opt-in `notifyOnReviewModeration`). |
| **Transferts hors UE** | Aucun (Brevo EU). |
| **Durée de conservation** | Reviews approuvées : durée du compte (effacement Art. 17). Reviews rejetées : **30 jours** (`RETENTION_REVIEWS_REJECTED_DAYS=30`). Reviews en attente : **60 jours** (`RETENTION_REVIEWS_PENDING_DAYS=60`) — au-delà, purge automatique pour éviter l'accumulation. **Rationale Art. 5(1)(e) (controller decision 2026-05-13)** : 30j cale la rétention modération sur le délai usuel de contestation utilisateur (Art. 22 RGPD + CGU Musaium). Au-delà, la preuve recompose-able via `audit_log` (13 mois) garde la trace de la décision de modération elle-même ; le contenu rejeté n'a pas vocation à être conservé indéfiniment. À ratifier par DPO. |
| **Mesures de sécurité** | RBAC, audit-chain hash-link, guardrail-based pre-flag pour les contenus suspects. |
| **Sous-traitants associés** | SUBPROCESSORS #5 (Brevo notif). |

---

## Cycle de revue du ROPA

| Trigger | Action |
|---|---|
| Trimestriel | Revue de l'index + vérification d'alignement avec `SUBPROCESSORS.md`. |
| Nouveau sous-traitant | Ajout dans SUBPROCESSORS + mise à jour TR concerné dans la même PR. |
| Changement de finalité | Création d'un nouveau TR ou amendement explicite du TR existant. |
| Audit annuel | Revue complète + signature DPO. |

---

## Annexes

- `docs/compliance/SUBPROCESSORS.md` — ledger Art. 28.
- `docs/compliance/DATA_FLOW_MAP.md` — cartographie technique.
- `docs/legal/DPIA.md` — analyse d'impact des traitements à risque élevé (T1/T2/T3 = TR-02/TR-03/TR-04).
- `docs/legal/DPIA_ROPA_READINESS.md` — tracking consolidé DPIA + ROPA (audit P0-1, 2026-05-13).

---

## Signature

<!-- DPO ACTION REQUIRED: ce bloc reste vide tant que la signature DPO n'est pas apposée. Aucune signature ne doit être pré-remplie par un agent. -->

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Responsable du traitement | Tim Moyence (InnovMind / Musaium) | _________ | _________ |
| DPO externe | _________ | _________ | _________ |

**Ordre recommandé** : DPO signe en premier (avis Art. 39), responsable du traitement contresigne. La date cible de signature complète est **2026-05-26** (J-6 avant launch V1 2026-06-01) pour laisser une fenêtre de remédiation en cas de remarque substantielle.

---

**END ROPA v1.0 DRAFT — Awaiting DPO sign-off.**
