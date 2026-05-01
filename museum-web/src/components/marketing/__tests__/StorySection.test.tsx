import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StorySection } from '../StorySection';

interface MotionProps {
  children?: React.ReactNode;
  initial?: unknown;
  whileInView?: unknown;
  viewport?: unknown;
  transition?: unknown;
  [key: string]: unknown;
}

// Framer Motion relies on IntersectionObserver — stub motion elements with plain HTML
vi.mock('framer-motion', () => ({
  motion: {
    h2: function MotionH2({
      children,
      initial: _i,
      whileInView: _w,
      viewport: _v,
      transition: _t,
      ...rest
    }: MotionProps) {
      return React.createElement('h2', rest, children);
    },
    p: function MotionP({
      children,
      initial: _i,
      whileInView: _w,
      viewport: _v,
      transition: _t,
      ...rest
    }: MotionProps) {
      return React.createElement('p', rest, children);
    },
    div: function MotionDiv({
      children,
      initial: _i,
      whileInView: _w,
      viewport: _v,
      transition: _t,
      ...rest
    }: MotionProps) {
      return React.createElement('div', rest, children);
    },
    article: function MotionArticle({
      children,
      initial: _i,
      whileInView: _w,
      viewport: _v,
      transition: _t,
      ...rest
    }: MotionProps) {
      return React.createElement('article', rest, children);
    },
  },
}));

const STORY_PROPS = {
  title: 'How Musaium turns a visit into a story',
  subtitle: 'Four steps from arrival to discovery.',
  steps: [
    { title: 'Visit a museum', description: 'Walk into a partner museum...' },
    { title: 'Snap or speak', description: 'Take a photo...' },
    { title: 'AI answers in your tone', description: 'Musaium adapts...' },
    { title: 'Follow the next chip', description: 'Suggestions guide...' },
  ],
};

describe('StorySection', () => {
  it('renders the section title', () => {
    render(<StorySection {...STORY_PROPS} />);
    expect(screen.getByText(/Musaium turns a visit/)).toBeInTheDocument();
  });

  it('renders all 4 step titles', () => {
    render(<StorySection {...STORY_PROPS} />);
    expect(screen.getByText('Visit a museum')).toBeInTheDocument();
    expect(screen.getByText('Snap or speak')).toBeInTheDocument();
    expect(screen.getByText('AI answers in your tone')).toBeInTheDocument();
    expect(screen.getByText('Follow the next chip')).toBeInTheDocument();
  });

  it('exposes the section as a labeled landmark', () => {
    render(<StorySection {...STORY_PROPS} />);
    const section = screen.getByRole('region', { name: /Musaium turns a visit/ });
    expect(section).toBeInTheDocument();
  });

  it('renders step descriptions', () => {
    render(<StorySection {...STORY_PROPS} />);
    expect(screen.getByText('Walk into a partner museum...')).toBeInTheDocument();
    expect(screen.getByText('Suggestions guide...')).toBeInTheDocument();
  });
});
