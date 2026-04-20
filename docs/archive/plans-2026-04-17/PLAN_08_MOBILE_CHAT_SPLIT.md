# PLAN 08 — Mobile Chat Split (God Hooks + Composants)

**Phase** : 2 (Refactor Structurel — CRITIQUE)
**Effort** : 4-5 jours
**Pipeline /team** : enterprise
**Prérequis** : **P07 (tests setup)** — indispensable
**Débloque** : P09, P12 (perf mobile peut cibler sans casser)

## Context

L'audit mobile a identifié 3 god-hooks/composants qui rendent le chat mobile fragile :

| Fichier | LOC | Pourquoi problème |
|---|---|---|
| `features/chat/application/useChatSession.ts` | 442 | Composition 8 sub-hooks, state mutation complexe, non-testable |
| `features/chat/ui/ChatMessageBubble.tsx` | 365 | 11 props, 40+ useState/refs, devrait être 3-4 composants |
| `features/chat/application/useAudioRecorder.ts` | 257 | Web + Native dual paths imbriquées, 8 refs, cleanup fragmenté |

**Objectif** : Dépêtrer ces 3 pièces → hooks/composants ciblés, testables, ~100-150 LOC chacun.

**Contrainte** : Aucune régression fonctionnelle sur chat. L'UX reste identique pixel-perfect après refactor.

## Actions

### 1. Préparer coverage avant refactor

Cf. P07. Minimum requis avant touch :
- `chatSessionLogic.pure.test.ts` vert
- `chatSessionStore.test.ts` vert
- Snapshot test sur `<ChatMessageBubble>` actuel (avant refactor)

### 2. Split `useChatSession.ts` (442 → 3 hooks ~150L)

Responsabilités détectées :
- **State** : messages courants, streaming buffer, loading
- **Sync** : offline queue, retry, reconciliation
- **Api** : HTTP calls, SSE subscription

Découpage cible :
```
features/chat/application/
├── useChatSession.ts              # Facade (80L) — compose les 3 hooks
├── useSessionState.ts             # NEW (150L) — messages + streaming + loading
├── useSessionSync.ts              # NEW (130L) — offline queue + retry + reconcile
└── useSessionApi.ts               # NEW (100L) — HTTP + SSE
```

Facade pattern :
```typescript
export function useChatSession(sessionId: string) {
  const state = useSessionState(sessionId);
  const sync = useSessionSync(sessionId, state);
  const api = useSessionApi(sessionId, state, sync);

  return { ...state, ...sync.publicApi, ...api.publicApi };
}
```

Attention : Zustand stores existants (`chatSessionStore`) conservent leur shape public.

### 3. Split `ChatMessageBubble.tsx` (365 → 4 composants ~80-100L)

Responsabilités détectées :
- **Container** : layout, positioning (user/assistant), background
- **Markdown** : rendu texte riche, liens, code blocks
- **ImageCarousel** : carrousel images, fullscreen, loader
- **Actions** : boutons copy, retry, TTS, context menu trigger

Découpage cible :
```
features/chat/ui/ChatMessageBubble/
├── index.tsx                          # Barrel export + facade 40L
├── MessageContainer.tsx               # NEW (80L) — layout
├── MessageMarkdown.tsx                # NEW (90L) — markdown render
├── MessageImageCarousel.tsx           # NEW (100L) — images
└── MessageActions.tsx                 # NEW (80L) — boutons
```

Facade :
```typescript
export function ChatMessageBubble({ message, ...rest }: Props) {
  return (
    <MessageContainer role={message.role} timestamp={message.createdAt}>
      {message.images?.length ? <MessageImageCarousel images={message.images} /> : null}
      <MessageMarkdown content={message.text} />
      {rest.showActions && <MessageActions message={message} onRetry={rest.onRetry} />}
    </MessageContainer>
  );
}
```

Memoization : chaque sous-composant est `React.memo()` pour éviter re-renders cascade (cf. audit : 40+ useState éparpillés).

### 4. Split `useAudioRecorder.ts` (257 → 2 hooks + facade ~100L)

Platform-specific via `Platform.select` et fichiers `.web.ts`/`.native.ts` :

```
features/chat/application/
├── useAudioRecorder.ts                 # Facade 40L — Platform.select
├── useAudioRecorder.web.ts             # NEW (120L) — MediaRecorder API
└── useAudioRecorder.native.ts          # NEW (120L) — expo-av API
```

Chaque implémentation expose la **même interface** :
```typescript
export interface AudioRecorderApi {
  start(): Promise<void>;
  stop(): Promise<string>;          // returns URI
  cancel(): void;
  isRecording: boolean;
  durationMs: number;
  error: Error | null;
}
```

### 5. Tests de non-régression

Pour chaque split :
- Avant : snapshot test de l'existant
- Après : mêmes snapshots passent
- + Tests unit sur le nouveau hook isolé

Exemple `useSessionState.test.ts` :
```typescript
describe('useSessionState', () => {
  it('initial state loads from store');
  it('appendStreamChunk accumulates correctly');
  it('markMessageFailed sets status + preserves content');
  it('clearStream resets without touching messages');
});
```

