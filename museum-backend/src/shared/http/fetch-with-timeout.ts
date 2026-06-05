/**
 * PR-14 — DRY consolidation of the `AbortController + setTimeout` pattern
 * previously duplicated across guardrail / embeddings adapters.
 *
 * Behavioural contract (see tests/unit/shared/http/fetch-with-timeout.test.ts):
 *   - Arms an internal `setTimeout(controller.abort, timeoutMs)`.
 *   - Composes the caller-supplied `init.signal` (if any) with the internal
 *     controller via `AbortSignal.any` so EITHER source can abort the fetch.
 *   - Does NOT mutate the caller's `init` (shallow spread).
 *   - ALWAYS clears the timer in `finally` (success, fetch reject, or abort).
 *   - `fetchImpl` is injectable so adapters keep their `fetchFn` DI hook.
 *
 * Divergence — keep inline pattern in these adapters (see PR-14 sentinel):
 *   - embeddings/replicate.adapter.ts   (multi-fetch single budget)
 *   - embeddings/siglip-onnx.adapter.ts (signal feeds onnxruntime, not fetch)
 *   - guardrails/llm-guard.adapter.ts   (chaos pre-fetch abort)
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/spec.md
 *   .claude/skills/team/team-state/2026-05-23-pr-14-fetchWithTimeout/design.md
 *
 * @param url        - fetch target.
 * @param init       - request init; not mutated (shallow spread internally).
 * @param timeoutMs  - hard deadline before `controller.abort()`.
 * @param fetchImpl  - injectable fetch (defaults to global `fetch`).
 * @returns the fetch `Response` if it resolves before the deadline.
 * @throws {DOMException} `AbortError` when the deadline elapses OR when the
 *   caller-supplied `init.signal` aborts (whichever first).
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetchImpl(url, { ...init, signal });
  } finally {
    clearTimeout(timeout);
  }
}
