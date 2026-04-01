import type { SupportedLocale } from './locale';

interface RefusalMessages {
  insult: string;
  default: string;
}

export const GUARDRAIL_REFUSALS: Record<SupportedLocale, RefusalMessages> = {
  en: {
    insult:
      'I cannot process insulting language. I can only help with art, monuments, museums, and cultural heritage.',
    default: 'I answer only about art, monuments, museums, architecture, and cultural heritage.',
  },
  fr: {
    insult:
      "Je ne traite pas les insultes. Je peux aider uniquement sur l'art, les monuments, les musées et le patrimoine.",
    default:
      "Je réponds uniquement sur l'art, les monuments, les musées, l'architecture et le patrimoine culturel.",
  },
  es: {
    insult:
      'No puedo procesar lenguaje insultante. Solo puedo ayudar con arte, monumentos, museos y patrimonio cultural.',
    default: 'Solo respondo sobre arte, monumentos, museos, arquitectura y patrimonio cultural.',
  },
  de: {
    insult:
      'Ich kann beleidigende Sprache nicht verarbeiten. Ich kann nur bei Kunst, Denkmälern, Museen und Kulturerbe helfen.',
    default: 'Ich antworte nur zu Kunst, Denkmälern, Museen, Architektur und Kulturerbe.',
  },
  it: {
    insult:
      'Non posso elaborare linguaggio offensivo. Posso aiutare solo con arte, monumenti, musei e patrimonio culturale.',
    default: 'Rispondo solo su arte, monumenti, musei, architettura e patrimonio culturale.',
  },
  ja: {
    insult:
      '侮辱的な言葉は処理できません。美術、記念碑、博物館、文化遺産についてのみお手伝いできます。',
    default: '美術、記念碑、博物館、建築、文化遺産についてのみお答えします。',
  },
  zh: {
    insult: '我无法处理侮辱性语言。我只能帮助解答有关艺术、纪念碑、博物馆和文化遗产的问题。',
    default: '我只回答有关艺术、纪念碑、博物馆、建筑和文化遗产的问题。',
  },
};
