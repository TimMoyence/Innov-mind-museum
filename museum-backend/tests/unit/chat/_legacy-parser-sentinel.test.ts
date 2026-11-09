import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SELF = '_legacy-parser-sentinel.test.ts';

const CHAT_SRC_DIR = resolve(__dirname, '../../../src/modules/chat');

const BACKEND_SRC_DIR = resolve(__dirname, '../../../src');

const REPO_ROOT = resolve(__dirname, '../../../..');

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walkTs(full));
      continue;
    }
    if (!name.endsWith('.ts')) continue;
    if (name === SELF) continue;
    out.push(full);
  }
  return out;
}

function findOffenders(rootDir: string, literal: string): string[] {
  return walkTs(rootDir)
    .filter((file) => readFileSync(file, 'utf8').includes(literal))
    .map((file) => relative(REPO_ROOT, file))
    .sort();
}

describe('C9.17 — legacy parser sentinel (Step B)', () => {
  it('parseAssistantResponse is NOT exported from the assistant-response module', async () => {
    const mod = (await import('@modules/chat/useCase/orchestration/assistant-response')) as Record<
      string,
      unknown
    >;

    if (mod.parseAssistantResponse !== undefined) {
      throw new Error(
        'C9.17 Step B sentinel — `parseAssistantResponse` is still exported ' +
          'from @modules/chat/useCase/orchestration/assistant-response. ' +
          'Delete the function (tasks.md T2.2.e).',
      );
    }
    expect(mod.parseAssistantResponse).toBeUndefined();
  });

  it('extractMetadata IS still exported from the assistant-response module', async () => {
    const mod = (await import('@modules/chat/useCase/orchestration/assistant-response')) as Record<
      string,
      unknown
    >;

    if (typeof mod.extractMetadata !== 'function') {
      throw new Error(
        'C9.17 Step B sentinel — `extractMetadata` is missing or no longer a ' +
          'function on the assistant-response module. Spec §4 R4 requires the ' +
          'helper to survive the parser sunset (canonical coercer used by the ' +
          'structured-output consumer).',
      );
    }
    expect(typeof mod.extractMetadata).toBe('function');
  });

  it('no file under src/modules/chat mentions parseAssistantResponse', () => {
    const offenders = findOffenders(CHAT_SRC_DIR, 'parseAssistantResponse');

    if (offenders.length > 0) {
      throw new Error(
        `C9.17 Step B sentinel — ${offenders.length} file(s) under ` +
          `src/modules/chat still reference \`parseAssistantResponse\`:\n  - ` +
          `${offenders.join('\n  - ')}\n` +
          `Delete the references (tasks.md T2.2.d/T2.2.e).`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it('no file under src/ mentions serializeStructuredOutput or META_DELIMITER', () => {
    const serializeOffenders = findOffenders(BACKEND_SRC_DIR, 'serializeStructuredOutput');
    const delimiterOffenders = findOffenders(BACKEND_SRC_DIR, 'META_DELIMITER');

    if (serializeOffenders.length > 0 || delimiterOffenders.length > 0) {
      const lines: string[] = [
        'C9.17 Step B sentinel — legacy adapter symbols still present in ' + 'museum-backend/src:',
      ];
      if (serializeOffenders.length > 0) {
        lines.push(`  serializeStructuredOutput (${serializeOffenders.length} file(s)):`);
        for (const file of serializeOffenders) lines.push(`    - ${file}`);
      }
      if (delimiterOffenders.length > 0) {
        lines.push(`  META_DELIMITER (${delimiterOffenders.length} file(s)):`);
        for (const file of delimiterOffenders) lines.push(`    - ${file}`);
      }
      lines.push('Delete both (tasks.md T2.2.b serialize adapter / T2.2.e META_DELIMITER).');
      throw new Error(lines.join('\n'));
    }
    expect(serializeOffenders).toEqual([]);
    expect(delimiterOffenders).toEqual([]);
  });
});
