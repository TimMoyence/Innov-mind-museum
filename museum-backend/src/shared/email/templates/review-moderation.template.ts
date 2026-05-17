import { escapeHtml } from '../escape-html';
import { renderEmailLayout } from './layout';

export type ReviewLocale = 'fr' | 'en';
export type ReviewStatus = 'approved' | 'rejected';

export interface ReviewModerationEmailInput {
  recipientName: string;
  rating: number;
  comment: string;
  locale: ReviewLocale;
  status: ReviewStatus;
}

interface LocaleCopy {
  subject: (status: ReviewStatus) => string;
  heading: (status: ReviewStatus) => string;
  body: (name: string, rating: number, status: ReviewStatus) => string;
  preheader: (status: ReviewStatus) => string;
  ratingLabel: string;
  footer: string;
  approvedTag: string;
  rejectedTag: string;
}

export const REVIEW_LOCALES: Record<ReviewLocale, LocaleCopy> = {
  fr: {
    subject: (status) =>
      status === 'approved' ? 'Votre avis a été publié' : 'Votre avis a été refusé',
    heading: (status) =>
      status === 'approved' ? 'Votre avis est en ligne' : "Votre avis n'a pas été publié",
    body: (name, rating, status) =>
      status === 'approved'
        ? `Bonjour ${name}, merci pour votre retour de ${String(rating)}/5 — il est désormais visible publiquement sur Musaium et inspirera d'autres visiteurs.`
        : `Bonjour ${name}, votre avis de ${String(rating)}/5 n'a pas pu être publié en l'état. Notre équipe a décidé de ne pas l'afficher. Vous pouvez nous contacter si vous souhaitez en savoir plus.`,
    preheader: (status) =>
      status === 'approved'
        ? 'Merci pour votre retour, il est en ligne.'
        : "Votre avis n'a pas été publié.",
    ratingLabel: 'Votre note',
    footer:
      'Vous recevez cet email parce que vous avez activé les notifications de modération. Vous pouvez les désactiver à tout moment dans vos paramètres.',
    approvedTag: 'Publié',
    rejectedTag: 'Refusé',
  },
  en: {
    subject: (status) =>
      status === 'approved' ? 'Your review has been published' : 'Your review was rejected',
    heading: (status) =>
      status === 'approved' ? 'Your review is live' : 'Your review was not published',
    body: (name, rating, status) =>
      status === 'approved'
        ? `Hello ${name}, thanks for your ${String(rating)}/5 review — it is now publicly visible on Musaium and will inspire other visitors.`
        : `Hello ${name}, your ${String(rating)}/5 review could not be published as-is. Our team decided not to display it. Contact us if you'd like more information.`,
    preheader: (status) =>
      status === 'approved'
        ? 'Thanks for your review, it is now live.'
        : 'Your review was not published.',
    ratingLabel: 'Your rating',
    footer:
      'You are receiving this email because you enabled moderation notifications. You can disable them anytime in your settings.',
    approvedTag: 'Published',
    rejectedTag: 'Rejected',
  },
};

const renderRatingStars = (rating: number): string => {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  const filled = '★'.repeat(safe);
  const empty = '☆'.repeat(5 - safe);
  return `<span style="color:#C49A3C;letter-spacing:0.08em;font-size:18px;">${filled}</span><span style="color:#CBD5E1;letter-spacing:0.08em;font-size:18px;">${empty}</span>`;
};

export function buildReviewModerationEmail(input: ReviewModerationEmailInput): string {
  const copy = REVIEW_LOCALES[input.locale];
  const isApproved = input.status === 'approved';
  const tagText = isApproved ? copy.approvedTag : copy.rejectedTag;
  const tagBg = isApproved ? '#DCFCE7' : '#FEF3C7';
  const tagColor = isApproved ? '#166534' : '#92400E';

  const bodyText = escapeHtml(copy.body(input.recipientName, input.rating, input.status));
  const safeComment = escapeHtml(input.comment).replaceAll('\n', '<br/>');

  const blockquote =
    isApproved && input.comment.trim().length > 0
      ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background-color:#F8FAFC;border-left:3px solid #C49A3C;border-radius:0 10px 10px 0;">
          <tr>
            <td style="padding:18px 22px;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155;font-style:italic;">
              "${safeComment}"
            </td>
          </tr>
        </table>`
      : '';

  const ratingBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr>
        <td style="font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#64748B;letter-spacing:0.06em;text-transform:uppercase;padding-bottom:6px;">${copy.ratingLabel}</td>
      </tr>
      <tr>
        <td>${renderRatingStars(input.rating)} <span style="font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#64748B;margin-left:8px;">${String(input.rating)}/5</span></td>
      </tr>
    </table>
  `;

  const bodyHtml = `
    <div style="margin:0 0 20px 0;">
      <span style="display:inline-block;background-color:${tagBg};color:${tagColor};padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${tagText}</span>
    </div>
    <p style="margin:0 0 8px 0;">${bodyText}</p>
    ${ratingBlock}
    ${blockquote}
  `;

  return renderEmailLayout({
    heading: copy.heading(input.status),
    bodyHtml,
    preheader: copy.preheader(input.status),
    locale: input.locale,
    footerNote: copy.footer,
  });
}
