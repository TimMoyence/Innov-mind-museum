# Registre des Activités de Traitement (ROPA — RGPD Art. 30)

**Statut** : DRAFT v1.0 — à valider par DPO externe avant 2026-06-01.
**Dernière revue** : 2026-05-12
**Responsable du traitement** : Tim Moyence — Entrepreneur Individuel (InnovMind / Musaium).
**Coordonnées** : `tim.moyence@gmail.com` — France.
**Représentant UE** : non applicable (responsable de traitement établi en France).
**DPO** : externe à mandater, contact prévu `dpo@musaium.app` (TBD).

Le présent registre satisfait l'obligation prévue à l'article 30 du RGPD (Règlement (UE) 2016/679) ainsi que les recommandations CNIL sur la tenue du registre des activités de traitement pour les responsables de traitement.

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
| **Base légale (Art. 6)** | 6(1)(b) — exécution du contrat (CGU acceptées à l'inscription). 6(1)(a) — consentement pour le `tos_privacy` enregistré au scope `user_consents`. |
| **Catégories de personnes concernées** | Visiteurs B2C (≥15 ans), administrateurs musée (B2B), modérateurs internes. |
| **Catégories de données** | Identifiants : email (unique), password bcrypt, identifiants Apple/Google (subject token), prénom/nom optionnels, date de naissance (DOB), date d'inscription. Sécurité : refresh tokens (hashés), MFA secrets (chiffrés), API keys (hashées, `msk_*`). Audit : audit_logs hash-chain. |
| **Destinataires** | Personnel interne autorisé (Tim Moyence). Brevo (envoi email vérification + reset password). Apple/Google (vérification ID token). |
| **Transferts hors UE** | Apple (US, DPF). Google (US, DPF). |
| **Durée de conservation** | Compte : jusqu'à suppression utilisateur (Art. 17). Refresh tokens : 30j. Reset tokens : 24h. Audit logs : 13 mois (hot + cold). |
| **Mesures de sécurité (Art. 32)** | TLS 1.3, bcrypt rounds=12, JWT 15min + refresh rotatif, MFA `admin`/`super_admin`, rate-limiting register/login (express-rate-limit + Redis), input validation Zod, secrets stockés en `expo-secure-store` côté FE. |
| **Sous-traitants associés** | SUBPROCESSORS #3 (Google), #4 (Apple), #5 (Brevo), #20 (OVH hosting), #6 (Sentry — observabilité). |

---

## TR-02 — Chat IA conversationnel

| Rubrique Art. 30 | Contenu |
|---|---|
| **Nom du traitement** | Chat IA conversationnel — questions visiteur sur œuvres / musées + réponses générées par LLM tiers. |
| **Finalité(s)** | Fournir des réponses culturelles contextuelles via LLM tiers ; améliorer la qualité du service (audit logs, mesures qualitatives anonymisées). |
| **Base légale (Art. 6)** | 6(1)(a) consentement (`tos_privacy` au signup ; `location_to_llm` si géo activée). 6(1)(b) exécution du service. |
| **Catégories de personnes concernées** | Visiteurs ≥ 15 ans ; visiteurs mineurs sous autorisation parentale (V1 : flux statique). |
| **Catégories de données** | Texte de la question, historique conversation (12 derniers messages max), `userId` interne (corrélation), `sessionId`, `museumId` éventuel, `expertiseLevel` (tag soft), images uploadées (vision), audio (traité dans TR-03). |
| **Destinataires** | LLM provider sélectionné : OpenAI (par défaut), Google (option), Deepseek (désactivé en prod EU). |
| **Transferts hors UE** | OpenAI US (SCC 2021/914 + DPF, OpenAI EU data zone disponible mais pas activée par défaut). Google US (SCC + DPF). Deepseek CN : **pas d'adéquation, désactivé en prod EU**. |
| **Durée de conservation** | Messages : durée de vie du compte (effacement Art. 17). Côté LLM tiers : OpenAI 30j max (DPA), Google 60j max (DPF). |
| **Mesures de sécurité** | Input/output guardrails (`art-topic-guardrail`), prompt isolation (system avant user, boundary marker), sanitization Unicode + zero-width sur champs user-controlled, LLM cache layer (`LlmCacheServiceImpl` ADR-036), `LLM_PROVIDER=deepseek` bloqué en prod EU par configuration. AI Act Art. 50 disclosure visible sur 3 surfaces. |
| **Sous-traitants associés** | SUBPROCESSORS #1 (OpenAI), #2 (Deepseek — désactivé), #3 (Google). |

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
| **Durée de conservation** | Buffer entrée : durée de la requête HTTP (jamais persisté). Audio sortant TTS : durée du compte, effacement Art. 17 (URL S3 supprimée + cleanup objet). |
| **Mesures de sécurité** | TLS 1.3 obligatoire, certificate pinning iOS (R17), pas de persistance du buffer entrant, OpenAI DPA interdit usage entrées pour entraînement client. |
| **Sous-traitants associés** | SUBPROCESSORS #1 (OpenAI STT + TTS), #8 (S3 object storage pour audio sortant). |

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
| **Transferts hors UE** | Nominatim UK + DE mirrors (post-Brexit UK ; adéquation continue à confirmer). Overpass DE (EU). OpenAI/Google : transmis sous forme déjà coarsifiée, US (DPF). |
| **Durée de conservation** | Lat/lng : jamais persisté. Coarse (ville/pays) : durée du message, effacement Art. 17. |
| **Mesures de sécurité** | Arrondi côté serveur dans `LocationResolver`, sanitization avant prompt, consentement révocable. |
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
| **Durée de conservation** | 24 mois après clôture du ticket, puis purge automatique. |
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
| **Catégories de données** | Stack traces, request metadata (URL, méthode, status, headers post-scrubbing), user-agent, `userId` hashé (8-char fingerprint, pas l'email en clair), payloads scrubés (tokens/passwords/secrets redactés). |
| **Destinataires** | Sentry (EU ingestion `*.eu.sentry.io`) ; OTLP collector éventuel (si activé, opérateur-contrôlé). |
| **Transferts hors UE** | Sentry EU region confirmée. Aucun transfert hors UE. |
| **Durée de conservation** | Sentry : 30j events / 90j attachments (plan). Logs structurés : 90j hot + 13 mois cold (audit). |
| **Mesures de sécurité** | PII scrubber single-source-of-truth (`sentry-scrubber.ts` × BE/FE/Web aligné post-2026-05-12), email→SHA-256 fingerprint, breadcrumb drop sur paths auth-adjacents. |
| **Sous-traitants associés** | SUBPROCESSORS #6 (Sentry), #7 (OTLP), #9 (Better Stack uptime). |

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
| **Durée de conservation** | Reviews approuvées : durée du compte. Reviews rejetées : 12 mois (preuve de modération). |
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

---

**END ROPA v1.0 DRAFT — Awaiting DPO sign-off.**
