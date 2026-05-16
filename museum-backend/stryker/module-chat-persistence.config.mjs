/**
 * module/chat carve-out — persistence (TypeORM chat / artKeyword / userMemory
 * repositories + query helpers).
 *
 * 8 files under `src/modules/chat/adapters/secondary/persistence/**`. Pattern
 * mirrors module-support: assert exact qb method args via spy-based mocks.
 *
 * Usage: `pnpm stryker run stryker/module-chat-persistence.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/adapters/secondary/persistence/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
