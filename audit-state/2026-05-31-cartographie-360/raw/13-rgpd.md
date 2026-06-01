# 13 — Conformité RGPD / CNIL / AI Act — Musaium (app IA B2C, launch V1 ~2026-06-07)

> Cartographie 360, volet conformité données. SOTA réglementaire 2024-2026 vs implémentation Musaium vérifiée dans le code.
> Honnêteté UFR-013 : chaque claim Musaium ci-dessous est tracé à un path:ligne ou ADR lu pendant l'audit.

## 1. État de l'art réglementaire (2024-2026)

**CNIL — recommandations IA & RGPD.** La CNIL a finalisé entre avril 2024 et juillet 2025 un corpus de ~13 fiches pratiques sur le développement des systèmes d'IA sous RGPD (périmètre, finalités, base légale, minimisation, information des personnes, sécurité, annotation, statut du modèle). Le 19 juin 2025 elle a publié 2 fiches sur l'**intérêt légitime** (art. 6(1)(f)) comme base la plus courante pour l'entraînement, assorti d'un test de mise en balance + mesures de mitigation. Une fiche dédiée « respecter et faciliter l'exercice des droits » impose que les droits (accès, rectification, **effacement**, limitation, portabilité) s'exercent sur la base d'apprentissage ET sur le modèle s'il n'est pas anonyme, sur tout le cycle de vie y compris les sorties produites.

**Âge / mineurs (France).** L'art. 8 RGPD transposé par l'art. 45 Loi Informatique et Libertés fixe la **majorité numérique à 15 ans** (la France a usé de la marge nationale ; défaut RGPD = 16, plancher = 13). Sous 15 ans : consentement **conjoint** mineur + titulaire de l'autorité parentale pour les traitements en ligne fondés sur le consentement. La CNIL a publié 8 recommandations (Délibération 2021-018) dont la n°4 (consentement parental < 15 ans) et n°1 (encadrer la capacité d'agir en ligne).

**AI Act EU — transparence chatbot (art. 50).** Les fournisseurs de systèmes d'IA qui interagissent avec des personnes doivent les informer qu'elles dialoguent avec une IA (sauf évidence) ; le contenu généré/manipulé par IA doit être marqué de façon identifiable. **Obligations applicables au 2 août 2026.** Code of Practice art. 50 : 2e brouillon publié mars 2026, version finale attendue juin 2026.

**Violation de données.** Art. 33 RGPD : notification à la CNIL **≤ 72h** après prise de connaissance si risque pour les droits/libertés ; notification par phases possible si infos incomplètes. Art. 34 : information des personnes si risque élevé. Cadre d'évaluation = EDPB Guidelines 9/2022 (5 paramètres : type, nature, volume, sensibilité, identifiabilité). Sanction tier bas : 10 M€ / 2 % CA.

**DPA / sous-traitants (art. 28).** Tout fournisseur LLM agissant comme sous-traitant exige un DPA art. 28 signé. Free-tier ChatGPT n'offre PAS de DPA conforme → API Business + opt-out + DPA. Transferts hors UE (US, Chine) : SCC 2021/914 + TIA (Schrems II) ; DPF actif pour US-adhérents.

## 2. Musaium vs SOTA — état vérifié

