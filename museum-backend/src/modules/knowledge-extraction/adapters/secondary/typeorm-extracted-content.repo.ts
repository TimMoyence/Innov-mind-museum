import type {
  ExtractedContent,
  ExtractedContentStatus,
} from '../../domain/extracted-content.entity';
import type { Repository } from 'typeorm';

/**
 *
 */
export class TypeOrmExtractedContentRepo {
  constructor(private readonly repo: Repository<ExtractedContent>) {}

  /** Finds extracted content by its source URL. */
  async findByUrl(url: string): Promise<ExtractedContent | null> {
    return await this.repo.findOne({ where: { url } });
  }

  /**
   *
   */
  /** Inserts or updates extracted content by URL. */
  async upsert(data: {
    url: string;
    title: string;
    textContent: string;
    contentHash: string;
    status: ExtractedContentStatus;
  }): Promise<ExtractedContent> {
    const existing = await this.findByUrl(data.url);
    if (existing) {
      existing.title = data.title;
      existing.textContent = data.textContent;
      existing.contentHash = data.contentHash;
      existing.status = data.status;
      existing.scrapedAt = new Date();
      return await this.repo.save(existing);
    }
    return await this.repo.save(this.repo.create(data));
  }

  /**
   *
   */
  /** Updates the processing status of an extracted content entry. */
  async updateStatus(url: string, status: ExtractedContentStatus): Promise<void> {
    await this.repo.update({ url }, { status });
  }
}
