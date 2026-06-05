# Thème C — Le pipeline chat de Musaium (durcissement 23-27 mai 2026)

> **Période** : 2026-05-23 au 2026-05-27  
> **Commits couverts** : 085d8a81 · 406fe9b8 · cb0d4277 · c6bf75e8 · 134abe29 · eda7a0b7 · 68e62064  
> **Ce que tu vas apprendre** : comment un pipeline chat s'acquiert une défense en profondeur RGPD, comment les bugs de rendu RN surgissent d'une inversion de garde de state, pourquoi dénormaliser une clé de cache en base est parfois la seule solution propre à l'invalidation, et le coût du dead code qui prend de la place dans ta tête.

---

## Vue d'ensemble — l'architecture du chat (défense en profondeur, vérifiée dans le code)

Le pipeline traverse ces couches **dans cet ordre** (vérifié dans `museum-backend/src/modules/chat/chat-module.ts` + `app.ts`) :

| # | Couche | Fichier source (path:ligne) | Moment |
|---|--------|-----------------------------|--------|
| 1 | **V1 keyword guardrail** — filtre synchrone mots-clés insultes / off-topic / injection | `src/modules/chat/adapters/secondary/guardrails/art-topic-guardrail.ts` | avant LLM |
| 2 | **Isolation structurelle du prompt** — `[SystemMessage, SystemMessage(section), …history, HumanMessage]` | `src/modules/chat/useCase/llm/llm-prompt-builder.ts` | construction messages |
| 3 | **Sanitisation input** — `sanitizePromptInput()` + `isCoordinateString()` sur `location` | `src/shared/utils/location.ts:19` | avant injection contexte |
| 4 | **V2 LLM Guard sidecar** — ProtectAI Python, fail-CLOSED, circuit breaker | `chat-module.ts:478-500` | parallèle à V5 |
| 5 | **V2 LLM judge** — OpenAI-as-judge, cap $5/j, fail-OPEN sur timeout | ADR-015 + `chat-module.ts` | parallèle à V4 |
| 6 | **Output guardrail** — keyword sur réponse LLM | symétrique au V1 | après LLM |

**Cache LLM** en dehors du pipeline de sécurité : `LlmCacheServiceImpl` dans `src/modules/chat/useCase/llm/llm-cache.service.ts`. Clé : `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256(canonical)}` (ligne 130). Trois TTL : 7j (generic), 24h (museum-mode), 1h (personalized).

---

## Décortiqué #1 — La fuite GPS inversée (commit 085d8a81, cycles 1-2 du #305)

### L'intention / le bug

Le client mobile envoie toujours sa position sous la forme `"lat:48.86,lng:2.33"` dans le champ `context.location`. Le serveur la passait directement à `sanitizePromptInput()` puis l'injectait dans `<visitor_context>` du prompt LLM **sans vérifier le consentement géolocalisation**. Résultat : un utilisateur qui *refusait* le consentement géo voyait quand même ses coordonnées brutes arriver chez OpenAI — le refus faisait *fuir plus* que l'acceptation. C'est un Art. 7 RGPD inversé.

### Le code

```typescript
// museum-backend/src/shared/utils/location.ts:1-21
export function parseLocationString(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const match = /^lat:([-\d.]+),lng:([-\d.]+)$/.exec(raw.trim());
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lng = Number.parseFloat(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Source de vérité unique
export function isCoordinateString(raw?: string): boolean {
  return parseLocationString(raw) !== null;   // line 19-21
}
```

`isCoordinateString` est ensuite appelé aux deux points d'injection du prompt (géo + summary fallback) : si la chaîne est parseable comme GPS, elle est droppée — jamais interpolée. Les labels texte ("Paris, France") passent sans problème.

### Le modèle de consentement à 3 niveaux (même commit, cycle 2)

```
aucun / anonyme / erreur checker → rien du tout (fail-closed)
location_coarse_to_llm accordé  → ville + pays seulement
location_to_llm accordé         → quartier (suburb ?? neighbourhood) + ville
```

