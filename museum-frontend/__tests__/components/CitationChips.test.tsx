/**
 * Red tests for A6 — Citation chips cluster (source/confidence badges).
 *
 * Asserts the FE component contract documented in
 * `docs/chat-ux-refonte/specs/A6.md` §1.1 (R1-R7), §1.4 (R19), §1.5 (R22-R24)
 * and §4 (AC5, AC6, AC7, AC11, AC12, AC13, AC15, AC16) :
 *
 *   1. `<CitationChips metadata={null} />` renders confidence (low) + AI-knowledge
 *      chip (R4).
 *   2. `<CitationChips metadata={{ sources: [] }} />` renders the same (empty
 *      sources = AI-only — UFR-013 doctrine).
 *   3. `<CitationChips metadata={{ sources: [museum-catalog] }} />` renders a
 *      high-confidence chip + a museum-catalog provenance chip (R3, R6).
 *   4. Provenance ordering matches `CITATION_FAMILY_ORDER`
 *      (museum-catalog → reference-db → web).
 *   5. Tap on a provenance chip invokes `onProvenancePress(family)` (R12).
 *   6. Tap on the confidence chip invokes `onConfidencePress(level)` (R13).
 *   7. 8 locales contain the 10 `chat.citation.*` keys ≤ 28 chars + no emoji
 *      (R22-R24, AC15, AC16).
 *
 * At baseline (A6 not yet implemented) :
 *   - `@/features/chat/ui/CitationChips` does not exist
 *     (verified : `ls museum-frontend/features/chat/ui/CitationChips*` → 0).
 *   - `@/features/chat/application/citations` does not exist either.
 *     → Jest fails with "Cannot find module" at module-graph build time.
 *   - The 8 locale files have NO `chat.citation.*` keys
 *     (verified : `grep '"citation"' shared/locales/en/translation.json` → 0).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { makeCitationSource } from '../helpers/factories';

// RED ASSERTION 1 : module does not exist yet. Jest will fail to resolve
// `@/features/chat/ui/CitationChips` at module-graph build time.
import { CitationChips } from '@/features/chat/ui/CitationChips';

// RED ASSERTION 2 : helpers module does not exist either. Same failure
// mode (module not found).
import {
  CITATION_FAMILY_ORDER,
  type CitationFamily,
  type ConfidenceLevel,
} from '@/features/chat/application/citations';

const SHIPPED_LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'zh'] as const;

const CITATION_FAMILY_KEYS = [
  'chat.citation.family.museum-catalog',
  'chat.citation.family.reference-db',
  'chat.citation.family.web',
  'chat.citation.family.ai-knowledge',
] as const;

const CITATION_CONFIDENCE_KEYS = [
  'chat.citation.confidence.high',
  'chat.citation.confidence.medium',
  'chat.citation.confidence.low',
] as const;

const CITATION_AUX_KEYS = [
  'chat.citation.chip.a11y_hint',
  'chat.citation.ai_only.disclosure_title',
  'chat.citation.ai_only.disclosure_body',
] as const;

const MAX_CHIP_LABEL_LEN = 28;

const EMOJI_REGEX =
  /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u;

describe('CitationChips (A6)', () => {
  describe('rendering — empty / null sources (R4, R5, AC11)', () => {
    it('renders confidence "low" + AI-knowledge provenance when metadata is null', () => {
      const { getByLabelText } = render(<CitationChips metadata={null} />);
      const aiChip = getByLabelText('chat.citation.family.ai-knowledge');
      const lowChip = getByLabelText('chat.citation.confidence.low');
      expect(aiChip).toBeTruthy();
      expect(lowChip).toBeTruthy();
    });

    it('renders confidence "low" + AI-knowledge provenance when sources is empty array', () => {
      const { getByLabelText } = render(<CitationChips metadata={{ sources: [] }} />);
      const aiChip = getByLabelText('chat.citation.family.ai-knowledge');
      const lowChip = getByLabelText('chat.citation.confidence.low');
      expect(aiChip).toBeTruthy();
      expect(lowChip).toBeTruthy();
    });
  });

  describe('rendering — populated sources (R2, R3, R6, AC6, AC7, AC12)', () => {
    it('renders high confidence + museum-catalog chip when a museum-catalog source is present', () => {
      const metadata = {
        sources: [makeCitationSource({ type: 'museum-catalog' })],
      };
      const { getByLabelText } = render(<CitationChips metadata={metadata} />);
      expect(getByLabelText('chat.citation.confidence.high')).toBeTruthy();
      expect(getByLabelText('chat.citation.family.museum-catalog')).toBeTruthy();
    });

    it('deduplicates wikidata + commons into a single reference-db chip (AC7)', () => {
      const metadata = {
        sources: [
          makeCitationSource({ type: 'wikidata' }),
          makeCitationSource({ type: 'commons' }),
          makeCitationSource({ type: 'wikidata' }),
        ],
      };
      const { queryAllByLabelText } = render(<CitationChips metadata={metadata} />);
      const refDbChips = queryAllByLabelText('chat.citation.family.reference-db');
      expect(refDbChips).toHaveLength(1);
    });

    it('orders chips: confidence first, then provenance per CITATION_FAMILY_ORDER (R6)', () => {
      // sanity-check that the order constant is what we expect downstream.
      const expected: readonly CitationFamily[] = [
        'museum-catalog',
        'reference-db',
        'web',
        'ai-knowledge',
      ];
      expect(CITATION_FAMILY_ORDER).toEqual(expected);
    });
  });

  describe('press handlers (R12, R13, AC13)', () => {
    it('invokes onProvenancePress(family) when a provenance chip is tapped', () => {
      const onProvenancePress = jest.fn();
      const metadata = {
        sources: [makeCitationSource({ type: 'museum-catalog' })],
      };
      const { getByLabelText } = render(
        <CitationChips metadata={metadata} onProvenancePress={onProvenancePress} />,
      );
      const chip = getByLabelText('chat.citation.family.museum-catalog');
      fireEvent.press(chip);
      expect(onProvenancePress).toHaveBeenCalledTimes(1);
      const arg = onProvenancePress.mock.calls[0]?.[0] as CitationFamily;
      expect(arg).toBe('museum-catalog');
    });

    it('invokes onConfidencePress(level) when the confidence chip is tapped', () => {
      const onConfidencePress = jest.fn();
      const metadata = {
        sources: [makeCitationSource({ type: 'museum-catalog' })],
      };
      const { getByLabelText } = render(
        <CitationChips metadata={metadata} onConfidencePress={onConfidencePress} />,
      );
      const chip = getByLabelText('chat.citation.confidence.high');
      fireEvent.press(chip);
      expect(onConfidencePress).toHaveBeenCalledTimes(1);
      const arg = onConfidencePress.mock.calls[0]?.[0] as ConfidenceLevel;
      expect(arg).toBe('high');
    });

    it('invokes onProvenancePress("ai-knowledge") when the AI chip is tapped (empty sources)', () => {
      const onProvenancePress = jest.fn();
      const { getByLabelText } = render(
        <CitationChips metadata={null} onProvenancePress={onProvenancePress} />,
      );
      fireEvent.press(getByLabelText('chat.citation.family.ai-knowledge'));
      expect(onProvenancePress).toHaveBeenCalledWith('ai-knowledge');
    });
  });

  describe('i18n locales (AC15, AC16)', () => {
    it.each(SHIPPED_LOCALES)('locale %s defines every chat.citation.* key (R22)', (locale) => {
      const translations = require(`@/shared/locales/${locale}/translation.json`) as {
        chat?: {
          citation?: {
            family?: Record<string, string>;
            confidence?: Record<string, string>;
            chip?: Record<string, string>;
            ai_only?: Record<string, string>;
          };
        };
      };
      const citation = translations.chat?.citation;
      expect(citation).toBeDefined();
      for (const key of CITATION_FAMILY_KEYS) {
        const leaf = key.replace('chat.citation.family.', '');
        expect(citation?.family?.[leaf]).toBeDefined();
      }
      for (const key of CITATION_CONFIDENCE_KEYS) {
        const leaf = key.replace('chat.citation.confidence.', '');
        expect(citation?.confidence?.[leaf]).toBeDefined();
      }
      // Aux keys (hint + disclosure) present in any of the sub-namespaces.
      expect(citation?.chip?.a11y_hint).toBeDefined();
      expect(citation?.ai_only?.disclosure_title).toBeDefined();
      expect(citation?.ai_only?.disclosure_body).toBeDefined();
      // Confirm the aux constant remains referenced (lint guard).
      expect(CITATION_AUX_KEYS).toHaveLength(3);
    });

    it.each(SHIPPED_LOCALES)(
      'locale %s family + confidence strings are ≤ 28 characters (R23)',
      (locale) => {
        const translations = require(`@/shared/locales/${locale}/translation.json`) as {
          chat?: {
            citation?: {
              family?: Record<string, string>;
              confidence?: Record<string, string>;
            };
          };
        };
        const family = translations.chat?.citation?.family ?? {};
        const confidence = translations.chat?.citation?.confidence ?? {};
        for (const k of Object.keys(family)) {
          expect(family[k]?.length ?? 0).toBeLessThanOrEqual(MAX_CHIP_LABEL_LEN);
        }
        for (const k of Object.keys(confidence)) {
          expect(confidence[k]?.length ?? 0).toBeLessThanOrEqual(MAX_CHIP_LABEL_LEN);
        }
      },
    );

    it.each(SHIPPED_LOCALES)(
      'locale %s chat.citation.* strings contain no Unicode emoji (R24)',
      (locale) => {
        const translations = require(`@/shared/locales/${locale}/translation.json`) as {
          chat?: { citation?: Record<string, unknown> };
        };
        const citation = translations.chat?.citation ?? {};
        const walk = (value: unknown): void => {
          if (typeof value === 'string') {
            expect(EMOJI_REGEX.test(value)).toBe(false);
            return;
          }
          if (value && typeof value === 'object') {
            for (const v of Object.values(value as Record<string, unknown>)) {
              walk(v);
            }
          }
        };
        walk(citation);
      },
    );
  });
});
