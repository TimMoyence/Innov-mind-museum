import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * C2 — Maestro modal coverage sentinel (UFR-022 frozen-test, phase RED).
 *
 * This sentinel is the FROZEN oracle for cluster C2 "Maestro flows pour 7 modaux
 * currently uncovered". It asserts three contracts derived verbatim from
 * audit-state/.../C2-maestro-modals/design.md §2/§3/§4:
 *
 *   (a) flow files exist     — one `.maestro/modal-*.yaml` per modal (design §4)
 *   (b) flows reference modal — each flow carries either the `# screen: <Name>`
 *                               magic-comment header or at least one of the modal's
 *                               testID literals (design §4 header + §3 anchors)
 *   (c) testID literals exist — each NEW testID literal listed in design §3 is present
 *                               verbatim in its target source `.tsx`. OfflinePackPrompt
 *                               adds NO new literal: its anchors are runtime-derived
 *                               (`${testID}-accept` etc.) propagated from the
 *                               `museum-map-offline-prompt` literal in MuseumMapView,
 *                               so it is asserted against those existing templates.
 *   (d) dev-only routes exist — the two deeplink-driven flows (QuotaUpsell, OfflinePack)
 *                               require dev-only Expo routes (design §5.2).
 *
 * At baseCommit ed275e278e00d22fe9c288f91afc34f245ff5b07 NONE of the 7 flows nor the
 * 19 new testID literals nor the 2 dev routes exist → this suite FAILS (RED).
 * The GREEN phase adds the flows + testID props + dev routes (NOT this test).
 * Frozen-test discipline: GREEN must not edit this file (post-edit-green-test-freeze.sh).
 */

const FE_ROOT = join(__dirname, '..', '..');
const MAESTRO = join(FE_ROOT, '.maestro');

interface ModalSpec {
  name: string;
  /** Source file relative to museum-frontend/, where the testIDs must exist. */
  source: string;
  /** Maestro flow filename under .maestro/ (design §4). */
  flow: string;
  /** `# screen: <name>` header value the flow should carry (design §4). */
  headerScreenName: string;
  /**
   * testID literals that the GREEN phase must add to `source`. The flow must
   * reference at least one of these (or the magic-comment header). Empty for
   * OfflinePackPrompt (runtime-derived anchors — see derivedTestIds).
   */
  newTestIds: string[];
  /**
   * Runtime-derived testID anchors (template-literal `${testID}-*`). These are
   * NOT literals to add — they already exist as templates in `source`. Used only
   * by the flow-reference check (b); existence is asserted via `derivedFrom`.
   */
  derivedTestIds?: string[];
  /**
   * For modals whose anchors are runtime-derived: the parent literal that seeds
   * them (asserted to exist) plus the source that holds the `${testID}-*` templates.
   */
  derivedFrom?: { parentSource: string; parentLiteral: string; templates: string[] };
}

// Values copied verbatim from design.md §2 (trigger table), §3 (testID list),
// §4 (flow files + headers). Do not paraphrase — these are contract anchors.
const MODALS: ModalSpec[] = [
  {
    name: 'ArtworkHeroModal',
    source: 'features/chat/ui/ArtworkHeroModal.tsx',
    flow: 'modal-chat-artwork-hero.yaml',
    headerScreenName: 'ArtworkHeroModal',
    // artwork-hero-modal-image already exists (L133); close literal is new (design §3).
    newTestIds: ['artwork-hero-modal-close'],
  },
  {
    name: 'ImageFullscreenModal',
    source: 'features/chat/ui/ImageFullscreenModal.tsx',
    flow: 'modal-chat-image-fullscreen.yaml',
    headerScreenName: 'ImageFullscreenModal',
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
    headerScreenName: 'SourceCitation',
    newTestIds: ['source-citation-marker', 'source-citation-close', 'source-citation-open-url'],
  },
  {
    name: 'BiometricSetupSheet',
    source: 'features/auth/ui/BiometricSetupSheet.tsx',
    flow: 'modal-auth-biometric-setup.yaml',
    headerScreenName: 'BiometricSetupSheet',
    newTestIds: ['biometric-setup-activate', 'biometric-setup-skip'],
  },
  {
    name: 'MuseumSheet',
    source: 'features/museum/ui/MuseumSheet.tsx',
    flow: 'modal-museum-sheet.yaml',
    headerScreenName: 'MuseumSheet',
    // museum-sheet-backdrop lives in MuseumSheet.tsx; the 3 action testIDs live in
    // MuseumSheetActions.tsx (asserted separately below) — and museum-card lives in
    // MuseumCard.tsx. Here we list only MuseumSheet.tsx's own literal.
    newTestIds: ['museum-sheet-backdrop'],
  },
  {
    name: 'QuotaUpsellModal',
    source: 'features/paywall/ui/QuotaUpsellModal.tsx',
    flow: 'modal-paywall-quota-upsell.yaml',
    headerScreenName: 'QuotaUpsellModal',
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
    headerScreenName: 'OfflinePackPrompt',
    // No new literal: anchors are runtime-derived from the parent literal.
    newTestIds: [],
    derivedTestIds: [
      'museum-map-offline-prompt-accept',
      'museum-map-offline-prompt-decline',
      'museum-map-offline-prompt-retry',
    ],
    derivedFrom: {
      parentSource: 'features/museum/ui/MuseumMapView.tsx',
      parentLiteral: 'museum-map-offline-prompt',
      // Template-literal anchors present in OfflinePackPrompt.tsx (design §2 note).
      templates: ['`${testID}-accept`', '`${testID}-decline`'],
    },
  },
];

// testID literals that live in sibling sources, not the modal's own file (design §3).
// Asserted separately so the source<->testID mapping stays accurate.
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

// Dev-only deeplink routes required by the QuotaUpsell + OfflinePack flows (design §5.2).
const DEV_ROUTES = ['app/(dev)/paywall-preview.tsx', 'app/(dev)/offline-prompt-preview.tsx'];

const readSource = (rel: string): string => readFileSync(join(FE_ROOT, rel), 'utf8');

describe('C2 — Maestro modal coverage', () => {
  describe('(a) flow files exist', () => {
    for (const m of MODALS) {
      it(`${m.name} has a Maestro flow .maestro/${m.flow}`, () => {
        expect(existsSync(join(MAESTRO, m.flow))).toBe(true);
      });
    }
  });

  describe('(b) flows reference the right modal', () => {
    for (const m of MODALS) {
      it(`${m.flow} references screen ${m.name} (header or testID anchor)`, () => {
        // Reading a missing flow throws ENOENT, which is itself a RED failure.
        const content = readFileSync(join(MAESTRO, m.flow), 'utf8');
        const anchors = [...m.newTestIds, ...(m.derivedTestIds ?? [])];
        const referenced =
          content.includes(`# screen: ${m.headerScreenName}`) ||
          anchors.some((id) => content.includes(id));
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

  describe('(d) dev-only deeplink routes exist', () => {
    for (const route of DEV_ROUTES) {
      it(`${route} exists (dev trigger route)`, () => {
        expect(existsSync(join(FE_ROOT, route))).toBe(true);
      });
    }
  });
});