| Exigence | Musaium (vérifié) | Verdict |
|---|---|---|
| CNIL âge-15 | `register.useCase.ts:18` `MINIMUM_AGE_FOR_REGISTRATION=15`, calcul server-side, rejet code stable `parental-consent` ; gate FE `authFormSchema.ts` + `RegisterForm.tsx:178` (DOB requis au submit) ; politique privacy canonical FR+EN cite Délibération 2021-018 | **Conforme** (gate code prouvé ; voir gap exécution CI) |
| AI Act art. 50 transparence | `AiDisclosureFooter.tsx` (footer persistant « contenu généré IA »), `AiDisclosureSheetContent.tsx` recap on-demand, consentement IA dédié `AiConsentSheetContent.tsx` | **Conforme par anticipation** (deadline 2026-08, déjà câblé) |
| Effacement art. 17 (cache/IA inclus) | ADR-060 : erasure two-phase complet — DB cascade + S3 images (scan boundary-safe) + S3 audio TTS (DB-ref par ref) + contact Brevo (DELETE email_id) ; cron orphan-purge ; **embeddings = catalogue d'œuvres statique (Wikidata/SigLIP), PAS de PII user → pas de problème de désapprentissage** | **Conforme + au-dessus de la moyenne** |
| DSAR art. 15/20 | `me.route.ts:33` `GET /me/export`, payload v2 allow-list par champ, exclusion secrets/hash, frozen test completeness ; audit rows actor inclus | **Conforme** |
| Audit trail | hash-chain SHA-256 `audit-chain.ts` (prevHash/rowHash, `verifyChain`), advisory-lock serialisé, immutable INSERT-only | **Conforme (fort)** |
| Subprocessor ledger | `SUBPROCESSORS.md` (22 vendors, base légale/transfert/DPA par entrée) + sentinelle `subprocessor-ledger-completeness.mjs` (code↔ledger, fail CI si vendor non documenté) | **Conforme (excellent — rare en B2C solo)** |
| Langfuse masking | ADR-063 : `mask: stripFreeText` au ctor, `[STRIPPED]` sur prompts/complétions avant transport, fail-safe ; Langfuse off par défaut | **Conforme** |
| Breach 72h | `breach-72h-timer.yml` (T+48 warn / T+72 alert, label `cnil-notified`), `BREACH_PLAYBOOK.md`, `CNIL_BREACH_NOTIFICATION_DRYRUN.md`, audit hash-chain source de vérité | **Conforme (process outillé)** |
| Minimisation / IP | `audit-ip-anonymizer.job.ts` rétention 13 mois IPv4→/24, IPv6→/64 ; géo coarse city/country only, consent-gated `location_to_llm` | **Conforme** |
| Consentement granulaire | scopes `third_party_ai_<cat>_<provider>` + `location_to_llm`, audit grant/revoke (`consent-audit-mapping.ts`), révocable | **Conforme (Apple 5.1.2(i) + Art.7)** |

## 3. Gaps réels avant launch B2C

1. **TIA / transfert hors-UE non finalisé (P0 doc-ops).** Le ledger lui-même note « Transfer Impact Assessment NOT YET conducted » pour OpenAI (#1, US par défaut). C'est le gap résiduel le plus matériel : OpenAI EU data zone non activée (TR-02 ROPA), DeepSeek (Chine, pas d'adéquation) doit rester non-activé en prod EU. Ce sont des actions DPO/legal, pas du code.
2. **DPA URLs `TBD`.** Plusieurs DPA marqués « TBD legal verification » (Langfuse, CARTO, Apple, Tavily). Langfuse off par défaut + masking → risque faible ; CARTO expose l'IP client (fetch device direct) → à arbitrer (proxy tuile EU ou self-host).
3. **CNIL âge-15 — exécution CI.** Le flow Maestro existe et est câblé, plancher prouvé en BE e2e, mais l'exécution complète sur émulateur macOS est différée V1.0.x (cf. roadmap). Gate code = OK ; preuve e2e mobile = partielle.
4. **DeepSeek (#2)** : verrouiller par config qu'il ne soit jamais `LLM_PROVIDER` en prod EU sans SCC+TIA (actuellement « action » documentée, pas un gate dur).
5. **DPO interne** (D2 remediation) : rôle assigné solo-dev — formaliser le registre RoPA + contact DPO public.

## 4. Recommandations priorisées

- **P0** — Finaliser le TIA OpenAI + décider EU data zone (`OPENAI_BASE_URL=https://eu.api.openai.com/v1`) avant ouverture B2C ; sans TIA, transfert US sur chat libre = exposition art. 44-49. Action DPO.
- **P0** — Vérifier en prod que Sentry DSN = `*.eu.sentry.io` et S3 = `eu-west-3` (les 2 documentés mais à confirmer runtime). Risque silencieux.
- **P1** — Durcir le verrou DeepSeek prod-EU en gate config (env-validation refuse `LLM_PROVIDER=deepseek` si `NODE_ENV=production` sans flag SCC explicite).
- **P1** — Résoudre l'exposition IP CARTO (proxy tuiles EU ou self-host basemap) — seul vendor exposant directement une donnée perso (IP) au device sans masking.
- **P2** — Lever les DPA `TBD` (signatures legal) ; compléter l'exécution Maestro âge-15 sur émulateur macOS en V1.0.x.

## 5. Verdict global

Pour une app B2C solo « full Claude », le socle conformité est **nettement au-dessus de la moyenne du marché** : age-gate code-enforced, erasure two-phase couvrant S3+marketing, audit hash-chain, sentinelle ledger code↔Art.28, masking PII observabilité, AI Act art.50 anticipé (deadline 2026-08). Les gaps restants sont **ops/legal (TIA, DPA, DPO, confirmation région runtime)**, pas des trous d'implémentation. Aucun blocker code RGPD identifié pour le launch ; le risque résiduel est juridique (transferts hors-UE) et doit être tranché par le DPO avant l'ouverture publique.
