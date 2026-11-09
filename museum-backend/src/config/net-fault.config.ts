import { toBoolean } from './env-helpers';

export const resolveNetFaultEnabled = (
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean => {
  const requested = toBoolean(raw, false);
  if (!requested) return false;

  if (nodeEnv === 'production') {
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        event: 'net_fault_injection_refused',
        reason: 'production_no_escape_hatch',
        raw: raw ?? '',
      }) + '\n',
    );
    return false;
  }

  return true;
};

export const shouldMountNetFault = (
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean => {
  return nodeEnv !== 'production' && resolveNetFaultEnabled(raw, nodeEnv);
};
