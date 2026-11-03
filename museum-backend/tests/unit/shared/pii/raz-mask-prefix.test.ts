import { maskPersonalData } from '@shared/pii/mask-personal-data';

describe('RAZ-M12d-PREFIX', () => {
  it.each([
    ['tel:0612345678', 'tel:[PHONE]'],
    ['tel:+33612345678', 'tel:[PHONE]'],
    ['numéro:06 12 34 56 78', 'numéro:[PHONE]'],
    ['appelle-moi (06 12 34 56 78)', 'appelle-moi ([PHONE])'],
    ['virement FR76-3000-6000-0112-3456-7890-189', 'virement [IBAN]'],
  ])('RAZ-M12d-PREFIX · %s est masqué sans perdre son préfixe', (input, expected) => {
    expect(maskPersonalData(input)).toEqual({ text: expected, count: 1 });
  });

  it.each(['Monet (1840-1926) a peint ce tableau.', 'horaires:9h-18h', 'salle:711'])(
    'RAZ-M12d-PREFIX · « %s » reste intact',
    (input) => {
      expect(maskPersonalData(input)).toEqual({ text: input, count: 0 });
    },
  );
});
