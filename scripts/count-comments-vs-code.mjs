#!/usr/bin/env node
// Audit lignes code vs commentaires — code de prod (BE src + FE hors generated/tests + Web src).
// Motivation : un agent IA lit/maintient les commentaires plutôt que de raisonner sur le code →
// trop de commentaires polluent la fenêtre de contexte. Objectif : identifier le bruit avec précision.
//
// Modes :
//   (défaut) → summary global + catégorisation + top fichiers
//   --list-jsdoc <file>           → dump des blocs JSDoc d'un fichier avec la signature voisine
//   --detect-redundant-jsdoc      → JSDoc qui n'apporte rien (tag-only sans description, ou stubs vides)
//   --detect-paraphrase           → commentaires // dont les tokens recouvrent l'identifiant juste en dessous
//   --all                         → résumé + les 3 détections (output condensé)
//
// Options :
//   --limit=N         limite l'affichage stdout (défaut 50). Le fichier --out reçoit tout.
//   --out=path.json   dump JSON complet (par mode)
//   --jaccard=0.5     seuil de similarité paraphrase (défaut 0.5)
//   --min-code=30     seuil min de lignes de code pour les classements ratio (défaut 30)

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const SCAN_ROOTS = ['museum-backend/src', 'museum-frontend', 'museum-web/src'];

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules', '.test-dist', '.next', 'dist', 'build', '.expo',
  'ios', 'android', 'coverage', '__tests__', 'tests', '__mocks__',
  '.git', 'generated', 'migrations',
]);

const EXCLUDED_PATH_SUFFIXES = [
  '.test.ts', '.test.tsx', '.test.js', '.test.jsx',
  '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx',
  '.generated.ts', '.generated.tsx', '.d.ts',
];

const EXCLUDED_BASENAMES = new Set([
  'openapi.ts', 'tokens.generated.ts', 'artworks.data.ts',
]);

// ─── Catégories de commentaires (mode summary) ─────────────────────────────
const KIND_LABELS = {
  jsdoc:            { tag: 'REVIEW', desc: 'JSDoc — souvent redondant avec les types TS' },
  block:            { tag: 'REVIEW', desc: '/* */ — block non-jsdoc' },
  banner:           { tag: 'NOISE',  desc: 'décoration / séparateur / fichier-header' },
  'commented-code': { tag: 'NOISE',  desc: 'code mort commenté — supprimer (git garde l\'historique)' },
  todo:             { tag: 'SIGNAL', desc: 'TODO/FIXME/HACK — actionable, à garder' },
  eslint:           { tag: 'SIGNAL', desc: 'eslint-disable — justification obligatoire (UFR-014)' },
  'ts-directive':   { tag: 'SIGNAL', desc: '@ts-expect-error / @ts-ignore — workaround typé, à garder' },
  ref:              { tag: 'SIGNAL', desc: 'ADR / TD / UFR / PR / commit SHA — cross-ref' },
  prose:            { tag: 'REVIEW', desc: 'prose narrative — souvent paraphrase, à challenger' },
};
const KIND_ORDER = ['jsdoc', 'block', 'banner', 'commented-code', 'prose', 'todo', 'eslint', 'ts-directive', 'ref'];

