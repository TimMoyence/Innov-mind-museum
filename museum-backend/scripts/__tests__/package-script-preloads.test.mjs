import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const BACKEND_ROOT = process.cwd();
const requireFromBackend = createRequire(resolve(BACKEND_ROOT, 'package.json'));
const { scripts } = JSON.parse(readFileSync(resolve(BACKEND_ROOT, 'package.json'), 'utf8'));

const preloads = Object.entries(scripts).flatMap(([name, command]) =>
  [...command.matchAll(/(?:^|\s)(?:-r|--require)\s+([^\s]+)/g)].map((match) => ({ name, module: match[1] })),
);

describe('backend package scripts', () => {
  it.each(preloads)('$name preloads an installed module ($module)', ({ module }) => {
    expect(() => requireFromBackend.resolve(module)).not.toThrow();
  });
});
