interface LandingJsonLdProps {
  locale: string;
  baseUrl: string;
  description: string;
  faqItems: { question: string; answer: string }[];
}

export default function LandingJsonLd({
  locale,
  baseUrl,
  description,
  faqItems,
}: LandingJsonLdProps) {
  const appJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: 'Musaium',
    description,
    applicationCategory: 'TravelApplication',
    operatingSystem: 'iOS 16+, Android 10+',
    inLanguage: ['fr', 'en'],
    url: `${baseUrl}/${locale}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      'AI artwork recognition via computer vision',
      'Contextual AI chat about art history',
      'Interactive museum map with geolocation',
      'Multilingual support (French, English)',
      'Offline conversation history',
    ],
    screenshot: [
      `${baseUrl}/images/screenshots/02_home.png`,
      `${baseUrl}/images/screenshots/04_chat.png`,
    ],
    author: {
      '@type': 'Organization',
      name: 'InnovMind',
      url: baseUrl,
    },
  };

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Musaium',
    alternateName: 'InnovMind',
    url: baseUrl,
    logo: `${baseUrl}/images/logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${baseUrl}/${locale}/support`,
    },
  };

  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Musaium',
    url: baseUrl,
    inLanguage: ['fr', 'en'],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD structured data; content is developer-controlled schema.org objects serialized via JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
      <script
        type="application/ld+json"
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD structured data; content is developer-controlled schema.org objects serialized via JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD structured data; content is developer-controlled schema.org objects serialized via JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <script
        type="application/ld+json"
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD structured data; FAQ content from typed locale dictionary, serialized via JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
