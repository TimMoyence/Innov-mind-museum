/**
 * A5 — Client-side status-phase state machine driving `<StatusIndicator>`.
 *
 * The phase displayed by `<StatusIndicator>` is a client-side simulation —
 * NOT a faithful reflection of BE pipeline state (the BE remains synchronous
 * and SSE is deprecated, so there is no live channel to push real phase
 * transitions). The hook ticks every `PHASE_TICK_MS` along the canonical
 * sequence and stops on `'composing'` until the response arrives. This
 * honest cosmetic signal is documented in spec §2.2 + §2.3.
 *
 * For the audit-truth phase, consumers read `metadata.phase` on the
 * response payload (`ChatAssistantMetadata.phase`, BE-owned).
 *
 * Spec : `docs/chat-ux-refonte/specs/A5.md` §1.2 (R10-R18) + §2.3 + AC6-AC10.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  PHASE_SEQUENCE_IMAGE,
  PHASE_SEQUENCE_TEXT,
  type ChatPipelinePhase,
} from '@/features/chat/application/phases';

/**
 * Default tick cadence (ms) between phase advances during the wait. 1200 ms
 * is the spec default (Q4 dispatcher decision 2026-05-14) — derived from
 * findings.md §2.2 P50 ~2.5 s end-to-end : two ticks land the user on
 * `'composing'` before the LLM dominates the remaining wait time. Editable
 * post-bake without a feature flag (doctrine `feedback_no_feature_flags_prelaunch`).
 */
export const PHASE_TICK_MS = 1200;

export interface UseStatusPhaseInput {
  /** Whether the assistant pipeline is currently producing a response. */
  readonly isSending: boolean;
  /** Whether the in-flight user message includes an image attachment. */
  readonly hasImage?: boolean;
  /**
   * Whether TTS synthesis is pending after the response arrived. When `true`
   * and `isSending` is `false`, the hook surfaces the `synthesizing-voice`
   * phase (R16 / AC10).
   */
  readonly ttsPending?: boolean;
}

export interface UseStatusPhaseResult {
  /**
   * The phase currently surfaced to the UI, or `null` when no status
   * should be rendered (silence-is-success — R17).
   */
  readonly phase: ChatPipelinePhase | null;
}

/**
 * Selects the active phase sequence based on whether the user attached an
 * image to the in-flight message.
 */
const sequenceFor = (hasImage: boolean): readonly ChatPipelinePhase[] =>
  hasImage ? PHASE_SEQUENCE_IMAGE : PHASE_SEQUENCE_TEXT;

/**
 * Pure reducer step — computes the next phase from the current step index
 * and the active sequence. Stays clamped on the last element of the
 * sequence (terminal-during-wait, R15).
 */
const advance = (
  step: number,
  sequence: readonly ChatPipelinePhase[],
): { step: number; phase: ChatPipelinePhase } => {
  const next = Math.min(step + 1, sequence.length - 1);
  // Safe-by-construction: clamped to `sequence.length - 1`, and every
  // sequence has at least 2 entries. TypeScript cannot prove non-undefined
  // through `Math.min`, so we narrow with a fallback to the last element.
  const phase = sequence[next] ?? sequence[sequence.length - 1];
  // `sequence` is `readonly [..., ChatPipelinePhase]` (non-empty by design),
  // but TS still types `phase` as `ChatPipelinePhase | undefined`. Defensive
  // assertion preserves type safety without a runtime cost.
  if (!phase) {
    throw new Error('phase sequence must not be empty');
  }
  return { step: next, phase };
};

/**
 * Hook that drives the visible status phase during message dispatch.
 *
 * - Mount-while-sending → initial phase = `analyzing-image` (image) or
 *   `searching-collection` (text).
 * - Every `PHASE_TICK_MS` advances along the sequence ; loops on
 *   `'composing'` after the last step.
 * - Response arrival = `isSending` flips back to `false`. If `ttsPending`
 *   is then `true`, the hook surfaces `'synthesizing-voice'` ; otherwise
 *   it returns `null`.
 */
export const useStatusPhase = ({
  isSending,
  hasImage = false,
  ttsPending = false,
}: UseStatusPhaseInput): UseStatusPhaseResult => {
  // Tick counter — increments on every `PHASE_TICK_MS` while `isSending` is
  // true. Each dispatch window owns its own counter via the functional
  // updater inside `setInterval` ; the `isSending`-keyed `useEffect` clears
  // the interval on close. The visible phase is derived from
  // `tick + isSending + hasImage + ttsPending` (no mirror-state in
  // `useEffect`, which dodges the React 19 "set-state-in-effect" diagnostic).
  //
  // Tick value while `isSending === false` is irrelevant — the memo below
  // does not read it on the closed path. When the next dispatch reopens
  // (`isSending` flips back to `true`), the interval below resets the tick
  // to 0 inside its first asynchronous callback, so the derived phase reads
  // the first sequence element until the first real tick arrives.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isSending) return undefined;
    // Schedule the next-tick reset to 0 asynchronously — this avoids the
    // "set-state-in-effect" pattern (React 19 / `react-hooks/set-state-in-effect`)
    // and keeps the first sequence element visible on mount until the first
    // PHASE_TICK_MS interval fires.
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, PHASE_TICK_MS);
    return () => {
      clearInterval(id);
      setTick(0);
    };
  }, [isSending]);

  const phase = useMemo<ChatPipelinePhase | null>(() => {
    if (isSending) {
      const sequence = sequenceFor(hasImage);
      const { phase: derived } = advance(tick - 1, sequence);
      // `advance(-1, …)` resolves to index 0 — the first phase in the
      // sequence — and subsequent ticks walk to the last index then clamp
      // there (R15 / AC8).
      return derived;
    }
    if (ttsPending) return 'synthesizing-voice';
    return null;
  }, [isSending, hasImage, ttsPending, tick]);

  return { phase };
};
