'use client';

import { useState } from 'react';

import Button from '@/components/ui/Button';
import type { Dictionary, Locale } from '@/lib/i18n';

interface B2bContactFormProps {
  dict: Dictionary['landing']['b2b']['contact'];
  locale: Locale;
}

type ValidationKey = 'email' | 'name' | 'museum' | 'role' | 'message' | 'consent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * B2B contact form (R4 §1 R6-R11). Uses native required + a per-field error
 * map for the empty-submit case, posts JSON to /api/leads/b2b on success and
 * surfaces success/error in a polite aria-live region.
 */
export default function B2bContactForm({ dict, locale }: B2bContactFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [museum, setMuseum] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot — bots auto-fill; humans never see it (aria-hidden + tabIndex=-1).
  const [website, setWebsite] = useState('');

  const [errors, setErrors] = useState<Partial<Record<ValidationKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function validate(): Partial<Record<ValidationKey, string>> {
    const next: Partial<Record<ValidationKey, string>> = {};
    if (!email.trim() || !EMAIL_RE.test(email.trim())) next.email = dict.errorValidation;
    if (!name.trim()) next.name = dict.errorValidation;
    if (!museum.trim()) next.museum = dict.errorValidation;
    if (!role) next.role = dict.errorValidation;
    if (message.trim().length < 10) next.message = dict.errorValidation;
    if (!consent) next.consent = dict.errorValidation;
    return next;
  }

  async function postLead(): Promise<void> {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/leads/b2b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          museum: museum.trim(),
          role,
          message: message.trim(),
          consent: true,
          website,
        }),
      });
      if (!response.ok) {
        throw new Error(`B2B lead submit failed (${String(response.status)})`);
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
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    void postLead();
  }

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-green-200 bg-green-50 p-8 text-center"
      >
        <p className="text-lg font-medium text-green-800">{dict.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Email */}
      <div>
        <label htmlFor="b2b-email" className="mb-1 block text-sm font-medium text-text-primary">
          {dict.fieldEmail}
        </label>
        <input
          id="b2b-email"
          name="email"
          type="email"
          required
          aria-required="true"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'b2b-email-error' : undefined}
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {errors.email ? (
          <p id="b2b-email-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.email}
          </p>
        ) : null}
      </div>

      {/* Name */}
      <div>
        <label htmlFor="b2b-name" className="mb-1 block text-sm font-medium text-text-primary">
          {dict.fieldName}
        </label>
        <input
          id="b2b-name"
          name="name"
          type="text"
          required
          aria-required="true"
          maxLength={120}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'b2b-name-error' : undefined}
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {errors.name ? (
          <p id="b2b-name-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.name}
          </p>
        ) : null}
      </div>

      {/* Museum */}
      <div>
        <label htmlFor="b2b-museum" className="mb-1 block text-sm font-medium text-text-primary">
          {dict.fieldMuseum}
        </label>
        <input
          id="b2b-museum"
          name="museum"
          type="text"
          required
          aria-required="true"
          maxLength={200}
          aria-invalid={errors.museum ? true : undefined}
          aria-describedby={errors.museum ? 'b2b-museum-error' : undefined}
          autoComplete="organization"
          value={museum}
          onChange={(e) => {
            setMuseum(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {errors.museum ? (
          <p id="b2b-museum-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.museum}
          </p>
        ) : null}
      </div>

      {/* Role */}
      <div>
        <label htmlFor="b2b-role" className="mb-1 block text-sm font-medium text-text-primary">
          {dict.fieldRole}
        </label>
        <select
          id="b2b-role"
          name="role"
          required
          aria-required="true"
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={errors.role ? 'b2b-role-error' : undefined}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="" disabled>
            —
          </option>
          {(Object.keys(dict.roleOptions) as (keyof typeof dict.roleOptions)[]).map((key) => (
            <option key={key} value={key}>
              {dict.roleOptions[key]}
            </option>
          ))}
        </select>
        {errors.role ? (
          <p id="b2b-role-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.role}
          </p>
        ) : null}
      </div>

      {/* Message */}
      <div>
        <label htmlFor="b2b-message" className="mb-1 block text-sm font-medium text-text-primary">
          {dict.fieldMessage}
        </label>
        <textarea
          id="b2b-message"
          name="message"
          required
          aria-required="true"
          rows={5}
          minLength={10}
          maxLength={5000}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'b2b-message-error' : undefined}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {errors.message ? (
          <p id="b2b-message-error" role="alert" className="mt-1 text-sm text-red-700">
            {errors.message}
          </p>
        ) : null}
      </div>

      {/* Consent */}
      <div className="flex items-start gap-3">
        <input
          id="b2b-consent"
          name="consent"
          type="checkbox"
          required
          aria-required="true"
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby="b2b-consent-help"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
          }}
          className="mt-1 h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
        />
        <label htmlFor="b2b-consent" className="text-sm text-text-secondary">
          <span>{dict.fieldConsent}</span>{' '}
          <a
            id="b2b-consent-help"
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
        style={{ position: 'absolute', left: '-10000px', height: 0, width: 0, overflow: 'hidden' }}
      >
        <label htmlFor="b2b-website">Website</label>
        <input
          id="b2b-website"
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

      {/* Live region for error message (success has its own block above) */}
      <div aria-live="polite" className="min-h-[1.5rem]">
        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? dict.sending : dict.submit}
      </Button>
    </form>
  );
}
