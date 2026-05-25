# B7 — Lot P0 a11y & compliance #298 — angle TESTS / i18n 8-locales / HONNÊTETÉ / non-régression

Reviewer fresh-context READ-ONLY (UFR-022). Branche `dev` @ HEAD `89852f2a1`.
Commits jugés : `e62b93f75` (lot, 36 fichiers) · `648328cb9` (i18n bottomSheet.dismiss 6 locales) · `95c931104` (de-flake admin-user-tier).

## Note : **9.1 / 10** — verdict **APPROVED (corrobore le 91.2 /team)**

Le lot ferme 4 findings a11y/compliance avec des tests qui vérifient les VRAIES props a11y (role/label/state/live-region), pas juste le render. Toutes les vérifs ci-dessous ont été exécutées localement (UFR-013).

---

## ✅ Bien fait

### Tests — vérifient la vraie prop a11y, pas le render
- **15/15 tests RNTL passent** (exécuté `npx jest` sur les 5 nouveaux specs : 5 suites, 15 tests vert).
- **SettingsAccessibilityCard.test.tsx** : `getByRole('switch')` (résout SEULEMENT si `accessibilityRole="switch"` posé), `props.accessibilityLabel === 'settings.audio_description'`, `accessibilityState.checked` tracke `enabled` (false ET true). Vraie prop, pas snapshot.
- **StreamingBody.liveRegion.test.tsx** : `UNSAFE_queryAllByProps({accessibilityLiveRegion:'polite'})` > 0, streaming ET non-streaming. Vérifie le live-region réel.
- **ChatMessageBubble.a11yText.test.tsx** : prouve le body text reachable + label masquant `a11y.chat.assistant_message` absent (`queryByLabelText → null`) + hint long-press conservé. C'est le cœur du défaut R8.
- **AiDisclosureFooter.test.tsx** : `StyleSheet.flatten(...).opacity` absent ou `=== 1`. Honnêteté explicite : assertion STRUCTURELLE (pas de ratio composité fabriqué — le footer composite sur gradient `<LiquidScreen>`).
- **useChatSession.audioDescription.test.ts** (301 l.) : drive le VRAI effet du hook via session loader + `reload()`, mock expo-speech (speak/stop jest.fn). Vérifie l'ordering cleanup (`invocationCallOrder` : stop AVANT le 2e speak — R4), le cleanup unmount (R3), et la partition content-type (R5 : pas de speak si body text, speak si bodyless). Test de comportement, pas de render.

### Maestro / UFR-021
- `settings-audio-description.yaml` enregistré dans `shards.json` shard `settings`, magic comment `# screen: SettingsScreen`, référence le literal `settings.audio_description`. Tap-through réel (nav → scroll → toggle → retour home).

### De-flake `95c931104` = root-cause, PAS un sleep
- `admin-user-tier.a11y.spec.ts:61` : `await promote.or(demote).first().waitFor({ state: 'visible' })` avant `count()`. Diagnostic correct (`count()` n'a pas d'auto-wait Playwright) ; gate sur l'élément DOM réel, idiome Playwright canonique. **Aucun `waitForTimeout`/sleep arbitraire.**

### i18n 8 locales — gap CI fermé, vérifié
- `node scripts/check-i18n-completeness.js` → **PASSED, 937 keys all locales** (en/fr/de/es/it/ja/zh/ar). Corrobore le message de `648328cb9`.
- `a11y.bottomSheet.dismiss` présent + traduit dans les **8** locales (vérifié par locale : ar/de/es/it/ja/zh ajoutés par `648328cb9`, en/fr préexistants).
- `settings.audio_description`, `a11y.chat.long_press_hint`, `ai_disclosure.chat_footer` présents dans les **8** locales.
- Web (FR/EN only, scope correct) : `a11y.skipToContent` ajouté en.json+fr.json + champ requis dans l'interface `Dictionary` (`i18n.ts`). `tsc --noEmit` web = **EXIT 0, 0 erreur** → toute locale/fixture omettant le champ casserait le build.

