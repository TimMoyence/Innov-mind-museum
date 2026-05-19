'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost } from '@/lib/api';
import type { MuseumDTO, MuseumType } from '@/lib/admin-types';
import { MUSEUM_TYPES } from '@/lib/admin-types';

// W4 W2.1 — Admin museum onboarding form. Posts to POST /api/museums
// (BE route: museum-backend/src/modules/museum/adapters/primary/http/routes/museum.route.ts).
// Admin role required. Validation mirrors the BE Zod createMuseumSchema
// (name 1..200, slug 1..200, lat/lng nullable, description ≤2000).

const STRINGS = {
  title: 'Onboard a new museum',
  subtitle:
    'Create a B2B-pilot tenant. The museum becomes addressable by its slug and may receive branding + KB locale config in a follow-up step.',
  back: '← Back to museums',
  fields: {
    name: 'Name',
    nameHelp: 'Display name shown in the app. 1–200 characters.',
    slug: 'Slug',
    slugHelp:
      'URL-safe identifier (lowercase, hyphens). Used in API paths. Cannot be changed easily later — pick carefully.',
    address: 'Address (optional)',
    description: 'Description (optional)',
    descriptionHelp: 'Up to 2 000 characters. Shown on the public museum page.',
    museumType: 'Type',
    latitude: 'Latitude (optional)',
    longitude: 'Longitude (optional)',
    geoHint:
      'Geographic centre of the museum, used for proximity search. Leave blank for now if you do not have it.',
    kbLocale: 'KB locale (config.kbLocale)',
    kbLocaleHelp: 'Primary locale for the knowledge base. Defaults to fr if blank.',
  },
  submit: {
    idle: 'Create museum',
    pending: 'Creating…',
  },
  errors: {
    nameRequired: 'Name is required.',
    slugRequired: 'Slug is required.',
    slugFormat: 'Slug must be lowercase letters, digits, and hyphens only.',
    latRange: 'Latitude must be between −90 and 90.',
    lngRange: 'Longitude must be between −180 and 180.',
    serverGeneric: 'Could not create museum.',
  },
} as const;

const SLUG_RE = /^[a-z0-9-]+$/;
const KB_LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

interface FormState {
  name: string;
  slug: string;
  address: string;
  description: string;
  museumType: MuseumType;
  latitude: string;
  longitude: string;
  kbLocale: string;
}

const INITIAL: FormState = {
  name: '',
  slug: '',
  address: '',
  description: '',
  museumType: 'art',
  latitude: '',
  longitude: '',
  kbLocale: '',
};

interface CreateMuseumResponse {
  museum: MuseumDTO;
}

export default function NewMuseumPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): typeof errors {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = STRINGS.errors.nameRequired;
    if (!form.slug.trim()) next.slug = STRINGS.errors.slugRequired;
    else if (!SLUG_RE.test(form.slug.trim())) next.slug = STRINGS.errors.slugFormat;

    if (form.latitude !== '') {
      const lat = Number(form.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) next.latitude = STRINGS.errors.latRange;
    }
    if (form.longitude !== '') {
      const lng = Number(form.longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) next.longitude = STRINGS.errors.lngRange;
    }
    return next;
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);
    try {
      const trimmedKb = form.kbLocale.trim();
      const kbLocaleValid = trimmedKb === '' || KB_LOCALE_RE.test(trimmedKb);
      const config: Record<string, unknown> = {};
      if (kbLocaleValid && trimmedKb) config.kbLocale = trimmedKb;

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        museumType: form.museumType,
      };
      if (form.address.trim()) body.address = form.address.trim();
      if (form.description.trim()) body.description = form.description.trim();
      if (form.latitude !== '') body.latitude = Number(form.latitude);
      if (form.longitude !== '') body.longitude = Number(form.longitude);
      if (Object.keys(config).length > 0) body.config = config;

      const result = await apiPost<CreateMuseumResponse>('/api/museums', body);
      router.push(`${result.museum.id}/branding`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : STRINGS.errors.serverGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="../museums" className="text-sm text-blue-600 hover:underline">
          {STRINGS.back}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{STRINGS.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{STRINGS.subtitle}</p>
      </header>

      {serverError && (
        <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="m-name" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.name}
          </label>
          <input
            id="m-name"
            type="text"
            value={form.name}
            onChange={(e) => { update('name', e.target.value); }}
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.nameHelp}</p>
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="m-slug" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.slug}
          </label>
          <input
            id="m-slug"
            type="text"
            value={form.slug}
            onChange={(e) => { update('slug', e.target.value); }}
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="louvre"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.slugHelp}</p>
          {errors.slug && <p className="mt-1 text-xs text-red-600">{errors.slug}</p>}
        </div>

        <div>
          <label htmlFor="m-type" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.museumType}
          </label>
          <select
            id="m-type"
            value={form.museumType}
            onChange={(e) => { update('museumType', e.target.value as MuseumType); }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {MUSEUM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="m-address" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.address}
          </label>
          <input
            id="m-address"
            type="text"
            value={form.address}
            onChange={(e) => { update('address', e.target.value); }}
            maxLength={500}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="m-description" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.description}
          </label>
          <textarea
            id="m-description"
            value={form.description}
            onChange={(e) => { update('description', e.target.value); }}
            maxLength={2000}
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.descriptionHelp}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="m-lat" className="block text-sm font-medium text-gray-700">
              {STRINGS.fields.latitude}
            </label>
            <input
              id="m-lat"
              type="number"
              step="0.000001"
              value={form.latitude}
              onChange={(e) => { update('latitude', e.target.value); }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.latitude && <p className="mt-1 text-xs text-red-600">{errors.latitude}</p>}
          </div>
          <div>
            <label htmlFor="m-lng" className="block text-sm font-medium text-gray-700">
              {STRINGS.fields.longitude}
            </label>
            <input
              id="m-lng"
              type="number"
              step="0.000001"
              value={form.longitude}
              onChange={(e) => { update('longitude', e.target.value); }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.longitude && <p className="mt-1 text-xs text-red-600">{errors.longitude}</p>}
          </div>
        </div>
        <p className="text-xs text-gray-500">{STRINGS.fields.geoHint}</p>

        <div>
          <label htmlFor="m-kb-locale" className="block text-sm font-medium text-gray-700">
            {STRINGS.fields.kbLocale}
          </label>
          <input
            id="m-kb-locale"
            type="text"
            value={form.kbLocale}
            onChange={(e) => { update('kbLocale', e.target.value); }}
            maxLength={10}
            placeholder="fr"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{STRINGS.fields.kbLocaleHelp}</p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="../museums"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {submitting ? STRINGS.submit.pending : STRINGS.submit.idle}
          </button>
        </div>
      </form>
    </section>
  );
}
