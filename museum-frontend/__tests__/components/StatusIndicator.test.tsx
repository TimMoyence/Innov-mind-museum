import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';

import { StatusIndicator } from '@/features/chat/ui/StatusIndicator';

import { PHASE_I18N_KEY, type ChatPipelinePhase } from '@/features/chat/application/phases';

const EXPECTED_PHASES: readonly ChatPipelinePhase[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
  'synthesizing-voice',
  'done',
];

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
      expect(getByText(PHASE_I18N_KEY[phase])).toBeTruthy();
    });
  });

  describe('accessibility (R19, R20)', () => {
    it('sets accessibilityLiveRegion="polite" on the container', () => {
      const { getByLabelText } = render(<StatusIndicator phase="searching-collection" />);
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
