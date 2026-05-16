import {
  REVIEW_LOCALES,
  buildReviewModerationEmail,
  type ReviewModerationEmailInput,
} from '@shared/email/templates';

const baseInput: ReviewModerationEmailInput = {
  recipientName: 'Camille',
  rating: 4,
  comment: 'Great visit',
  locale: 'fr',
  status: 'approved',
};

const makeInput = (
  overrides: Partial<ReviewModerationEmailInput> = {},
): ReviewModerationEmailInput => ({
  ...baseInput,
  ...overrides,
});

describe('REVIEW_LOCALES.fr — subject', () => {
  it('returns "Votre avis a été publié" when status=approved', () => {
    expect(REVIEW_LOCALES.fr.subject('approved')).toBe('Votre avis a été publié');
  });

  it('returns "Votre avis a été refusé" when status=rejected', () => {
    // Kills L38:59 [NoCoverage] StringLiteral mutant on the rejected fallback.
    expect(REVIEW_LOCALES.fr.subject('rejected')).toBe('Votre avis a été refusé');
  });
});

describe('REVIEW_LOCALES.fr — heading', () => {
  it('returns "Votre avis est en ligne" when status=approved', () => {
    expect(REVIEW_LOCALES.fr.heading('approved')).toBe('Votre avis est en ligne');
  });

  it('returns "Votre avis n\'a pas été publié" when status=rejected', () => {
    // Kills L40:7 ConditionalExpression→true + L40:59 StringLiteral mutants.
    expect(REVIEW_LOCALES.fr.heading('rejected')).toBe("Votre avis n'a pas été publié");
  });
});

describe('REVIEW_LOCALES.fr — body', () => {
  it('returns the approved sentence when status=approved (interpolates name + rating)', () => {
    // Kills L42:7 ConditionalExpression→false (only approved branch produces this exact string).
    expect(REVIEW_LOCALES.fr.body('Alice', 4, 'approved')).toBe(
      "Bonjour Alice, merci pour votre retour de 4/5 — il est désormais visible publiquement sur Musaium et inspirera d'autres visiteurs.",
    );
  });

  it('returns the rejected sentence when status=rejected (interpolates name + rating)', () => {
    // Kills L42:7 ConditionalExpression→true (only rejected branch produces this exact string).
    expect(REVIEW_LOCALES.fr.body('Bob', 2, 'rejected')).toBe(
      "Bonjour Bob, votre avis de 2/5 n'a pas pu être publié en l'état. Notre équipe a décidé de ne pas l'afficher. Vous pouvez nous contacter si vous souhaitez en savoir plus.",
    );
  });
});

describe('REVIEW_LOCALES.fr — preheader', () => {
  it('returns the approved preheader literal exactly when status=approved', () => {
    // Kills L46:7 ConditionalExpression→false, L46:18 StringLiteral 'approved', L47:11 StringLiteral mutants.
    expect(REVIEW_LOCALES.fr.preheader('approved')).toBe(
      'Merci pour votre retour, il est en ligne.',
    );
  });

  it('returns the rejected preheader literal exactly when status=rejected', () => {
    // Kills L46:7 ConditionalExpression→true and EqualityOperator (status !== 'approved'),
    // plus L48:11 StringLiteral mutant.
    expect(REVIEW_LOCALES.fr.preheader('rejected')).toBe("Votre avis n'a pas été publié.");
  });
});

describe('REVIEW_LOCALES.fr — static fields', () => {
  it('exposes the FR rating label, footer, and tag literals', () => {
    expect(REVIEW_LOCALES.fr.ratingLabel).toBe('Votre note');
    expect(REVIEW_LOCALES.fr.footer).toBe(
      'Vous recevez cet email parce que vous avez activé les notifications de modération. Vous pouvez les désactiver à tout moment dans vos paramètres.',
    );
    expect(REVIEW_LOCALES.fr.approvedTag).toBe('Publié');
    expect(REVIEW_LOCALES.fr.rejectedTag).toBe('Refusé');
  });
});

