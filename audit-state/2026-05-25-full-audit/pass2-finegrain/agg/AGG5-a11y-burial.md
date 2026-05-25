# AGG5 — Consolidation A11Y + BURIAL (pass-2 fine-grain)

> Agent d'agrégation READ-ONLY fresh-context. CONSOLIDE les feuilles pass-2 (L21/L22/L16/L17/B8b) contre le contexte pass-1 (A6/A7/B7×2/B8). Aucune re-vérif code — synthèse des verdicts feuilles.
> Branche `dev`. Feuilles pass-2 ancrées HEAD `1fb32f5ba` ; pass-1 ancrée HEAD `89852f2a1` (pre/intra-#298). Pas de divergence de ref matérielle (mêmes commits, code identique sur les items concernés).
> **Point central : la pass-1 (et l'orchestrateur) a flippé I-CMP1/2/3/5 → ✅. La pass-2 confirme que CERTAINS de ces ✅ étaient SUR-ÉVALUÉS.**

---

## 1. Tableau consolidé — verdicts fermes

| Item | Pass-1 (A6/A7) | **Pass-2 consolidé** | Sévérité résiduel | Preuve clé (path:line) |
|---|---|---|---|---|
| **I-CMP1** | ✅ DONE | **✅ PASS (confirmé, recalculé)** | — | `AiDisclosureFooter.tsx:33-40` no opacity ; recompute 9.18-9.70:1 light / 5.71-6.07:1 dark — matche le claim roadmap |
| **I-CMP2** | ✅ DONE | **✅ PASS (confirmé)** | — | `locales/*/translation.json` consent = 40 clés × 8 locales, 0 missing/empty/extra ; traductions réelles |
| **I-CMP3(1)** Speech.stop | ✅ | **✅ PASS** | — | `useChatSession.ts:151` cleanup |
| **I-CMP3(2)** partition double-playback | ✅ | **✅ PASS (airtight)** | — | `useChatSession.ts:129` + `useAutoTts.ts:55` mutuellement exclusifs sur `text` |
| **I-CMP3(3)** Switch role/label/state | ✅ | **✅ PASS** | — | `SettingsAccessibilityCard.tsx:36-38` |
| **I-CMP3(4)** live region | ✅ "fermé" | **⚠️ PASS-with-caveat — NON conditionnel** | LOW-MED (WCAG 4.1.3 robustness) | `StreamingBody.tsx:54` hardcodé ON sur **toutes** les bulles assistant (pas gated `isStreaming`) ; `ChatMessageBubble.tsx:132` |
| **I-CMP3(5)** bubble label masking | ✅ "fermé" | **❌ FAIL côté USER bubble** | **MEDIUM (WCAG 1.3.1 / 4.1.2)** | `ChatMessageBubble.tsx:237-238` user bubble garde `role="text"`+`label="Your message"` → masque le texte tapé |
| **I-CMP4** | ✅ (caveat "non reproductible") | **❌ NOT FIXED — caveat FAUX** | **MEDIUM (WCAG 1.4.3, EAA mobile B2C)** | `tokens.semantic.ts:128-137,52` : white-on-amber **2.15:1**, white-on-green **2.28:1**, badge 11px bold → reproductible déterministe |
| **I-CMP5(a)** skip-link + `<main id>` | ✅ | **✅ DONE (bien testé)** | — | `layout.tsx:32-41` 1er focusable + e2e behavioral `public-skip-link.a11y.spec.ts` |
| **I-CMP5(b)** `.app`→`.com` | ✅ "DONE #298" | **❌ NOT DONE — 4 refs `.app` vivantes** | **MEDIUM (EAA §6 contact mechanism)** | `accessibility-content.ts:32,58,90,116` (`musaium.app` + `support@musaium.app`) ; fichier last-touched `2d25a0f34` 2026-05-14, pré-#298 |
| **I-CMP6** | ⚠️ PARTIAL | **⚠️ PARTIAL (roadmap exact)** | LOW (CRA 2027, hors-V1) | BE `ci-cd-backend.yml:806-813` + web `ci-cd-web.yml:408-415` cosign attest cyclonedx OK ; mobile EAS no-digest tracké TECH_DEBT |
| **P0.D1** burial SSE (source) | ✅ DONE | **✅ COMPLET** | — | `sseParser.ts`/`stream.ts`/`isChatStreamingEnabled` absents ; flag retiré source (résidu test bénin) ; commit `134abe293` |
| **P0.D1** bug bulle-vide texte-seul (P0-FA1) | non couvert pass-1 | **⚠️ BUG CONFIRMÉ (latent, cimenté)** | **P0 launch-critique (UX, non sécu)** | `sendMessageStreaming.ts:117` gate falsy ; placeholder `text:''` jamais rempli ; tests verts car n'assertent pas la bulle |
| **P0.D2** stryker untracked | ✅ DONE | **✅ COMPLET** | — | `git ls-files` vide + gitignored ; commit `e49b75fe5` |
| **P0.D3** llama-prompt-guard burial | ✅ DONE | **✅ COMPLET (never-wired confirmé)** | — | 0 tracké / 0 src / 0 wiring (`buildGuardrailProvider` jamais le retourne) ; commit `eda7a0b7d` |
| **P0.D4** 3 describe.skip morts | ✅ DONE | **✅ DONE (confirmé)** | — | 3 specs absentes du tree ; commit `0d0b2fda5` ; couverture préservée par tests live équivalents |
| **P0.D5** ADR-036 v2 + AiDisclosureModal | ✅ DONE | **✅ DONE pour le scope listé** | LOW (résidus hors-scope, voir §3) | ADR-036 corrigé v1→v2 + modal purgé légaux ; commit `af2d31468` |
| **TD-AS-01** AsyncStorage namespacing | ✅ DONE | **✅ DONE (qualité élevée, zéro perte data)** | — | reader idempotent no-overwrite `migrateStorageKey.ts:33-50` ; 8 migrées + 2 cleanup-only ; câblé migrate-avant-read ×6 ; tokens auth disjoints (SecureStore) |

---

## 2. CORRECTIONS DE TICKS PASS-1 ERRONÉS (cruciales — à reflèter en roadmap)

La pass-1 a flippé 5 marqueurs ❌→✅ (I-CMP1/2/3/5) + laissé I-CMP4 ✅. **4 de ces verdicts étaient sur-évalués** ; ils doivent être DÉ-flippés ou rétrogradés :

### ❌ CORRECTION 1 — I-CMP3 : ✅ → ⚠️ PARTIAL (NON totalement fermé)
La pass-1 (A6) a déclaré « 5/5 sous-violations fermées ». **FAUX sur 2 sous-points** :
- **(5) USER bubble masking** : la pass-1 a vérifié UNIQUEMENT le côté assistant (`ChatMessageBubble.tsx:187-192`) et l'a généralisé. Le côté **USER** (`ChatMessageBubble.tsx:237-238`) porte le **MÊME** défaut `accessibilityRole="text"` + `accessibilityLabel={t('a11y.chat.user_message')}` ("Your message") qui collapse le sous-arbre et **remplace le texte réellement tapé** par "Your message". Un lecteur d'écran relisant l'historique entend "Your message" au lieu du contenu. WCAG 1.3.1 / 4.1.2 résiduel, **non tracké TECH_DEBT**. Le test `ChatMessageBubble.a11yText.test.tsx` n'exerce QUE `makeAssistantMessage` → masking user jamais capté.
- **(4) live region NON conditionnelle** : la pass-1 l'a coché "fermé". En réalité `StreamingBody.tsx:54` est hardcodé `accessibilityLiveRegion="polite"` SANS gate `isStreaming`, rendu sur **toutes** les bulles assistant (`ChatMessageBubble.tsx:132`), pas seulement la réponse en cours de streaming. Risque de re-annonce TalkBack (Android) sur historique recyclé. Le test `StreamingBody.liveRegion.test.tsx:42` **codifie activement le mauvais comportement** ("keeps a polite live region even when not streaming"). WCAG 4.1.3 robustness, sévérité LOW-MED (atténué : `polite` ne coupe pas, iOS ignore l'API).

→ **I-CMP3 doit être ⚠️ PARTIAL**, pas ✅.

### ❌ CORRECTION 2 — I-CMP4 : ✅ (caveat "non reproductible") → ❌ NOT FIXED
La pass-1 (A6) l'a laissé ✅ "inchangé, hors mission" et la roadmap porte un caveat *"contraste mobile non reproductible depuis les tokens"*. **Le caveat est FAUX.** La pass-2 (L22) recalcule depuis `tokens.semantic.ts:128-137` :
- white-on-amber (`#F59E0B`) = **2.15:1** (inProgress + priorityMedium)
- white-on-green (`#22C55E`) = **2.28:1** (resolved)
- (open `#3B82F6` 3.68:1, priorityHigh `#EF4444` 3.76:1 < 4.5:1 aussi)

Badge texte = 11px bold (`tokens.semantic.ts:52`) → **normal text** → exige 4.5:1 ; pas d'exemption large-text, et 2.15/2.28 est même < 3:1 (allowance UI-component). Rendu LIVE confirmé sur `ticket-detail.tsx:304-308` + `TicketsListView.tsx:280-284`. **Reproductible déterministe — caveat à supprimer, I-CMP4 = ❌ open**, défaut EAA WCAG 1.4.3 sur surface mobile B2C.

### ❌ CORRECTION 3 — I-CMP5 : ✅ → ⚠️ PARTIAL
La pass-1 (A6) a vérifié `.app`→`.com` dans `docs/legal/accessibility-statement-{en,fr}.md` (markdown statique) et conclu "0 occurrence `.app`". **MAIS l'a11y statement servi LIVE** est généré par `src/lib/accessibility-content.ts` (consommé par `accessibility/page.tsx`), PAS par les `.md`. Ce fichier source contient **4 refs `.app` vivantes** :
- `accessibility-content.ts:32` (EN) `musaium.app`
- `accessibility-content.ts:58` (EN) `support@musaium.app` ← **contact a11y sur domaine non-possédé/non-délivrable**
- `accessibility-content.ts:90` (FR) `musaium.app`
- `accessibility-content.ts:116` (FR) `support@musaium.app`

`git log -1` sur ce fichier → `2d25a0f34` **2026-05-14** = **#298 ne l'a jamais touché**. Aucun test ne le capte (axe ne flag pas un mauvais domaine ; `accessibility-content.test.ts` ne teste aucun domaine). La substance ORIGINALE du ticket (fix domaine) n'est PAS appliquée. **I-CMP5 = ⚠️ PARTIAL** : skip-link/`<main id>` réels & testés (a) ✅ ; domaine (b) ❌. EAA §6 "contact mechanism" en défaut.

### ✅ NON-corrections (pass-1 correcte)
- **I-CMP1** : recompute pass-2 (9.18-9.70 / 5.71-6.07) confirme le fix structurel ✅.
- **I-CMP2** : 40 clés × 8 locales confirmé exhaustivement ✅.
- **I-CMP6** : ⚠️ PARTIAL pass-1 = exact (BE+web attesté, mobile EAS gap CRA-2027).
- **P0.D1-D5 + TD-AS-01 burial** : tous ✅ confirmés (sauf le bug P0-FA1, qui est un bug consommateur, pas un trou de burial).

---

## 3. NOUVEAUX FINDINGS (non vus en pass-1)

### NF-1 — P0.D5 résidus `llm:v1` hors-scope (ADR-038 / ADR-065) — UFR-013
Le brief audit pass-1 supposait "grep llm:v1 = 0". **FAUX.** Le scope D5 (ADR-036:15,56) est corrigé, mais 2 docs hors-périmètre D5 sont encore stale :
- **`ADR-038-anti-hallucination-citations-websearch.md:76`** — dit `llm:v1:` ET affirme **"LLM cache key shape unchanged… continues to apply"**. Affirmation d'état-courant FAUSSE (la clé prod EST `llm:v2`, `llm-cache.service.ts:119`). **Le plus grave** (claim "unchanged" explicite).
- **`ADR-065-redis-volatile-ttl-with-bullmq-caveat.md:20`** — liste `key shape llm:v1:…` comme état courant. Stale.
→ Nouveau débt **TD-DOC-D5-RESIDUAL** (LOW, doc-honesty). Hors-scope D5 (donc D5 = exécuté conformément), mais réel. Réf source-of-truth : `llm-cache.service.ts:119` `llm:v2:…` (bumpé `d54552beb` 2026-05-19).

### NF-2 — `describe.skip` résiduels : 2, tous justifiés/hors-scope D4
Pass-2 (L17) a chassé les `describe.skip`/`it.skip` non-conditionnels restants :
- `museum-backend/tests/unit/security/prompt-injection.test.ts:86` — `describe.skip('KNOWN BYPASSES — TODO variant analysis')` : débt traçable légitime (`@TODO Phase 5`), KEEP.
- `museum-web/.../user-detail-tier-wire.test.tsx:127` — `it.skip` redondant (couvert par `TierToggleButton.test.tsx`), `Approved-by: dispatcher 2026-05-15`, KEEP.
→ Aucun à enterrer. (`chat-citations.integration.test.ts:32` = commentaire, faux positif grep.)

### NF-3 — Clé i18n orpheline `a11y.chat.assistant_message` (8 locales)
Le fix assistant-bubble a rendu cette clé morte (0 ref source, seulement assertions de test vérifiant son ABSENCE). Présente dans les 8 `translation.json`. Dead-data UFR-016 (non bloquant ; `check-i18n-completeness.js` teste la parité, pas l'usage). À supprimer.

### NF-4 — Bug P0-FA1 bulle-vide texte-seul (consommateur, pas burial)
Confirmé par L16 + B8b par trace byte-level : `sendMessageStreaming.ts:117` gate `if (response && (!streamingIdRef.current || attempt.imageUri))` est **falsy-par-construction** pour le texte-seul post-burial (`sendMessageSmart` always-sync ignore `onDone` → `resetStreaming()` jamais appelé → `streamingIdRef.current` reste truthy ; `imageUri` undefined). Placeholder `text:''` jamais rempli → **bulle assistant vide pour les messages texte-seul** (image/audio OK — asymétrie réelle).
- **NUANCE honnêteté (B8)** : NON introduit par la burial — pré-existait dès que `EXPO_PUBLIC_CHAT_STREAMING` était off (défaut prod). La burial l'a **cimenté** (supprimé l'échappatoire `streaming=true`). `sendMessageStreaming.ts` non modifié par le cluster.
- **Sécu = AUCUNE** (guardrail serveur-side intact, pas de contenu non-modéré rendu — défaut UX pur).
- **Tests verts trompeurs** : `useChatSession.test.ts:214-246` n'asserte que `sendResult` + callArgs, jamais `messages[].text` ; le test `onDone` exerce un callback path MORT (faux positif structurel) ; Maestro `chat-flow.yaml:67` n'asserte que l'écho USER.
→ À valider sur device, mais lecture statique sans ambiguïté. Fix : remplacer le gate par `if (response && response.message.text)` (+ `resetStreaming()`) OU appeler `resetStreaming()` avant le gate.

---

## 4. CONFIRMATIONS SÉCU/DATA (B8b — aucune régression)
- **Tokens auth NON affectés** : vivent dans expo-secure-store (keychain), store disjoint d'AsyncStorage ; `auth.refreshToken`/`auth.accessToken` PAS dans les 10 clés renommées ; `authTokenStore.ts` non touché. Zéro perte de token 1er boot. `keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY` préservé.
- **migrateStorageKey partial-failure safe** : les 2 ordres de panne (`setItem` OK + `removeItem` throw / `setItem` throw) sont safe by design, zéro fenêtre de perte.
- **Race same-key `runtime.defaultLocale`** (I18nContext + runtimeSettings) bénigne (idempotent, même valeur écrite).
- **consentStorageService NON migré = INTENTIONNEL** (GDPR : re-prompt voulu, pas d'héritage de consentement silencieux).
- **llama burial = zéro trou guardrail** (jamais wiré, 6 couches ADR-015 intactes).
- **3 describe.skip supprimés = zéro perte couverture** (redondants avec round-trip migration test + artKeyword.repository unit, tous live).
- Note honnêteté B8b : wording commit `0d0b2fda5` "dead-on-arrival, never executed" imprécis (c'étaient des specs MANUELLES, pas accidentellement mortes) — nuance mineure, couverture effective préservée.

---

## 5. DEBT A11Y / DOC PRIORISÉE

| Priorité | Item | Path:line | WCAG / règle | Tracké ? | Action |
|---|---|---|---|---|---|
| **P0 launch** | Bulle-vide texte-seul (P0-FA1) | `sendMessageStreaming.ts:117` | UX core chat (pas WCAG) | partiellement | Fix gate + test bulle (assert `messages[].text`) + Maestro happy-path texte-seul. Valider device. |
| **MEDIUM** | USER bubble masking | `ChatMessageBubble.tsx:237-238` | WCAG 1.3.1 / 4.1.2 | **NON** | Retirer `role="text"`+`label` (idem fix assistant) ; ajouter test rendant `makeUserMessage`. |
| **MEDIUM** | I-CMP4 badge contrast | `tokens.semantic.ts:128-137` | WCAG 1.4.3 (EAA mobile) | roadmap dit ✅ (faux) | Re-flip ❌ ; assombrir amber/green OU texte non-blanc OU bordure. |
| **MEDIUM** | I-CMP5(b) `.app`→`.com` | `accessibility-content.ts:32,58,90,116` | EAA §6 contact mechanism | roadmap dit ✅ (faux) | Remplacer 4 refs ; ajouter assertion domaine dans `accessibility-content.test.ts`. |
| **LOW-MED** | Live region non conditionnelle | `StreamingBody.tsx:54` | WCAG 4.1.3 | partiellement | Gate sur `isStreaming` ; réécrire `StreamingBody.liveRegion.test.tsx:42`. |
| **LOW** | TD-DOC-D5-RESIDUAL | `ADR-038:76` (+ "unchanged") + `ADR-065:20` | UFR-013 honnêteté | **NON** | v1→v2 OU annoter "historique". ADR-038 prioritaire (claim affirmatif faux). |
| **LOW** | Clé i18n orpheline | `a11y.chat.assistant_message` ×8 locales | UFR-016 burial | **NON** | Supprimer des 8 `translation.json`. |
| **LOW (cosmétique)** | Coverage HTML stale | `coverage/.../AiDisclosureModal.tsx.html`, `dist/...llama*` | — | — | Régénéré au prochain build/test, non versionné. |
| **LOW** | Test gaps migration | `migrateStorageKey` error-path + 4/5 consommateurs sans test wiring | test discipline | — | Ajouter test `catch{}` + carry-forward par consommateur. |

---

## Synthèse

**4 items P0.D + TD-AS-01 = burials solides et complets, zéro régression sécu/data.** Le seul vrai risque latent est **P0-FA1 bulle-vide texte-seul** (P0 launch UX, cimenté par la burial mais pré-existant).

**Côté compliance/a11y, la pass-1 a sur-évalué 4 verdicts** : I-CMP3 (USER bubble masking + live region non conditionnelle), I-CMP4 (caveat "non reproductible" faux, 2.15/2.28:1 réels), I-CMP5 (domaine `.app` jamais corrigé dans le fichier servi live). I-CMP1/2/6 confirmés exacts. Nouveau débt doc UFR-013 (ADR-038/065 `llm:v1` stale).
