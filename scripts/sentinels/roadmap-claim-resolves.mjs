#!/usr/bin/env node
/**
 * Sentinel: roadmap-claim-resolves (UFR-024)
 *
 * Scans every `docs/ROADMAP*.md` and verifies that the claims they make about
 * the code base actually resolve. Born out of the 2026-05-20 audit which
 * uncovered 22 falsified P0 claims, fabricated items, and systemic 1.5-3x
 * inflation in the (now deleted) `docs/ROADMAP_REMEDIATION_*.md` satellites,
 * consolidated into `docs/ROADMAP_PRODUCT.md`.
 *
 * For each roadmap file we check:
 *
 *   1. Every `path/file.ext:NN` reference resolves — the file exists AND has
 *      at least NN lines. Paths are matched by basename across the repo
 *      (workspace-prefix-free, mirroring the way roadmaps quote them).
 *   2. Every commit SHA (`[0-9a-f]{7,40}` not embedded in a URL) resolves via
 *      `git cat-file -e <sha>^{commit}`.
 *   3. Every `docs/.../*.md` cross-reference resolves on disk.
 *   4. Every `.github/workflows/*.yml` reference resolves on disk.
 *
 * Exit 0 = every claim resolves. Exit 1 = at least one dangling reference;
 * the violation is printed with the source file:line that emitted it.
 *
 * Origin: 22 falsified P0 claims uncovered 2026-05-20 (50-subagent audit).
 * Wired into pre-push (`.husky/pre-push`) and sentinel-mirror.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

// ── TTY-aware coloring ──────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY === true && !process.env.NO_COLOR;
const c = {
  red: (s) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};

// ── Source extensions we treat as code-like path:line targets ───────────────
const FILE_EXTS = ['ts', 'tsx', 'mjs', 'cjs', 'js', 'json', 'md', 'yml', 'yaml', 'sh', 'sql'];

// ── Regexes ─────────────────────────────────────────────────────────────────
// path:line — capture last basename token plus suffix, but allow internal
// slashes so refs like `infra/grafana/dashboards/foo.json:12` also match.
// We require an extension to avoid `name: type` Zod-schema-style false positives.
const PATH_LINE_RE = new RegExp(
  `([A-Za-z0-9_\\-./]+\\.(?:${FILE_EXTS.join('|')})):(\\d+)`,
  'g',
);

// Commit SHA — 7-40 lowercase hex, surrounded by markdown backticks OR a word
// boundary. We then exclude URLs by checking the matched character window.
const SHA_RE = /(?<![0-9a-f])\b([0-9a-f]{7,40})\b(?![0-9a-f])/g;

// docs/... cross-doc — `docs/X.md`, `docs/operations/Y.md`, etc. We trim
// trailing punctuation (`.`, `,`, `)`, `\``) in the consumer.
// Negative lookbehind rejects `museum-frontend/docs/...` and `something-docs/...`
// — those are not the repo-root `docs/` we care about.
const DOC_RE = /(?<![A-Za-z0-9_\-/])docs\/[A-Za-z0-9_\-/.]+\.md/g;

// .github/workflows/*.yml or .yaml
const WORKFLOW_RE = /\.github\/workflows\/[A-Za-z0-9_\-]+\.ya?ml/g;

// ── Repo file index (basename → list of relative paths) ─────────────────────
// Built once; basename lookup is O(1) and skips node_modules / build / .git.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.test-dist',
  '.next',
  '.expo',
  '.maestro-output',
  'ios/Pods',
  'android/build',
  '.turbo',
]);

const fileIndex = new Map(); // basename -> [absPath, ...]

function indexRepo(dir) {
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
      // Skip nested ios/Pods specifically
      if (full.endsWith('/ios/Pods')) continue;
      indexRepo(full);
    } else if (ent.isFile()) {
      const base = ent.name;
      const arr = fileIndex.get(base);
      if (arr) arr.push(full);
      else fileIndex.set(base, [full]);
    }
  }
}

indexRepo(repoRoot);

// ── Helpers ─────────────────────────────────────────────────────────────────
function lineCount(absPath) {
  // Cheap line count: read once. Roadmaps target source files < 5MB.
  try {
    const buf = fs.readFileSync(absPath);
    let n = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++;
    // If file does not end with newline the last line still counts.
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) n++;
    return n;
  } catch {
    return -1;
  }
}

// Try to resolve a path token to an absolute on-disk path.
// Strategy:
//   1. literal path (relative to repoRoot) — works for refs that include the
//      workspace prefix (museum-backend/src/...).
//   2. basename lookup — for bare `chat.service.ts`. If multiple matches
//      exist we prefer the one inside `museum-{backend,frontend,web}/` and
//      then by shortest path; if still ambiguous we treat all matches as
//      candidates (the line-count check only needs ONE to pass).
function resolvePathToken(token) {
  // 1. literal
  const abs = path.join(repoRoot, token);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return [abs];
  }
  // 2. basename
  const base = path.basename(token);
  const hits = fileIndex.get(base);
  if (!hits || hits.length === 0) return [];
  // If the token has a directory hint, prefer matches whose path ENDS with the
  // token (handles `features/chat/application/useTextToSpeech.ts`).
  if (token.includes('/')) {
    const suffixMatches = hits.filter((h) => h.endsWith(token));
    if (suffixMatches.length > 0) return suffixMatches;
  }
  return hits;
}

// Commit SHA — cache `git cat-file -e` results.
const shaCache = new Map();
function shaExists(sha) {
  if (shaCache.has(sha)) return shaCache.get(sha);
  let ok = false;
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    ok = true;
  } catch {
    ok = false;
  }
  shaCache.set(sha, ok);
  return ok;
}

// Trim trailing markdown punctuation from a captured ref.
function trimTrailing(s) {
  return s.replace(/[).,:;`"'\]]+$/, '');
}

// Compute (line, column) from a byte offset into the source.
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

// Detect whether a character offset sits inside a URL token. Heuristic: walk
// backwards from `offset` until whitespace or `(` `<` boundary — if the
// preceding token contains `://`, the SHA is part of a URL.
function isInsideUrl(src, offset) {
  let start = offset;
  while (start > 0) {
    const ch = src.charCodeAt(start - 1);
    // Stop at whitespace, parens, angle brackets, or backtick boundaries.
    if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x28 || ch === 0x3c || ch === 0x60) break;
    start--;
  }
  let end = offset;
  while (end < src.length) {
    const ch = src.charCodeAt(end);
    if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x29 || ch === 0x3e || ch === 0x60) break;
    end++;
  }
  return src.slice(start, end).includes('://');
}

// Detect whether a captured token sits inside a fenced ```code block — those
// often contain illustrative paths that should NOT be enforced.
function buildFenceMap(src) {
  // Returns array of [startOffset, endOffset] for each fenced block.
  const ranges = [];
  const fenceRe = /^```/gm;
  let m;
  let openStart = null;
  while ((m = fenceRe.exec(src)) !== null) {
    if (openStart === null) {
      openStart = m.index;
    } else {
      ranges.push([openStart, m.index + 3]);
      openStart = null;
    }
  }
  return ranges;
}

function isInsideFence(fences, offset) {
  for (const [s, e] of fences) {
    if (offset >= s && offset <= e) return true;
  }
  return false;
}

// Detect whether an offset sits inside a `git log` / `git show` inline-code
// span. These commands are the canonical way to reference a DELETED file ;
// validating the path on disk would produce a false-positive every time the
// roadmap honestly documents an archived/deleted artefact.
function buildGitHistoryRanges(src) {
  const ranges = [];
  // Match inline backtick spans containing `git log`, `git show`, or
  // `git cat-file` followed by a `--` or path. Examples:
  //   `git log -- docs/adr/ADR-001-...md`
  //   `git show abc1234:foo/bar.ts`
  //   `git log --all -- docs/_archive/...md`
  const re = /`[^`\n]*\bgit (?:log|show|cat-file)\b[^`\n]*`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInsideRange(ranges, offset) {
  for (const [s, e] of ranges) {
    if (offset >= s && offset <= e) return true;
  }
  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────
// Only scan TRACKED roadmap files. Untracked working drafts (e.g. obsolete
// REMEDIATION_*.md superseded by ROADMAP_PRODUCT consolidation) are gitignored
// scratch — they MUST NOT block the push gate. The day they are committed they
// become part of the team contract and the sentinel kicks in automatically.
let trackedDocs = '';
try {
  trackedDocs = execFileSync('git', ['ls-files', 'docs/ROADMAP*.md'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
} catch {
  trackedDocs = '';
}
const roadmapGlob = trackedDocs
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && /\/ROADMAP[^/]*\.md$/i.test(s));

if (roadmapGlob.length === 0) {
  console.log(c.dim('[sentinel:roadmap-claim-resolves] no docs/ROADMAP*.md files — nothing to verify'));
  process.exit(0);
}

const failures = [];

for (const rel of roadmapGlob) {
  const abs = path.join(repoRoot, rel);
  const src = fs.readFileSync(abs, 'utf8');
  const fences = buildFenceMap(src);
  const gitHistory = buildGitHistoryRanges(src);

  // 1. path:line
  for (const m of src.matchAll(PATH_LINE_RE)) {
    const offset = m.index ?? 0;
    if (isInsideFence(fences, offset)) continue;
    if (isInsideRange(gitHistory, offset)) continue;
    const token = m[1];
    const lineN = parseInt(m[2], 10);
    const { line, col } = offsetToLine(src, offset);
    const candidates = resolvePathToken(token);
    if (candidates.length === 0) {
      failures.push({
        file: rel,
        line,
        col,
        kind: 'path:line',
        ref: `${token}:${lineN}`,
        why: 'file not found in repo (literal path + basename lookup)',
      });
      continue;
    }
    // At least one candidate must have >= lineN lines.
    let bestLines = -1;
    let bestPath = null;
    for (const cand of candidates) {
      const lc = lineCount(cand);
      if (lc > bestLines) {
        bestLines = lc;
        bestPath = cand;
      }
    }
    if (bestLines < lineN) {
      failures.push({
        file: rel,
        line,
        col,
        kind: 'path:line',
        ref: `${token}:${lineN}`,
        why: `target has ${bestLines} lines (best candidate: ${path.relative(repoRoot, bestPath)})`,
      });
    }
  }

  // 2. commit SHA
  for (const m of src.matchAll(SHA_RE)) {
    const offset = m.index ?? 0;
    if (isInsideFence(fences, offset)) continue;
    if (isInsideUrl(src, offset)) continue;
    if (isInsideRange(gitHistory, offset)) continue;
    const sha = m[1];
    // Skip pure-digit hex (likely a year or number). Need at least one a-f.
    if (!/[a-f]/.test(sha)) continue;
    // Skip 40-char strings that don't look like git SHAs but might be other
    // hashes — `git cat-file -e` will reject them anyway, but a length-32
    // UUID-style hex would never match. Length 7-40 is the git range.
    const { line, col } = offsetToLine(src, offset);
    if (!shaExists(sha)) {
      failures.push({
        file: rel,
        line,
        col,
        kind: 'commit-sha',
        ref: sha,
        why: 'git cat-file -e <sha>^{commit} rejected — commit not in current repo',
      });
    }
  }

  // 3. docs/... cross-doc
  for (const m of src.matchAll(DOC_RE)) {
    const offset = m.index ?? 0;
    if (isInsideFence(fences, offset)) continue;
    if (isInsideRange(gitHistory, offset)) continue;
    const token = trimTrailing(m[0]);
    const { line, col } = offsetToLine(src, offset);
    // self-reference is fine
    if (token === rel) continue;
    const abs2 = path.join(repoRoot, token);
    if (!fs.existsSync(abs2) || !fs.statSync(abs2).isFile()) {
      failures.push({
        file: rel,
        line,
        col,
        kind: 'cross-doc',
        ref: token,
        why: 'doc file not found on disk',
      });
    }
  }

  // 4. .github/workflows/*.yml
  for (const m of src.matchAll(WORKFLOW_RE)) {
    const offset = m.index ?? 0;
    if (isInsideFence(fences, offset)) continue;
    if (isInsideRange(gitHistory, offset)) continue;
    const token = m[0];
    const { line, col } = offsetToLine(src, offset);
    const abs2 = path.join(repoRoot, token);
    if (!fs.existsSync(abs2)) {
      failures.push({
        file: rel,
        line,
        col,
        kind: 'workflow',
        ref: token,
        why: 'workflow yml not found on disk',
      });
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  const counts = {
    files: roadmapGlob.length,
    indexed: fileIndex.size,
    shas: shaCache.size,
  };
  console.log(
    c.green('[sentinel:roadmap-claim-resolves] PASS') +
      ` — scanned ${counts.files} roadmap file(s); ` +
      `every path:line / commit SHA / cross-doc / workflow ref resolves. ` +
      c.dim(`(${counts.indexed} repo files indexed, ${counts.shas} SHA(s) checked)`),
  );
  process.exit(0);
}

console.error(c.red(c.bold(`[sentinel:roadmap-claim-resolves] FAIL — ${failures.length} dangling reference(s)`)));
console.error('');
// Group by file for readable output
const byFile = new Map();
for (const f of failures) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
for (const [file, list] of byFile.entries()) {
  console.error(c.bold(`  ${file}`));
  for (const f of list) {
    console.error(
      `    ${c.yellow(`${f.file}:${f.line}:${f.col}`)} ` +
        `${c.dim('[' + f.kind + ']')} ` +
        c.red(f.ref) +
        ` — ${f.why}`,
    );
  }
  console.error('');
}
console.error(c.dim('  Roadmaps are the team contract — every claim must resolve. Fix the ref or remove the claim.'));
console.error(c.dim('  Origin: audit 2026-05-20 (UFR-024).'));
process.exit(1);
