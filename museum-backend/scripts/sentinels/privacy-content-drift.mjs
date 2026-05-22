#!/usr/bin/env node
// @ts-check
/**
 * R15 — privacy-content-drift sentinel.
 *
 * Compares the 3 public privacy surfaces (HTML / museum-web / museum-frontend)
 * against the canonical JSON
 * (`museum-backend/src/shared/legal/privacy-content.canonical.json`).
 *
 * Each surface MUST contain:
 *   - the canonical `version` string,
 *   - the canonical `lastUpdated` string,
 *   - every canonical section `id`,
 *   - every canonical recipient `name` (case-insensitive).
 *
 * Additionally, the HTML age string in the minors section MUST read
 * "15 ans" (regression guard for R13 — CNIL Délibération 2021-018).
 *
 * Usage: `node privacy-content-drift.mjs [--root <repoRoot>]`
 * Exit codes:
 *   0 → all surfaces aligned
 *   1 → ≥1 divergence; report lists every divergent surface + missing token
 *
 * CI output: `## Sentinel report` GitHub Actions block on failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Parse `--root <dir>` flag. Falls back to the repo root inferred from script location. */
function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  if (root === null) {
    // <repo>/museum-backend/scripts/sentinels/ → 3 levels up.
    root = resolve(__dirname, '../../..');
  }
  return { root };
}

/**
 * Per-surface file paths derived from the repo root.
 */
function surfacePaths(root) {
  return {
    canonical: join(root, 'museum-backend/src/shared/legal/privacy-content.canonical.json'),
    HTML: join(root, 'docs/privacy-policy.html'),
    'museum-web': join(root, 'museum-web/src/lib/privacy-content.ts'),
    'museum-frontend': join(root, 'museum-frontend/features/legal/privacyPolicyContent.ts'),
  };
}

/**
 * Build the list of expected tokens from the canonical JSON.
 * Uses the FR locale for section IDs + recipient names — IDs are
 * locale-invariant in this schema; names are too (proper nouns / brands).
 */
function expectedTokensFrom(canonical) {
  const localeData = canonical.locales.fr ?? canonical.locales.en;
  const sectionIds = localeData.sections.map((s) => s.id);
  const recipientNames = localeData.recipients.map((r) => r.name);
  return {
    version: canonical.version,
    lastUpdated: canonical.lastUpdated,
    sectionIds,
    recipientNames,
  };
}

/**
 * Strip comments from a source blob before grepping. Closes the alias-to-
 * dodge loophole where a surface listed the canonical tokens only inside a
 * JSDoc / line / HTML comment block while the rendered body had drifted.
 *
 * Strips, in order (each pass operates on the already-stripped text):
 *   1. HTML / XML  `<!-- ... -->`  (privacy-policy.html surface)
 *   2. JS block    `/* ... *​/`    (incl. JSDoc — covers museum-web and FE)
 *   3. JS line     `// ... \n`
 *
 * Naïve regex is acceptable here because the inputs are author-controlled
 * legal surfaces with no comment markers inside string literals. If that
 * ever changes the sentinel will simply flag the surface (false negative
 * on drift is the failure mode we care about; false positive is harmless).
 *
 * @param {string} text Raw source.
 * @returns {string}    Source with comment regions blanked out.
 */
function stripComments(text) {
  // Replace with a single space so adjacent tokens don't fuse together.
  let out = text.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  return out;
}

/**
 * Check a surface against the expected tokens.
 * Returns an array of human-readable divergence messages (empty = OK).
 *
 * Recipient names are grepped against the COMMENT-STRIPPED source — that
 * closes the docblock-alias bypass where a surface lists vendors only in a
 * JSDoc / line comment while the rendered body has drifted. Version,
 * lastUpdated, and section IDs are grepped against the RAW source because
 * those tokens legitimately appear in metadata headers / GENERATED-FROM
 * comments on some surfaces (HTML `<meta>` tags being a different matter).
 *
 * R13 ("15 ans" guard) likewise keeps the raw text so a "16 ans" regression
 * hidden behind a comment is still caught.
 *
 * @param {string} surface  Surface identifier (HTML / museum-web / museum-frontend).
 * @param {string} text     Raw file source.
 * @param {object} expected Tokens from canonical.
 */
function checkSurface(surface, text, expected) {
  const issues = [];
  const stripped = stripComments(text);
  const haystackStripped = stripped.toLowerCase();

  if (!text.includes(expected.version)) {
    issues.push(`${surface}: missing version "${expected.version}"`);
  }
  if (!text.includes(expected.lastUpdated)) {
    issues.push(`${surface}: missing lastUpdated "${expected.lastUpdated}"`);
  }

  for (const id of expected.sectionIds) {
    if (!text.includes(id)) {
      issues.push(`${surface}: missing section id "${id}"`);
    }
  }

  for (const name of expected.recipientNames) {
    if (!haystackStripped.includes(name.toLowerCase())) {
      issues.push(`${surface}: missing recipient "${name}"`);
    }
  }

  // R13 — HTML-specific guard: the minors-section French phrasing must read
  // "15 ans" and must NOT carry the legacy "16 ans" string. Applies to the
  // HTML surface only; the TS surfaces don't carry the FR sentence directly.
  // We assert against the RAW text here on purpose: a "16 ans" regression
  // hidden behind a comment is still a regression once a future edit pulls
  // the wrapping comment off.
  if (surface === 'HTML') {
    if (/16(\s|&nbsp;)*ans/i.test(text)) {
      issues.push(`${surface}: HTML still contains "16 ans" (R13 minor-age regression)`);
    }
    if (!/15(\s|&nbsp;)*ans/i.test(text)) {
      issues.push(`${surface}: HTML missing "15 ans" minor-age string (R13)`);
    }
  }

  return issues;
}

function emitReport(issues) {
  // GitHub Actions step summary block — also printed to stderr for any
  // CI surface that doesn't tail GITHUB_STEP_SUMMARY.
  const lines = ['## Sentinel report — privacy-content-drift', ''];
  if (issues.length === 0) {
    lines.push('PASS — canonical ↔ HTML ↔ web ↔ FE all aligned.');
  } else {
    lines.push(`FAIL — ${issues.length} divergence(s):`);
    for (const issue of issues) lines.push(`- ${issue}`);
  }
  const text = lines.join('\n') + '\n';
  // Stderr so spawnSync stdout/stderr capture both pick it up.
  process.stderr.write(text);
}

function main() {
  const { root } = parseArgs(process.argv);
  const paths = surfacePaths(root);

  let canonical;
  try {
    canonical = JSON.parse(readFileSync(paths.canonical, 'utf8'));
  } catch (err) {
    emitReport([
      `canonical: failed to load ${paths.canonical} — ${err instanceof Error ? err.message : String(err)}`,
    ]);
    process.exit(1);
  }

  const expected = expectedTokensFrom(canonical);
  const surfaces = ['HTML', 'museum-web', 'museum-frontend'];
  const allIssues = [];

  for (const surface of surfaces) {
    let text;
    try {
      text = readFileSync(paths[surface], 'utf8');
    } catch (err) {
      allIssues.push(
        `${surface}: failed to read ${paths[surface]} — ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    allIssues.push(...checkSurface(surface, text, expected));
  }

  if (allIssues.length > 0) {
    emitReport(allIssues);
    process.exit(1);
  }

  emitReport([]);
  process.exit(0);
}

main();
