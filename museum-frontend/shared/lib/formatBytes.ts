const ONE_MB = 1024 * 1024;

export const formatBytes = (bytes: number): string =>
  bytes < ONE_MB
    ? `${Math.round(bytes / 1024).toString()} KB`
    : `${(bytes / ONE_MB).toFixed(1)} MB`;
