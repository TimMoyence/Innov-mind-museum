import '../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import {
  ConversationResumptionBanner,
  formatResumptionTimeAgo,
} from '@/features/chat/ui/ConversationResumptionBanner';

import type { ResumableSession } from '@/features/chat/application/useResumableSession';

function makeSession(overrides: Partial<ResumableSession> = {}): ResumableSession {
  return {
    id: 'sess-test',
    museumId: 7,
    museumName: 'Louvre',
    lastArtworkTitle: 'La Liseuse',
    updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    ...overrides,
  };
}

describe('<ConversationResumptionBanner> (B2 — banner UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('null gate (R13, AC11)', () => {
    it('renders nothing when session is null', () => {
      const { queryByTestId } = render(
        <ConversationResumptionBanner session={null} onResume={jest.fn()} onDismiss={jest.fn()} />,
      );
      expect(queryByTestId('conversation-resumption-banner')).toBeNull();
      expect(queryByTestId('conversation-resumption-title')).toBeNull();
      expect(queryByTestId('conversation-resumption-subtitle')).toBeNull();
      expect(queryByTestId('conversation-resumption-dismiss')).toBeNull();
    });
  });

  describe('root structure + a11y (R14-R16, AC12)', () => {
    it('renders a Pressable with testID="conversation-resumption-banner"', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-banner')).toBeTruthy();
    });

    it('exposes accessibilityRole="button" on the root Pressable', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-banner').props.accessibilityRole).toBe('button');
    });

    it('sets accessibilityHint to "chat.resumption.a11y_hint"', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-banner').props.accessibilityHint).toBe(
        'chat.resumption.a11y_hint',
      );
    });

    it('uses a11y_label_with_artwork key when title+museum both present', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ lastArtworkTitle: 'La Liseuse', museumName: 'Louvre' })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-banner').props.accessibilityLabel).toBe(
        'chat.resumption.a11y_label_with_artwork',
      );
    });

    it('uses a11y_label_fallback key when artwork title is null', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ lastArtworkTitle: null })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-banner').props.accessibilityLabel).toBe(
        'chat.resumption.a11y_label_fallback',
      );
    });
  });

  describe('title branch (R17, AC13)', () => {
    it('renders title using chat.resumption.title_with_artwork when lastArtworkTitle present', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ lastArtworkTitle: 'La Liseuse' })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-title').props.children).toBe(
        'chat.resumption.title_with_artwork',
      );
    });

    it('renders title using chat.resumption.title_fallback when lastArtworkTitle is null', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ lastArtworkTitle: null })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-title').props.children).toBe(
        'chat.resumption.title_fallback',
      );
    });

    it('renders title using chat.resumption.title_fallback when lastArtworkTitle is empty string', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ lastArtworkTitle: '' })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-title').props.children).toBe(
        'chat.resumption.title_fallback',
      );
    });
  });

  describe('subtitle branch (R18, AC14)', () => {
    it('renders subtitle using subtitle_with_museum when museumName present', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ museumName: 'Louvre' })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-subtitle').props.children).toBe(
        'chat.resumption.subtitle_with_museum',
      );
    });

    it('renders subtitle using subtitle_no_museum when museumName is null', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession({ museumName: null })}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-subtitle').props.children).toBe(
        'chat.resumption.subtitle_no_museum',
      );
    });
  });

  describe('dismiss separate Pressable (R19, AC15)', () => {
    it('renders a dismiss Pressable with testID="conversation-resumption-dismiss"', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-dismiss')).toBeTruthy();
    });

    it('exposes accessibilityRole="button" on the dismiss Pressable separately from the root', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-dismiss').props.accessibilityRole).toBe('button');
    });

    it('uses accessibilityLabel === chat.resumption.a11y_dismiss on the dismiss Pressable', () => {
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByTestId('conversation-resumption-dismiss').props.accessibilityLabel).toBe(
        'chat.resumption.a11y_dismiss',
      );
    });
  });

  describe('tap wiring (R20-R21, AC16-AC17)', () => {
    it('invokes onResume(session.id) verbatim on card press, exactly once (AC16)', () => {
      const onResume = jest.fn();
      const onDismiss = jest.fn();
      const session = makeSession({ id: 'sess-tap' });
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={session}
          onResume={onResume}
          onDismiss={onDismiss}
        />,
      );
      fireEvent.press(getByTestId('conversation-resumption-banner'));
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(onResume).toHaveBeenCalledWith('sess-tap');
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('invokes onDismiss() exactly once on dismiss press AND does NOT invoke onResume (AC17)', () => {
      const onResume = jest.fn();
      const onDismiss = jest.fn();
      const { getByTestId } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={onResume}
          onDismiss={onDismiss}
        />,
      );
      fireEvent.press(getByTestId('conversation-resumption-dismiss'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onResume).not.toHaveBeenCalled();
    });
  });

  describe('thumb placeholder (R22-R23)', () => {
    it('renders Ionicons name="images-outline" as the thumb placeholder', () => {
      const { getByText } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByText('images-outline')).toBeTruthy();
    });

    it('renders Ionicons name="close" inside the dismiss Pressable', () => {
      const { getByText } = render(
        <ConversationResumptionBanner
          session={makeSession()}
          onResume={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(getByText('close')).toBeTruthy();
    });
  });
});

