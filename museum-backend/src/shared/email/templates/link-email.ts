import { renderEmailLayout } from './layout';

import type { EmailLocale } from '@shared/email/email-locale';

export interface LinkEmailCopy {
  heading: string;
  preheader: string;
  lead: string;
  expires: string;
  ignored: string;
  cta: string;
  footerNote?: string;
}

export function renderLinkEmail(
  copyByLocale: Record<EmailLocale, LinkEmailCopy>,
  url: string,
  locale: EmailLocale = 'en',
): string {
  const copy = copyByLocale[locale];
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">${copy.lead}</p>
    <p style="margin:0 0 16px 0;color:#475569;">${copy.expires}</p>
    <p style="margin:0;color:#64748B;font-size:14px;line-height:1.6;">${copy.ignored}</p>
  `;

  return renderEmailLayout({
    heading: copy.heading,
    bodyHtml,
    ctaLabel: copy.cta,
    ctaUrl: url,
    fallbackUrl: url,
    preheader: copy.preheader,
    locale,
    ...(copy.footerNote === undefined ? {} : { footerNote: copy.footerNote }),
  });
}
