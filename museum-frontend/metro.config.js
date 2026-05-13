const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `@musaium/shared` is installed via `file:../packages/musaium-shared` so npm
// drops a symlink into node_modules. Metro defaults to project-rooted
// resolution and won't follow symlinks unless we (1) add the package source
// to watchFolders so its files trigger HMR and (2) enable symlink resolution
// so the package's TS sources resolve through node_modules.
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
