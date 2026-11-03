import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../../../museum-frontend/ios/ci_scripts/require-xcode.sh');

function runWithXcode(version: string): { status: number | null; output: string } {
  const bin = mkdtempSync(join(tmpdir(), 'fake-xcodebuild-'));
  try {
    const fake = join(bin, 'xcodebuild');
    writeFileSync(fake, `#!/bin/sh\necho "Xcode ${version}"\necho "Build version 00A000"\n`);
    chmodSync(fake, 0o755);
    const result = spawnSync('sh', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

describe('RAZ-M13-XCODE-26', () => {
  it('RAZ-M13-XCODE-26 · Xcode Cloud compile Expo SDK 55 avec Xcode 26', () => {
    expect(runWithXcode('26.2').status).toBe(0);
  });

  it('RAZ-M13-XCODE-26 · Xcode 27 est refusé avant tout build, sa SDK tuant l’app au lancement', () => {
    const { status, output } = runWithXcode('27.1');
    expect(status).not.toBe(0);
    expect(output).toContain('Xcode 26');
    expect(output).toContain('Xcode 27.1');
  });
});
