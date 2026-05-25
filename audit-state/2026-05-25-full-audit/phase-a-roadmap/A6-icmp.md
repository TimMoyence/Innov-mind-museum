# A6 — P0.I.C Compliance / a11y / GDPR (I-CMP1..I-CMP6)

> Agent fresh-context UFR-022, READ-ONLY. Ref unique : **`dev`** HEAD `89852f2a1` (`git rev-parse` confirmé).
> Mission : la roadmap (`docs/ROADMAP_PRODUCT.md:241-246`) marque I-CMP1/3/5/6 ❌, mais le commit du jour `e62b93f75` (#298, 36 fichiers) prétend les fermer. Chaque verdict re-vérifié au code courant (Read/Grep), pas au message de commit. Cross-check du prior finding `D5-lot5-a11y.md` (qui ciblait HEAD `9aff378b0`, AVANT #298 — d'où ses 4 verdicts OPEN, tous désormais périmés).
> Distinction systématique : **vérifié** (code lu path:line) vs **attendu**.

---

### I-CMP1 — VERDICT: DONE
- Marqueur roadmap actuel : ❌
- État réel vérifié : **Fermé par #298 (`e62b93f75`).** `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx` — le style `text` (lignes 33-40) ne contient **plus** `opacity: 0.7` (le prior finding le situait à `:36`). À sa place, un commentaire R1/R2 (`:36-39`) documente que la notice AI Act Art.50 rend au contraste plein du token (`theme.textSecondary` solid-on-solid, ligne 20), satisfaisant WCAG 2.1 AA 4.5:1 par le fix structurel (pas de changement de token). Le réducteur d'opacité qui causait la violation 3.55-4.09:1 est supprimé. Test ajouté : `__tests__/components/AiDisclosureFooter.test.tsx` (42 lignes, #298). Vérifié par lecture directe — confiance haute.
- CHECKBOX-FLIP : **oui → ✅** (raison : `opacity:0.7` retiré au HEAD, fix 1-ligne attendu par la roadmap appliqué + test).
- Amélioration/debt : aucune. Le ratio AA exact n'est pas recalculé pixel-près (comme le prior finding), mais la CAUSE documentée est éliminée.

---

### I-CMP3 — VERDICT: DONE
- Marqueur roadmap actuel : ❌
- État réel vérifié : **5/5 sous-violations fermées par #298 (`e62b93f75`).** Détail au code courant :
  1. **`Speech.stop()` cleanup** → FERMÉ. `useChatSession.ts:149-155` — l'effet autoplay audio-description retourne désormais une fonction de cleanup `return () => { void Speech?.stop(); }` (commentée R3/R4 : stoppe l'utterance précédente avant le prochain `speak()` + halt on blur/unmount). Le prior finding constatait 0 caller `Speech.stop` ; désormais présent.
  2. **Double-playback race** → FERMÉ. `useChatSession.ts:129` — garde `if (last.text.trim()) return;` (content-type partition R5/§D1) : expo-speech n'auto-lit QUE les messages bodyless (`imageDescription` sans `text`), le server-TTS (`useAutoTts`) possède tout message porteur de body. Exactement un moteur auto-play par message. La race décrite par le prior finding (gates dérivant de la même préférence, jouant simultanément) est éliminée par la partition.
  3. **Switch a11y** → FERMÉ. `SettingsAccessibilityCard.tsx:36-38` — le `<Switch>` porte désormais `accessibilityRole="switch"`, `accessibilityLabel={t('settings.audio_description')}`, `accessibilityState={{ checked: enabled }}`. Le prior finding ne trouvait QUE value/onValueChange/trackColor.
  4. **Live region sur réponse streamée** → FERMÉ. `StreamingBody.tsx:54` — `<View accessibilityLiveRegion="polite">` enveloppe le `<MarkdownBubble text={text}>` (R7), curseur clignotant laissé HORS de la region. Le prior finding constatait l'absence totale de live region sur le contenu de réponse.
  5. **Bubble label masquant le texte** → FERMÉ. `ChatMessageBubble.tsx:187-192` — le `<Pressable>` assistant ne porte PLUS `accessibilityRole="text"` + `accessibilityLabel` statique (commentaire R8/§D8 explicite : "do NOT set accessibilityRole=text + static label — collapses the subtree"). Ne garde que `accessibilityHint`. Le sous-arbre `StreamingBody`/`MarkdownBubble` est exposé naturellement. Le prior finding situait l'override masquant à `:187-189`.
  - Tests ajoutés par #298 : `useChatSession.audioDescription.test.ts` (301 l.), `ChatMessageBubble.a11yText.test.tsx` (87 l.), `SettingsAccessibilityCard.test.tsx` (62 l.), `StreamingBody.liveRegion.test.tsx` (51 l.) + flow Maestro `settings-audio-description.yaml`. Les 5 vérifiés par lecture directe — confiance haute.
