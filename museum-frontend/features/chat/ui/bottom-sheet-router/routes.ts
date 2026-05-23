import type React from 'react';
import type { ParseKeys } from 'i18next';

import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import type { MusaiumDeeplink } from '@/features/chat/application/sanitizeCartelCode';
import type { ThirdPartyAiScope } from '@/features/chat/domain/consentScopes';
import { AiConsentSheetContent } from '@/features/chat/ui/AiConsentSheetContent';
import { AiDisclosureSheetContent } from '@/features/chat/ui/AiDisclosureSheetContent';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';
import { CartelScannerSheetContent } from '@/features/chat/ui/CartelScannerSheetContent';
import { DailyLimitSheetContent } from '@/features/chat/ui/DailyLimitSheetContent';
import { MessageContextMenuSheetContent } from '@/features/chat/ui/MessageContextMenuSheetContent';
import { VisitSummarySheetContent } from '@/features/chat/ui/VisitSummarySheetContent';
import { VoiceSessionIntroSheetContent } from '@/features/chat/ui/VoiceSessionIntroSheetContent';
import { InAppBrowserSheetContent } from './LazyInAppBrowserSheetContent';

/** Strictly typed i18n key — narrows `t()` calls inside the router. */
export type TranslationKey = ParseKeys;

/**
 * Identifiers for the sheets the chat surface can route to. Adding a new sheet
 * means: extend this union, declare its params in `BottomSheetRouteParams`,
 * and register a `BottomSheetRouteDefinition` entry under `ROUTES`.
 *
 * See `docs/chat-ux-refonte/specs/C4.md` §2.3.
 */
export type BottomSheetRouteId =
  | 'browser'
  | 'context-menu'
  | 'consent'
  | 'summary'
  | 'daily-limit'
  | 'voice-intro'
  | 'ai-disclosure'
  | 'attachment-picker'
  | 'cartel-scanner';

export interface BottomSheetRouteParams {
  browser: { url: string };
  'context-menu': {
    message: ChatUiMessage;
    onCopy?: (message: ChatUiMessage) => void;
    onShare?: (message: ChatUiMessage) => void;
    onReport?: (messageId: string) => void;
  };
  consent: {
    onAccept?: (grantedScopes?: readonly ThirdPartyAiScope[]) => void;
    onPrivacy?: () => void;
  };
  summary: { summary: VisitSummary };
  'daily-limit': { onDismiss?: () => void };
  'voice-intro': { locale: string; onAcknowledge?: () => void };
  'ai-disclosure': { onLearnMore?: () => void };
  'attachment-picker': {
    recordedAudioUri: string | null;
    isPlayingAudio: boolean;
    isRecording: boolean;
    onPickImage: () => void;
    onTakePicture: () => void;
    toggleRecording: () => Promise<void> | void;
    playRecordedAudio: () => Promise<void> | void;
    clearMedia: () => void;
    onOpenScanner: () => void;
  };
  'cartel-scanner': {
    /**
     * W3 (T5.2) — invoked with either a sanitised alphanum cartel code
     * (`string`) OR a parsed Musaium deeplink (`MusaiumDeeplink`). The caller
     * narrows on `typeof payload === 'string'` to dispatch to the legacy
     * lookup-template flow vs the W3 session-context propagation.
     */
    onScanned: (payload: string | MusaiumDeeplink) => void;
  };
}

export interface BottomSheetRouteDefinition<K extends BottomSheetRouteId> {
  readonly id: K;
  /**
   * `sheet` = slide-up from bottom, swipe-down to dismiss.
   * `fullscreen` = slide-up taking full screen (WebView, consent, voice-intro).
   * `card` = centered card (summary, daily-limit).
   */
  readonly presentation: 'sheet' | 'fullscreen' | 'card';
  /**
   * When `true`: backdrop tap, swipe-down, and Android back DO NOT close.
   * Only the primary CTA inside the content can close.
   */
  readonly blocking: boolean;
  /** i18n key for `AccessibilityInfo.announceForAccessibility` on mount. */
  readonly a11yAnnounceKey: TranslationKey;
  /** Function rendering the route content. Receives params + close handle. */
  readonly Content: React.FC<BottomSheetRouteParams[K] & { close: () => void }>;
}

/**
 * Registry of route definitions. Entries are populated as each *SheetContent
 * component is migrated (C4 T2 → T7). The router reads this map at runtime to
 * resolve `ROUTES[activeRoute].Content`.
 *
 * Mutable on purpose: test harnesses replace entries in `beforeEach`.
 */
type RoutesMap = {
  [K in BottomSheetRouteId]?: BottomSheetRouteDefinition<K>;
};

export const ROUTES: RoutesMap = {
  browser: {
    id: 'browser',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.browser.opened',
    Content: InAppBrowserSheetContent,
  },
  'context-menu': {
    id: 'context-menu',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.contextMenu.opened',
    Content: MessageContextMenuSheetContent,
  },
  consent: {
    id: 'consent',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.consent.opened',
    Content: AiConsentSheetContent,
  },
  summary: {
    id: 'summary',
    presentation: 'card',
    blocking: false,
    a11yAnnounceKey: 'a11y.summary.opened',
    Content: VisitSummarySheetContent,
  },
  'daily-limit': {
    id: 'daily-limit',
    presentation: 'card',
    blocking: true,
    a11yAnnounceKey: 'a11y.dailyLimit.opened',
    Content: DailyLimitSheetContent,
  },
  'voice-intro': {
    id: 'voice-intro',
    presentation: 'fullscreen',
    blocking: true,
    a11yAnnounceKey: 'a11y.voiceIntro.opened',
    Content: VoiceSessionIntroSheetContent,
  },
  'ai-disclosure': {
    id: 'ai-disclosure',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.aiDisclosure.opened',
    Content: AiDisclosureSheetContent,
  },
  'attachment-picker': {
    id: 'attachment-picker',
    presentation: 'sheet',
    blocking: false,
    a11yAnnounceKey: 'a11y.attachmentPicker.opened',
    Content: AttachmentPickerSheetContent,
  },
  'cartel-scanner': {
    id: 'cartel-scanner',
    presentation: 'fullscreen',
    blocking: false,
    a11yAnnounceKey: 'a11y.cartelScanner.opened',
    Content: CartelScannerSheetContent,
  },
};
