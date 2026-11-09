import { mapMagicLinkPath } from '@/features/auth/lib/magicLinkPath';

export function redirectSystemPath(event: { path: string; initial: boolean }): string {
  try {
    return mapMagicLinkPath(event.path);
  } catch {
    return event.path;
  }
}
