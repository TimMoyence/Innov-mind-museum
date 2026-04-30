import { ChatModule } from '@modules/chat/chat-module';
import {
  getActiveChatModule,
  resetActiveChatModule,
  setActiveChatModule,
} from '@modules/chat/chat-module-singleton';

describe('chat module registry', () => {
  afterEach(() => {
    resetActiveChatModule();
  });

  it('exposes a default ChatModule instance on import', () => {
    expect(getActiveChatModule()).toBeInstanceOf(ChatModule);
  });

  it('replaces the active module via setActiveChatModule()', () => {
    const swap = new ChatModule();
    setActiveChatModule(swap);
    expect(getActiveChatModule()).toBe(swap);
  });

  it('resetActiveChatModule() restores a fresh instance', () => {
    const swap = new ChatModule();
    setActiveChatModule(swap);
    resetActiveChatModule();
    expect(getActiveChatModule()).not.toBe(swap);
    expect(getActiveChatModule()).toBeInstanceOf(ChatModule);
  });
});
