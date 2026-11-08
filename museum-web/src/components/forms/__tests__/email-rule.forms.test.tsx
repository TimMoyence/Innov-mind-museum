import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { PUBLIC_FORMS, submitForm } from '@/__tests__/helpers/public-forms.fixture';

const REFUSED = ['a@b.c', 'first..last@museum.fr', 'élodie@musée.fr'];
const ACCEPTED = 'curator@museum.fr';

describe('TIM-2026-11-08-EMAIL-STRICT · les formulaires appliquent la règle e-mail du serveur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const form of PUBLIC_FORMS) {
    for (const email of REFUSED) {
      it(`${form.name} : ${email} est signalé sur le champ, rien n’est envoyé`, async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        form.mount();

        form.fill(email);
        submitForm(form.submitLabel);

        await waitFor(() => {
          expect(screen.getByText(form.errorEmail)).toBeInTheDocument();
        });
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }

    it(`${form.name} : ${ACCEPTED} part au serveur sans erreur de champ`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      form.mount();

      form.fill(ACCEPTED);
      submitForm(form.submitLabel);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText(form.errorEmail)).toBeNull();
    });
  }
});
