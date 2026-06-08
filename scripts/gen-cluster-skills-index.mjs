#!/usr/bin/env node
// gen-cluster-skills-index.mjs
// Construit un index déterministe et routable à partir des cartes de cluster
// auto-générées par `gitnexus analyze --skills` (.claude/skills/generated/<cluster>/SKILL.md).
//
// Ces cartes ne sont PAS des skills invocables (nichées à 2 niveaux → non découvertes
// par Claude Code ; régénérées à chaque run). On les expose à /team via un manifeste
// routable que la phase COMPRENDRE lit pour charger la carte du cluster touché par le diff.
//
// Modes :
//   (défaut)            régénère l'index + affiche un diff (clusters ajoutés/retirés/changés)
//   --check             ne write pas ; exit 1 si l'index sur disque est périmé (sentinelle)
//   --route [f1 f2 ...] mappe des fichiers → cluster(s) pertinent(s) (sans arg : git diff HEAD + untracked)
//
// Source de vérité = les SKILL.md générés. L'index est une projection, jamais édité à la main.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const GENERATED_DIR = join(REPO_ROOT, '.claude/skills/generated');
// IMPORTANT : l'index vit HORS de generated/ — `gitnexus analyze --skills` purge tout
// generated/ à chaque run. Le parent .claude/skills/ n'est jamais touché.
const INDEX_PATH = join(REPO_ROOT, '.claude/skills/cluster-skills-index.json');
const INDEX_REL = '.claude/skills/cluster-skills-index.json';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Parse une carte SKILL.md générée → objet cluster structuré. */
function parseClusterSkill(name, raw) {
  const lines = raw.split('\n');

  // Frontmatter : description
  let description = '';
  const descMatch = raw.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) description = descMatch[1].trim();

  // Ligne stats : "373 symbols | 168 files | Cohesion: 81%" (tolère séparateurs de milliers)
  let symbolCount = null, fileCount = null, cohesion = null;
  const statMatch = raw.match(/([\d  ,]+?)\s*symbols\s*\|\s*([\d  ,]+?)\s*files(?:\s*\|\s*Cohesion:\s*(\d+)%)?/i);
  if (statMatch) {
    symbolCount = parseInt(statMatch[1].replace(/[^\d]/g, ''), 10);
    fileCount = parseInt(statMatch[2].replace(/[^\d]/g, ''), 10);
    if (statMatch[3]) cohesion = parseInt(statMatch[3], 10);
  }

  // Key Files : lignes `| `path` | symbols |` (on saute header + séparateur)
  const keyFiles = [];
  let inKeyFiles = false;
  for (const line of lines) {
    if (/^##\s+Key Files/i.test(line)) { inKeyFiles = true; continue; }
    if (inKeyFiles && /^##\s/.test(line)) break;
    if (!inKeyFiles) continue;
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) keyFiles.push(m[1].trim());
  }

  // Entry Points : `- **`name`** (Type) — `path:line``
  const entryPoints = [];
  let inEntry = false;
  for (const line of lines) {
    if (/^##\s+Entry Points/i.test(line)) { inEntry = true; continue; }
    if (inEntry && /^##\s/.test(line)) break;
    if (!inEntry) continue;
    const m = line.match(/^-\s+\*\*`([^`]+)`\*\*\s*\(([^)]+)\)\s*—\s*`([^`]+)`/);
    if (m) entryPoints.push({ symbol: m[1], type: m[2], location: m[3] });
  }

  // Key Symbols : `| `Symbol` | Type | `File` | Line |`
  const keySymbols = [];
  let inSymbols = false;
  for (const line of lines) {
    if (/^##\s+Key Symbols/i.test(line)) { inSymbols = true; continue; }
    if (inSymbols && /^##\s/.test(line)) break;
    if (!inSymbols) continue;
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/);
    if (m) keySymbols.push({ symbol: m[1], type: m[2].trim(), file: m[3], line: parseInt(m[4], 10) });
  }

  // Router : préfixes de répertoires (dirname dédupliqués) + apps top-level
  const allPaths = [...new Set([...keyFiles, ...entryPoints.map((e) => e.location.replace(/:\d+$/, '')), ...keySymbols.map((s) => s.file)])];
  const pathPrefixes = [...new Set(allPaths.map((p) => dirname(p)).filter((d) => d && d !== '.'))].sort();
  const apps = [...new Set(allPaths.map((p) => p.split('/')[0]).filter(Boolean))].sort();

  return {
    name,
    skillPath: `.claude/skills/generated/${name}/SKILL.md`,
    description,
    symbolCount,
    fileCount,
    cohesion,
    apps,
    pathPrefixes,
    keyFiles: keyFiles.sort(),
    entryPoints,
    keySymbols,
    sourceSha: sha256(raw),
  };
}

/** Construit l'objet index complet (déterministe, clés triées). */
function buildIndex() {
  if (!existsSync(GENERATED_DIR)) {
    throw new Error(`Dossier introuvable: ${GENERATED_DIR} — lance d'abord \`gitnexus analyze --skills\``);
  }
  const clusters = readdirSync(GENERATED_DIR)
    .filter((n) => {
      const p = join(GENERATED_DIR, n);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
    })
    .sort()
    .map((name) => parseClusterSkill(name, readFileSync(join(GENERATED_DIR, name, 'SKILL.md'), 'utf8')));

  return {
    $schema: 'cluster-skills-index/v1',
    description:
      'Index routable des cartes de cluster auto-générées par GitNexus. Régénéré par scripts/gen-cluster-skills-index.mjs (hook post-commit). NE PAS éditer à la main — source = .claude/skills/generated/<cluster>/SKILL.md.',
    clusterCount: clusters.length,
    clusters,
  };
}

/** Sérialisation canonique (clés triées, newline final) pour des diffs git stables. */
function serialize(obj) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

function readExisting() {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Diff humain entre l'ancien et le nouvel index (par sourceSha de cluster). */
function printDiff(prev, next) {
  const prevMap = new Map((prev?.clusters ?? []).map((c) => [c.name, c.sourceSha]));
  const nextMap = new Map(next.clusters.map((c) => [c.name, c.sourceSha]));
  const added = [...nextMap.keys()].filter((n) => !prevMap.has(n));
  const removed = [...prevMap.keys()].filter((n) => !nextMap.has(n));
  const changed = [...nextMap.keys()].filter((n) => prevMap.has(n) && prevMap.get(n) !== nextMap.get(n));

  if (!prev) {
    console.log(`[cluster-skills] index initial créé — ${next.clusterCount} clusters.`);
    return;
  }
  if (!added.length && !removed.length && !changed.length) {
    console.log(`[cluster-skills] index à jour — ${next.clusterCount} clusters, aucun changement.`);
    return;
  }
  console.log(`[cluster-skills] index mis à jour — ${next.clusterCount} clusters.`);
  if (added.length) console.log(`  + ajoutés   : ${added.join(', ')}`);
  if (removed.length) console.log(`  - retirés   : ${removed.join(', ')}`);
  if (changed.length) console.log(`  ~ modifiés  : ${changed.join(', ')}`);
}

/** Liste des fichiers touchés (args explicites, sinon git diff HEAD + untracked). */
function changedFiles(args) {
  if (args.length) return args;
  try {
    const tracked = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' });
    const untracked = execSync('git ls-files --others --exclude-standard', { cwd: REPO_ROOT, encoding: 'utf8' });
    return [...tracked.split('\n'), ...untracked.split('\n')].map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Longueur du plus long préfixe d'un cluster qui est ancêtre du fichier (0 = aucun). */
function bestPrefixLen(cluster, file) {
  let best = 0;
  for (const p of cluster.pathPrefixes) {
    if (file === p || file.startsWith(p + '/')) best = Math.max(best, p.length);
  }
  return best;
}

/**
 * Route des fichiers → clusters pertinents par longest-prefix PAR FICHIER.
 * Chaque fichier est attribué au(x) cluster(s) dont le préfixe correspondant est le
 * plus spécifique — évite qu'un préfixe catch-all peu profond (ex `museum-backend/src`)
 * aspire tous les fichiers. Ties (même profondeur) → tous les clusters à égalité.
 */
function route(index, files) {
  const hits = new Map(); // cluster name → {cluster, matched:Set}
  for (const f of files) {
    let bestLen = 0;
    const winners = [];
    for (const c of index.clusters) {
      const len = bestPrefixLen(c, f);
      if (len === 0) continue;
      if (len > bestLen) { bestLen = len; winners.length = 0; winners.push(c); }
      else if (len === bestLen) winners.push(c);
    }
    for (const c of winners) {
      if (!hits.has(c.name)) hits.set(c.name, { cluster: c, matched: new Set() });
      hits.get(c.name).matched.add(f);
    }
  }
  return [...hits.values()].sort((a, b) => b.matched.size - a.matched.size);
}

// --- main ---
const argv = process.argv.slice(2);

if (argv[0] === '--route') {
  const index = readExisting();
  if (!index) {
    console.error(`[cluster-skills] index absent (${INDEX_REL}) — lance le générateur d'abord.`);
    process.exit(1);
  }
  const files = changedFiles(argv.slice(1));
  if (!files.length) {
    console.log('[cluster-skills] aucun fichier touché à router.');
    process.exit(0);
  }
  const matches = route(index, files);
  if (!matches.length) {
    console.log('[cluster-skills] aucun cluster ne couvre ces fichiers.');
    process.exit(0);
  }
  console.log('[cluster-skills] cartes de cluster à consulter (COMPRENDRE) :');
  for (const { cluster, matched } of matches) {
    console.log(`  • ${cluster.name.padEnd(18)} (${matched.size} fichier(s)) → ${cluster.skillPath}`);
  }
  process.exit(0);
}

const next = buildIndex();
const serialized = serialize(next);

if (argv.includes('--check')) {
  const onDisk = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, 'utf8') : null;
  if (onDisk === serialized) {
    console.log(`[cluster-skills] --check OK : index synchronisé (${next.clusterCount} clusters).`);
    process.exit(0);
  }
  console.error(`[cluster-skills] --check ÉCHEC : ${INDEX_REL} est périmé. Régénère avec \`node scripts/gen-cluster-skills-index.mjs\`.`);
  process.exit(1);
}

const prev = readExisting();
writeFileSync(INDEX_PATH, serialized);
printDiff(prev, next);
