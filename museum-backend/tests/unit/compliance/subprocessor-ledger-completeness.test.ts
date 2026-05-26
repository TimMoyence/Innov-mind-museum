/**
 * COMP-03/08 — subprocessor-ledger-completeness sentinel test.
 *
 * Drives the root sentinel against synthesized fake repos: a vendor host-marker
 * present in source but absent from the Art 28 ledger must FAIL; once the ledger
 * names the vendor it must PASS.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SENTINEL = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'sentinels',
  'subprocessor-ledger-completeness.mjs',
);

function run(root: string): number {
  try {
    execFileSync('node', [SENTINEL, '--root', root], { encoding: 'utf-8' });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? 1;
  }
}

function fakeRepo(opts: { langfuseInCode: boolean; ledgerMentionsLangfuse: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'ledger-sentinel-'));
  const src = join(root, 'museum-backend', 'src', 'shared', 'observability');
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, 'langfuse.client.ts'),
    opts.langfuseInCode
      ? "export const host = 'https://cloud.langfuse.com';\n"
      : 'export const host = undefined;\n',
  );
  const ledgerDir = join(root, 'docs', 'compliance');
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(
    join(ledgerDir, 'SUBPROCESSORS.md'),
    opts.ledgerMentionsLangfuse
      ? '# Sub-Processors\n\n| 1 | **Langfuse GmbH** | observability | ... |\n'
      : '# Sub-Processors\n\n| 1 | **OpenAI** | LLM | ... |\n',
  );
  return root;
}

describe('subprocessor-ledger-completeness sentinel', () => {
  it('fails (exit 1) when a vendor reachable in code is absent from the ledger', () => {
    const root = fakeRepo({ langfuseInCode: true, ledgerMentionsLangfuse: false });
    try {
      expect(run(root)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes (exit 0) when the ledger documents the detected vendor', () => {
    const root = fakeRepo({ langfuseInCode: true, ledgerMentionsLangfuse: true });
    try {
      expect(run(root)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes (exit 0) when the vendor is not reachable in code', () => {
    const root = fakeRepo({ langfuseInCode: false, ledgerMentionsLangfuse: false });
    try {
      expect(run(root)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when the ledger file is missing entirely', () => {
    const root = mkdtempSync(join(tmpdir(), 'ledger-sentinel-noledger-'));
    const src = join(root, 'museum-backend', 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'x.ts'), "const h='cloud.langfuse.com';\n");
    try {
      expect(run(root)).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
