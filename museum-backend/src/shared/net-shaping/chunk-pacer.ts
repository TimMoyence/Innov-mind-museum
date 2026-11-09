export interface PaceStep {
  readonly atMs: number;
  readonly cumulativeBytes: number;
}

const MAX_STEPS = 20;

export const buildPaceSchedule = (totalBytes: number, bwDownKbps: number): PaceStep[] => {
  const safeBytes = Math.max(0, Math.floor(totalBytes));
  if (bwDownKbps <= 0 || safeBytes === 0) {
    return [{ atMs: 0, cumulativeBytes: safeBytes }];
  }

  const totalMs = Math.ceil((safeBytes * 8) / bwDownKbps);
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
