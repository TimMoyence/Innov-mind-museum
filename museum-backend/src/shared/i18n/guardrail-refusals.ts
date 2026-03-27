import type { SupportedLocale } from './locale';

interface RefusalMessages {
  insult: string;
  external_request: string;
  default: string;
}

export const GUARDRAIL_REFUSALS: Record<SupportedLocale, RefusalMessages> = {
  en: {
    insult:
      'I cannot process insulting language. I can only help with art, monuments, museums, and cultural heritage.',
    external_request:
      'I cannot execute external actions. I can only answer artistic and cultural questions.',
    default: 'I answer only about art, monuments, museums, architecture, and cultural heritage.',
  },
  fr: {
    insult:
      "Je ne traite pas les insultes. Je peux aider uniquement sur l'art, les monuments, les musées et le patrimoine.",
    external_request:
      'Je ne peux pas exécuter de demande externe. Je réponds uniquement à des questions artistiques.',
    default:
      "Je réponds uniquement sur l'art, les monuments, les musées, l'architecture et le patrimoine culturel.",
  },
  es: {
    insult:
      'No puedo procesar lenguaje insultante. Solo puedo ayudar con arte, monumentos, museos y patrimonio cultural.',
    external_request:
      'No puedo ejecutar acciones externas. Solo puedo responder preguntas artísticas y culturales.',
    default: 'Solo respondo sobre arte, monumentos, museos, arquitectura y patrimonio cultural.',
  },
  de: {
    insult:
      'Ich kann beleidigende Sprache nicht verarbeiten. Ich kann nur bei Kunst, Denkmälern, Museen und Kulturerbe helfen.',
    external_request:
      'Ich kann keine externen Aktionen ausführen. Ich kann nur künstlerische und kulturelle Fragen beantworten.',
    default: 'Ich antworte nur zu Kunst, Denkmälern, Museen, Architektur und Kulturerbe.',
  },
  it: {
    insult:
      'Non posso elaborare linguaggio offensivo. Posso aiutare solo con arte, monumenti, musei e patrimonio culturale.',
    external_request:
      'Non posso eseguire azioni esterne. Posso solo rispondere a domande artistiche e culturali.',
    default: 'Rispondo solo su arte, monumenti, musei, architettura e patrimonio culturale.',
  },
  ja: {
    insult:
      '侮辱的な言葉は処理できません。美術、記念碑、博物館、文化遺産についてのみお手伝いできます。',
    external_request:
      '外部アクションは実行できません。芸術や文化に関する質問にのみお答えできます。',
    default: '美術、記念碑、博物館、建築、文化遺産についてのみお答えします。',
  },
  zh: {
    insult: '我无法处理侮辱性语言。我只能帮助解答有关艺术、纪念碑、博物馆和文化遗产的问题。',
    external_request: '我无法执行外部操作。我只能回答艺术和文化方面的问题。',
    default: '我只回答有关艺术、纪念碑、博物馆、建筑和文化遗产的问题。',
  },
};
