const path = require('node:path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

const sharedRoot = path.resolve(__dirname, '..', 'packages', 'musaium-shared');
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver = {
  ...config.resolver,
  unstable_enableSymlinks: true,
  nodeModulesPaths: [
    ...(config.resolver?.nodeModulesPaths ?? []),
    path.resolve(__dirname, 'node_modules'),
  ],
};

module.exports = config;
