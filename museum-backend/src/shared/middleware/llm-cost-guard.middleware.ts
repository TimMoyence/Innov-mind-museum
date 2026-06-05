import { AppError } from '@shared/errors/app.error';
import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Conservative flat-rate worst-case $/call for the TEXT (LLM-only) fan-out class
 * (pre-launch V1 safety net, ADR-038 follow-up — NOT billing-grade metering, see
 * {@link LlmCostGuard} docstring "not metering"). 250-tok gpt-4o-mini ≈ $0.00015
 * in + $0.0009 out — $0.002 leaves headroom for image-multimodal on the
 * `/messages` path without leaking budget on the cheap path. Kept as the `text`
 * class value below for back-compat with the historical flat charge.
 */
const FLAT_COST_PER_CALL_USD = 0.002;

/**
 * I-FIX3 (a)/(b) — route-keyed worst-case fan-out estimate (design §4/D1).
 *
 * A single HTTP chat request fans out to several paid OpenAI sub-calls and the
 * route template already encodes WHICH sub-calls fire. Charging one flat $0.002
 * regardless under-counts true spend (spec §1 a/b). We sum the conservative
 * worst-case ceiling of each sub-call the route triggers, then charge that as the
 * single per-request delta against the per-user daily cap (ONE `assertAllowed`
 * call — no double-count, no per-sub-call round-trip; NFR "no double-count").
 *
 * These are SAFETY-NET worst-case CEILINGS, not exact per-call billing (the guard
 * is explicitly "not metering"). Grounded in OpenAI list prices (May 2026), with
 * the invariant `audio > text >= tts` (design §4):
 *   - LLM (text)  : gpt-4o-mini ~250 tok ≈ $0.0011, ceiling $0.002 (incl. image
 *                   multimodal headroom on /messages; also the historical flat
 *                   {@link FLAT_COST_PER_CALL_USD}).
 *   - STT (audio) : whisper-1 $0.006/min, ~30s clip ≈ $0.003, ceiling $0.004.
 *   - TTS         : tts-1 $0.015/1k chars, ~125-char reply ≈ $0.0019, ceiling
 *                   $0.0015 (single sub-call, ≤ the text-class LLM ceiling per the
 *                   invariant; a fresh TTS re-synthesis costs no more than a text turn).
 * So `audio` = STT + LLM + TTS ≈ $0.004 + $0.002 + $0.0015 ≈ $0.0075, conservative
 * ceiling $0.012.
 */
const FANOUT_COST_USD = {
  /** LLM-only (+ multimodal headroom). `/sessions/:id/messages`. */
  text: FLAT_COST_PER_CALL_USD, // 0.002
  /** STT + LLM + TTS. `/sessions/:id/audio`. */
  audio: 0.012,
  /** TTS-only re-synthesis. `/messages/:messageId/tts`. ≤ text per the invariant. */
  tts: 0.0015,
} as const;

type FanoutClass = keyof typeof FANOUT_COST_USD;

/**
 * Classifies a request into its paid fan-out class from the route template
 * (`req.baseUrl`/`req.path`), NEVER from `req.body`. The body is unparsed at this
 * middleware seam (mounted AFTER rate-limit, BEFORE the Zod/multer validators —
 * CLAUDE.md mutating-middleware ordering; express/LESSONS.md 2026-05-18), so a
 * route-derived estimate cannot be inflated by a malformed body. An unknown /
 * future paid route falls back to the conservative `text` class (never 0/NaN).
 */
const classifyFanout = (req: Request): FanoutClass => {
  // Prefer the mounted route template (`baseUrl` + `path`). `originalUrl` is the
  // robust fallback when a partial-mock req omits `baseUrl`. Strip any query
  // string so the suffix match is exact.
  const fullPath = `${req.baseUrl}${req.path}`;
  const route = (req.baseUrl ? fullPath : req.originalUrl).split('?')[0];
  if (route.endsWith('/audio')) return 'audio';
  if (route.endsWith('/tts')) return 'tts';
  if (route.endsWith('/messages')) return 'text';
  // `/describe` fans out to LLM + TTS when format ∈ {audio, both} (chat-describe.route).
  // `format` lives in req.body (unparsed at this seam), so we cannot branch on it —
  // classify at the worst case (audio = LLM+TTS), correct for a safety-net cap.
  if (route.endsWith('/describe')) return 'audio';
  // Unknown / future paid route → conservative text-class default (safe, non-zero).
  return 'text';
};

