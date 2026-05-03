# ADR-011 — Rate-Limit: Fail-Closed When Redis Is Down

**Status**: Accepted
**Date**: 2026-04-30
**Deciders**: Tech Lead (sec-hardening-2026-04-30 team), user gate
**Supersedes**: rate-limit fail-open behaviour (silently labelled "fail_closed_fallback" pre-2026-04-30)

## Context

The rate-limit middleware (`museum-backend/src/helpers/middleware/rate-limit.middleware.ts`) used a Redis-backed store in production for distributed limits. When the Redis call rejected (timeout, connection refused, eviction), the middleware silently fell back to a per-instance in-memory bucket and let the request through.

In a single-instance deployment that is acceptable. In a multi-instance load-balanced deployment (current prod), every replica gets its own counter — distributed limits are effectively disabled during the Redis incident, while the misleading log line `rate_limit_redis_fail_closed_fallback` claimed otherwise. Audit 2026-04-30 finding **F2 (HIGH)**: this is a fail-open control mislabelled as fail-closed.

The middleware protects: `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/social-login`, `/api/auth/mfa/verify`, plus chat session/IP/user limiters. A silent disablement opens a credential-stuffing window for as long as Redis is unreachable.

## Decision

**Fail-closed real**: when Redis is configured but unreachable, rate-limited requests respond `503 RATE_LIMIT_UNAVAILABLE` with `Retry-After: 30` and a Sentry alert tagged `{component: 'rate-limit', mode: 'fail-closed'}`. Behaviour gated by `env.rateLimit.failClosed` (env `RATE_LIMIT_FAIL_CLOSED`, default `true` in production, `false` in dev/test so local stacks without Redis remain functional).

The legacy in-memory fallback path is preserved under `failClosed=false` for dev/test — same code, same behaviour, but explicitly opted into via env. The misleading log name `rate_limit_redis_fail_closed_fallback` was renamed to `rate_limit_redis_unavailable_degraded_to_local_bucket` (matches actual behaviour); the new failclosed path emits `rate_limit_redis_unavailable_failclosed`.

## Adversarial Review (Challenger)

| Counter-argument | Response |
|---|---|
| **Availability**: fail-closed locks legitimate users out during Redis incidents. | We lock out only rate-limited endpoints (auth + write paths). Read endpoints (`/me`, `/health`) and chat read remain available. Acceptable trade-off — banking standard prioritises integrity over login uptime. |
| **Cascading failure**: Redis flap → mass 503 → client retry storms → backend overload. | 503 includes `Retry-After: 30` so well-behaved clients back off. Sentry alert via existing transport pages ops within seconds. Auto-recovery on Redis health probe success. |
| **Test friction**: tests using rate-limited routes become flaky if dev Redis is down. | `failClosed=false` is the default in dev/test (`isProduction === false`). In-memory bucket store remains primary path for tests (`redisStore == null` branch unchanged). Production-only enforcement gated on env. |

## Rejected Alternative

**Rename log to `rate_limit_redis_unavailable_degraded_to_local_bucket` and accept fail-open with documentation.** Rejected because per UFR-001 ("no minimal fix as viable option") and OWASP ASVS 6.3.1, rate-limit failures must not silently disable the control. We instead implement that rename for the *legacy dev path* but fail closed for prod.

## Consequences

**Positive**:
- Distributed rate limit cannot be silently disabled by a Redis outage.
- Sentry receives explicit alerts on Redis trouble, surfacing infra issues immediately.
- Misleading log name corrected.

**Negative**:
- Auth endpoints become unavailable to *all* users during Redis incidents (broader blast radius than the previous quiet failure).
- Operators must monitor for `rate_limit_redis_unavailable_failclosed` log spikes.

**Mitigations**:
- Existing Redis HA on the prod stack (managed Redis, automatic failover).
- `Retry-After: 30` keeps client retries sane.
- Sentry alert provides immediate page; ops can flip `RATE_LIMIT_FAIL_CLOSED=false` as an emergency lever if needed (documented escape hatch).

## References

- banking-grade hardening design (deleted 2026-05-03 — see git commit history)
- [OWASP ASVS 6.3.1](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x15-V6-Authentication.md) — rate-limit failure controls
- Commit: `a7052550 feat(rate-limit): F2 fail-closed when Redis is down (ADR-011)`
- Test contract: `museum-backend/tests/unit/middleware/rate-limit-fail-closed.test.ts`
