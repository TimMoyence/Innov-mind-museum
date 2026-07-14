#!/usr/bin/env ts-node
/**
 * Sentinel: otel-instrumentation-roster — the anti-recidivism gate of
 * INC-2026-07-14-otel-openai-structured.
 *
 * WHY IT EXISTS
 * -------------
 * Nobody asked for `instrumentation-openai`. It entered
 * `@opentelemetry/auto-instrumentations-node` in 0.66.0, ACTIVE BY DEFAULT, via an
 * auto-merged transitive minor — and killed every structured-output LLM call of the
 * chat for ~2 months, in silence. A denylist ("is the offender disabled?") would NOT
 * have caught it: there was nothing to deny. Only an ALLOWLIST of the COMPLETE
 * effective roster turns "a 41st instrumentation just appeared" into a failure BEFORE
 * the merge.
 *
 * WHY IT READS `node_modules` AND NOT OUR SOURCE
 * ----------------------------------------------
 * The instrumentation map lives in the INSTALLED package. A sentinel that regexed our
 * own bootstrap source would be blind to the only event that matters — a transitive
 * bump. And a doc can lie where the installed package cannot: our own
 * `lib-docs/opentelemetry/LESSONS.md` D5 claims the `router` key is absent from the
 * bundle and that our disable is a "defensive no-op"; the installed 0.75.0 contains
 * the key, so that disable is load-bearing. That is the shortest argument for this gate.
 *
 * THE CONSTRUCTOR TRAP — READ BEFORE "OPTIMISING" THIS FILE
 * --------------------------------------------------------
 * `InstrumentationBase` patches the Node module loader FROM ITS CONSTRUCTOR. Computing
 * the roster therefore PATCHES THE PROCESS THAT COMPUTES IT. This script must stay a
 * DISPOSABLE PROCESS that does nothing else and exits immediately. Never import it from
 * the application, never call it from a shared Jest worker: a worker that has once built
 * the bundle is contaminated for every test it runs afterwards (that exact mistake — "just
 * to list the names" — silently enabled every instrumentation and invalidated three
 * verdicts during the investigation).
 *
 * THREE INVARIANTS
 *   (i)   effective roster == recorded allowlist  (addition / removal / RENAME → exit 1,
 *         message names the delta: `+ …` extra, `- …` missing).
 *   (ii)  no key the policy disables reappears in the effective roster.
 *   (iii) every policy key EXISTS in the installed bundle — otherwise the disable is a
 *         SILENT NO-OP (a short name, a typo, an upstream rename): the bundle only emits
 *         a `diag.error` nobody listens to, and the instrumentation stays armed with a
 *         config that reads as if it were fixed.
 *
 * Usage:  pnpm sentinel:otel-roster
 *         [--expected=<path>]  point the gate at another allowlist (bite tests)
 *         [--policy=<json>]    present the gate with a doctored policy (bite tests)
 *
 * Both seams are CLI arguments OF A GATE SCRIPT — deliberately not environment variables
 * read by `src/` (R11/AC-11): they cannot re-enable an instrumentation in the running
 * application.
 *
 * Exit 0 = pass, 1 = regression.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { OTEL_AUTO_INSTRUMENTATION_POLICY } from '@shared/observability/otel-instrumentation-policy';

// DETERMINISM, FIRST THING. `getNodeAutoInstrumentations` reads these at call time:
// left in place, an allowlist var collapses the roster to a single entry (phantom
// removals) and a denylist var drops entries (phantom additions). A gate whose verdict
// depends on the shell that ran it lies — once in each direction.
delete process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS;
delete process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS;

interface Toggle {
  enabled: boolean;
}
type Policy = Record<string, Toggle>;

interface Armed {
  instrumentationName: string;
}

/* eslint-disable @typescript-eslint/no-require-imports -- Justification: LOAD ORDER. The bundle must NOT be hoisted above the `OTEL_NODE_*_INSTRUMENTATIONS` cleanup performed above: an ESM import is hoisted to the top of the module, so the bundle would resolve its env-driven enable/disable lists BEFORE this gate has neutralised them, and a polluted shell env could then turn the gate green or red on its own. A lazy `require()` is the only way to guarantee the bundle observes the cleaned environment. Approved-by: design.md §D3 ("Déterminisme") */
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as {
  getNodeAutoInstrumentations: (config?: unknown) => Armed[];
};
/* eslint-enable @typescript-eslint/no-require-imports */

