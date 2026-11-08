import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { PUBLIC_FORMS, submitForm } from '@/__tests__/helpers/public-forms.fixture';

const DOMAIN = '@museum.fr';
const emailOfLength = (length: number): string => 'a'.repeat(length - DOMAIN.length) + DOMAIN;

describe('L1 · une adresse de plus de 254 caractères est signalée sur le champ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const form of PUBLIC_FORMS) {
    it(`${form.name} : 254 caractères partent au serveur sans erreur de champ`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      form.mount();

      form.fill(emailOfLength(254));
      submitForm(form.submitLabel);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText(form.errorEmail)).toBeNull();
    });

    it(`${form.name} : 255 caractères sont signalés sur le champ, rien n’est envoyé`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      form.mount();

      form.fill(emailOfLength(255));
      submitForm(form.submitLabel);

      await waitFor(() => {
        expect(screen.getByText(form.errorEmail)).toBeInTheDocument();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});
