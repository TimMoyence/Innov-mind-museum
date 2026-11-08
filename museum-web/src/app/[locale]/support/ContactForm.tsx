'use client';

import { useState } from 'react';
import { clampChars, isEmail, isWithinLimit, TEXT_LIMITS } from '@musaium/shared/validation';
import Button from '@/components/ui/Button';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { FormFieldError } from '@/components/forms/FormFieldError';
import { HoneypotField } from '@/components/forms/HoneypotField';
import { usePublicSubmit } from '@/components/forms/usePublicSubmit';
import type { Dictionary } from '@/lib/i18n';

interface ContactFormProps {
  dict: Dictionary['support']['contact'];
}

export default function ContactForm({ dict }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'message', string>>>({});
  const { website, setWebsite, submitting, submitted, failed, send } =
    usePublicSubmit('/api/support/contact');

  function validate(): typeof errors {
    const next: typeof errors = {};
    if (!isWithinLimit(name.trim(), TEXT_LIMITS.contactName)) next.name = dict.errorName;
    if (!isEmail(email.trim())) next.email = dict.errorEmail;
    if (!isWithinLimit(message.trim(), TEXT_LIMITS.contactMessage)) {
      next.message = dict.errorMessage.replace('{min}', String(TEXT_LIMITS.contactMessage.min));
    }
    return next;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void send({ name: name.trim(), email: email.trim(), message: message.trim() });
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">{dict.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="contact-name" className="sr-only">
          {dict.namePlaceholder}
        </label>
        <input
          id="contact-name"
          type="text"
          required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'contact-name-error' : undefined}
          placeholder={dict.namePlaceholder}
          value={name}
          onChange={(e) => {
            setName(clampChars(e.target.value, TEXT_LIMITS.contactName.max));
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="contact-name-error" error={errors.name} />
      </div>
      <div>
        <label htmlFor="contact-email" className="sr-only">
          {dict.emailPlaceholder}
        </label>
        <input
          id="contact-email"
          type="email"
          required
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'contact-email-error' : undefined}
          placeholder={dict.emailPlaceholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="contact-email-error" error={errors.email} />
      </div>
      <div>
        <label htmlFor="contact-message" className="sr-only">
          {dict.messagePlaceholder}
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'contact-message-error' : undefined}
          placeholder={dict.messagePlaceholder}
          value={message}
          onChange={(e) => {
            setMessage(clampChars(e.target.value, TEXT_LIMITS.contactMessage.max));
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <FormFieldError id="contact-message-error" error={errors.message} />
      </div>
      <HoneypotField value={website} onChange={setWebsite} />
      {failed ? <AlertBanner variant="error" message={dict.error} /> : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? dict.sending : dict.submit}
      </Button>
    </form>
  );
}
