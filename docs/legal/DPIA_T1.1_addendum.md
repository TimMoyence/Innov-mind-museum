# DPIA T1.1 — Addendum: granular AI consent layer (ADR-053)

> **Statut** : DRAFT — à valider par le DPO mandaté (mandat à signer ≤ 2026-05-25 per `DPIA.md` §0).
> **Version** : 1.0 — ajout 2026-05-17.
> **Run d'origine** : `2026-05-17-w4-compliance-ops-release` (audit-360 W4 cluster E, TE2).
> **Document parent** : [`DPIA.md`](./DPIA.md) §T1 — Chat IA conversationnel.
> **ADR de référence** : [`docs/adr/ADR-053-apple-5-1-2-i-granular-consent.md`](../adr/ADR-053-apple-5-1-2-i-granular-consent.md).
> **Doc compliance liées** : [`AI_DISCLOSURE.md`](./AI_DISCLOSURE.md), [`AI_DISCLOSURE_AUDIT.md`](./AI_DISCLOSURE_AUDIT.md), [`SUBPROCESSORS.md`](./SUBPROCESSORS.md), [`ROPA.md`](./ROPA.md).

---

## 0. Pourquoi un addendum (et pas une révision en place)

La DPIA T1.1 mère décrit le chat IA comme reposant sur **`6(1)(b)` exécution du contrat** comme base légale principale, justifiée par "le chat est la fonctionnalité contractée — sans transmission aux LLMs tiers, le service ne peut pas être fourni". Cette qualification reste vraie et n'est pas révisée.

Le S4-P0-02 (audit-360 S4, commit `b2a2c53d` BE + `a11e157b` FE, ADR-053) a ajouté une **couche de consentement granulaire par-dessus** ce contrat, pour deux raisons orthogonales :

1. **Apple Guideline 5.1.2(i)** (durcie 2025-11-13) — App Store Review demande un consentement explicite, séparé, non-bundle, par couple (catégorie de données × prestataire AI), distinct de l'acceptation générale des CGU.
2. **GDPR Art. 7 §1-§3** — quand consentement est invoqué comme base, il doit être : librement donné, spécifique, éclairé, sans ambiguïté, granulaire, et aussi facile à retirer qu'à donner.

L'addendum capture cet ajout sans modifier la qualification 6(1)(b) du chat lui-même. Le DPO doit signer cet addendum séparément de la DPIA mère, ce qui réduit la surface de re-validation juridique.

## 1. Périmètre couvert par la couche consentement

### 1.1 Scopes persistés

Catalogue exact du `CONSENT_SCOPES` BE (`museum-backend/src/modules/auth/domain/consent/userConsent.entity.ts`) tel que mergé en `b2a2c53d` :

| Scope identifier                           | Donnée traitée  | Provider | Statut requis |
|-------------------------------------------|-----------------|----------|---------------|
| `third_party_ai_text_openai`              | Texte chat       | OpenAI   | **REQUIS** pour utiliser le chat |
| `third_party_ai_image_openai`             | Photos / images  | OpenAI   | optionnel (feature `chat/compare`) |
| `third_party_ai_audio_openai`             | Audio (STT/TTS)  | OpenAI   | optionnel (voice mode) |
| `third_party_ai_profile_openai`           | Profil utilisateur (préférences sauvegardées injectées dans le prompt) | OpenAI | optionnel |
| `third_party_ai_text_google`              | Texte chat       | Google   | optionnel (fallback / A/B) |
| `third_party_ai_image_google`             | Photos / images  | Google   | optionnel |
| `third_party_ai_audio_google`             | Audio            | Google   | optionnel |
| `third_party_ai_profile_google`           | Profil           | Google   | optionnel |

> **DeepSeek volontairement absent** : bloqué par sentinelle CI `LLM_PROVIDER=deepseek` ∧ `NODE_ENV=production` (S4-P0-04). N'apparaît pas dans le sheet de consentement EU prod.

### 1.2 Surfaces consentement