const RE_BANNER       = /^[/=*\-_#~+\s]+$/;
const RE_TODO         = /\b(TODO|FIXME|HACK|XXX|BUG|NOTE!:?)\b/;
const RE_ESLINT       = /\beslint-(disable|enable)/;
const RE_TS_DIRECTIVE = /@ts-(ignore|expect-error|nocheck|check)\b/;
const RE_REF          = /\b(ADR|TD|UFR|PR)-?\s*#?\d+\b|PR\s*#\d+|commit\s+[a-f0-9]{7,}|prettier-ignore|biome-ignore/i;
const RE_CODE_START   = /^\s*(const|let|var|function|return|if|else|for|while|class|interface|type|enum|import|export|await|async|try|catch|throw|switch|case|default|new|do)\b/;
const RE_CODE_CALL    = /^\s*[\w$.]+\s*\(.*\)\s*[;{]?\s*$/;
const RE_CODE_BRACE   = /^\s*[}{][;,)]?\s*$/;
const RE_CODE_ASSIGN  = /^\s*[\w$.[\]]+\s*[+\-*/%|&^]?=\s*.+;?\s*$/;
const RE_CODE_JSX     = /^\s*<\/?\w/;

const STOPWORDS = new Set([
  // EN
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'these', 'those', 'it', 'its', 'as', 'if', 'or', 'and', 'not', 'with', 'from', 'into',
  'on', 'in', 'at', 'to', 'of', 'for', 'by', 'so', 'do', 'we', 'us', 'our', 'all',
  'when', 'where', 'why', 'how', 'what', 'which', 'who',
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'pour', 'avec',
  'sur', 'dans', 'par', 'que', 'qui', 'quoi', 'pas', 'plus', 'moins', 'mais', 'donc',
  'son', 'sa', 'ses', 'cette', 'ce', 'ces', 'aux', 'au',
  // Common code-noise
  'get', 'set', 'has', 'returns', 'return', 'gets', 'sets', 'check', 'checks',
  'fn', 'fonction', 'function', 'method', 'methode', 'helper', 'util', 'utility',
  'type', 'interface', 'class', 'const', 'let', 'var', 'enum',
  'use', 'uses', 'used', 'call', 'calls', 'called',
  'value', 'values', 'param', 'params', 'arg', 'args',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString('fr-FR').replace(/ /g, ' ');
const pct = (n, d) => d === 0 ? '0.0%' : ((n / d) * 100).toFixed(1) + '%';

function parseArgs(argv) {
  const args = { mode: 'summary', limit: 50, jaccard: 0.5, minCode: 30, out: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list-jsdoc') { args.mode = 'list-jsdoc'; args.file = argv[++i]; }
    else if (a === '--detect-redundant-jsdoc') args.mode = 'redundant-jsdoc';
    else if (a === '--detect-paraphrase') args.mode = 'paraphrase';
    else if (a === '--all') args.mode = 'all';
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice(8));
    else if (a.startsWith('--jaccard=')) args.jaccard = Number(a.slice(10));
    else if (a.startsWith('--min-code=')) args.minCode = Number(a.slice(11));
    else if (a.startsWith('--out=')) args.out = a.slice(6);
  }
  return args;
}

function isExcludedPath(absPath) {
  const rel = relative(ROOT, absPath);
  if (EXCLUDED_PATH_SUFFIXES.some((s) => rel.endsWith(s))) return true;
  const segments = rel.split('/');
  if (segments.some((seg) => EXCLUDED_DIR_NAMES.has(seg))) return true;
  if (EXCLUDED_BASENAMES.has(segments[segments.length - 1])) return true;
  return false;
}

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (!CODE_EXT.has(extname(entry.name))) continue;
      if (isExcludedPath(full)) continue;
      yield full;
    }
  }
}

async function* allSourceFiles() {
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    try { await stat(abs); } catch { continue; }
    yield* walk(abs);
  }
}

function printSection(title) {
  console.log('');
  console.log('━'.repeat(78));
  console.log(`  ${title}`);
  console.log('━'.repeat(78));
}

// ─── Tokenizer line-by-line (mode summary) ──────────────────────────────────
function classifyLineComment(content) {
  const t = content.trim();
  if (t === '' || RE_BANNER.test(t)) return 'banner';
  if (RE_TODO.test(t)) return 'todo';
  if (RE_ESLINT.test(t)) return 'eslint';
  if (RE_TS_DIRECTIVE.test(t)) return 'ts-directive';
  if (RE_REF.test(t)) return 'ref';
  if (RE_CODE_START.test(t) || RE_CODE_CALL.test(t) || RE_CODE_BRACE.test(t)
      || RE_CODE_ASSIGN.test(t) || RE_CODE_JSX.test(t)) return 'commented-code';
  return 'prose';
}

function emptyStats() {
  const s = { total: 0, code: 0, mixed: 0, comment: 0, blank: 0, byKind: {} };
  for (const k of Object.keys(KIND_LABELS)) s.byKind[k] = 0;
  return s;
}

