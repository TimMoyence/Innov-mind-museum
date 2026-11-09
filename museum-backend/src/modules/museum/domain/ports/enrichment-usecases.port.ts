export interface RefreshStaleEnrichmentsResult {
  enqueued: number;
  skipped: number;
}

export interface PurgeDeadEnrichmentsResult {
  deleted: number;
}

export interface RefreshStaleEnrichmentsPort {
  execute(now?: Date): Promise<RefreshStaleEnrichmentsResult>;
}

export interface PurgeDeadEnrichmentsPort {
  execute(now: Date | undefined, thresholdDays: number): Promise<PurgeDeadEnrichmentsResult>;
}
