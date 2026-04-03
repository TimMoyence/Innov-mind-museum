// Force UTC so snapshot timestamps are deterministic across CI and local envs
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?(/.*)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@shopify/flash-list|native-base|react-native-svg|@faker-js/faker)',
  ],
  collectCoverageFrom: [
    'features/**/*.{ts,tsx}',
    'shared/**/*.{ts,tsx}',
    'context/**/*.{ts,tsx}',
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
  ],
  coverageThreshold: {
    global: {
      statements: 25,
      branches: 13,
      functions: 23,
      lines: 25,
    },
  },
};
