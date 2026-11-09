import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FE_ROOT = join(__dirname, '..', '..');
const MAESTRO = join(FE_ROOT, '.maestro');
const DATA_SAVING_HELPER = 'helpers/data-saving-mode.yaml';

const executable = (relativePath: string): string =>
  readFileSync(join(MAESTRO, relativePath), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const flowFiles = (directory: string): string[] =>
  readdirSync(join(MAESTRO, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return flowFiles(relativePath);
    return entry.name.endsWith('.yaml') ? [relativePath] : [];
  });

const switchesDataSaving = (flow: string, mode: string): boolean =>
  new RegExp(`file: ${DATA_SAVING_HELPER}\\n\\s+env:\\n\\s+MODE: (["'])${mode}\\1`).test(flow);

const BADGE_REQUIRED =
  /- extendedWaitUntil:\n\s+visible:\n\s+id: (["'])low-data-badge\1\n\s+timeout: \d+\n(?!\s+optional)/;

describe('weak-net flows drive the data saving mode the release APK can reach', () => {
  it('no Maestro flow opens a dev-only deeplink', () => {
    const devLinks = flowFiles('').filter((file) => executable(file).includes('musaium:///(dev)/'));
    expect(devLinks).toEqual([]);
  });

  it('the dev-only route group is gone', () => {
    expect(existsSync(join(FE_ROOT, 'app/(dev)'))).toBe(false);
  });

  it('the data saving helper switches the mode from the Settings screen', () => {
    const helper = executable(DATA_SAVING_HELPER);
    expect(helper).toMatch(/openLink: (["'])musaium:\/\/\/\(stack\)\/settings\1/);
    expect(helper).toMatch(/text: (["'])\$\{MODE\}\1/);
  });

  it.each(['net-chat-edge.yaml', 'net-image-upload-edge.yaml', 'net-offline-queue-resync.yaml'])(
    '%s turns saving on after chat entry, requires the badge, and restores Automatic',
    (file) => {
      const flow = executable(file);
      const chatEntry = flow.indexOf('file: helpers/chat-entry.yaml');
      const savingOn = flow.search(new RegExp(`MODE: (["'])Économie activée\\|Saving enabled\\1`));
      expect(chatEntry).toBeGreaterThanOrEqual(0);
      expect(switchesDataSaving(flow, 'Économie activée\\|Saving enabled')).toBe(true);
      expect(savingOn).toBeGreaterThan(chatEntry);
      expect(flow.slice(savingOn)).toMatch(BADGE_REQUIRED);
      expect(flow.trimEnd()).toMatch(/(Automatique\|Automatic["']\s*)$/);
    },
  );
});
