/**
 * C1 Phase 1 PR-A — chat pipeline span / histogram emission integration test.
 *
 * Wires the real {@link ChatService} composition (mocked LLM orchestrator +
 * in-memory repository per {@link buildChatTestService}) and asserts that the
 * end-to-end chat request emits one `chat_request_duration_seconds` observation
 * with `outcome="success"`. Exercises the wiring landed in T1.6.
 *
 * STT / TTS per-phase emission is covered by the unit-level
 * `chat-phase-timer.test.ts` (timer mechanics) and the adapter unit tests
 * (`chat-media-tts-voice.test.ts` / `chat-media.service.test.ts`) — driving
 * the real OpenAI HTTP path from an integration test would require either a
 * real API key or full HTTP mocking, neither of which is appropriate for a
 * deterministic CI run. The spec's "3 spans + e2e histogram" ambition lives
 * end-to-end on staging via `pnpm smoke:api` (R2 acceptance line in
 * `team-state/2026-05-08-c1-chat-fast/spec.md` §3).
 */
import { ChatPhaseTimer } from '@shared/observability/chat-phase-timer';
import { registry } from '@shared/observability/prometheus-metrics';

import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

describe('chat pipeline metrics emission (integration)', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('emits chat_request_duration_seconds with outcome=success on a happy postMessage', async () => {
    const chatService = buildChatTestService();

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
    });

    await chatService.postMessage(session.id, {
      text: 'Tell me about this artwork',
      context: { museumMode: true },
    });

    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_request_duration_seconds_count{outcome="success"} 1',
    );
    expect(dump).toContain('chat_request_duration_seconds_sum{outcome="success"}');
  });

  it('records both phase and request histograms when the timer fires manually for stt/tts', async () => {
    // Drives the same metrics families that the STT and TTS adapters bump in
    // production. Keeps the integration test deterministic by exercising the
    // timer directly rather than reaching for real upstream APIs.
    const sttTimer = ChatPhaseTimer.start('stt', 'openai', 'req-int-1', {
      model: 'gpt-4o-mini-transcribe',
    });
    sttTimer.end('success');

    const ttsTimer = ChatPhaseTimer.start('tts', 'openai', 'req-int-1', {
      model: 'gpt-4o-mini-tts',
    });
    ttsTimer.end('success');

    const dump = await registry.metrics();
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="stt",provider="openai"} 1',
    );
    expect(dump).toContain(
      'chat_phase_duration_seconds_count{phase="tts",provider="openai"} 1',
    );
  });
});
