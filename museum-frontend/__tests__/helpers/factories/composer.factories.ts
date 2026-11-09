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