### Honnêteté
- Source `AiDisclosureFooter.tsx:34` : commentaire reconnaît que la preuve est structurelle (full contrast) et ne fabrique pas de ratio.
- `accessibility-statement-en.md:61` : claim skip-link « WCAG 2.4.1 satisfied » MAIS qualifie honnêtement « End-to-end keyboard-only operation … has not yet been fully audited beyond this ». Domaine `musaium.app → .com` : 0 occurrence résiduelle dans les 2 statements (vérifié `grep -c`).
- 2 tests non-frozen édités (ChatMessageBubble.test.tsx, .differentiation.test.tsx) **RENFORCÉS** (les anciennes assertions validaient le bug : `getByLabelText('a11y.chat.assistant_message')` truthy). Honnête : éditer était obligatoire (sinon vert sur code corrigé), justifié design §D8. 31/31 passent.
- Lessons file corrobore le 91.2 (5-axis : correctness 93/security 92/maintainability 90/testCoverage 90/docQuality 88), 0 corrective loop, gates verbatim. Le breakdown est cohérent avec le code lu.
- Bundled CI-debt (seedMuseumManager `dateOfBirth`+digit-in-name, admin-user-detail row-scoping `createdAt DESC`) honnêtement disclosé « not part of the a11y lot », fixes root-cause documentés avec citations (`admin.repository.pg.ts:116`, `global-setup.ts`).
- SBOM sentinel `sbom-attest-check.mjs` → EXIT 0 (BE+Web+Mobile contract holds).

### Non-régression
- R5 guard `if (last.text.trim()) return;` (useChatSession.ts) : `ChatUiMessage.text` typé `string` non-null + normalisé `apiMsg.text ?? ''` (chatSessionLogic.pure.ts:143) → pas de risque undefined-access.
- Live-region wrap n'englobe QUE `<MarkdownBubble>`, curseur `▍` reste DEHORS (StreamingBody.tsx) → pas de re-annonce du blink. `polite` batche les annonces.
- Switch : `accessibilityState.checked` reflète `enabled`, le `value`/`onValueChange` natif intact → pas de régression d'état.

---

## ⚠️ Risques tests / i18n

1. **[NIT] Clé i18n orpheline `a11y.chat.assistant_message`** (`museum-frontend/shared/locales/*/translation.json`) — toujours présente dans les 8 locales mais plus référencée en source (seulement dans des assertions de test qui vérifient son ABSENCE dans l'arbre a11y). Le sentinel `check-i18n-completeness.js` ne teste QUE la parité (937 keys), pas les clés inutilisées → ne casse pas la CI, mais c'est de la dead-data (UFR-016). Sévérité : faible.

2. **[NIT] Maestro toggle en `optional: true` double-tap** (`.maestro/settings-audio-description.yaml:~70` — `tapOn id "Audio description" optional:true` + `tapOn point "90%,30%" optional:true`) — les deux taps étant optionnels, le flow ne FAIL pas si le Switch n'est jamais réellement togglé ; il valide surtout « card visible après interaction ». Tap-through présent mais l'assertion d'état-toggle effectif n'est pas garantie. Sévérité : faible (UFR-021 satisfait sur la lettre — happy path + nav réels).

3. **[NIT] `mockDict` inline dupliqué** (museum-web Footer/Header/accessibility-audit/component-snapshots .test.tsx) — chacun ré-ajoute `a11y:{skipToContent:...}` inline. Pré-existant (pas introduit par ce lot), mais ces fixtures grossissent à chaque champ `Dictionary` ; candidat factory DRY (docs/TEST_FACTORIES.md). Sévérité : faible.

4. **[INFO] SBOM sentinel = assertions string structurelles**, pas une vérif cosign cryptographique réelle (auto-documenté dans l'en-tête du fichier). Approprié pour un guard de contrat CI, mais ne prouve pas que l'attestation s'exécute en prod — c'est un garde-fou drift, pas une preuve runtime. Aucun action requise.

---

## 🔧 Reste à faire (hors-blocker)

- Supprimer la clé orpheline `a11y.chat.assistant_message` des 8 locales (burial UFR-016) OU la documenter si réservée.
- (Optionnel) Durcir le flow Maestro : un `assertVisible` post-toggle sur un état distinct, ou retirer le double `optional:true` pour faire échouer le flow si le Switch est introuvable.
- (Tech-debt connue) EAS no-digest residual gap mobile SBOM — déjà tracké TECH_DEBT / ADR-068, CRA Art.13/2027, hors-V1.

---

### Méthode (commandes exécutées)
- `git show e62b93f75 --stat` + diffs par fichier (source + tests).
- `node scripts/check-i18n-completeness.js` → PASSED 937 keys 8 locales.
- Vérif par-locale des 4 clés a11y dans les 8 `translation.json` (node).
- `npx jest` sur 5 nouveaux specs (15/15) + 2 specs édités (31/31).
- `node scripts/sentinels/sbom-attest-check.mjs` → EXIT 0.
- `npx tsc --noEmit` (museum-web) → EXIT 0 / 0 erreur.
- `grep -c musaium.app` statements → 0.
