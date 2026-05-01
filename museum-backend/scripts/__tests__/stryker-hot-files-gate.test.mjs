import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const SCRIPT = resolve(process.cwd(), 'scripts/stryker-hot-files-gate.mjs');

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'stryker-gate-'));
  mkdirSync(join(workDir, 'reports', 'mutation'), { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runScript() {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      env: { ...process.env, STRYKER_GATE_ROOT: workDir },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function writeRegistry(entries) {
  writeFileSync(
    join(workDir, '.stryker-hot-files.json'),
    JSON.stringify({ version: 1, hotFiles: entries }),
  );
}

function writeMutationJson(files) {
  writeFileSync(
    join(workDir, 'reports', 'mutation', 'mutation.json'),
    JSON.stringify({
      schemaVersion: '1.7.0',
      thresholds: { high: 85, low: 70, break: 70 },
      files,
    }),
  );
}

function makeFileMutants(killed, survived, noCoverage = 0, timeout = 0) {
  const mutants = [];
  for (let i = 0; i < killed; i += 1) mutants.push({ status: 'Killed' });
  for (let i = 0; i < survived; i += 1) mutants.push({ status: 'Survived' });
  for (let i = 0; i < noCoverage; i += 1) mutants.push({ status: 'NoCoverage' });
  for (let i = 0; i < timeout; i += 1) mutants.push({ status: 'Timeout' });
  return { mutants };
}

describe('stryker-hot-files-gate', () => {
  it('exits 0 when every hot file meets killRatioMin', () => {
    writeRegistry([
      { path: 'src/a.ts', killRatioMin: 80 },
      { path: 'src/b.ts', killRatioMin: 80 },
    ]);
    writeMutationJson({
      'src/a.ts': makeFileMutants(8, 2), // 80%
      'src/b.ts': makeFileMutants(9, 1), // 90%
    });
    const r = runScript();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/2\/2 hot files passed/);
  });

  it('exits 1 when a hot file falls below killRatioMin', () => {
    writeRegistry([{ path: 'src/a.ts', killRatioMin: 80 }]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(7, 3) }); // 70%
    const r = runScript();
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/src\/a\.ts/);
    expect(r.stderr + r.stdout).toMatch(/70(\.\d+)?%.*<.*80%/);
  });

  it('exits 2 when registry references a file absent from mutation.json', () => {
    writeRegistry([{ path: 'src/missing.ts', killRatioMin: 80 }]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 2) });
    const r = runScript();
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/missing\.ts/);
  });

  it('counts NoCoverage and Timeout as not-killed (denominator)', () => {
    writeRegistry([{ path: 'src/a.ts', killRatioMin: 80 }]);
    // 8 killed, 1 survived, 1 noCoverage = 8/10 = 80% — passes
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 1, 1, 0) });
    const r = runScript();
    expect(r.code).toBe(0);
  });

  it('exits 0 when registry is empty', () => {
    writeRegistry([]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 2) });
    const r = runScript();
    expect(r.code).toBe(0);
  });
});
