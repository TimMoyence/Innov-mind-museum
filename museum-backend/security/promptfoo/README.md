# promptfoo — chat-endpoint jailbreak regression

V12 W5 §4 P0. PR-blocking gate when `museum-backend/src/modules/chat/**` changes.

## What it does

Sends a curated jailbreak corpus (`jailbreaks.yaml`) to the real chat endpoint and asserts the assistant does NOT:
- Leak the system prompt or boundary marker.
- Adopt a DAN / "unrestricted AI" persona.
- Echo "ignore previous" attacks.
- Comply with off-topic / external-action / forgery / impersonation requests.
- Output insults even when politely framed.

The corpus covers attack families from V12 research §4: DAN, role-confusion, encoded (base64), indirect via fake document, prompt-extraction via repetition, off-topic, Skeleton Key (Microsoft), multilingual.

## Local run

```bash
cd museum-backend
# 1. Boot a local stack (PG + backend on :3000)
docker compose -f docker-compose.dev.yml up -d
pnpm dev &

# 2. Create a visitor user + session (one-shot setup)
#    Save the access token + sessionId.
export PROMPTFOO_PROVIDER_URL=http://localhost:3000
export PROMPTFOO_VISITOR_TOKEN=<JWT-from-/api/auth/login>
export PROMPTFOO_SESSION_ID=<UUID-from-POST-/api/chat/sessions>

# 3. Run
npx promptfoo eval -c security/promptfoo/promptfooconfig.yaml

# 4. View results
npx promptfoo view
```

## CI

`.github/workflows/ci-cd-promptfoo.yml` runs this on every PR that touches the chat module. Job FAILs the PR if any assertion fires.

## Adding new attacks

1. Append to `jailbreaks.yaml` with `description` + `vars.prompt` + `assert` block.
2. Run locally; corpus must STILL pass before merging.
3. Corpus only grows — never delete entries (would be regression coverage loss).

## Limits

- This is regression-only: passing the corpus does NOT prove safety against novel attacks. Combine with the existing `protectai/llm-guard` sidecar (PromptInjection / Anonymize / Toxicity scanners) and the `art-topic-guardrail.ts` keyword pre-filter.
- promptfoo can't introspect server logs — it asserts on response text only. For server-side checks (refusal log, alert), use `tests/ai/guardrail-live.ai.test.ts`.
