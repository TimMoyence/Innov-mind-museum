/**
 * mulberry32 — a tiny, fast, fully deterministic 32-bit PRNG (TEST-ONLY).
 *
 * Same seed → identical sequence, forever. The network simulation harness uses
 * it for packet-loss decisions so a failing scenario is byte-for-byte
 * reproducible (NEVER `Math.random()`, which would make the loss pattern
 * non-deterministic across runs).
 *
 * Reference algorithm: Tommy Ettinger / bryc — a single uint32 state advanced by
 * a fixed mix. Emits values in `[0, 1)`. The raw seed is first mixed with the
 * 32-bit golden-ratio constant (0x9e3779b9) so small integer seeds (1, 3, 7, 9…)
 * do not start in a pathological low-entropy region of the sequence — this keeps
 * the first draw well-distributed for the small seeds the harness suites use.
 */
export function mulberry32(seed: number): () => number {
  let state = (seed + 0x9e3779b9) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
