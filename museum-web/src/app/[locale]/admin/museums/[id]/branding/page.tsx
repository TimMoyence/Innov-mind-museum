'use client';

import { useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiPut } from '@/lib/api';
import { useFetchData } from '@/lib/hooks/useFetchData';
import type { MuseumBranding, MuseumDTO } from '@/lib/admin-types';
import { HEX_RE, HTTPS_RE } from '@/lib/validation';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { FormFieldError } from '@/components/forms/FormFieldError';

// W4 W2.2 — Per-museum branding editor. Reads/writes museum.config.branding
// via PUT /api/museums/:id (BE allows arbitrary config record; FE exposes the
// typed branding sub-shape). Logo upload is stubbed to a URL input for V1 —
// a true upload endpoint is a V1.1 follow-up (TD-50). Color picker uses the
// native HTML <input type="color"> for KISS until brand-aware design tokens
// are wired in V1.1.

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

function asBranding(config: Record<string, unknown> | undefined): MuseumBranding {
  if (!config) return {};
  const raw = config.branding;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as MuseumBranding;
  }
  return {};
}

interface GetMuseumResponse {
  museum: MuseumDTO;
}

export default function MuseumBrandingPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [branding, setBranding] = useState<MuseumBranding>({});
  const [saving, setSaving] = useState(false);
  // Mutation-specific error (kept distinct from the read-only hook `error`).
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof MuseumBranding, string>>>({});

  const {
    data: museumResponse,
    loading,
    error,
    refetch: load,
  } = useFetchData<GetMuseumResponse>(id ? `/api/museums/${id}` : null, {
    deps: [id],
    errorFallback: STRINGS.errorLoad,
  });
  const museum = museumResponse?.museum ?? null;
  const combinedError = error ?? mutationError;

  // `branding` is locally-edited form state, but it must (re)sync from the
  // server-loaded museum the FIRST render the museum becomes available AND
  // every time the museum reference changes (e.g. after a refetch following
  // a successful PUT). We use the React "adjusting state in render" pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // so the freshly-synced branding is visible in the SAME render that first
  // renders the form — avoiding a one-frame empty-input flash.
  const [syncedMuseum, setSyncedMuseum] = useState<MuseumDTO | null>(null);
  if (museum && museum !== syncedMuseum) {
    setSyncedMuseum(museum);
    setBranding(asBranding(museum.config));
  }

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
    setMutationError(null);
    setSuccess(null);
    try {
      // Merge — preserve any other config keys (e.g. kbLocale) the BE has.
      const nextConfig: Record<string, unknown> = {
        ...museum.config,
        branding: pruneEmpty(branding),
      };
      await apiPut<GetMuseumResponse>(`/api/museums/${museum.id}`, {
        config: nextConfig,
      });
      // Refetch the museum so the hook becomes the single source of truth
      // for server state — the in-render sync above re-derives `branding`
      // from the freshly-loaded `museum.config` (new reference → re-sync).
      void load();
      setSuccess(STRINGS.saved);
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : STRINGS.errorSave);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600">{STRINGS.loading}</p>;
  }
  if (combinedError && !museum) {
    return <AlertBanner variant="error" message={combinedError} />;
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

      {combinedError && <AlertBanner variant="error" message={combinedError} />}
      {success && <AlertBanner variant="success" message={success} />}

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
                  onChange={(e) => {
                    update(k, e.target.value);
                  }}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={branding[k] ?? ''}
                  onChange={(e) => {
                    update(k, e.target.value);
                  }}
                  placeholder="#000000"
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`${k} hex value`}
                />
              </div>
              <FormFieldError error={fieldErrors[k]} />
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
            onChange={(e) => {
              update('logoUrl', e.target.value);
            }}
            placeholder="https://cdn.musaium.com/museums/louvre/logo.svg"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.logoHint}</p>
          <FormFieldError error={fieldErrors.logoUrl} />
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
