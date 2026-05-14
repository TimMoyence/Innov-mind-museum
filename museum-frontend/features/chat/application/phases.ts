/**
 * A5 — Chat pipeline phase taxonomy (FE side).
 *
 * The union below MUST stay in EXACT lockstep with the BE
 * `ChatPipelinePhase` declared in
 * `museum-backend/src/modules/chat/domain/chat.types.ts`. The drift catcher
 * lives in `__tests__/components/StatusIndicator.test.tsx` ("AC5 parity").
 *
 * Spec : `docs/chat-ux-refonte/specs/A5.md` §1.1 R7 + §2.3.
 */

export type ChatPipelinePhase =
  | 'analyzing-image'
  | 'searching-collection'
  | 'composing'
  | 'synthesizing-voice'
  | 'done';

/**
 * Maps each phase to its i18n key under `chat.status.*`. The `'done'` phase
 * maps to the empty string — it is NEVER rendered (silence-is-success,
 * spec R17). Component code asserts `phase !== 'done'` before reading this
 * map.
 *
 * Value type is a literal union so `t(PHASE_I18N_KEY[phase])` keeps the
 * typed-i18n contract (`useTranslation()` rejects raw `string` keys).
 */
export const PHASE_I18N_KEY = {
  'analyzing-image': 'chat.status.analyzing-image',
  'searching-collection': 'chat.status.searching-collection',
  composing: 'chat.status.composing',
  'synthesizing-voice': 'chat.status.synthesizing-voice',
  done: '',
} as const satisfies Record<ChatPipelinePhase, string>;

/**
 * Canonical sequence followed by `useStatusPhase` while waiting for a
 * text-only response. The hook ticks once per `PHASE_TICK_MS`. After
 * reaching the last element (`composing`), it stays there until the
 * response arrives — R15 ("no advance past composing while waiting").
 */
export const PHASE_SEQUENCE_TEXT: readonly ChatPipelinePhase[] = [
  'searching-collection',
  'composing',
] as const;

/**
 * Canonical sequence followed by `useStatusPhase` when the user attached
 * an image. Same terminal behaviour as `PHASE_SEQUENCE_TEXT` — loops on
 * `composing` until the response arrives (R15).
 */
export const PHASE_SEQUENCE_IMAGE: readonly ChatPipelinePhase[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
] as const;
