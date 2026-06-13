# DPAs signés / acceptés (sous-traitants)

Archive des Data Processing Agreements en vigueur (RGPD Art. 28). Un fichier PDF par sous-traitant + l'entrée ci-dessous.

## Langfuse (observabilité LLM)

- **Vendor** : Langfuse GmbH (Allemagne).
- **Région des données** : Europe — `cloud.langfuse.com` (AWS **eu-west-1**). Ce n'est PAS l'US (`us.cloud.langfuse.com` est un host distinct). Confirmé par le sélecteur de région Langfuse (compte « Signed in » sur Europe).
- **DPA** : auto-accepté à la création de compte (click-accept = exécution des SCC UE Annexe I.A, cf. langfuse.com/security/dpa). Aucune contre-signature manuelle requise pour la validité ; contre-signature optionnelle sur demande écrite.
- **Date d'acceptation** : ~2026-05-02 (création du projet EU / 1er commit du code Langfuse `be7258432`).
- **PDF archivé** : 2026-06-13 — `langfuse-cloud-eu-dpa.pdf`.
- **Données transmises** : métadonnées de trace uniquement (modèle, tokens/coût, timings de span, identifiants pseudonymisés). Les payloads texte du chat sont remplacés par `[STRIPPED]` avant transport (`src/shared/observability/strip-free-text.ts`) — Langfuse ne reçoit jamais le contenu des conversations.
- **Mécanisme de transfert** : interne (UE), pas de transfert pays tiers.
- **Registre** : `docs/compliance/SUBPROCESSORS.md` ligne #21.
