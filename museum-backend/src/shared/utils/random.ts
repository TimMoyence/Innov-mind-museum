import { randomInt } from 'node:crypto';

const RESOLUTION = 2 ** 48 - 1;

export const randomSource = {
  unit: (): number => randomInt(RESOLUTION) / RESOLUTION,
};
