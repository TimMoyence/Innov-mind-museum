import React from 'react';
import { render } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { CameraIntentSlide } from '@/features/onboarding/ui/CameraIntentSlide';
import { GreetingSlide } from '@/features/onboarding/ui/GreetingSlide';
import { MuseumModeSlide } from '@/features/onboarding/ui/MuseumModeSlide';
import { WalkIntentSlide } from '@/features/onboarding/ui/WalkIntentSlide';

// Spec B onboarding v2 — 4 informational slides shown sequentially on first
// launch. They share the same shape (icon wrap + i18n title + i18n description)
// so the contracts under test are identical: each slide MUST surface its title
// and description i18n keys (the test-utils i18n mock returns keys verbatim)
// and MUST mark the title as a header for screen readers.

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
    // The Animated.View wraps the title <Text>; the title has accessibilityRole="header".
    // We verify the role is set on the matching element so screen readers announce it
    // as a heading rather than body copy.
    const titleProps = (title as unknown as { props: { accessibilityRole?: string } }).props;
    expect(titleProps.accessibilityRole).toBe('header');
  });

  it('surfaces its localized description key', () => {
    const { getByText } = render(<Component />);
    expect(getByText(descriptionKey)).toBeTruthy();
  });
});
