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
  /**
   * Hybrid-gravity guardrail (2026-06-01) — friendly cool-down / refocus copy
   * shown when repeated off-topic crosses the session/user friction threshold.
   * Warmer than `default` (an escalation, not a flat refusal). No emoji.
   */
  refocus: string;
}

export const GUARDRAIL_REFUSALS: Record<SupportedLocale, RefusalMessages> = {
  en: {
    insult:
      'I cannot process insulting language. I can only help with art, monuments, museums, and cultural heritage.',
    default: 'I answer only about art, monuments, museums, architecture, and cultural heritage.',
    serviceUnavailable:
      'Service is temporarily unavailable. Please retry in a moment — your message was not flagged.',
    refocus:
      "I'm your cultural companion — let's stay on art, monuments, and heritage. We can pick up whenever you're ready.",
  },
  fr: {
    insult:
      "Je ne traite pas les insultes. Je peux aider uniquement sur l'art, les monuments, les musées et le patrimoine.",
    default:
      "Je réponds uniquement sur l'art, les monuments, les musées, l'architecture et le patrimoine culturel.",
    serviceUnavailable:
      "Service temporairement indisponible. Réessaie dans un instant — ton message n'a pas été signalé.",
    refocus:
      "Je suis ton compagnon culturel — restons sur l'art, les monuments et le patrimoine. On reprend quand tu veux.",
  },
  es: {
    insult:
      'No puedo procesar lenguaje insultante. Solo puedo ayudar con arte, monumentos, museos y patrimonio cultural.',
    default: 'Solo respondo sobre arte, monumentos, museos, arquitectura y patrimonio cultural.',
    serviceUnavailable:
      'Servicio temporalmente no disponible. Reinténtalo en un momento — tu mensaje no fue marcado.',
    refocus:
      'Soy tu compañero cultural — sigamos con el arte, los monumentos y el patrimonio. Retomamos cuando quieras.',
  },
  de: {
    insult:
      'Ich kann beleidigende Sprache nicht verarbeiten. Ich kann nur bei Kunst, Denkmälern, Museen und Kulturerbe helfen.',
    default: 'Ich antworte nur zu Kunst, Denkmälern, Museen, Architektur und Kulturerbe.',
    serviceUnavailable:
      'Dienst vorübergehend nicht verfügbar. Bitte versuche es gleich erneut — deine Nachricht wurde nicht markiert.',
    refocus:
      'Ich bin dein Kulturbegleiter — bleiben wir bei Kunst, Denkmälern und Kulturerbe. Wir machen weiter, wann immer du möchtest.',
  },
  it: {
    insult:
      'Non posso elaborare linguaggio offensivo. Posso aiutare solo con arte, monumenti, musei e patrimonio culturale.',
    default: 'Rispondo solo su arte, monumenti, musei, architettura e patrimonio culturale.',
    serviceUnavailable:
      'Servizio temporaneamente non disponibile. Riprova tra un istante — il tuo messaggio non è stato segnalato.',
    refocus:
      'Sono il tuo compagno culturale — restiamo su arte, monumenti e patrimonio. Riprendiamo quando vuoi.',
  },
  ja: {
    insult:
      '侮辱的な言葉は処理できません。美術、記念碑、博物館、文化遺産についてのみお手伝いできます。',
    default: '美術、記念碑、博物館、建築、文化遺産についてのみお答えします。',
    serviceUnavailable:
      'サービスは一時的にご利用いただけません。少し待ってから再試行してください。メッセージは問題ありません。',
    refocus:
      '私は文化のお供です。美術や記念碑、文化遺産の話を続けましょう。準備ができたらいつでも再開できます。',
  },
  zh: {
    insult: '我无法处理侮辱性语言。我只能帮助解答有关艺术、纪念碑、博物馆和文化遗产的问题。',
    default: '我只回答有关艺术、纪念碑、博物馆、建筑和文化遗产的问题。',
    serviceUnavailable: '服务暂时不可用。请稍后重试 — 您的消息没有被标记。',
    refocus: '我是你的文化伙伴 — 我们继续聊艺术、纪念碑和文化遗产吧。你准备好了我们随时继续。',
  },
  ar: {
    insult:
      'لا يمكنني معالجة اللغة المسيئة. يمكنني المساعدة فقط في الفن والآثار والمتاحف والتراث الثقافي.',
    default: 'أجيب فقط عن الفن والآثار والمتاحف والعمارة والتراث الثقافي.',
    serviceUnavailable:
      'الخدمة غير متاحة مؤقتًا. يرجى المحاولة بعد لحظات — لم يتم الإبلاغ عن رسالتك.',
    refocus:
      'أنا رفيقك الثقافي — لنبقَ في موضوع الفن والآثار والتراث. يمكننا المتابعة متى كنت مستعدًا.',
  },
};
