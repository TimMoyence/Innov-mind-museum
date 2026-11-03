import { maskPersonalData } from '@shared/pii/mask-personal-data';

describe('RAZ-M12d-ABBREV', () => {
  it.each([
    ['Tél.:0612345678', 'Tél.:[PHONE]'],
    ['Mob.:06 12 34 56 78', 'Mob.:[PHONE]'],
  ])('RAZ-M12d-ABBREV · %s est masqué', (input, expected) => {
    expect(maskPersonalData(input)).toEqual({ text: expected, count: 1 });
  });

  it('RAZ-M12d-ABBREV · « inv.:1503 » reste intact', () => {
    expect(maskPersonalData('inv.:1503')).toEqual({ text: 'inv.:1503', count: 0 });
  });
});
