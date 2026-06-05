/**
 * W1-D4-FE-05 — carnet image source resolver (spec.md R3/R4).
 *
 * Resolves the best available source for a carnet message image so the carnet
 * stays viewable across an app-data wipe and over a weak/absent network:
 *
 *   - R4 — PREFER a locally-cached derivative (capped image cache or an
 *     explicit `localDerivativeUri`). No network call, no signed-URL re-mint.
 *   - R3 — on a cache miss (cold start / post-wipe), re-mint a FRESH signed URL
 *     via `getMessageImageUrl(messageId)`, re-download it into the capped cache,
 *     and adopt the freshly cached uri. A stale signed GET is NEVER replayed.
 *   - On a re-mint failure, fall back to `fallbackUrl` (the last-known signed
 *     URL embedded in the message) WITHOUT throwing to the caller.
 *   - On unmount, a late async resolution is ignored (closure-cell cancel,
 *     mirrors `useVisitCarnet` / `useResumableSession`, react PATTERNS.md §3).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getMessageImageUrl } from '@/features/chat/infrastructure/chatApi/image';
import { getCachedImage, cacheRemoteImage } from '@/features/chat/application/offlineImageStorage';

export interface UseCarnetImageSourceArgs {
  /** Stable message id used as the cache key + ownership-checked re-mint id. */
  readonly messageId: string;
  /** Optional already-known local derivative uri (preferred when present). */
  readonly localDerivativeUri?: string;
  /** Last-known signed URL from the message; used only if re-mint fails. */
  readonly fallbackUrl: string;
}

export interface UseCarnetImageSourceResult {
  /** The resolved image source uri — always defined (stable shape). */
  readonly uri: string;
}

/**
 * Resolves a carnet message image uri, preferring offline-durable sources.
 *
 * The returned `uri` starts at the best synchronous guess (`localDerivativeUri`
 * if supplied, else `fallbackUrl`) and is upgraded asynchronously to a
 * cached/re-downloaded uri once resolution completes.
 */
export function useCarnetImageSource({
  messageId,
  localDerivativeUri,
  fallbackUrl,
}: UseCarnetImageSourceArgs): UseCarnetImageSourceResult {
  const [uri, setUri] = useState<string>(localDerivativeUri ?? fallbackUrl);

  // Cancellation flag in a ref so reads survive `await` boundaries. Kept in a
  // ref + read inside a `useCallback` (NOT inline in the effect) so the
  // control-flow analysis does not narrow it to the `false` literal it was
  // initialised with — mirrors `useVisitCarnet` (react PATTERNS.md §3).
  const cancelledRef = useRef(false);
  // Read the flag through a function so TS does not narrow `.current` to the
  // `false` literal across `await` boundaries on repeated reads in one scope
  // (`no-unnecessary-condition` otherwise flags later reads as always-falsy).
  const isCancelled = useCallback((): boolean => cancelledRef.current, []);

  const runResolve = useCallback(async (): Promise<void> => {
    // No source message id → nothing to cache/re-mint against; keep the
    // synchronous fallback (or local derivative) the state was initialised with.
    if (messageId.length === 0) return;
    try {
      // R4 — prefer an existing locally-cached derivative (no network).
      const cached = await getCachedImage(messageId);
      if (isCancelled()) return;
      if (cached !== null) {
        setUri(cached);
        return;
      }

      // R3 — cache miss: re-mint a FRESH signed URL (ownership-checked) and
      // re-download into the cache. Never replay the stale fallback GET.
      let remoteUrl: string;
      try {
        const signed = await getMessageImageUrl(messageId);
        if (isCancelled()) return;
        remoteUrl = signed.url;
      } catch {
        // Re-mint failed (offline / denied / network) → fall back without
        // throwing and without attempting a repopulation.
        if (isCancelled()) return;
        setUri(fallbackUrl);
        return;
      }

      const repopulated = await cacheRemoteImage(messageId, remoteUrl);
      if (isCancelled()) return;
      // Adopt the freshly cached uri; if caching could not produce a local
      // file, the freshly-minted remote url is still preferable to the stale
      // fallback.
      setUri(repopulated ?? remoteUrl);
    } catch {
      // Defensive: any unexpected error must not break the carnet render.
      if (isCancelled()) return;
      setUri(fallbackUrl);
    }
  }, [messageId, fallbackUrl, isCancelled]);

  /**
   * Syncs React state with the resolved image source. The
   * `react-hooks/set-state-in-effect` rule flags projecting an out-of-React
   * async result into state as a cascade risk, but `runResolve` is awaited (no
   * synchronous setState chain) and the cancellation flag breaks the loop on
   * unmount — identical to `useVisitCarnet` (B1).
   */
  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- awaited async resolution projected into state; pattern mirrors useVisitCarnet (B1), cancellation flag guards every setState. Approved-by: green-2026-06-02-weak-net-carnet-cache
    void runResolve();
    return () => {
      cancelledRef.current = true;
    };
  }, [runResolve]);

  return { uri };
}
