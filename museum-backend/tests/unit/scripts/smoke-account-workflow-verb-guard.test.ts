import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../../../../.github/workflows');

const INVOCATION_RE = /(seed:smoke-account|seed-smoke-account\.(?:js|ts))\b/;
const VERB_RE = /(seed:smoke-account|seed-smoke-account\.(?:js|ts))\s+(create|cleanup)\b/;

const isCommentLine = (line: string): boolean => line.trimStart().startsWith('#');

interface BareInvocation {
  file: string;
  line: number;
  text: string;
}

const scanFile = (fileName: string): BareInvocation[] => {
  const fullPath = path.join(WORKFLOWS_DIR, fileName);
  const content = readFileSync(fullPath, 'utf8');
  const bare: BareInvocation[] = [];

  content.split('\n').forEach((rawLine, idx) => {
    if (isCommentLine(rawLine)) return;
    if (!INVOCATION_RE.test(rawLine)) return;
    if (VERB_RE.test(rawLine)) return;
    bare.push({ file: fileName, line: idx + 1, text: rawLine.trim() });
  });

  return bare;
};

describe('smoke-account workflow verb guard', () => {
  const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));

  it('finds workflow files to scan', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it('every smoke-account invocation in .github/workflows/*.yml uses a create|cleanup verb', () => {
    const offenders = workflowFiles.flatMap(scanFile);

    const offenderLines = offenders.map((o) => `${o.file}:${o.line} -> ${o.text}`);

    expect(offenderLines).toEqual([]);
  });
});
