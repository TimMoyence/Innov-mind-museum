import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import type { Metadata } from 'next';

interface CookiesPageProps {
  params: Promise<{ locale: string }>;
}

type LegalLocale = 'en' | 'fr';

interface CookieEntry {
  name: string;
  purpose: string;
  duration: string;
  scope: string;
}

interface CookiesCopy {
  intro: string;
  legalBasis: string;
  noBanner: string;
  tableTitle: string;
  headers: { name: string; purpose: string; duration: string; scope: string };
  entries: CookieEntry[];
  contactNote: string;
}

const COPY: Record<LegalLocale, CookiesCopy> = {
  en: {
    intro:
      'Musaium operates under the strictly-necessary exemption of ePrivacy Directive Article 5(3): we only set cookies that are technically required to deliver the service the user explicitly requested. No tracking cookies, no behavioural analytics, no advertising identifiers, no Session Replay.',
    legalBasis:
      'Because every cookie below is strictly necessary, prior consent is not required (ePrivacy Article 5(3), recital 25; CNIL guidance on consent exemptions).',
    noBanner:
      'You will not see a cookie banner on musaium.com because we have nothing for which we would need to ask consent.',
    tableTitle: 'Cookies we set',
    headers: {
      name: 'Cookie name',
      purpose: 'Purpose',
      duration: 'Duration',
      scope: 'Scope',
    },
    entries: [
      {
        name: 'admin-authz',
        purpose: 'Admin panel authentication (JWT carrier, HttpOnly).',
        duration: '15 minutes (rotated via refresh token).',
        scope: '/admin only.',
      },
      {
        name: 'csrf_token',
        purpose: 'Cross-site request forgery protection for admin write actions.',
        duration: 'Session.',
        scope: '/admin only.',
      },
      {
        name: 'connect.sid',
        purpose:
          'Backend session identifier used for authenticated API calls from the marketing site.',
        duration: 'Session.',
        scope: 'Backend API origin only.',
      },
    ],
    contactNote:
      'Questions about cookies? Contact contact@musaium.com. We will respond within 30 days.',
  },
  fr: {
    intro:
      "Musaium opère sous l'exemption « strictement nécessaire » de l'article 5(3) de la directive ePrivacy : nous n'utilisons que des cookies techniquement requis pour fournir le service explicitement demandé par l'utilisateur. Aucun cookie de tracking, aucun analytics comportemental, aucun identifiant publicitaire, aucun Session Replay.",
    legalBasis:
      "Tous les cookies listés ci-dessous étant strictement nécessaires, un consentement préalable n'est pas requis (ePrivacy Art. 5(3), considérant 25 ; lignes directrices CNIL sur les exemptions de consentement).",
    noBanner:
      "Vous ne verrez pas de bannière cookies sur musaium.com parce que nous n'avons rien à propos de quoi nous devrions demander votre consentement.",
    tableTitle: 'Cookies déposés',
    headers: {
      name: 'Nom du cookie',
      purpose: 'Finalité',
      duration: 'Durée',
      scope: 'Portée',
    },
    entries: [
      {
        name: 'admin-authz',
        purpose: "Authentification du panneau d'administration (porteur JWT, HttpOnly).",
        duration: '15 minutes (rotation via refresh token).',
        scope: '/admin uniquement.',
      },
      {
        name: 'csrf_token',
        purpose:
          "Protection contre la falsification de requête inter-site pour les actions d'écriture admin.",
        duration: 'Session.',
        scope: '/admin uniquement.',
      },
      {
        name: 'connect.sid',
        purpose:
          'Identifiant de session backend utilisé pour les appels API authentifiés depuis le site marketing.',
        duration: 'Session.',
        scope: 'Origine API backend uniquement.',
      },
    ],
    contactNote:
      'Questions sur les cookies ? Contactez contact@musaium.com. Nous répondons sous 30 jours.',
  },
};

function pickLocale(locale: string): LegalLocale {
  return locale === 'fr' ? 'fr' : 'en';
}

export async function generateMetadata({ params }: CookiesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.footer.links.cookies,
    alternates: getAlternates(locale, '/cookies'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function CookiesPage({ params }: CookiesPageProps) {
  const { locale } = await params;
  const loc = pickLocale(locale);
  const dict = await getDictionary(loc);
  const copy = COPY[loc];

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.footer.links.cookies}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">ePrivacy Art. 5(3)</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="prose prose-slate max-w-none">
          <p className="text-text-secondary leading-relaxed">{copy.intro}</p>
          <p className="mt-4 text-text-secondary leading-relaxed">{copy.legalBasis}</p>
          <p className="mt-4 text-text-secondary leading-relaxed">{copy.noBanner}</p>

          <h2 className="mt-10 text-xl font-semibold text-text-primary">{copy.tableTitle}</h2>

          <div className="not-prose mt-4 overflow-x-auto rounded-lg border border-primary-100/50">
            <table className="w-full text-sm">
              <thead className="bg-primary-50/50 text-left text-text-primary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {copy.headers.name}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {copy.headers.purpose}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {copy.headers.duration}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {copy.headers.scope}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100/50 text-text-secondary">
                {copy.entries.map((e) => (
                  <tr key={e.name}>
                    <td className="px-4 py-3 font-mono text-text-primary">{e.name}</td>
                    <td className="px-4 py-3">{e.purpose}</td>
                    <td className="px-4 py-3">{e.duration}</td>
                    <td className="px-4 py-3">{e.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-text-secondary leading-relaxed">{copy.contactNote}</p>
        </article>
      </section>
    </div>
  );
}
