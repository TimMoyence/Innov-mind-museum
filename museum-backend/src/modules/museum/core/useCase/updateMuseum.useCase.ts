import { badRequest, notFound } from '@shared/errors/app.error';
import type { IMuseumRepository } from '../domain/museum.repository.interface';
import type { UpdateMuseumInput } from '../domain/museum.types';
import type { Museum } from '../domain/museum.entity';

export class UpdateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(id: number, input: UpdateMuseumInput): Promise<Museum> {
    if (input.slug !== undefined && !/^[a-z0-9-]+$/.test(input.slug)) {
      throw badRequest('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    const updated = await this.repository.update(id, input);
    if (!updated) throw notFound('Museum not found');
    return updated;
  }
}
