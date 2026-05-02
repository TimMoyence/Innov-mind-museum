# V12 W1 — Langfuse integration plan

**Status:** infra ready (`infra/langfuse/`). BE wiring + /team hook = next.
**Owner:** Tim
**Window:** W1 (one week)
**Exit gate:** live dashboard showing tokens/latency/error per `/team` agent and per chat LLM call.

---

## 1. Scope

Two trace producers, one collector (Langfuse).

| Producer | Library | Spans emitted |
|---|---|---|
| `museum-backend` chat orchestrator | `langfuse-langchain` callback handler | `llm` per OpenAI/Deepseek/Google call |
| `/team` skill dispatcher | `langfuse` Node SDK in `.claude/skills/team/lib/trace.ts` (NEW) | `span` per agent dispatch + per gate verdict |

**Out of scope (W1):** mobile (RN) tracing, web admin tracing, BullMQ worker tracing — defer.

---

## 2. Backend wiring — chat orchestrator

### 2.1 Dependencies

```bash
cd museum-backend
pnpm add langfuse langfuse-langchain
```

### 2.2 Env vars (`config/env.ts`)

```ts
LANGFUSE_PUBLIC_KEY: z.string().optional(),
LANGFUSE_SECRET_KEY: z.string().optional(),
LANGFUSE_HOST: z.string().url().default('http://localhost:3002'),
LANGFUSE_ENABLED: z.coerce.boolean().default(false),
```

Default OFF. Opt-in per env. Production: enable in staging first, then prod after validation.

### 2.3 Single client module

```ts
// src/shared/observability/langfuse.client.ts
import { Langfuse } from 'langfuse';
import { env } from '@src/config/env';

let _client: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (!env.LANGFUSE_ENABLED) return null;
  if (_client) return _client;
  _client = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY!,
    secretKey: env.LANGFUSE_SECRET_KEY!,
    baseUrl: env.LANGFUSE_HOST,
    flushAt: 10,
    flushInterval: 5_000,
  });
  return _client;
}

// Graceful shutdown — flush pending spans
export async function shutdownLangfuse(): Promise<void> {
  if (_client) await _client.shutdownAsync();
  _client = null;
}
```

### 2.4 LangChain callback handler

Wire into `src/modules/chat/.../langchain.orchestrator.ts` at the LLM construction site:

```ts
import { CallbackHandler } from 'langfuse-langchain';
import { getLangfuse } from '@shared/observability/langfuse.client';

const lf = getLangfuse();
const callbacks = lf
  ? [new CallbackHandler({ langfuse: lf, sessionId, userId })]
  : [];

const llm = new ChatOpenAI({ model, temperature, callbacks });
```

`sessionId` = `chatSession.id`, `userId` = `user.id` (PII-safe, just UUIDs).

### 2.5 Wrap chat.service operations — PII-safe inputs

**Allowlist for span `input:` fields.** NEVER pass user-controlled raw fields. Use a constrained set of derived attributes:

| Allowed (safe) | Forbidden (PII / prompt-injection vector) |
|---|---|
| `textLen: number`, `lang: 'fr' \| 'en'`, `museumMode: boolean` | `text`, `location`, `locale` (raw), `userInput`, prompt body |
| `sessionId: UUID`, `userId: UUID` | email, name, phone, IP, exact GPS coords |
| Hash of prompt prefix (`sha256(systemPromptPrefix).slice(0,16)`) | full prompts |

```ts
import { getLangfuse } from '@shared/observability/langfuse.client';
import { sanitizePromptInput } from '@modules/chat/.../sanitizePromptInput';

const lf = getLangfuse();
const trace = lf?.trace({
  name: 'chat.handleMessage',
  sessionId,            // UUID — safe
  userId,               // UUID — safe
  input: {              // ALLOWLIST ONLY
    textLen: text.length,
    lang: locale.startsWith('fr') ? 'fr' : 'en',
    museumMode: Boolean(museum),
  },
});

const guardSpan = trace?.span({ name: 'guardrail.input' });
const guarded = await artTopicGuardrail(text);
guardSpan?.end({ output: { decision: guarded.decision } }); // decision is enum, not user text

// ... LLM call inherits via langfuse-langchain CallbackHandler ...

trace?.update({ output: { responseLen: response.length } });
```

