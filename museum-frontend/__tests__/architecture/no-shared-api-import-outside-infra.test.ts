/**
 * C1 Red — Hexagonal layering sentinel.
 *
 * Cluster C1 acceptance criteria §6.1-§6.4 (spec.md) machine-verified as a
 * Jest sentinel so the doctrine is enforced post-merge (not just during the
 * audit window). Mirrors the doctrine codified in `CLAUDE.md` § Architecture:
 *   - `features/<f>/application/**` and `features/<f>/ui/**` MUST NOT import
 *     `@/shared/api/openapiClient`, `@/shared/api/httpRequest`,
 *     `@/shared/infrastructure/httpClient`, or `@react-native-async-storage/async-storage`.
 *   - The infrastructure layer (`features/<f>/infrastructure/**`) is the only
 *     allowed transport-/storage-importing layer.
 *   - The composition-root auth context (`features/auth/application/AuthContext.tsx`)
 *     and paywall provider (`features/paywall/application/PaywallProvider.tsx`)
 *     are explicitly whitelisted because they REGISTER the setter handlers
 *     (setAuthRefreshHandler / setPaywallHandler) — see design.md §Q2 (c).
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL today because the 6 violations
 * are still present (cf. spec §3 background). It turns GREEN after the
 * consumer-migration tasks (T3.1-T3.13) ship.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const FEATURES_ROOT = path.resolve(__dirname, '..', '..', 'features');

// Composition-root whitelist (design.md §Q2 decision (c)).
const WHITELIST_SUFFIXES = [
  path.join('auth', 'application', 'AuthContext.tsx'),
  path.join('paywall', 'application', 'PaywallProvider.tsx'),
];

const TRANSPORT_PATTERNS: readonly { label: string; needle: string }[] = [
  {
    label: '@/shared/api/openapiClient',
    needle: '@/shared/api/openapiClient',
  },
  {
    label: '@/shared/api/httpRequest',
    needle: '@/shared/api/httpRequest',
  },
  {
    label: '@/shared/infrastructure/httpClient',
    needle: '@/shared/infrastructure/httpClient',
  },
];

const ASYNC_STORAGE_PATTERN = '@react-native-async-storage/async-storage';

async function walk(dir: string): Promise<string[]> {
  let out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(await walk(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

function relativeFromFeatures(absPath: string): string {
  return path.relative(FEATURES_ROOT, absPath);
}

function isInsideInfrastructure(relPath: string): boolean {
  return relPath.split(path.sep).includes('infrastructure');
}

function isWhitelisted(relPath: string): boolean {
  return WHITELIST_SUFFIXES.some((w) => relPath.endsWith(w));
}

async function findOffenders(needle: string): Promise<string[]> {
  const files = await walk(FEATURES_ROOT);
  const offenders: string[] = [];
  for (const file of files) {
    const rel = relativeFromFeatures(file);
    if (isInsideInfrastructure(rel)) continue;
    if (isWhitelisted(rel)) continue;
    const content = await fs.readFile(file, 'utf-8');
    if (content.includes(needle)) {
      offenders.push(rel);
    }
  }
  return offenders.sort();
}

describe('Hexagonal sentinel: no shared transport/storage imports outside infrastructure layer', () => {
  for (const { label, needle } of TRANSPORT_PATTERNS) {
    it(`forbids ${label} outside features/**/infrastructure/** (composition-root whitelist applies)`, async () => {
      const offenders = await findOffenders(needle);
      expect(offenders).toEqual([]);
    });
  }

  it('forbids AsyncStorage imports inside features/chat/** outside infrastructure (REQ-C1-006)', async () => {
    const all = await findOffenders(ASYNC_STORAGE_PATTERN);
    const chatOffenders = all.filter((rel) => rel.split(path.sep)[0] === 'chat');
    expect(chatOffenders).toEqual([]);
  });

  it('forbids runAuthRefresh import in BiometricGate.tsx (UI must use authSessionService façade)', async () => {
    const gatePath = path.join(FEATURES_ROOT, 'auth', 'ui', 'BiometricGate.tsx');
    const content = await fs.readFile(gatePath, 'utf-8');
    expect(content).not.toMatch(/from ['"]@\/shared\/infrastructure\/httpClient['"]/);
    expect(content).not.toContain('runAuthRefresh');
  });

  it('forbids runAuthRefresh import in useFaceIdSessionRestore.ts (app layer must use authSessionService façade)', async () => {
    const hookPath = path.join(FEATURES_ROOT, 'auth', 'application', 'useFaceIdSessionRestore.ts');
    const content = await fs.readFile(hookPath, 'utf-8');
    expect(content).not.toMatch(/from ['"]@\/shared\/infrastructure\/httpClient['"]/);
    expect(content).not.toContain('runAuthRefresh');
  });
});
