# DPIA + ROPA — Readiness Tracking

> **Statut au 2026-05-26 : DPO non mandaté.** La deadline 2026-05-25 est dépassée. `dpo@musaium.com` reste un alias, pas un DPO mandaté. DPIA/ROPA non signés. Décision go/no-go launch à formaliser par le responsable.

**Owner** : Tech lead (Tim Moyence) + DPO externe (à mandater — deadline ferme 2026-05-25).
**Date d'ouverture du tracking** : 2026-05-13 (audit P0-1).
**Date cible de signature complète** : 2026-05-26 (J-6 avant launch V1 du 2026-06-01).
**Statut global** : NON SIGNÉ — audit technique terminé, **13/13 décisions controller posées (2026-05-13)**, signature DPO en attente.

## 0. Mise à jour 2026-05-13 — Décisions controller posées

Le contrôleur (Tim Moyence) a tenu une session « DPO walkthrough » et a posé une **décision écrite à toutes les 13 questions** initialement marquées `<!-- DPO ACTION REQUIRED -->`. Le détail est dans les sections DPIA + ROPA elles-mêmes ; résumé :

| Question | Décision controller (2026-05-13) |
|---|---|
| DPO mandate (DPIA:8 + ROPA:9) | **Deadline ferme 2026-05-25** ; cabinet en cours de shortlist ; mailbox `dpo@musaium.com` reliée par alias à `contact@musaium.com` |
| Base légale Auth (ROPA TR-01) | **6(1)(b) uniquement** (exécution du contrat) — alignée EDPB 03/2022 |
| Base légale Chat / T1 (DPIA T1.1 + ROPA TR-02) | **Cumul 6(1)(b) + 6(1)(a)** — service = contrat ; consentement uniquement sur toggle `location_to_llm` |
| Rétention audit logs 13 mois (ROPA TR-01) | **Défendue** : CNIL anti-fraude + Art. 22 + cycle annuel d'audit |
| Rétention tickets 365j (ROPA TR-05) | **Défendue** : fenêtre saisonnière < prescription civile FR 5 ans |
| Rétention reviews rejetées 30j (ROPA TR-07) | **Défendue** : preuve via `audit_log` 13 mois |
| Logs hébergeur (DPIA §4.15 + ROPA TR-06) | **Résolu — rétention logs configurée côté OVH le 2026-05-27** (operator-confirmed) ; durée exacte à enregistrer dans `docs/OPS_DEPLOYMENT.md` (operator à confirmer). Aucune claim de conformité au-delà de la valeur réellement enforced. |
| OpenAI EU data zone (ROPA TR-02) | **Non activée pour V1** ; SCC + DPF maintenus ; ré-évaluation post-revenue B2B |
| S3 cleanup (ROPA TR-03) | **Vérifié** : cascade orchestrée (`chat-purge.job.ts:23-28` + `chat-media-purger.ts` + `s3-orphan-purge.job.ts`) |
| Adéquation UK (ROPA TR-04) | **Vérifié 2026-05-13** : Décision (UE) 2025/2531 du 17 décembre 2025 renouvelle jusqu'au 27 décembre 2031 |
| RTO/RPO + restore test (DPIA §4.9) | **RTO 24h / RPO 24h** ; restore test programmé avant 2026-06-01 |
| Art. 36 risques résiduels (DPIA §5) | **Attestation contrôleur posée** : tous risques résiduels acceptables, **pas de consultation préalable CNIL Art. 36 requise** ; à ratifier par DPO |
| Signature ROPA (ROPA §174) | Bloc laissé vide intentionnellement, aucune pré-signature par agent |

Le DPO mandaté ratifiera ces 13 décisions et signera. Si l'une est rejetée par le DPO, la décision sera réouverte ici avec date + motif.

> Ce document existe pour donner au DPO une vue unique sur l'état des livrables réglementaires Musaium pré-launch V1. Il agrège les marqueurs `<!-- DPO ACTION REQUIRED: ... -->` posés dans DPIA + ROPA pendant l'audit P0-1 (2026-05-13) et trace le chemin de signature.

---

## 1. Status snapshot

