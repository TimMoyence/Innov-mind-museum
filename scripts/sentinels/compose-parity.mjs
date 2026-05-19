#!/usr/bin/env node
/**
 * Sentinel: compose-parity
 *
 * Guards the contract between `museum-backend/docker-compose.dev.yml` and
 * `museum-backend/deploy/docker-compose.prod.yml`: when prod hardens a
 * shared service with a critical flag (e.g. `--requirepass` on Redis,
 * `--appendonly` for persistence, TLS modes), dev should mirror it so the
 * "works on dev, breaks in prod" class of regressions stays caught locally.
 *
 * The recurring failure mode this guards against:
 *
 *   1. Prod compose adds `--requirepass ${REDIS_PASSWORD:?}` to harden
 *      Redis. Dev compose stays bare (`image: redis:7-alpine` only).
 *   2. Backend code sends AUTH unconditionally (driven by env REDIS_PASSWORD).
 *   3. Dev runtime: Redis 7+ logs `[WARN] default user does not require a
 *      password, but a password was supplied` on every ioredis connection —
 *      200+/24h, drowns real errors.
 *   4. Or worse: dev runtime works ; prod runtime crashes because the
 *      hardening contract was never proven against an integration env.
 *
 * Seen 2026-05-18 (TD-44, audit run
 * `.claude/skills/team/team-state/2026-05-18-audit-dev-backend-bullmq-noise/`).
 *
 * What this sentinel checks, per service shared between dev and prod:
 *
 *   1. If prod has `command: [..., '--requirepass', ...]` → dev MUST also.
 *   2. If prod has `command: [..., '--appendonly', ...]` → dev SHOULD also
 *      (warn — persistence is legitimately different in dev).
 *   3. Same shape for other `--`-prefixed CLI flags we add later (extensible
 *      via the CRITICAL_FLAGS allow-list).
 *
 * Pure regex parsing — no yaml dep, runs in < 100 ms.
 *
 * Exit 0 = pass. Exit 1 = critical flag missing in dev.
 *
 * Performance: < 50 ms. Safe in pre-commit hook (Gate 7) and CI quality
 * gate (mirrored by `.github/workflows/sentinel-mirror.yml`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const DEV_PATH = path.join(repoRoot, 'museum-backend', 'docker-compose.dev.yml');
const PROD_PATH = path.join(repoRoot, 'museum-backend', 'deploy', 'docker-compose.prod.yml');

// Each entry: { flag, severity, services? }
// - severity 'critical' => exit 1 if drift detected
// - severity 'warn'     => exit 0 + stderr message
// - services (optional) => only check this flag on these service names
const CRITICAL_FLAGS = [
  { flag: '--requirepass', severity: 'critical', services: ['redis'] },
  { flag: '--appendonly', severity: 'warn', services: ['redis'] },
];

function readFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`[sentinel:compose-parity] FAIL: ${p} not found`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

/**
 * Parse a docker-compose file to extract, per top-level service, the raw
 * `command:` block as a single string (joined lines + flags). We only need
 * to know IF a flag appears in the command — not its exact YAML shape — so
 * regex extraction is enough.
 *
 * @param {string} text
 * @returns {Map<string, string>}
 */
function extractServiceCommands(text) {
  const out = new Map();
  const lines = text.split('\n');

  let currentService = null;
  let inCommand = false;
  let commandBuf = [];
  let commandIndent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Top-level service header: `  <name>:` at exactly 2-space indent (the
    // standard docker-compose layout used in this repo). Anything deeper
    // (4+ spaces) is a sub-key.
    const svcMatch = line.match(/^ {2}([a-z][a-z0-9_-]*):\s*$/);
    if (svcMatch) {
      if (currentService && commandBuf.length > 0) {
        out.set(currentService, commandBuf.join(' '));
      }
      currentService = svcMatch[1];
      inCommand = false;
      commandBuf = [];
      commandIndent = null;
      continue;
    }

    if (!currentService) continue;

    // Detect `    command:` line (4-space indent under service)
    const cmdMatch = line.match(/^( {4})command:\s*(.*)$/);
    if (cmdMatch) {
      inCommand = true;
      commandIndent = cmdMatch[1].length;
      const trailing = cmdMatch[2].trim();
      if (trailing) {
        // inline form: `command: redis-server --foo --bar` — capture the rest.
        commandBuf.push(trailing);
      }
      continue;
    }

    if (inCommand) {
      // Continue capturing while the line is indented deeper than commandIndent
      // (list items `-` or quoted strings). Stop when we hit a sibling key.
      const leadingSpaces = line.match(/^( *)/)[0].length;
      if (line.trim() === '' || leadingSpaces > commandIndent) {
        commandBuf.push(line.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, ''));
      } else {
        // sibling key reached
        inCommand = false;
      }
    }
  }

  if (currentService && commandBuf.length > 0) {
    out.set(currentService, commandBuf.join(' '));
  }

  return out;
}

const devText = readFile(DEV_PATH);
const prodText = readFile(PROD_PATH);

const devCommands = extractServiceCommands(devText);
const prodCommands = extractServiceCommands(prodText);

const failures = [];
const warnings = [];

for (const rule of CRITICAL_FLAGS) {
  const services = rule.services ?? [...prodCommands.keys()];
  for (const svc of services) {
    const prodCmd = prodCommands.get(svc) ?? '';
    const devCmd = devCommands.get(svc) ?? '';

    const prodHas = prodCmd.includes(rule.flag);
    const devHas = devCmd.includes(rule.flag);

    if (prodHas && !devHas) {
      const msg = `service "${svc}" — prod uses "${rule.flag}" in command, dev does not`;
      if (rule.severity === 'critical') {
        failures.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }
}

if (warnings.length > 0) {
  for (const w of warnings) {
    console.error(`[sentinel:compose-parity] WARN: ${w}`);
  }
}

if (failures.length > 0) {
  console.error('[sentinel:compose-parity] FAIL — critical flag drift:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  console.error('');
  console.error('  How to fix:');
  console.error('  - Add the missing flag to museum-backend/docker-compose.dev.yml.');
  console.error('  - See TD-44 in docs/TECH_DEBT.md for the audit context.');
  console.error('  - To intentionally diverge, document why in the compose file and add an exemption to scripts/sentinels/compose-parity.mjs CRITICAL_FLAGS.');
  process.exit(1);
}

console.log(`[sentinel:compose-parity] PASS — checked ${CRITICAL_FLAGS.length} flag rules across shared services.`);
process.exit(0);