describe('REVIEW_LOCALES.en — subject', () => {
  it('returns "Your review has been published" when status=approved', () => {
    // Kills L57:7 ConditionalExpression→false + L57:18 StringLiteral 'approved' mutants.
    expect(REVIEW_LOCALES.en.subject('approved')).toBe('Your review has been published');
  });

  it('returns "Your review was rejected" when status=rejected', () => {
    // Kills L57:31 [NoCoverage] StringLiteral mutant on the rejected fallback.
    expect(REVIEW_LOCALES.en.subject('rejected')).toBe('Your review was rejected');
  });
});

describe('REVIEW_LOCALES.en — heading', () => {
  it('returns "Your review is live" when status=approved', () => {
    // Kills L59:7 ConditionalExpression→true mutant.
    expect(REVIEW_LOCALES.en.heading('approved')).toBe('Your review is live');
  });

  it('returns "Your review was not published" when status=rejected', () => {
    expect(REVIEW_LOCALES.en.heading('rejected')).toBe('Your review was not published');
  });
});

describe('REVIEW_LOCALES.en — body', () => {
  it('returns the approved sentence with name + rating interpolation', () => {
    // Kills L61:18 StringLiteral 'approved' + L62:11 template-string mutant.
    expect(REVIEW_LOCALES.en.body('Alice', 4, 'approved')).toBe(
      'Hello Alice, thanks for your 4/5 review — it is now publicly visible on Musaium and will inspire other visitors.',
    );
  });

  it('returns the rejected sentence with name + rating interpolation', () => {
    // Kills L63:11 template-string mutant.
    expect(REVIEW_LOCALES.en.body('Bob', 2, 'rejected')).toBe(
      "Hello Bob, your 2/5 review could not be published as-is. Our team decided not to display it. Contact us if you'd like more information.",
    );
  });
});

describe('REVIEW_LOCALES.en — preheader', () => {
  it('returns "Thanks for your review, it is now live." when status=approved', () => {
    // Kills L65:7 ConditionalExpression→true mutant.
    expect(REVIEW_LOCALES.en.preheader('approved')).toBe('Thanks for your review, it is now live.');
  });

  it('returns "Your review was not published." when status=rejected', () => {
    // Kills L67:11 StringLiteral mutant on rejected branch.
    expect(REVIEW_LOCALES.en.preheader('rejected')).toBe('Your review was not published.');
  });
});

describe('REVIEW_LOCALES.en — static fields', () => {
  it('exposes the EN rating label, footer, and tag literals', () => {
    expect(REVIEW_LOCALES.en.ratingLabel).toBe('Your rating');
    expect(REVIEW_LOCALES.en.footer).toBe(
      'You are receiving this email because you enabled moderation notifications. You can disable them anytime in your settings.',
    );
    expect(REVIEW_LOCALES.en.approvedTag).toBe('Published');
    expect(REVIEW_LOCALES.en.rejectedTag).toBe('Rejected');
  });
});