| Lieu | Composant | Comportement |
|---|---|---|
| Mobile — premier chat | `AiConsentSheetContent` | 8 `<Switch>` par défaut **OFF**. Save grisé tant que `third_party_ai_text_openai` n'est pas ON (gate)+ badge `(required)` visible. |
| Mobile — Settings | `SettingsAiConsentCard` | Mêmes 8 toggles ; révocation optimiste avec rollback Sentry-reporté sur échec BE. |
| Web public privacy | `museum-web/src/lib/privacy-content.ts` §13 (FR + EN) | Description publique du dispositif, miroir d'ADR-053. |

### 1.3 Audit trail (preuves de consentement)

Toute action (grant + revoke) écrit :

- **`user_consents` row** — source de vérité applicative (présence ou absence du grant à un instant T).
- **`audit_logs` row** — preuve datée + horodatée + IP + request_id ; persiste même après suppression du `user_consents` row, car l'historique des décisions est légalement protégé.

Constantes : `AUDIT_CONSENT_GRANTED_TOS`, `AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI`, `AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI`, `AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM`, `AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM`, plus 2 catch-alls (`AUDIT_CONSENT_GRANTED`, `AUDIT_CONSENT_REVOKED`).

## 2. Articulation lawful-bases T1.1 ↔ ADR-053

| Question | Réponse |
|---|---|
| La DPIA T1.1 reste-t-elle sur **`6(1)(b)`** pour le chat principal ? | **Oui.** Le chat reste contractuel : l'utilisateur paie (ou utilise le freemium) en échange de réponses IA. Sans transmission aux LLMs, pas de service. |
| Sur quelle base reposent alors les **nouveaux scopes granulaires** ? | **`6(1)(a)` consentement explicite** — additionnel à `6(1)(b)`. Le user a soit le contrat **OU** le consentement granulaire ; pour aller au-delà du minimum contractuel (multi-provider, audio, profil injecté), c'est `6(1)(a)`. |
| Y a-t-il un risque de double-base ambiguë (cf. CNIL/CEPD guidance) ? | **Non** — chaque flux a une base unique : le minimum contractuel `OpenAI text` est sous `6(1)(b)` même si l'utilisateur active aussi le switch (le switch est sur `(a)` pour respecter Apple, mais le flux survivrait à un retrait sous `(b)`). Les autres scopes sont strictement sous `(a)` — sans grant, pas de transmission. |
| Le user peut-il refuser **tous** les scopes ? | Non — sans `third_party_ai_text_openai`, le chat ne peut pas tourner. Le user peut se déconnecter / supprimer son compte (`6(1)(b)` n'oblige pas l'utilisateur à utiliser le service). |
| La révocation d'un scope est-elle effective ? | **Deux étages** : (a) `location_to_llm` — appliquée en temps réel par `chat.service.ts` ; (b) autres scopes — enregistrée + tracée mais **n'interrompt pas** les inférences en cours (cf. ADR-053 §"Known follow-ups #2 enforce"). L'enforcement complet = suppression de compte. Cette limite est documentée publiquement (privacy-content.ts §13). |

## 3. Mesures TOM additionnelles (Art. 32 RGPD)

| Mesure | État | Source |
|---|---|---|
| Persistence audit row sur grant + revoke | ✅ | `auditService.log` via `GrantConsentUseCase` / `RevokeConsentUseCase` |
| Réplication audit row → cold storage 30 j | ⚠️ Hérité de l'infra audit existante ; vérifier que `audit_logs` est inclus dans le pg_dump retention. | DPO action |
| Réconciliation FE↔BE sur boot mobile | ⚠️ Manquant — `useAiConsent` ne diff pas `AsyncStorage` vs `listUserConsents()`. Risque : audit row manquant si un grant FE a échoué BE. Acceptable V1 (faible probabilité). Suivi : **T-S4-P0-02-bis-reconcile**. | Mobile |
| Enforcement runtime des révocations text/image/audio/profile | ⚠️ Pas en place — documenté publiquement comme "intention utilisateur ; enforcement complet = suppression de compte". Suivi : **T-S4-P0-02-bis-enforce**. | BE chat |
| Reconciliation audit-rows / consent-rows | ⚠️ `auditService.log` swallow errors ; un grant peut atterrir sans audit row matchant. Probabilité basse (advisory-lock contention). Suivi : **T-S4-P0-02-bis-audit-reconcile**. | BE |

