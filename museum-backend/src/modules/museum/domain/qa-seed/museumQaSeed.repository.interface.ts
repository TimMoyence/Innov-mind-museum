import type { MuseumQaSeed } from './museumQaSeed.entity';

/**
 *
 */
export interface MuseumQaSeedRepository {
  findByMuseumAndLocale(museumId: string, locale: string): Promise<MuseumQaSeed[]>;
}
