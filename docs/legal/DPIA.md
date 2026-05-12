# Analyse d'impact sur la protection des données (DPIA)

**Statut** : DRAFT — à valider par DPO externe avant le launch V1 (2026-06-01).
**Date** : 2026-05-12
**Responsable du traitement** : Tim Moyence — Entrepreneur Individuel, opérant Musaium / InnovMind.
**Contact DPO** : `tim.moyence@gmail.com` (DPO externe à mandater, TBD avant 2026-06-01).
**Version** : 1.0 (initiale).
**Cycle de revue** : annuel, ou à chaque changement matériel du traitement.

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
| **Durée de conservation** | Texte de chat : conservation pendant la durée du compte (effacement sur demande Art. 17). Historique LLM côté tiers : OpenAI = 30j max (DPA), Google = 60j max (DPF), Deepseek = TBD (non utilisé en prod EU). |
| **Base légale (Art. 6)** | 6(1)(a) consentement (case `tos_privacy` à l'inscription, scope `user_consents`) + 6(1)(b) exécution du contrat (réponse à la question). |
| **Destinataires / sous-traitants** | Voir `docs/compliance/SUBPROCESSORS.md` entries #1 (OpenAI), #2 (Deepseek, désactivé EU), #3 (Google). Pas de transfert vers d'autres tiers. |
| **Transferts hors UE** | OpenAI : US ; SCC 2021/914 + DPF. Google : US ; SCC + DPF. Deepseek : Chine ; pas d'adéquation, **désactivé en prod EU**. |

### T1.2 — Évaluation des risques (échelle CNIL 1=négligeable, 4=maximal)

| Risque | Vraisemblance | Gravité | Mesures actuelles | Mesures complémentaires (avant 2026-06-01) |
|---|---|---|---|---|
| **Accès illégitime aux conversations** (mesures de protection) | 2 | 3 | Chiffrement TLS in-transit, chiffrement at-rest (PG + S3), accès admin loggé (`audit_logs` hash-chain), MFA pour rôles admin | Renforcement R16 MFA pour `super_admin` (déjà déployé). |
| **Modification non désirée** des messages stockés | 1 | 2 | Audit-chain hash-link sur 13 mois, sauvegardes PG quotidiennes | OK |
| **Disparition de données** (effacement involontaire) | 2 | 2 | Sauvegardes quotidiennes PG, soft-delete sur les messages | Plan de reprise après sinistre à formaliser (RTO/RPO). |
| **Hallucination LLM produisant un contenu offensant ou diffamatoire** | 3 | 3 | Guardrails entrée + sortie (`art-topic-guardrail`), prompt isolation structurée, AI Act disclosure (Art. 50) | OK — bake en prod ≥7j post-launch ; review mensuelle des logs guardrail. |
| **Fuite de prompt via injection** (prompt injection adversarial) | 2 | 3 | Boundary marker `[END OF SYSTEM INSTRUCTIONS]`, sanitization Unicode + zero-width, position user content après system | OK — surveiller via Sentry sur le guardrail output. |

### T1.3 — Risque spécifique mineurs

Audience scolaire prévue : la DPIA reconnaît un risque accru concernant les utilisateurs de moins de 15 ans (majorité numérique française — CNIL Délibération 2021-018).

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

Pour les 3 traitements :

1. **Chiffrement** : TLS 1.3 in-transit, AES-256 at-rest (PG + S3), bcrypt pour mots de passe (rounds=12).
2. **Contrôle d'accès** : JWT 15min + refresh 30j, MFA obligatoire `admin` + `super_admin`, API-keys hashées (msk_*).
3. **Audit-chain** : hash-link 13 mois sur les actions admin et les flux GDPR (export, deletion, consent grant/revoke).
4. **PII scrubbing** : Sentry events filtrés par `sentry-scrubber.ts` (BE + FE + Web), 7 query keys + body fields password/token/secret/refresh redactés.
5. **DSAR ready** : export (Art. 15) + suppression (Art. 17) via `/api/auth/account/export` + `/api/auth/account/delete`, SLA 7j.
6. **Backup & DR** : snapshots PG quotidiens (chiffrés, 35j de rétention), basé chez OVH (FR/EU).
7. **Subprocessors** : ledger `docs/compliance/SUBPROCESSORS.md` à jour, revue trimestrielle.
8. **AI Act Art. 50** : disclosure générative implémentée sur les 3 surfaces (mobile, web, privacy policy) — voir commit `compliance(ai-act)` du 2026-05-12.
9. **Guardrails** : input + output filter sur les conversations chat (`art-topic-guardrail.ts`).
10. **Logging** : structured JSON, request-id correlation, conservation 90j hot + 13 mois cold (audit).

---

## 5. Risques résiduels après mesures

| Traitement | Risque résiduel principal | Acceptabilité |
|---|---|---|
| T1 | Hallucination LLM diffamatoire non détectée par guardrail | Accepté sous condition de monitoring mensuel (review équipe) + procédure de takedown sous 24h. |
| T2 | Buffer audio interceptable si compromission cert pinning | Accepté — niveau standard industrie, kill-switch app activable. |
| T3 | Cross-référence géo + chat révélant habitudes culturelles | Accepté — finalité légitime, consentement révocable, durée minimale. |

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
