import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: {
    submitPaywallInterest: jest.fn(),
  },
}));

jest.mock('@/shared/analytics/plausible', () => ({
  trackFunnelEvent: jest.fn(),
}));

import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';

import { makeQuotaReason } from '../../../helpers/factories';

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

const reasonFixture = makeQuotaReason();

describe('QuotaUpsellModal — backdrop is NOT a Pressable (audit #14, R11)', () => {
  it('the backdrop View has no onPress prop (no backdrop-tap-to-dismiss)', () => {
    const view = render(<QuotaUpsellModal visible reason={reasonFixture} onClose={jest.fn()} />);
    const root = view.toJSON() as unknown as MinimalNode;

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
    expect((backdrop as MinimalNode | null)?.props?.onPress).toBeUndefined();
  });

  it('the × close button calls onClose', () => {
    const onClose = jest.fn();
    const view = render(<QuotaUpsellModal visible reason={reasonFixture} onClose={onClose} />);
    fireEvent.press(view.getByLabelText('paywall.dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
