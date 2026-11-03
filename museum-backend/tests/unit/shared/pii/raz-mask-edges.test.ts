import { maskPersonalData } from '@shared/pii/mask-personal-data';

describe('RAZ-M12d-EDGES', () => {
  it.each([
    ['Écris-moi (jean.dupont@mail.fr)', 'Écris-moi ([EMAIL])'],
    ['mail:jean@mail.fr', 'mail:[EMAIL]'],
    ['contact <jean@mail.fr>', 'contact <[EMAIL]>'],
    ['IBAN FR7630006000011234567890189', 'IBAN [IBAN]'],
    ['iban fr76 3000 6000 0112 3456 7890 189', 'iban [IBAN]'],
    ['carte 4970101234567890', 'carte [CARD]'],
    ['tel 0612345678', 'tel [PHONE]'],
    ['appelle le +33 6 12 34 56 78 demain', 'appelle le [PHONE] demain'],
  ])('RAZ-M12d-EDGES · %s est masqué', (input, expected) => {
    const masked = maskPersonalData(input);

    expect(masked.text).toBe(expected);
    expect(masked.count).toBe(1);
  });

  it.each([
    'Monet a peint 250 nymphéas entre 1914 et 1926.',
    'La Joconde, 1503-1519, salle 711 du Louvre.',
    'Ouvert de 9h à 18h, billet 17 €.',
  ])('RAZ-M12d-EDGES · « %s » reste intact', (input) => {
    expect(maskPersonalData(input)).toEqual({ text: input, count: 0 });
  });
});
