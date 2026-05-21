/**
 * GDPR erasure run (B5) — loader for the S3 orphan-purge cron registrar MODULE
 * that DOES NOT EXIST YET at red-phase time (T4.2 creates it).
 *
 * A static `import` or a string-LITERAL `import()` of a missing module is a
 * TS2307 compile error, which would break `pnpm lint` (`tsc --noEmit`). Using a
 * COMPUTED specifier defeats tsc's static module resolution (the result is
 * `Promise<any>`), so the helper typechecks now and rejects at RUNTIME (module
 * not found) — the intended red-phase failure.
 *
 * GREEN contract (T4.2): `modules/chat/jobs/s3-orphan-purge-cron.registrar.ts`
 * exports `registerS3OrphanPurgeCron(dataSource, config)` mirroring
 * `registerChatPurgeCron`: creates a `Queue`, `upsertJobScheduler` with a stable
 * id, spawns a `Worker` with `'failed'` + `'error'` listeners, fail-open on
 * registration error (no-op `stop()`), worker tick calls `runS3OrphanPurge`.
 */

/** Module path resolved at runtime only (computed → tsc cannot resolve it). */
const REGISTRAR_MODULE_SEGMENTS = [
  '@modules/chat/jobs/',
  's3-orphan-purge-cron.registrar',
] as const;

type RegistrarHandle = { stop: () => Promise<void> };
type RegisterFn = (dataSource: unknown, config: unknown) => Promise<RegistrarHandle>;

/**
 * Dynamically loads `registerS3OrphanPurgeCron`. Rejects if the module does not
 * exist yet (red phase) — that rejection is the failing-test signal.
 */
export async function loadRegisterS3OrphanPurgeCron(): Promise<RegisterFn> {
  const spec = REGISTRAR_MODULE_SEGMENTS.join('');
  const mod = (await import(spec)) as Record<string, unknown>;
  const fn = mod.registerS3OrphanPurgeCron;
  if (typeof fn !== 'function') {
    throw new Error('registerS3OrphanPurgeCron is not exported by the registrar module');
  }
  return fn as RegisterFn;
}
