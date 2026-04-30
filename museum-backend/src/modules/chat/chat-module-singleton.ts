import { ChatModule } from './chat-module';

/**
 * Active chat module reference. Defaults to a fresh singleton on import so
 * existing call sites keep working, but `setActiveChatModule()` lets
 * `createApp()` and tests substitute their own instance — closing the DI gap
 * where `createApp({chatService})` overrode the route but not the wiring
 * accessors used by auth proxies (`getImageStorage`, `getChatRepository`).
 */
let active: ChatModule = new ChatModule();

/** Returns the active chat module — used by wiring.ts and the chat barrel. */
export const getActiveChatModule = (): ChatModule => active;

/** Swaps the active chat module. Call at boot inside `createApp()` or in tests. */
export const setActiveChatModule = (next: ChatModule): void => {
  active = next;
};

/** Resets to a fresh module — primarily for test teardown. */
export const resetActiveChatModule = (): void => {
  active = new ChatModule();
};
