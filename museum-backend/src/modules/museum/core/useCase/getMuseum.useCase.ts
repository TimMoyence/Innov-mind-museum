import { notFound } from '@shared/errors/app.error';
import type { IMuseumRepository } from '../domain/museum.repository.interface';
import type { Museum } from '../domain/museum.entity';

export class GetMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(idOrSlug: string): Promise<Museum> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const museum = isNumeric
      ? await this.repository.findById(Number(idOrSlug))
      : await this.repository.findBySlug(idOrSlug);
    if (!museum) throw notFound('Museum not found');
    return museum;
  }
}
