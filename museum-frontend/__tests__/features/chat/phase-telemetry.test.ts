/**
 * A5 corrective loop 1 — `logPhaseTelemetry` consumer (R22 FE telemetry).
 *
 * The FE consumes `metadata.phase` for telemetry only — the visible status
 * string is driven by the client-side simulation. This test locks the
 * contract :
 *
 *   - When `metadata.phase` is a non-empty string, log a `console.debug`
 *     line tagged `[chat.phase]` with the value + correlation ids.
 *   - When `metadata` is `null` / `undefined` / lacks `phase` (legacy, NFR8 +
 *     R23), DO NOT throw and DO NOT log.
 */

import { logPhaseTelemetry } from '@/features/chat/application/sendStrategies/phase-telemetry';

describe('logPhaseTelemetry (A5 R22)', () => {
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {
      /* swallow */
    });
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('logs a [chat.phase] debug line when metadata.phase is set', () => {
    logPhaseTelemetry({ phase: 'done' }, { sessionId: 'session-42', messageId: 'msg-7' });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith('[chat.phase]', 'done', {
      sessionId: 'session-42',
      messageId: 'msg-7',
    });
  });

  it('forwards any string phase value verbatim (BE owns the union)', () => {
    logPhaseTelemetry({ phase: 'composing' }, { sessionId: 's', messageId: 'm' });

    expect(debugSpy).toHaveBeenCalledWith('[chat.phase]', 'composing', {
      sessionId: 's',
      messageId: 'm',
    });
  });

  it('does NOT log when metadata is undefined (R23 backward-compat)', () => {
    logPhaseTelemetry(undefined, { sessionId: 's', messageId: 'm' });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('does NOT log when metadata is null (legacy persisted messages)', () => {
    logPhaseTelemetry(null, { sessionId: 's', messageId: 'm' });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('does NOT log when metadata.phase is absent (NFR8 backward-compat)', () => {
    logPhaseTelemetry({}, { sessionId: 's', messageId: 'm' });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('does NOT log when metadata.phase is an empty string (defensive)', () => {
    logPhaseTelemetry({ phase: '' }, { sessionId: 's', messageId: 'm' });

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('does NOT log when metadata.phase is not a string (defensive, R23 no-throw)', () => {
    expect(() => {
      logPhaseTelemetry({ phase: 42 as unknown as string }, { sessionId: 's', messageId: 'm' });
    }).not.toThrow();
    expect(debugSpy).not.toHaveBeenCalled();
  });
});