function analyzeFile(source) {
  const stats = emptyStats();
  const lines = source.split(/\r?\n/);
  let blockKind = null;

  for (const line of lines) {
    stats.total++;
    if (line.trim() === '' && !blockKind) { stats.blank++; continue; }

    let hasCode = false;
    const lineKinds = [];
    let i = 0, inString = null;

    while (i < line.length) {
      const ch = line[i], next = line[i + 1];
      if (blockKind) {
        if (ch === '*' && next === '/') { lineKinds.push(blockKind); blockKind = null; i += 2; continue; }
        i++; continue;
      }
      if (inString) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inString) inString = null;
        i++; continue;
      }
      if (ch === '/' && next === '/') { lineKinds.push(classifyLineComment(line.slice(i + 2))); i = line.length; continue; }
      if (ch === '/' && next === '*') {
        blockKind = (line[i + 2] === '*' && line[i + 3] !== '/') ? 'jsdoc' : 'block';
        i += 2; continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { inString = ch; hasCode = true; i++; continue; }
      if (!/\s/.test(ch)) hasCode = true;
      i++;
    }

    if (lineKinds.length === 0 && blockKind) lineKinds.push(blockKind);

    if (hasCode && lineKinds.length > 0) stats.mixed++;
    else if (hasCode) stats.code++;
    else if (lineKinds.length > 0) {
      stats.comment++;
      stats.byKind[lineKinds[0]] = (stats.byKind[lineKinds[0]] || 0) + 1;
    } else stats.blank++;
  }
  return stats;
}

function mergeInto(target, src) {
  for (const k of ['total', 'code', 'mixed', 'comment', 'blank']) target[k] += src[k];
  for (const k of Object.keys(src.byKind)) target.byKind[k] += src.byKind[k];
}

// ─── Extracteur de blocs JSDoc ──────────────────────────────────────────────
// Renvoie { startLine, endLine, content, nextSignature, nextLineNo, inner, lineCount }
// startLine/endLine = 1-indexé. inner = lignes de contenu (sans `/**` ni `*/` ni `*` leading).
function extractJsdocBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let inBlock = false, blockKind = null, blockStart = -1, inString = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let i = 0;
    while (i < line.length) {
      const ch = line[i], next = line[i + 1];
      if (inBlock) {
        if (ch === '*' && next === '/') {
          if (blockKind === 'jsdoc') {
            const contentLines = lines.slice(blockStart, li + 1);
            // next significant line = pas blank / pas ligne-comment
            let nl = li + 1;
            while (nl < lines.length) {
              const t = lines[nl].trim();
              if (t === '' || t.startsWith('//')) { nl++; continue; }
              break;
            }
            const inner = parseJsdocInner(contentLines.join('\n'));
            blocks.push({
              startLine: blockStart + 1,
              endLine: li + 1,
              lineCount: li - blockStart + 1,
              content: contentLines.join('\n'),
              inner,
              nextSignature: nl < lines.length ? lines[nl].trim() : '',
              nextLineNo: nl < lines.length ? nl + 1 : null,
            });
          }
          inBlock = false; blockKind = null; blockStart = -1;
          i += 2; continue;
        }
        i++; continue;
      }
      if (inString) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inString) inString = null;
        i++; continue;
      }
      if (ch === '/' && next === '/') { i = line.length; continue; }
      if (ch === '/' && next === '*') {
        blockKind = (line[i + 2] === '*' && line[i + 3] !== '/') ? 'jsdoc' : 'block';
        inBlock = true; blockStart = li;
        i += 2; continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') { inString = ch; i++; continue; }
      i++;
    }
  }
  return blocks;
}

function parseJsdocInner(raw) {
  return raw
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
    .filter((l, idx, arr) => !(idx === 0 && l.trim() === '') && !(idx === arr.length - 1 && l.trim() === ''));
}

