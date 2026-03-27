import type { SupportedLocale } from './locale';

interface FallbackTemplates {
  locationPrefix: (location: string) => string;
  quickSummary: string;
  defaultQuestion: string;
  museumNextStep: string;
  standardHint: string;
  closingQuestion: string;
}

const FALLBACK_TEMPLATES: Record<SupportedLocale, FallbackTemplates> = {
  en: {
    locationPrefix: (loc) => `You are currently near ${loc}. `,
    quickSummary: 'Quick summary: ',
    defaultQuestion: 'Artwork question.',
    museumNextStep: 'Next step: compare composition details with a nearby work.',
    standardHint: 'Helpful angle: focus on composition, light, and historical context.',
    closingQuestion: 'Would you like a technical, biographical, or symbolic reading next?',
  },
  fr: {
    locationPrefix: (loc) => `Vous êtes près de ${loc}. `,
    quickSummary: 'Voici un résumé rapide : ',
    defaultQuestion: 'Question sur une œuvre.',
    museumNextStep: 'Prochaine étape : comparez les détails de composition avec une œuvre voisine.',
    standardHint: 'Piste utile : observez la composition, la lumière et le contexte historique.',
    closingQuestion: 'Souhaitez-vous une lecture plus technique, biographique ou symbolique ?',
  },
  es: {
    locationPrefix: (loc) => `Estás cerca de ${loc}. `,
    quickSummary: 'Resumen rápido: ',
    defaultQuestion: 'Pregunta sobre una obra de arte.',
    museumNextStep: 'Siguiente paso: compara los detalles de composición con una obra cercana.',
    standardHint: 'Ángulo útil: céntrate en la composición, la luz y el contexto histórico.',
    closingQuestion: '¿Te gustaría una lectura técnica, biográfica o simbólica?',
  },
  de: {
    locationPrefix: (loc) => `Sie befinden sich in der Nähe von ${loc}. `,
    quickSummary: 'Kurze Zusammenfassung: ',
    defaultQuestion: 'Frage zu einem Kunstwerk.',
    museumNextStep: 'Nächster Schritt: Vergleichen Sie Kompositionsdetails mit einem nahen Werk.',
    standardHint:
      'Hilfreicher Blickwinkel: Achten Sie auf Komposition, Licht und historischen Kontext.',
    closingQuestion:
      'Möchten Sie als Nächstes eine technische, biografische oder symbolische Betrachtung?',
  },
  it: {
    locationPrefix: (loc) => `Ti trovi vicino a ${loc}. `,
    quickSummary: 'Riepilogo veloce: ',
    defaultQuestion: "Domanda su un'opera d'arte.",
    museumNextStep: "Prossimo passo: confronta i dettagli compositivi con un'opera vicina.",
    standardHint: 'Angolo utile: concentrati sulla composizione, la luce e il contesto storico.',
    closingQuestion: 'Vorresti una lettura tecnica, biografica o simbolica?',
  },
  ja: {
    locationPrefix: (loc) => `現在${loc}の近くにいます。`,
    quickSummary: '概要: ',
    defaultQuestion: '美術作品に関する質問。',
    museumNextStep: '次のステップ: 近くの作品と構図の詳細を比較してください。',
    standardHint: 'ヒント: 構図、光、歴史的背景に注目してください。',
    closingQuestion: '技術的、伝記的、象徴的な解釈のどれをご希望ですか？',
  },
  zh: {
    locationPrefix: (loc) => `您目前在${loc}附近。`,
    quickSummary: '简要概述: ',
    defaultQuestion: '关于艺术品的问题。',
    museumNextStep: '下一步: 将构图细节与附近的作品进行比较。',
    standardHint: '有用的角度: 关注构图、光线和历史背景。',
    closingQuestion: '您想要技术性、传记性还是象征性的解读？',
  },
};

/**
 * Builds a localized fallback text when the LLM fails, using pre-translated templates.
 */
export function buildLocalizedFallback(
  locale: SupportedLocale,
  opts: {
    location?: string;
    recap: string;
    museumMode: boolean;
  },
): string {
  const t = FALLBACK_TEMPLATES[locale];
  const locationLine = opts.location ? t.locationPrefix(opts.location) : '';
  const nextStep = opts.museumMode ? t.museumNextStep : t.standardHint;

  return [`${locationLine}${t.quickSummary}${opts.recap}`, nextStep, t.closingQuestion].join(' ');
}

export { FALLBACK_TEMPLATES };
