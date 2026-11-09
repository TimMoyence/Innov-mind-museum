#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function reportWorkflow({ label, workflow, isFull }) {
  let raw;
  try {
    raw = execFileSync(
      'gh',
      [
        'run',
        'list',
        '--workflow',
        workflow,
        '-L',
        '20',
        '--json',
        'event,headBranch,conclusion,status,createdAt,url',
      ],
      { encoding: 'utf8' },
    );
  } catch (e) {
    console.log(`nightly-status [${label}]: could not query gh (${String(e.message).split('\n')[0]}).`);
    return { red: false };
  }

  let runs;
  try {
    runs = JSON.parse(raw);
  } catch (e) {
    console.log(`nightly-status [${label}]: could not parse gh output (${String(e.message).split('\n')[0]}).`);
    return { red: false };
  }

  const full = runs.find(isFull);
  if (!full) {
    console.log(`nightly-status [${label}]: no full run in the last 20 runs yet.`);
    return { red: false };
  }

  const done = full.status === 'completed';
  const concl = full.conclusion || full.status;
  const icon = concl === 'success' ? '✅' : done ? '❌' : '⏳';
  console.log(`${icon} Last full ${label} (${full.event}, ${full.createdAt.slice(0, 10)}): ${concl}`);
  console.log(`   ${full.url}`);

  if (done && concl !== 'success') {
    console.log(`   ⚠️  Full ${label} is RED — config/flows may be broken. Investigate before shipping frontend.`);
    return { red: true };
  }
  return { red: false };
}

const args = process.argv.slice(2);
const wantMobile = args.length === 0 || args.includes('--mobile') || args.includes('--all');
const wantWeb = args.length === 0 || args.includes('--web') || args.includes('--all');

let anyRed = false;

if (wantMobile) {
  const { red } = reportWorkflow({
    label: 'Maestro',
    workflow: 'mobile',
    isFull: (r) => r.event === 'schedule' || (r.event === 'push' && r.headBranch === 'main'),
  });
  anyRed = anyRed || red;
}

if (wantWeb) {
  const { red } = reportWorkflow({
    label: 'Web Playwright',
    workflow: 'web',
    isFull: (r) => r.event === 'schedule',
  });
  anyRed = anyRed || red;
}

process.exit(anyRed ? 1 : 0);
