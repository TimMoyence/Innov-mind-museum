import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeatureCard from './FeatureCard';

describe('FeatureCard', () => {
  it('renders title and description', () => {
    render(
      <FeatureCard
        icon={<span data-testid="icon">IC</span>}
        title="Smart Recognition"
        description="Identify artworks instantly"
      />,
    );

    expect(screen.getByText('Smart Recognition')).toBeInTheDocument();
    expect(screen.getByText('Identify artworks instantly')).toBeInTheDocument();
  });

  it('renders the icon element', () => {
    render(
      <FeatureCard
        icon={<span data-testid="icon">IC</span>}
        title="Title"
        description="Desc"
      />,
    );

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
