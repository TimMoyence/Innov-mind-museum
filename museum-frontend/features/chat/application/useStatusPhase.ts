import { useEffect, useMemo, useState } from 'react';

import {
  PHASE_SEQUENCE_IMAGE,
  PHASE_SEQUENCE_TEXT,
  type ChatPipelinePhase,
} from '@/features/chat/application/phases';

export const PHASE_TICK_MS = 1200;

export interface UseStatusPhaseInput {
  readonly isSending: boolean;
  readonly hasImage?: boolean;
  readonly ttsPending?: boolean;
}

export interface UseStatusPhaseResult {
  readonly phase: ChatPipelinePhase | null;
}

const sequenceFor = (hasImage: boolean): readonly ChatPipelinePhase[] =>
  hasImage ? PHASE_SEQUENCE_IMAGE : PHASE_SEQUENCE_TEXT;

const advance = (
  step: number,
  sequence: readonly ChatPipelinePhase[],
): { step: number; phase: ChatPipelinePhase } => {
  const next = Math.min(step + 1, sequence.length - 1);
  const phase = sequence[next] ?? sequence[sequence.length - 1];
  if (!phase) {
    throw new Error('phase sequence must not be empty');
  }
  return { step: next, phase };
};

export const useStatusPhase = ({
  isSending,
  hasImage = false,
  ttsPending = false,
}: UseStatusPhaseInput): UseStatusPhaseResult => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isSending) return undefined;
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
      return derived;
    }
    if (ttsPending) return 'synthesizing-voice';
    return null;
  }, [isSending, hasImage, ttsPending, tick]);

  return { phase };
};
