/**
 * Red tests for B6 — `<ProactiveMuseumBanner>` component.
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B6.md` :
 *
 *   §1.2 (R15-R26) — null-render gate + a11y role/label/hint + title +
 *                    subtitle + dismiss separate Pressable + onStart /
 *                    onDismiss wiring + memo.
 *   §4 (AC14-AC20) — testIDs + a11y + tap behaviour.
 *
 * Key invariants :
 *   - `<ProactiveMuseumBanner museum={null}>` renders nothing
 *     (queryByTestId returns null).
 *   - Root testID="proactive-museum-banner", role="button".
 *   - Title testID="proactive-museum-title", subtitle
 *     testID="proactive-museum-subtitle".
 *   - Dismiss is a SEPARATE Pressable with its own testID + role.
 *   - Tap card → onStart(museum) exactly once, no onDismiss call.
 *   - Tap dismiss → onDismiss() exactly once, no onStart call.
 *   - Ionicons "location" rendered as the icon ; Ionicons "close" as
 *     the dismiss icon. No Unicode emoji.
 *
 * At baseline (B6 not yet implemented) :
 *   - `@/features/chat/ui/ProactiveMuseumBanner` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 *
 * Spec : `docs/chat-ux-refonte/specs/B6.md` §1.2 R15-R26 ; §4 AC14-AC20.
 * Baseline : `325873b3` (worktree HEAD post-B2 done).
 */

import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

// RED ASSERTION 1 : module does not exist yet at baseline.
import { ProactiveMuseumBanner } from '@/features/chat/ui/ProactiveMuseumBanner';

import type { ProactiveMuseum } from '@/features/chat/application/useProactiveMuseumSuggestion';

// Identity i18n :  test-utils mocks `t = (key) => key`. We assert on the
// KEY which is sufficient to verify the branch chosen.

function makeMuseum(overrides: Partial<ProactiveMuseum> = {}): ProactiveMuseum {
  return {
    id: 7,
    name: 'Louvre',
    confidence: 0.9,
    latitude: 48.8606,
    longitude: 2.3376,
    distanceMeters: 87,
    ...overrides,
  };
}

