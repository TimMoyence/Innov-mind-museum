import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

interface MotionProps {
  children?: React.ReactNode;
  initial?: unknown;
  whileInView?: unknown;
  [key: string]: unknown;
}

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        function MotionElement({ children, initial, whileInView, ...rest }: MotionProps) {
          const domProps = Object.fromEntries(
            Object.entries(rest).filter(([key]) => key === 'className'),
          );
          return React.createElement(
            tag,
            {
              ...domProps,
              'data-motion': '',
              'data-initial': JSON.stringify(initial ?? null),
              'data-while-in-view': JSON.stringify(whileInView ?? null),
            },
            children,
          );
        },
    },
  ),
}));

import BentoFeatureGrid from '../BentoFeatureGrid';
import { StorySection } from '../StorySection';

const motionElements = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('[data-motion]'));

describe('marketing sections for visitors who ask for reduced motion', () => {
  it('the story section renders every element in place, without entrance animation', () => {
    const { container } = render(
      <StorySection
        title="How Musaium turns a visit into a story"
        subtitle="Four steps from arrival to discovery."
        steps={[
          { title: 'Visit a museum', description: 'Walk in.' },
          { title: 'Snap or speak', description: 'Take a photo.' },
        ]}
      />,
    );

    const elements = motionElements(container);
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.getAttribute('data-initial')).toBe('false');
      expect(element.getAttribute('data-while-in-view')).toBe('null');
    }
  });

  it('the feature grid renders every card in place, without entrance animation', () => {
    const { container } = render(
      <BentoFeatureGrid
        features={[
          { title: 'Photo', description: 'Point your camera.' },
          { title: 'Voice', description: 'Ask aloud.' },
        ]}
        icons={[<span key="photo" />, <span key="voice" />]}
      />,
    );

    const elements = motionElements(container);
    expect(elements.length).toBe(2);
    for (const element of elements) {
      expect(element.getAttribute('data-initial')).toBe('false');
      expect(element.getAttribute('data-while-in-view')).toBe('null');
    }
  });
});
