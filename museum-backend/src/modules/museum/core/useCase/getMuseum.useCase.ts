import { notFound } from '@shared/errors/app.error';

import type { Museum } from '../domain/museum.entity';
import type { IMuseumRepository } from '../domain/museum.repository.interface';

/** Retrieves a museum by numeric ID or slug. */
export class GetMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  /** Resolves a museum by numeric ID or slug string, throwing if not found. */
  async execute(idOrSlug: string): Promise<Museum> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const museum = isNumeric
      ? await this.repository.findById(Number(idOrSlug))
      : await this.repository.findBySlug(idOrSlug);
    if (!museum) throw notFound('Museum not found');
    return museum;
  }
}
