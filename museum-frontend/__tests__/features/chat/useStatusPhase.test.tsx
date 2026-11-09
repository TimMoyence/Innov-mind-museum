import React from 'react';
import { render, act } from '@testing-library/react-native';

import '../../helpers/test-utils';

import { useStatusPhase, PHASE_TICK_MS } from '@/features/chat/application/useStatusPhase';
import type { ChatPipelinePhase } from '@/features/chat/application/phases';

interface ProbeProps {
  isSending: boolean;
  hasImage?: boolean;
  ttsPending?: boolean;
  capture: (phase: ChatPipelinePhase | null) => void;
}

const Probe = ({ isSending, hasImage, ttsPending, capture }: ProbeProps) => {
  const { phase } = useStatusPhase({ isSending, hasImage, ttsPending });
  capture(phase);
  return null;
};

describe('useStatusPhase (A5)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('exports PHASE_TICK_MS as a positive number (default 1200 per spec §2.3)', () => {
    expect(typeof PHASE_TICK_MS).toBe('number');
    expect(PHASE_TICK_MS).toBeGreaterThan(0);
  });

  it('returns null when isSending=false (AC9)', () => {
    let latest: ChatPipelinePhase | null = 'analyzing-image';
    render(<Probe isSending={false} capture={(p) => (latest = p)} />);
    expect(latest).toBeNull();
  });

  it("returns 'searching-collection' initially for a text-only message (AC6)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={true} hasImage={false} capture={(p) => (latest = p)} />);
    expect(latest).toBe('searching-collection');
  });

  it("returns 'analyzing-image' initially for a message with an image (AC7)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={true} hasImage={true} capture={(p) => (latest = p)} />);
    expect(latest).toBe('analyzing-image');
  });

  it("advances text path to 'composing' after one PHASE_TICK_MS tick (AC8)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={true} hasImage={false} capture={(p) => (latest = p)} />);
    expect(latest).toBe('searching-collection');

    act(() => {
      jest.advanceTimersByTime(PHASE_TICK_MS);
    });
    expect(latest).toBe('composing');
  });

  it("stays on 'composing' after subsequent ticks (R15 — no advance past composing while waiting)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={true} hasImage={false} capture={(p) => (latest = p)} />);

    act(() => {
      jest.advanceTimersByTime(PHASE_TICK_MS);
    });
    expect(latest).toBe('composing');

    act(() => {
      jest.advanceTimersByTime(PHASE_TICK_MS * 3);
    });
    expect(latest).toBe('composing');
  });

  it("walks the image path 'analyzing-image' → 'searching-collection' → 'composing' (R15)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={true} hasImage={true} capture={(p) => (latest = p)} />);
    expect(latest).toBe('analyzing-image');

    act(() => {
      jest.advanceTimersByTime(PHASE_TICK_MS);
    });
    expect(latest).toBe('searching-collection');

    act(() => {
      jest.advanceTimersByTime(PHASE_TICK_MS);
    });
    expect(latest).toBe('composing');
  });

  it("returns 'synthesizing-voice' when TTS is pending and not sending (AC10, R16)", () => {
    let latest: ChatPipelinePhase | null = null;
    render(<Probe isSending={false} ttsPending={true} capture={(p) => (latest = p)} />);
    expect(latest).toBe('synthesizing-voice');
  });
});
