import { notFound } from '@shared/errors/app.error';

import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

export class GetMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  /** Throws 404 if not found. */
  async execute(idOrSlug: string): Promise<Museum> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const museum = isNumeric
      ? await this.repository.findById(Number(idOrSlug))
      : await this.repository.findBySlug(idOrSlug);
    if (!museum) throw notFound('Museum not found');
    return museum;
  }
}
