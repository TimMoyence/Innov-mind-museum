# PLAN 07 — Mobile Tests Setup

**Phase** : 2 (Refactor Structurel — CRITIQUE)
**Effort** : 5 jours (setup + coverage initial)
**Pipeline /team** : standard
**Prérequis** : Aucun
**Débloque** : P08 (sans tests, refactor risqué), P09, P10, P12

## Context

L'audit mobile a révélé la dette technique la plus **critique** : **ZÉRO tests unit**. Le dossier `__tests__/` existe mais est vide. Le coverage est à 0%. Chaque refactor mobile (y compris celui de useChatSession 442L du P08) devient un pari.

Le backend est à 89% ratio tests — le contraste est dangereux. Avant de toucher au code mobile existant, il faut **installer l'infrastructure de test** et viser 30% de coverage en 2 sprints.

**Objectif** : 0% → 30% coverage, infrastructure jest-expo, factories DRY, CI ratchet activé.

**Référence** : `feedback_dry_test_factories.md` — tous les tests mobile DOIVENT utiliser des factories partagées, pas d'inline fixtures.

## Actions

### 1. Choisir le runner

Actuel : Node.js test runner (compile TS → .test-dist/ → run).

Options :
- **Option A** : Rester Node.js runner + ajouter coverage c8 (minimal, pas UI)
- **Option B** (Recommandé) : Migrer vers **jest-expo** (tooling mature RN, snapshots, coverage intégré, React Testing Library)
- **Option C** : Vitest + @testing-library/react-native (émergent, rapide mais moins éprouvé sur RN 0.83)

**Décision** : Option B (jest-expo). Le backend utilise Jest, cohérence stack, écosystème RN.

### 2. Setup jest-expo

`museum-frontend/package.json` :
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest-expo": "~55.0.0",
    "@testing-library/react-native": "^12.0.0",
    "@testing-library/jest-native": "^5.4.0",
    "@types/jest": "^29.0.0"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEach": ["<rootDir>/__tests__/test-utils.tsx"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native|expo|@expo|@expo-google-fonts)/)"
    ],
    "coverageThreshold": {
      "global": { "lines": 30, "branches": 25, "functions": 30, "statements": 30 }
    }
  }
}
```

Supprimer l'ancien runner TS compile step si remplacé.

### 3. Créer `__tests__/test-utils.tsx`

Mocks partagés (cf. `feedback_dry_test_factories.md`) :

```typescript
import '@testing-library/jest-native/extend-expect';
import { render as rtlRender } from '@testing-library/react-native';

// Mocks globaux
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
  Link: ({ children }: any) => children,
}));

// Providers wrapper (theme, i18n, auth mock)
export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(<AllProviders>{ui}</AllProviders>, options);
}

export * from '@testing-library/react-native';
```

### 4. Créer factories DRY `__tests__/helpers/`

Pattern identique au backend (cf. `tests/helpers/` BE) :

```
museum-frontend/__tests__/helpers/
├── auth/
│   ├── user.fixtures.ts         # makeUser(overrides?)
│   └── token.fixtures.ts        # makeAuthToken()
├── chat/
│   ├── session.fixtures.ts      # makeChatSession(), makeChatMessage()
│   └── chatStore.fixtures.ts    # buildMockChatStore()
├── museum/
│   └── museum.fixtures.ts       # makeMuseum(), makeArtwork()
├── conversation/
│   └── conversation.fixtures.ts
└── http/
    └── httpClient.mock.ts       # Axios mock adapter
