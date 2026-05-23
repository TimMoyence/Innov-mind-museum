/**
 * Factories for the `<Composer>` (museum-frontend/features/chat/ui/Composer.tsx).
 *
 * Tests MUST NOT inline-construct Composer props (ESLint plugin
 * `musaium-test-discipline` enforces). Use `makeComposerProps()` + spread
 * overrides.
 *
 * Run: 2026-05-23-chat-composer-buttons-modal-dismiss (UFR-022 red phase).
 */

/** Minimal Composer prop bag. Mirrors `ComposerProps` shape in Composer.tsx. */
export interface ComposerTestProps {
  text: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
  imageUri?: string | null;
  onClearImage?: () => void;
  recordedAudioUri: string | null;
  isRecording: boolean;
  toggleRecording: () => Promise<void> | void;
  onOpenAttachments: () => void;
}

/** Creates a baseline Composer prop bag with jest mocks for handlers. */
export const makeComposerProps = (overrides?: Partial<ComposerTestProps>): ComposerTestProps => ({
  text: '',
  onChangeText: jest.fn(),
  onSend: jest.fn(),
  isSending: false,
  disabled: false,
  imageUri: null,
  onClearImage: jest.fn(),
  recordedAudioUri: null,
  isRecording: false,
  toggleRecording: jest.fn().mockResolvedValue(undefined),
  onOpenAttachments: jest.fn(),
  ...overrides,
});
