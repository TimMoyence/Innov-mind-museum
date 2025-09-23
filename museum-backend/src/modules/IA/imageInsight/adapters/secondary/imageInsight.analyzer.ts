import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ImageInsightRequest } from '../../core/domain/imageInsight.entity';

export class IAImageInsightAnalyzer {
  llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0.5 });

  async analyze({
    imageBase64,
    language = 'fr',
    tone = 'beginner',
  }: ImageInsightRequest): Promise<string | null> {
    // Prompt inspired by conversation.IA: structured rules + tone guidelines
    const toneGuideline = (() => {
      switch (tone) {
        case 'expert':
          return language === 'fr'
            ? 'Ton expert, précis et détaillé; vocabulaire spécialisé autorisé.'
            : 'Expert tone, precise and detailed; specialized vocabulary allowed.';
        case 'confirmed':
          return language === 'fr'
            ? 'Ton intermédiaire, équilibré; quelques termes techniques expliqués.'
            : 'Intermediate, balanced tone; some technical terms explained.';
        case 'beginner':
        default:
          return language === 'fr'
            ? 'Ton pédagogique et accessible; phrases courtes, vocabulaire simple.'
            : 'Pedagogical and accessible tone; short sentences, simple vocabulary.';
      }
    })();

    // Structured instruction mirroring conversation.IA style
    const prompt =
      language === 'fr'
        ? [
            'Tu es un guide de musée multimodal spécialisé en art. Réponds en français.',
            toneGuideline,
            '\nRègles de réponse :',
            "1) Observe l'image et déduis si elle représente une œuvre d'art (peinture, sculpture, photographie artistique, dessin, installation, etc.).",
            "   - Si ce n'est PAS une œuvre d'art, réponds UNIQUEMENT : 'Désolé, cette image ne semble pas représenter une œuvre d'art.' (aucun autre texte).",
            "2) Si c'est une œuvre d'art, fournis les informations ci-dessous au format EXACT de 4 lignes, sans texte additionnel.",
            "   - Si tu n'es pas certain d'une information, écris 'Inconnu'.",
            '   - Reste concis, clair et cohérent avec le ton demandé.',
            '\nFORMAT (4 lignes, exactement) :',
            "Musée: <nom du musée ou 'Inconnu'>",
            "Œuvre: <titre de l'œuvre ou 'Inconnu'>",
            "Artiste: <nom de l'artiste ou 'Inconnu'>",
            "Description ou histoire de l'oeuvre et question ouverte: <apporte une courte description de l'oeuvre et une question pour lui proposer de reflechir à l'oeuvre>",
          ].join('\n')
        : [
            'You are a multimodal museum guide specialized in art. Reply in English.',
            toneGuideline,
            '\nResponse rules:',
            '1) Inspect the image and decide whether it depicts an artwork (painting, sculpture, fine-art photography, drawing, installation, etc.).',
            "   - If it is NOT an artwork, reply ONLY: 'Sorry, this image does not appear to depict an artwork.' (no other text).",
            '2) If it is an artwork, provide the information below using the EXACT 4-line format, with no extra text.',
            "   - If unsure about any item, write 'Unknown'.",
            '   - Be concise, clear, and consistent with the requested tone.',
            '\nFORMAT (exactly 4 lines):',
            "Museum: <museum name or 'Unknown'>",
            "Artwork: <artwork title or 'Unknown'>",
            "Artist: <artist name or 'Unknown'>",
            'Describe or history of the artwork and open question : <give a short description of the artwork and add an open question to made visitor to think about it',
          ].join('\n');

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
    // If the model apologizes because the image isn't an artwork, treat as null for downstream handling
    return /(désolé|desole|sorry)/i.test(content) ? null : content;
  }
}
