'use client';

import { useState } from 'react';
import { clampChars, isEmail, isWithinLimit, TEXT_LIMITS } from '@musaium/shared/validation';

import Button from '@/components/ui/Button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { HoneypotField } from '@/components/forms/HoneypotField';
import { usePublicSubmit } from '@/components/forms/usePublicSubmit';
import type { Dictionary, Locale } from '@/lib/i18n';

interface B2bContactFormProps {
  dict: Dictionary['landing']['b2b']['contact'];
  locale: Locale;
}

type ValidationKey = 'email' | 'name' | 'museum' | 'role' | 'message' | 'consent';
type B2bRole = keyof Dictionary['landing']['b2b']['contact']['roleOptions'];

/**
 * B2B contact form (R4 §1 R6-R11). Uses native required + a per-field error
 * map for the empty-submit case, posts JSON to /api/leads/b2b on success and
 * surfaces success/error in a polite aria-live region.
 */
export default function B2bContactForm({ dict, locale }: B2bContactFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [museum, setMuseum] = useState('');
  const [role, setRole] = useState<B2bRole | ''>('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ValidationKey, string>>>({});
  const { website, setWebsite, submitting, submitted, failed, send } =
    usePublicSubmit('/api/leads/b2b');

  function validate(): Partial<Record<ValidationKey, string>> {
    const next: Partial<Record<ValidationKey, string>> = {};
    if (!email.trim()) next.email = dict.errorValidation;
    else if (!isEmail(email.trim())) next.email = dict.errorEmail;
    if (!isWithinLimit(name.trim(), TEXT_LIMITS.contactName)) next.name = dict.errorValidation;
    if (!isWithinLimit(museum.trim(), TEXT_LIMITS.leadMuseum)) next.museum = dict.errorValidation;
    if (!role) next.role = dict.errorValidation;
    if (!isWithinLimit(message.trim(), TEXT_LIMITS.contactMessage)) {
      next.message = dict.errorValidation;
    }
    if (!consent) next.consent = dict.errorValidation;
    return next;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0 || !role) {
      return;
    }
    void send({
      email: email.trim(),
      name: name.trim(),
      museum: museum.trim(),
      role,
      message: message.trim(),
      consent: true,
    });
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
        <FormFieldError id="b2b-email-error" error={errors.email} />
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
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'b2b-name-error' : undefined}
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(clampChars(e.target.value, TEXT_LIMITS.contactName.max));
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="b2b-name-error" error={errors.name} />
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
          aria-invalid={errors.museum ? true : undefined}
          aria-describedby={errors.museum ? 'b2b-museum-error' : undefined}
          autoComplete="organization"
          value={museum}
          onChange={(e) => {
            setMuseum(clampChars(e.target.value, TEXT_LIMITS.leadMuseum.max));
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="b2b-museum-error" error={errors.museum} />
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
            setRole(e.target.value as B2bRole);
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
        <FormFieldError id="b2b-role-error" error={errors.role} />
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
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'b2b-message-error' : undefined}
          value={message}
          onChange={(e) => {
            setMessage(clampChars(e.target.value, TEXT_LIMITS.contactMessage.max));
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="b2b-message-error" error={errors.message} />
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
      <FormFieldError error={errors.consent} />

      {/* Honeypot — must NOT be visible to humans, NOT in tab order */}
      <HoneypotField value={website} onChange={setWebsite} />

      {/* Live region for error message (success has its own block above) */}
      <div aria-live="polite" className="min-h-[1.5rem]">
        {failed ? <AlertBanner variant="error" message={dict.error} /> : null}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? dict.sending : dict.submit}
      </Button>
    </form>
  );
}
