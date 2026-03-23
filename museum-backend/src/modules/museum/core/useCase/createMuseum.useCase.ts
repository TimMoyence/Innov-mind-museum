import { badRequest } from '@shared/errors/app.error';
import type { IMuseumRepository } from '../domain/museum.repository.interface';
import type { CreateMuseumInput } from '../domain/museum.types';
import type { Museum } from '../domain/museum.entity';

export class CreateMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(input: CreateMuseumInput): Promise<Museum> {
    if (!input.name?.trim()) throw badRequest('Museum name is required');
    if (!input.slug?.trim()) throw badRequest('Museum slug is required');
    if (!/^[a-z0-9-]+$/.test(input.slug)) {
      throw badRequest('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    return this.repository.create(input);
  }
}
