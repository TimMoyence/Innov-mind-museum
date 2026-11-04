import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const workflow = readFileSync(resolve(process.cwd(), '..', '.github/workflows/ci-cd-backend.yml'), 'utf8');

const validationStep = workflow.slice(
  workflow.indexOf('# 1. Validate the new compose BEFORE touching the live one'),
  workflow.indexOf('# 2. Backup current compose'),
);

describe('prod deploy validates the compose interpolation before touching the live stack', () => {
  it('locates the validation step', () => {
    expect(validationStep).toContain('docker compose');
    expect(validationStep).toContain(' config');
  });

  it('keeps compose warnings instead of discarding them', () => {
    expect(validationStep).not.toMatch(/config\s*>\s*\/dev\/null\)/);
    expect(validationStep).toMatch(/config 2>&1 >\/dev\/null/);
  });

  it('fails the deploy when a secret was interpolated to an empty string', () => {
    expect(validationStep).toContain('variable is not set');
    expect(validationStep).toMatch(/exit 1/);
  });

  it('never prints the unresolved fragment, only a count', () => {
    expect(validationStep).not.toMatch(/echo[^\n]*\$COMPOSE_STDERR/);
  });
});