describe('formatResumptionTimeAgo (B2 — pure time-ago helper)', () => {
  const t: (key: string, _interp?: Record<string, unknown>) => string = (key) => key;

  describe('boundary inputs (R25-R28, AC18)', () => {
    it('delta=0ms → just_now', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.just_now',
      );
    });

    it('delta=59_999ms → just_now (R25 boundary)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 59_999).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.just_now',
      );
    });

    it('delta=60_000ms → minutes (R26 boundary)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 60_000).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.minutes',
      );
    });

    it('delta=3_599_000ms → minutes (R26 boundary)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 3_599_000).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.minutes',
      );
    });

    it('delta=3_600_000ms → hours (R27 boundary)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 3_600_000).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.hours',
      );
    });

    it('delta=86_399_999ms → hours (R27 boundary just below 1 day)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 86_399_999).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.hours',
      );
    });

    it('delta=86_400_000ms → days (R28 boundary at 1 day)', () => {
      const now = 1_700_000_000_000;
      expect(formatResumptionTimeAgo(new Date(now - 86_400_000).toISOString(), now, t)).toBe(
        'chat.resumption.time_ago.days',
      );
    });

    it('passes the correct `count` interpolation arg per branch (spot check minutes/hours/days)', () => {
      const tSpy = jest.fn<string, [string, Record<string, unknown>?]>(
        (key: string, _interp?: Record<string, unknown>) => key,
      );
      const now = 1_700_000_000_000;
      formatResumptionTimeAgo(new Date(now - 5 * 60_000).toISOString(), now, tSpy);
      expect(tSpy).toHaveBeenCalledWith('chat.resumption.time_ago.minutes', { count: 5 });

      tSpy.mockClear();
      formatResumptionTimeAgo(new Date(now - 3 * 3_600_000).toISOString(), now, tSpy);
      expect(tSpy).toHaveBeenCalledWith('chat.resumption.time_ago.hours', { count: 3 });

      tSpy.mockClear();
      formatResumptionTimeAgo(new Date(now - 2 * 86_400_000).toISOString(), now, tSpy);
      expect(tSpy).toHaveBeenCalledWith('chat.resumption.time_ago.days', { count: 2 });
    });
  });

  describe('invalid input fallback (R29, AC19)', () => {
    it('returns just_now for unparseable iso string and does NOT throw', () => {
      expect(() => formatResumptionTimeAgo('not-an-iso', Date.now(), t)).not.toThrow();
      expect(formatResumptionTimeAgo('not-an-iso', Date.now(), t)).toBe(
        'chat.resumption.time_ago.just_now',
      );
    });

    it('returns just_now for empty string', () => {
      expect(formatResumptionTimeAgo('', Date.now(), t)).toBe('chat.resumption.time_ago.just_now');
    });
  });
});
