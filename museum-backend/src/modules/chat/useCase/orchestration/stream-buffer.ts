import {
  normalize,
  hasInsultSignal,
  hasPromptInjectionSignal,
  buildGuardrailRefusal,
} from '@modules/chat/useCase/guardrail/art-topic-guardrail';

import type { GuardrailBlockReason } from '@modules/chat/useCase/guardrail/art-topic-guardrail';
import type { ArtTopicClassifierPort } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';

interface StreamBufferOptions {
  classifier?: ArtTopicClassifierPort;
  tokenThreshold?: number;
  releaseIntervalMs?: number;
  classifierTimeoutMs?: number;
  onGuardrail?: (text: string, reason: GuardrailBlockReason) => void;
  locale?: string;
  signal?: AbortSignal;
}

type Phase = 'buffering' | 'draining' | 'blocked' | 'done';

const META_MARKER = '\n[META]';
const META_MARKER_NO_NEWLINE = '[META]';

/**
 * Two-phase: (1) buffer + classify in parallel (nothing released); (2) drain
 * at steady interval for smooth typing UX, new tokens still accumulate.
 */
export class StreamBuffer {
  private readonly classifier?: ArtTopicClassifierPort;
  private readonly tokenThreshold: number;
  private readonly releaseIntervalMs: number;
  private readonly classifierTimeoutMs: number;
  private readonly onGuardrailCb?: (text: string, reason: GuardrailBlockReason) => void;
  private readonly locale?: string;
  private readonly signal?: AbortSignal;

  private phase: Phase = 'buffering';
  private readonly queue: string[] = [];
  private tokenCount = 0;
  private metaDetected = false;
  private streamFinished = false;
  private releaseCb?: (text: string) => void;
  private drainTimer?: ReturnType<typeof setInterval>;
  private classifierRunning = false;

  private phase1Resolve?: () => void;
  private readonly phase1Promise: Promise<void>;

  private doneResolve?: () => void;
  private readonly donePromise: Promise<void>;

  constructor(opts?: StreamBufferOptions) {
    this.classifier = opts?.classifier;
    // 20 tokens — classifier needs ~1-2 sentences; 100 produced 3-5s wall.
    this.tokenThreshold = opts?.tokenThreshold ?? 20;
    // Aligned with frontend FLUSH_INTERVAL_MS=30 (avoids beat-freq stutter).
    this.releaseIntervalMs = opts?.releaseIntervalMs ?? 30;
    this.classifierTimeoutMs = opts?.classifierTimeoutMs ?? 1500;
    this.onGuardrailCb = opts?.onGuardrail;
    this.locale = opts?.locale;
    this.signal = opts?.signal;

    this.phase1Promise = new Promise<void>((resolve) => {
      this.phase1Resolve = resolve;
    });

    this.donePromise = new Promise<void>((resolve) => {
      this.doneResolve = resolve;
    });

    if (this.signal) {
      this.signal.addEventListener(
        'abort',
        () => {
          this.handleAbort();
        },
        { once: true },
      );
    }
  }

  onRelease(cb: (text: string) => void): void {
    this.releaseCb = cb;
  }

  push(chunk: string): void {
    if (this.phase === 'blocked' || this.phase === 'done') return;
    if (this.metaDetected) return; // ignore everything after [META]

    const accumulated = this.queue.join('') + chunk;
    let metaIdx = accumulated.indexOf(META_MARKER);
    if (metaIdx === -1) metaIdx = accumulated.indexOf(META_MARKER_NO_NEWLINE);

    if (metaIdx !== -1) {
      this.queue.length = 0;
      const answerText = accumulated.slice(0, metaIdx);
      if (answerText) {
        this.queue.push(answerText);
      }
      this.metaDetected = true;
      this.tokenCount = this.queue.length;

      if (this.phase === 'buffering' && !this.classifierRunning) {
        this.triggerClassifier();
      }
      return;
    }

    this.queue.push(chunk);
    this.tokenCount++;

    // Incremental guardrail on accumulated text.
    const fullText = this.queue.join('');
    const normalizedText = normalize(fullText);

    if (hasInsultSignal(normalizedText)) {
      this.block('insult');
      return;
    }
    if (hasPromptInjectionSignal(normalizedText)) {
      this.block('prompt_injection');
      return;
    }

    if (
      this.phase === 'buffering' &&
      !this.classifierRunning &&
      this.tokenCount >= this.tokenThreshold
    ) {
      this.triggerClassifier();
    }
  }

  finish(): void {
    this.streamFinished = true;

    if (this.phase === 'buffering' && !this.classifierRunning) {
      this.triggerClassifier();
    }

    if (this.phase === 'draining' && this.queue.length === 0) {
      this.setDone();
    }
  }

  async awaitPhase1(): Promise<void> {
    await this.phase1Promise;
  }

  async awaitDone(): Promise<void> {
    await this.donePromise;
  }

  isDone(): boolean {
    return this.phase === 'done' || this.phase === 'blocked';
  }

  destroy(): void {
    if (this.drainTimer !== undefined) {
      clearInterval(this.drainTimer);
      this.drainTimer = undefined;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────

  private block(reason: GuardrailBlockReason): void {
    this.phase = 'blocked';
    const refusalText = buildGuardrailRefusal(this.locale, reason);
    this.onGuardrailCb?.(refusalText, reason);
    this.phase1Resolve?.();
    this.phase1Resolve = undefined;
    this.doneResolve?.();
    this.doneResolve = undefined;
  }

  private triggerClassifier(): void {
    if (!this.classifier) {
      this.startDraining();
      return;
    }

    this.classifierRunning = true;
    const text = this.queue.join('');

    let timeoutHandle: ReturnType<typeof setTimeout>;

    const classifierResult = Promise.race([
      this.classifier.isArtRelated(text),
      new Promise<boolean>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('classifier_timeout'));
        }, this.classifierTimeoutMs);
      }),
    ]);

    void classifierResult
      .then((isArt) => {
        if (this.phase !== 'buffering') return;
        if (!isArt) {
          this.block('off_topic');
          return;
        }
        this.startDraining();
      })
      .catch(() => {
        // Fail-open: error/timeout → drain.
        if (this.phase === 'buffering') {
          this.startDraining();
        }
      })
      .finally(() => {
        clearTimeout(timeoutHandle);
        this.classifierRunning = false;
      });
  }

  private startDraining(): void {
    this.phase = 'draining';
    this.phase1Resolve?.();
    this.phase1Resolve = undefined;

    this.drainTimer = setInterval(() => {
      if (this.signal?.aborted) {
        this.handleAbort();
        return;
      }

      if (this.queue.length > 0) {
        const token = this.queue.shift();
        // eslint-disable-next-line security/detect-possible-timing-attacks -- defensive non-undefined check on shift() result, not a secret comparison
        if (token !== undefined) {
          this.releaseCb?.(token);
        }
      }

      if (this.queue.length === 0 && (this.streamFinished || this.metaDetected)) {
        this.setDone();
      }
    }, this.releaseIntervalMs);
  }

  private handleAbort(): void {
    this.setDone();
  }

  private setDone(): void {
    this.phase = 'done';
    this.destroy();
    this.phase1Resolve?.();
    this.phase1Resolve = undefined;
    this.doneResolve?.();
    this.doneResolve = undefined;
  }
}
