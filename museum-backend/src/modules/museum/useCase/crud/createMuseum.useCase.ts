import { isSlug } from '@musaium/shared';

import { invalidInput } from '@shared/errors/app.error';

import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { CreateMuseumInput } from '@modules/museum/domain/museum/museum.types';

export class CreateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(input: CreateMuseumInput): Promise<Museum> {
    if (!isSlug(input.slug)) {
      throw invalidInput('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    return await this.repository.create(input);
  }
}
