'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { Dictionary } from '@/lib/i18n';

interface ContactFormProps {
  dict: Dictionary['support']['contact'];
}

export default function ContactForm({ dict }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitContact(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Support contact failed (${String(response.status)})`);
      }

      setSubmitted(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setError(dict.error);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    void submitContact();
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">
          {dict.success}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="sr-only">
          {dict.namePlaceholder}
        </label>
        <input
          id="contact-name"
          type="text"
          required
          placeholder={dict.namePlaceholder}
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="sr-only">
          {dict.emailPlaceholder}
        </label>
        <input
          id="contact-email"
          type="email"
          required
          placeholder={dict.emailPlaceholder}
          value={email}
          onChange={(e) => { setEmail(e.target.value); }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>
      <div>
        <label htmlFor="contact-message" className="sr-only">
          {dict.messagePlaceholder}
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          placeholder={dict.messagePlaceholder}
          value={message}
          onChange={(e) => { setMessage(e.target.value); }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? dict.sending : dict.submit}
      </Button>
    </form>
  );
}
