# DPIA + ROPA — Readiness Tracking

**Owner** : Tech lead (Tim Moyence) + DPO externe (à mandater).
**Date d'ouverture du tracking** : 2026-05-13 (audit P0-1).
**Date cible de signature complète** : 2026-05-26 (J-6 avant launch V1 du 2026-06-01).
**Statut global** : NON SIGNÉ — audit technique terminé, signature DPO en attente.

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

## 3. DPO actions required (consolidé DPIA + ROPA)

Liste extraite des marqueurs `<!-- DPO ACTION REQUIRED: ... -->`. **Toutes** doivent recevoir une décision écrite avant signature.

### DPIA (`docs/legal/DPIA.md`)

1. **§ Header** : mandater un DPO externe et renseigner nom + email professionnel + cabinet (la mailbox `dpo@musaium.app` n'est pas encore active).
2. **§ T1.1 (Base légale Art. 6)** : confirmer le cumul 6(1)(a) + 6(1)(b) vs base unique 6(1)(b). L'EDPB 03/2022 décourage le bundling consentement/contrat.
3. **§ 4 mesure 9 (Backup & DR)** : documenter formellement le RTO/RPO chiffré + tester un restore avant signature.
4. **§ 4 mesure 15 (Logging)** : documenter la durée précise de rétention des logs structurés côté hébergeur (objectif 90j hot + 13 mois cold non encore enforced).
5. **§ 5 (Risques résiduels)** : valider que les acceptabilités reflètent la position juridique du responsable et qu'elles sont défendables vis-à-vis de l'Art. 36 (pas de consultation préalable CNIL requise).

### ROPA (`docs/legal/ROPA.md`)

6. **§ Header** : renseigner le contact DPO (miroir de DPIA action #1).
7. **TR-01 (Base légale)** : alignement obligatoire avec le choix retenu en DPIA T1 (action #2). Cumul 6(1)(b) + 6(1)(a) vs base unique 6(1)(b).
8. **TR-01 (Durée audit logs)** : confirmer que 13 mois est conforme aux lignes directrices CNIL anti-fraude vs durée strictement nécessaire Art. 5(1)(e).
9. **TR-02 (Base légale)** : alignement DPIA T1 — même choix de cumul ici et là.
10. **TR-02 (Transferts hors UE)** : décider de l'activation de l'OpenAI EU data zone avant signature (réduit le périmètre Schrems II quasi à zéro).
11. **TR-03 (Audio S3 cleanup)** : vérifier que le cleanup objet S3 est orchestré avec la purge DB (SUBPROCESSORS V5 a signalé un risque d'orphan post-purge).
12. **TR-04 (Adéquation UK)** : confirmer que la décision d'adéquation UK 2021/1772 est toujours en vigueur à la date de signature (réexamen Commission fin 2025 / début 2026).
13. **TR-05 (Rétention tickets 365j)** : confirmer la défensibilité vs prescription civile + fenêtre de réouverture utilisateur (vs 24 mois antérieurement documentés).
14. **TR-06 (Rétention logs)** : miroir DPIA action #4 — durée précise hébergeur OVH à enforcer.
15. **TR-07 (Rétention reviews rejetées 30j)** : confirmer suffisance comme preuve de modération en cas de contestation utilisateur ou réquisition judiciaire (vs 12 mois antérieurement documentés).
16. **§ Signature ROPA** : bloc à laisser vide jusqu'à apposition manuelle DPO + responsable.

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

## 6. Wire-up notes (out of P0-1/P0-2 scope)

Pointe les références que les agents suivants devront effectuer une fois la doctrine signée :

- **Mobile (P0-2 accessibility)** : `museum-frontend/features/legal/` contient `privacyPolicyContent.ts` + `termsOfServiceContent.ts` (fichiers TS). Ajouter une entrée `accessibilityStatementContent.ts` similaire + screen Expo Router. **Non fait** dans l'audit P0-2 car contrainte docs-only (no `.ts`/`.tsx`).
- **Web (P0-2 accessibility)** : `museum-web/src/components/shared/Footer.tsx` rend en dur `privacy` + `support` uniquement. Ajouter une troisième `<Link>` pour `accessibility` est un edit TSX **non fait** dans l'audit P0-2 — la clé `footer.links.accessibility` est posée dans `fr.json`/`en.json` pour préparer le wire-up suivant.
- **Web (P0-2 page)** : créer `museum-web/src/app/[locale]/accessibility/page.tsx` qui rend le contenu du markdown. Hors scope docs-only.
- **Privacy policy update (P0-3 follow-up)** : ajouter une mention "Pour notre déclaration d'accessibilité, voir `/accessibility`" dans `docs/privacy-policy.html` une fois la page web déployée.

---

**END readiness tracking v1.0 — Audit P0-1 + P0-2 (2026-05-13).**
