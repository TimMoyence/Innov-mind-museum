/**
 * Red tests for `<BottomSheetContainer />` backdrop dismiss + pointer-events
 * routing (UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`).
 *
 * Covers R5, R6, R8, R9, R12 from spec.md.
 *
 * - T2.2 — R5 reducer-wiring guard (regression-guard, PASSES on current code).
 * - T2.3 — Structural pointer-events assertion (FAILS on current code: the
 *   `Animated.View` wrap currently has `pointerEvents="auto"`; the green
 *   phase changes it to `"box-none"` so taps outside the visible slab reach
 *   the backdrop).
 * - T2.4 — Parameterised over 4-of-6 non-blocking routes
 *   (`attachment-picker`, `browser`, `context-menu`, `summary`). The
 *   structural assertion is the same across all (same shared container).
 * - T2.6 — R9 accessibilityViewIsModal + role=dialog regression-guard.
 * - T2.7 — R12 backdrop accessibilityLabel != sheet announce label
 *   (FAILS on current code: backdrop label is currently the sheet label).
 *
 * Test discipline: mock content via factory-built mock route registry from
 * `dismiss-test-harness.tsx`. No inline test entities.
 */

import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';

import '../../../helpers/test-utils';

const mockReduceMotion = jest.fn(() => false);
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion(),
}));

import {
  DismissRouterTestHost,
  installAllMockRoutes,
  type DismissRouterHandle,
} from './dismiss-test-harness';

const ATTACHMENT_PICKER_PARAMS = {
  recordedAudioUri: null,
  isPlayingAudio: false,
  isRecording: false,
  onPickImage: () => undefined,
  onTakePicture: () => undefined,
  toggleRecording: async () => undefined,
  playRecordedAudio: async () => undefined,
  clearMedia: () => undefined,
  onOpenScanner: () => undefined,
} as const;

interface MinimalNode {
  type?: string;
  props?: {
    testID?: string;
    pointerEvents?: string;
    style?: unknown;
    accessibilityLabel?: string;
    accessibilityViewIsModal?: boolean;
    accessibilityRole?: string;
    children?: unknown;
  };
  parent?: MinimalNode | null;
  children?: unknown[];
}

const walkAll = (
  root: MinimalNode | null | undefined,
  visit: (node: MinimalNode) => void,
): void => {
  if (!root || typeof root !== 'object') return;
  visit(root);
  const kids = root.children;
  if (Array.isArray(kids)) {
    for (const child of kids) walkAll(child as MinimalNode, visit);
  }
};

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (style == null) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
};

