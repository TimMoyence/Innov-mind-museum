import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ImageInsightRequest } from '../../core/domain/imageInsight.entity';

export class IAImageInsightAnalyzer {
  llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.5 });

  async analyze({
    imageBase64,
    language = 'fr',
  }: ImageInsightRequest): Promise<string | null> {
    // TODO : Changer le prompt pour qu'il soit adapaté qu'il renvoie désolé si l'image n'est pas d'une artiste, que l'ia donne le nom du musée, le nom de l'oeuvre, l'artiste, pose potentiellemetn une question d'ouverture, et ai en paramètre en plus du language la mise en place d'un ton de réponse (débutant, expert, confirmé)

    const prompt = `Tu es un guide de musée. Décris cette œuvre comme si tu t'adressais à un visiteur, dans un style ${language}. Répond uniquement si l'image semble artistique.`;

    const message = new HumanMessage({
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        },
      ],
    });

    const result = await this.llm.invoke([message]);
    const content = result.content?.toString() || '';
    return content.includes('désolé') ? null : content;
  }
}
