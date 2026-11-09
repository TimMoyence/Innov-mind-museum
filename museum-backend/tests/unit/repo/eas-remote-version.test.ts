import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONTEND = resolve(__dirname, '../../../../museum-frontend');

const eas = JSON.parse(readFileSync(resolve(FRONTEND, 'eas.json'), 'utf8')) as {
  cli: { appVersionSource?: string };
};
const appConfig = readFileSync(resolve(FRONTEND, 'app.config.ts'), 'utf8');

describe('EAS-REMOTE-VERSION', () => {
  it('EAS-REMOTE-VERSION · le versionCode Android vit chez EAS seul', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(appConfig).not.toMatch(/^\s*versionCode:/m);
  });
});