```

Chaque factory expose `makeXxx(overrides?)` avec defaults sensés.

### 5. Tests prioritaires — Sprint 1 (viser 15% coverage)

Ordre d'impact :

#### Auth flow (critique)
- `features/auth/application/AuthContext.test.tsx` — login/logout, token refresh
- `features/auth/infrastructure/tokenStorage.test.ts` — secure store round-trip
- `features/auth/application/useProtectedRoute.test.ts` — redirect flow

#### Chat contracts (critique)
- `features/chat/domain/contracts.test.ts` — Zod validation
- `features/chat/infrastructure/chatApi.test.ts` — HTTP calls mockés
- `features/chat/application/chatSessionLogic.pure.test.ts` — logique pure (sans React)

#### Stores
- `features/chat/application/chatSessionStore.test.ts` — Zustand store
- `features/settings/application/runtimeSettingsStore.test.ts`
- `features/conversation/application/conversationStore.test.ts`

### 6. Tests prioritaires — Sprint 2 (viser 30% coverage)

#### Hooks
- `features/chat/application/useOfflineQueue.test.ts`
- `features/chat/application/useOfflineSync.test.ts`
- `features/museum/application/useMuseumList.test.ts`

#### Composants critiques
- `features/chat/ui/ChatMessageBubble.test.tsx` (après P08 split)
- `features/auth/ui/LoginForm.test.tsx`
- `features/museum/ui/MuseumCard.test.tsx`

#### Shared
- `shared/infrastructure/httpClient.test.ts`
- `shared/lib/*.test.ts` (utilitaires purs — easy wins)

### 7. CI ratchet mobile

Dans `.github/workflows/ci-cd-mobile.yml`, ajouter :
```yaml
- name: Tests + Coverage
  run: |
    cd museum-frontend
    npm test -- --coverage --ci
- name: Enforce coverage threshold
  run: |
    cd museum-frontend
    npx jest --coverage --coverageThreshold='{"global":{"lines":30}}'
```

Ajouter check "testCount ratchet" comme au BE :
```bash
# Seuil baseline après Sprint 2
EXPECTED_TESTS=150  # à ajuster
ACTUAL=$(npx jest --listTests | wc -l)
[ "$ACTUAL" -ge "$EXPECTED_TESTS" ] || exit 1
```

### 8. Generate OpenAPI types mock

```bash
cd museum-frontend
npm run generate:openapi-types
```

Factories utilisent les types générés → type safety garanti.

## Verification

```bash
cd museum-frontend

# Setup OK
cat package.json | grep jest-expo
ls __tests__/test-utils.tsx
ls __tests__/helpers/auth/user.fixtures.ts

# Tests verts
npm test

# Coverage ≥ 30% après Sprint 2
npm run test:coverage
# Lire le résumé en fin de run

# CI green
# vérifier `.github/workflows/ci-cd-mobile.yml` contient la step coverage
```

## Fichiers Critiques

### Infrastructure (à créer)
- `museum-frontend/jest.config.js` (ou dans package.json)
- `museum-frontend/__tests__/test-utils.tsx`
- `museum-frontend/__tests__/helpers/{auth,chat,museum,conversation,http}/*.fixtures.ts`

### Tests Sprint 1 (à créer, 8-10 fichiers)
- `features/auth/application/AuthContext.test.tsx`
- `features/auth/infrastructure/tokenStorage.test.ts`
- `features/chat/domain/contracts.test.ts`
- `features/chat/application/chatSessionLogic.pure.test.ts`
- `features/chat/application/chatSessionStore.test.ts`
- `features/chat/infrastructure/chatApi.test.ts`
- `features/settings/application/runtimeSettingsStore.test.ts`
- `features/conversation/application/conversationStore.test.ts`

### Tests Sprint 2 (à créer, 10-12 fichiers)
- Hooks offline
- Composants UI critiques (après P08)
- Shared utilities

### CI
- `.github/workflows/ci-cd-mobile.yml` (ajouter coverage step)

### À ne PAS dupliquer (préserver backend patterns)
- Pattern `buildChatTestService()` du backend → reproduire `buildMockChatStore()` côté mobile
- Pattern `makeUser()` du backend → mêmes overrides côté mobile

## Risques

- **Moyen** : premier run jest-expo peut révéler des bugs latents sur les mocks RN. Mitigation : suivre guide officiel, commencer par tests purs (pas de React).
- **Moyen** : tests flaky sur async operations (streaming, offline). Mitigation : `waitFor()` + timeouts raisonnables.
- **Faible** : setup jest-expo peut prendre 0.5 jour de plus. Acceptable.

## Done When

- [ ] jest-expo installé et configuré
- [ ] `test-utils.tsx` avec mocks partagés
- [ ] Factories DRY créées pour auth, chat, museum, conversation, http
- [ ] ≥ 20 fichiers .test.ts(x) avec tests passants
- [ ] Coverage global ≥ 30% lines
- [ ] CI enforced avec coverage threshold
- [ ] Ratchet testCount activé
- [ ] Documentation dans `museum-frontend/__tests__/README.md`