describe('buildReviewModerationEmail — locale + status integration', () => {
  it('uses the FR subject + heading + preheader + body for fr/approved', () => {
    const html = buildReviewModerationEmail(makeInput({ locale: 'fr', status: 'approved' }));
    expect(html).toContain('Votre avis est en ligne'); // FR heading
    expect(html).toContain('Merci pour votre retour, il est en ligne.'); // FR preheader approved
    expect(html).toContain(
      'Bonjour Camille, merci pour votre retour de 4/5 — il est désormais visible publiquement sur Musaium et inspirera d&#39;autres visiteurs.',
    );
    expect(html).toContain('Vous recevez cet email parce que vous avez activé');
  });

  it('uses the FR rejected heading + preheader + body when status=rejected', () => {
    const html = buildReviewModerationEmail(
      makeInput({ locale: 'fr', status: 'rejected', comment: 'Great visit' }),
    );
    // Heading is injected raw into the layout (no escape).
    expect(html).toContain("Votre avis n'a pas été publié");
    // Preheader is also injected raw into the hidden span (no escape).
    expect(html).toContain("Votre avis n'a pas été publié.</span>");
    // Body is escaped via escapeHtml() before being inlined.
    expect(html).toContain(
      'Bonjour Camille, votre avis de 4/5 n&#39;a pas pu être publié en l&#39;état.',
    );
  });

  it('uses the EN approved heading + preheader + body when locale=en + status=approved', () => {
    const html = buildReviewModerationEmail(makeInput({ locale: 'en', status: 'approved' }));
    expect(html).toContain('Your review is live');
    expect(html).toContain('Thanks for your review, it is now live.');
    expect(html).toContain(
      'Hello Camille, thanks for your 4/5 review — it is now publicly visible on Musaium and will inspire other visitors.',
    );
    expect(html).toContain(
      'You are receiving this email because you enabled moderation notifications.',
    );
  });

  it('uses the EN rejected heading + preheader + body when locale=en + status=rejected', () => {
    const html = buildReviewModerationEmail(
      makeInput({ locale: 'en', status: 'rejected', comment: 'Great visit' }),
    );
    expect(html).toContain('Your review was not published');
    expect(html).toContain('Your review was not published.'); // preheader
    expect(html).toContain(
      'Hello Camille, your 4/5 review could not be published as-is. Our team decided not to display it. Contact us if you&#39;d like more information.',
    );
  });
});

describe('buildReviewModerationEmail — tag colors', () => {
  it('renders the approved tag with green background #DCFCE7 and dark-green text #166534', () => {
    // Kills L88:30 StringLiteral '#DCFCE7' (tagBg approved branch).
    const html = buildReviewModerationEmail(makeInput({ status: 'approved' }));
    expect(html).toContain('background-color:#DCFCE7');
    expect(html).toContain('color:#166534');
    expect(html).toContain('>Publié<');
  });

  it('renders the rejected tag with amber background #FEF3C7 and dark-amber text #92400E', () => {
    // Kills L88:42 StringLiteral '#FEF3C7' + L89:33 StringLiteral '#92400E' (rejected branches).
    const html = buildReviewModerationEmail(makeInput({ status: 'rejected' }));
    expect(html).toContain('background-color:#FEF3C7');
    expect(html).toContain('color:#92400E');
    expect(html).toContain('>Refusé<');
  });
});

