import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import '../../../helpers/test-utils';
import { findPhysicalSideLeaks } from '../../../rtl/_rtl-style-audit';

// C2-FE / UFR-022 RED phase. Target component `features/review/ui/NpsScale.tsx`
// does NOT exist yet (verified: `ls features/review/ui/` → ReviewCard.tsx,
// StarRating.tsx only). These tests therefore FAIL at baseline with a module
// resolution error. They encode the 0-10 NPS input contract (spec R20/R21,
// design §6 `NpsScale.tsx`): 11 buttons 0..10, each `testID=nps-value-N`,
// `accessibilityRole="button"`, label from `a11y.reviews.nps_value`, selected
// state via `accessibilityState.selected`, NO fixed `accessibilityValue max:5`,
// text-only digits (no emoji, no Ionicons stars), RTL logical props only.
import { NpsScale } from '@/features/review/ui/NpsScale';

// Unicode ranges for emoji / pictograms. Mirrors StatusIndicator.test.tsx:73.
// Digits 0-9 (U+0030..U+0039) are NOT in these ranges, so plain "0".."10"
// labels pass; only a stray emoji would fail.
const EMOJI_REGEX =
  /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u;

const ALL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

describe('NpsScale (C2-FE, R20/R21)', () => {
  describe('0-10 contract (R20)', () => {
    it('renders exactly 11 selectable buttons for values 0..10', () => {
      render(<NpsScale value={null} onChange={jest.fn()} />);
      for (const v of ALL_VALUES) {
        expect(screen.getByTestId(`nps-value-${String(v)}`)).toBeTruthy();
      }
    });

    it('exposes the container under testID "nps-scale"', () => {
      render(<NpsScale value={null} onChange={jest.fn()} />);
      expect(screen.getByTestId('nps-scale')).toBeTruthy();
    });

    it('emits the tapped value via onChange (tap 9 → onChange(9))', () => {
      const onChange = jest.fn();
      render(<NpsScale value={null} onChange={onChange} />);
      fireEvent.press(screen.getByTestId('nps-value-9'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(9);
    });

    it('emits 0 (the lowest detractor) — never coerced to a 1-min floor', () => {
      const onChange = jest.fn();
      render(<NpsScale value={null} onChange={onChange} />);
      fireEvent.press(screen.getByTestId('nps-value-0'));
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('renders the digit label for each value as text (no Ionicons star icons)', () => {
      render(<NpsScale value={null} onChange={jest.fn()} />);
      for (const v of ALL_VALUES) {
        expect(screen.getByText(String(v))).toBeTruthy();
      }
    });
  });

  describe('accessibility (R21)', () => {
    it('marks every value button with accessibilityRole="button"', () => {
      render(<NpsScale value={null} onChange={jest.fn()} />);
      for (const v of ALL_VALUES) {
        const node = screen.getByTestId(`nps-value-${String(v)}`);
        expect(node.props.accessibilityRole).toBe('button');
      }
    });

    it('labels every value button from a11y.reviews.nps_value (t() returns the key in tests)', () => {
      render(<NpsScale value={null} onChange={jest.fn()} />);
      for (const v of ALL_VALUES) {
        const node = screen.getByTestId(`nps-value-${String(v)}`);
        expect(node.props.accessibilityLabel).toBe('a11y.reviews.nps_value');
      }
    });

    it('flags the selected value with accessibilityState.selected=true and others false', () => {
      render(<NpsScale value={7} onChange={jest.fn()} />);
      const selected = screen.getByTestId('nps-value-7');
      expect(selected.props.accessibilityState).toMatchObject({ selected: true });
      const other = screen.getByTestId('nps-value-3');
      expect(other.props.accessibilityState?.selected).toBeFalsy();
    });

    it('does NOT expose a fixed accessibilityValue capped at 5 anywhere in the tree', () => {
      const tree = render(<NpsScale value={9} onChange={jest.fn()} />).toJSON();
      interface Node {
        props?: { accessibilityValue?: { max?: number } };
        children?: unknown;
      }
      const walk = (node: unknown): boolean => {
        if (!node || typeof node === 'string') return false;
        if (Array.isArray(node)) return node.some((c) => walk(c));
        const n = node as Node;
        if (n.props?.accessibilityValue?.max === 5) return true;
        return walk(n.children);
      };
      expect(walk(tree)).toBe(false);
    });
  });

  describe('RTL discipline (PATTERNS.md react-native §4)', () => {
    let originalIsRTL: boolean;
    beforeAll(() => {
      originalIsRTL = (I18nManager as unknown as { isRTL: boolean }).isRTL;
      (I18nManager as unknown as { isRTL: boolean }).isRTL = true;
    });
    afterAll(() => {
      (I18nManager as unknown as { isRTL: boolean }).isRTL = originalIsRTL;
    });

    it('ships no physical-side style props (logical props only) under isRTL=true', () => {
      const { toJSON } = render(<NpsScale value={5} onChange={jest.fn()} />);
      const leaks = findPhysicalSideLeaks(toJSON());
      expect(leaks).toEqual([]);
    });
  });

  describe('no unicode emoji (CLAUDE.md, R21)', () => {
    it('renders no unicode emoji in any text node', () => {
      const { toJSON } = render(<NpsScale value={5} onChange={jest.fn()} />);
      const collectStrings = (node: unknown, acc: string[]): void => {
        if (typeof node === 'string') {
          acc.push(node);
          return;
        }
        if (Array.isArray(node)) {
          node.forEach((c) => {
            collectStrings(c, acc);
          });
          return;
        }
        if (node && typeof node === 'object') {
          collectStrings((node as { children?: unknown }).children, acc);
        }
      };
      const strings: string[] = [];
      collectStrings(toJSON(), strings);
      for (const s of strings) {
        expect(EMOJI_REGEX.test(s)).toBe(false);
      }
    });
  });
});
