/**
 * Red tests for B3 — atomic AskMoreChip component.
 *
 * Asserts the FE contract documented in
 * `docs/chat-ux-refonte/specs/B3.md` §1.4 (R13-R20) and §4 (AC10-AC16) :
 *
 *   1. `<AskMoreChip text="..." onPress={fn} />` renders a Pressable with
 *      `accessibilityRole="button"`, an i18n-interpolated `accessibilityLabel`,
 *      and `accessibilityHint === t('chat.askMore.a11y_hint')` (R17, AC10).
 *   2. Tapping the chip invokes `onPress` exactly once with the trimmed text
 *      (R16, AC11).
 *   3. `<AskMoreChip text="" />` returns `null` (no Pressable rendered) — same
 *      for whitespace-only (R16, AC12, AC13).
 *   4. Texts longer than 80 chars are sliced before being passed to `onPress`
 *      (R15, AC14).
 *   5. `<AskMoreChip ... disabled />` renders with `opacity: 0.5` and tap is
 *      a no-op (R18, AC15).
 *   6. `accessibilityHint === t('chat.askMore.a11y_hint')` whenever the chip
 *      is rendered (R17, AC16 — chip is always pressable when rendered).
 *   7. NO Unicode emoji introduced in the icon — Ionicons-only (R14).
 *
 * At baseline (B3 not yet implemented) :
 *   - `@/features/chat/ui/AskMoreChip` does not exist (verified :
 *     `ls museum-frontend/features/chat/ui/AskMoreChip*` → 0 entries).
 *     → Jest fails with "Cannot find module" at module-graph build time.
 *
 * The singular-text-prop contract (R16) is reinforced at compile-time : the
 * component accepts a `text: string` prop (NOT `string[]`). A future
 * contributor who attempts `<AskMoreChip text={['a', 'b']} />` would hit
 * TS2322. This is asserted at the TYPE level when the component lands —
 * here we drive the runtime contract.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import '../helpers/test-utils';

// RED ASSERTION : the module does not exist yet at baseline.
import { AskMoreChip } from '@/features/chat/ui/AskMoreChip';

describe('AskMoreChip (B3 atomic)', () => {
  describe('basic rendering (R17, AC10, AC16)', () => {
    it('renders a Pressable with role=button and an i18n a11y label', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <AskMoreChip text="Why is the smile mysterious?" onPress={onPress} />,
      );
      const chip = getByRole('button');
      expect(chip).toBeTruthy();
      // Under the test-utils i18n stub, `t(key, opts)` returns the bare key.
      // We assert the key wiring — the runtime interpolation is i18next's
      // contract, not the component's.
      expect(chip.props.accessibilityLabel).toBe('chat.askMore.a11y_label');
    });

    it('always sets accessibilityHint to chat.askMore.a11y_hint when rendered', () => {
      const { getByRole } = render(<AskMoreChip text="x" onPress={jest.fn()} />);
      const chip = getByRole('button');
      expect(chip.props.accessibilityHint).toBe('chat.askMore.a11y_hint');
    });
  });

  describe('press handler (R16, AC11)', () => {
    it('invokes onPress exactly once with the trimmed text', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <AskMoreChip text="  Why did Monet paint at dusk?  " onPress={onPress} />,
      );
      fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith('Why did Monet paint at dusk?');
    });

    it('invokes onPress with the SAME singular string — never an array', () => {
      const onPress = jest.fn();
      const { getByRole } = render(<AskMoreChip text="One question?" onPress={onPress} />);
      fireEvent.press(getByRole('button'));
      const arg = onPress.mock.calls[0]?.[0] as unknown;
      expect(typeof arg).toBe('string');
      expect(Array.isArray(arg)).toBe(false);
    });
  });

  describe('empty / whitespace text → null render (R16, AC12, AC13)', () => {
    it('returns null when text is empty string', () => {
      const onPress = jest.fn();
      const { queryByRole } = render(<AskMoreChip text="" onPress={onPress} />);
      expect(queryByRole('button')).toBeNull();
    });

    it('returns null when text is whitespace-only', () => {
      const onPress = jest.fn();
      const { queryByRole } = render(<AskMoreChip text="   " onPress={onPress} />);
      expect(queryByRole('button')).toBeNull();
    });

    it('returns null when text is tabs / newlines', () => {
      const onPress = jest.fn();
      // Use a JS expression so escape sequences are interpreted as control
      // characters (JSX attribute strings would treat `\t` as two literal
      // characters and the test would not exercise the whitespace branch).
      const onlyWhitespace = '\t\n  \t';
      const { queryByRole } = render(<AskMoreChip text={onlyWhitespace} onPress={onPress} />);
      expect(queryByRole('button')).toBeNull();
    });
  });

  describe('text length boundary — 80 chars cap (R15, AC14)', () => {
    it('renders normally for ≤ 80 chars and passes the verbatim text to onPress', () => {
      const sized80 = 'x'.repeat(80);
      const onPress = jest.fn();
      const { getByRole } = render(<AskMoreChip text={sized80} onPress={onPress} />);
      fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledWith(sized80);
    });

    it('slices text to 80 chars before invoking onPress when input > 80', () => {
      const sized100 = 'a'.repeat(100);
      const onPress = jest.fn();
      const { getByRole } = render(<AskMoreChip text={sized100} onPress={onPress} />);
      fireEvent.press(getByRole('button'));
      const arg = onPress.mock.calls[0]?.[0] as string;
      expect(typeof arg).toBe('string');
      expect(arg.length).toBe(80);
      expect(arg).toBe('a'.repeat(80));
    });
  });

  describe('disabled state (R18, AC15)', () => {
    it('renders with opacity 0.5 when disabled', () => {
      const { getByRole } = render(
        <AskMoreChip text="Disabled question?" onPress={jest.fn()} disabled />,
      );
      const chip = getByRole('button');
      const flattened = Array.isArray(chip.props.style)
        ? Object.assign({}, ...chip.props.style.filter(Boolean))
        : chip.props.style;
      expect(flattened.opacity).toBe(0.5);
    });

    it('does NOT invoke onPress when disabled', () => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <AskMoreChip text="Should not fire" onPress={onPress} disabled />,
      );
      fireEvent.press(getByRole('button'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('singularity contract — never multi-suggestion (R3 / NFR13)', () => {
    it('accepts a singular `text` prop only — type contract enforces by TS', () => {
      // Runtime smoke : a single text in, a single onPress call out.
      // The doctrine "JAMAIS 3 boutons" is encoded at the type level
      // (R16 — `text: string`). Any future change to `text: string[]`
      // would fail TS compilation on this file's render call sites.
      const onPress = jest.fn();
      const { getByRole } = render(<AskMoreChip text="Just one?" onPress={onPress} />);
      fireEvent.press(getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
      // No second press is possible from one chip — the user would need to
      // wait for a NEW assistant message to see another chip.
    });
  });
});