describe('buildReviewModerationEmail — comment blockquote', () => {
  it('includes the comment blockquote when status=approved AND comment is non-empty after trim', () => {
    // Kills L95:19 ConditionalExpression→true (otherwise the empty branch would be taken)
    // and provides positive proof for the >0 boundary.
    const html = buildReviewModerationEmail(
      makeInput({ status: 'approved', comment: 'Beautiful museum' }),
    );
    expect(html).toContain('"Beautiful museum"');
    expect(html).toContain('border-left:3px solid #C49A3C');
  });

  it('omits the comment blockquote when status=approved but comment is empty string', () => {
    const html = buildReviewModerationEmail(makeInput({ status: 'approved', comment: '' }));
    expect(html).not.toContain('border-left:3px solid #C49A3C');
    // Kills L104:9 StringLiteral → "Stryker was here!": the else branch of the
    // comment-blockquote ternary must render an EMPTY string, not any literal.
    expect(html).not.toContain('Stryker was here!');
  });

  it('omits the comment blockquote when status=approved but comment is whitespace-only', () => {
    // Kills L95:19 EqualityOperator (`>= 0` would still match the empty branch, so
    // an all-whitespace comment that trims to length 0 must NOT render the blockquote).
    const html = buildReviewModerationEmail(
      makeInput({ status: 'approved', comment: '   \n\t  ' }),
    );
    expect(html).not.toContain('border-left:3px solid #C49A3C');
    expect(html).not.toContain('Stryker was here!');
  });

  it('renders the blockquote for a single-character comment (boundary length=1 > 0)', () => {
    // Reinforces the >0 boundary — single non-whitespace char must include the block.
    const html = buildReviewModerationEmail(makeInput({ status: 'approved', comment: 'x' }));
    expect(html).toContain('"x"');
    expect(html).toContain('border-left:3px solid #C49A3C');
  });

  it('omits the comment blockquote when status=rejected even if a non-empty comment is given', () => {
    // Kills the isApproved-side of L95:19 — rejected status must never echo the comment block.
    const html = buildReviewModerationEmail(
      makeInput({ status: 'rejected', comment: 'Spammy comment' }),
    );
    expect(html).not.toContain('border-left:3px solid #C49A3C');
    expect(html).not.toContain('"Spammy comment"');
  });

  it('replaces newlines in the comment with <br/> inside the blockquote', () => {
    const html = buildReviewModerationEmail(
      makeInput({ status: 'approved', comment: 'Line one\nLine two' }),
    );
    expect(html).toContain('"Line one<br/>Line two"');
  });

  it('escapes HTML inside the comment blockquote', () => {
    const html = buildReviewModerationEmail(
      makeInput({ status: 'approved', comment: 'Great <b>museum</b>' }),
    );
    expect(html).not.toContain('<b>museum</b>');
    expect(html).toContain('&lt;b&gt;museum&lt;/b&gt;');
  });
});

describe('buildReviewModerationEmail — rating stars and rating block', () => {
  it('renders the rating block with the rating label and "<n>/5" text', () => {
    // Kills L106:23 (template-literal mutant for the whole ratingBlock template):
    // any replacement to `` would drop both the rating label and the "n/5" output entirely.
    const html = buildReviewModerationEmail(makeInput({ rating: 4 }));
    expect(html).toContain('Votre note');
    expect(html).toContain('>4/5<');
  });

  it('renders 4 filled and 1 empty stars for rating=4', () => {
    // Kills L76:55 BlockStatement→{} on renderRatingStars — empty body would return undefined
    // and the stars would not appear in the HTML.
    const html = buildReviewModerationEmail(makeInput({ rating: 4 }));
    expect(html).toContain('★★★★');
    expect(html).toContain('☆');
  });

  it('clamps a rating > 5 down to 5 filled stars (and 0 empty)', () => {
    const html = buildReviewModerationEmail(makeInput({ rating: 99 }));
    expect(html).toContain('★★★★★');
    // No empty star span content when clamped to 5.
    expect(html).toMatch(/letter-spacing:0\.08em;font-size:18px;">(?!★)(?!☆)/);
  });

  it('clamps a rating < 0 up to 0 filled stars (and 5 empty)', () => {
    const html = buildReviewModerationEmail(makeInput({ rating: -3 }));
    expect(html).toContain('☆☆☆☆☆');
  });

  it('rounds a fractional rating before rendering stars', () => {
    const html = buildReviewModerationEmail(makeInput({ rating: 3.6 }));
    // 3.6 → round → 4 filled
    expect(html).toContain('★★★★');
    expect(html).toContain('☆');
  });

  it('does not throw and produces an HTML document for any in-range rating', () => {
    for (const rating of [0, 1, 2, 3, 4, 5]) {
      const html = buildReviewModerationEmail(makeInput({ rating }));
      expect(html).toContain('<!DOCTYPE html');
      expect(html).toContain(`>${String(rating)}/5<`);
    }
  });
});

describe('buildReviewModerationEmail — XSS / escape behavior', () => {
  it('escapes the recipientName in the body paragraph', () => {
    const html = buildReviewModerationEmail(
      makeInput({ recipientName: '<script>alert(1)</script>' }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
