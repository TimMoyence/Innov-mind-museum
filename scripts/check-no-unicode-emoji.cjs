#!/usr/bin/env node
/**
 * P4 emoji guard.
 *
 * Musaium UX policy (memory: feedback_no_unicode_emoji): user-facing
 * mobile screens and copy must not embed unicode emoji. Use PNG (require)
 * or Ionicons instead so style stays consistent across iOS/Android and
 * older devices render correctly.
 *
 * Scans the React Native screens + i18n dictionaries for unicode emoji
 * codepoints and exits non-zero if any is found.
 *
 * Allowed exceptions:
 *   - museum-backend (server, no UI)
 *   - test files / snapshots / docs
 *   - copy in `museum-frontend/shared/i18n/copy-emoji-allowlist.json`
 *     (intentional cases — currency symbols, math signs, etc.)
 *
 * Run from repo root:
 *   node scripts/check-no-unicode-emoji.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Unicode property escapes — \p{Extended_Pictographic} matches the full
// emoji set (faces, hands, animals, symbols) without false-positive on
// CJK/digits. Requires Node 12+.
//
// Note: per Unicode TR51, this property includes © (U+00A9), ® (U+00AE),
// ™ (U+2122) and similar legal/trade marks. They're flagged as emoji
// here even though the brain reads them as plain copy. Use the allowlist
// (`copy-emoji-allowlist.json`) for legitimate occurrences.
const EMOJI_REGEX = /[\p{Extended_Pictographic}]/u;

// Roots to scan. Mobile only — the UFR (`feedback_no_unicode_emoji`)
// targets RN screens and the i18n copy that ends up rendered in the
// mobile app. Web (Next.js) has its own icon conventions (Lucide, etc.)
// and is not in scope for this guard. Backend has no UI.
const SCAN_ROOTS = [
  path.join(ROOT, 'museum-frontend', 'app'),
  path.join(ROOT, 'museum-frontend', 'features'),
  path.join(ROOT, 'museum-frontend', 'shared', 'i18n'),
  path.join(ROOT, 'museum-frontend', 'shared', 'ui'),
];

// Skip these path segments anywhere in the file path.
const SKIP_SEGMENTS = [
  '__tests__',
  '__snapshots__',
  '.test.',
  '.spec.',
  'node_modules',
  '/dist/',
  '/build/',
  '.test-dist',
  '/coverage/',
  '/.next/',
  '.stryker-tmp',
  '.stryker-run',
  // Test-utility assets.
  'test-utils',
];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);

// Per-line allowlist: an exact substring on the offending line silences
// the violation. Use sparingly — prefer Ionicons / PNG over allowlisting.
const ALLOWLIST_FILE = path.join(
  ROOT,
  'museum-frontend',
  'shared',
  'i18n',
  'copy-emoji-allowlist.json',
);
const allowlist = (() => {
  if (!fs.existsSync(ALLOWLIST_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
    return Array.isArray(raw.lines) ? raw.lines.map(String) : [];
  } catch {
    return [];
  }
})();

function isAllowedLine(line) {
  return allowlist.some((token) => line.includes(token));
}

function isSkippedPath(filePath) {
  return SKIP_SEGMENTS.some((seg) => filePath.includes(seg));
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (isSkippedPath(full)) continue;
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && FILE_EXTENSIONS.has(path.extname(entry.name))) {
        yield full;
      }
    }
  }
}

const findings = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!EMOJI_REGEX.test(content)) continue;

    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const match = line.match(EMOJI_REGEX);
      if (!match) return;
      if (isAllowedLine(line)) return;
      findings.push({
        file: path.relative(ROOT, file),
        line: idx + 1,
        column: match.index + 1,
        codepoint: `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        snippet: line.length > 120 ? line.slice(0, 120) + '…' : line,
      });
    });
  }
}

if (findings.length === 0) {
  process.stdout.write('[emoji-guard] OK — no unicode emoji in scanned UI code.\n');
  process.exit(0);
}

process.stderr.write(
  `[emoji-guard] FAIL — found ${findings.length} unicode emoji codepoint(s) in user-facing UI:\n`,
);
for (const f of findings) {
  process.stderr.write(
    `  ${f.file}:${f.line}:${f.column}  ${f.codepoint}  ${f.snippet.trim()}\n`,
  );
}
process.stderr.write(
  '\n[emoji-guard] Replace with Ionicons (<Ionicons name="..." />) or PNG (require("...")).\n' +
    '[emoji-guard] If the codepoint is intentional (currency, math sign), add the line\n' +
    `[emoji-guard] substring to ${path.relative(ROOT, ALLOWLIST_FILE)} ("lines" array).\n`,
);
process.exit(1);
