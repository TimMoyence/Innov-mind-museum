/**
 * RED tests — QA-03: attachment picker actions as a uniform WhatsApp-style grid.
 *
 * SUT: `museum-frontend/features/chat/ui/AttachmentPickerSheetContent.tsx`.
 *
 * Diagnostic (source of truth): `audit-state/2026-05-30-qa-manual/QA-NOTES.md`
 * §QA-03 — the picker actions currently render as variable-width PILLS
 * (`styles.actionButton`, AttachmentPickerSheetContent.tsx:248-257): a row of
 * `flexDirection:'row'` buttons with no `width`/`flex`/`flexBasis`, so each
 * tile's size tracks its text length (icon BESIDE the label). Tim wants a grid
 * of uniformly-sized tiles, WhatsApp-style: icon ABOVE the label, every tile
 * the same fixed size.
 *
 * Target invariant (asserted DISCRIMINATINGLY, without over-pinning the exact
 * mechanism), per action tile resolved via its preserved testID:
 *   (a) flexDirection === 'column'  (icon above label; currently 'row' → FAILS now)
 *   (b) a fixed cross-axis size      (width !== undefined OR flexBasis !== undefined;
 *                                     currently neither is set → FAILS now)
 *   (c) the label has textAlign === 'center' (avoid ragged multi-line labels)
 *   (d) the label sets numberOfLines (cap overflow to ~2 lines)
 *
 * Discrimination proof:
 *   - Before fix: actionButton is { flexDirection:'row', ...no width/flexBasis }
 *     → (a) sees 'row' (not 'column') → FAIL; (b) sees both undefined → FAIL;
 *     actionText has no textAlign → (c) FAIL; <Text> has no numberOfLines → (d) FAIL.
 *   - After fix (column tiles + fixed basis + centered/clamped label): all pass.
 *
 * Scope guard: this file only adds assertions on the grid layout invariant and
 * MUST NOT break the 3 existing AttachmentPicker test files (the testIDs and the
 * onPress+close wiring stay untouched by the fix).
 *
 * lib-docs: react-native StyleSheet.flatten resolves the `style={[base, dyn]}`
 * array the component passes to each <Pressable>; we assert on the flattened
 * observable style object, never on private internals.
 */
import type React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import '../helpers/test-utils';
import { AttachmentPickerSheetContent } from '@/features/chat/ui/AttachmentPickerSheetContent';

// `onCompareImage` is an optional prop (Cycle D, Option C). Providing it surfaces
// all 5 actions so the grid invariant is exercised across the full set.
type SheetProps = React.ComponentProps<typeof AttachmentPickerSheetContent> & {
  onCompareImage?: () => void;
};

const ACTION_TEST_IDS = [
  'attachment-picker-camera',
  'attachment-picker-gallery',
  'attachment-picker-record',
  'attachment-picker-scan-cartel',
  'attachment-picker-compare',
] as const;

describe('AttachmentPickerSheetContent — uniform grid layout (QA-03)', () => {
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
    close: jest.fn(),
  };

  const renderSheet = () => {
    const props: SheetProps = { ...baseProps, onCompareImage: jest.fn() };
    return render(<AttachmentPickerSheetContent {...props} />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(ACTION_TEST_IDS)(
    'lays out "%s" as a column tile (icon above label, not a row pill)',
    (testId) => {
      renderSheet();
      const tile = screen.getByTestId(testId);
      const style = StyleSheet.flatten(tile.props.style) as Record<string, unknown>;
      // (a) WhatsApp-style stacking: icon ABOVE label. Currently 'row' → FAILS.
      expect(style.flexDirection).toBe('column');
    },
  );

  it.each(ACTION_TEST_IDS)(
    'gives "%s" a fixed cross-axis size so all tiles are uniform',
    (testId) => {
      renderSheet();
      const tile = screen.getByTestId(testId);
      const style = StyleSheet.flatten(tile.props.style) as Record<string, unknown>;
      // (b) uniform tiles need a fixed width OR flexBasis (e.g. ~30% for 3 cols).
      // Currently neither is set (size tracks text) → FAILS.
      const hasFixedSize = style.width !== undefined || style.flexBasis !== undefined;
      expect(hasFixedSize).toBe(true);
    },
  );

  it('centers each action label and clamps it to avoid overflow', () => {
    renderSheet();
    // The label <Text> carries the i18n key as its child (test-utils `t` mock
    // returns the key verbatim). We read the rendered <Text> node for each action
    // by its localized label key and assert its style + numberOfLines.
    const labelKeys = [
      'chat.attachmentPicker.camera',
      'chat.attachmentPicker.gallery',
      'chat.attachmentPicker.record_audio',
      'chat.attachmentPicker.scan_cartel',
      'chat.attachmentPicker.compare',
    ];
    for (const key of labelKeys) {
      const label = screen.getByText(key);
      const labelStyle = StyleSheet.flatten(label.props.style) as Record<string, unknown>;
      // (c) center the label so single- and multi-line labels read uniformly.
      // Currently actionText has no textAlign → FAILS.
      expect(labelStyle.textAlign).toBe('center');
      // (d) clamp overflow to keep tiles uniform-height. Currently unset → FAILS.
      expect(label.props.numberOfLines).toBeGreaterThanOrEqual(1);
      expect(label.props.numberOfLines).toBeLessThanOrEqual(2);
    }
  });
});
