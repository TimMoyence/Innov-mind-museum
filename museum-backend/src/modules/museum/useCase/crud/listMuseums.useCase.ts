import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

/** Lists all museums with optional active-only filtering. */
export class ListMuseumsUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  /** Delegates museum listing to the repository. */
  async execute(opts?: { activeOnly?: boolean }): Promise<Museum[]> {
    return await this.repository.findAll(opts);
  }
}
