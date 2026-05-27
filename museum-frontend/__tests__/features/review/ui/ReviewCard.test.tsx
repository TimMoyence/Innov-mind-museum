import React from 'react';
import { render, screen } from '@testing-library/react-native';

import '../../../helpers/test-utils';
import { makeReview } from '../../../helpers/factories';
import { ReviewCard } from '@/features/review/ui/ReviewCard';

describe('ReviewCard', () => {
  // Date math is anchored to a fixed "now" so the relative-date branches
  // (today / yesterday / Nd / Nmo / Ny) are deterministic across runs.
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
    // the topmost rendered element is the card View itself
    expect(root.props.accessibilityRole).toBe('summary');
  });

  // C2-FE / UFR-022 RED (R26, Q4). A rating is an NPS score on a 0-10 scale.
  // The previous 1-5 StarRating clamp (ReviewCard.tsx:47) misrepresents a 0-10
  // rating (e.g. rating 9 rendered as ~5 filled stars). The card must read the
  // rating textually on /10. `t()` returns the key in tests, so the un-capped
  // numerator is asserted directly. These FAIL at baseline (StarRating still
  // rendered, no "/10" text node present).

  it('renders the rating textually on a /10 scale (rating 9 → "9/10"), never a 5-star clamp', () => {
    render(<ReviewCard review={makeReview({ rating: 9 })} />);
    // The "9" numerator must be present on screen; "/10" denominator present
    // either inline ("9/10") or via the ratingOutOf10 dict key.
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
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('formats yesterday as "Yesterday" in EN locale', () => {
    const createdAt = new Date(FIXED_NOW - 1 * 86_400_000).toISOString();
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('formats <30 days as "Nd"', () => {
    const createdAt = new Date(FIXED_NOW - 5 * 86_400_000).toISOString();
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('5d')).toBeTruthy();
  });

  it('formats <365 days as "Nmo"', () => {
    const createdAt = new Date(FIXED_NOW - 90 * 86_400_000).toISOString();
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('3mo')).toBeTruthy();
  });

  it('formats >=365 days as "Ny"', () => {
    const createdAt = new Date(FIXED_NOW - 800 * 86_400_000).toISOString();
    render(<ReviewCard review={makeReview({ createdAt })} />);
    expect(screen.getByText('2y')).toBeTruthy();
  });
});
