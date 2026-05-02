import React from 'react';
import { render } from '@testing-library/react-native';

// NOTE: do NOT import the global test-utils — it stubs BrandMark itself with a
// placeholder View so the rest of the suite can render screens without dragging
// in the real <Image>. Here we want the real component, so we inline the
// minimal mocks BrandMark transitively needs.

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 320, height: 568, scale: 2, fontScale: 1 }),
}));

import { BrandMark } from '@/shared/ui/BrandMark';

interface RenderedNode {
  type: string;
  props: { style?: unknown };
  children?: RenderedNode[] | string[] | null;
}

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, layer) => Object.assign(acc, flattenStyle(layer)),
      {},
    );
  }
  return style as Record<string, unknown>;
};

const rootStyle = (renderResult: ReturnType<typeof render>): Record<string, unknown> => {
  const json = renderResult.toJSON() as RenderedNode | RenderedNode[] | null;
  const root = Array.isArray(json) ? json[0] : json;
  return flattenStyle(root?.props.style);
};

describe('BrandMark — responsive size resolution', () => {
  it('renders the logo with an accessible label', () => {
    const { getByLabelText } = render(<BrandMark />);
    expect(getByLabelText('Musaium logo')).toBeTruthy();
  });

  it('honours an explicit `size` prop without invoking the resolver', () => {
    const result = render(<BrandMark size={42} />);
    const style = rootStyle(result);
    expect(style.width).toBe(42);
    expect(style.height).toBe(42);
  });

  it.each([
    ['auth' as const, { minWidth: 96, maxWidth: 132 }],
    ['auth-compact' as const, { minWidth: 64, maxWidth: 80 }],
    ['header' as const, { minWidth: 88, maxWidth: 120 }],
    ['hero' as const, { minWidth: 140, maxWidth: 184 }],
  ])(
    'variant=%s clamps the resolved size to documented bounds',
    (variant, { minWidth, maxWidth }) => {
      const style = rootStyle(render(<BrandMark variant={variant} />));
      const width = style.width as number;
      expect(typeof width).toBe('number');
      expect(width).toBeGreaterThanOrEqual(minWidth);
      expect(width).toBeLessThanOrEqual(maxWidth);
      expect(style.height).toBe(width);
    },
  );

  it('passes through caller style overrides as the last layer', () => {
    const override = { opacity: 0.5 };
    const style = rootStyle(render(<BrandMark style={override} />));
    expect(style.opacity).toBe(0.5);
  });
});
