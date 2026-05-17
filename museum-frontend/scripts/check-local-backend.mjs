#!/usr/bin/env node
// Pre-flight check for `npm run dev:local`.
// Verifies the Docker dev-backend is reachable on localhost:3000 BEFORE Metro
// starts, so the developer sees a clear "Docker stack not up" error instead
// of mysterious 60s socket timeouts inside the simulator.
//
// Generated 2026-05-17 by /team local-mobile-env-viable run.

import http from 'node:http';

const HEALTH_URL = 'http://localhost:3000/api/health';
const TIMEOUT_MS = 3000;

const ping = () =>
  new Promise((resolve, reject) => {
    const req = http.get(HEALTH_URL, { timeout: TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ status: 'ok-unparsed' });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout after ${TIMEOUT_MS}ms`));
    });
  });

try {
  const result = await ping();
  const dbStatus = result.checks?.database ?? 'unknown';
  console.log(`✓ Backend Docker UP — ${HEALTH_URL} → db=${dbStatus}`);
  process.exit(0);
} catch (err) {
  console.error('');
  console.error('✗ Backend Docker UNREACHABLE on http://localhost:3000');
  console.error(`  Cause: ${err.message}`);
  console.error('');
  console.error('Fix:');
  console.error('  cd ../museum-backend && docker compose -f docker-compose.dev.yml up -d');
  console.error('');
  console.error('Then re-run: npm run dev:local');
  process.exit(1);
}
