---
name: app
description: "Skill for the App area of InnovMind. 15 symbols across 7 files."
---

# App

15 symbols | 7 files | Cohesion: 86%

## When to Use

- Working with code in `museum-frontend/`
- Understanding how getBiometricEnabled, setBiometricEnabled, useBiometricAuth work
- Modifying app-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `museum-frontend/app/auth.tsx` | AuthScreen, handleLogin, handleRegister, handleForgotPassword |
| `museum-frontend/features/auth/infrastructure/authApi.ts` | register, login, forgotPassword |
| `museum-frontend/app/_layout.tsx` | BiometricGate, handleUnlock |
| `museum-frontend/features/auth/infrastructure/biometricStore.ts` | getBiometricEnabled, setBiometricEnabled |
| `museum-frontend/features/auth/application/useBiometricAuth.ts` | useBiometricAuth, check |
| `museum-web/src/app/global-error.tsx` | GlobalError |
| `museum-backend/src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | reset |

## Entry Points

Start here when exploring this area:

- **`getBiometricEnabled`** (Function) — `museum-frontend/features/auth/infrastructure/biometricStore.ts:4`
- **`setBiometricEnabled`** (Function) — `museum-frontend/features/auth/infrastructure/biometricStore.ts:9`
- **`useBiometricAuth`** (Function) — `museum-frontend/features/auth/application/useBiometricAuth.ts:16`
- **`check`** (Function) — `museum-frontend/features/auth/application/useBiometricAuth.ts:24`
- **`AuthScreen`** (Function) — `museum-frontend/app/auth.tsx:30`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `getBiometricEnabled` | Function | `museum-frontend/features/auth/infrastructure/biometricStore.ts` | 4 |
| `setBiometricEnabled` | Function | `museum-frontend/features/auth/infrastructure/biometricStore.ts` | 9 |
| `useBiometricAuth` | Function | `museum-frontend/features/auth/application/useBiometricAuth.ts` | 16 |
| `check` | Function | `museum-frontend/features/auth/application/useBiometricAuth.ts` | 24 |
| `AuthScreen` | Function | `museum-frontend/app/auth.tsx` | 30 |
| `handleLogin` | Function | `museum-frontend/app/auth.tsx` | 48 |
| `handleRegister` | Function | `museum-frontend/app/auth.tsx` | 73 |
| `handleForgotPassword` | Function | `museum-frontend/app/auth.tsx` | 114 |
| `GlobalError` | Function | `museum-web/src/app/global-error.tsx` | 5 |
| `register` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 26 |
| `login` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 41 |
| `forgotPassword` | Method | `museum-frontend/features/auth/infrastructure/authApi.ts` | 127 |
| `reset` | Method | `museum-backend/src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | 102 |
| `BiometricGate` | Function | `museum-frontend/app/_layout.tsx` | 51 |
| `handleUnlock` | Function | `museum-frontend/app/_layout.tsx` | 56 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SettingsScreen → GetBiometricEnabled` | cross_community | 4 |
| `BiometricGate → GetBiometricEnabled` | intra_community | 4 |
| `SettingsScreen → SetBiometricEnabled` | cross_community | 3 |
| `AuthScreen → Login` | intra_community | 3 |
| `AuthScreen → Register` | intra_community | 3 |
| `AuthScreen → SocialLogin` | cross_community | 3 |
| `AuthScreen → HandleSocialLoginSuccess` | cross_community | 3 |
| `BiometricGate → SetBiometricEnabled` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Application | 2 calls |
| (stack) | 1 calls |

## How to Explore

1. `gitnexus_context({name: "getBiometricEnabled"})` — see callers and callees
2. `gitnexus_query({query: "app"})` — find related execution flows
3. Read key files listed above for implementation details
