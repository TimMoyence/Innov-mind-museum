import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FE_ROOT = join(__dirname, '..', '..');
const MAESTRO = join(FE_ROOT, '.maestro');

interface ModalSpec {
  name: string;
  source: string;
  flow: string;
  hasFlow?: boolean;
  newTestIds: string[];
  derivedTestIds?: string[];
  derivedFrom?: { parentSource: string; parentLiteral: string; templates: string[] };
}

const MODALS: ModalSpec[] = [
  {
    name: 'ArtworkHeroModal',
    source: 'features/chat/ui/ArtworkHeroModal.tsx',
    flow: 'modal-chat-artwork-hero.yaml',
    newTestIds: ['artwork-hero-modal-close'],
  },
  {
    name: 'ImageFullscreenModal',
    source: 'features/chat/ui/ImageFullscreenModal.tsx',
    flow: 'modal-chat-image-fullscreen.yaml',
    newTestIds: [
      'image-fullscreen-modal-close',
      'image-fullscreen-modal-prev',
      'image-fullscreen-modal-next',
    ],
  },
  {
    name: 'SourceCitation',
    source: 'features/chat/ui/SourceCitation.tsx',
    flow: 'modal-chat-source-citation.yaml',
    newTestIds: ['source-citation-marker', 'source-citation-close', 'source-citation-open-url'],
  },
  {
    name: 'BiometricSetupSheet',
    source: 'features/auth/ui/BiometricSetupSheet.tsx',
    flow: 'modal-auth-biometric-setup.yaml',
    newTestIds: ['biometric-setup-activate', 'biometric-setup-skip'],
  },
  {
    name: 'MuseumSheet',
    source: 'features/museum/ui/MuseumSheet.tsx',
    flow: 'modal-museum-sheet.yaml',
    newTestIds: ['museum-sheet-backdrop'],
  },
  {
    name: 'QuotaUpsellModal',
    source: 'features/paywall/ui/QuotaUpsellModal.tsx',
    flow: 'modal-paywall-quota-upsell.yaml',
    newTestIds: [
      'quota-upsell-modal',
      'quota-upsell-dismiss',
      'quota-upsell-email',
      'quota-upsell-consent',
      'quota-upsell-submit',
    ],
  },
  {
    name: 'OfflinePackPrompt',
    source: 'features/museum/ui/OfflinePackPrompt.tsx',
    flow: 'modal-museum-offline-pack.yaml',
    hasFlow: false,
    newTestIds: [],
    derivedTestIds: [
      'museum-map-offline-prompt-accept',
      'museum-map-offline-prompt-decline',
      'museum-map-offline-prompt-retry',
    ],
    derivedFrom: {
      parentSource: 'features/museum/ui/MuseumMapView.tsx',
      parentLiteral: 'museum-map-offline-prompt',
      templates: ['`${testID}-accept`', '`${testID}-decline`'],
    },
  },
];

const SIBLING_TEST_IDS: { source: string; testIds: string[] }[] = [
  {
    source: 'features/museum/ui/MuseumCard.tsx',
    testIds: ['museum-card'],
  },
  {
    source: 'features/museum/ui/MuseumSheetActions.tsx',
    testIds: ['museum-sheet-start-chat', 'museum-sheet-open-maps', 'museum-sheet-view-details'],
  },
];

const readSource = (rel: string): string => readFileSync(join(FE_ROOT, rel), 'utf8');

const FLOW_MODALS = MODALS.filter((m) => m.hasFlow !== false);

describe('C2 — Maestro modal coverage', () => {
  describe('(a) flow files exist', () => {
    for (const m of FLOW_MODALS) {
      it(`${m.name} has a Maestro flow .maestro/${m.flow}`, () => {
        expect(existsSync(join(MAESTRO, m.flow))).toBe(true);
      });
    }
  });

  it('OfflinePackPrompt has NO Maestro flow file (H7 — vacuous flow removed)', () => {
    expect(existsSync(join(MAESTRO, 'modal-museum-offline-pack.yaml'))).toBe(false);
  });

  describe('(b) flows reference the right modal', () => {
    for (const m of FLOW_MODALS) {
      it(`${m.flow} references screen ${m.name} (testID anchor)`, () => {
        const content = readFileSync(join(MAESTRO, m.flow), 'utf8');
        const anchors = [...m.newTestIds, ...(m.derivedTestIds ?? [])];
        const referenced = anchors.some((id) => content.includes(id));
        expect(referenced).toBe(true);
      });
    }
  });

  describe('(c) testID literals exist in source', () => {
    for (const m of MODALS) {
      for (const id of m.newTestIds) {
        it(`${m.source} contains testID="${id}"`, () => {
          expect(readSource(m.source)).toContain(`"${id}"`);
        });
      }
    }

    for (const sib of SIBLING_TEST_IDS) {
      for (const id of sib.testIds) {
        it(`${sib.source} contains testID="${id}"`, () => {
          expect(readSource(sib.source)).toContain(`"${id}"`);
        });
      }
    }
  });

  describe('(c-derived) OfflinePackPrompt runtime-derived anchors', () => {
    const off = MODALS.find((m) => m.name === 'OfflinePackPrompt');
    const derivedFrom = off?.derivedFrom;

    it('OfflinePackPrompt has a derivedFrom contract in the spec', () => {
      expect(derivedFrom).toBeDefined();
    });

    it('MuseumMapView.tsx mounts the parent testID literal museum-map-offline-prompt', () => {
      if (!derivedFrom) throw new Error('derivedFrom missing');
      expect(readSource(derivedFrom.parentSource)).toContain(`"${derivedFrom.parentLiteral}"`);
    });

    it('OfflinePackPrompt.tsx exposes the runtime-derived ${testID}-* anchors', () => {
      if (!derivedFrom) throw new Error('derivedFrom missing');
      const src = readSource(off.source);
      for (const tpl of derivedFrom.templates) {
        expect(src).toContain(tpl);
      }
    });
  });

  describe('(d) H7 — vacuous dev-route triggers are gone', () => {
    for (const route of ['app/(dev)/paywall-preview.tsx', 'app/(dev)/offline-prompt-preview.tsx']) {
      it(`${route} does NOT exist (removed — vacuous Release trigger)`, () => {
        expect(existsSync(join(FE_ROOT, route))).toBe(false);
      });
    }

    it('the paywall flow drives the REAL 402 trigger, not a (dev) deeplink', () => {
      const raw = readFileSync(join(MAESTRO, 'modal-paywall-quota-upsell.yaml'), 'utf8');
      const exec = raw
        .split('\n')
        .map((line) => {
          const hash = line.indexOf('#');
          return hash === -1 ? line : line.slice(0, hash);
        })
        .join('\n');
      expect(exec).not.toContain('(dev)/paywall-preview');
      expect(exec).not.toContain('openLink');
      expect(exec).toContain('Start a new conversation');
      expect(exec).toContain('assertVisible');
      expect(exec).toContain('quota-upsell-modal');
    });
  });
});
