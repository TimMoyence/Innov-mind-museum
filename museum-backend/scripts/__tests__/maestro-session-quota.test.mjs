import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci-cd-mobile.yml'), 'utf8');
const shards = JSON.parse(readFileSync(resolve(REPO_ROOT, 'museum-frontend/.maestro/shards.json'), 'utf8'));

const workflowEnv = workflow.slice(workflow.indexOf('\nenv:\n'), workflow.indexOf('\njobs:\n'));
const allFlows = new Set(shards.shards.flatMap((shard) => shard.flows));

describe('Maestro runs log in with one free-tier account per run', () => {
  it('raises the free-tier monthly session cap above the number of flows a single run can play', () => {
    const limit = Number(workflowEnv.match(/FREE_TIER_MONTHLY_SESSION_LIMIT: '(\d+)'/)?.[1]);

    expect(limit).toBeGreaterThan(allFlows.size);
  });
});
