'use client';

import { useState } from 'react';

import Button from '@/components/ui/Button';
import type { Locale } from '@/lib/i18n';

/**
 * Strict subset of `Dictionary['landing']['beta']` consumed by this component.
 * Mirrors the canonical `Dictionary['landing']['beta']` shape at
 * `museum-web/src/lib/i18n.ts:177-188`.
 */
interface BetaCopyDict {
  heading: string;
  subheading: string;
  fieldEmail: string;
  fieldConsent: string;
  consentPrivacyLink: string;
  submit: string;
  sending: string;
  success: string;
  error: string;
  errorValidation: string;
}

interface BetaSignupSectionProps {
  dict: BetaCopyDict;
  locale: Locale;
}

type ValidationKey = 'email' | 'consent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENDPOINT = '/api/leads/beta';

/**
 * Public beta-signup section (R3 §1 R2-R11 + D7 a11y).
 *
 * - 1 email + 1 consent + 1 hidden honeypot — friction maximally low.
 * - Posts JSON to `/api/leads/beta` on submit (R6); 202 toggles to the
 *   success copy in a `role="status" aria-live="polite"` region (R7 +
 *   R20).
 * - Honeypot non-empty → silent-success UX (still posts so BE drops via R10
 *   server-side, preserving response timing parity).
 * - Idempotent duplicates surface the SAME success copy as a first signup —
 *   no enumeration leak (R16).
 */
export default function BetaSignupSection({ dict, locale }: BetaSignupSectionProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot — bots auto-fill; humans never see it (aria-hidden + tabIndex=-1).
  const [website, setWebsite] = useState('');

  const [errors, setErrors] = useState<Partial<Record<ValidationKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requiredMark = dict.errorValidation;
  const pendingLabel = dict.sending;

  function validate(): Partial<Record<ValidationKey, string>> {
    const next: Partial<Record<ValidationKey, string>> = {};
    if (!email.trim() || !EMAIL_RE.test(email.trim())) next.email = requiredMark;
    if (!consent) next.consent = requiredMark;
    return next;
  }

  async function postSignup(): Promise<void> {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          consent: true,
          website,
        }),
      });
      // R10 anti-enumeration : honeypot is non-empty but we still display the
      // canonical success state to mask the bot detection. The body has been
      // posted (BE silent-drop via R10 use-case-level).
      if (!response.ok && website.trim().length === 0) {
        throw new Error(`Beta signup failed (${String(response.status)})`);
      }
      setSubmitted(true);
    } catch {
      setErrorMessage(dict.error);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    // Honeypot-filled forms always succeed UX-side regardless of validation —
    // matches the BE silent-drop policy (R10).
    if (website.trim().length > 0) {
      void postSignup();
      return;
    }
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    void postSignup();
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
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            {errors.email ? (
              <p id="beta-email-error" role="alert" className="mt-1 text-sm text-red-700">
                {errors.email}
              </p>
            ) : null}
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
          {errors.consent ? (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {errors.consent}
            </p>
          ) : null}

          {/* Honeypot — must NOT be visible to humans, NOT in tab order */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-10000px',
              height: 0,
              width: 0,
              overflow: 'hidden',
            }}
          >
            <label htmlFor="beta-website">Website</label>
            <input
              id="beta-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
              }}
            />
          </div>

          {/* Polite live region for the error message (success has its own block above) */}
          <div aria-live="polite" className="min-h-[1.5rem]">
            {errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? pendingLabel : dict.submit}
          </Button>
        </form>
      )}
    </section>
  );
}
