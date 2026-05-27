/**
 * RED tests — D-wiring D-01 (wiring réel), D-02 (surfaçage via reload),
 * D-08 (loading / erreur i18n / anti-stale).
 *
 * SUT (à livrer par le GREEN — N'EXISTE PAS aujourd'hui) :
 *   `museum-frontend/features/chat/application/useCompareTrigger.ts`.
 *
 * Pourquoi un hook dédié : l'Option C (spec-cycleD-wiring-amendment.md) exige
 * un consommateur de `useCompareImage` qui (1) appelle le compare avec le
 * contexte session, (2) déclenche `reload()` au succès pour surfacer le
 * message assistant DÉJÀ persisté par le backend (`compare.use-case.ts:139`,
 * metadata.compareResults), (3) gère loading / erreur i18n / anti-stale.
 * `design-cycleD.md:192` nomme ce hook `useCompareTrigger`.
 *
 * Contrat cible observable :
 *   const { trigger, isPending, error } = useCompareTrigger({ sessionId, locale, reload });
 *   - trigger(image) → imageComparisonApi.compare({ image, sessionId, locale })
 *   - succès → reload() invoqué exactement une fois (D-02)
 *   - isPending true pendant l'appel, false après (D-08.1 / D-08.4)
 *   - error = message mappé i18n sur échec, jamais le détail axios brut (D-08.2)
 *   - anti-stale : un succès stale (session précédente) ne déclenche pas le
 *     reload de la session courante (D-08.3, closure-cell — react/PATTERNS.md:73,
 *     @tanstack LESSONS.md 2026-05-18 "queryFn ignore AbortSignal → race").
 *
 * État actuel : `useCompareImage` (le hook délégué) existe et marche, mais
 * AUCUN code ne l'importe (dead code D-01). `useCompareTrigger` n'existe pas →
 * `require()` jette "Cannot find module" → tous ces cas ÉCHOUENT.
 *
 * lib-docs:
 *  - react/PATTERNS.md:73 (closure-cell cancellation, await→setState guard).
 *  - react/PATTERNS.md:152 (assert observable hook state, never RQ internals).
 *  - @tanstack/react-query/LESSONS.md:5-12 (race / stale clobber on overlapping
 *    in-flight requests — react-query NE dé-duplique PAS les mutations).
 */
import '../../../helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithQueryClient } from '../../../helpers/data/renderWithQueryClient';
import { makeCompareResult } from '../../../helpers/factories';

// ── Mock the infra façade the trigger ultimately calls (through useCompare
//    image). Mocking at the imageComparisonApi boundary keeps the real
//    useCompareImage retry/i18n logic exercised end-to-end. ─────────────────
const mockCompare = jest.fn();
jest.mock('@/features/chat/infrastructure/imageComparisonApi', () => ({
  imageComparisonApi: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}));

interface RnImage {
  uri: string;
  name: string;
  type: string;
}

interface UseCompareTriggerParams {
  sessionId: string;
  locale?: 'fr' | 'en';
  reload: () => Promise<void> | void;
}

interface UseCompareTriggerResult {
  trigger: (image: RnImage) => void;
  isPending: boolean;
  error: string | null;
}

type UseCompareTriggerHook = (params: UseCompareTriggerParams) => UseCompareTriggerResult;

const loadHook = (): UseCompareTriggerHook => {
  // Lazy require → a missing SUT surfaces as a clean per-test "Cannot find
  // module" (RED-confirmed) instead of crashing the whole file at load.
  const mod = require('@/features/chat/application/useCompareTrigger') as {
    useCompareTrigger: UseCompareTriggerHook;
  };
  return mod.useCompareTrigger;
};

const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleImage: RnImage = {
  uri: 'file:///tmp/photo.jpg',
  name: 'photo.jpg',
  type: 'image/jpeg',
};

