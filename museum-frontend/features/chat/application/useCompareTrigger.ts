/**
 * `useCompareTrigger` — orchestrates the image-compare flow (Cycle D, Option C).
 *
 * Wiring layer between the attachment-picker "Compare" action and the existing
 * compare pipeline. It owns the three responsibilities the raw
 * `useCompareImage` mutation deliberately does NOT:
 *   1. (D-01) Call the compare wire with the current session context
 *      (`{ image, sessionId, locale }`).
 *   2. (D-02) On success, `reload()` the session EXACTLY once so the assistant
 *      message the backend already persisted (`compare.use-case.ts:139`,
 *      `metadata.compareResults`) surfaces in the store → the existing carousel
 *      (`ChatMessageBubble.tsx:276`) renders it. No downstream rewiring needed.
 *   3. (D-08) Expose `isPending` + an i18n-mapped `error` (never the raw axios
 *      detail — `useCompareImage` already maps 503 / `COMPARE_ENCODER_UNAVAILABLE`
 *      to `chat.compare.error.unavailable`).
 *
 * Anti-stale guard (D-08.3, closure-cell — lib-docs react/PATTERNS.md:73 variant
 * (b) ref-tick ; @tanstack/react-query LESSONS.md 2026-05-18 "react-query does
 * NOT de-dupe mutations → overlapping in-flight calls can clobber"): a compare
 * that resolves AFTER the user switched sessions MUST NOT drive the new
 * session's `reload()` (it would surface the previous session's compare message
 * in the wrong thread). We capture the `sessionId` at trigger time and compare
 * it to the live `sessionId` in the success/error callbacks; a mismatch
 * discards the late result.
 *
 * Delegation rationale (DRY/hexagonal): retry policy + i18n error mapping live
 * in `useCompareImage`; this hook only adds orchestration (reload + anti-stale +
 * observable error string). It does NOT re-implement the wire call.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCompareImage } from '@/features/chat/application/useCompareImage';

/** RN-shaped image file as returned by `expo-image-picker`. */
interface RnImage {
  uri: string;
  name: string;
  type: string;
}

export interface UseCompareTriggerParams {
  /** Session the compare call is associated with (also the anti-stale key). */
  readonly sessionId: string;
  /** Locale for templated rationales / artwork facts. */
  readonly locale?: 'fr' | 'en';
  /** Session reloader (`useChatSession().reload`) — surfaces the persisted message. */
  readonly reload: () => Promise<void> | void;
}

export interface UseCompareTriggerResult {
  /** Fire a compare for the picked image against the current session context. */
  readonly trigger: (image: RnImage) => void;
  /** True while a compare request is in flight. */
  readonly isPending: boolean;
  /** i18n-mapped error message, or `null` when there is no error. */
  readonly error: string | null;
}

/**
 * Orchestrates `useCompareImage` + session `reload` with an anti-stale guard.
 */
export const useCompareTrigger = ({
  sessionId,
  locale,
  reload,
}: UseCompareTriggerParams): UseCompareTriggerResult => {
  // Opt out of the 5xx back-off retry: this is a user-initiated, in-screen
  // action whose error MUST surface promptly (D-08.2) — a 1-3s retry chain
  // would leave the user staring at a spinner. The i18n error mapping in
  // `useCompareImage` still applies on the single attempt.
  const mutation = useCompareImage({ retry: false });
  const [error, setError] = useState<string | null>(null);

  // Live mirror of the active session. The success/error callbacks read THIS,
  // not the value captured in their closure, to detect a session switch that
  // happened while the compare was in flight (closure-cell anti-stale guard,
  // react/PATTERNS.md:73 variant (b)).
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const trigger = useCallback(
    (image: RnImage) => {
      // Reset any prior error so the observable state is fresh per attempt.
      setError(null);
      // Snapshot the session this compare belongs to. Compared against the
      // live ref in the callbacks below to drop a late, stale result.
      const triggeredFor = sessionId;

      mutation.mutate(
        { image, sessionId, locale },
        {
          onSuccess: () => {
            // Guard BEFORE the side-effect: a result that resolved after the
            // session changed must not reload the new (wrong) session.
            if (sessionIdRef.current !== triggeredFor) return;
            void reload();
          },
          onError: (err: Error) => {
            // Same anti-stale guard: a stale failure must not pollute the
            // current session's error surface.
            if (sessionIdRef.current !== triggeredFor) return;
            // `useCompareImage` already maps 503 / encoder-unavailable to the
            // i18n key; never leak the raw axios detail.
            setError(err.message);
          },
        },
      );
    },
    [mutation, sessionId, locale, reload],
  );

  return {
    trigger,
    isPending: mutation.isPending,
    error,
  };
};
