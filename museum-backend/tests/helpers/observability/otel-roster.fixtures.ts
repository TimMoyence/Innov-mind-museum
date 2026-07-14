/**
 * RED phase — allowlist fixtures for the OTel roster sentinel (UFR-002).
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * (test-contract UC-14..UC-16).
 *
 * The bite-tests need to present the gate with a DOCTORED allowlist (one name
 * missing / one name too many / one name renamed). Each fixture writes a temp
 * file and hands back its path; `cleanupExpectedRosterFiles()` removes them.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirs: string[] = [];

/**
 * Writes an allowlist JSON in the shape the sentinel reads.
 * @param names - the instrumentation names the gate should expect
 * @returns absolute path of the temp allowlist
 */
export function makeExpectedRosterFile(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'otel-roster-'));
  tempDirs.push(dir);
  const file = join(dir, 'otel-instrumentation-roster.expected.json');
  writeFileSync(
    file,
    `${JSON.stringify({ instrumentations: [...names].sort() }, null, 2)}\n`,
    'utf8',
  );
  return file;
}

/** Deletes every temp allowlist created in this worker. Call from `afterAll`. */
export function cleanupExpectedRosterFiles(): void {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
