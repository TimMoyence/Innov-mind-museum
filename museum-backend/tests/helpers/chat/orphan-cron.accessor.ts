const REGISTRAR_MODULE_SEGMENTS = [
  '@modules/chat/jobs/',
  's3-orphan-purge-cron.registrar',
] as const;

type RegistrarHandle = { stop: () => Promise<void> };
type RegisterFn = (dataSource: unknown, config: unknown) => Promise<RegistrarHandle>;

export async function loadRegisterS3OrphanPurgeCron(): Promise<RegisterFn> {
  const spec = REGISTRAR_MODULE_SEGMENTS.join('');
  const mod = (await import(spec)) as Record<string, unknown>;
  const fn = mod.registerS3OrphanPurgeCron;
  if (typeof fn !== 'function') {
    throw new Error('registerS3OrphanPurgeCron is not exported by the registrar module');
  }
  return fn as RegisterFn;
}
