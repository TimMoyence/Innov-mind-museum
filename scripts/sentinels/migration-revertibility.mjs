#!/usr/bin/env node
/**
 * Sentinel: migration-revertibility
 *
 * Inspects the most recent TypeORM migration in
 * museum-backend/src/data/db/migrations/ and asserts:
 *   - both `public async up(` and `public async down(` exist
 *   - `down()` body is non-trivial (not empty, not just `// no-op`,
 *     not just a `return;` and not just a comment)
 *
 * Pure regex parsing — no TypeScript compiler dependency, runs in <100ms.
 *
 * Exit 0 = pass / 1 = trivial down().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(
  repoRoot,
  'museum-backend',
  'src',
  'data',
  'db',
  'migrations',
);

if (!fs.existsSync(migrationsDir)) {
  console.error(`[sentinel:migration-revertibility] FAIL: ${migrationsDir} not found`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.ts'))
  .sort();

if (files.length === 0) {
  console.log('[sentinel:migration-revertibility] PASS — no migrations found');
  process.exit(0);
}

const newest = files[files.length - 1];
const filePath = path.join(migrationsDir, newest);
const text = fs.readFileSync(filePath, 'utf8');

if (!/public\s+async\s+up\s*\(/.test(text)) {
  console.error(`[sentinel:migration-revertibility] FAIL: ${newest} has no public async up()`);
  process.exit(1);
}

const downRe = /public\s+async\s+down\s*\(([^)]*)\)\s*:\s*Promise<[^>]+>\s*\{([\s\S]*?)\n\s*\}/;
const downMatch = text.match(downRe);
if (!downMatch) {
  console.error(`[sentinel:migration-revertibility] FAIL: ${newest} has no public async down()`);
  process.exit(1);
}

const body = downMatch[2];
const stripped = body
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, '').trim())
  .filter((l) => l.length > 0 && l !== 'return;' && l !== 'return')
  .join('\n')
  .trim();

if (stripped.length === 0) {
  console.error(
    `[sentinel:migration-revertibility] FAIL: ${newest} has trivial down() (empty / no-op / return-only).`,
  );
  console.error(
    `[sentinel:migration-revertibility] Migrations MUST be revertible. Implement an inverse SQL block.`,
  );
  process.exit(1);
}

console.log(`[sentinel:migration-revertibility] PASS — ${newest} has non-trivial down()`);
process.exit(0);
