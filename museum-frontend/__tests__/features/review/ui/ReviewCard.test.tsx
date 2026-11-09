import React from 'react';
import { render, screen } from '@testing-library/react-native';

import '../../../helpers/test-utils';
import { makeReview } from '../../../helpers/factories';
import { speakAppLanguage } from '../../../helpers/real-i18n';
import { ReviewCard } from '@/features/review/ui/ReviewCard';

describe('ReviewCard', () => {
  const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z').getTime();

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the user name', () => {
    render(<ReviewCard review={makeReview({ userName: 'Charlotte' })} />);
    expect(screen.getByText('Charlotte')).toBeTruthy();
  });

  it('renders the comment text', () => {
    render(<ReviewCard review={makeReview({ comment: 'Magnificent collection' })} />);
    expect(screen.getByText('Magnificent collection')).toBeTruthy();
  });

  it('exposes accessibilityRole "summary" on the card root', () => {
    const { root } = render(<ReviewCard review={makeReview()} />);
    expect(root.props.accessibilityRole).toBe('summary');
  });

  it('renders the rating textually on a /10 scale (rating 9 → "9/10"), never a 5-star clamp', () => {
    render(<ReviewCard review={makeReview({ rating: 9 })} />);
    expect(screen.getByText(/9/)).toBeTruthy();
    const out10 = screen.queryByText(/9\s*\/\s*10/) ?? screen.queryByText('reviews.ratingOutOf10');
    expect(out10).toBeTruthy();
  });

  it('does NOT render a fixed accessibilityValue capped at max:5 (StarRating removed)', () => {
    const result = render(<ReviewCard review={makeReview({ rating: 9 })} />);
    interface Node {
      props?: { accessibilityValue?: { max?: number } };
      children?: unknown;
    }
    const walk = (node: unknown): boolean => {
      if (!node || typeof node === 'string') return false;
      if (Array.isArray(node)) return node.some((c) => walk(c));
      const n = node as Node;
      if (n.props?.accessibilityValue?.max === 5) return true;
      return walk(n.children);
    };
    expect(walk(result.toJSON())).toBe(false);
  });

  it('formats same-day date as "Today" in EN locale', () => {
    const createdAt = new Date(FIXED_NOW).toISOString();
    speakAppLanguage('en');
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('formats yesterday as "Yesterday" in EN locale', () => {
    const createdAt = new Date(FIXED_NOW - 1 * 86_400_000).toISOString();
    speakAppLanguage('en');
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('formats <30 days as "Nd"', () => {
    const createdAt = new Date(FIXED_NOW - 5 * 86_400_000).toISOString();
    speakAppLanguage('en');
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('5d')).toBeTruthy();
  });

  it('formats <365 days as "Nmo"', () => {
    const createdAt = new Date(FIXED_NOW - 90 * 86_400_000).toISOString();
    speakAppLanguage('en');
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('3mo')).toBeTruthy();
  });

  it('formats >=365 days as "Ny"', () => {
    const createdAt = new Date(FIXED_NOW - 800 * 86_400_000).toISOString();
    speakAppLanguage('en');
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('2y')).toBeTruthy();
  });
});
