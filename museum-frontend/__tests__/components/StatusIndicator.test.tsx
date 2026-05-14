/**
 * Red tests for A5 — Status typés (5 strings contextuels).
 *
 * Asserts the FE component contract documented in
 * `docs/chat-ux-refonte/specs/A5.md` §1.2 (R10-R21) and §4 (AC11-AC13, AC15) :
 *
 *   1. `<StatusIndicator phase={null} />` renders nothing (R17).
 *   2. `<StatusIndicator phase="searching-collection" />` renders the i18n
 *      string of `chat.status.searching-collection` (R11) with
 *      `accessibilityLiveRegion="polite"`, `accessibilityRole="text"`,
 *      and `accessibilityLabel` = the same i18n string (R19, R20).
 *   3. `<StatusIndicator phase="done" />` renders nothing (R17 — silence is
 *      success).
 *   4. Each of the 4 displayable phases (`analyzing-image`,
 *      `searching-collection`, `composing`, `synthesizing-voice`) maps to a
 *      i18n key under `chat.status.*` (R11).
 *   5. Every shipped locale (ar, de, en, es, fr, it, ja, zh) contains the 4
 *      keys with values ≤ 35 characters and no Unicode emoji (R12, R21,
 *      AC13, AC15).
 *
 * At baseline (A5 not yet implemented) :
 *   - `@/features/chat/ui/StatusIndicator` does not exist
 *     (verified : `ls museum-frontend/features/chat/ui/StatusIndicator*` → 0).
 *   - `@/features/chat/application/phases` does not exist either.
 *     → Jest fails with "Cannot find module" / TS resolves to never.
 *   - The 8 locale files have NO `chat.status.*` keys
 *     (verified : `grep '"status"' shared/locales/en/translation.json` → no
 *     match under `chat.*`).
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';

// RED ASSERTION 1 : module does not exist yet. Jest will fail to resolve
// `@/features/chat/ui/StatusIndicator` at module-graph build time.
import { StatusIndicator } from '@/features/chat/ui/StatusIndicator';

// RED ASSERTION 2 : phases.ts barrel does not exist either. Same failure
// mode (module not found).
import { PHASE_I18N_KEY, type ChatPipelinePhase } from '@/features/chat/application/phases';

const EXPECTED_PHASES: readonly ChatPipelinePhase[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
  'synthesizing-voice',
  'done',
];

/** Phases that are user-visible (i.e. NOT `done`). */
const DISPLAYABLE_PHASES: readonly Exclude<ChatPipelinePhase, 'done'>[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
  'synthesizing-voice',
];

const SHIPPED_LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh'] as const;

const STATUS_KEYS = [
  'chat.status.analyzing-image',
  'chat.status.searching-collection',
  'chat.status.composing',
  'chat.status.synthesizing-voice',
] as const;

const MAX_STATUS_LEN = 35;

// Unicode ranges for emoji / symbol pictograms. The terminal ellipsis `…`
// (U+2026) is in General Punctuation and is EXPLICITLY excluded.
const EMOJI_REGEX =
  /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u;

describe('StatusIndicator (A5)', () => {
  describe('rendering', () => {
    it('renders null when phase is null (R17)', () => {
      const tree = render(<StatusIndicator phase={null} />).toJSON();
      expect(tree).toBeNull();
    });

    it('renders null when phase is "done" (silence-is-success, R17)', () => {
      const tree = render(<StatusIndicator phase="done" />).toJSON();
      expect(tree).toBeNull();
    });

    it.each(DISPLAYABLE_PHASES)('renders the i18n key for phase %s (R11)', (phase) => {
      const { getByText } = render(<StatusIndicator phase={phase} />);
      // In tests, `t(key)` returns the key (see test-utils.tsx) so we assert
      // that the rendered text == the i18n key from PHASE_I18N_KEY.
      expect(getByText(PHASE_I18N_KEY[phase])).toBeTruthy();
    });
  });

  describe('accessibility (R19, R20)', () => {
    it('sets accessibilityLiveRegion="polite" on the container', () => {
      const { getByLabelText } = render(<StatusIndicator phase="searching-collection" />);
      // Use the label-based query, which matches accessibilityLabel set by
      // the component (R20). `@testing-library/react-native@13` removed
      // `getByA11yState` ; the actual assertion below is the one that
      // verifies R19 — the destructure line was filler intended only to
      // suppress lint while the component did not exist (red baseline).
      const node = getByLabelText(PHASE_I18N_KEY['searching-collection']);
      expect(node.props.accessibilityLiveRegion).toBe('polite');
    });

    it('sets accessibilityRole="text" so the label is read once', () => {
      const { getByLabelText } = render(<StatusIndicator phase="composing" />);
      const node = getByLabelText(PHASE_I18N_KEY.composing);
      expect(node.props.accessibilityRole).toBe('text');
    });
  });

  describe('phase taxonomy parity with backend (AC5)', () => {
    it('PHASE_I18N_KEY covers every ChatPipelinePhase value', () => {
      const keys = Object.keys(PHASE_I18N_KEY).sort();
      expect(keys).toEqual([...EXPECTED_PHASES].sort());
    });

    it('done maps to an empty string (never rendered, R17 invariant)', () => {
      expect(PHASE_I18N_KEY.done).toBe('');
    });

    it.each(DISPLAYABLE_PHASES)('%s maps to a `chat.status.<phase>` namespaced key', (phase) => {
      expect(PHASE_I18N_KEY[phase]).toBe(`chat.status.${phase}`);
    });
  });

  describe('i18n locales (AC13, AC15)', () => {
    it.each(SHIPPED_LOCALES)('locale %s defines every chat.status.* key', (locale) => {
      const translations = require(`@/shared/locales/${locale}/translation.json`) as {
        chat?: { status?: Record<string, string> };
      };
      const status = translations.chat?.status;
      expect(status).toBeDefined();
      for (const key of STATUS_KEYS) {
        const leaf = key.replace('chat.status.', '');
        expect(status?.[leaf]).toBeDefined();
        expect(typeof status?.[leaf]).toBe('string');
      }
    });

    it.each(SHIPPED_LOCALES)('locale %s status strings are ≤ %i characters (R12)', (locale) => {
      const translations = require(`@/shared/locales/${locale}/translation.json`) as {
        chat?: { status?: Record<string, string> };
      };
      const status = translations.chat?.status ?? {};
      for (const key of STATUS_KEYS) {
        const leaf = key.replace('chat.status.', '');
        const value = status[leaf] ?? '';
        expect(value.length).toBeLessThanOrEqual(MAX_STATUS_LEN);
      }
    });

    it.each(SHIPPED_LOCALES)(
      'locale %s status strings contain no Unicode emoji (R21)',
      (locale) => {
        const translations = require(`@/shared/locales/${locale}/translation.json`) as {
          chat?: { status?: Record<string, string> };
        };
        const status = translations.chat?.status ?? {};
        for (const key of STATUS_KEYS) {
          const leaf = key.replace('chat.status.', '');
          const value = status[leaf] ?? '';
          expect(EMOJI_REGEX.test(value)).toBe(false);
        }
      },
    );
  });
});
