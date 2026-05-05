import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LandingJsonLd from '../LandingJsonLd';

const FAQ_FIXTURE = [
  { question: 'Q1?', answer: 'A1.' },
  { question: 'Q2?', answer: 'A2.' },
];

interface JsonLdMobileApp {
  '@context': string;
  '@type': 'MobileApplication';
  name: string;
  applicationCategory: string;
  operatingSystem: string;
  url: string;
  inLanguage: string[];
  offers: { price: string; priceCurrency: string };
  featureList: string[];
  screenshot: string[];
  author: { name: string };
}

interface JsonLdOrg {
  '@type': 'Organization';
  name: string;
  alternateName: string;
  logo: string;
  contactPoint: { contactType: string; url: string };
}

interface JsonLdSite {
  '@type': 'WebSite';
  name: string;
  url: string;
}

interface JsonLdFaqEntry {
  '@type': 'Question';
  name: string;
  acceptedAnswer: { '@type': 'Answer'; text: string };
}

interface JsonLdFaq {
  '@type': 'FAQPage';
  mainEntity: JsonLdFaqEntry[];
}

type JsonLdPayload = JsonLdMobileApp | JsonLdOrg | JsonLdSite | JsonLdFaq;

function parseScripts(container: HTMLElement): JsonLdPayload[] {
  const scripts = container.querySelectorAll('script[type="application/ld+json"]');
  return Array.from(scripts).map((s) => JSON.parse(s.textContent) as JsonLdPayload);
}

describe('LandingJsonLd', () => {
  it('emits exactly 4 application/ld+json scripts in order: MobileApplication, Organization, WebSite, FAQPage', () => {
    const { container } = render(
      <LandingJsonLd
        locale="en"
        baseUrl="https://example.test"
        description="Visit museums with an AI companion"
        faqItems={FAQ_FIXTURE}
      />,
    );

    const payloads = parseScripts(container);
    expect(payloads).toHaveLength(4);
    expect(payloads[0]['@type']).toBe('MobileApplication');
    expect(payloads[1]['@type']).toBe('Organization');
    expect(payloads[2]['@type']).toBe('WebSite');
    expect(payloads[3]['@type']).toBe('FAQPage');
  });

  it('builds the MobileApplication payload with stable schema.org keys', () => {
    const { container } = render(
      <LandingJsonLd
        locale="en"
        baseUrl="https://example.test"
        description="Visit museums with an AI companion"
        faqItems={FAQ_FIXTURE}
      />,
    );

    const app = parseScripts(container)[0] as JsonLdMobileApp;
    expect(app['@context']).toBe('https://schema.org');
    expect(app.name).toBe('Musaium');
    expect(app.applicationCategory).toBe('TravelApplication');
    expect(app.operatingSystem).toBe('iOS 16+, Android 10+');
    expect(app.url).toBe('https://example.test/en');
    expect(app.inLanguage).toEqual(['fr', 'en']);
    expect(app.offers.price).toBe('0');
    expect(app.offers.priceCurrency).toBe('EUR');
    expect(app.featureList).toHaveLength(5);
    expect(app.author.name).toBe('InnovMind');
    expect(app.screenshot).toEqual([
      'https://example.test/images/screenshots/02_home.png',
      'https://example.test/images/screenshots/04_chat.png',
    ]);
  });

  it('builds the Organization payload with logo + customer-support contact pointing to the localized support page', () => {
    const { container } = render(
      <LandingJsonLd
        locale="fr"
        baseUrl="https://example.test"
        description="Visitez les musées avec un compagnon IA"
        faqItems={FAQ_FIXTURE}
      />,
    );

    const org = parseScripts(container)[1] as JsonLdOrg;
    expect(org.name).toBe('Musaium');
    expect(org.alternateName).toBe('InnovMind');
    expect(org.logo).toBe('https://example.test/images/logo.png');
    expect(org.contactPoint.contactType).toBe('customer support');
    expect(org.contactPoint.url).toBe('https://example.test/fr/support');
  });

  it('builds the FAQPage mainEntity from the typed faqItems prop preserving order', () => {
    const { container } = render(
      <LandingJsonLd
        locale="en"
        baseUrl="https://example.test"
        description="d"
        faqItems={FAQ_FIXTURE}
      />,
    );

    const faq = parseScripts(container)[3] as JsonLdFaq;
    expect(Array.isArray(faq.mainEntity)).toBe(true);
    expect(faq.mainEntity).toHaveLength(2);
    expect(faq.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Q1?',
      acceptedAnswer: { '@type': 'Answer', text: 'A1.' },
    });
    expect(faq.mainEntity[1].name).toBe('Q2?');
  });
});
