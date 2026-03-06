#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const specPath = path.resolve(__dirname, '../openapi/openapi.json');

function fail(message) {
  console.error(`[openapi:validate] ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

let raw;
try {
  raw = fs.readFileSync(specPath, 'utf8');
} catch (error) {
  fail(`Unable to read spec at ${specPath}: ${error.message}`);
}

let spec;
try {
  spec = JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON in ${specPath}: ${error.message}`);
}

assert(typeof spec === 'object' && spec !== null, 'Spec root must be an object');
assert(typeof spec.openapi === 'string' && spec.openapi.startsWith('3.'), 'Expected OpenAPI 3.x spec');
assert(typeof spec.info === 'object' && spec.info !== null, 'Missing info object');
assert(typeof spec.info.title === 'string' && spec.info.title.trim().length > 0, 'Missing info.title');
assert(typeof spec.info.version === 'string' && spec.info.version.trim().length > 0, 'Missing info.version');
assert(typeof spec.paths === 'object' && spec.paths !== null, 'Missing paths object');

const paths = Object.keys(spec.paths);
assert(paths.length > 0, 'Spec must declare at least one path');

const requiredPaths = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/chat/sessions',
];

for (const requiredPath of requiredPaths) {
  assert(paths.includes(requiredPath), `Missing required path: ${requiredPath}`);
}

const forbiddenPrefixes = ['/api/IA', '/api/imageInsight', '/api/museum', '/api/conversation'];
for (const routePath of paths) {
  assert(routePath.startsWith('/api/'), `Path must start with /api/: ${routePath}`);
  for (const prefix of forbiddenPrefixes) {
    assert(!routePath.startsWith(prefix), `Legacy path should not be present in active spec: ${routePath}`);
  }

  const pathItem = spec.paths[routePath];
  assert(typeof pathItem === 'object' && pathItem !== null, `Invalid path item for ${routePath}`);
  const ops = Object.keys(pathItem).filter((k) =>
    ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(k.toLowerCase()),
  );
  assert(ops.length > 0, `Path ${routePath} has no operations`);
}

const operationCount = paths.reduce((total, routePath) => {
  const pathItem = spec.paths[routePath];
  return (
    total +
    Object.keys(pathItem).filter((k) =>
      ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(k.toLowerCase()),
    ).length
  );
}, 0);

console.log(
  `[openapi:validate] OK (${paths.length} paths, ${operationCount} operations) - ${spec.info.title} v${spec.info.version}`,
);

