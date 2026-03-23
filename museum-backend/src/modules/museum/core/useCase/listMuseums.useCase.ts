import type { IMuseumRepository } from '../domain/museum.repository.interface';
import type { Museum } from '../domain/museum.entity';

export class ListMuseumsUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    return this.repository.findAll(opts);
  }
}
