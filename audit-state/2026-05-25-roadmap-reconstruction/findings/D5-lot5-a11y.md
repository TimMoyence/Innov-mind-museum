# DOMAINE 5 — LOT 5 a11y / compliance (vérification read-only)

> Agent fresh-context UFR-022. Ref unique vérifiée : **`dev`** (HEAD `9aff378b0`, confirmé `git rev-parse`). Aucune branche dédiée LOT 5 → a priori OPEN, confirmé item par item par lecture du code. Preuves = `Read`/`Grep` réels, path:line re-localisés (UFR-024).

---

- **I-CMP1** — Verdict: **OPEN**
  - Preuve: `museum-frontend/features/chat/ui/AiDisclosureFooter.tsx:36` — `opacity: 0.7` toujours présent dans le style `text`, appliqué au texte de la notice AI Act Art.50 (`color: theme.textSecondary`, ligne 20). Le fix attendu (retirer `opacity`) n'a PAS été appliqué.
  - Détail contraste : `textSecondary` = `'#e4cfc2'` (`shared/ui/tokens.semantic.ts:109`, thème sombre). L'opacity 0.7 réduit mécaniquement le contraste effectif sous le seuil 4.5:1 AA (texte `fontSize.xs`, donc « normal text », pas « large text »). Le réducteur d'opacité qui CAUSE la violation est présent et vérifié ; le chiffre exact 3.55–4.09:1 du doc dépend du fond composé (BlurView/thème) que je n'ai pas calculé pixel-près → je confirme la PRÉSENCE de la cause, pas le ratio numérique au centième.
  - Ref vérifiée: `dev`
  - Action roadmap: reste P0 (❌). Fix 1 ligne = supprimer `opacity: 0.7` ; relire couleur ou éclaircir token si besoin pour atteindre ≥4.5:1.
  - Confiance: haute (sur la présence de `opacity:0.7`) ; moyenne sur le ratio numérique exact (non recalculé pixel-près).

---

- **I-CMP3** — Verdict: **OPEN (5/5 sous-points ouverts)**
  - Preuve globale: les 5 sous-violations a11y audio-description sont toutes présentes sur `dev`. Détail :

  - **(1) `Speech.stop()` zéro caller dans `useChatSession.ts`** → OPEN.
    `museum-frontend/features/chat/application/useChatSession.ts:111-129` — l'effet autoplay audio-description appelle `Speech.speak(desc, { language: locale })` (ligne 125) via `require('expo-speech')`, MAIS l'effet n'a **aucune fonction de cleanup** (pas de `return () => Speech.stop()`). Grep global `Speech.stop` dans `features/chat` : 0 occurrence (les `.stop()` trouvés = `animation.stop()`, `loop.stop()`, `track.stop()`, `speech.stop()` dans `VoiceSessionIntroSheetContent.tsx:84` — un AUTRE fichier). Conséquence : un nouveau message ou un blur/navigation ne coupe pas la lecture en cours.

  - **(2) Double-playback race entre 2 moteurs TTS** → OPEN.
    Deux chemins autoplay se déclenchent sur le MÊME dernier message assistant quand l'audio-description est activée :
    - `useChatSession.ts:111-129` — lit `metadata.imageDescription` via **expo-speech** (TTS device natif), gardé `if (!audioDescriptionMode) return`.
    - `useAutoTts.ts:44-59` — lit le corps du message via **server TTS** (`togglePlayback` → `useTextToSpeech` → expo-audio), wiré dans `app/(stack)/chat/[sessionId].tsx:180` avec `enabled: effectiveAudioDesc` (dérivé de `audioDescEnabled = useAudioDescriptionMode()`, ligne 167+174).
    Les deux gates dérivent de la même préférence `audioDescriptionMode`. Un message assistant porteur d'une `imageDescription` ET d'un `text` → expo-speech + server-TTS jouent **simultanément**, sans coordination (aucun des deux n'arrête l'autre). Race confirmée.

  - **(3) `<Switch>` sans accessibilityLabel/Role/State dans `SettingsAccessibilityCard.tsx`** → OPEN.
    `museum-frontend/features/settings/ui/SettingsAccessibilityCard.tsx:32-36` — le `<Switch>` n'a QUE `value`, `onValueChange`, `trackColor`. Aucun `accessibilityLabel`, `accessibilityRole`, ni `accessibilityState`. Le libellé (`settings.audio_description`, ligne 22-23) est dans un `<View>` frère non associé au Switch. Lecteur d'écran : annonce l'état du switch sans dire ce qu'il contrôle.

  - **(4) Réponse streamée sans live region** → OPEN.
    Le texte de réponse streamé est rendu par `StreamingBody` → `<MarkdownBubble text={text} />` (`features/chat/ui/bubbleSections/StreamingBody.tsx:46`), qui n'a **aucun** `accessibilityLiveRegion`. Les seules live regions `accessibilityLiveRegion="polite"` trouvées (`StatusIndicator.tsx:46`, `TypingPlaceholder.tsx:107`, `VoiceSessionIntroSheetContent.tsx:116/127`) couvrent l'indicateur de statut/typing, PAS le contenu de la réponse. Le texte incrémental de la réponse n'est donc jamais annoncé en live region. Nuance honnête : il existe une polite region sur le statut « en train de composer », mais le claim doc vise le contenu de la réponse → exact.

  - **(5) Bubble label masque le texte (`ChatMessageBubble.tsx`)** → OPEN.
    `museum-frontend/features/chat/ui/ChatMessageBubble.tsx:187-189` — le `<Pressable>` assistant porte `accessibilityRole="text"` + `accessibilityLabel={t('a11y.chat.assistant_message')}` (libellé STATIQUE). Le vrai texte de réponse vit dans `bubbleContent` → `<StreamingBody text={message.text} />` (ligne 132-136). Un `<Pressable>` (accessible par défaut) avec `accessibilityLabel` explicite collapse son sous-arbre en UN seul nœud annonçant uniquement le libellé → le texte réel de la réponse est masqué pour le lecteur d'écran (override).

  - Ref vérifiée: `dev`
  - Action roadmap: reste P0 (❌). PARTIAL impossible — les 5/5 sont ouverts. Cross-ref : sous-point (3) Switch + (2) race expo-speech/server-TTS apparaissent aussi en NOW C10 (DOMAINE 8) → verdict unique ici.
  - Confiance: haute (chaque sous-point lu directement).

