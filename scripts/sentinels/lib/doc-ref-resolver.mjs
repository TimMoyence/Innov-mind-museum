// @ts-check
/**
 * doc-ref-resolver — shared reference-resolution helpers for doc-honesty sentinels.
 *
 * Extracted so `doc-last-verified.mjs` can verify that the `path/file.ext:NN`
 * claims inside every curated doc actually resolve (file exists + has ≥ NN lines)
 * AND can list the code files a doc references (for the event-driven freshness
 * check). The logic mirrors `roadmap-claim-resolves.mjs` (UFR-024) but is package
 * pure (no process.exit / no top-level scan) so it is unit-testable and reusable.
 *
 * It deliberately re-implements the same regexes/exclusions rather than importing
 * from `roadmap-claim-resolves.mjs` (that file is a side-effecting script wired
 * into the push gate; turning it into a module is a separate, riskier change).
 */
import fs from 'node:fs';
import path from 'node:path';

// Source extensions treated as code-like `path:line` targets.
const FILE_EXTS = ['ts', 'tsx', 'mjs', 'cjs', 'js', 'json', 'md', 'yml', 'yaml', 'sh', 'sql'];

// `path/file.ext:NN` — internal slashes allowed; extension required to avoid
// `name: type` Zod-style false positives.
const PATH_LINE_RE = new RegExp(`([A-Za-z0-9_\\-./]+\\.(?:${FILE_EXTS.join('|')})):(\\d+)`, 'g');

// `docs/X.md`, `docs/sub/Y.md` — repo-root docs only (lookbehind rejects
// `museum-frontend/docs/...`).
const DOC_RE = /(?<![A-Za-z0-9_\-/])docs\/[A-Za-z0-9_\-/.]+\.md/g;

// Relative markdown link targets `](FILE.md)` (not http/abs/anchor/docs-prefixed).
const MD_REL_LINK_RE = /\]\((?!https?:|\/|#|docs\/)([A-Za-z0-9_\-./]+\.md)(?:#[^)]*)?\)/g;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.test-dist',
  '.next', '.expo', '.maestro-output', 'ios/Pods', 'android/build', '.turbo',
]);

/** Build a basename → [absPath, ...] index of the repo (cached by caller). */
export function buildFileIndex(repoRoot) {
  const index = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        if (full.endsWith('/ios/Pods')) continue;
        walk(full);
      } else if (ent.isFile()) {
        const arr = index.get(ent.name);
        if (arr) arr.push(full);
        else index.set(ent.name, [full]);
      }
    }
  };
  walk(repoRoot);
  return index;
}

/** Count `\n` (plus a trailing partial line) — matches roadmap-claim-resolves. */
export function lineCount(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    let n = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++;
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) n++;
    return n;
  } catch {
    return -1;
  }
}

/**
 * Resolve a path token to absolute candidate paths.
 *   1. literal (relative to repoRoot) — handles workspace-prefixed refs.
 *   2. basename — for bare `chat.service.ts`; suffix-match when a dir hint exists.
 */
export function resolvePathToken(token, repoRoot, index) {
  const abs = path.join(repoRoot, token);
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return [abs];
  } catch {
    /* fall through to basename */
  }
  const hits = index.get(path.basename(token));
  if (!hits || hits.length === 0) return [];
  if (token.includes('/')) {
    const suffix = hits.filter((h) => h.endsWith(token));
    if (suffix.length > 0) return suffix;
  }
  return hits;
}

// ── Exclusion ranges (fenced code blocks + git log/show spans) ────────────────
function buildFenceRanges(src) {
  const ranges = [];
  const re = /^```/gm;
  let m;
  let open = null;
  while ((m = re.exec(src)) !== null) {
    if (open === null) open = m.index;
    else {
      ranges.push([open, m.index + 3]);
      open = null;
    }
  }
  return ranges;
}

function buildGitHistoryRanges(src) {
  const ranges = [];
  const re = /`[^`\n]*\bgit (?:log|show|cat-file)\b[^`\n]*`/g;
  let m;
  while ((m = re.exec(src)) !== null) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function inRanges(ranges, offset) {
  for (const [s, e] of ranges) if (offset >= s && offset <= e) return true;
  return false;
}

function offsetToLine(src, offset) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < offset; i++) {
    if (src.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, col: offset - lastNl };
}

function trimTrailing(s) {
  return s.replace(/[).,:;`"'\]]+$/, '');
}