describe('<ProactiveMuseumBanner> (B6 — proactive in-museum banner UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R15 / §4 AC14 — null gate
  // ────────────────────────────────────────────────────────────────────────
  describe('null gate (R15, AC14)', () => {
    it('renders nothing when museum is null', () => {
      const { queryByTestId } = render(
        <ProactiveMuseumBanner museum={null} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(queryByTestId('proactive-museum-banner')).toBeNull();
      expect(queryByTestId('proactive-museum-title')).toBeNull();
      expect(queryByTestId('proactive-museum-subtitle')).toBeNull();
      expect(queryByTestId('proactive-museum-dismiss')).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R16-R18 / §4 AC15 — root testID + a11y
  // ────────────────────────────────────────────────────────────────────────
  describe('root structure + a11y (R16-R18, AC15)', () => {
    it('renders a Pressable with testID="proactive-museum-banner"', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-banner')).toBeTruthy();
    });

    it('exposes accessibilityRole="button" on the root Pressable', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-banner').props.accessibilityRole).toBe('button');
    });

    it('sets accessibilityHint to "chat.proactive_museum.cta_a11y_hint"', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-banner').props.accessibilityHint).toBe(
        'chat.proactive_museum.cta_a11y_hint',
      );
    });

    it('uses chat.proactive_museum.cta_a11y_label as the root accessibilityLabel', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ name: 'Louvre' })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('proactive-museum-banner').props.accessibilityLabel).toBe(
        'chat.proactive_museum.cta_a11y_label',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R19 / §4 AC16 — title
  // ────────────────────────────────────────────────────────────────────────
  describe('title (R19, AC16)', () => {
    it('renders title using chat.proactive_museum.title', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ name: 'Louvre' })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      // Test-utils mock returns the i18n KEY as-is.
      expect(getByTestId('proactive-museum-title').props.children).toBe(
        'chat.proactive_museum.title',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R20 / §4 AC17 — subtitle
  // ────────────────────────────────────────────────────────────────────────
  describe('subtitle (R20, AC17)', () => {
    it('renders subtitle using chat.proactive_museum.subtitle', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-subtitle').props.children).toBe(
        'chat.proactive_museum.subtitle',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R21 / §4 AC18 — dismiss is a separate Pressable
  // ────────────────────────────────────────────────────────────────────────
  describe('dismiss separate Pressable (R21, AC18)', () => {
    it('renders a dismiss Pressable with testID="proactive-museum-dismiss"', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-dismiss')).toBeTruthy();
    });

    it('exposes accessibilityRole="button" on the dismiss Pressable separately from the root', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-dismiss').props.accessibilityRole).toBe('button');
    });

    it('uses accessibilityLabel === chat.proactive_museum.a11y_dismiss on the dismiss Pressable', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByTestId('proactive-museum-dismiss').props.accessibilityLabel).toBe(
        'chat.proactive_museum.a11y_dismiss',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R22-R23 / §4 AC19-AC20 — onStart / onDismiss wiring
  // ────────────────────────────────────────────────────────────────────────
  describe('tap wiring (R22-R23, AC19-AC20)', () => {
    it('invokes onStart(museum) verbatim on card press, exactly once (AC19)', () => {
      const onStart = jest.fn();
      const onDismiss = jest.fn();
      const museum = makeMuseum({ id: 99, name: 'Centre Pompidou' });
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={museum} onStart={onStart} onDismiss={onDismiss} />,
      );
      fireEvent.press(getByTestId('proactive-museum-banner'));
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(museum);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('invokes onDismiss() exactly once on dismiss press AND does NOT invoke onStart (AC20)', () => {
      const onStart = jest.fn();
      const onDismiss = jest.fn();
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={onStart} onDismiss={onDismiss} />,
      );
      fireEvent.press(getByTestId('proactive-museum-dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.2 R24-R25 — Ionicons + no emoji
  // ────────────────────────────────────────────────────────────────────────
  describe('icon (R24-R25)', () => {
    it('renders Ionicons name="location" as the main icon', () => {
      // test-utils mocks Ionicons → renders <Text>{name}</Text>.
      const { getByText } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByText('location')).toBeTruthy();
    });

    it('renders Ionicons name="close" inside the dismiss Pressable', () => {
      const { getByText } = render(
        <ProactiveMuseumBanner museum={makeMuseum()} onStart={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(getByText('close')).toBeTruthy();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // W3 — confirm bottom-sheet (confidence ∈ (0.5, 0.8])
  // ────────────────────────────────────────────────────────────────────────
  describe('confirm bottom-sheet variant (W3 R13)', () => {
    it('renders confirm sheet when confidence === 0.6 (medium band)', () => {
      const { getByTestId, queryByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.6 })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('proactive-museum-confirm-sheet')).toBeTruthy();
      expect(getByTestId('proactive-museum-confirm-yes')).toBeTruthy();
      expect(getByTestId('proactive-museum-confirm-choose-another')).toBeTruthy();
      // Legacy auto-pickup banner MUST NOT render in the medium band.
      expect(queryByTestId('proactive-museum-banner')).toBeNull();
    });

    it('renders auto-pickup banner when confidence === 0.9 (high band)', () => {
      const { getByTestId, queryByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.9 })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('proactive-museum-banner')).toBeTruthy();
      expect(queryByTestId('proactive-museum-confirm-sheet')).toBeNull();
    });

    it('renders confirm sheet at the 0.8 boundary (NOT auto-pickup — strict > 0.8)', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.8 })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('proactive-museum-confirm-sheet')).toBeTruthy();
    });

    it('invokes onStart(museum) when Yes is tapped in the confirm sheet', () => {
      const onStart = jest.fn();
      const museum = makeMuseum({ confidence: 0.6 });
      const { getByTestId } = render(
        <ProactiveMuseumBanner museum={museum} onStart={onStart} onDismiss={jest.fn()} />,
      );
      fireEvent.press(getByTestId('proactive-museum-confirm-yes'));
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(museum);
    });

    it('invokes onChooseAnother when Choose-another is tapped', () => {
      const onChooseAnother = jest.fn();
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.6 })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
          onChooseAnother={onChooseAnother}
        />,
      );
      fireEvent.press(getByTestId('proactive-museum-confirm-choose-another'));
      expect(onChooseAnother).toHaveBeenCalledTimes(1);
    });

    it('falls back to onDismiss when Choose-another is tapped and onChooseAnother is absent', () => {
      const onDismiss = jest.fn();
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.6 })}
          onStart={jest.fn()}
          onDismiss={onDismiss}
        />,
      );
      fireEvent.press(getByTestId('proactive-museum-confirm-choose-another'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders the confirm title key using i18n', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ confidence: 0.6 })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      // test-utils mocks t = (key) => key.
      expect(getByTestId('proactive-museum-confirm-title').props.children).toBe(
        'chat.proactive.confirm_sheet.title',
      );
      expect(getByTestId('proactive-museum-confirm-body').props.children).toBe(
        'chat.proactive.confirm_sheet.body',
      );
    });
  });
});
