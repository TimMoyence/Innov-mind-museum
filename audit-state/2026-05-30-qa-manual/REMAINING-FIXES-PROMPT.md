# Prompt — finaliser les retours QA restants (workflow + fresh agents + /team profond)

> À coller tel quel (idéalement dans une **session fraîche**, RTK **OFF**). Source de vérité des diagnostics : `audit-state/2026-05-30-qa-manual/QA-NOTES.md` (file:line vérifiés).

---

Lance un **workflow d'orchestration multi-agents** (fresh-context, discipline **/team UFR-022** : spec → plan → red → green → review, un agent **frais** par phase, zéro contexte partagé) pour **corriger en profondeur les 6 retours QA restants** du 2026-05-30.

**Avant tout** : lis intégralement `audit-state/2026-05-30-qa-manual/QA-NOTES.md` (QA-02, QA-03, QA-06, QA-07, QA-08, QA-10 — chacun a son diagnostic `file:line`, sa cause racine et sa piste de fix déjà vérifiés). QA-01/04/05/09 sont **déjà corrigés** — ne pas y toucher.

## Périmètre (1 fix = 1 cycle complet red→green→review, commit séparé)

1. **QA-02 — Renommer « Scanner le cartel »** (terme incompris du grand public).
   - i18n `chat.attachmentPicker.scan_cartel` dans `museum-frontend/shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json` ; composant `features/chat/ui/AttachmentPickerSheetContent.tsx` ; action = scan QR de l'œuvre (`CartelScannerSheetContent.tsx`).
   - Proposer un libellé clair (ex « Scanner l'œuvre » / « Scanner le code de l'œuvre »), MAJ les **8 locales** + tests `AttachmentPickerSheetContent.scan-cartel.test.tsx`.

2. **QA-03 — Menu « + » en grille uniforme type WhatsApp** (au lieu de pills largeur-variable).
   - `features/chat/ui/AttachmentPickerSheetContent.tsx` (styles `actionsRow`/`actionButton`, ~l.232-286) : grille N colonnes, tuiles de **taille égale** (icône au-dessus, label dessous, `numberOfLines`, `aspectRatio` constant).
   - RTL-safe (`marginStart/End`, `textAlign:'center'`). **Pas d'emoji unicode** (PNG `require` / Ionicons). Si écran user-facing modifié → flow Maestro (UFR-021).

3. **QA-06 — Écran détail musée quasi vide.**
   - `app/(stack)/museum-detail.tsx` + `features/museum/ui/MuseumDetailEnrichment.tsx` sont **déjà câblés** à `GET /api/museums/:id/enrichment` (`MuseumEnrichmentView` : summary/website/phone/imageUrl/openingHours). Vrai manque = **données** : les musées démo affichés (ex « International Art Museum of America ») n'ont **pas de ligne enrichment**.
   - Décider + implémenter : (a) **seeder** l'enrichment des musées démo (cf. `scripts/seed-knowledge.ts`), et/ou (b) **skeleton** de chargement (au lieu d'un écran « vide » pendant le poll async). Jamais de faux contenu.

4. **QA-07 — Centrer le texte des blocs « Mode économie de données ».**
   - `features/settings/ui/DataModeSettingsSection.tsx` : `optionButton` += `alignItems:'center'` + `justifyContent:'center'` + `minHeight` (hauteurs égales) ; `optionLabel` += `textAlign:'center'`. RTL : `textAlign:'center'` uniquement. 1 fichier.

5. **QA-08 — Fun-fact « Le saviez-vous » en anglais** (⚠️ feature non triviale, **cross-stack, change de contrat data**).
   - C'est de la **data**, pas du wiring : `funFact: string` (anglais seul) dans `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts` ; type `museum-backend/src/modules/daily-art/domain/artwork.types.ts`.
   - Plan : `funFact: string` → `Record<Locale,string>` (ou `funFactByLocale`) ; **traduire toutes les entrées** ; use-case `getDailyArtwork.useCase.ts` sélectionne `funFact[locale] ?? funFact.en` ; mapper réponse + **OpenAPI** + régénérer types FE (`cd museum-frontend && npm run generate:openapi-types`) ; FE `features/daily-art/{application,ui}` passe le `locale` courant. **Spec Kit complet recommandé.**

6. **QA-10 — « Partager » du tableau de bord ambigu** (décision **produit** requise AVANT impl).
   - `features/conversation/application/useConversationsActions.ts` partage un **résumé générique du dashboard** (`Share.share({ title, message })`), pas une conversation. Aucun partage par conversation n'existe.
   - Trancher : (a) **court terme** = renommer « Partager » → « Partager l'app » / « Inviter un ami » (copy, 8 locales) ; OU (b) **feature** partage par conversation (bouton dans l'écran chat + partage **transcript côté client**, GDPR-safe ; un lien public = lourd, conversations = PII). **Demander la décision produit** avant de coder.

## Garde-fous opérationnels (appris le 2026-05-30 — NON négociables)

- **RTK OFF.** S'il est ON, les sorties d'outils sont corrompues (rejeu, injection, éditions silencieusement non appliquées). Source de vérité = `git diff`.
- **Vérifier que CHAQUE édition a atterri** via `git diff --stat <fichier>` avant de continuer. Ne pas faire confiance au « updated successfully » seul.
- **Une commande à la fois** pour les opérations sensibles ; ne pas batcher des appels susceptibles d'annulation en cascade.
- **Tests** : `npx jest --clearCache` avant chaque run jest (cache stale = piège connu, cf. CLAUDE.md). Tests `node:test` : `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test <file>`.
- **Gates obligatoires avant de déclarer un fix « done »** : suite jest du **module entier** verte (pas juste le test ajouté — un changement de contrat partagé casse des tests adjacents) + `cd museum-frontend && npx tsc --noEmit` = 0 + `npx eslint <fichiers touchés>` = 0. Côté backend : `pnpm lint` + `pnpm test` scoping.
- **Arbre principal** (pas worktree) → permet la vérif live hot-reload de l'app.
- **Honnêteté UFR-013** : tout échec/test/erreur rapporté **verbatim** ; distinguer « le code dit X » (vérifié) de « j'attends X ».
- Commits : Tech Lead uniquement, **1 commit par fix**, `git status` avant chaque commit.

## Ordre conseillé (par indépendance / risque)

1. Légers FE, fichiers disjoints : **QA-07**, **QA-02**, **QA-03**.
2. **QA-06** (seed/data + UX skeleton).
3. **QA-10** : poser la décision produit, puis copy ou feature.
4. **QA-08** en dernier (cross-stack, contrat data, Spec Kit complet).

Pour chaque cycle : red (test qui **échoue** prouvant le bug) → green (code minimal, frozen-test) → suite module verte → review fresh-context. Rapport final : ce qui est corrigé/vérifié (avec numéros de tests + tsc/eslint), ce qui reste, et toute décision produit en attente.
