import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(__dirname, '..', '..', 'scripts', 'check-i18n-completeness.js');

const check = (locales: Record<string, unknown>): { status: number | null; output: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-'));
  try {
    for (const [lang, content] of Object.entries(locales)) {
      mkdirSync(join(dir, lang));
      writeFileSync(join(dir, lang, 'translation.json'), JSON.stringify(content));
    }
    const run = spawnSync('node', [SCRIPT, dir], { encoding: 'utf8' });
    return { status: run.status, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const EN = { a: { n_one: '1', n_other: '{{count}}' }, b: { years: '{{count}}y' } };

describe('check-i18n-completeness', () => {
  it('une langue qui garde _one sans _other pour une base plurielle échoue', () => {
    const result = check({ en: EN, de: { a: { n_one: '1' }, b: { years: 'x' } } });
    expect(result.status).toBe(1);
    expect(result.output).toContain('a.n_other');
  });

  it('une forme nue ou le seul _other couvrent une base plurielle, et un pluriel couvre une forme nue', () => {
    const result = check({
      en: EN,
      ja: { a: { n_other: '{{count}}' }, b: { years: '{{count}}年' } },
      ar: { a: { n: '{{count}}' }, b: { years: 'x' } },
      fr: {
        a: { n_one: '1', n_other: '{{count}}' },
        b: { years_one: '1 an', years_other: '{{count}} ans' },
      },
    });
    expect(result).toEqual({ status: 0, output: expect.stringContaining('PASSED') });
  });

  it('une base absente de toutes ses formes échoue', () => {
    const result = check({ en: EN, de: { b: { years: 'x' } } });
    expect(result.status).toBe(1);
    expect(result.output).toContain('a.n');
  });
});
