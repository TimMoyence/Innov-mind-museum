import type { SupportedLocale } from './locale';

interface RefusalMessages {
  insult: string;
  default: string;
  /**
   * ADR-047 (2026-05-12) — surface when the LLM Guard sidecar is unreachable /
   * saturated. Tells the user the service is temporarily unavailable rather
   * than the misleading "your content was flagged" framing.
   */
  serviceUnavailable: string;
}

export const GUARDRAIL_REFUSALS: Record<SupportedLocale, RefusalMessages> = {
  en: {
    insult:
      'I cannot process insulting language. I can only help with art, monuments, museums, and cultural heritage.',
    default: 'I answer only about art, monuments, museums, architecture, and cultural heritage.',
    serviceUnavailable:
      'Service is temporarily unavailable. Please retry in a moment — your message was not flagged.',
  },
  fr: {
    insult:
      "Je ne traite pas les insultes. Je peux aider uniquement sur l'art, les monuments, les musées et le patrimoine.",
    default:
      "Je réponds uniquement sur l'art, les monuments, les musées, l'architecture et le patrimoine culturel.",
    serviceUnavailable:
      "Service temporairement indisponible. Réessaie dans un instant — ton message n'a pas été signalé.",
  },
  es: {
    insult:
      'No puedo procesar lenguaje insultante. Solo puedo ayudar con arte, monumentos, museos y patrimonio cultural.',
    default: 'Solo respondo sobre arte, monumentos, museos, arquitectura y patrimonio cultural.',
    serviceUnavailable:
      'Servicio temporalmente no disponible. Reinténtalo en un momento — tu mensaje no fue marcado.',
  },
  de: {
    insult:
      'Ich kann beleidigende Sprache nicht verarbeiten. Ich kann nur bei Kunst, Denkmälern, Museen und Kulturerbe helfen.',
    default: 'Ich antworte nur zu Kunst, Denkmälern, Museen, Architektur und Kulturerbe.',
    serviceUnavailable:
      'Dienst vorübergehend nicht verfügbar. Bitte versuche es gleich erneut — deine Nachricht wurde nicht markiert.',
  },
  it: {
    insult:
      'Non posso elaborare linguaggio offensivo. Posso aiutare solo con arte, monumenti, musei e patrimonio culturale.',
    default: 'Rispondo solo su arte, monumenti, musei, architettura e patrimonio culturale.',
    serviceUnavailable:
      'Servizio temporaneamente non disponibile. Riprova tra un istante — il tuo messaggio non è stato segnalato.',
  },
  ja: {
    insult:
      '侮辱的な言葉は処理できません。美術、記念碑、博物館、文化遺産についてのみお手伝いできます。',
    default: '美術、記念碑、博物館、建築、文化遺産についてのみお答えします。',
    serviceUnavailable:
      'サービスは一時的にご利用いただけません。少し待ってから再試行してください。メッセージは問題ありません。',
  },
  zh: {
    insult: '我无法处理侮辱性语言。我只能帮助解答有关艺术、纪念碑、博物馆和文化遗产的问题。',
    default: '我只回答有关艺术、纪念碑、博物馆、建筑和文化遗产的问题。',
    serviceUnavailable: '服务暂时不可用。请稍后重试 — 您的消息没有被标记。',
  },
  ar: {
    insult:
      'لا يمكنني معالجة اللغة المسيئة. يمكنني المساعدة فقط في الفن والآثار والمتاحف والتراث الثقافي.',
    default: 'أجيب فقط عن الفن والآثار والمتاحف والعمارة والتراث الثقافي.',
    serviceUnavailable:
      'الخدمة غير متاحة مؤقتًا. يرجى المحاولة بعد لحظات — لم يتم الإبلاغ عن رسالتك.',
  },
};
