import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const read = (relativePath) => readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');

const SCAN_ACTION = '.github/actions/scan-prod-image/action.yml';
const SCAN_ACTION_USE = 'uses: ./.github/actions/scan-prod-image';

const WORKFLOWS = [
  {
    workflow: '.github/workflows/ci-cd-backend.yml',
    dockerfile: './museum-backend/deploy/Dockerfile.prod',
    deployJob: 'deploy-prod',
  },
  {
    workflow: '.github/workflows/ci-cd-web.yml',
    dockerfile: './museum-web/deploy/Dockerfile.prod',
    deployJob: 'deploy',
  },
];

const jobs = (workflow) =>
  Object.fromEntries(
    workflow
      .slice(workflow.indexOf('\njobs:\n'))
      .split(/\n(?= {2}[a-z][a-z0-9-]*:\n)/)
      .slice(1)
      .map((block) => [block.match(/^ {2}([a-z][a-z0-9-]*):/)[1], block]),
  );

const jobCondition = (block) => block.match(/^ {4}if:\s*([\s\S]*?)(?=\n {4}[a-z-]+:)/m)?.[1] ?? '';

const scansImage = (block, dockerfile) => block.includes(SCAN_ACTION_USE) && block.includes(`dockerfile: ${dockerfile}`);

describe('scan-prod-image action', () => {
  const action = existsSync(resolve(REPO_ROOT, SCAN_ACTION)) ? read(SCAN_ACTION) : '';

  it('builds the image and fails on any fixed HIGH or CRITICAL vulnerability', () => {
    expect(action).toMatch(/uses: docker\/build-push-action@[0-9a-f]{40}/);
    expect(action).toMatch(/uses: aquasecurity\/trivy-action@[0-9a-f]{40}/);
    expect(action).toMatch(/severity: CRITICAL,HIGH/);
    expect(action).toMatch(/exit-code: '1'/);
    expect(action).toMatch(/ignore-unfixed: true/);
    expect(action).toMatch(/trivyignores: \.trivyignore/);
  });
});

describe.each(WORKFLOWS)('$workflow', ({ workflow, dockerfile, deployJob }) => {
  const workflowJobs = jobs(read(workflow));

  it('scans the prod image on pull requests, before anything reaches main', () => {
    const pullRequestScans = Object.values(workflowJobs).filter(
      (block) => scansImage(block, dockerfile) && jobCondition(block).includes("github.event_name == 'pull_request'"),
    );
    expect(pullRequestScans).toHaveLength(1);
  });

  it('deploys only an image scanned by the same action', () => {
    const deploy = workflowJobs[deployJob] ?? '';
    expect(scansImage(deploy, dockerfile)).toBe(true);
    expect(read(workflow)).not.toMatch(/uses: aquasecurity\/trivy-action@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+image-ref:/);
  });
});
