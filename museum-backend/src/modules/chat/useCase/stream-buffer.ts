import {
  normalize,
  hasInsultSignal,
  hasPromptInjectionSignal,
  buildGuardrailRefusal,
} from './art-topic-guardrail';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { ArtTopicClassifierPort } from './guardrail-evaluation.service';

/** Configuration options for the StreamBuffer. */
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
 * Two-phase jitter buffer for LLM token streaming.
 *
 * **Phase 1 (buffering):** Tokens accumulate while an optional art-topic
 * classifier runs in parallel. Nothing is released to the client.
 *
 * **Phase 2 (draining):** Tokens are released at a steady interval for
 * smooth typing UX. New tokens continue to accumulate via `push()`.
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
    // Reduced from 100→20 tokens (Sprint D micro-buffering fix): the classifier
    // only needs ~1-2 sentences to decide, and waiting for 100 tokens produced a
    // visible 3-5s "wall of text" delay before the first token reached the user.
    // With 20 tokens, the initial delay drops to ~500ms.
    this.tokenThreshold = opts?.tokenThreshold ?? 20;
    // Aligned with frontend FLUSH_INTERVAL_MS (30ms) to eliminate a beat-frequency
    // stutter between backend release rate and frontend flush rate.
    this.releaseIntervalMs = opts?.releaseIntervalMs ?? 30;
    // Fail-open faster (1.5s vs 3s) to avoid prolonging the initial wait.
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

  /** Register the callback invoked each time a token is released in phase 2. */
  onRelease(cb: (text: string) => void): void {
    this.releaseCb = cb;
  }

  /**
   * Receive a token chunk from the LLM stream.
   * During phase 1 the token is queued; during phase 2 it is appended to the drain queue.
   */
  push(chunk: string): void {
    if (this.phase === 'blocked' || this.phase === 'done') return;
    if (this.metaDetected) return; // ignore everything after [META]

    // Check for [META] marker in accumulated text + new chunk
    const accumulated = this.queue.join('') + chunk;
    let metaIdx = accumulated.indexOf(META_MARKER);
    if (metaIdx === -1) metaIdx = accumulated.indexOf(META_MARKER_NO_NEWLINE);

    if (metaIdx !== -1) {
      // Keep only the answer text before [META]
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

    // Incremental guardrail: check for insults/injections on accumulated text
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

    // Check if we should run the classifier
    if (
      this.phase === 'buffering' &&
      !this.classifierRunning &&
      this.tokenCount >= this.tokenThreshold
    ) {
      this.triggerClassifier();
    }
  }

  /** Signal that the LLM stream is complete. */
  finish(): void {
    this.streamFinished = true;

    if (this.phase === 'buffering' && !this.classifierRunning) {
      this.triggerClassifier();
    }

    // If already draining and queue is empty, we're done
    if (this.phase === 'draining' && this.queue.length === 0) {
      this.setDone();
    }
  }

  /** Wait for phase 1 to complete (for callers that need to await it). */
  async awaitPhase1(): Promise<void> {
    await this.phase1Promise;
  }

  /** Wait for the buffer to finish draining or be blocked. */
  async awaitDone(): Promise<void> {
    await this.donePromise;
  }

  /** True when draining is complete or the buffer was blocked. */
  isDone(): boolean {
    return this.phase === 'done' || this.phase === 'blocked';
  }

  /** Cleanup timers and abort listener. */
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
      // No classifier — skip straight to draining
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
        if (this.phase !== 'buffering') return; // already blocked/done

        if (!isArt) {
          this.block('off_topic');
          return;
        }

        this.startDraining();
      })
      .catch(() => {
        // Fail-open: classifier error or timeout → start draining
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
        if (token !== undefined) {
          this.releaseCb?.(token);
        }
      }

      // Check if we're done draining
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
    // Resolve phase1 in case it hasn't been resolved yet
    this.phase1Resolve?.();
    this.phase1Resolve = undefined;
    // Resolve done promise
    this.doneResolve?.();
    this.doneResolve = undefined;
  }
}
