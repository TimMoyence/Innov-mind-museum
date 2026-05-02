// Force UTC so snapshot timestamps are deterministic across CI and local envs
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/__tests__/helpers/setup-axios-streams.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^react-native-worklets(.*)$': '<rootDir>/__tests__/mocks/react-native-worklets.js',
    '^react-native-reanimated$': '<rootDir>/__tests__/mocks/react-native-reanimated.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?(/.*)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@shopify/flash-list|native-base|react-native-svg|@faker-js/faker|react-native-worklets)',
  ],
  collectCoverageFrom: [
    'features/**/*.{ts,tsx}',
    'shared/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!app/**/_layout.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coveragePathIgnorePatterns: [
    'node_modules',
    '__tests__',
    '.test-dist',
    'shared/api/generated/',
    'shared/i18n/types\\.ts$',
    'features/legal/.*Content\\.ts$',
    'shared/ui/tokens\\.generated\\.ts$',
    'shared/ui/themes\\.ts$',
    'app/styles/',
    'features/auth/domain/authLogic\\.pure\\.ts$',
    'features/chat/application/chatSessionLogic\\.pure\\.ts$',
    'features/chat/domain/dashboard-session\\.ts$',
    'features/museum/infrastructure/haversine\\.ts$',
    'features/auth/infrastructure/socialAuthProviders\\.ts$',
    'features/chat/application/offlineQueue\\.ts$',
    'features/chat/domain/contracts\\.ts$',
  ],
  coverageThreshold: {
    global: {
      // Phase 8 Q=B floor: thresholds match Phase 8 actuals
      // (statements 83.48%, branches 68.90%, functions 72.32%, lines 83.96%)
      // with a small downward buffer. Phase 9 will lift these toward
      // 85/70/74/85 and eventually 90/80/80/90 as test additions land.
      statements: 82,
      branches: 68,
      functions: 71,
      lines: 83,
    },
  },
};
