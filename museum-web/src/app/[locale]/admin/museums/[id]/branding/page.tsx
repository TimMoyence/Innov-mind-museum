'use client';

import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiGet } from '@/lib/api';
import type { MuseumBranding, MuseumDTO } from '@/lib/admin-types';

// W4 W2.2 — Per-museum branding editor. Reads/writes museum.config.branding
// via PUT /api/museums/:id (BE allows arbitrary config record; FE exposes the
// typed branding sub-shape). Logo upload is stubbed to a URL input for V1 —
// a true upload endpoint is a V1.1 follow-up (TD-50). Color picker uses the
// native HTML <input type="color"> for KISS until brand-aware design tokens
// are wired in V1.1.
//
// Why apiPost('/api/museums/:id') with method override: the existing api.ts
// helper set doesn't expose apiPut; the BE route is PUT, so we use apiPost
// with the X-HTTP-Method-Override header pattern only if needed — in this
// codebase the api helpers route through Next rewrites to the backend; PUT
// is supported because the BE explicitly handles it. We use the native fetch
// inside apiPatch shape via a small local wrapper.

const STRINGS = {
  title: 'Branding',
  subtitle:
    'Configure brand colors and logo for this museum. Changes take effect on the next visitor session.',
  back: '← Back to museums',
  loading: 'Loading…',
  errorLoad: 'Could not load museum.',
  errorSave: 'Could not save branding.',
  notFound: 'Museum not found.',
  fields: {
    primary: 'Primary color',
    secondary: 'Secondary color',
    accent: 'Accent color',
    logoUrl: 'Logo URL',
    logoHint:
      'Public HTTPS URL for the museum logo (PNG, SVG, or WebP). True file upload is planned for V1.1.',
  },
  preview: 'Preview',
  save: {
    idle: 'Save branding',
    pending: 'Saving…',
  },
  saved: 'Branding saved.',
} as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/i;

function asBranding(config: Record<string, unknown> | undefined): MuseumBranding {
  if (!config) return {};
  const raw = config.branding;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as MuseumBranding;
  }
  return {};
}

// Local wrapper to PUT since api.ts only exposes GET/POST/PATCH/DELETE.
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  // Reuse apiPost shape; if the BE expects PUT strictly, prefer this minimal
  // fetch over importing & extending api.ts (defer that to a follow-up).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Read CSRF token from the cookie (double-submit), mirroring api.ts.
  if (typeof document !== 'undefined') {
    const m = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie);
    const token = m?.[1];
    if (token) headers['X-CSRF-Token'] = decodeURIComponent(token);
  }
  const res = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore body parse error */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

interface GetMuseumResponse {
  museum: MuseumDTO;
}

