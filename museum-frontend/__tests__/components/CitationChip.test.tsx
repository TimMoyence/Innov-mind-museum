/**
 * Red tests for A6 — atomic CitationChip component.
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/A6.md` §1.2
 * (R8-R15) and §4 (AC8, AC9, AC10) :
 *
 *   1. `<CitationChip model={{ kind: 'confidence', level }} />` renders a
 *      Pressable with `accessibilityRole='button'` and a label drawn from
 *      `chat.citation.confidence.<level>` (R14).
 *   2. `<CitationChip model={{ kind: 'provenance', family, count }} />` renders
 *      a Pressable with label drawn from `chat.citation.family.<family>` (R14).
 *   3. When `onPress` is provided, tapping invokes `onPress(model)` with the
 *      exact same model reference (R12 / R13).
 *   4. When `onPress` is NOT provided, the component sets no
 *      `accessibilityHint` (R15) AND the chip is still focusable but no-op
 *      on tap (defensive, AC10).
 *   5. `accessibilityHint` is `chat.citation.chip.a11y_hint` when pressable
 *      (R15).
 *
 * At baseline (A6 not yet implemented) :
 *   - `@/features/chat/ui/CitationChip` does not exist.
 *   - `@/features/chat/application/citations` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';

// RED ASSERTION 1 : module does not exist yet.
import { CitationChip } from '@/features/chat/ui/CitationChip';

// RED ASSERTION 2 : helpers module does not exist yet.
import type { CitationChipModel } from '@/features/chat/application/citations';

const confidenceHigh: CitationChipModel = { kind: 'confidence', level: 'high' };
const confidenceMedium: CitationChipModel = { kind: 'confidence', level: 'medium' };
const confidenceLow: CitationChipModel = { kind: 'confidence', level: 'low' };

const provenanceMuseum: CitationChipModel = {
  kind: 'provenance',
  family: 'museum-catalog',
  count: 1,
};
const provenanceRefDb: CitationChipModel = {
  kind: 'provenance',
  family: 'reference-db',
  count: 2,
};
const provenanceWeb: CitationChipModel = { kind: 'provenance', family: 'web', count: 1 };
const provenanceAi: CitationChipModel = {
  kind: 'provenance',
  family: 'ai-knowledge',
  count: 0,
};

describe('CitationChip (A6 atomic)', () => {
  describe('confidence chip rendering (R14, AC8)', () => {
    it('renders label "chat.citation.confidence.high" with role=button', () => {
      const { getByLabelText } = render(<CitationChip model={confidenceHigh} />);
      const chip = getByLabelText('chat.citation.confidence.high');
      expect(chip.props.accessibilityRole).toBe('button');
    });

    it('renders label "chat.citation.confidence.medium"', () => {
      const { getByLabelText } = render(<CitationChip model={confidenceMedium} />);
      expect(getByLabelText('chat.citation.confidence.medium')).toBeTruthy();
    });

    it('renders label "chat.citation.confidence.low"', () => {
      const { getByLabelText } = render(<CitationChip model={confidenceLow} />);
      expect(getByLabelText('chat.citation.confidence.low')).toBeTruthy();
    });
  });

  describe('provenance chip rendering (R14)', () => {
    it.each([
      ['museum-catalog' as const, provenanceMuseum],
      ['reference-db' as const, provenanceRefDb],
      ['web' as const, provenanceWeb],
      ['ai-knowledge' as const, provenanceAi],
    ])('renders label "chat.citation.family.%s"', (family, model) => {
      const { getByLabelText } = render(<CitationChip model={model} />);
      const chip = getByLabelText(`chat.citation.family.${family}`);
      expect(chip).toBeTruthy();
      expect(chip.props.accessibilityRole).toBe('button');
    });
  });

  describe('press handler (R12, R13, AC9)', () => {
    it('invokes onPress(model) on confidence chip tap with the same model reference', () => {
      const onPress = jest.fn();
      const { getByLabelText } = render(<CitationChip model={confidenceHigh} onPress={onPress} />);
      fireEvent.press(getByLabelText('chat.citation.confidence.high'));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith(confidenceHigh);
    });

    it('invokes onPress(model) on provenance chip tap with the same model reference', () => {
      const onPress = jest.fn();
      const { getByLabelText } = render(
        <CitationChip model={provenanceMuseum} onPress={onPress} />,
      );
      fireEvent.press(getByLabelText('chat.citation.family.museum-catalog'));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith(provenanceMuseum);
    });
  });

  describe('accessibility hint gating (R15, AC10)', () => {
    it('sets accessibilityHint to chat.citation.chip.a11y_hint when onPress is provided', () => {
      const { getByLabelText } = render(
        <CitationChip model={confidenceHigh} onPress={jest.fn()} />,
      );
      const chip = getByLabelText('chat.citation.confidence.high');
      expect(chip.props.accessibilityHint).toBe('chat.citation.chip.a11y_hint');
    });

    it('omits accessibilityHint when onPress is not provided', () => {
      const { getByLabelText } = render(<CitationChip model={confidenceHigh} />);
      const chip = getByLabelText('chat.citation.confidence.high');
      expect(chip.props.accessibilityHint).toBeUndefined();
    });
  });
});
