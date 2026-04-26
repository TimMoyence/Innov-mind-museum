import { createE2EHarness, E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';

// SSE streaming route was DEACTIVATED post-V1 (see chat-message.route.ts:198–202
// and chat-message.sse-dormant.ts). The route is wired to revive in V2.1 once
// the realtime WebRTC pipeline ships. Until then, this suite is skipped to keep
// CI green — re-enable by flipping the route back on in chat-message.route.ts and
// removing this guard.
const SSE_ROUTE_DEACTIVATED = true;
const shouldRunE2E = process.env.RUN_E2E === 'true' && !SSE_ROUTE_DEACTIVATED;
const describeE2E = shouldRunE2E ? describe : describe.skip;

/** Parses raw SSE text into an array of { event, data } objects. */
function parseSseEvents(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = raw.split('\n\n').filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        data = line.slice('data: '.length);
      }
    }

    if (event && data) {
      events.push({ event, data });
    }
  }

  return events;
}

describeE2E('SSE streaming e2e', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;

  beforeAll(async () => {
    // FEATURE_FLAG_STREAMING was retired in V1 — SSE route is now @deprecated but
    // remains accessible for the legacy clients we still want to test against.
    // See docs/adr/ADR-001-sse-streaming-deprecated.md.
    harness = await createE2EHarness();
  });

  afterAll(async () => {
    await harness?.stop();
  });

  it('streams tokens via SSE and ends with a done event', async () => {
    const { token } = await registerAndLogin(harness);

    // ── Create a session ──
    const createRes = await harness.request(
      '/api/chat/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ locale: 'en', museumMode: true }),
      },
      token,
    );
    expect(createRes.status).toBe(201);
    const session = (createRes.body as { session: { id: string } }).session;

    // ── Make a raw HTTP request to the streaming endpoint ──
    const response = await fetch(
      `${harness.baseUrl}/api/chat/sessions/${session.id}/messages/stream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: 'Tell me about art',
          context: { museumMode: true, locale: 'en', guideLevel: 'beginner' },
        }),
      },
    );

    // ── Verify SSE headers ──
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');

    // ── Read the full SSE response body ──
    const rawBody = await response.text();
    const events = parseSseEvents(rawBody);

    // ── Verify at least one token event and one done event ──
    const tokenEvents = events.filter((e) => e.event === 'token');
    const doneEvents = events.filter((e) => e.event === 'done');

    expect(tokenEvents.length).toBeGreaterThanOrEqual(1);
    expect(doneEvents).toHaveLength(1);

    // ── Verify token event shape ──
    const firstToken = JSON.parse(tokenEvents[0].data) as { t: string };
    expect(firstToken.t).toEqual(expect.any(String));
    expect(firstToken.t.length).toBeGreaterThan(0);

    // ── Verify done event shape ──
    const donePayload = JSON.parse(doneEvents[0].data) as {
      messageId: string;
      createdAt: string;
      metadata: Record<string, unknown>;
    };
    expect(donePayload.messageId).toEqual(expect.any(String));
    expect(donePayload.createdAt).toEqual(expect.any(String));
    expect(donePayload.metadata).toEqual(expect.any(Object));
  });
});
