'use client';

import { useAdminDict } from '@/lib/admin-dictionary';
import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, errorMessage } from '@/lib/api';
import type { MuseumDTO, MuseumType } from '@/lib/admin-types';
import { MUSEUM_TYPES } from '@/lib/admin-types';
import { isLatitude, isLongitude, isSlug } from '@musaium/shared/museum';
import { clampChars, TEXT_LIMITS } from '@musaium/shared/validation';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { FormFieldError } from '@/components/forms/FormFieldError';
import Button from '@/components/ui/Button';

interface FormState {
  name: string;
  slug: string;
  address: string;
  description: string;
  museumType: MuseumType;
  latitude: string;
  longitude: string;
}

const INITIAL: FormState = {
  name: '',
  slug: '',
  address: '',
  description: '',
  museumType: 'art',
  latitude: '',
  longitude: '',
};

interface CreateMuseumResponse {
  museum: MuseumDTO;
}

export default function NewMuseumPage() {
  const adminDict = useAdminDict();
  const copy = adminDict.museumNewPage;
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): typeof errors {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = copy.errors.nameRequired;
    if (!form.slug.trim()) next.slug = copy.errors.slugRequired;
    else if (!isSlug(form.slug.trim())) next.slug = copy.errors.slugFormat;

    if (form.latitude !== '' && !isLatitude(Number(form.latitude))) {
      next.latitude = copy.errors.latRange;
    }
    if (form.longitude !== '' && !isLongitude(Number(form.longitude))) {
      next.longitude = copy.errors.lngRange;
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
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        museumType: form.museumType,
      };
      if (form.address.trim()) body.address = form.address.trim();
      if (form.description.trim()) body.description = form.description.trim();
      if (form.latitude !== '') body.latitude = Number(form.latitude);
      if (form.longitude !== '') body.longitude = Number(form.longitude);

      const result = await apiPost<CreateMuseumResponse>('/api/museums', body);
      router.push(`${result.museum.id}/branding`);
    } catch (err) {
      setServerError(
        errorMessage(err, copy.errors.serverGeneric, { CONFLICT: copy.errors.slugTaken }),
      );
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
          {copy.back}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{copy.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{copy.subtitle}</p>
      </header>

      {serverError && <AlertBanner variant="error" message={serverError} />}

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-5"
        noValidate
      >
        <div>
          <label htmlFor="m-name" className="block text-sm font-medium text-gray-700">
            {copy.fields.name}
          </label>
          <input
            id="m-name"
            type="text"
            value={form.name}
            onChange={(e) => {
              update('name', clampChars(e.target.value, TEXT_LIMITS.museumName.max));
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{copy.fields.nameHelp}</p>
          <FormFieldError error={errors.name} />
        </div>

        <div>
          <label htmlFor="m-slug" className="block text-sm font-medium text-gray-700">
            {copy.fields.slug}
          </label>
          <input
            id="m-slug"
            type="text"
            value={form.slug}
            onChange={(e) => {
              update('slug', clampChars(e.target.value, TEXT_LIMITS.museumSlug.max));
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="louvre"
          />
          <p className="mt-1 text-xs text-gray-500">{copy.fields.slugHelp}</p>
          <FormFieldError error={errors.slug} />
        </div>

        <div>
          <label htmlFor="m-type" className="block text-sm font-medium text-gray-700">
            {copy.fields.museumType}
          </label>
          <select
            id="m-type"
            value={form.museumType}
            onChange={(e) => {
              update('museumType', e.target.value as MuseumType);
            }}
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
            {copy.fields.address}
          </label>
          <input
            id="m-address"
            type="text"
            value={form.address}
            onChange={(e) => {
              update('address', clampChars(e.target.value, TEXT_LIMITS.museumAddress.max));
            }}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="m-description" className="block text-sm font-medium text-gray-700">
            {copy.fields.description}
          </label>
          <textarea
            id="m-description"
            value={form.description}
            onChange={(e) => {
              update('description', clampChars(e.target.value, TEXT_LIMITS.museumDescription.max));
            }}
            rows={4}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">{copy.fields.descriptionHelp}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="m-lat" className="block text-sm font-medium text-gray-700">
              {copy.fields.latitude}
            </label>
            <input
              id="m-lat"
              type="number"
              step="0.000001"
              value={form.latitude}
              onChange={(e) => {
                update('latitude', e.target.value);
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <FormFieldError error={errors.latitude} />
          </div>
          <div>
            <label htmlFor="m-lng" className="block text-sm font-medium text-gray-700">
              {copy.fields.longitude}
            </label>
            <input
              id="m-lng"
              type="number"
              step="0.000001"
              value={form.longitude}
              onChange={(e) => {
                update('longitude', e.target.value);
              }}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <FormFieldError error={errors.longitude} />
          </div>
        </div>
        <p className="text-xs text-gray-500">{copy.fields.geoHint}</p>

        <div className="flex justify-end gap-3 pt-4">
          <Link
            href="../museums"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {adminDict.common.cancel}
          </Link>
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? copy.submit.pending : copy.submit.idle}
          </Button>
        </div>
      </form>
    </section>
  );
}
