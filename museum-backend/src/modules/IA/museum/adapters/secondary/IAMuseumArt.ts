import { PromptTemplate } from '@langchain/core/prompts';
import { IAConnection } from '@shared/IAConnection';
import { ResponseMessage } from '@shared/domaine/index';
import { IAMuseumArtInterface } from '../../core/domaine/IAMuseumArt.interface';

export class IAMuseumArt implements IAMuseumArtInterface {
  llm = new IAConnection().chatOpenAI('gpt-4o-mini', 0.5);

  async askQuestionOnArtToIA(
    artName: string,
    artist: string,
    responseTon: string,
  ): Promise<ResponseMessage> {
    const IAMuseum = `Tu es un assistant dans le domaine de l'art. Tu ne repond que aux questions qui on un attrait pour l'art. Tu dois répondre de manière concise. Tu peux me donner des informations sur l'oeuvre {artName} de l'artiste {artist} ? Ta réponse doit être {responseTon}.`;

    const IAMuseumPrompt = PromptTemplate.fromTemplate(IAMuseum).pipe(this.llm);

    const response = await IAMuseumPrompt.invoke({
      artName,
      artist,
      responseTon,
    });
    return { message: response.content.toString() };
  }
}
