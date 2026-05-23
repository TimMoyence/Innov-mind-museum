/**
 * Red test for OfflinePackPrompt backdrop dismiss gating (audit #13, D4).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`.
 *
 * Spec: tapping the backdrop during an active download must NOT abort the
 * download silently — the user might just be reviewing the prompt and have
 * tapped outside accidentally. During `absent` (initial) and `complete`
 * (post-download review) states, the backdrop MUST still call `onDismiss`.
 *
 * Current code at `OfflinePackPrompt.tsx:142` wires the backdrop Pressable
 * `onPress` directly to `onDismiss` regardless of `packState.status`. This
 * test's `active` case FAILS on current code; the green phase introduces a
 * status-aware gate.
 */

import '../../../helpers/test-utils';
import React from 'react';
import { act, render } from '@testing-library/react-native';

import { OfflinePackPrompt } from '@/features/museum/ui/OfflinePackPrompt';
import type { CityPackState } from '@/features/museum/application/useOfflinePacks';

interface PressableLikeInstance {
  type: { displayName?: string; name?: string } | string;
  props: {
    onPress?: () => void;
    accessibilityElementsHidden?: boolean;
  };
}

/**
 * Locate the backdrop Pressable. The OfflinePackPrompt declares it as
 * `<Pressable style={styles.backdrop} onPress={onDismiss} accessibilityElementsHidden />`
 * — it is the only `accessibilityElementsHidden` Pressable in the tree
 * carrying an `onPress` callback.
 */
const findBackdropPressable = (view: ReturnType<typeof render>): PressableLikeInstance | null => {
  interface Searchable {
    UNSAFE_getAllByProps: (props: object) => PressableLikeInstance[];
  }
  const hiddenNodes = (view as unknown as Searchable).UNSAFE_getAllByProps({
    accessibilityElementsHidden: true,
  });
  for (const node of hiddenNodes) {
    const typeName =
      typeof node.type === 'string' ? node.type : (node.type.displayName ?? node.type.name);
    if (typeName === 'Pressable' && typeof node.props.onPress === 'function') {
      return node;
    }
  }
  return null;
};

describe('OfflinePackPrompt — backdrop dismiss gating (audit #13)', () => {
  const baseProps = {
    visible: true,
    cityName: 'Bordeaux',
    errorVisible: false,
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onRetry: jest.fn(),
    testID: 'offline-pack-prompt',
  } as const;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('packState=absent: backdrop tap calls onDismiss', () => {
    const onDismiss = jest.fn();
    const packState: CityPackState = { status: 'absent' };
    const view = render(
      <OfflinePackPrompt {...baseProps} packState={packState} onDismiss={onDismiss} />,
    );
    const backdrop = findBackdropPressable(view);
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.props.onPress?.();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('packState=active: backdrop tap does NOT call onDismiss (download in flight)', () => {
    const onDismiss = jest.fn();
    const packState: CityPackState = {
      status: 'active',
      percentage: 42,
      bytesOnDisk: 1024 * 1024,
    };
    const view = render(
      <OfflinePackPrompt {...baseProps} packState={packState} onDismiss={onDismiss} />,
    );
    const backdrop = findBackdropPressable(view);
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.props.onPress?.();
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('packState=complete: backdrop tap calls onDismiss (review-only state)', () => {
    const onDismiss = jest.fn();
    const packState: CityPackState = { status: 'complete', bytesOnDisk: 2 * 1024 * 1024 };
    const view = render(
      <OfflinePackPrompt {...baseProps} packState={packState} onDismiss={onDismiss} />,
    );
    const backdrop = findBackdropPressable(view);
    expect(backdrop).not.toBeNull();
    act(() => {
      backdrop?.props.onPress?.();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
