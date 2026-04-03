import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { OnboardingSlide } from '@/features/onboarding/ui/OnboardingSlide';
import type { SlideData } from '@/features/onboarding/ui/OnboardingSlide';

const sampleSlide: SlideData = {
  icon: 'camera-outline',
  title: 'Welcome to Musaium',
  subtitle: 'Your museum companion',
  bullets: ['Take photos of artworks', 'Get instant AI responses', 'Learn art history'],
};

describe('OnboardingSlide', () => {
  it('renders title and subtitle', () => {
    const { getByText } = render(<OnboardingSlide slide={sampleSlide} />);

    expect(getByText('Welcome to Musaium')).toBeTruthy();
    expect(getByText('Your museum companion')).toBeTruthy();
  });

  it('renders all bullet points', () => {
    const { getByText } = render(<OnboardingSlide slide={sampleSlide} />);

    expect(getByText('Take photos of artworks')).toBeTruthy();
    expect(getByText('Get instant AI responses')).toBeTruthy();
    expect(getByText('Learn art history')).toBeTruthy();
  });

  it('renders bullet numbers', () => {
    const { getByText } = render(<OnboardingSlide slide={sampleSlide} />);

    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('has accessibility label combining title and subtitle', () => {
    const { getByLabelText } = render(<OnboardingSlide slide={sampleSlide} />);

    expect(getByLabelText('Welcome to Musaium. Your museum companion')).toBeTruthy();
  });
});
