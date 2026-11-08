'use client';

import { useState } from 'react';
import { isEmail } from '@musaium/shared/validation';

import Button from '@/components/ui/Button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { HoneypotField } from '@/components/forms/HoneypotField';
import { usePublicSubmit } from '@/components/forms/usePublicSubmit';
import type { Dictionary, Locale } from '@/lib/i18n';

interface BetaSignupSectionProps {
  dict: Dictionary['landing']['beta'];
  locale: Locale;
}

type ValidationKey = 'email' | 'consent';

/**
 * Public beta-signup section (R3 §1 R2-R11 + D7 a11y).
 *
 * - 1 email + 1 consent + 1 hidden honeypot — friction maximally low.
 * - Posts JSON to `/api/leads/beta` on submit (R6); 202 toggles to the
 *   success copy in a `role="status" aria-live="polite"` region (R7 +
 *   R20).
 * - Idempotent duplicates surface the SAME success copy as a first signup —
 *   no enumeration leak (R16).
 */
export default function BetaSignupSection({ dict, locale }: BetaSignupSectionProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ValidationKey, string>>>({});
  const { website, setWebsite, submitting, submitted, failed, send } =
    usePublicSubmit('/api/leads/beta');

  const requiredMark = dict.errorValidation;
  const pendingLabel = dict.sending;

  function validate(): Partial<Record<ValidationKey, string>> {
    const next: Partial<Record<ValidationKey, string>> = {};
    if (!email.trim()) next.email = requiredMark;
    else if (!isEmail(email.trim())) next.email = dict.errorEmail;
    if (!consent) next.consent = requiredMark;
    return next;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    void send({ email: email.trim(), consent: true });
  }

  return (
    <section
      id="beta-signup"
      aria-labelledby="beta-signup-heading"
      className="mx-auto w-full max-w-2xl px-4 py-16"
    >
      <div className="text-center">
        <h2
          id="beta-signup-heading"
          className="text-2xl font-semibold text-text-primary md:text-3xl"
        >
          {dict.heading}
        </h2>
        <p className="mt-3 text-base text-text-secondary">{dict.subheading}</p>
      </div>

      {submitted ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-center"
        >
          <p className="text-base font-medium text-green-800">{dict.success}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="beta-email"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              {dict.fieldEmail}
            </label>
            <input
              id="beta-email"
              name="email"
              type="email"
              required
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'beta-email-error' : undefined}
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            <FormFieldError id="beta-email-error" error={errors.email} />
          </div>

          {/* Consent */}
          <div className="flex items-start gap-3">
            <input
              id="beta-consent"
              name="consent"
              type="checkbox"
              required
              aria-required="true"
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby="beta-consent-help"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
              }}
              className="mt-1 h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
            />
            <label htmlFor="beta-consent" className="text-sm text-text-secondary">
              <span>{dict.fieldConsent}</span>{' '}
              <a
                id="beta-consent-help"
                href={`/${locale}/privacy`}
                className="text-primary-600 underline hover:text-primary-700"
              >
                {dict.consentPrivacyLink}
              </a>
            </label>
          </div>
          <FormFieldError error={errors.consent} />

          {/* Honeypot — must NOT be visible to humans, NOT in tab order */}
          <HoneypotField value={website} onChange={setWebsite} />

          {/* Polite live region for the error message (success has its own block above) */}
          <div aria-live="polite" className="min-h-[1.5rem]">
            {failed ? <AlertBanner variant="error" message={dict.error} /> : null}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? pendingLabel : dict.submit}
          </Button>
        </form>
      )}
    </section>
  );
}
