import type { ChatUiMessage } from '@/features/chat/application/useChatSession';
import type { VisitSummary } from '@/features/chat/application/chatSessionLogic.pure';
import { InAppBrowser } from '@/shared/ui/InAppBrowser';
import { AiConsentModal } from './AiConsentModal';
import { DailyLimitModal } from './DailyLimitModal';
import { MessageContextMenu } from './MessageContextMenu';
import { VisitSummaryModal } from './VisitSummaryModal';

interface ChatSessionModalsProps {
  // In-app browser
  browserUrl: string | null;
  onCloseBrowser: () => void;

  // Long-press context menu
  contextMenuMessage: ChatUiMessage | null;
  onCloseContextMenu: () => void;
  onCopyMessage: (message: ChatUiMessage) => void;
  onShareMessage: (message: ChatUiMessage) => void;
  onReportMessage: (messageId: string) => void;

  // AI consent gate
  showAiConsent: boolean;
  onAcceptAiConsent: () => void;
  onOpenPrivacy: () => void;

  // Visit summary
  showSummary: boolean;
  visitSummary: VisitSummary;
  onCloseSummary: () => void;

  // Daily-limit hard stop
  dailyLimitReached: boolean;
  onDismissDailyLimit: () => void;
}

/**
 * Cluster of overlay components rendered on top of the chat session screen.
 * Pulled out of `app/(stack)/chat/[sessionId].tsx` so the screen file stays
 * focused on layout + state wiring; each modal is independently testable.
 */
export const ChatSessionModals = (props: ChatSessionModalsProps) => (
  <>
    <InAppBrowser url={props.browserUrl} onClose={props.onCloseBrowser} />

    <MessageContextMenu
      message={props.contextMenuMessage}
      onCopy={props.onCopyMessage}
      onShare={props.onShareMessage}
      onReport={props.onReportMessage}
      onClose={props.onCloseContextMenu}
    />

    <AiConsentModal
      visible={props.showAiConsent}
      onAccept={props.onAcceptAiConsent}
      onPrivacy={props.onOpenPrivacy}
    />

    <VisitSummaryModal
      visible={props.showSummary}
      summary={props.visitSummary}
      onClose={props.onCloseSummary}
    />

    <DailyLimitModal visible={props.dailyLimitReached} onDismiss={props.onDismissDailyLimit} />
  </>
);