// ─── Détecteur de JSDoc redondant ───────────────────────────────────────────
// Niveaux de redondance :
//   empty-stub                  → /** */ ou inner vide
//   only-inheritdoc-or-override → @inheritDoc seul (TS infère, JSDoc n'apporte rien)
//   tag-only-no-description     → @param/@returns/@throws sans texte
//   paraphrases-signature       → prose qui répète le nom de la signature voisine (Jaccard ≥ paraphraseThreshold)
// High-value markers qui forcent KEEP (même si Jaccard élevé) :
//   - refs (ADR/TD/UFR/PR/commit/{@link})
//   - tags @deprecated/@see/@example/@todo/@fixme/@security
//   - mots-clés WHY (because, prevents, avoids, ensures, race, atomic, gotcha, workaround,
//     edge case, SEC, GDPR, SEC:, WHY:, REASON:, NOTE:, IMPORTANT:, side effect, mutates, throws)
const RE_HIGH_VALUE_REF = /\b(ADR|TD|UFR|PR)-?\s*#?\d+\b|PR\s*#\d+|commit\s+[a-f0-9]{7,}|\{@link\b|\bSEC\b|\bGDPR\b|\bRGPD\b/i;
const RE_HIGH_VALUE_WHY = /\b(because|prevents?|avoids?|ensures?|guarantees?|race condition|atomic(?:ally)?|gotcha|workaround|edge ?case|side ?effect|mutates?|hack|caveat|tradeoff|fallback|why:|reason:|note:|important:|warning:|caution:)\b/i;
const RE_HIGH_VALUE_TAG = /^@(deprecated|see|example|todo|fixme|security|throws|throw|exception)\b/i;

function isRedundantJsdoc(content, nextSignature = '', paraphraseThreshold = 0.5) {
  const inner = parseJsdocInner(content);
  const nonEmpty = inner.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { redundant: true, reason: 'empty-stub' };

  let hasProse = false;
  let hasDescribedTag = false;
  let hasAnyTag = false;
  let onlyInherit = true;
  let hasHighValueMarker = false;
  const proseLines = [];
  const tagDescriptions = [];

  for (const rawLine of nonEmpty) {
    const line = rawLine.trim();
    if (RE_HIGH_VALUE_REF.test(line) || RE_HIGH_VALUE_WHY.test(line)) hasHighValueMarker = true;

    if (!line.startsWith('@')) {
      hasProse = true; onlyInherit = false;
      proseLines.push(line);
      continue;
    }
    hasAnyTag = true;
    const m = line.match(/^@(\w+)\b(.*)$/);
    if (!m) { onlyInherit = false; continue; }
    const tag = m[1].toLowerCase();
    const rest = m[2].trim();

    if (tag === 'inheritdoc' || tag === 'override') continue;
    onlyInherit = false;

    if (RE_HIGH_VALUE_TAG.test(line)) hasHighValueMarker = true;

    if (tag === 'deprecated' || tag === 'see' || tag === 'example' || tag === 'todo' || tag === 'fixme' || tag === 'security') {
      hasDescribedTag = true; continue;
    }
    if (tag === 'param') {
      const stripped = rest.replace(/^\{[^}]*\}\s*/, '').replace(/^\[?[\w$.]+\]?\s*[-:]?\s*/, '').trim();
      if (stripped.length >= 3) { hasDescribedTag = true; tagDescriptions.push(stripped); }
      continue;
    }
    if (tag === 'returns' || tag === 'return' || tag === 'throws' || tag === 'throw' || tag === 'exception' || tag === 'yields' || tag === 'yield') {
      const stripped = rest.replace(/^\{[^}]*\}\s*/, '').trim();
      if (stripped.length >= 3) { hasDescribedTag = true; tagDescriptions.push(stripped); }
      continue;
    }
    if (rest.length >= 3) { hasDescribedTag = true; tagDescriptions.push(rest); }
  }

  if (onlyInherit && hasAnyTag) return { redundant: true, reason: 'only-inheritdoc-or-override' };

  if (!hasProse && !hasDescribedTag) {
    if (hasAnyTag) return { redundant: true, reason: 'tag-only-no-description' };
    return { redundant: true, reason: 'empty-stub' };
  }

  // Paraphrase check : prose + tags ne font que reformuler la signature.
  //
  // Algo :
  //   1. Extract tokens de la signature complète (nom + params + types lossy-stripped)
  //   2. Prose paraphrase score = containment(prose_tokens, sig_tokens) ≥ paraphraseThreshold
  //   3. Chaque tag (@param/@returns) doit être "trivial" :
  //        - ≤ TRIVIAL_TAG_MAX_TOKENS mots significatifs après stopwords
  //        - OU containment ≥ paraphraseThreshold-0.1 avec (sig ∪ {null, undefined})
  //   4. JSDoc redondant si : pas de marker high-value ET (pas de prose OU prose paraphrase)
  //      ET tous les tags triviaux
  if (!hasHighValueMarker && nextSignature) {
    const sigTokens = new Set(extractSignatureTokens(nextSignature));
    if (sigTokens.size >= 1) {
      const sigPlusNull = new Set([...sigTokens, 'null', 'undefined', 'true', 'false']);
      const TRIVIAL_TAG_MAX_TOKENS = 5;
      const TAG_PARAPHRASE_THRESHOLD = Math.max(0, paraphraseThreshold - 0.1);

      const proseTokens = tokenize(proseLines.join(' '));
      const proseContainment = proseTokens.length === 0 ? 1 : containment(proseTokens, sigTokens);
      const proseIsParaphrase = proseTokens.length === 0 || proseContainment >= paraphraseThreshold;

      const tagsAllTrivial = tagDescriptions.every((desc) => {
        const toks = tokenize(desc);
        if (toks.length <= TRIVIAL_TAG_MAX_TOKENS && containment(toks, sigPlusNull) >= TAG_PARAPHRASE_THRESHOLD) return true;
        if (toks.length === 0) return true;
        return false;
      });

      if (proseIsParaphrase && tagsAllTrivial) {
        const scoreLabel = proseTokens.length === 0
          ? `tag-trivial`
          : `prose=${proseContainment.toFixed(2)}`;
        return { redundant: true, reason: `paraphrases-signature(${scoreLabel})` };
      }
    }
  }

  return { redundant: false };
}

