#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_DEPS = [
  '@vercel/analytics',
  '@sentry/replay',
  'posthog',
  'amplitude',
  'gtag',
  'google-analytics',
  'hotjar',
  'matomo',
  'umami',
  'fathom',
  'segment',
  'mixpanel',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
  }
  if (root === null) {
    root = resolve(__dirname, '../../..');
  }
  return { root };
}

function scanDeps(pkg) {
  const issues = [];
  const merged = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  };
  for (const depName of Object.keys(merged)) {
    const lower = depName.toLowerCase();
    for (const forbidden of FORBIDDEN_DEPS) {
      if (lower.includes(forbidden.toLowerCase())) {
        issues.push(`forbidden dep "${depName}" matches "${forbidden}" — drop from museum-web`);
        break;
      }
    }
  }
  return issues;
}

function scanSentryConfig(path, text) {
  const issues = [];
  const match = text.match(/replaysSessionSampleRate\s*:\s*([0-9.eE+-]+)/);
  if (match) {
    const value = Number.parseFloat(match[1]);
    if (Number.isFinite(value) && value > 0) {
      issues.push(
        `${path}: replaysSessionSampleRate=${match[1]} (Session Replay drops 3rd-party cookies — must stay 0 or absent)`,
      );
    }
  }
  return issues;
}

function emitReport(issues) {
  const lines = ['## Sentinel report — web-cookies-audit', ''];
  if (issues.length === 0) {
    lines.push('PASS — museum-web carries no forbidden tracking SDK.');
  } else {
    lines.push(`FAIL — ${issues.length} issue(s):`);
    for (const issue of issues) lines.push(`- ${issue}`);
  }
  const text = lines.join('\n') + '\n';
  process.stderr.write(text);
}

function main() {
  const { root } = parseArgs(process.argv);
  const webRoot = join(root, 'museum-web');
  const pkgPath = join(webRoot, 'package.json');

  const allIssues = [];

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (err) {
    emitReport([
      `package.json: failed to load ${pkgPath} — ${err instanceof Error ? err.message : String(err)}`,
    ]);
    process.exit(1);
  }

  allIssues.push(...scanDeps(pkg));

  const scanPaths = [
    join(webRoot, 'instrumentation-client.ts'),
    join(webRoot, 'sentry.client.config.ts'),
    join(webRoot, 'sentry.server.config.ts'),
    join(webRoot, 'sentry.edge.config.ts'),
    join(webRoot, 'src/app/layout.tsx'),
  ];

  for (const cfgPath of scanPaths) {
    if (!existsSync(cfgPath)) continue;
    let cfgText;
    try {
      cfgText = readFileSync(cfgPath, 'utf8');
    } catch {
      continue;
    }
    const lowerCfg = cfgText.toLowerCase();
    for (const forbidden of FORBIDDEN_DEPS) {
      if (lowerCfg.includes(forbidden.toLowerCase())) {
        allIssues.push(`${cfgPath}: references forbidden token "${forbidden}"`);
      }
    }
    allIssues.push(...scanSentryConfig(cfgPath, cfgText));
  }

  if (allIssues.length > 0) {
    emitReport(allIssues);
    process.exit(1);
  }

  emitReport([]);
  process.exit(0);
}

main();
