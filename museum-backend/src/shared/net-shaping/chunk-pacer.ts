/**
 * Deterministic chunk-pacing math for the L2 fault injector's Mode B trickle
 * (TEST-ONLY). Splits a payload of `totalBytes` into a schedule of cumulative
 * delays based on a download bandwidth (`bwDownKbps`), so a slow profile (2G,
 * 100 kbps) delivers a response body over a realistic span instead of instantly.
 *
 * Pure function, no I/O, no timers — the caller drives the actual `setTimeout`s
 * from the returned schedule. This keeps the pacing unit-testable and the
 * middleware's timer wiring trivial.
 */

/** A single paced step: emit this many bytes at `atMs` from the start. */
export interface PaceStep {
  /** Cumulative offset in ms from the start of the trickle. */
  readonly atMs: number;
  /** Cumulative bytes delivered by this step. */
  readonly cumulativeBytes: number;
}

/** Number of trickle steps; bounded so a huge body cannot schedule thousands of timers. */
const MAX_STEPS = 20;

/**
 * Builds a cumulative delivery schedule for `totalBytes` paced at `bwDownKbps`.
 * The final step's `atMs` equals the total transfer time; the body is delivered
 * in at most {@link MAX_STEPS} evenly-spaced chunks.
 *
 * @param totalBytes - Size of the serialised payload in bytes.
 * @param bwDownKbps - Download bandwidth in kilobits per second (0 → instant).
 * @returns Ordered pace steps (always at least one terminal step).
 */
export const buildPaceSchedule = (totalBytes: number, bwDownKbps: number): PaceStep[] => {
  const safeBytes = Math.max(0, Math.floor(totalBytes));
  // 0 kbps (offline) would be Infinity ms — clamp to an instant single step so
  // the injector never wedges a connection open forever.
  if (bwDownKbps <= 0 || safeBytes === 0) {
    return [{ atMs: 0, cumulativeBytes: safeBytes }];
  }

  const totalMs = Math.ceil((safeBytes * 8) / bwDownKbps); // bytes→bits / kbps = ms
  const steps = Math.min(MAX_STEPS, Math.max(1, safeBytes));
  const schedule: PaceStep[] = [];
  for (let i = 1; i <= steps; i += 1) {
    schedule.push({
      atMs: Math.ceil((totalMs * i) / steps),
      cumulativeBytes: Math.ceil((safeBytes * i) / steps),
    });
  }
  return schedule;
};