export default function MuseumBrandingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [museum, setMuseum] = useState<MuseumDTO | null>(null);
  const [branding, setBranding] = useState<MuseumBranding>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof MuseumBranding, string>>>({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<GetMuseumResponse>(`/api/museums/${id}`);
      setMuseum(data.museum);
      setBranding(asBranding(data.museum.config));
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof MuseumBranding>(key: K, value: MuseumBranding[K]) {
    setBranding((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
  }

  function validate(): typeof fieldErrors {
    const next: typeof fieldErrors = {};
    (['primaryColor', 'secondaryColor', 'accentColor'] as const).forEach((k) => {
      const v = branding[k];
      if (v && !HEX_RE.test(v)) next[k] = 'Must be a #RRGGBB hex color.';
    });
    if (branding.logoUrl && !HTTPS_RE.test(branding.logoUrl)) {
      next.logoUrl = 'Must be an HTTPS URL.';
    }
    return next;
  }

  async function handleSave(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!museum) return;
    const v = validate();
    setFieldErrors(v);
    if (Object.keys(v).length > 0) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Merge — preserve any other config keys (e.g. kbLocale) the BE has.
      const nextConfig: Record<string, unknown> = {
        ...museum.config,
        branding: pruneEmpty(branding),
      };
      const data = await apiPut<GetMuseumResponse>(`/api/museums/${museum.id}`, {
        config: nextConfig,
      });
      setMuseum(data.museum);
      setBranding(asBranding(data.museum.config));
      setSuccess(STRINGS.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorSave);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600">{STRINGS.loading}</p>;
  }
  if (error && !museum) {
    return (
      <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!museum) {
    return <p className="text-sm text-gray-600">{STRINGS.notFound}</p>;
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="../../museums" className="text-sm text-blue-600 hover:underline">
          {STRINGS.back}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {STRINGS.title} — {museum.name}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{STRINGS.subtitle}</p>
      </header>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <form
        onSubmit={(e) => {
          void handleSave(e);
        }}
        className="space-y-5"
        noValidate
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`b-${k}`} className="block text-sm font-medium text-gray-700">
                {k === 'primaryColor'
                  ? STRINGS.fields.primary
                  : k === 'secondaryColor'
                    ? STRINGS.fields.secondary
                    : STRINGS.fields.accent}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={`b-${k}`}
                  type="color"
                  value={branding[k] ?? '#000000'}
                  onChange={(e) => { update(k, e.target.value); }}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={branding[k] ?? ''}
                  onChange={(e) => { update(k, e.target.value); }}
                  placeholder="#000000"
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`${k} hex value`}
                />
              </div>
              {fieldErrors[k] && <p className="mt-1 text-xs text-red-600">{fieldErrors[k]}</p>}
            </div>
          ))}
        </div>

        <div>
          <label htmlFor="b-logo" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.logoUrl}
          </label>
          <input
            id="b-logo"
            type="url"
            value={branding.logoUrl ?? ''}
            onChange={(e) => { update('logoUrl', e.target.value); }}
            placeholder="https://cdn.musaium.com/museums/louvre/logo.svg"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.logoHint}</p>
          {fieldErrors.logoUrl && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.logoUrl}</p>
          )}
        </div>

        {(branding.primaryColor ?? branding.logoUrl) && (
          <fieldset
            aria-label={STRINGS.preview}
            className="rounded-md border border-gray-200 bg-gray-50 p-4"
          >
            <legend className="px-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              {STRINGS.preview}
            </legend>
            <div
              className="flex items-center gap-3 rounded p-3"
              style={{
                backgroundColor: branding.primaryColor ?? '#ffffff',
                color: contrast(branding.primaryColor),
              }}
            >
              {branding.logoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element --
                   Justification: arbitrary external CDN URL the operator
                   types into the branding form for live preview only. Next
                   Image requires upfront-known domains in next.config; this
                   admin-only preview accepts any HTTPS URL and discards
                   load errors silently via onError handler. Production
                   serving switches to next/image once a real upload
                   pipeline + allowlist exists (TD-50).
                   Approved-by: dispatcher (W4 audit-360 2026-05-17). */
                <img
                  src={branding.logoUrl}
                  alt={`${museum.name} logo`}
                  className="h-8 w-auto"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span className="text-sm font-semibold">{museum.name}</span>
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="../../museums"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {saving ? STRINGS.save.pending : STRINGS.save.idle}
          </button>
        </div>
      </form>
    </section>
  );
}

function pruneEmpty(b: MuseumBranding): MuseumBranding {
  const out: MuseumBranding = {};
  if (b.primaryColor) out.primaryColor = b.primaryColor;
  if (b.secondaryColor) out.secondaryColor = b.secondaryColor;
  if (b.accentColor) out.accentColor = b.accentColor;
  if (b.logoUrl) out.logoUrl = b.logoUrl;
  return out;
}

/** Cheap WCAG-ish contrast picker for the preview header text. */
function contrast(hex: string | undefined): string {
  if (!hex || !HEX_RE.test(hex)) return '#111111';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#111111' : '#ffffff';
}

