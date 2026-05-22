import { getDictionary, type Locale } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import { getSubprocessors } from '@/lib/privacy-content';
import privacyCanonical from '@/lib/legal/privacy-content.canonical.json';
import type { Metadata } from 'next';

interface SubprocessorsPageProps {
  params: Promise<{ locale: string }>;
}

const TABLE_HEADERS_BY_LOCALE: Record<
  'en' | 'fr',
  {
    intro: string;
    name: string;
    role: string;
    jurisdiction: string;
    transfer: string;
    category: string;
  }
> = {
  en: {
    intro:
      'Musaium relies on the following sub-processors to operate the service. Each transfer outside the European Economic Area (EEA) is governed by appropriate safeguards (SCC, adequacy decision, or equivalent).',
    name: 'Sub-processor',
    role: 'Role',
    jurisdiction: 'Jurisdiction',
    transfer: 'Transfer mechanism',
    category: 'Category',
  },
  fr: {
    intro:
      "Musaium s'appuie sur les sous-traitants suivants pour faire fonctionner le service. Chaque transfert hors de l'Espace économique européen (EEE) est encadré par des garanties appropriées (CCT, décision d'adéquation ou mécanisme équivalent).",
    name: 'Sous-traitant',
    role: 'Rôle',
    jurisdiction: 'Juridiction',
    transfer: 'Mécanisme de transfert',
    category: 'Catégorie',
  },
};

function pickLocale(locale: string): 'en' | 'fr' {
  return locale === 'fr' ? 'fr' : 'en';
}

export async function generateMetadata({ params }: SubprocessorsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return {
    title: dict.footer.links.subprocessors,
    alternates: getAlternates(locale, '/subprocessors'),
    openGraph: getOpenGraph(locale),
  };
}

export default async function SubprocessorsPage({ params }: SubprocessorsPageProps) {
  const { locale } = await params;
  const loc = pickLocale(locale);
  const dict = await getDictionary(loc);
  const headers = TABLE_HEADERS_BY_LOCALE[loc];
  const recipients = getSubprocessors(loc);
  const { version, lastUpdated } = privacyCanonical as { version: string; lastUpdated: string };

  return (
    <div className="bg-white">
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 text-center sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {dict.footer.links.subprocessors}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            {version} — {lastUpdated}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="mb-8 text-text-secondary leading-relaxed">{headers.intro}</p>

        <div className="overflow-x-auto rounded-lg border border-primary-100/50">
          <table className="w-full text-sm">
            <thead className="bg-primary-50/50 text-left text-text-primary">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {headers.name}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {headers.role}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {headers.jurisdiction}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {headers.transfer}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {headers.category}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100/50 text-text-secondary">
              {recipients.map((r) => (
                <tr key={r.name}>
                  <td className="px-4 py-3 font-medium text-text-primary">{r.name}</td>
                  <td className="px-4 py-3">{r.role}</td>
                  <td className="px-4 py-3">{r.jurisdiction}</td>
                  <td className="px-4 py-3">{r.transferMechanism}</td>
                  <td className="px-4 py-3">{r.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
