import { IAImageInsightAnalyzer } from '@modules/IA/imageInsight/adapters/secondary/imageInsight.analyzer';
import { ImageInsightRepository } from '../domain/imageInsight.repository.interface';

export const createImageInsightUseCase = (repo: ImageInsightRepository) => ({
  async execute(base64: string, userId: number, conversationId?: string) {
    const analyzer = new IAImageInsightAnalyzer();
    const response = await analyzer.analyze({ imageBase64: base64 });

    if (!response) return null;

    return repo.saveMessages(userId, conversationId || null, null, [
      { role: 'user', content: '[Image uploaded]' },
      { role: 'assistant', content: response },
    ]);
  },
});