- CHECKBOX-FLIP : **oui → ✅** (raison : les 5/5 sous-points OPEN du prior finding sont fermés au HEAD ; aucun reliquat). NB : la roadmap listait aussi "FE→BE write absent" dans la prose I-CMP3 — non re-traité par #298 et hors-scope a11y opérable ; ne bloque pas le flip (la persistence de la préférence est un confort, pas une violation WCAG, et `useAudioDescriptionMode` la gère côté FE).
- Amélioration/debt : la partition double-playback repose sur `last.text.trim()` ; si un futur message porte À LA FOIS un `imageDescription` ET un body court non-vide, seul le server-TTS joue (le `imageDescription` n'est jamais lu). Acceptable V1, à noter si le produit veut lire les deux.

---

### I-CMP5 — VERDICT: DONE
- Marqueur roadmap actuel : ❌
- État réel vérifié : **2 prongs fermés par #298 (`e62b93f75`).**
  - **(a) Skip-link** → FERMÉ. `museum-web/src/app/[locale]/layout.tsx:32-37` — `<a href="#main" className="sr-only ... focus:not-sr-only ...">{dict.a11y.skipToContent}</a>` est le PREMIER élément focusable du layout (avant `<Header>`), et `:39` `<main id="main" tabIndex={-1}>` fournit la cible (WCAG 2.4.1 Bypass Blocks). Le prior finding constatait `<main className="flex-1">` SANS id ni ancre, 0 occurrence de skip-link. Clés dict ajoutées : `en.json:3` "Skip to main content", `fr.json:3` "Aller au contenu principal", type `a11y.skipToContent: string` dans `i18n.ts:18-20`. Test Playwright `e2e/a11y/public-skip-link.a11y.spec.ts` (50 l., #298).
  - **(b) Domaine `.app`→`.com`** → FERMÉ. `accessibility-statement-en.md` et `-fr.md` : lignes 31 (`support@musaium.com`), 32 (`https://musaium.com`), 104 (`support@musaium.com`) — toutes en `.com`. Zéro occurrence `musaium.app` restante (grep confirmé). Le prior finding trouvait `.app` aux lignes 31/32/104 des DEUX statements. Ligne 61 (EN+FR) ré-écrite : "skip-link is now implemented ... `<main id="main">` ... WCAG 2.4.1 satisfied" (l'admission "no skip-link implemented" du prior finding est retirée).
  - Vérifié par lecture directe — confiance haute.
- CHECKBOX-FLIP : **oui → ✅** (raison : les 2 prongs OPEN du prior finding sont fermés ; skip-link réel + domaine canonique corrigé).
- Amélioration/debt : le statement note honnêtement (`:61`) que l'audit clavier end-to-end au-delà du skip-link "reste à auditer" — debt a11y résiduelle légitime (pas un faux claim de conformité), tracée dans le statement lui-même.

---

### I-CMP6 — VERDICT: PARTIAL
- Marqueur roadmap actuel : ❌
- État réel vérifié : **2/3 surfaces fermées par #298 (`e62b93f75`) ; gap mobile résiduel ACTÉ.**
  - **Backend** → FERMÉ. `ci-cd-backend.yml:806-813` — step "Cosign attest SBOM (CycloneDX)" : `cosign attest --yes --type cyclonedx --predicate museum-backend/sbom.json "ghcr.io/.../museum-backend@${{ steps.push.outputs.digest }}"`, additif + `continue-on-error: true`, lié au digest image. Le prior finding constatait SBOM en artifact seul (`:99-111`), zéro `cosign attest`. SBOM toujours uploadé artifact (`:101-110`) ET désormais attesté.
  - **Web** → FERMÉ. `ci-cd-web.yml:401` génère SBOM CycloneDX + `:413-414` `cosign attest --yes --type cyclonedx --predicate museum-web/sbom.json` sur le digest du push. Le prior finding trouvait 0 occurrence SBOM côté web.
  - **Mobile** → OPEN (gap acté, prio basse). `ci-cd-mobile.yml:109-119` — SBOM CycloneDX généré + uploadé artifact (`sbom-mobile`, 90j), mais PAS d'attestation sigstore. Cause documentée `:101-107` : EAS `eas build --no-wait` ne produit aucun digest OCI local atteignable depuis la CI → rien à quoi lier un prédicat signé. Les 2 occurrences "attest" du fichier (`:103,106`) sont des COMMENTAIRES documentant l'absence délibérée. Le binaire store n'a donc pas d'attestation SBOM signée.
  - Gouvernance : ADR-068 (`docs/adr/ADR-068-sbom-attestation-strategy-mobile-gap.md`) + tech-debt `docs/TECH_DEBT.md:1442` (TD-CMP6-SBOM-ATTEST) + sentinel `scripts/sentinels/sbom-attest-check.mjs` (contrat des 3 workflows). Échéance EU CRA Art.13 = 2027, PAS un bloqueur V1 2026-06-07.
  - Vérifié par lecture directe — confiance haute.
- CHECKBOX-FLIP : **oui → ⚠️** (raison : BE+web attestés ferment l'essentiel du gap ; reste le seul résiduel mobile binaire-store, structurellement contraint par EAS, tracé ADR-068/TD + échéance 2027. Passer de ❌ "jamais attesté" à ⚠️ "attesté BE+web, gap mobile acté/tracé deadline 2027" reflète l'état réel. Texte roadmap à mettre à jour vers le résiduel mobile.)
- Amélioration/debt : le gap mobile est légitimement V2.x. Si EAS expose un jour un digest exploitable (ou via `eas build --local` en CI), `cosign attest` mobile fermera le résiduel. Sentinel `sbom-attest-check.mjs` en place pour éviter toute régression du contrat BE/web.

---

### I-CMP2 — VERDICT: DONE (hors-scope #298, mais re-vérifié — flip requis)
- Marqueur roadmap actuel : ❌
- État réel vérifié : **Fermé par `71f103b35` (#294, "feat(p0-gdpr: close 8 V1 GDPR/consent gaps", 2026-05-21) — PAS par #298.** `git log -S '"accept_all"'` sur le locale `de` pointe `71f103b35`. Vérification exhaustive (script python sur les 40 clés `consent.*` du baseline EN) : **0 clé manquante** dans de/es/it/ja/zh/ar. Échantillon traduit (pas anglais fallback) : `consent.accept_all` = "Alle akzeptieren" (de), "Aceptar todo" (es), "すべて同意" (ja), "全部接受" (zh), "قبول الكل" (ar) ; `consent.manage_choices` présent partout. Le prior finding D5 ne couvrait PAS I-CMP2 (scope lots 1/3/5/6). La roadmap (`:242`) le marque encore ❌ "10 clés GDPR consent manquantes en 6 locales → consentement rendu en anglais" — claim désormais FAUX au HEAD. Vérifié par énumération programmatique — confiance haute.
- CHECKBOX-FLIP : **oui → ✅** (raison : les clés cookie-banner Accept-all/Manage + tout le bloc `consent.*` sont traduits dans les 6 locales ; le gate `check:i18n` n'a plus de raison d'échouer sur ces clés. Roadmap stale depuis #294.)
- Amélioration/debt : le commentaire roadmap "test Jest ne couvre que fr↔en (redondance à élargir)" reste un point valable — élargir le test d'égalité de clés aux 8 locales évite la régression silencieuse (le gate CI `check:i18n` couvre déjà, mais un test unitaire local est plus rapide). Debt mineure P2.

---

## Synthèse comptage verdicts

| Verdict | Count | IDs |
|---|---|---|
| DONE | 4 | I-CMP1, I-CMP2, I-CMP3, I-CMP5 |
| PARTIAL | 1 | I-CMP6 (BE+web attestés ; gap mobile acté/tracé 2027) |
| (déjà ✅) | 1 | I-CMP4 (badges mobile — inchangé, hors mission) |

- **Tous les verdicts OPEN du prior finding D5 sont périmés** : D5 ciblait HEAD `9aff378b0` (avant #298 `e62b93f75` et — pour I-CMP2 — avant #294 `71f103b35`). Aucune contradiction : le code a bougé entre les deux refs.
- **Zéro item P0.I.C reste réellement OPEN bloquant V1.** Le seul résiduel (mobile SBOM attest) est structurel EAS, échéance CRA 2027, hors-scope launch.
- Aucune FALSE-CLAIM côté code : chaque fermeture est corroborée par lecture directe + test associé. La seule fausseté est dans la **roadmap stale** (5 marqueurs ❌ à flipper).