/**
 * Verify every `path:line`, `docs/*.md` cross-ref, and relative md link inside a
 * doc resolves. Returns an array of failure descriptors ([] when clean).
 * Excludes refs inside fenced code blocks and `git log/show` spans (those
 * legitimately point at illustrative or deleted paths).
 */
export function checkDocRefs(absDocPath, relDoc, repoRoot, index) {
  const src = fs.readFileSync(absDocPath, 'utf8');
  const fences = buildFenceRanges(src);
  const gitHistory = buildGitHistoryRanges(src);
  const failures = [];

  for (const m of src.matchAll(PATH_LINE_RE)) {
    const offset = m.index ?? 0;
    if (inRanges(fences, offset) || inRanges(gitHistory, offset)) continue;
    const token = m[1];
    const lineN = parseInt(m[2], 10);
    const { line, col } = offsetToLine(src, offset);
    const candidates = resolvePathToken(token, repoRoot, index);
    if (candidates.length === 0) {
      failures.push({ file: relDoc, line, col, kind: 'path:line', ref: `${token}:${lineN}`, why: 'file not found (literal + basename lookup)' });
      continue;
    }
    let best = -1;
    let bestPath = null;
    for (const cand of candidates) {
      const lc = lineCount(cand);
      if (lc > best) {
        best = lc;
        bestPath = cand;
      }
    }
    if (best < lineN) {
      failures.push({ file: relDoc, line, col, kind: 'path:line', ref: `${token}:${lineN}`, why: `target has ${best} lines (best: ${path.relative(repoRoot, bestPath)})` });
    }
  }

  for (const m of src.matchAll(DOC_RE)) {
    const offset = m.index ?? 0;
    if (inRanges(fences, offset) || inRanges(gitHistory, offset)) continue;
    const token = trimTrailing(m[0]);
    if (token === relDoc) continue;
    const { line, col } = offsetToLine(src, offset);
    const abs = path.join(repoRoot, token);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      failures.push({ file: relDoc, line, col, kind: 'cross-doc', ref: token, why: 'doc file not found on disk' });
    }
  }

  const docDir = path.dirname(absDocPath);
  for (const m of src.matchAll(MD_REL_LINK_RE)) {
    const offset = m.index ?? 0;
    if (inRanges(fences, offset) || inRanges(gitHistory, offset)) continue;
    const token = m[1];
    const { line, col } = offsetToLine(src, offset);
    const target = path.resolve(docDir, token);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      failures.push({ file: relDoc, line, col, kind: 'rel-md-link', ref: token, why: 'relative markdown link target not found' });
    }
  }

  return failures;
}

/**
 * Collect the repo-relative paths of files a doc references and that resolve to
 * a UNIQUE on-disk file (ambiguous basenames are skipped — we cannot attribute a
 * change to one specific file). Used by the event-driven freshness check.
 * Excludes the doc's own self-reference and refs in fenced/git-history spans.
 */
export function collectReferencedFiles(absDocPath, relDoc, repoRoot, index) {
  const src = fs.readFileSync(absDocPath, 'utf8');
  const fences = buildFenceRanges(src);
  const gitHistory = buildGitHistoryRanges(src);
  const files = new Set();

  const add = (token) => {
    const candidates = resolvePathToken(token, repoRoot, index);
    if (candidates.length !== 1) return; // ambiguous or missing → not attributable
    const rel = path.relative(repoRoot, candidates[0]);
    if (rel === relDoc) return;
    files.add(rel);
  };

  for (const m of src.matchAll(PATH_LINE_RE)) {
    const offset = m.index ?? 0;
    if (inRanges(fences, offset) || inRanges(gitHistory, offset)) continue;
    add(m[1]);
  }
  for (const m of src.matchAll(DOC_RE)) {
    const offset = m.index ?? 0;
    if (inRanges(fences, offset) || inRanges(gitHistory, offset)) continue;
    add(trimTrailing(m[0]));
  }
  return files;
}
