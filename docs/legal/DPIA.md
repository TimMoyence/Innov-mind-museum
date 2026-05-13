# Analyse d'impact sur la protection des données (DPIA)

**Statut** : DRAFT — à valider par DPO externe avant le launch V1 (2026-06-01).
**Version** : 1.0 (initiale).
**Date de rédaction technique** : 2026-05-13 (audit P0-1).
**Responsable du traitement** : Tim Moyence — Entrepreneur Individuel, opérant Musaium / InnovMind, France.
**Contact responsable** : `tim.moyence@gmail.com`.
**Contact DPO** : `dpo@musaium.app` (alias de redirection vers `tim.moyence@gmail.com` en attente de mandat). DPO externe à mandater — **deadline ferme : 2026-05-25** (D-7 du launch V1, audit P0-1 du 2026-05-13). Cabinet pressenti : <!-- DPO MANDATE PENDING: shortlist cabinets, sign mandate by 2026-05-25 --> à confirmer.
**Cycle de revue** : annuel, ou à chaque changement matériel du traitement.

> **Note d'audit (2026-05-13)** : ce document a fait l'objet d'un audit technique (P0-1) destiné à aligner le contenu factuel sur le code de production réel (durées de conservation, mesures TOM effectivement déployées, statut DeepSeek post-réconciliation P0-3). Toutes les sections marquées `<!-- DPO ACTION REQUIRED: ... -->` requièrent une décision juridique d'un DPO mandaté avant signature. Les sections techniques (T1/T2/T3 — colonnes Durée, Mesures, Destinataires) ont été cross-vérifiées contre `museum-backend/src/config/env.ts`, `museum-backend/src/shared/audit/`, `docs/compliance/SUBPROCESSORS.md`.

> Cette DPIA suit la trame CNIL « Guide PIA — Software » (version 2018, mise à jour 2024) et le formalisme du RGPD Art. 35. Elle couvre **3 traitements** identifiés comme « susceptibles d'engendrer un risque élevé pour les droits et libertés des personnes physiques » au titre de l'Art. 35-3 :
> 1. **T1 — Chat IA conversationnel** (LLM tiers + historique de conversation)
> 2. **T2 — Traitement vocal** (STT entrant + TTS sortant)
> 3. **T3 — Géolocalisation au message** (résolution coarse + reverse geocoding)
>
> Les 3 traitements déclenchent CUMULATIVEMENT 3 critères CNIL/CEPD (lignes directrices WP248) :
> - **Traitement à grande échelle** (audience B2C visiteur + B2B musée + visites scolaires)
> - **Données concernant des mineurs** (audience scolaire — voir T1.3 ci-dessous)
> - **Utilisation innovante** (IA générative LLM tiers — AI Act EU 2024/1689 en vigueur 2026-08-02)

---

## 0. Pourquoi une DPIA est-elle requise ?

**Art. 35 RGPD** impose une DPIA lorsque le traitement est « susceptible d'engendrer un risque élevé ». La liste CNIL des traitements obligatoirement soumis à DPIA inclut :

- **Profilage / décisions automatisées à effet significatif** — non applicable directement, mais la frontière est mince car le LLM oriente l'expérience utilisateur (recommandations de questions de suivi, choix lexicaux).
- **Surveillance systématique à grande échelle** — non applicable.
- **Traitement de données de mineurs à grande échelle** — applicable (audience scolaire prévue).
- **Innovation technologique** — applicable (LLM tiers, voix, géolocalisation per-message simultanées).
- **Données de localisation utilisées pour identifier la position** — applicable (T3).

Trois critères WP248 cumulés → DPIA obligatoire avant la mise en service.

---

## T1 — Chat IA conversationnel (texte)

### T1.1 — Description du traitement