Nouveau type `LocationConsentScope = 'location_to_llm' | 'location_coarse_to_llm'` dans `location-resolver.ts:31`. Pas de migration — le scope coarse est un `VARCHAR` libre dans la table des consentements. `buildCoarseReverseGeocode()` (ligne 159) est la fonction qui produit "Paris, France" depuis un résultat Nominatim, sans jamais inclure la rue, le numéro, ou le code postal.

### La leçon

**Modèle fail-closed par échelons** : quand tu as plusieurs granularités de données sensibles, la bonne architecture est de définir un enum de consentement ordonné et de faire échouer *vers le moins précis*, jamais vers le plus précis. La tentation opposée — "je laisse passer si le consentement global est là" — crée exactement ce genre d'inversion.

### Le piège

`sanitizePromptInput()` ne suffit PAS à protéger une donnée structurée. Elle normalise et tronque des strings mais ne sait pas que `"lat:48.86,lng:2.33"` est une coordonnée GPS. La protection sémantique appartient à la couche métier (le resolver de géolocalisation), pas à la sanitisation générique.

---

## Décortiqué #2 — La fuite base64 dans Langfuse (commit 085d8a81, cycle 2)

### L'intention / le bug

Langfuse est le traçage LLM (observabilité). Son hook `mask` reçoit chaque corps de message avant envoi au cloud. La fonction `stripFreeText` existante ne gérait que les `content` de type `string`. Quand Musaium envoie une photo à l'API vision, le message est multimodal :

```json
[
  {"type": "text",      "text": "Qu'est-ce que cette œuvre ?"},
  {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/..."}}
]
```

Un `content` de type `Array` traversait `stripFreeText` sans aucun masquage — le texte de l'utilisateur *et* le data-URL base64 complet partaient en clair vers `cloud.langfuse.com`.

### Le code

```typescript
// museum-backend/src/shared/observability/strip-free-text.ts:86-133

// Traite UNE part multimodale — immutable (retourne un nouveau objet)
const stripContentPart = (part: unknown): unknown => {
  const partObj = part as Record<string, unknown>;
  if (partObj.type === 'text') {
    if (typeof partObj.text === 'string' && partObj.text !== '') {
      return { ...partObj, text: STRIPPED };        // text → '[STRIPPED]'
    }
    return part;
  }
  if (partObj.type === 'image_url') {
    const imageUrl = partObj.image_url;
    if (typeof imageUrl === 'string') {             // forme bare-string
      return { ...partObj, image_url: STRIPPED };
    }
    if (imageUrl && typeof imageUrl === 'object') { // forme objet {url}
      return { ...partObj, image_url: { ...(imageUrl as Record<string, unknown>), url: STRIPPED } };
    }
  }
  return part;
};

// Dispatch string | Array | autre
const stripContentValue = (value: unknown): unknown => {
  if (typeof value === 'string') return STRIPPED;
  if (Array.isArray(value)) return value.map(stripContentPart);  // NEW
  return value;
};
```

### La leçon

**Deux formes d'un même champ OpenAI** : `image_url` peut être `{url: "data:..."}` (objet) ou directement `"data:..."` (string bare). L'API accepte les deux. Si tu ne gères que la forme canonique de la doc, tu rates l'autre en production. Pattern général : toujours vérifier `typeof` avant de supposer la structure.

**Immutabilité dans un hook de masquage** : `stripFreeText` ne mutate jamais l'objet original (`{ ...partObj, ... }` sur chaque retour). Essentiel car le SDK Langfuse réutilise les corps en interne.

### Le piège

Le hook `mask` de `langfuse-core@3.38.20` appelle `mask({ data: body[key] })` *séparément* par clé `["input", "output"]` — il ne passe PAS `{input: ..., output: ...}` en un seul appel (découvert via `maskPayloads.ts`). La première implémentation ne gérait que le wrapper `{input, output, messages}` et ratait les formes top-level directes. La constante `SEC-001` dans le code documente ce comportement spécifique de la version.

