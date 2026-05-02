# Langfuse self-host (V12 W1)

Local observability for `/team` agents + LangChain chat orchestrator. Telemetry-first principle: measure tokens / latency / error rate per agent and per LLM call before optimizing.

## Quick start

```bash
cd infra/langfuse
cp .env.example .env

# Generate the three required secrets
echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "SALT=$(openssl rand -hex 16)"            >> .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"  >> .env

docker compose up -d
open http://localhost:3002
```

First boot: create an admin user via the UI, then create a project. Copy the public + secret API keys into the BE `.env`:

```env
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3002
```

## What gets traced

| Source | Span type | Captured |
|---|---|---|
| `museum-backend/src/modules/chat/.../langchain.orchestrator.ts` | `llm` | model, prompt, completion, tokens, cost, latency |
| `museum-backend/src/modules/chat/.../chat.service.ts` | `span` | guardrail decisions, RAG retrieval, audio path |
| `/team` agent dispatch (Bash hook) | `span` | agent name, mode, pipeline, gate verdicts |

## Ports

| Service | Host | Container |
|---|---|---|
| Langfuse Web UI | `3002` | `3000` |
| Langfuse Postgres | `5434` | `5432` |

No collision with `museum-backend` (3000), `museum-web` (3001), Musaium dev PG (5433).

## Stop / wipe

```bash
docker compose down                     # stop, keep data
docker compose down && rm -rf data/     # full wipe
```

## Production note

This compose is **local dev only**. For prod:
- Use Langfuse Cloud OR a dedicated VPS with a managed Postgres (Neon / Supabase).
- Pin image to a specific version, not `:latest`.
- Set `LANGFUSE_DB_PASSWORD` from a secret manager.
- Front the web UI with HTTPS (Caddy / Traefik).

## Integration plan

See `docs/plans/V12_W1_LANGFUSE_INTEGRATION.md` for the BE OTel wiring spec (orchestrator instrumentation, LangChain callback handler, /team Bash hook trace forwarder).