// ─── Détecteur de paraphrase ────────────────────────────────────────────────
function tokenize(text) {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-./,:;()[\]{}'"`<>!?@#$%^&*+=|\\~]+/)
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function extractIdentifier(line) {
  const t = line.trim();
  const patterns = [
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\*?\s*(\w+)/,
    /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    /^(?:export\s+)?(?:type|interface|enum)\s+(\w+)/,
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)/,
    /^(?:public|private|protected|static|readonly|async|override)?\s*(\w+)\s*[(:<=]/,
    /^(\w+)\s*[(:<=]/,
    /^(\w+)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[1];
  }
  return '';
}

// Tokens significatifs d'une signature TS (nom + params + return type stripped).
// Permet de comparer une JSDoc au "vocabulaire" de la signature qu'elle documente.
const RE_TS_KEYWORD = /\b(export|default|async|function|const|let|var|class|interface|type|enum|public|private|protected|static|readonly|abstract|implements|extends|return|new|await|this)\b/g;
function extractSignatureTokens(line) {
  return tokenize(line
    .replace(/<[^>]*>/g, ' ')
    .replace(RE_TS_KEYWORD, ' ')
  );
}

function containment(tokensList, refSet) {
  if (tokensList.length === 0) return 0;
  let inter = 0;
  for (const t of tokensList) if (refSet.has(t)) inter++;
  return inter / tokensList.length;
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

// Extrait tous les commentaires // (mono-ligne ou groupes consécutifs) attachés à une ligne de code
// Renvoie [{ commentLines: [{ lineNo, text }], targetLineNo, targetLine, identifier }]
function extractLineCommentGroups(source) {
  const lines = source.split(/\r?\n/);
  const groups = [];
  let currentGroup = null;
  let inBlock = false, inString = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // detect if line is a pure `//` comment (ignore lines that are mid-block-comment)
    // simple regex check: line starts with optional whitespace then //
    const trimmed = line.trim();

    // Update block/string state by scanning the line (cheap version)
    // We need to know if the line is "code with trailing //" or pure // line
    let i = 0;
    let lineSawCode = false;
    let lineCommentStart = -1;

    while (i < line.length) {
      const ch = line[i], next = line[i + 1];
      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; i += 2; continue; }
        i++; continue;
      }
      if (inString) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inString) inString = null;
        i++; continue;
      }
      if (ch === '/' && next === '/') { lineCommentStart = i; break; }
      if (ch === '/' && next === '*') { inBlock = true; i += 2; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inString = ch; lineSawCode = true; i++; continue; }
      if (!/\s/.test(ch)) lineSawCode = true;
      i++;
    }

    const isPureLineComment = !lineSawCode && lineCommentStart !== -1 && !inBlock;

    if (isPureLineComment) {
      const text = line.slice(lineCommentStart + 2).trim();
      // Skip SIGNAL kinds — we don't want to flag them as paraphrase
      const kind = classifyLineComment(text);
      if (['todo', 'eslint', 'ts-directive', 'ref', 'banner', 'commented-code'].includes(kind)) {
        // close current group without target
        if (currentGroup) { currentGroup = null; }
        continue;
      }
      if (!currentGroup) currentGroup = { commentLines: [], targetLineNo: null, targetLine: '', identifier: '' };
      currentGroup.commentLines.push({ lineNo: li + 1, text });
    } else {
      // line is code (or mid-block) → close group if present, with this as target
      if (currentGroup && trimmed !== '' && !inBlock) {
        currentGroup.targetLineNo = li + 1;
        currentGroup.targetLine = trimmed;
        currentGroup.identifier = extractIdentifier(trimmed);
        if (currentGroup.identifier) groups.push(currentGroup);
        currentGroup = null;
      } else if (trimmed === '') {
        // blank line breaks the group attachment
        currentGroup = null;
      }
    }
  }
  return groups;
}