---

## Décortiqué #3 — Invalidation de cache par clé dénormalisée (commit cb0d4277)

### Le bug

Quand un utilisateur met un pouce bas sur une réponse, le système devrait purger la réponse du cache LLM pour qu'elle ne soit pas re-servie. Le code de feedback appelait `cache.del('chat:llm:*')` — mais `LlmCacheServiceImpl` écrit sous `llm:v2:*`. Deux namespaces différents. **Le feedback n'a jamais purgé le vrai cache.** Les mauvaises réponses continuaient à être servies pendant jusqu'à 7 jours (TTL generic).

### Pourquoi c'est difficile à corriger naïvement

Pour reconstruire la clé `llm:v2:{contextClass}:{museumId}:{userId}:{sha256}` au moment du feedback, il faudrait rejouer toute la classification + le hachage canonique avec les mêmes paramètres que lors de la génération. Ces paramètres (model, systemSection, locale, museumName, prompt...) ne sont pas stockés sur la ligne `chat_messages`. Reconstruire = fragile, sur-purge par pattern, ou impossible.

### La solution : dénormalisation ciblée

```typescript
// museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:47-49

/**
 * Intended for persistence stamping ONLY — do NOT use to drive lookup/store.
 */
computeKey(input: LlmCacheKeyInput): string {
  return this.buildKey(input, this.classify(input));
}
```

