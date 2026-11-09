import { isSlug } from '@musaium/shared';

import { invalidInput, notFound } from '@shared/errors/app.error';

import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { UpdateMuseumInput } from '@modules/museum/domain/museum/museum.types';

export class UpdateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(id: number, input: UpdateMuseumInput): Promise<Museum> {
    if (input.slug !== undefined && !isSlug(input.slug)) {
      throw invalidInput('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    const updated = await this.repository.update(id, input);
    if (!updated) throw notFound('Museum not found');
    return updated;
  }
}
