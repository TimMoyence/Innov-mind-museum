import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ProactiveMuseumBanner } from '@/features/chat/ui/ProactiveMuseumBanner';

import type { ProactiveMuseum } from '@/features/chat/application/useProactiveMuseumSuggestion';

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

  describe('title (R19, AC16)', () => {
    it('renders title using chat.proactive_museum.title', () => {
      const { getByTestId } = render(
        <ProactiveMuseumBanner
          museum={makeMuseum({ name: 'Louvre' })}
          onStart={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('proactive-museum-title').props.children).toBe(
        'chat.proactive_museum.title',
      );
    });
  });

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

  describe('icon (R24-R25)', () => {
    it('renders Ionicons name="location" as the main icon', () => {
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
      expect(getByTestId('proactive-museum-confirm-title').props.children).toBe(
        'chat.proactive.confirm_sheet.title',
      );
      expect(getByTestId('proactive-museum-confirm-body').props.children).toBe(
        'chat.proactive.confirm_sheet.body',
      );
    });
  });
});
