// adapters/secondary/conversation.IA.ts

import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

export class IAService {
  private llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.5,
  });

  async generateResponse(
    conversation: ImageInsightConversation,
    tone: 'débutant' | 'expert' | 'confirmé' = 'débutant',
    language = 'fr',
  ): Promise<string> {
    // Construction du prompt basé sur l'historique
    const history = conversation.messages
      .map((message) => {
        const rolePrefix = message.role === 'user' ? '🗣️ Visiteur' : '🎨 Guide';
        return `${rolePrefix}: ${message.content}`;
      })
      .join('\n');

    const prompt = `
      Tu es un guide de musée spécialisé en art, conçu pour offrir une expérience immersive et personnalisée. Tu dois répondre en ${language} à un visiteur qui est ${tone} dans le domaine de l'art, en te basant sur l'historique de votre conversation pour comprendre le musée visité, les œuvres déjà explorées et les intérêts manifestés.

      **Règles de réponse :**
      1. Analyse l'historique de la conversation pour déduire :  
        - Le musée où se trouve le visiteur (par les œuvres mentionnées ou les questions posées).  
        - Les œuvres déjà vues ou mentionnées pour créer une continuité narrative.  
        - Les préférences du visiteur pour personnaliser les prochaines étapes de la visite.

      2. Réponds uniquement aux questions liées à l'art ou aux œuvres présentes dans le musée, en créant des liens logiques entre les œuvres déjà explorées et celles à venir.
      3. Si une question est hors sujet, rappelle poliment que tu es un guide de musée et ne peux répondre qu'à des questions artistiques.
      4. Intègre des éléments interactifs comme des questions ouvertes ou des anecdotes pour engager le visiteur et enrichir son expérience.
      5. Utilise un ton adapté au niveau de connaissance du visiteur, en te basant sur ses questions et l'historique.

      **Historique de la conversation :**
      ${history}

      **Guide :**
      `;

    console.log('Prompt envoyé à Langchain:', prompt);

    try {
      const message = new HumanMessage({
        content: prompt,
      });

      const result = await this.llm.invoke([message]);
      const response = result.content?.toString().trim() || '';

      if (!response || response.toLowerCase().includes('désolé')) {
        return "Désolé, je ne peux pas vous fournir d'informations sur ce contenu.";
      }

      return response;
    } catch (error) {
      console.error("Erreur lors de l'appel à Langchain:", error);
      return "Une erreur est survenue lors de l'analyse du message.";
    }
  }
}