// ─── Mode summary (résumé global) ───────────────────────────────────────────
async function runSummary({ limit, minCode }) {
  const totals = emptyStats();
  const perRoot = Object.fromEntries(SCAN_ROOTS.map((r) => [r, emptyStats()]));
  const perFile = [];

  for await (const file of allSourceFiles()) {
    const src = await readFile(file, 'utf8');
    const s = analyzeFile(src);
    mergeInto(totals, s);
    for (const root of SCAN_ROOTS) {
      if (relative(ROOT, file).startsWith(root)) { mergeInto(perRoot[root], s); break; }
    }
    perFile.push({ path: relative(ROOT, file), ...s });
  }

  const commentLines = totals.comment;
  const codeLines = totals.code;
  const nonBlank = totals.total - totals.blank;

  printSection('Musaium — Audit lignes code vs commentaires (prod only)');
  console.log(`Scope         : ${SCAN_ROOTS.join(', ')}`);
  console.log(`Fichiers      : ${fmt(perFile.length)}`);
  console.log(`Lignes total  : ${fmt(totals.total)}`);
  console.log(`  code        : ${fmt(totals.code).padStart(7)}  (${pct(totals.code, totals.total)})`);
  console.log(`  comment     : ${fmt(totals.comment).padStart(7)}  (${pct(totals.comment, totals.total)})`);
  console.log(`  mixed       : ${fmt(totals.mixed).padStart(7)}  (${pct(totals.mixed, totals.total)})`);
  console.log(`  blank       : ${fmt(totals.blank).padStart(7)}  (${pct(totals.blank, totals.total)})`);
  console.log('');
  console.log(`Ratio comment / code      : ${pct(commentLines, codeLines)}`);
  console.log(`Densité                   : 1 ligne de commentaire pour ${(codeLines / Math.max(commentLines, 1)).toFixed(1)} lignes de code`);

  printSection('Catégorisation des commentaires');
  console.log('TAG     CATÉGORIE         LIGNES     %COMMENT   DESCRIPTION');
  for (const k of KIND_ORDER) {
    const n = totals.byKind[k];
    const meta = KIND_LABELS[k];
    console.log(`${meta.tag.padEnd(7)} ${k.padEnd(17)} ${String(fmt(n)).padStart(7)}    ${pct(n, commentLines).padStart(7)}    ${meta.desc}`);
  }

  const noise = totals.byKind.banner + totals.byKind['commented-code'];
  const review = totals.byKind.jsdoc + totals.byKind.block + totals.byKind.prose;
  const signal = totals.byKind.todo + totals.byKind.eslint + totals.byKind['ts-directive'] + totals.byKind.ref;
  printSection('Estimation cleanup');
  console.log(`NOISE  : ${String(fmt(noise)).padStart(6)} lignes (${pct(noise, commentLines)})`);
  console.log(`REVIEW : ${String(fmt(review)).padStart(6)} lignes (${pct(review, commentLines)})`);
  console.log(`SIGNAL : ${String(fmt(signal)).padStart(6)} lignes (${pct(signal, commentLines)})`);

  printSection(`Top ${limit} fichiers par volume absolu de commentaires`);
  console.log('  #  COMMENT   CODE  RATIO   JSDOC  NOISE  PATH');
  [...perFile].sort((a, b) => b.comment - a.comment).slice(0, limit).forEach((f, idx) => {
    const n = f.byKind.banner + f.byKind['commented-code'];
    console.log(`${String(idx + 1).padStart(3)}  ${String(f.comment).padStart(6)}  ${String(f.code).padStart(6)}  ${pct(f.comment, f.code).padStart(6)}  ${String(f.byKind.jsdoc).padStart(5)}  ${String(n).padStart(5)}  ${f.path}`);
  });

  printSection(`Top ${limit} fichiers par ratio (code ≥ ${minCode})`);
  console.log('  #  RATIO  COMMENT   CODE   JSDOC  NOISE  PATH');
  perFile.filter((f) => f.code >= minCode)
    .sort((a, b) => (b.comment / Math.max(b.code, 1)) - (a.comment / Math.max(a.code, 1)))
    .slice(0, limit).forEach((f, idx) => {
      const n = f.byKind.banner + f.byKind['commented-code'];
      console.log(`${String(idx + 1).padStart(3)}  ${pct(f.comment, f.code).padStart(6)}  ${String(f.comment).padStart(6)}  ${String(f.code).padStart(6)}  ${String(f.byKind.jsdoc).padStart(5)}  ${String(n).padStart(5)}  ${f.path}`);
    });

  return { totals, perFile, perRoot };
}

