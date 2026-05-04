import type {
  ExtractedContent,
  ExtractedContentStatus,
} from '../extracted-content/extracted-content.entity';

/** Port for extracted content persistence. */
export interface ExtractedContentRepoPort {
  findByUrl(url: string): Promise<ExtractedContent | null>;
  upsert(data: {
    url: string;
    title: string;
    textContent: string;
    contentHash: string;
    status: ExtractedContentStatus;
  }): Promise<ExtractedContent>;
  updateStatus(url: string, status: ExtractedContentStatus): Promise<void>;
}
