import type { IReviewRepository } from '@modules/review/domain/review/review.repository.interface';
import type { NpsAggregate } from '@modules/review/domain/review/review.types';

interface GetNpsUseCaseInput {
  museumId?: number;
}

export class GetNpsUseCase {
  constructor(private readonly repository: IReviewRepository) {}

  async execute(input: GetNpsUseCaseInput): Promise<NpsAggregate> {
    return await this.repository.aggregateNps(input.museumId);
  }
}
