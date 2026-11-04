import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');

const PROD_DOCKERFILES = ['museum-backend/deploy/Dockerfile.prod', 'museum-web/deploy/Dockerfile.prod'];

const PACKAGE_MANAGER_PATHS = [
  '/usr/local/lib/node_modules/npm',
  '/usr/local/lib/node_modules/corepack',
  '/usr/local/bin/npm',
  '/usr/local/bin/npx',
  '/usr/local/bin/corepack',
  '/opt/yarn-v*',
  '/usr/local/bin/yarn',
  '/usr/local/bin/yarnpkg',
];

const runtimeStage = (dockerfile) => dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));

const removedPaths = (stage) =>
  [...stage.matchAll(/^RUN\s+rm -rf\s+([^\n]*)$/gm)].flatMap((match) => match[1].trim().split(/\s+/));

describe.each(PROD_DOCKERFILES)('%s runtime stage', (relativePath) => {
  const stage = runtimeStage(readFileSync(resolve(REPO_ROOT, relativePath), 'utf8'));

  it('removes every package manager bundled with the Node base image', () => {
    expect(removedPaths(stage)).toEqual(expect.arrayContaining(PACKAGE_MANAGER_PATHS));
  });

  it('never invokes a package manager after removing it', () => {
    const afterRemoval = stage.slice(stage.indexOf('/usr/local/lib/node_modules/npm'));
    const instructions = afterRemoval.split('\n').slice(1).join('\n');
    expect(instructions).not.toMatch(/^\s*(RUN|CMD|ENTRYPOINT|HEALTHCHECK)\b[^\n]*\b(npm|npx|corepack|pnpm|yarn)\b/m);
  });
});