Les warnings ci-dessus sont documentés à dessein — le DPO doit prendre acte des limites avant signature.

## 4. Articulation avec sous-traitants (cf. SUBPROCESSORS.md)

L'addendum ne modifie pas la liste des sous-traitants. La couche consentement granulaire **filtre** ce qui est envoyé à chacun, elle ne **rajoute** aucun sous-traitant :

| Sous-traitant | Avant ADR-053 | Après ADR-053 |
|---|---|---|
| OpenAI | reçoit tout le chat (contractuel) | reçoit toujours le texte (contractuel) ; image/audio/profil conditionnés au consentement explicite |
| Google AI | fallback orchestrator | nécessite consentement explicite par scope ; sinon pas utilisé |
| DeepSeek | bloqué EU prod (S4-P0-04 sentinelle CI) | inchangé — pas de scope EU prod |
| OVH (hébergement DB) | inchangé | inchangé |
| AWS (backups) | inchangé | inchangé |
| Expo/EAS | inchangé | inchangé |
| Sentry | inchangé | inchangé |
| Brevo | inchangé | inchangé |

## 5. Points de vigilance pour le DPO

1. **Apple gate** — la maquette `AiConsentSheetContent` doit être présentée explicitement au reviewer Apple. Risquer un re-review avec la sheet bundlée = re-écriture sous deadline.
2. **Mineurs (15+ — cf. DPIA §5)** — les mineurs > 15 ans peuvent consentir seuls per CNIL ; < 15 nécessitent un parent. L'ADR-053 n'introduit pas de mécanisme spécifique mineurs — la sheet est identique pour tous les âges. À discuter avec le DPO si le contexte audience scolaire augmente.
3. **Enforcement runtime des révocations** — la limite "révocation = intention, pas blocage" est documentée publiquement (transparence) mais le DPO doit confirmer que cette transparence suffit RGPD-wise. Une autre lecture : la révocation devrait bloquer en temps réel. Documenté en `docs/adr/ADR-053-apple-5-1-2-i-granular-consent.md` §"Known follow-ups #2".
4. **Audit-row durability** — si `auditService.log` swallow errors, un grant peut être appliqué sans audit row. Risque résiduel : `user_consents` row valide mais `audit_logs` row absent = trou de preuve. Probabilité basse, mitigation = reconciliation job V1.1.
5. **`location_to_llm` enforcement seul** — décision pragmatique : la localisation est plus sensible que le texte (révèle là où la personne se trouve à un instant donné), donc enforcement temps réel. Le DPO peut suggérer d'étendre l'enforcement à `image` (photos potentiellement identifiantes).

## 6. Décision pendante

Le DPO doit acter, par signature ou commentaire annoté sur cet addendum :

- [ ] **Approbation** du layering `6(1)(b) + 6(1)(a)` tel que décrit en §2.
- [ ] **Acceptation** des 5 points de vigilance §5 OU demande de revision avant launch.
- [ ] **Validation** du périmètre des 8 scopes §1.1.
- [ ] **Engagement** sur les 4 follow-ups documentés (reconcile / enforce / dpia / audit-reconcile) avec deadlines T-S4-P0-02-bis-*.

Sans cette signature, le launch V1 (2026-06-01) ship la couche consentement granulaire **sans backup juridique formel**. Le risque est contenu (l'audit-360 a fait diligence, la doctrine technique est défendable), mais il est non-nul.

## 7. Date de signature attendue

**≤ 2026-05-25** — mêmes deadline que la DPIA mère pour le mandat DPO (DPIA.md §0). Tracker dans `team-state/2026-05-17-w4-compliance-ops-release/` jusqu'à signature.

---

> **Statut au 2026-05-17** : addendum rédigé, en attente DPO. Mandat DPO non encore signé (deadline ferme 2026-05-25).
> **Si la deadline DPO 2026-05-25 est manquée** : escalation `team-reports/2026-05-XX-launch-blocker-dpia.md` + V1 launch décision TL (probablement go avec « risque accepté documenté » jusqu'à signature post-launch — à éviter mais admissible si tracé honnêtement).
