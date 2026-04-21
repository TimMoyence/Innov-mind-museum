import { ChatModule } from './chat-module';

/** Shared module instance — initialized once at app startup via `buildChatService()`. */
export const chatModule = new ChatModule();