// ─── Mode --list-jsdoc <file> ───────────────────────────────────────────────
async function runListJsdoc(file) {
  if (!file) {
    console.error('Usage : --list-jsdoc <chemin/relatif/au/repo.ts>');
    process.exit(2);
  }
  const abs = file.startsWith('/') ? file : join(ROOT, file);
  const src = await readFile(abs, 'utf8');
  const blocks = extractJsdocBlocks(src);
  const rel = relative(ROOT, abs);
  printSection(`JSDoc blocks dans ${rel}`);
  if (blocks.length === 0) { console.log('(aucun bloc JSDoc trouvé)'); return blocks; }
  console.log(`Total : ${blocks.length} blocs, ${blocks.reduce((s, b) => s + b.lineCount, 0)} lignes\n`);
  blocks.forEach((b, idx) => {
    const status = isRedundantJsdoc(b.content, b.nextSignature);
    const tag = status.redundant ? `[REDUNDANT: ${status.reason}]` : '[KEEP]';
    console.log(`── #${idx + 1} ${rel}:${b.startLine}-${b.endLine} (${b.lineCount}L) ${tag}`);
    b.inner.forEach((line) => console.log(`   │ ${line}`));
    console.log(`   ▶ ${rel}:${b.nextLineNo ?? '?'}  ${b.nextSignature.slice(0, 120)}${b.nextSignature.length > 120 ? '…' : ''}`);
    console.log('');
  });
  return blocks;
}