Reuse `sanitizePromptInput()` for any field that MUST be passed (Unicode normalize + zero-width strip + truncate). When in doubt: log a length, log a hash, log a class — never the value.

### 2.6 SIGTERM ordering — flush AFTER in-flight requests drain

`shutdownLangfuse()` MUST run **after** the HTTP server stops accepting and `server.close()` resolves; otherwise the spans for in-flight requests are dropped. Mirror this for the BullMQ worker.

```ts
// src/index.ts
const httpServer = app.listen(PORT);

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown begin');
  // 1. Stop accepting new requests; wait for in-flight to complete.
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  // 2. Drain BullMQ worker (existing).
  await knowledgeExtractionWorker?.close();
  // 3. NOW flush observability — all spans for the just-completed requests are queued.
  await shutdownLangfuse();
  // 4. Close DB pool.
  await dataSource.destroy();
  logger.info('shutdown done');
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

If you call `shutdownLangfuse()` first, the SDK flushes early and the spans created during the `server.close()` drain window are lost.

### 2.7 `safeTrace()` helper — fail-open on any Langfuse error

Wrap every Langfuse SDK call. If Langfuse is unreachable, slow, or throws, the chat path MUST continue.

```ts
// src/shared/observability/safeTrace.ts
import { logger } from '@shared/logger';

export function safeTrace<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err) {
    logger.warn({ err, label }, 'langfuse trace dropped (fail-open)');
    return undefined;
  }
}
```

Usage in chat.service:

```ts
const trace = safeTrace('chat.trace.create', () =>
  getLangfuse()?.trace({ name: 'chat.handleMessage', /* ... */ })
);
const guardSpan = safeTrace('chat.span.guardrail', () => trace?.span({ name: 'guardrail.input' }));
// ...
safeTrace('chat.span.end', () => guardSpan?.end({ output: { decision: guarded.decision } }));
```

This makes Langfuse a true side-channel: zero impact on response latency or correctness.

---

## 3. /team hook — agent dispatch tracing

### 3.1 Helper module

`/Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/skills/team/lib/trace.sh`

Bash helper that POSTs a span to Langfuse via `curl`. Reads `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` from `~/.claude/.env.langfuse` (gitignored).

```bash
trace_span() {
  local name="$1" agent="$2" pipeline="$3" verdict="$4" duration_ms="$5"
  [ -z "${LANGFUSE_HOST:-}" ] && return 0
  curl -fsS -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" \
    -X POST "$LANGFUSE_HOST/api/public/ingestion" \
    -H 'content-type: application/json' \
    --max-time 2 \
    -d "{...}" >/dev/null 2>&1 || true
}
```

Fail-open: if Langfuse unavailable, the trace is dropped silently — `/team` dispatch continues.

### 3.2 Wire into dispatcher

In `team-dispatcher.md` (V12) Step 4 (Execute Pipeline), source the helper and call `trace_span` at:
- agent dispatch start / end
- gate verdict (PASS / WARN / FAIL)
- finalize step

---

## 4. Validation gate

Exit W1 = all true:

- [ ] `docker compose up -d` boots cleanly, UI reachable on `:3002`
- [ ] Backend launches with `LANGFUSE_ENABLED=true` and emits ≥1 trace per chat message in dev
- [ ] One `/team standard` run produces ≥1 span per agent dispatch in Langfuse
- [ ] Dashboard view shows: tokens by model, p50/p95 latency, error count
- [ ] BE startup with `LANGFUSE_ENABLED=false` is identical (zero overhead, no network calls)

---

## 5. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Langfuse blocks chat path on network hiccup | `flushAt: 10 / flushInterval: 5s` async batch + try/catch in client wrapper |
| Secrets leaked in trace inputs (PII) | Strip user-controlled fields before `input:` — mirror existing `sanitizePromptInput()` |
| Local PG growth | bind-mounted to `infra/langfuse/data/`; weekly `docker exec langfuse-db psql -c "VACUUM"` |
| Production cost | Langfuse self-host = free; only infra cost (1 VPS or shared Postgres) |

---

## 6. Out of scope / next steps

- W2 sees `/team` v12 dispatcher land. Trace helper integration happens there, not here.
- BullMQ worker tracing → backlog
- Mobile request tracing → backlog (would need a BE proxy span)
- Custom score exports → backlog