| Champ | Valeur |
|---|---|
| **Finalité** | Permettre au visiteur de poser des questions en langage naturel sur une œuvre, un monument ou un contexte muséal ; recevoir une réponse synthétique générée par un LLM tiers (OpenAI / Google / Deepseek). |
| **Données traitées** | Texte de la question utilisateur, historique des 12 derniers messages, identifiant de session, identifiant utilisateur (numéro interne), métadonnées (timestamp, locale, expertiseLevel). |
| **Catégories particulières** | Aucune n'est *collectée par design*. L'utilisateur PEUT poser des questions touchant à des sujets sensibles (santé, religion, opinions politiques au sujet d'une œuvre) ; cette saisie est filtrée en amont (`art-topic-guardrail`) mais non systématiquement bloquée. |
| **Personnes concernées** | Visiteurs B2C (adultes ≥15 ans après l'age-gate), utilisateurs B2B musée, élèves dans le cadre de visites scolaires (autorisation parentale requise). |
| **Volume estimé** | V1 : ~5k utilisateurs actifs mensuels (estimation). V1.1 : 50k MAU. Volume LLM tokens / mois : ~3M (V1). |
| **Durée de conservation** | Messages chat côté Musaium : **purge automatique 180 jours** (`CHAT_PURGE_RETENTION_DAYS=180`, cron quotidien `chat-purge-daily`) — effacement anticipé sur demande Art. 17. Historique LLM côté tiers : OpenAI = 30j max (DPA), Google = 60j max (DPF), Deepseek = non utilisé en prod EU (gating par défaut `LLM_PROVIDER=openai`). |
| **Base légale (Art. 6)** | **Cumul 6(1)(b) + 6(1)(a)** retenu (controller decision, 2026-05-13, à ratifier par DPO). 6(1)(b) exécution du contrat (la conversation IA EST le service souscrit). 6(1)(a) consentement pour le toggle optionnel `location_to_llm` (case décochée par défaut, opt-in libre). Le scope `tos_privacy` est traité comme évidence d'acceptation des CGU (pas comme base légale autonome) — conforme à EDPB 03/2022 qui découplage consentement-contrat. |
| **Destinataires / sous-traitants** | Voir `docs/compliance/SUBPROCESSORS.md` entries #1 (OpenAI, fournisseur LLM par défaut), #3 (Google, alternative activable), #2 (Deepseek, fournisseur alternatif **non activé en prod EU** par configuration `LLM_PROVIDER=openai`). Pas de transfert vers d'autres tiers. |
| **Transferts hors UE** | OpenAI : US ; SCC 2021/914 + DPF maintenus pré-launch. **Décision controller 2026-05-13 : OpenAI EU data zone non activée pour V1**, ré-évaluation post-revenue B2B (rationale : SCC + DPF couvrent le risque résiduel ; coûts d'activation > bénéfice à 5k MAU). Google : US ; SCC + DPF. Deepseek : Chine ; **pas d'adéquation, non activé en prod EU** (réconciliation audit P0-3 — voir aussi politique de confidentialité à mettre à jour). |

### T1.2 — Évaluation des risques (échelle CNIL 1=négligeable, 4=maximal)

| Risque | Vraisemblance | Gravité | Mesures actuelles | Mesures complémentaires (avant 2026-06-01) |
|---|---|---|---|---|
| **Accès illégitime aux conversations** (mesures de protection) | 2 | 3 | Chiffrement TLS in-transit, chiffrement at-rest (PG + S3), accès admin loggé (`audit_logs` hash-chain), MFA pour rôles admin | Renforcement R16 MFA pour `super_admin` (déjà déployé). |
| **Modification non désirée** des messages stockés | 1 | 2 | Audit-chain hash-link sur 13 mois, sauvegardes PG quotidiennes | OK |
| **Disparition de données** (effacement involontaire) | 2 | 2 | Sauvegardes quotidiennes PG, soft-delete sur les messages | Plan de reprise après sinistre à formaliser (RTO/RPO). |
| **Hallucination LLM produisant un contenu offensant ou diffamatoire** | 3 | 3 | Guardrails entrée + sortie (`art-topic-guardrail`), prompt isolation structurée, AI Act disclosure (Art. 50) | OK — bake en prod ≥7j post-launch ; review mensuelle des logs guardrail. |
| **Fuite de prompt via injection** (prompt injection adversarial) | 2 | 3 | Boundary marker `[END OF SYSTEM INSTRUCTIONS]`, sanitization Unicode + zero-width, position user content après system | OK — surveiller via Sentry sur le guardrail output. |

### T1.3 — Risque spécifique mineurs

Audience scolaire prévue : la DPIA reconnaît un risque accru concernant les utilisateurs de moins de 15 ans (majorité numérique française — Loi n° 2023-566 du 7 juillet 2023, codifiant la majorité numérique à 15 ans ; voir également CNIL Délibération n° 2021-069 du 3 juin 2021 — **NB** : l'ancienne référence à la « Délibération 2021-018 » dans les drafts antérieurs était erronée et a été corrigée le 2026-05-13 suite à l'audit P0-1).

**Mesures actives** :
- Age-gate à l'inscription (champ `dateOfBirth`, calcul d'âge côté serveur, rejet 422 `MINOR_PARENTAL_CONSENT_REQUIRED` si < 15 ans).
- Disclosure AI Act Art. 50 affichée sur écran d'accueil + footer chat permanent.
- Politique de confidentialité explicite (paragraphe « 11. Enfants et mineurs ») renvoyant à un flux de consentement parental (V1 : screen statique « contacter l'établissement » ; V1.1 : flux d'attestation parentale par email).

**Risque résiduel** : un mineur peut frauduleusement déclarer une date de naissance ≥ 15 ans. Mesure de mitigation : enregistrement de la DOB déclarée + audit-chain `MINOR_REGISTRATION_BLOCKED` ; revue annuelle des incidents.

---

## T2 — Traitement vocal (STT entrant + TTS sortant)

### T2.1 — Description du traitement

| Champ | Valeur |
|---|---|
| **Finalité** | Permettre au visiteur de poser une question oralement (mains libres en visite) et d'entendre la réponse en TTS. |
| **Données traitées** | Buffer audio de la question (≤12 Mo, MP3/M4A), texte transcrit, buffer audio de la réponse TTS (MP3 buffer + URL S3 persistée sous `ChatMessage.audioUrl`). |
| **Catégories particulières** | La voix est une donnée biométrique POTENTIELLE (RGPD Art. 9-1) si exploitée pour identifier la personne. **Musaium n'effectue PAS d'identification vocale** ; la voix sert uniquement à la transcription puis est immédiatement détruite côté serveur (buffer en mémoire, pas de persistance audio brut). |
| **Personnes concernées** | Idem T1. |
| **Volume estimé** | ~30% des messages V1 utiliseront le mode vocal (estimation). Volume audio : 50k MAU × 5 msg/mois × 30% × 8s × 32kbps = ~800 Go/mois ; non persisté. |
| **Durée de conservation** | Buffer entrée : strictement durée de la requête (≤30s). Audio TTS sortant : conservé sous `ChatMessage.audioUrl` pour replay (durée du compte). Effacement sur demande Art. 17. |
| **Base légale (Art. 6)** | 6(1)(a) consentement (permission micro iOS/Android demandée explicitement à la première utilisation). |
| **Destinataires / sous-traitants** | OpenAI uniquement pour STT (`gpt-4o-mini-transcribe`) + TTS (`gpt-4o-mini-tts`) — DPA + SCC + DPF. |
| **Transferts hors UE** | OpenAI US (DPF actif). Option EU data zone OpenAI activable post-launch. |

### T2.2 — Évaluation des risques

| Risque | Vraisemblance | Gravité | Mesures | Mesures complémentaires |
|---|---|---|---|---|
| **Récupération d'un buffer audio en clair** (man-in-the-middle) | 1 | 3 | TLS 1.3 obligatoire, certificate pinning iOS (R17), Authorization Bearer JWT obligatoire | OK |
| **Utilisation détournée de la voix (deepfake)** | 1 | 4 | Pas de persistance du buffer entrant, OpenAI DPA interdit l'usage des inputs pour l'entraînement client | Documenter dans la politique de confidentialité (✅ section 12 AI Act). |
| **Identification involontaire d'un mineur via la voix** | 2 | 3 | Pas d'identification biométrique active ; transcription only | Audit annuel des prompts pour s'assurer qu'aucune fonctionnalité d'identification vocale n'est introduite. |

---

## T3 — Géolocalisation au message

### T3.1 — Description du traitement

| Champ | Valeur |
|---|---|
| **Finalité** | Améliorer la pertinence des réponses LLM en intra-musée (œuvre regardée = œuvre du musée géolocalisé) et hors-musée (recommandations « près de vous »). |
| **Données traitées** | Latitude/longitude (précision ~1km, déjà arrondie côté serveur via `LocationResolver`), résolution coarse via Nominatim (ville + pays uniquement, jamais d'adresse précise), identifiant musée si l'utilisateur est in-museum (cache 20min). |
| **Catégories particulières** | Aucune. La géolocalisation coarse n'est pas une donnée de catégorie particulière au sens Art. 9, mais reste sensible (peut révéler des habitudes de visite). |
| **Personnes concernées** | Idem T1. |
| **Volume estimé** | ~70% des messages V1 incluront la géolocalisation (estimation visites mobiles). |
| **Durée de conservation** | Coordonnées brutes : non stockées (jamais persistées). Résolution coarse (ville/pays) : persistée dans `ChatMessage.locationContext` jusqu'à effacement du message. |
| **Base légale (Art. 6)** | 6(1)(a) consentement (toggle explicite `location_to_llm` dans `user_consents`). |
| **Destinataires / sous-traitants** | Nominatim (OpenStreetMap, EU/UK), Overpass API (POI lookup), OpenAI/Google si transmis dans le prompt. Voir SUBPROCESSORS #12, #13, #1, #3. |
| **Transferts hors UE** | Nominatim UK (post-Brexit, en attente d'adéquation continue) ; Overpass DE (EU). OpenAI/Google reçoivent uniquement la ville/pays — pas de coordonnées. |

### T3.2 — Évaluation des risques

| Risque | Vraisemblance | Gravité | Mesures | Mesures complémentaires |
|---|---|---|---|---|
| **Reconstitution du trajet d'un mineur** (corrélation messages + géo) | 2 | 3 | Coords jamais persistées en clair, résolution coarse uniquement, consentement explicite révocable | Audit annuel : vérifier l'absence de persistance accidentelle des coords brutes. |
| **Transmission à un LLM tiers d'une localisation précise** | 1 | 3 | Sanitization stricte avant prompt (ville/pays only), pas de lat/lng dans le `locationContext` final | OK |
| **Inférence sensible (visites religieuses, médicales)** | 2 | 2 | Pas de traitement à des fins de profilage ; usage limité à la pertinence de la réponse en cours | OK |

---

## 4. Mesures techniques et organisationnelles (TOM) communes

Pour les 3 traitements (toutes vérifiées en code 2026-05-13, voir `museum-backend/src/config/env.ts` + `src/shared/security/` + `src/shared/audit/`) :

1. **Chiffrement** : TLS 1.3 in-transit (HSTS production), AES-256 at-rest (PG + S3 via provider), bcrypt pour mots de passe (`BCRYPT_ROUNDS=12`, `museum-backend/src/shared/security/bcrypt.ts:2`).
2. **Contrôle d'accès** :
   - JWT access token TTL **15 min** (`JWT_ACCESS_TTL=15m`).
   - Refresh token TTL **14 jours absolus** (`JWT_REFRESH_TTL=14d`, durci de 30j → 14j en F8 2026-04-30).
   - Sliding idle window **24 h** sur refresh (`JWT_REFRESH_IDLE_WINDOW_SECONDS=86400`).
   - MFA TOTP obligatoire rôles `admin` + `super_admin`, secrets chiffrés AES-256-GCM (`MFA_ENCRYPTION_KEY`).
   - API-keys hashées (`msk_*`).
   - Token de reset mot de passe : **1 heure** (`forgotPassword.useCase.ts:49`).
3. **Cookies + CSRF (F7)** : access token et refresh token en cookies HttpOnly + Secure + SameSite ; CSRF double-submit token (`CSRF_SECRET` obligatoire en prod, distinct des autres secrets — `env.production-validation.ts:184-201`).
4. **Audit-chain** : hash-link sur les actions admin et flux GDPR (export, deletion, consent grant/revoke). **IP anonymisée après 13 mois** par cron quotidien (`audit-ip-anonymizer.job.ts:62`, intervalle PG `13 months`).
5. **PII scrubbing** : Sentry events filtrés par `sentry-scrubber.ts` (BE + FE + Web — à dédupliquer post-launch via `packages/musaium-shared`, voir P1-1). Email → SHA-256 fingerprint, query keys + body fields password/token/secret/refresh/authorization/cookie/email redactés.
6. **DSAR ready** : export (Art. 15) via `/api/auth/me/export` (`exportUserData.useCase.ts`) + suppression (Art. 17) via `/api/auth/account/delete` (`deleteAccount.useCase.ts`), SLA cible 7j.
7. **Sanitization image** : EXIF strip systématique via `sharp().rotate()` re-encodage avant toute transmission au LLM tiers (`image-processing.service.ts:47`).
8. **Sanitization texte** : Unicode NFC + suppression zero-width + truncation sur les champs user-controlled injectés en prompt système (`sanitizePromptInput()`), boundary marker `[END OF SYSTEM INSTRUCTIONS]` séparant system + user.
9. **Backup & DR** : snapshots PG quotidiens chiffrés (rétention provider), hébergement OVH (FR/EU) — voir `docs/OPS_DEPLOYMENT.md`. **Cible DR (controller decision 2026-05-13)** : RTO 24h / RPO 24h, aligné sur la cadence des snapshots OVH. Premier test de restore programmé avant le launch V1 (2026-06-01) — résultat à archiver dans `docs/OPS_DEPLOYMENT.md` § restore-drill.
10. **Subprocessors** : ledger `docs/compliance/SUBPROCESSORS.md` à jour (20 entrées), revue trimestrielle. P0-3 (audit 2026-05-12) : DeepSeek listé comme alternative non activée en prod EU, non comme sous-traitant actif.
11. **AI Act Art. 50** : disclosure générative implémentée sur les 3 surfaces (mobile, web, privacy policy) — voir `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`.
12. **Guardrails** : input + output filter sur conversations chat (`art-topic-guardrail.ts`) ; circuit breaker sur LLM-Guard sidecar fail-CLOSED (ADR-047, 2026-05-12) ; inflight semaphore + audit payload.
13. **Rate-limiting** : `express-rate-limit` + store Redis sur endpoints sensibles (register/login/forgot-password) — `museum-backend/src/helpers/middleware/rate-limit.middleware.ts`.
14. **Retention crons** (pré-launch V1, always-on) :
    - Chat purge : `CHAT_PURGE_RETENTION_DAYS=180` (cron quotidien 04:00 UTC).
    - Tickets support : `RETENTION_SUPPORT_TICKETS_DAYS=365`.
    - Reviews rejetées : `RETENTION_REVIEWS_REJECTED_DAYS=30`.
    - Reviews pending : `RETENTION_REVIEWS_PENDING_DAYS=60`.
    - Art keywords : `RETENTION_ART_KEYWORDS_DAYS=90`.
    - Enrichment artefacts : `ENRICHMENT_HARD_DELETE_AFTER_DAYS=180`.
15. **Logging** : structured JSON Pino, request-id correlation propagé sur 193 sites (cf. audit 2026-05-12 § 2). **Rétention actuelle** : valeurs par défaut OVH (à vérifier en console + citer la durée exacte dans le doc OPS d'ici 2026-05-20). **Cible documentée mais non-enforced** : 90j hot / 13 mois cold (suivi P1 post-launch — ne pas claim de conformité plus stricte tant que la config OVH ne l'enforce pas).
16. **Sécurité base de données** : `DB_SYNCHRONIZE` forcé à `false` en production (`data-source.ts:83`), migrations via `node scripts/migration-cli.cjs generate` (56 migrations versionnées au 2026-05-13).
17. **SAST / supply chain** : CodeQL + Semgrep en CI, Renovate avec cool-down 3-7j et fast-track vulnérabilités, `pnpm overrides` pour kill transitif des bad packages.

---

## 5. Risques résiduels après mesures

**Attestation contrôleur (Art. 36 RGPD, 2026-05-13)** — Tim Moyence, contrôleur, atteste que les 3 risques résiduels ci-dessous sont **acceptables** après application des mesures TOM § 4, et qu'aucun d'eux n'atteint un niveau « élevé » résiduel justifiant une consultation préalable CNIL au titre de l'Art. 36. Cette attestation sera **ratifiée par le DPO mandaté avant signature**. Si un risque venait à être ré-évalué « élevé » lors du mandat DPO, le launch V1 serait conditionné à la consultation CNIL conformément aux délais Art. 36 (8 semaines, prorogeables de 6).

| Traitement | Risque résiduel principal | Acceptabilité |
|---|---|---|
| T1 | Hallucination LLM diffamatoire non détectée par guardrail | Accepté sous condition de monitoring mensuel (review équipe) + procédure de takedown sous 24h. |
| T2 | Buffer audio interceptable si compromission cert pinning | Accepté — niveau standard industrie, kill-switch app activable. |
| T3 | Cross-référence géo + chat révélant habitudes culturelles | Accepté — finalité légitime, consentement révocable, durée minimale. |

> **Risque résiduel non listé pré-launch (audit P0-4)** : absence de plafond OpenAI par utilisateur + absence de kill-switch global. Risque opérationnel et financier (boucle abusive = facture imprévisible), pas un risque RGPD direct sur les personnes. Mitigation prévue avant 2026-06-01 (middleware cost-limit + Redis counter + flag global). Ce point est documenté ici pour transparence DPO mais ne relève pas formellement de l'Art. 35.

---

## 6. Consultation des personnes concernées

Non réalisée au stade DPIA initiale (audience pré-launch). À envisager via :
- Beta testers (déjà actifs, ~20 utilisateurs) : sondage qualitatif sur la transparence du traitement IA + voix.
- Délégué des établissements scolaires partenaires (V1.1) : feedback formel via l'établissement.
- CRPA (Comité consultatif des règles professionnelles) : pas d'obligation de saisine au stade actuel (audience < 100k personnes concernées). Re-évaluer à V1.2 si l'audience franchit ce seuil.

### 6.1 Indicateurs à surveiller post-launch

- **Taux d'opt-out géolocalisation** : si > 25%, revoir l'UX d'explication du toggle `location_to_llm`.
- **Volume de demandes Art. 17 (effacement)** : baseline initiale à établir à J+30 ; déclencheur d'alerte à > 1% des MAU/mois.
- **Délai de réponse moyen DSAR** : SLA cible 7j ; alerte si > 10j (Art. 12).
- **Taux d'incidents `MINOR_REGISTRATION_BLOCKED`** : baseline initiale, alerte si chute brutale (peut indiquer un contournement).

---

## 7. Avis du DPO

À compléter par le DPO externe à mandater avant 2026-06-01. Champs requis :
- [ ] DPIA conforme Art. 35 et lignes directrices CEPD WP248.
- [ ] TOM proportionnées aux risques identifiés.
- [ ] Aucun risque résiduel non-acceptable.
- [ ] Pas d'obligation de consultation préalable CNIL (Art. 36).
- Date / Nom / Signature.

---

## 8. Plan de revue

| Trigger | Action |
|---|---|
| Annuel | Revue complète, mise à jour des volumes, identification de nouveaux risques. |
| Nouveau sous-traitant LLM | Ajout à SUBPROCESSORS, mise à jour T1, ré-évaluation transferts. |
| Changement majeur produit (nouveau type de données, p.ex. images user-uploaded) | DPIA delta dédiée. |
| Incident sécurité notifiable | Mise à jour TOM + section Risques résiduels. |

---

## 9. Annexes & références

- `docs/compliance/DATA_FLOW_MAP.md` — diagrammes Mermaid des flux.
- `docs/compliance/SUBPROCESSORS.md` — ledger Art. 28 des sous-traitants.
- `docs/legal/ROPA.md` — registre Art. 30 (registre des activités de traitement).
- `museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts` — pipeline chat (référence code).
- `museum-backend/src/shared/observability/sentry-scrubber.ts` — single source of truth scrubbing PII.
- AI Act EU 2024/1689 Art. 50 — obligations de transparence.
- CNIL Délibération 2021-018 — majorité numérique 15 ans.
- CNIL Guide PIA Software 2018/2024.

---

**END DPIA v1.0 DRAFT — Awaiting DPO sign-off.**