describe('<BottomSheetContainer /> — backdrop dismiss + pointer-events (R5, R6, R8, R9, R12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReduceMotion.mockReturnValue(false);
    installAllMockRoutes();
  });

  describe('T2.2 — reducer-wiring guard (R5 baseline)', () => {
    it('tapping the backdrop on attachment-picker dispatches CLOSE and unmounts content', () => {
      jest.useFakeTimers();
      const ref = React.createRef<DismissRouterHandle>();
      const view = render(<DismissRouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('attachment-picker', ATTACHMENT_PICKER_PARAMS);
      });
      act(() => {
        jest.runAllTimers();
      });
      expect(view.queryByTestId('mock-attachment-picker-content')).not.toBeNull();

      const backdrop = view.getByTestId('bottom-sheet-backdrop');
      const onPress = (backdrop.props as { onPress?: () => void }).onPress;
      act(() => {
        onPress?.();
      });
      act(() => {
        jest.runAllTimers();
      });

      expect(view.queryByTestId('mock-attachment-picker-content')).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('T2.3 — pointer-events routing structural assertion', () => {
    it('the sheet wrap Animated.View has pointerEvents="box-none" (NOT "auto")', () => {
      jest.useFakeTimers();
      const ref = React.createRef<DismissRouterHandle>();
      const view = render(<DismissRouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('attachment-picker', ATTACHMENT_PICKER_PARAMS);
      });
      act(() => {
        jest.runAllTimers();
      });

      // Walk all rendered nodes and find Animated.View instances. We accept
      // either: (a) a node typed `AnimatedComponent(View)` or any host node
      // carrying `pointerEvents` AND a `transform` style — the sheet wrap is
      // the Animated.View carrying the opacity/translateY transform.
      const candidates: MinimalNode[] = [];
      const root = view.toJSON() as unknown as MinimalNode;
      walkAll(root, (node) => {
        const style = flattenStyle(node.props?.style);
        if (typeof node.props?.pointerEvents === 'string' && Array.isArray(style.transform)) {
          candidates.push(node);
        }
      });

      // Must find at least one such node (the sheet wrap with the slide-up
      // translateY + opacity animation).
      expect(candidates.length).toBeGreaterThan(0);
      // ALL such wraps must declare pointerEvents="box-none" so taps outside
      // the inner slab fall through to the sibling backdrop.
      for (const node of candidates) {
        expect(node.props?.pointerEvents).toBe('box-none');
      }
      jest.useRealTimers();
    });
  });

  describe('T2.4 — parameterised structural pointer-events assertion across 4 non-blocking routes', () => {
    const cases: readonly {
      id: 'attachment-picker' | 'browser' | 'context-menu' | 'summary';
      params: unknown;
    }[] = [
      { id: 'attachment-picker', params: ATTACHMENT_PICKER_PARAMS },
      { id: 'browser', params: { url: 'https://example.test/' } },
      { id: 'context-menu', params: { message: { id: 'msg-1' } } },
      {
        id: 'summary',
        params: {
          summary: {
            sessionId: 'sess-1',
            createdAt: new Date().toISOString(),
            messages: [],
          },
        },
      },
    ];

    it.each(cases)(
      'route=%s: the sheet wrap Animated.View has pointerEvents="box-none"',
      ({ id, params }) => {
        jest.useFakeTimers();
        const ref = React.createRef<DismissRouterHandle>();
        const view = render(<DismissRouterTestHost ref={ref} />);

        act(() => {
          ref.current?.open(id, params);
        });
        act(() => {
          jest.runAllTimers();
        });

        const candidates: MinimalNode[] = [];
        const root = view.toJSON() as unknown as MinimalNode;
        walkAll(root, (node) => {
          const style = flattenStyle(node.props?.style);
          if (typeof node.props?.pointerEvents === 'string' && Array.isArray(style.transform)) {
            candidates.push(node);
          }
        });

        expect(candidates.length).toBeGreaterThan(0);
        for (const node of candidates) {
          expect(node.props?.pointerEvents).toBe('box-none');
        }
        jest.useRealTimers();
      },
    );
  });

  describe('T2.6 — R9 accessibilityViewIsModal + role=dialog regression-guard', () => {
    it('the outer wrapper carries accessibilityViewIsModal=true and accessibilityRole="dialog"', () => {
      jest.useFakeTimers();
      const ref = React.createRef<DismissRouterHandle>();
      const view = render(<DismissRouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('attachment-picker', ATTACHMENT_PICKER_PARAMS);
      });
      act(() => {
        jest.runAllTimers();
      });

      let foundDialog = false;
      const root = view.toJSON() as unknown as MinimalNode;
      walkAll(root, (node) => {
        if (
          node.props?.accessibilityViewIsModal === true &&
          node.props?.accessibilityRole === 'dialog'
        ) {
          foundDialog = true;
        }
      });
      expect(foundDialog).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('T2.7 — R12 backdrop accessibilityLabel != sheet announce label', () => {
    it('the backdrop dismiss-affordance has its own distinct accessibilityLabel', () => {
      jest.useFakeTimers();
      const ref = React.createRef<DismissRouterHandle>();
      const view = render(<DismissRouterTestHost ref={ref} />);

      act(() => {
        ref.current?.open('attachment-picker', ATTACHMENT_PICKER_PARAMS);
      });
      act(() => {
        jest.runAllTimers();
      });

      // The dismiss key registered for the backdrop in green phase = the
      // i18n key `a11y.bottomSheet.dismiss`. Tests use the mock i18n
      // identity transform (t(key) => key) per `helpers/test-utils.tsx`.
      const dismissKey = 'a11y.bottomSheet.dismiss';
      const sheetAnnounceKey = 'a11y.attachmentPicker.opened';

      // Walk tree, collect Pressables inside the backdrop subtree.
      const backdrop = view.getByTestId('bottom-sheet-backdrop') as unknown as MinimalNode;
      let foundDismissLabel = false;
      let foundSheetLabelOnBackdropPressable = false;
      walkAll(backdrop, (node) => {
        const label = node.props?.accessibilityLabel;
        if (label === dismissKey) foundDismissLabel = true;
        if (label === sheetAnnounceKey && node.props?.accessibilityRole === 'button') {
          // Pressables typed as buttons inside the backdrop subtree carrying
          // the sheet announce label = the current bug; would be the failing
          // condition (current code passes the sheet announce label through).
          foundSheetLabelOnBackdropPressable = true;
        }
      });

      expect(foundDismissLabel).toBe(true);
      expect(foundSheetLabelOnBackdropPressable).toBe(false);

      // Animated.timing in the entrance is non-blocking; clear any lingering
      // timers so the test does not leak. Animated import is referenced to
      // keep the symbol live (linters flag unused imports).
      void Animated;
      jest.useRealTimers();
    });
  });
});
