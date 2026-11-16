import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MAESTRO_DIR = resolve(process.cwd(), '..', 'museum-frontend/.maestro');

export const flowNames = () =>
  readdirSync(MAESTRO_DIR, { recursive: true })
    .map(String)
    .filter((flow) => flow.endsWith('.yaml'));

export const readFlow = (flow) => readFileSync(resolve(MAESTRO_DIR, flow), 'utf8');

export const stepsOf = (flow) => readFlow(flow).split(/\n(?=- )/);

export const scrollTimeoutTo = (flow, target) =>
  Number(
    /^ {4}timeout: (\d+)$/m.exec(
      stepsOf(flow).find(
        (step) => step.startsWith('- scrollUntilVisible:') && step.includes(target),
      ) ?? '',
    )?.[1] ?? 0,
  );
