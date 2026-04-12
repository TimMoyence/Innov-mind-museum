#!/usr/bin/env node
/**
 * CI guard enforcing that every TypeORM migration ships with a non-empty `down()`.
 *
 * The auto-rollback flow relies on `migration:revert` to undo schema changes
 * when a deploy fails its smoke test. A migration whose `down()` is empty (or
 * throws an "irreversible" error) cannot be rolled back automatically, which
 * would leave production in a half-deployed state after rollback.
 *
 * This check parses the TS source of every migration file and fails if:
 *  - `down()` body is empty
 *  - `down()` only contains comments / whitespace
 *  - `down()` throws unconditionally (e.g. `throw new Error('irreversible')`)
 *
 * Exit 0 on pass, exit 1 on violation (prints offenders).
 */

const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'data', 'db', 'migrations');

function extractDownBody(source) {
  // Find `public async down(queryRunner: QueryRunner): Promise<void> { ... }`.
  // Simple brace-matching from the start of the body.
  const header = source.match(/async\s+down\s*\([^)]*\)\s*:?\s*Promise<void>\s*\{/);
  if (!header) return null;
  const start = header.index + header[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return source.slice(start, i - 1);
}

function isEffectivelyEmpty(body) {
  // Strip line comments, block comments, and whitespace.
  const cleaned = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return cleaned.length === 0;
}

function throwsUnconditionally(body) {
  const cleaned = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return /^throw\s+new\s+Error\s*\(/.test(cleaned);
}

function main() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts'));
  } catch (err) {
    console.error(`[check-migration-down] cannot read ${MIGRATIONS_DIR}: ${err.message}`);
    process.exit(1);
  }

  const offenders = [];
  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const source = readFileSync(path, 'utf8');
    const body = extractDownBody(source);
    if (body === null) {
      offenders.push({ file, reason: 'no down() method found' });
      continue;
    }
    if (isEffectivelyEmpty(body)) {
      offenders.push({ file, reason: 'down() body is empty' });
      continue;
    }
    if (throwsUnconditionally(body)) {
      offenders.push({
        file,
        reason: 'down() throws unconditionally (irreversible) — auto-rollback cannot recover',
      });
    }
  }

  if (offenders.length > 0) {
    console.error('[check-migration-down] FAIL — the auto-rollback flow requires every migration to have a working down():');
    for (const { file, reason } of offenders) {
      console.error(`  ✗ ${file}: ${reason}`);
    }
    console.error('');
    console.error('Add a real down() that reverses every queryRunner call in up(), or document an incident-only escalation path.');
    process.exit(1);
  }

  console.log(`[check-migration-down] OK — ${files.length} migration(s) have a reversible down().`);
}

main();
