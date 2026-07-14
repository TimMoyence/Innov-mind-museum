/**
 * RED phase — the frozen metric inventory must GROW WITH the new counter, and it
 * must still BITE.
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * Case: test-contract UC-40 · design §D4 · spec AC-8/AC-12.
 *
 * Without this pair (counter + inventory, in the SAME commit), pre-push Gate 19
 * goes red on the next commit and someone "fixes" it by loosening the sentinel —
 * which is how a ratchet quietly becomes decoration.
 *
 * The bite is proven the only way that cannot be faked: by running the REAL
 * sentinel, with the entry removed, in a child process, and reading its exit code.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_ROOT = resolve(__dirname, '..', '..', '..');
const REPO_ROOT = resolve(BACKEND_ROOT, '..');
const SENTINEL = resolve(BACKEND_ROOT, 'scripts/sentinels/metric-naming.mjs');
const AUDIT_DOC = resolve(REPO_ROOT, 'docs/observability/METRIC_NAMING_AUDIT.md');

const METRIC = 'chat_response_degraded_total';

interface Run {
  code: number;
  output: string;
}

const runSentinel = (scriptPath: string): Run => {
  try {
    const stdout = execFileSync('node', [scriptPath], { cwd: BACKEND_ROOT, encoding: 'utf8' });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}` };
  }
};

describe('UC-40 — the frozen metric inventory (Gate 19)', () => {
  it('passes on the corrected tree', () => {
    const run = runSentinel(SENTINEL);
    if (run.code !== 0) {
      throw new Error(`sentinel:metric-naming failed (exit ${String(run.code)}):\n${run.output}`);
    }
    expect(run.code).toBe(0);
  });

  it('pins the new counter with a BARE prefix (musaium_ is frozen at 16)', () => {
    const source = readFileSync(SENTINEL, 'utf8');
    expect(source).toMatch(new RegExp(`\\['Counter',\\s*'${METRIC}'\\]`));
    expect(source).not.toContain(`musaium_${METRIC}`);
  });

  it('records it in the audit document (same commit — otherwise the doc lies)', () => {
    expect(readFileSync(AUDIT_DOC, 'utf8')).toContain(METRIC);
  });

  it('BITES: remove the entry from the inventory and the gate names the metric', () => {
    // Same code, one line deleted, run in place (the sentinel resolves
    // prometheus-metrics.ts relative to its OWN directory).
    const doctored = resolve(BACKEND_ROOT, 'scripts/sentinels/.tmp-metric-naming-bite.mjs');
    const source = readFileSync(SENTINEL, 'utf8');
    const stripped = source
      .split('\n')
      .filter((line) => !line.includes(`'${METRIC}'`))
      .join('\n');

    // Sanity: the doctored copy must actually differ, otherwise the bite proves
    // nothing (this is the assertion that is RED today — the entry does not exist).
    expect(stripped).not.toBe(source);

    try {
      writeFileSync(doctored, stripped, 'utf8');
      const run = runSentinel(doctored);
      expect(run.code).toBe(1);
      expect(run.output).toContain(METRIC);
      expect(run.output).toMatch(/not in the frozen set/i);
    } finally {
      rmSync(doctored, { force: true });
    }
  });
});
