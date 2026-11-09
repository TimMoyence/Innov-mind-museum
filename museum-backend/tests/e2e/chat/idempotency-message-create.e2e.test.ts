import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

interface PostMessageBody {
  message: { id: string; role: string; text?: string };
}

interface SessionMessagesBody {
  session: { id: string };
  messages: { id: string; role: string; text?: string }[];
}

describeE2E('idempotency message-create e2e (real app + Postgres)', () => {
  let harness: E2EHarness;
  let token: string;

  beforeAll(async () => {
    harness = await createE2EHarness();
    const auth = await registerAndLogin(harness);
    token = auth.token;
  });

  afterAll(async () => {
    await harness.stop();
  });

  const createSession = async (): Promise<string> => {
    const res = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en', museumMode: true }) },
      token,
    );
    expect(res.status).toBe(201);
    return (res.body as { session: { id: string } }).session.id;
  };

  const postMessage = async (
    sessionId: string,
    text: string,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: PostMessageBody }> => {
    const res = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text,
          context: { museumMode: true, locale: 'en', guideLevel: 'beginner' },
        }),
        ...(idempotencyKey ? { headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } } : {}),
      },
      token,
    );
    return { status: res.status, body: res.body as PostMessageBody };
  };

  const readMessages = async (sessionId: string): Promise<SessionMessagesBody> => {
    const res = await harness.request(
      `/api/chat/sessions/${sessionId}?limit=50`,
      { method: 'GET' },
      token,
    );
    expect(res.status).toBe(200);
    return res.body as SessionMessagesBody;
  };

  it('R1 — replaying the same Idempotency-Key creates exactly one message and returns the same messageId', async () => {
    const sessionId = await createSession();

    const first = await postMessage(sessionId, 'Tell me about this painting.', 'idem-key-1');
    const second = await postMessage(sessionId, 'Tell me about this painting.', 'idem-key-1');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.message.id).toBe(first.body.message.id);

    const history = await readMessages(sessionId);
    expect(history.messages).toHaveLength(2);
  });

  it('R2 — distinct Idempotency-Keys create distinct messages', async () => {
    const sessionId = await createSession();

    const first = await postMessage(sessionId, 'First distinct message.', 'idem-key-a');
    const second = await postMessage(sessionId, 'Second distinct message.', 'idem-key-b');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.message.id).not.toBe(first.body.message.id);

    const history = await readMessages(sessionId);
    expect(history.messages).toHaveLength(4);
  });
});
