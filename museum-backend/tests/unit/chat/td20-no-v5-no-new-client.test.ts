/**
 * TD-20 [T7.1] RED→GREEN — static-discipline guard (A8/R9/R10).
 *
 * Asserts the project-wide Langfuse hygiene the run must NOT regress:
 *   (1) zero `new Langfuse(` outside `langfuse.client.ts` (singleton, R9/DON'T#14).
 *   (2) zero `@langfuse/` import under `museum-backend/src/**` (v3-only, R9/DON'T#1-2).
 *   (3) each of the 3 instrumented cost adapters references its model name on
 *       the emitted generation — i.e. the source contains `model:` near the
 *       `generation(` call (R10/A8 — model field mandatory for cost catalog).
 *
 * Strategy: scan source text on disk (no SUT import). (1)+(2) pass already
 * (baseline hygiene). (3) FAILS at RED because the 3 adapters do not yet emit
 * any `generation(` — so the model-on-generation assertion has nothing to
 * match. GREEN adds the generation emissions, turning (3) green.
 *
 * No factories / no Langfuse import — pure filesystem scan.
 */
/* eslint-disable security/detect-non-literal-fs-filename --
   Justification: this is a static-discipline test that walks the repo's OWN
   `src/` tree (paths derived from `__dirname`, never from user input) to assert
   Langfuse hygiene. The non-literal fs args are repo-internal traversal paths,
   not attacker-controlled — the security rule is a false positive here.
   Approved-by: TD-20 design.md §6 (static-discipline grep test, A8/R9). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const COST_ADAPTERS = [
  'modules/chat/adapters/secondary/audio/text-to-speech.openai.ts',
  'modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts',
  'modules/chat/useCase/llm/llm-judge-guardrail.ts',
];

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('TD-20 — Langfuse static discipline (A8/R9/R10)', () => {
  const allSrc = walkTsFiles(SRC_ROOT);

  it("has no `new Langfuse(` outside langfuse.client.ts (R9/DON'T#14)", () => {
    const offenders = allSrc.filter((path) => {
      if (path.endsWith(join('shared', 'observability', 'langfuse.client.ts'))) return false;
      return /new\s+Langfuse\s*\(/.test(readFileSync(path, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it("has no `@langfuse/` (v5) import under src/** (R9/DON'T#1-2)", () => {
    const offenders = allSrc.filter((path) =>
      /from\s+['"]@langfuse\//.test(readFileSync(path, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('emits a generation carrying a `model:` field in each of the 3 cost adapters (R10/A8)', () => {
    for (const rel of COST_ADAPTERS) {
      const src = readFileSync(join(SRC_ROOT, rel), 'utf8');
      expect(src).toContain('generation(');
      expect(src).toMatch(/model\s*:/);
    }
  });
});