const DEFAULT_EXPECTED = resolve(__dirname, 'otel-instrumentation-roster.expected.json');

const argValue = (flag: string): string | undefined =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`${flag}=`))
    ?.slice(flag.length + 1);

const readAllowlist = (path: string): string[] => {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { instrumentations?: unknown };
  if (!Array.isArray(parsed.instrumentations)) {
    throw new Error(`${path} must expose { "instrumentations": string[] }`);
  }
  return parsed.instrumentations as string[];
};

const readPolicy = (): Policy => {
  const raw = argValue('--policy');
  if (raw === undefined) {
    return { ...OTEL_AUTO_INSTRUMENTATION_POLICY };
  }
  return JSON.parse(raw) as Policy;
};

/** Names armed by the given configuration map, computed from the INSTALLED bundle. */
const armedNames = (config: Policy): string[] =>
  getNodeAutoInstrumentations(config).map((i) => i.instrumentationName);

/**
 * The set of instrumentation names the INSTALLED bundle actually knows about, computed by
 * re-arming every policy key with `enabled: true`. Forcing `enabled: true` is priority 1 in
 * the bundle's own resolution order (it even beats the default exclusion of `fs`), so a real
 * policy key comes back armed and a key the bundle has never heard of simply does not — which
 * is exactly the silent-no-op we are hunting (a short name like `openai`, or a package the
 * upstream renamed). No name is hardcoded here: the whole point is that this gate reads the
 * bundle, not a list somebody typed.
 *
 * NOTE the return set is the FULL roster of the re-armed configuration, not a subset filtered
 * down to the policy keys — unlisted instrumentations default to enabled and therefore appear
 * too. That is harmless for invariant (iii), whose only question is membership: a policy key
 * absent from this set is a key the bundle does not recognise.
 * @param policy - the configuration map under audit
 * @returns every instrumentation name the installed bundle arms once the policy keys are forced on
 */
const knownPolicyKeys = (policy: Policy): Set<string> => {
  const forceOn: Policy = {};
  for (const key of Object.keys(policy)) {
    forceOn[key] = { enabled: true };
  }
  return new Set(armedNames(forceOn));
};

function main(): void {
  const expectedPath = argValue('--expected') ?? DEFAULT_EXPECTED;
  const policy = readPolicy();

  const expected = [...readAllowlist(expectedPath)].sort();
  const effective = [...armedNames(policy)].sort();
  const known = knownPolicyKeys(policy);

  const errors: string[] = [];

  // (i) — effective roster == recorded allowlist.
  const expectedSet = new Set(expected);
  const effectiveSet = new Set(effective);
  const extra = effective.filter((n) => !expectedSet.has(n));
  const missing = expected.filter((n) => !effectiveSet.has(n));

  if (extra.length > 0 || missing.length > 0) {
    errors.push(
      `(i) effective roster (${String(effective.length)}) diverges from the recorded allowlist (${String(expected.length)}) — ${expectedPath}`,
    );
    for (const name of extra) {
      errors.push(`    + ${name}   (armed at runtime, ABSENT from the allowlist)`);
    }
    for (const name of missing) {
      errors.push(`    - ${name}   (in the allowlist, NOT armed at runtime)`);
    }
    errors.push(
      `    If the change is intended, audit it and refresh the allowlist in the SAME commit.`,
    );
  }

  // (ii) — a key the policy disables must never come back armed.
  for (const [key, toggle] of Object.entries(policy)) {
    if (!toggle.enabled && effectiveSet.has(key)) {
      errors.push(`(ii) ${key} is disabled by the policy yet ARMED at runtime.`);
    }
  }

  // (iii) — a policy key the bundle does not know is a silent no-op disable.
  for (const key of Object.keys(policy)) {
    if (!known.has(key)) {
      errors.push(
        `(iii) ${key} — the disable is a silent no-op: not found in the installed bundle. ` +
          `getNodeAutoInstrumentations() indexes by FULL package name and only logs a mute diag.error ` +
          `for an unknown key, so the instrumentation stays ARMED with a config that reads as fixed. ` +
          `Short name? typo? upstream rename?`,
      );
    }
  }

  if (errors.length > 0) {
    console.error(`[sentinel:otel-roster] FAIL — ${String(errors.length)} issue(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(
    `[sentinel:otel-roster] PASS — ${String(effective.length)} instrumentations armed, ` +
      `${String(Object.keys(policy).length)} policy keys all present in the installed bundle, allowlist matches.`,
  );
}

main();
