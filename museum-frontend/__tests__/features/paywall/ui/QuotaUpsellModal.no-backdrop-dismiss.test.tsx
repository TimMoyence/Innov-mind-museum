/**
 * Regression-guard for QuotaUpsellModal — backdrop is NOT a Pressable
 * (audit #14, R11).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`.
 *
 * F2 doctrine block at `QuotaUpsellModal.tsx:30-43` mandates : the modal
 * hosts a TextInput + consent checkbox + honeypot ; an accidental backdrop
 * tap mid-typing must NOT drop the captured email + consent state. The
 * close `×` button is the only dismiss affordance. The backdrop is a
 * plain `<View>`, not a `<Pressable>`.
 *
 * Test contract :
 * - The backdrop element MUST NOT carry an `onPress` prop (proving it's a
 *   View and not a Pressable wired to onClose).
 * - The dismiss affordance via the `×` button (a11y label
 *   `paywall.dismiss`) MUST still call `onClose`.
 */

import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

// C1 hexagonal (2026-05-23) — modal posts via `leadsApi` ; we just need a
// no-op mock so the import resolves under Jest.
jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: {
    submitPaywallInterest: jest.fn(),
  },
}));

jest.mock('@/shared/analytics/plausible', () => ({
  trackFunnelEvent: jest.fn(),
}));

import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';

interface MinimalNode {
  type?: string;
  props?: {
    style?: unknown;
    onPress?: unknown;
    children?: unknown;
  };
  children?: unknown[];
}

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (style == null) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
};

const walkAll = (
  root: MinimalNode | null | undefined,
  visit: (node: MinimalNode) => void,
): void => {
  if (!root || typeof root !== 'object') return;
  visit(root);
  const kids = root.children;
  if (Array.isArray(kids)) {
    for (const child of kids) walkAll(child as MinimalNode, visit);
  }
};

const reasonFixture = {
  tier: 'free',
  currentCount: 3,
  limit: 3,
  resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe('QuotaUpsellModal — backdrop is NOT a Pressable (audit #14, R11)', () => {
  it('the backdrop View has no onPress prop (no backdrop-tap-to-dismiss)', () => {
    const view = render(<QuotaUpsellModal visible reason={reasonFixture} onClose={jest.fn()} />);
    const root = view.toJSON() as unknown as MinimalNode;

    // Find the backdrop by its rgba background color literal.
    let backdrop: MinimalNode | null = null;
    walkAll(root, (node) => {
      if (backdrop) return;
      const style = flattenStyle(node.props?.style);
      const bg = style.backgroundColor;
      if (typeof bg === 'string' && bg === 'rgba(0,0,0,0.4)') {
        backdrop = node;
      }
    });

    expect(backdrop).not.toBeNull();
    // The backdrop must not carry an onPress callback (proof it's a View,
    // not a Pressable wired to onClose).
    expect((backdrop as MinimalNode | null)?.props?.onPress).toBeUndefined();
  });

  it('the × close button calls onClose', () => {
    const onClose = jest.fn();
    const view = render(<QuotaUpsellModal visible reason={reasonFixture} onClose={onClose} />);
    fireEvent.press(view.getByLabelText('paywall.dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
