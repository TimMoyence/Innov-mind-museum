interface AiDisclosureBannerProps {
  locale: 'fr' | 'en';
}

const COPY = {
  fr: 'Musaium est un assistant IA. Les réponses sont générées automatiquement et peuvent contenir des erreurs.',
  en: 'Musaium is an AI assistant. Replies are generated automatically and may contain errors.',
} as const;

export function AiDisclosureBanner({ locale }: AiDisclosureBannerProps) {
  return (
    <div
      role="note"
      aria-label="AI disclosure"
      className="mx-auto max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
    >
      {COPY[locale]}
    </div>
  );
}
