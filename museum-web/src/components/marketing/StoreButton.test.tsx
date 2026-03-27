import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StoreButton from './StoreButton';

describe('StoreButton', () => {
  it('renders Apple store button with label and sub-label', () => {
    render(
      <StoreButton
        store="apple"
        label="App Store"
        subLabel="Download on the"
        href="https://apps.apple.com"
      />,
    );

    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.getByText('Download on the')).toBeInTheDocument();
  });

  it('renders Google Play store button', () => {
    render(
      <StoreButton
        store="google"
        label="Google Play"
        subLabel="Get it on"
      />,
    );

    expect(screen.getByText('Google Play')).toBeInTheDocument();
    expect(screen.getByText('Get it on')).toBeInTheDocument();
  });

  it('uses href="#" by default', () => {
    render(
      <StoreButton store="apple" label="App Store" subLabel="Download" />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#');
  });

  it('sets href when provided', () => {
    render(
      <StoreButton
        store="google"
        label="Play"
        subLabel="Get"
        href="https://play.google.com"
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://play.google.com');
  });
});