---

- **I-CMP5** — Verdict: **OPEN** (2 prongs ouverts)
  - Preuve (skip-link absent): grep `skip-link`/`skip-to-content`/`href="#main"`/`Aller au contenu` dans `museum-web/src` → **0 occurrence**. `museum-web/src/app/[locale]/layout.tsx:25` a `<main className="flex-1">` SANS `id` ni ancre skip. Le statement lui-même l'admet : `docs/legal/accessibility-statement-en.md:61` « No skip-link is implemented (WCAG 2.4.1) ». Violation WCAG 2.4.1 confirmée.
  - Preuve (domaine faux): `accessibility-statement-en.md:31,32,104` et `accessibility-statement-fr.md:31,32,104` pointent `support@musaium.app` + `https://musaium.app`. Le domaine canonique de prod est **`musaium.com`** (329 occurrences repo vs 36 pour `.app` ; `museum-web/.env.example:5` `NEXT_PUBLIC_SITE_URL=https://musaium.com` ; `next.config.ts:62` `api.musaium.com`). Donc `.app` = FAUX domaine, sur les DEUX statements. Claim doc vérifié vrai.
  - Ref vérifiée: `dev`
  - Action roadmap: reste P0 (❌). 2 actions : (a) implémenter skip-link → `<main id="main">` ; (b) corriger `.app`→`.com` (3 lignes × 2 fichiers EN/FR). Note : statement déclare honnêtement « partial / skip-link absent » — ce n'est pas un faux claim de conformité, mais le domaine `.app` EST une erreur factuelle.
  - Confiance: haute.

---

- **I-CMP6** — Verdict: **OPEN** (état acté — gap CRA Art.13, prio basse, deadline 2027)
  - Preuve (BE SBOM non-signé): `.github/workflows/ci-cd-backend.yml:99-103` génère `sbom.json` via `@cyclonedx/cyclonedx-npm` (CycloneDX spec 1.5), puis `:105-111` upload comme **artifact** CI (`sbom-backend`, retention 90j). PAS de `cosign attest --predicate sbom.json` / `--type cyclonedx`. Le `cosign sign` (`:785`) + `actions/attest-build-provenance@v2` (`:788-793`) attestent le **digest de l'IMAGE** (SLSA provenance image), pas le SBOM. Donc le SBOM lui-même n'est ni signé ni attesté → claim doc « CycloneDX artifact, pas cosign attest » exact.
  - Preuve (web/mobile zéro SBOM): grep `sbom|cyclonedx|cosign|attest|syft` dans `ci-cd-web.yml` + `ci-cd-mobile.yml` → **0 occurrence**. Aucun SBOM côté web ni mobile. Claim doc vérifié vrai.
  - Ref vérifiée: `dev`
  - Action roadmap: reste OPEN prio BASSE (⚠️ deadline CRA Art.13 2027). Pas un bloqueur V1 2026-06-07. Actions futures : (a) `cosign attest --type cyclonedx --predicate sbom.json` sur le digest BE ; (b) ajouter SBOM web (cyclonedx-npm) + mobile (cyclonedx pour le bundle/Pods).
  - Confiance: haute.

---

## Synthèse comptage verdicts (DOMAINE 5)

| Verdict | Count | IDs |
|---|---|---|
| OPEN | 4 | I-CMP1, I-CMP3 (5/5 sous-points), I-CMP5, I-CMP6 |

- Aucune branche dédiée LOT 5 → 100 % OPEN sur `dev`, conforme à l'hypothèse de départ.
- **I-CMP3 = 5/5 sous-violations réellement ouvertes** (pas PARTIAL).
- Statement a11y web : domaine **FAUX** (`musaium.app` au lieu de `musaium.com`) sur EN+FR ; skip-link réellement absent (admis par le statement L61).
- Aucune claim doc DOMAINE 5 trouvée fausse : les 4 items + les 5 sous-points I-CMP3 sont tous corroborés par le code.