// ─── Mode --detect-redundant-jsdoc ──────────────────────────────────────────
async function runDetectRedundantJsdoc({ limit, out, jaccard: threshold }) {
  const findings = [];
  let totalScanned = 0, totalLines = 0;
  for await (const file of allSourceFiles()) {
    const src = await readFile(file, 'utf8');
    const blocks = extractJsdocBlocks(src);
    for (const b of blocks) {
      totalScanned++;
      const status = isRedundantJsdoc(b.content, b.nextSignature, threshold);
      if (status.redundant) {
        totalLines += b.lineCount;
        findings.push({
          path: relative(ROOT, file),
          startLine: b.startLine, endLine: b.endLine, lineCount: b.lineCount,
          reason: status.reason,
          nextSignature: b.nextSignature.slice(0, 140),
        });
      }
    }
  }

  printSection('JSDoc redondants détectés');
  console.log(`Blocs JSDoc scannés      : ${fmt(totalScanned)}`);
  console.log(`Blocs redondants         : ${fmt(findings.length)} (${pct(findings.length, totalScanned)})`);
  console.log(`Lignes récupérables      : ${fmt(totalLines)}`);
  const byReason = findings.reduce((acc, f) => {
    const key = f.reason.replace(/\([\d.]+\)$/, ''); // group paraphrases-signature(0.xx) → paraphrases-signature
    acc[key] = (acc[key] || 0) + 1; return acc;
  }, {});
  const linesByReason = findings.reduce((acc, f) => {
    const key = f.reason.replace(/\([\d.]+\)$/, '');
    acc[key] = (acc[key] || 0) + f.lineCount; return acc;
  }, {});
  console.log('Breakdown :');
  console.log('  REASON                          BLOCS   LIGNES');
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(32)} ${String(n).padStart(5)}   ${String(linesByReason[reason]).padStart(6)}`);
  }

  printSection(`Top ${limit} blocs redondants (par taille)`);
  console.log('  LINES  REASON                     LOCATION                                              SIGNATURE');
  [...findings].sort((a, b) => b.lineCount - a.lineCount).slice(0, limit).forEach((f) => {
    const loc = `${f.path}:${f.startLine}-${f.endLine}`;
    console.log(`  ${String(f.lineCount).padStart(5)}  ${f.reason.padEnd(26)} ${loc.padEnd(80)}  ${f.nextSignature.slice(0, 80)}`);
  });

  if (out) await dumpJson(out, { totalScanned, totalLines, findings });
  return { findings, totalScanned, totalLines };
}

// ─── Mode --detect-paraphrase ───────────────────────────────────────────────
async function runDetectParaphrase({ limit, jaccard: threshold, out }) {
  const findings = [];
  let totalGroups = 0;
  for await (const file of allSourceFiles()) {
    const src = await readFile(file, 'utf8');
    const groups = extractLineCommentGroups(src);
    for (const g of groups) {
      totalGroups++;
      if (!g.identifier) continue;
      const identTokens = new Set(tokenize(g.identifier));
      if (identTokens.size === 0) continue;
      const commentText = g.commentLines.map((c) => c.text).join(' ');
      const commentTokens = new Set(tokenize(commentText));
      if (commentTokens.size === 0) continue;
      const score = jaccard(commentTokens, identTokens);
      if (score >= threshold) {
        findings.push({
          path: relative(ROOT, file),
          commentStart: g.commentLines[0].lineNo,
          commentEnd: g.commentLines[g.commentLines.length - 1].lineNo,
          commentLineCount: g.commentLines.length,
          targetLineNo: g.targetLineNo,
          identifier: g.identifier,
          score: Number(score.toFixed(3)),
          comment: commentText.slice(0, 140),
          target: g.targetLine.slice(0, 140),
        });
      }
    }
  }

  const totalLines = findings.reduce((s, f) => s + f.commentLineCount, 0);
  printSection(`Paraphrases détectées (seuil Jaccard ≥ ${threshold})`);
  console.log(`Groupes // attachés à un identifiant : ${fmt(totalGroups)}`);
  console.log(`Paraphrases                         : ${fmt(findings.length)} (${pct(findings.length, totalGroups)})`);
  console.log(`Lignes récupérables                 : ${fmt(totalLines)}`);

  printSection(`Top ${limit} paraphrases (par score)`);
  console.log('  SCORE  LINES  LOCATION                                               IDENT  → COMMENT');
  [...findings].sort((a, b) => b.score - a.score).slice(0, limit).forEach((f) => {
    const loc = `${f.path}:${f.commentStart}`;
    console.log(`  ${f.score.toFixed(2)}   ${String(f.commentLineCount).padStart(4)}   ${loc.padEnd(54)}   ${f.identifier.padEnd(28)} ${f.comment.slice(0, 80)}`);
  });

  if (out) await dumpJson(out, { totalGroups, totalLines, findings });
  return { findings, totalGroups, totalLines };
}

async function dumpJson(path, data) {
  const abs = path.startsWith('/') ? path : join(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n→ Dump JSON : ${relative(ROOT, abs)} (${fmt(JSON.stringify(data).length)} octets)`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'list-jsdoc') { await runListJsdoc(args.file); return; }
  if (args.mode === 'redundant-jsdoc') { await runDetectRedundantJsdoc(args); return; }
  if (args.mode === 'paraphrase') { await runDetectParaphrase(args); return; }
  if (args.mode === 'all') {
    await runSummary(args);
    await runDetectRedundantJsdoc(args);
    await runDetectParaphrase(args);
    return;
  }
  await runSummary(args);
}

main().catch((e) => { console.error(e); process.exit(1); });
