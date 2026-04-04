# Maestro E2E Tests

Mobile end-to-end tests for the Musaium app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. **Maestro CLI** installed (`~/.maestro/bin/maestro`)
2. **Development build** of the app installed on the target simulator/device (bundle ID: `com.musaium.mobile.preview`)
3. **Backend** running on `localhost:3000` (`docker compose -f docker-compose.dev.yml up -d` from `museum-backend/`)
4. **Test account** seeded in the database: `e2e-test-login@test.musaium.dev` / `TestPassword123!`

## Test Flows

| Flow | File | Description |
|------|------|-------------|
| Auth | `auth-flow.yaml` | Register new user, verify home, sign out, login, verify home |
| Chat | `chat-flow.yaml` | Start conversation, send message, verify AI response |
| Onboarding | `onboarding-flow.yaml` | Navigate all 3 onboarding slides, verify completion |
| Navigation | `navigation-flow.yaml` | Tab bar (Dashboard, Museums, Home), stack screens (Settings, Preferences, Onboarding) |
| Settings | `settings-flow.yaml` | Theme switch, visit Privacy/Terms/Support, return to home |
| Museum → Chat | `museum-chat-flow.yaml` | Museums tab → tap museum → detail → "Start Chat Here" → chat with museum context |

### Helper Flows

| Helper | File | Description |
|--------|------|-------------|
| Quick Login | `helpers/quick-login.yaml` | Logs in with the seeded test account. Called conditionally by other flows when auth screen is detected. |

## Running Tests

### Single flow

```bash
~/.maestro/bin/maestro test .maestro/auth-flow.yaml
```

### All flows

```bash
~/.maestro/bin/maestro test .maestro/
```

### Specific simulator

```bash
~/.maestro/bin/maestro --device <UDID> test .maestro/auth-flow.yaml
```

### With Maestro Studio (interactive debugging)

```bash
~/.maestro/bin/maestro studio
```

## Notes

- Flows use English UI text since the app defaults to `en` locale.
- The `auth-flow.yaml` generates a unique email using `${Date.now()}` for each run (avoids duplicate registration errors).
- The `chat-flow.yaml` requires a working LLM provider backend; the AI response assertion uses a flexible regex and is marked optional to avoid flakiness with slow providers.
- Flows use `optional: true` for elements that may or may not appear (onboarding skip, consent modal) to handle varying app state.
- The app has no `testID` props in production code; all targeting uses visible text, placeholder text, or `accessibilityLabel` values.

## Seeding the Test Account

Before running flows that depend on login (chat, navigation, settings), ensure the test account exists:

```bash
# From museum-backend/
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "e2e-test-login@test.musaium.dev",
    "password": "TestPassword123!",
    "firstname": "E2E",
    "lastname": "Tester"
  }'
```
