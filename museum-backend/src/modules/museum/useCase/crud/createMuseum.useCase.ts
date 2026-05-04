import { badRequest } from '@shared/errors/app.error';

import type { Museum } from '../../domain/museum/museum.entity';
import type { IMuseumRepository } from '../../domain/museum/museum.repository.interface';
import type { CreateMuseumInput } from '../../domain/museum/museum.types';

/** Validates required fields and creates a new museum. */
export class CreateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  /** Validates input fields and delegates museum creation to the repository. */
  async execute(input: CreateMuseumInput): Promise<Museum> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: input fields may be undefined from external API input
    if (!input.name?.trim()) throw badRequest('Museum name is required');
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: input fields may be undefined from external API input
    if (!input.slug?.trim()) throw badRequest('Museum slug is required');
    if (!/^[a-z0-9-]+$/.test(input.slug)) {
      throw badRequest('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    return await this.repository.create(input);
  }
}