/**
 * Wired once at boot via {@link setLlmCostCounter}. `null` → fail-OPEN (dev/test
 * without Redis). Prod sentinel enforces Redis presence so guard always active there.
 */
let llmCostCounter: LlmCostCounter | null = null;

export const setLlmCostCounter = (counter: LlmCostCounter): void => {
  llmCostCounter = counter;
};

/** @internal */
export const _resetLlmCostCounter = (): void => {
  llmCostCounter = null;
};

/** Maps LlmCostGuardError → 429 with `Retry-After: 60`. P0-4 shape: `{code, dailySpentUsd?, capUsd?}`. */
const toHttpAppError = (err: LlmCostGuardError): AppError =>
  new AppError({
    message: err.message,
    statusCode: 429,
    code: err.code,
    details: {
      ...(err.dailySpentUsd !== undefined ? { dailySpentUsd: err.dailySpentUsd } : {}),
      ...(err.capUsd !== undefined ? { capUsd: err.capUsd } : {}),
    },
    headers: { 'Retry-After': '60' },
  });

/**
 * Asserts per-user daily $/cap + global kill-switch BEFORE paid LLM calls (P0-4, audit 2026-05-12).
 * Mounted on chat routes triggering paid OpenAI/DeepSeek/Google. Anonymous calls bypass per-user
 * cap but kill-switch still applies.
 *
 * Unwired-counter behaviour (W1-C2, run 2026-05-26-kr-domains) splits on `NODE_ENV`:
 *   - production → fail-CLOSED: `next(AppError 503 COST_GUARD_UNAVAILABLE)` +
 *     `logger.error('llm_cost_guard_not_wired_in_production')`. Defense-in-depth — the
 *     boot guard `validateCostGuardRedis` normally prevents booting prod without the
 *     Redis counter, so this branch only fires on a future wiring drift (belt + braces).
 *   - dev/test → fail-OPEN `next()` (unchanged): local dev runs without Redis.
 *
 * I-FIX3 (a)/(b): charges a route-keyed worst-case fan-out estimate
 * ({@link FANOUT_COST_USD} via {@link classifyFanout}) instead of one flat
 * $0.002 — a `/audio` (STT+LLM+TTS) request now costs more against the cap than
 * a `/messages` (LLM-only) one, closing the under-count gap. Still a SINGLE
 * `assertAllowed` call per request (no double-count). The estimate is derived
 * from the route template, never `req.body` (unparsed at this seam).
 */
export const llmCostGuard: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!llmCostCounter) {
    // W1-C2: in production an unwired counter means paid LLM calls would run with
    // NO per-user cap — fail-CLOSED rather than degrade silently. dev/test keep the
    // historical fail-OPEN so local dev needs no Redis.
    if (env.nodeEnv === 'production') {
      logger.error('llm_cost_guard_not_wired_in_production');
      next(
        new AppError({
          message: 'LLM cost guard unavailable',
          statusCode: 503,
          code: 'COST_GUARD_UNAVAILABLE',
        }),
      );
      return;
    }
    next();
    return;
  }

  const guard = new LlmCostGuard({
    killSwitchEnabled: env.llm.costGuard.killSwitch,
    dailyCapUsd: env.llm.costGuard.userDailyCapUsd,
    counter: llmCostCounter,
    logger,
  });

  const userId: string | null = req.user?.id !== undefined ? String(req.user.id) : null;
  const estimatedCostUsd = FANOUT_COST_USD[classifyFanout(req)];

  guard
    .assertAllowed(userId, estimatedCostUsd)
    .then(() => {
      next();
    })
    .catch((err: unknown) => {
      if (err instanceof LlmCostGuardError) {
        next(toHttpAppError(err));
        return;
      }
      next(err instanceof Error ? err : new Error(String(err)));
    });
};
