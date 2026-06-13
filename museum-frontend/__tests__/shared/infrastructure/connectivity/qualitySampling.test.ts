/**
 * TR-01 (sampling volet) — qualitySampling eligibility + axios glue (run
 * undefined-network-detection-reliability, cluster A, task A-R3).
 * Pins design §2.3 / Q-02: central deny-list (LLM chat messages, STT audio,
 * TTS — compute-dominated latencies, INV-09), FormData/multipart exclusion,
 * retry exclusion (`_retryCount > 0`, design P-05), per-request opt-out
 * (`skipQualitySample`), and `recordHttpQualitySample` edge semantics
 * (no-op without a numeric `_startedAt`, rtt = Date.now() − startedAt,
 * outcome pass-through, never throws — US-10.1/US-10.2).
 */
// Non-virtual: the module exists on disk — virtual registration would key a
// synthetic module ID and stop binding once another suite resolves the real
// file first in the same worker (shared `_moduleIDCache`).
jest.mock('@/shared/infrastructure/connectivity/networkQualityTracker', () => ({
  recordQualitySample: jest.fn(),
}));

import {
  isQualitySampleEligible,
  recordHttpQualitySample,
} from '@/shared/infrastructure/connectivity/qualitySampling';
import { recordQualitySample } from '@/shared/infrastructure/connectivity/networkQualityTracker';

const recordQualitySampleMock = recordQualitySample as jest.Mock;

const ELIGIBLE_URL = '/museums/42/low-data-pack';

/** Forged axios-like config (transport fragment, not a domain entity). */
const makeRecordableConfig = (overrides?: Record<string, unknown>): Record<string, unknown> => ({
  url: ELIGIBLE_URL,
  _startedAt: 100_000,
  ...overrides,
});

const OK_OUTCOME = { ok: true, timedOut: false };

describe('isQualitySampleEligible — pure deny-list matrix (INV-09 / US-10.2)', () => {
  const eligibleArgs = { isFormData: false, retryCount: 0, skip: false };

  it.each([
    // Deny: latency dominated by LLM/STT/TTS compute, not the network.
    ['/chat/sessions/s-1/messages', false],
    ['/api/chat/sessions/s-1/messages', false],
    ['/chat/sessions/s-1/audio', false],
    ['/api/chat/sessions/s-1/audio', false],
    ['/messages/m-1/tts', false],
    ['/api/messages/m-1/tts', false],
    // Allow: regular API traffic (deny-list, NOT an allow-list — design Q-02).
    ['/museums/42/low-data-pack', true],
    ['/auth/login', true],
    ['/chat/sessions', true],
    // Patterns are end-anchored: sub-resources of denied paths stay eligible.
    ['/chat/sessions/s-1/messages/m-1/feedback', true],
  ])('isQualitySampleEligible(%s) === %s', (url, expected) => {
    expect(isQualitySampleEligible({ url, ...eligibleArgs })).toBe(expected);
  });

  it('excludes FormData/multipart uploads (US-10.2)', () => {
    expect(
      isQualitySampleEligible({ url: ELIGIBLE_URL, isFormData: true, retryCount: 0, skip: false }),
    ).toBe(false);
  });

  it('excludes retried requests (design P-05: _retryCount > 0)', () => {
    expect(
      isQualitySampleEligible({ url: ELIGIBLE_URL, isFormData: false, retryCount: 1, skip: false }),
    ).toBe(false);
  });

  it('excludes requests opting out via skipQualitySample', () => {
    expect(
      isQualitySampleEligible({ url: ELIGIBLE_URL, isFormData: false, retryCount: 0, skip: true }),
    ).toBe(false);
  });
});

describe('recordHttpQualitySample — axios edge glue (US-10.1)', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    recordQualitySampleMock.mockReset();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(100_400);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('forwards an eligible success sample with rtt = Date.now() − _startedAt', () => {
    recordHttpQualitySample(makeRecordableConfig(), OK_OUTCOME);

    expect(recordQualitySampleMock).toHaveBeenCalledTimes(1);
    expect(recordQualitySampleMock).toHaveBeenCalledWith({
      rttMs: 400,
      ok: true,
      timedOut: false,
    });
  });

  it('forwards failure outcomes verbatim (timeout classification stays at the caller)', () => {
    recordHttpQualitySample(makeRecordableConfig(), { ok: false, timedOut: true });

    expect(recordQualitySampleMock).toHaveBeenCalledWith({
      rttMs: 400,
      ok: false,
      timedOut: true,
    });
  });

  it('is a no-op when _startedAt is absent', () => {
    recordHttpQualitySample({ url: ELIGIBLE_URL }, OK_OUTCOME);

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('is a no-op when _startedAt is not a number', () => {
    recordHttpQualitySample(makeRecordableConfig({ _startedAt: '100000' }), OK_OUTCOME);

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('is a no-op for deny-listed URLs (INV-09: a 12 s LLM reply must never push slow)', () => {
    recordHttpQualitySample(
      makeRecordableConfig({ url: '/chat/sessions/s-1/messages' }),
      OK_OUTCOME,
    );

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('is a no-op for retried requests (_retryCount > 0)', () => {
    recordHttpQualitySample(makeRecordableConfig({ _retryCount: 2 }), OK_OUTCOME);

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the request opted out via skipQualitySample', () => {
    recordHttpQualitySample(makeRecordableConfig({ skipQualitySample: true }), OK_OUTCOME);

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('is a no-op for FormData bodies (US-10.2 uploads)', () => {
    recordHttpQualitySample(makeRecordableConfig({ data: new FormData() }), OK_OUTCOME);

    expect(recordQualitySampleMock).not.toHaveBeenCalled();
  });

  it('still samples plain JSON bodies (deny-list, not GET-only allow-list — Q-02)', () => {
    recordHttpQualitySample(makeRecordableConfig({ data: { text: 'bonjour' } }), OK_OUTCOME);

    expect(recordQualitySampleMock).toHaveBeenCalledTimes(1);
  });

  it('never throws even when the tracker throws (sampling must not break requests)', () => {
    recordQualitySampleMock.mockImplementation(() => {
      throw new Error('tracker boom');
    });

    expect(() => {
      recordHttpQualitySample(makeRecordableConfig(), OK_OUTCOME);
    }).not.toThrow();
  });
});