/** A controllable deferred so a test can hold the compare mutation in-flight. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useCompareTrigger — D-01 / D-02 / D-08 (Option C)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── D-01 : the trigger actually calls the compare wire with session ctx ──
  it('calls imageComparisonApi.compare with the picked image + session context (D-01 wiring)', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, locale: 'fr', reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(mockCompare).toHaveBeenCalledTimes(1);
    });
    const [calledInput] = mockCompare.mock.calls[0] as [{ image: RnImage; sessionId: string; locale?: string }];
    expect(calledInput.image).toEqual(sampleImage);
    expect(calledInput.sessionId).toBe(SESSION_A);
    expect(calledInput.locale).toBe('fr');
  });

  // ── D-02 : success → reload() surfaces the persisted compare message ─────
  it('invokes reload() exactly once after a successful compare (D-02 surfaçage)', async () => {
    mockCompare.mockResolvedValue(makeCompareResult());
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, locale: 'en', reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT reload when the compare call fails (D-02 — no phantom surface)', async () => {
    mockCompare.mockRejectedValue(new Error('Network Error'));
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(reload).not.toHaveBeenCalled();
  });

  // ── D-08.1 / D-08.4 : loading lifecycle ──────────────────────────────────
  it('exposes isPending while the compare is in-flight and clears it on success (D-08.1 / D-08.4)', async () => {
    const gate = deferred<ReturnType<typeof makeCompareResult>>();
    mockCompare.mockReturnValue(gate.promise);
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    expect(result.current.isPending).toBe(false);

    await act(async () => {
      result.current.trigger(sampleImage);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    await act(async () => {
      gate.resolve(makeCompareResult());
      await gate.promise;
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
  });

  // ── D-08.2 : error mapped to i18n, never the raw axios detail ────────────
  it('surfaces a user-friendly i18n error on 503 COMPARE_ENCODER_UNAVAILABLE, never the raw axios detail (D-08.2)', async () => {
    const err = Object.assign(new Error('encoder down'), {
      response: {
        status: 503,
        data: { error: { code: 'COMPARE_ENCODER_UNAVAILABLE', message: 'Encoder offline' } },
      },
    });
    mockCompare.mockRejectedValue(err);
    const reload = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result } = renderHookWithQueryClient(() =>
      useCompareTrigger({ sessionId: SESSION_A, reload }),
    );

    await act(async () => {
      result.current.trigger(sampleImage);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    const message = result.current.error ?? '';
    // useCompareImage maps 503 → t('chat.compare.error.unavailable'); the
    // test-utils i18n mock returns the key verbatim. The trigger must surface
    // that mapped string, never the raw "encoder down".
    expect(message).toBe('chat.compare.error.unavailable');
    expect(message).not.toBe('encoder down');
  });

  // ── D-08.3 : anti-stale — a late success from a previous session must not
  //    drive the current session's reload (closure-cell guard). ─────────────
  it('does not reload session B with a stale success that resolved after the session changed (D-08.3 anti-stale)', async () => {
    const gate = deferred<ReturnType<typeof makeCompareResult>>();
    mockCompare.mockReturnValueOnce(gate.promise);
    const reloadA = jest.fn().mockResolvedValue(undefined);
    const reloadB = jest.fn().mockResolvedValue(undefined);

    const useCompareTrigger = loadHook();
    const { result, rerender } = renderHookWithQueryClient(
      (params: UseCompareTriggerParams) => useCompareTrigger(params),
      { initialProps: { sessionId: SESSION_A, reload: reloadA } },
    );

    // Trigger a compare for session A — keep it in-flight.
    await act(async () => {
      result.current.trigger(sampleImage);
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(true);
    });

    // User switches to session B while A's compare is still pending.
    rerender({ sessionId: SESSION_B, reload: reloadB });

    // Now A's compare resolves late.
    await act(async () => {
      gate.resolve(makeCompareResult());
      await gate.promise;
    });

    // The stale A result must NOT reload session B (it would surface A's
    // compare message in B's thread — the exact stale-clobber the closure-cell
    // guard prevents). Neither reload should fire for the abandoned A call.
    await waitFor(() => {
      expect(reloadB).not.toHaveBeenCalled();
    });
    expect(reloadA).not.toHaveBeenCalled();
  });
});
