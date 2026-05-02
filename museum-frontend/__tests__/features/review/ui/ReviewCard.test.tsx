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

  it('renders a 1-5 star adjustable rating widget reflecting the review.rating', () => {
    const result = render(<ReviewCard review={makeReview({ rating: 4 })} />);
    // StarRating exposes accessibilityRole="adjustable" + accessibilityValue.
    // Walk the rendered tree to find that node — testing-library's getByRole
    // does not always recognise non-standard RN roles.
    interface Node {
      props?: { accessibilityRole?: string; accessibilityValue?: unknown };
      children?: Node[] | string[] | null;
    }
    const walk = (node: Node | Node[] | null | string): Node | null => {
      if (!node || typeof node === 'string') return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      }
      if (node.props?.accessibilityRole === 'adjustable') return node;
      if (node.children) return walk(node.children as Node[]);
      return null;
    };
    const widget = walk(result.toJSON() as Node | Node[] | null);
    expect(widget?.props?.accessibilityValue).toMatchObject({ now: 4, min: 1, max: 5 });
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