| Livrable | Statut | Dernier audit | Signature DPO | Signature responsable | Date cible |
|---|---|---|---|---|---|
| `docs/legal/DPIA.md` | DRAFT v1.0 | 2026-05-13 (P0-1, commit `b4150f5a`) | **Manquante** | **Manquante** | 2026-05-26 |
| `docs/legal/ROPA.md` | DRAFT v1.0 | 2026-05-13 (P0-1) | **Manquante** | **Manquante** | 2026-05-26 |
| `docs/legal/accessibility-statement-fr.md` | DRAFT v0.1 | 2026-05-13 (P0-2) | N/A (pas de signature DPO sur l'EAA) | **Manquante** (responsable + auditeur a11y) | 2026-05-26 |
| `docs/legal/accessibility-statement-en.md` | DRAFT v0.1 | 2026-05-13 (P0-2) | N/A | **Manquante** | 2026-05-26 |
| `docs/compliance/SUBPROCESSORS.md` | Active v1 (review trimestrielle) | 2026-04-26 + réconciliation P0-3 (2026-05-12) | N/A (ledger interne, pas de signature) | N/A | Revue continue |

---

## 2. Technical content verified by audit P0-1 (2026-05-13)

Sections techniques cross-vérifiées contre le code de production réel — ne nécessitent **pas** de revalidation DPO sauf changement de code :

- Durées de conservation chat : `CHAT_PURGE_RETENTION_DAYS=180` — `museum-backend/src/config/env.ts:279`.
- Retention crons V1 always-on (`museum-backend/src/config/env.ts:432-441`) :
  - `RETENTION_SUPPORT_TICKETS_DAYS=365` (TR-05 ; antérieurement documenté "24 mois", corrigé).
  - `RETENTION_REVIEWS_REJECTED_DAYS=30` (TR-07 ; antérieurement documenté "12 mois", corrigé).
  - `RETENTION_REVIEWS_PENDING_DAYS=60` (TR-07).
  - `RETENTION_ART_KEYWORDS_DAYS=90`.
  - `ENRICHMENT_HARD_DELETE_AFTER_DAYS=180` — `museum-backend/src/config/env.ts:349`.
- TTL JWT : access 15 min, refresh **14 jours absolus** (durcissement F8, antérieurement 30 j documenté) + sliding 24 h — TR-01.
- Token de reset mot de passe : 1 heure — `forgotPassword.useCase.ts:49`.
- Sub-processors alignés sur `docs/compliance/SUBPROCESSORS.md` post-P0-3 :
  - OpenAI = défaut, EU data zone non activée par défaut.
  - Google = alternative activable.
  - DeepSeek = alternative **non activée en prod EU** (gating `LLM_PROVIDER=openai`).
- TOM Art. 32 cross-vérifiées : bcrypt rounds=12, CSRF double-submit, cookies HttpOnly/Secure/SameSite, MFA AES-256-GCM, EXIF strip systématique, sanitization Unicode NFC + zero-width, LLM-Guard circuit breaker fail-CLOSED (ADR-047), audit IP anonymisée après 13 mois.
- Hébergement OVH (FR/EU) — `docs/OPS_DEPLOYMENT.md`.
- Citation légale corrigée (DPIA T1.3) : Loi n° 2023-566 du 7 juillet 2023 (majorité numérique 15 ans) + CNIL Délibération n° 2021-069 du 3 juin 2021 — remplace l'erreur antérieure « Délibération 2021-018 ».

---

## 3. DPO actions required — résolu 2026-05-13 (controller decisions)

Toutes les 13 actions initiales ont reçu une **décision écrite du contrôleur** (voir § 0). Statut : en attente de **ratification DPO** uniquement.

Reste à faire pour clôturer la phase signature :

1. **Mandater le DPO** d'ici 2026-05-25 (action bloquante n°1).
2. Soumettre au DPO le DPIA + ROPA + cette readiness pour avis Art. 39 RGPD.
3. Boucle de remédiation si le DPO rejette une décision controller (estimée 1-2 itérations).
4. Apposition signature DPO (DPIA + ROPA).
5. Contresignature responsable (Tim Moyence).
6. (P0-2 séparé) signature responsable de la déclaration EAA après audit WCAG 2.1 AA exécuté — voir `accessibility-content.ts` (audit automatisé du 2026-05-13 : 1 violation 1.4.3 documentée, manual a11y audit pendant).

---

## 4. Signature path

**Ordre cible** :

1. **DPO mandaté** (action #1) — étape bloquante. Recommandé : commencer la sélection cette semaine.
2. **Avis DPO** sur DPIA + ROPA (actions #2 à #15) — DPO signe en premier (Art. 39 RGPD requiert l'avis DPO préalable).
3. **Contresignature responsable du traitement** (Tim Moyence) sur DPIA + ROPA.
4. **Mises à jour suite à avis DPO** si remarques substantielles — boucle 1-2 si besoin.
5. **Déclaration accessibilité (P0-2)** : signature responsable + auditeur a11y (pas de DPO requis sur l'EAA, mais l'audit WCAG 2.1 AA doit être mené avant que la déclaration passe de "partielle" à "totale").

**Date cible globale** : 2026-05-26 (J-6 avant launch V1) pour laisser une fenêtre de remédiation.

---

## 5. Risks if unsigned by launch (2026-06-01)

Scénarios concrets — chiffrés sur la base de la jurisprudence récente CNIL + EDPB + Apple/Google :

1. **RGPD — DPIA non signée** : CNIL Art. 35 prévoit une amende administrative jusqu'à **10 M€ ou 2 % du CA mondial** (Art. 83-4). Pour un solo-entrepreneur pré-revenue, l'enjeu pratique est plutôt la mise en demeure + suspension d'activité forcée. Précédent : CNIL SAN-2023-016 (Doctissimo, 380 k€ sur DPIA non documentée).
2. **RGPD — ROPA non tenu** : Art. 30 obligation autonome. Amende administrative possible — précédent : CNIL SAN-2020-008 (FRSU, 7 k€). Risque secondaire mais cumulable.
3. **App Store — Apple Privacy Nutrition Label** : Apple requiert la cohérence des "Data Used to Track You" / "Data Linked to You" avec la politique de confidentialité publiée. Une DPIA documentée et publique réduit le risque de rejet sur ce critère. Sans DPIA, le risque est un rejet 2.5.13 (privacy) en review App Store.
4. **Play Store — Data Safety form** : équivalent Google. Le formulaire doit refléter le ROPA. Sans ROPA validé, le formulaire reste un risque d'audit Google.
5. **EAA (P0-2) — Directive 2019/882** : applicable depuis 2025-06-28. Sans déclaration d'accessibilité publiée, sanctions nationales par État membre :
   - FR : DGCCRF, amende administrative jusqu'à **300 k€** (Décret 2019-768 Art. 47 sexies).
   - DE : BFSG amende jusqu'à **100 k€** par infraction.
   - IT : Decreto Legislativo 27 maggio 2022 n. 82, amende jusqu'à 5 % du CA.
6. **Risque B2B** : un musée prospect demandera ces documents en pré-contrat. Absence = no-go commercial direct.
7. **Risque réputationnel** : si une demande Art. 15/17 utilisateur est mal traitée pendant la fenêtre non-signée, CNIL peut être saisie et l'absence de DPIA aggrave la qualification de manquement.

**Hiérarchie de risque** : EAA (FR) > DPIA RGPD > App Store rejet > ROPA > Play Store > B2B no-go > Réputationnel.

---

## 6. Wire-up status

- **Web (P0-2 accessibility)** : ✅ **fait 2026-05-13** — `museum-web/src/components/shared/Footer.tsx` ajoute la 3e `<Link>` accessibility, `museum-web/src/app/[locale]/accessibility/page.tsx` rend `accessibility-content.ts` (FR + EN), audit axe-core 4.11 contre 7 routes publiques, 1 violation WCAG 1.4.3 trouvée + ciblée pour 2026-06-30.
- **Mobile (P0-2 accessibility)** : à faire post-launch — `museum-frontend/features/legal/accessibilityStatementContent.ts` + screen Expo Router. Décision controller 2026-05-13 : différer derrière le launch V1 (Footer mobile n'a pas de section legal liens cliquables structurée comme le Web).
- **Privacy policy update (P0-3 follow-up)** : ajouter une mention "Pour notre déclaration d'accessibilité, voir `/accessibility`" dans `docs/privacy-policy.html` une fois la page web déployée. À faire dans la prochaine PR landing.

---

**END readiness tracking v1.0 — Audit P0-1 + P0-2 (2026-05-13).**
