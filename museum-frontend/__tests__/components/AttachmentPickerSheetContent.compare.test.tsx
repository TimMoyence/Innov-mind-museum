/**
 * RED tests — D-wiring D-01 (déclencheur Option C).
 *
 * SUT: `museum-frontend/features/chat/ui/AttachmentPickerSheetContent.tsx`.
 *
 * Contrat cible (spec-cycleD-wiring-amendment.md §"Contrat de wiring" pt.1 ;
 * design-cycleD.md §6 :169-170) — Option C tranchée 2026-05-26 :
 *   Le sheet d'attachement existant DOIT exposer une action explicite
 *   « Comparer cette œuvre » (PNG/Ionicons, jamais emoji — gotcha CLAUDE.md).
 *   Au tap, le sheet invoke la prop `onCompareImage` (le handler écran qui
 *   branche `useCompareImage`) PUIS ferme le sheet (parité camera/gallery).
 *
 * État actuel (vérifié `AttachmentPickerSheetContent.tsx` 2026-05-27) :
 *   le composant n'expose NI la prop `onCompareImage` NI un testID
 *   `attachment-picker-compare`. `useCompareImage` est dead code (aucun
 *   consommateur hors son test) → l'action n'existe pas → ces tests ÉCHOUENT.
 *
 * lib-docs: react/PATTERNS.md:113 (key list items / observable assertions),
 * react/PATTERNS.md:152 (assert observable, never private internals).
 */
import type React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

// The compare action is a new prop on the sheet (Option C). The TS surface
// does not declare it yet, so we cast through `Record<string, unknown>` when
// spreading — the RED failure is the missing testID / un-invoked callback at
// runtime, not a compile error that would hide which assertion failed.
type SheetProps = React.ComponentProps<typeof AttachmentPickerSheetContent> & {
  onCompareImage?: () => void;
};

describe('AttachmentPickerSheetContent — compare action (D-01, Option C)', () => {
  const onCompareImage = jest.fn();
  const close = jest.fn();

  const baseProps = {
    recordedAudioUri: null as string | null,
    isPlayingAudio: false,
    isRecording: false,
    onPickImage: jest.fn(),
    onTakePicture: jest.fn(),
    toggleRecording: jest.fn().mockResolvedValue(undefined),
    playRecordedAudio: jest.fn().mockResolvedValue(undefined),
    clearMedia: jest.fn(),
    onOpenScanner: jest.fn(),
    close,
  };

  const renderSheet = () => {
    const props: SheetProps = { ...baseProps, onCompareImage };
    return render(<AttachmentPickerSheetContent {...props} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a "compare" action with an accessible label (D-01 déclencheur)', () => {
    renderSheet();
    const compare = screen.getByTestId('attachment-picker-compare');
    expect(compare).toBeTruthy();
    // Label keyed off i18n — the test-utils mock returns the key verbatim, so
    // we assert the action carries a non-empty localized label, not raw text.
    expect(compare.props.accessibilityLabel).toBe('chat.attachmentPicker.compare');
  });

  it('invokes onCompareImage AND close when the compare action is pressed (D-01 wiring entry point)', () => {
    renderSheet();
    fireEvent.press(screen.getByTestId('attachment-picker-compare'));
    expect(onCompareImage).toHaveBeenCalledTimes(1);
    // Parité camera/gallery (AttachmentPickerSheetContent.tsx:76-97): the sheet
    // closes itself once the action is dispatched.
    expect(close).toHaveBeenCalledTimes(1);
  });
});