`computeKey()` est une méthode **pure** (pas d'I/O) rendue publique. Elle est appelée au moment où l'assistant écrit sa réponse en base — la clé exacte est stampée sur la colonne `cache_key text` de `chat_messages`. Plus tard, le handler de feedback appelle simplement `cache.del(message.cacheKey)` : une suppression exacte, sans reconstruction, sans sur-purge.

```
Migration : AddCacheKeyToChatMessages
  → ALTER TABLE chat_messages ADD COLUMN cache_key text (nullable, idempotent)

Stamp à l'écriture (cache-MISS et cache-HIT, les deux chemins)
  → ChatMessageService.tryLlmCacheStore()

Purge au feedback
  → ChatMediaService.invalidateCacheForFeedback() : cache.del(message.cacheKey)
     fail-open : WARN + skip si cacheKey est null (messages antérieurs à la migration)
```

### La leçon

**Dénormalisation ciblée pour l'invalidation** : quand recalculer une clé de cache est coûteux ou fragile, la stocker directement sur la ligne de données concernée est légitime. Ce n'est pas une violation de normalisation — c'est un index d'invalidation. Pattern similaire à stocker un `etag` en base pour valider des requêtes conditionnelles.

**Toujours tester les deux chemins cache-MISS et cache-HIT** : l'edge case T3.5 du commit montre que la clé doit être stampée même lors d'un cache-HIT (la réponse est relue du cache, mais la ligne message est quand même créée — elle a besoin de `cacheKey` pour la future invalidation).

### Le piège

L'ancien `chat-cache-key.util.ts` (589 LOC, maintenant supprimé) avait un scoping "hybride" avec 0 écrivains en production. Il générait une clé différente de `LlmCacheServiceImpl.buildKey()`, rendant toute tentative de cross-invalidation incorrecte. Moral : **un seul endroit calcule la clé** (`llm-cache.service.ts:buildKey`), tous les autres l'importent ou la reçoivent déjà calculée.

---

## Décortiqué #4 — La bulle vide (commits 406fe9b8 + 085d8a81 cycle 5)

### Le bug

Après l'enterrement du streaming SSE (D1, voir #5 ci-dessous), `sendMessageSmart` est always-sync : il retourne une `PostMessageResponseDTO` directement. La garde dans `sendMessageStreaming.ts` qui décidait de finaliser la bulle était :

```
if (!streamingIdRef.current || attempt.imageUri) → finaliser
```

En text-only, `attempt.imageUri` est undefined et `streamingIdRef.current` est défini (le placeholder `-streaming` vient d'être ajouté). La condition était `false` — le bloc de finalisation ne s'exécutait jamais. La bulle assistant restait `text: ''` indéfiniment.

Les tours image fonctionnaient car `attempt.imageUri` est truthy → condition true → finalisation OK. D'où la confusion : "ça marche pour les photos, pas pour le texte".

### Le fix

```typescript
// museum-frontend/features/chat/application/sendStrategies/sendMessageStreaming.ts:118-133

// Non-streaming fallback (image messages or streaming not available)
if (response && context.streamingIdRef.current) {   // ligne 118 — garde unifiée
  // ...
  if (isRenderableAssistantContent(response.message.text, responseMetadata)) {
    // finalise le placeholder → bulle réelle
  } else {
    logEmptyAssistantResponse('streaming');
    context.setMessages((prev) => prev.filter((m) => m.id !== streamingPlaceholderId));
    // supprime l'orphelin plutôt que de laisser une bulle vide
  }
}
```

La nouvelle garde `response && streamingIdRef.current` couvre les deux cas (text + image) via un seul bloc. `isRenderableAssistantContent()` (helper pur ajouté dans `chatSessionLogic.pure.ts`) filtre aussi les réponses dégradées vides/whitespace.

### La leçon

**L'état ref vs l'état argument** : `streamingIdRef.current` est un ref mutable React (non-réactif) qui mémorise l'ID du placeholder en cours. `attempt.imageUri` est un argument d'appel. La garde originale mélangeait les deux sémantiques et créait une asymétrie invisible entre les flux texte et image.

**Le test qui a masqué le bug** : les tests préexistants simulaient un appel `onDone` (le callback SSE) directement — monde fictif que le transport sync ne produit jamais. `Red` du commit 406fe9b8 a dû cibler le chemin `sendMessageSmart` réel pour prouver le bug.

---

## Décortiqué #5 — Le crash Composer (commit c6bf75e8)

### Le bug

Un test `red` précédent (commit 68e62064) avait imposé une structure DOM précise pour les boutons du Composer : il marchait les ancêtres et exigeait que le `lca.parent.props.style.flexDirection === 'row'`. Pour satisfaire ce test, l'éditeur avait utilisé `React.createElement('View', ...)` avec `'View'` comme **string** (primitive hôte) plutôt que comme composant React importé.

En Jest, le mock RN accepte `'View'` string comme composant enregistré. En production React Native 0.83, le runtime lève :

```
"View config getter callback for component `View` must be a function (received `undefined`)"
```

Les host primitives RN (les vrais composants natifs) doivent être passés via leur export composé (`import { View } from 'react-native'`), pas comme strings littéraux.

### Le fix

```tsx
// museum-frontend/features/chat/ui/Composer.tsx (après fix)
// Avant : React.createElement('View', { style: styles.row }, leadingColumn, ...)
// Après :
return (
  <View style={styles.row}>
    <View style={styles.leadingColumn}>
      <Pressable testID="composer-mic-button" ... />
      <Pressable testID="composer-attach-button" ... />
    </View>
    <View style={styles.inputWrap}>
      <ChatInput ... />
    </View>
    {hasAudio ? <Pressable testID="composer-audio-pill" ... /> : null}
  </View>
);
```

Les tests ont été assouplis pour walker les ancêtres de façon sémantique (`findAncestor(column)` puis `findAncestor(row)`) plutôt que d'exiger une shape DOM exacte.

### La leçon

**Mock Jest ≠ runtime RN** : `react-native` jest preset enregistre les composants par string name pour la résolution rapide. Le runtime natif résout via le registre natif de composants — une string `'View'` ne trouve aucun `NativeViewConfigRegistry` entry. Résumé : **si un test ne peut passer qu'en contournant le JSX standard, c'est le test qui est faux, pas l'implémentation**.

**Tests structurels vs tests sémantiques** : exiger `lca.parent.props.style.flexDirection === 'row'` est un test structurel (vérifier l'arbre DOM interne). Exiger "mic AVANT attach DANS une colonne DANS une ligne" est un test sémantique (vérifier le comportement observable). Le second survit aux refactorings, le premier non.

---

## Décortiqué #6 — Enterrement du SSE et du llama-prompt-guard (commits 134abe29 + eda7a0b7)

### Contexte : qu'était le chemin SSE ?

`EXPO_PUBLIC_CHAT_STREAMING` (défaut `false` depuis la décision ADR-001 post-V1) contrôlait si le client appelait `postMessageStream` (SSE) ou `postMessage` (sync JSON). Comme le flag n'a jamais été activé en production, `sseParser.ts` (81 LOC), `chatApi/stream.ts` (214 LOC), `sse-parser.test.ts` (139 LOC) étaient maintenus, typés, et testés sans jamais être exercés réellement.

### Après enterrement

```typescript
// museum-frontend/features/chat/infrastructure/chatApi/send.ts:158-172

/**
 * Smart message sender — always synchronous. The dormant SSE streaming path
 * was buried (D1): the only transport is the non-streaming `postMessage`.
 * The `onToken`/`onDone`/`onGuardrail`/`signal` callbacks accepted by
 * SendMessageSmartParams are intentionally ignored here so the LIVE
 * sendMessageStreaming.ts strategy keeps type-checking.
 */
export const sendMessageSmart =
  (deps: SmartSendDeps) =>
  async (params: SendMessageSmartParams): Promise<PostMessageResponseDTO | null> =>
    deps.postMessage(params);
```

1 051 LOC supprimées. Les callbacks `onToken/onDone/onGuardrail` sont conservés dans les types (pour que `sendMessageStreaming.ts` compile sans changement) mais ignorés à l'exécution.

### llama-prompt-guard

```
museum-backend/src/modules/chat/adapters/secondary/guardrails/llama-prompt-guard.adapter.ts
→ 180 LOC, 0 instanciation dans buildGuardrailProvider() (vérifié chat-module.ts:465-479)
→ docker-compose.llama-prompt-guard.yml → 53 LOC
→ test : 338 LOC
Total supprimé : ~571 LOC
```

Presidio et LLM Guard (les deux providers actifs) sont inchangés. ADR-051 amendé.

### La leçon (UFR-016)

Le dead code a un coût cognitif réel : chaque dev qui ouvre `chatApi/` voit `stream.ts`, essaie de comprendre comment le streaming fonctionne, et passe du temps sur du code qui ne s'exécute jamais. "Il est mort, on l'enterre" — le commit message et le git log *font office de documentation* si tu as besoin de le ressusciter plus tard.

**Règle pratique** : un chemin de code conditionné par un flag qui n'est jamais activé depuis >2 sprints = candidat à l'enterrement, pas au "on le gardera pour plus tard".

---

## Le reste en bref

**Commit 68e62064 — boutons leading-column + dismiss bottom-sheet** : ajout des boutons mic/attach sur la colonne gauche du Composer et correction du dismiss au tap extérieur du bottom-sheet. C'est ce commit qui a introduit le `createElement('View')` string corrigé ensuite par c6bf75e8.

**Commit 085d8a81, cycle 3 — gate TTS et describe derrière le consentement tiers** : `POST /messages/:id/tts` et `POST /chat/describe` envoyaient audio et images à OpenAI sans vérifier le consentement `third_party_ai_audio_openai`. Le endpoint STT le vérifiait déjà. Fix : même gate route-level pour TTS (403 `consent_required`) et describe (calcul des scopes requis selon format audio/image/texte, AND-intersection, fail-closed). Vérifié dans `chat-media.route.ts` et `chat-describe.route.ts`.

**Commit 085d8a81, cycle 4 — export RGPD ArtworkMatch** : `ArtworkMatch` (photos reconnues) était cascade-deleté à l'effacement du compte (donnée personnelle pour la suppression) mais oublié dans l'export Art. 15/20. `schemaVersion` passe de `'2'` à `'3'`, et un allow-list de champs est exporté (sans PK ni FK). Asymétrie suppression/export = bonne checklist de code review sur tout endpoint d'export.

**Commit 085d8a81, cycle observabilité — redaction URLs dans le logger central** : le logger émettait les URLs complètes via `JSON.stringify` sans redaction. Une URL presignée S3 (avec `X-Amz-Signature`, `X-Amz-Credential`, `X-Amz-Security-Token`) partait en clair dans les logs. Fix : pass de redaction récursive via `@musaium/shared scrubUrl/scrubRecord`. Fail-safe : si `JSON.stringify` fail (BigInt, circulaire), émet un marqueur `logContextRedactionFailed` sans throw.

---

## À retenir — takeaways transférables

### RN

1. **`React.createElement('View')` avec string → crash runtime** — Jest mock accepte les strings, le runtime natif non. Toujours importer le composant, jamais passer sa string name à `createElement`.
2. **Tests sémantiques > tests structurels** — vérifier le comportement observable (ordre des éléments, accessibilité) pas l'arbre DOM interne. Un test qui force une implémentation précise casse à la prochaine refacto.
3. **Garde de finalisation bulle** — dans un transport sync, la garde `if (response && streamingIdRef.current)` doit unifier les deux flux (text + image), pas les distinguer par argument d'appel.

### Cache

4. **Dénormaliser la clé de cache sur la ligne de données** quand la reconstruction est coûteuse ou fragile. `computeKey()` pur, stampé à l'écriture, utilisé uniquement pour `del()`.
5. **Un seul endroit calcule la clé** — tout alias ou recalcul parallèle crée un écart de namespace. Importer, pas réimplémenter.
6. **Tester les deux chemins MISS et HIT** pour tout ce qui touche à l'invalidation.

### RGPD / sécurité

7. **Fail-closed = vérifier le consentement le plus tôt possible dans la route** — avant tout appel LLM, TTS, image encoder. La seule exception légitime est `isAuthenticated` (401 avant 403).
8. **Asymétrie suppression/export** — si une entité est cascade-deletée au DSAR effacement, elle doit figurer dans l'export Art. 15. Vérifier les deux chemins ensemble.
9. **Redaction dans le logger ≠ redaction dans les traces LLM** — deux surfaces distinctes qui ont chacune besoin de leur propre pass. `scrubUrl` pour les logs, `stripFreeText` pour Langfuse.
10. **Dead code = coût cognitif réel** — enterre dès qu'un chemin conditionnel n'est pas activé depuis >2 sprints.

---

## Questions de compréhension

1. Explique l'inversion RGPD du GPS : pourquoi *refuser* le consentement géo faisait fuir *plus* de données que l'accepter, avant le fix ? Quel est le rôle de `isCoordinateString()` dans la correction ?

2. `sendMessageSmart` accepte toujours `onToken`, `onDone` et `onGuardrail` dans ses paramètres TypeScript, mais les ignore à l'exécution. Pourquoi avoir gardé ces callbacks dans le type plutôt que de les supprimer ?

3. Décris précisément ce qui se passe dans React Native 0.83 quand on appelle `React.createElement('View', ...)` avec la string `'View'`. Pourquoi Jest ne détecte pas le problème ?

4. Qu'est-ce que le pattern de "dénormalisation ciblée" résout ici, et dans quels autres cas de ton codebase le même pattern pourrait-il s'appliquer ? (Indice : pense aux URLs signées, aux hash de tokens.)

5. `stripContentValue` gère `string | Array | autre`. Pourquoi le cas `autre` retourne-t-il la valeur inchangée plutôt que `STRIPPED` ? Quel est le compromis fait ici ?
