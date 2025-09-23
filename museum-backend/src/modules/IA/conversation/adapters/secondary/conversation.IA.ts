// adapters/secondary/conversation.IA.ts

import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

export class IAService {
  private llm = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0.5,
  });
  // Improved: lean prompt + structured messages for better/faster answers
  async generateResponse(
    conversation: ImageInsightConversation,
    tone: 'débutant' | 'expert' | 'confirmé' = 'débutant',
    language = 'fr',
  ): Promise<string> {
    // Keep the prompt short and role-structured for better results and speed
    const systemPrompt = [
      `Tu es un guide de musée expert, chaleureux et pédagogue.`,
      `Réponds en ${language} avec un niveau ${tone}.`,
      `Règles:`,
      `- Reste centré sur l'art et l'expérience muséale.`,
      `- Relie les œuvres déjà évoquées quand pertinent.`,
      `- Sois factuel, clair et précis.`,
      `- Réponse concise (120–180 mots).`,
      `- Termine par une question ouverte.`,
      `- Si la demande est hors-sujet, recadre poliment.`,
    ].join(' ');

    // Use only the most recent messages to reduce token usage
    const MAX_MESSAGES = 12;
    const truncate = (text: string, max = 800) =>
      text.length > max ? `${text.slice(0, max)}…` : text;

    const sorted = [...(conversation.messages || [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const recent = sorted.slice(-MAX_MESSAGES);

    const chatHistory = recent.map((m) =>
      m.role === 'user'
        ? new HumanMessage({ content: truncate(m.content) })
        : new AIMessage({ content: truncate(m.content) }),
    );

    const messages = [new SystemMessage(systemPrompt), ...chatHistory];

    // Lightweight logging for observability without dumping full content
    try {
      const lastUser = [...recent].reverse().find((m) => m.role === 'user');
      console.log(
        'IA: invoking with last user msg len =',
        lastUser?.content?.length || 0,
      );
    } catch {}

    try {
      const result = await this.llm.invoke(messages);

      const content = result.content?.toString() || '';

      return content || "Je n'ai pas réussi à générer une réponse utile.";
    } catch (error) {
      console.error("Erreur lors de l'appel à Langchain:", error);
      return "Une erreur est survenue lors de l'analyse du message.";
    }
  }
}
