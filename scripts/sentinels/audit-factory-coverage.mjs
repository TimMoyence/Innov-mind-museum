#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 7 audit: scan BE + FE entity files vs factory helpers.
 *
 * Reports which entities are referenced in tests but lack a `make<Entity>`
 * factory in `tests/helpers/<area>/` (BE) or `__tests__/helpers/factories/`
 * (FE). Writes the audit to /tmp/phase7-audit.txt.
 *
 * Heuristic: walk *.entity.ts files, derive the entity class name, count
 * test-file references, check for matching factory file.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');

function walkFiles(dir, predicate) {
  const out = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) out.push(...walkFiles(full, predicate));
      else if (predicate(full)) out.push(full);
    }
  } catch { /* swallow ENOENT */ }
  return out;
}

function entitiesUnder(srcRoot) {
  return walkFiles(srcRoot, (f) => f.endsWith('.entity.ts')).map((f) => {
    const text = readFileSync(f, 'utf-8');
    const match = text.match(/export class (\w+)/);
    return { path: f, name: match ? match[1] : basename(f, '.entity.ts') };
  });
}

function countReferences(testFiles, name) {
  const re = new RegExp(`\\b${name}\\b`);
  let count = 0;
  for (const f of testFiles) {
    const text = readFileSync(f, 'utf-8');
    if (re.test(text)) count += 1;
  }
  return count;
}

function hasFactory(helperRoots, name) {
  const lower = name[0].toLowerCase() + name.slice(1);
  const factoryFnRe = new RegExp(`\\bmake${name}\\b`);
  for (const root of helperRoots) {
    const helpers = walkFiles(root, (f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of helpers) {
      if (basename(f).toLowerCase().includes(lower)) return f;
      const text = readFileSync(f, 'utf-8');
      if (factoryFnRe.test(text)) return f;
    }
  }
  return null;
}

function main() {
  const beEntities = entitiesUnder(join(ROOT, 'museum-backend', 'src'));
  const beTestFiles = walkFiles(join(ROOT, 'museum-backend', 'tests'), (f) => f.endsWith('.test.ts'));
  const beHelperRoots = [join(ROOT, 'museum-backend', 'tests', 'helpers')];

  const feHelperRoots = [join(ROOT, 'museum-frontend', '__tests__', 'helpers')];
  const feTestFiles = walkFiles(join(ROOT, 'museum-frontend', '__tests__'), (f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));

  const lines = ['# Phase 7 factory-coverage audit', ''];
  lines.push('## Backend');
  for (const e of beEntities) {
    const refs = countReferences(beTestFiles, e.name);
    const factory = hasFactory(beHelperRoots, e.name);
    if (refs >= 3 && !factory) {
      lines.push(`- MISSING: ${e.name} (refs: ${refs}, entity: ${e.path.replace(ROOT + '/', '')})`);
    }
  }
  lines.push('');
  lines.push('## Frontend');
  // FE entities are usually OpenAPI-generated types, not class entities.
  // Skip class-based audit for FE; rely on shape-match rule instead.
  lines.push('(skipped — FE uses OpenAPI types; shape-match rule covers gaps)');

  const out = lines.join('\n');
  console.log(out);
  // Write audit to /tmp for commit-body inclusion.
  try {
    writeFileSync('/tmp/phase7-audit.txt', out);
  } catch { /* ignore */ }
}

main();
