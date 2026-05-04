import { badRequest, notFound } from '@shared/errors/app.error';

import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { UpdateMuseumInput } from '@modules/museum/domain/museum/museum.types';

/** Validates slug format and updates a museum's fields. */
export class UpdateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  /** Validates slug if provided, delegates update to the repository, and throws if museum not found. */
  async execute(id: number, input: UpdateMuseumInput): Promise<Museum> {
    if (input.slug !== undefined && !/^[a-z0-9-]+$/.test(input.slug)) {
      throw badRequest('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    const updated = await this.repository.update(id, input);
    if (!updated) throw notFound('Museum not found');
    return updated;
  }
}
