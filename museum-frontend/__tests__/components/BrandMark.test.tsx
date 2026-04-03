import React from 'react';
import { render } from '@testing-library/react-native';

// DO NOT import test-utils — it mocks BrandMark itself
// Only mock the required dependency (useWindowDimensions returns a default)
import { BrandMark } from '@/shared/ui/BrandMark';

describe('BrandMark', () => {
  it('renders the logo image with accessibility label', () => {
    const { getByLabelText } = render(<BrandMark />);

    expect(getByLabelText('Musaium logo')).toBeTruthy();
  });

  it('renders with default hero variant', () => {
    const { getByLabelText } = render(<BrandMark />);

    const logo = getByLabelText('Musaium logo');
    expect(logo).toBeTruthy();
  });

  it('renders with auth variant', () => {
    const { getByLabelText } = render(<BrandMark variant="auth" />);

    expect(getByLabelText('Musaium logo')).toBeTruthy();
  });

  it('renders with header variant', () => {
    const { getByLabelText } = render(<BrandMark variant="header" />);

    expect(getByLabelText('Musaium logo')).toBeTruthy();
  });

  it('uses explicit size when provided', () => {
    const { getByLabelText } = render(<BrandMark size={100} />);

    expect(getByLabelText('Musaium logo')).toBeTruthy();
  });
});
