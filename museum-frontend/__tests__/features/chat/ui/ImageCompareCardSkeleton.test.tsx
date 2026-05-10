/**
 * RED tests for `ImageCompareCardSkeleton` (T8.3, Phase 8 — C3 Image Comparative).
 *
 * SUT: `museum-frontend/features/chat/ui/ImageCompareCardSkeleton.tsx`.
 *
 * Contract:
 *   - Renders pulsing placeholder rectangles (≥ 1 placeholder).
 *   - Suppresses Animated motion when the OS reduce-motion setting is on
 *     (WCAG 2.3.3 / 2.1 AA — `useReducedMotion()` hook drives this).
 *   - Has a stable structural snapshot.
 *
 * Component does NOT exist yet — these tests must FAIL on import.
 */
import '../../../helpers/test-utils';
import type { ComponentType } from 'react';
import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

type ImageCompareCardSkeletonComponent = ComponentType<Record<string, never>>;

const loadComponent = (): ImageCompareCardSkeletonComponent => {
  // Lazy require so a missing-SUT failure mode surfaces as a clean per-test
  // "Cannot find module" rather than a top-level import crash.
  const mod = require('@/features/chat/ui/ImageCompareCardSkeleton') as {
    ImageCompareCardSkeleton: ImageCompareCardSkeletonComponent;
  };
  return mod.ImageCompareCardSkeleton;
};

describe('ImageCompareCardSkeleton (T8.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders pulsing placeholder rectangles (≥1 skeleton thumb)', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const ImageCompareCardSkeleton = loadComponent();
    const tree = render(<ImageCompareCardSkeleton />);

    // The skeleton publishes itself with a progressbar a11y role.
    // Mirrors the existing C2 ImageCarouselSkeleton convention.
    const progressbar = tree.queryByRole('progressbar');
    expect(progressbar).toBeTruthy();
  });

  it('respects prefers-reduced-motion: opacity stays at 1 when reduce-motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const ImageCompareCardSkeleton = loadComponent();
    const { findAllByRole } = render(<ImageCompareCardSkeleton />);

    // The inner thumb(s) carry an `image` a11y role. With reduce-motion,
    // their starting opacity must be the high-end value (1) — i.e. the pulse
    // animation is short-circuited at construction time.
    const thumbs = await findAllByRole('image');
    for (const thumb of thumbs) {
      const flat = Array.isArray(thumb.props.style)
        ? Object.assign({}, ...thumb.props.style.filter(Boolean))
        : (thumb.props.style ?? {});
      // Animated.Value renders into the inline style as a numeric `opacity`.
      // When animation is suppressed, opacity should be exactly 1.
      // Allow Animated objects too (they expose `_value` in tests).
      const opacity =
        typeof flat.opacity === 'number'
          ? flat.opacity
          : ((flat.opacity as { _value?: number } | undefined)?._value ?? 1);
      expect(opacity).toBe(1);
    }
  });

  it('matches the structural snapshot for the default (non-reduce-motion) state', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const ImageCompareCardSkeleton = loadComponent();
    const { toJSON } = render(<ImageCompareCardSkeleton />);

    expect(toJSON()).toMatchSnapshot();
  });
});
