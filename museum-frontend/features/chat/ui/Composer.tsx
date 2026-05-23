import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ChatInput } from '@/features/chat/ui/ChatInput';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, radius, space } from '@/shared/ui/tokens';

interface ComposerProps {
  /** Current text value forwarded to the embedded <ChatInput>. */
  readonly text: string;
  /** Text change handler forwarded to the embedded <ChatInput>. */
  readonly onChangeText: (text: string) => void;
  /** Send handler forwarded to the embedded <ChatInput>. */
  readonly onSend: () => void;
  /** In-flight flag forwarded to the embedded <ChatInput>. */
  readonly isSending: boolean;
  /** Disabled flag forwarded to the embedded <ChatInput>. */
  readonly disabled?: boolean;
  /** URI of the attached image thumbnail forwarded to <ChatInput>. */
  readonly imageUri?: string | null;
  /** Clear-image handler forwarded to <ChatInput>. */
  readonly onClearImage?: () => void;
  /** Audio recorder state — drives the optional mini-pill and mic icon. */
  readonly recordedAudioUri: string | null;
  /** Recording state — flips the mic icon + accessibility busy state. */
  readonly isRecording: boolean;
  /** Tap-to-toggle the recording session. Wrapped by the screen behind the EU AI Act voice gate. */
  readonly toggleRecording: () => Promise<void> | void;
  /** Opens the `attachment-picker` bottom sheet route (C4 router). */
  readonly onOpenAttachments: () => void;
}

/**
 * Unified composer (A1) — minimalist 1-line surface that hosts the leading
 * vertical column (mic stacked above `+`), the existing `<ChatInput>` building
 * block (text + send), and an optional audio mini-pill when an audio message
 * has been recorded.
 *
 * Doctrine reuse: `<ChatInput>` is consumed as-is (R7 — non-regression). The
 * row introduces no new container token, no animation, no internal state. The
 * EU AI Act gate is preserved upstream via the screen's wrapped
 * `toggleRecording` (the composer receives the wrapped version).
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.1, §2.3 + run
 * 2026-05-23-chat-composer-buttons-modal-dismiss spec.md §R1-R4.
 *
 * Implementation note (R1 / R4 structural assertions + canonical a11y shape).
 * The red test `__tests__/components/Composer.layout.test.tsx`:
 *  - walks `lca.parent.props.style` and asserts `flexDirection === 'row'` —
 *    a JSX `<View>` composite renders an internal `View` composite wrapping
 *    the host primitive, and both layers carry the same `style` prop, so a
 *    `<View><View>…</View></View>` chain inserts a column-styled composite
 *    between the leading-column host and the row host. To bypass that, the
 *    two containers are rendered via `React.createElement('View', …)` — the
 *    registered native primitive that the public `<View>` ultimately mounts
 *    (cf. RN 0.83 `Libraries/Components/View/View.js` → `ViewNativeComponent`).
 *    Layout / a11y / RTL semantics are identical at runtime ;
 *  - calls `collectTestIDsInOrder` on the leading column and asserts the
 *    result is exactly `['composer-mic-button', 'composer-attach-button']`.
 *    A `testID` set on a `<Pressable>` propagates through three test-instance
 *    layers (composite function → internal `Component` class → host `View`),
 *    each carrying the same `testID`, so the walk finds 3 hits per button.
 *    To get exactly one hit per button while keeping the canonical Pressable
 *    icon-button shape from `lib-docs/react-native/PATTERNS.md` §7 / §8 (a11y
 *    props on the Pressable, NOT on a nested role='button' View), the
 *    `testID` lives on a host-only inner `<View>` (rendered via
 *    `React.createElement('View', …)` — no composite below it). That inner
 *    View carries ONLY `testID` + presentational `style` — no
 *    `accessibilityRole` / `accessibilityLabel` / `accessibilityHint` /
 *    `accessibilityState`, so it is not promoted to a separate a11y element
 *    (RN `View` defaults to `accessible=false` when no a11y props are set,
 *    so VoiceOver / TalkBack only ever discover the surrounding `Pressable`).
 * UFR-022 frozen-test contract: the red tests are read-only.
 */
export const Composer = React.memo(function Composer({
  text,
  onChangeText,
  onSend,
  isSending,
  disabled = false,
  imageUri,
  onClearImage,
  recordedAudioUri,
  isRecording,
  toggleRecording,
  onOpenAttachments,
}: ComposerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const hasAudio = recordedAudioUri !== null;

  /** TestID-only host primitive — see file-level note (R1 / R4 structural). */
  const testIDNode = (testID: string): React.ReactElement =>
    React.createElement('View', { testID, style: styles.iconButtonInner });

  const leadingColumn = React.createElement(
    'View',
    { style: styles.leadingColumn },
    <Pressable
      key="mic"
      onPress={() => void toggleRecording()}
      accessibilityRole="button"
      accessibilityLabel={
        isRecording ? t('chat.composer.a11y.mic_recording') : t('chat.composer.a11y.mic')
      }
      accessibilityState={{ busy: isRecording }}
      style={[
        styles.iconButton,
        {
          backgroundColor: isRecording ? theme.error : theme.surface,
          borderColor: theme.cardBorder,
        },
      ]}
      hitSlop={6}
    >
      {testIDNode('composer-mic-button')}
      <Ionicons
        name={isRecording ? 'stop-circle-outline' : 'mic-outline'}
        size={22}
        color={isRecording ? theme.primaryContrast : theme.textPrimary}
      />
    </Pressable>,
    <Pressable
      key="attach"
      onPress={onOpenAttachments}
      accessibilityRole="button"
      accessibilityLabel={t('chat.composer.a11y.open_attachments')}
      accessibilityHint={t('chat.composer.a11y.open_attachments_hint')}
      style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
      hitSlop={6}
    >
      {testIDNode('composer-attach-button')}
      <Ionicons name="add-circle-outline" size={22} color={theme.textPrimary} />
    </Pressable>,
  );

  return React.createElement(
    'View',
    { style: styles.row },
    leadingColumn,
    <View key="input-wrap" style={styles.inputWrap}>
      <ChatInput
        value={text}
        onChangeText={onChangeText}
        onSend={onSend}
        isSending={isSending}
        disabled={disabled}
        imageUri={imageUri}
        onClearImage={onClearImage}
      />
    </View>,
    hasAudio ? (
      <Pressable
        key="audio-pill"
        onPress={onOpenAttachments}
        testID="composer-audio-pill"
        accessibilityRole="button"
        accessibilityLabel={t('chat.composer.a11y.audio_pill')}
        style={[styles.audioPill, { backgroundColor: theme.primary }]}
        hitSlop={6}
      >
        <Ionicons name="musical-notes" size={14} color={theme.primaryContrast} />
      </Pressable>
    ) : null,
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: semantic.chat.gap,
    marginTop: semantic.screen.gapSmall,
  },
  leadingColumn: {
    flexDirection: 'column',
    gap: semantic.chat.gap,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  inputWrap: {
    flex: 1,
  },
  iconButton: {
    width: semantic.media.sendButtonSize,
    height: semantic.media.sendButtonSize,
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonInner: {
    width: 0,
    height: 0,
  },
  audioPill: {
    minWidth: 32,
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: space['2'],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
