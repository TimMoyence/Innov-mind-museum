import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

export class ListMuseumsUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    return await this.repository.findAll(opts);
  }
}
