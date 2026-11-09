import React from 'react';
import { render } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { CameraIntentSlide } from '@/features/onboarding/ui/CameraIntentSlide';
import { GreetingSlide } from '@/features/onboarding/ui/GreetingSlide';
import { MuseumModeSlide } from '@/features/onboarding/ui/MuseumModeSlide';
import { WalkIntentSlide } from '@/features/onboarding/ui/WalkIntentSlide';

const cases = [
  {
    name: 'GreetingSlide',
    Component: GreetingSlide,
    titleKey: 'onboarding.v2.greeting.title',
    descriptionKey: 'onboarding.v2.greeting.description',
  },
  {
    name: 'MuseumModeSlide',
    Component: MuseumModeSlide,
    titleKey: 'onboarding.v2.museumMode.title',
    descriptionKey: 'onboarding.v2.museumMode.description',
  },
  {
    name: 'CameraIntentSlide',
    Component: CameraIntentSlide,
    titleKey: 'onboarding.v2.cameraIntent.title',
    descriptionKey: 'onboarding.v2.cameraIntent.description',
  },
  {
    name: 'WalkIntentSlide',
    Component: WalkIntentSlide,
    titleKey: 'onboarding.v2.walkIntent.title',
    descriptionKey: 'onboarding.v2.walkIntent.description',
  },
] as const;

describe.each(cases)('Onboarding slide — $name', ({ Component, titleKey, descriptionKey }) => {
  it('surfaces its localized title key as a screen-reader header', () => {
    const { getByText } = render(<Component />);
    const title = getByText(titleKey);
    expect(title).toBeTruthy();
    const titleProps = (title as unknown as { props: { accessibilityRole?: string } }).props;
    expect(titleProps.accessibilityRole).toBe('header');
  });

  it('surfaces its localized description key', () => {
    const { getByText } = render(<Component />);
    expect(getByText(descriptionKey)).toBeTruthy();
  });
});
