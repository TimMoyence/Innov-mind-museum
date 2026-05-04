import { ChatSessionService } from '@modules/chat/useCase/session/chat-session.service';
import { makeSession } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

describe('ChatSessionService createSession intent forwarding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists intent="walk" when supplied', async () => {
    const session = makeSession({ intent: 'walk' });
    const repo = makeChatRepo({
      createSession: jest.fn().mockResolvedValue(session),
    });
    const svc = new ChatSessionService({ repository: repo });

    await svc.createSession({ intent: 'walk' });

    expect(repo.createSession).toHaveBeenCalledWith(expect.objectContaining({ intent: 'walk' }));
  });

  it('defaults intent to "default" when omitted', async () => {
    const session = makeSession({ intent: 'default' });
    const repo = makeChatRepo({
      createSession: jest.fn().mockResolvedValue(session),
    });
    const svc = new ChatSessionService({ repository: repo });

    await svc.createSession({});

    expect(repo.createSession).toHaveBeenCalledWith(expect.objectContaining({ intent: 'default' }));
  });
});
