import { useEffect, useRef, useState } from 'react';

import { apiPost } from '@/lib/api';
import type { paths } from '@/lib/api/generated/openapi';

type PublicFormPath = '/api/support/contact' | '/api/leads/b2b' | '/api/leads/beta';

type PublicFormBody<P extends PublicFormPath> = Omit<
  paths[P]['post']['requestBody']['content']['application/json'],
  'website' | 'fillMs'
>;

export function usePublicSubmit<P extends PublicFormPath>(path: P) {
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  async function send(body: PublicFormBody<P>): Promise<void> {
    setFailed(false);
    setSubmitting(true);
    const fillMs = shownAt.current === null ? 0 : Math.max(0, Date.now() - shownAt.current);
    try {
      await apiPost(path, { ...body, website, fillMs });
      setSubmitted(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return { website, setWebsite, submitting, submitted, failed, send };
}