### 6. Perf verification

Avant/après : mesurer re-renders avec React DevTools Profiler sur un scenario réel (10 messages, stream en cours).

Cibles :
- Re-renders lors d'un stream chunk : avant ~N — après ≤ N/2
- Time-to-interactive après ouverture session : avant Xms — après ≤ X
- FPS scroll liste messages : avant Y — après ≥ Y (pas de régression)

Résultats dans `docs/plans/reports/P08-perf-before-after.md`.

### 7. Git workflow

1 commit par split file :
```
refactor(chat): extract useSessionState hook
refactor(chat): extract useSessionSync hook
refactor(chat): extract useSessionApi hook
refactor(chat): thin useChatSession as facade
refactor(chat-ui): extract MessageContainer
refactor(chat-ui): extract MessageMarkdown
refactor(chat-ui): extract MessageImageCarousel
refactor(chat-ui): extract MessageActions
refactor(chat-ui): thin ChatMessageBubble as facade
refactor(chat): split useAudioRecorder by platform
```

## Verification

```bash
cd museum-frontend

# Taille des fichiers
wc -l features/chat/application/useChatSession.ts
wc -l features/chat/application/useSessionState.ts
wc -l features/chat/application/useSessionSync.ts
wc -l features/chat/application/useSessionApi.ts
# attendu: 80 / 150 / 130 / 100

wc -l features/chat/ui/ChatMessageBubble/*.tsx
# attendu: 40 / 80 / 90 / 100 / 80

wc -l features/chat/application/useAudioRecorder*.ts
# attendu: 40 / 120 / 120

# Tests verts
npm test

# Coverage monte sur chat/
npm run test:coverage -- --testPathPattern=chat
# attendu: ≥ 50% sur features/chat/application

# Typecheck
npm run lint

# E2E manuel
npm run dev
# → tester: envoi message, stream, offline, audio record, image attach
```

## Fichiers Critiques

### À splitter (existants → modifier)
- `museum-frontend/features/chat/application/useChatSession.ts`
- `museum-frontend/features/chat/ui/ChatMessageBubble.tsx`
- `museum-frontend/features/chat/application/useAudioRecorder.ts`

### À créer (nouveaux)
- `museum-frontend/features/chat/application/useSessionState.ts`
- `museum-frontend/features/chat/application/useSessionSync.ts`
- `museum-frontend/features/chat/application/useSessionApi.ts`
- `museum-frontend/features/chat/ui/ChatMessageBubble/MessageContainer.tsx`
- `museum-frontend/features/chat/ui/ChatMessageBubble/MessageMarkdown.tsx`
- `museum-frontend/features/chat/ui/ChatMessageBubble/MessageImageCarousel.tsx`
- `museum-frontend/features/chat/ui/ChatMessageBubble/MessageActions.tsx`
- `museum-frontend/features/chat/ui/ChatMessageBubble/index.tsx` (barrel)
- `museum-frontend/features/chat/application/useAudioRecorder.web.ts`
- `museum-frontend/features/chat/application/useAudioRecorder.native.ts`

### Tests (à créer)
- `features/chat/application/useSessionState.test.ts`
- `features/chat/application/useSessionSync.test.ts`
- `features/chat/application/useSessionApi.test.ts`
- `features/chat/ui/ChatMessageBubble/__tests__/ChatMessageBubble.test.tsx`
- `features/chat/application/useAudioRecorder.test.ts`

### À préserver
- `features/chat/application/chatSessionStore.ts` — Zustand store shape stable
- `features/chat/domain/contracts.ts` — contrats Zod inchangés
- `features/chat/infrastructure/chatApi.ts` — API calls inchangées
- Toutes les imports publiques via `features/chat/index.ts`

### À réutiliser (pas dupliquer)
- `features/chat/application/chatSessionLogic.pure.ts` — logique pure à exploiter
- `shared/infrastructure/httpClient.ts` — HTTP centralisé
- `shared/ui/*` — composants réutilisables (Button, Text, Icon)

## Risques

- **Haut** : régression UX sur le chat flow (critical path produit). Mitigation : P07 DOIT être fait, snapshots + smoke test manuel obligatoire.
- **Moyen** : re-renders perfs dégradés si memoization mal faite. Mitigation : mesure avant/après, Profiler.
- **Moyen** : platform-specific audio (.web.ts/.native.ts) peut break sur Expo Router. Vérifier que Metro resolve bien.
- **Faible** : naming du barrel index.tsx peut conflit avec l'ancien fichier. Git rename propre.

## Done When

- [ ] useChatSession splitté en 3 hooks + facade 80L
- [ ] ChatMessageBubble splitté en 4 composants + facade 40L
- [ ] useAudioRecorder splitté par Platform
- [ ] Tests nouveaux hooks + composants (≥ 50% coverage chat/)
- [ ] Snapshot test ChatMessageBubble vert avant/après
- [ ] Perf avant/après mesurée (report P08-perf-before-after.md)
- [ ] Aucune régression fonctionnelle (smoke test manuel OK)
- [ ] 10 commits atomiques
- [ ] Lint + typecheck verts
