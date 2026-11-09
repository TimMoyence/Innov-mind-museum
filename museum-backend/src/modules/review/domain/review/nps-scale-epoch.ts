import { toIsoTimestamp } from '@src/config/env-helpers';

export const NPS_SCALE_EPOCH_DEFAULT = '2026-05-27T00:00:00.000Z';

export const resolveNpsScaleEpoch = (): string =>
  toIsoTimestamp(process.env.NPS_SCALE_EPOCH, NPS_SCALE_EPOCH_DEFAULT);
