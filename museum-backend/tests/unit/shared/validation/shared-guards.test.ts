import { AppError } from '@shared/errors/app.error';
import { isOutsideMuseumScope } from '@shared/authz/tenant-scope';
import { assertWithinLimit } from '@shared/validation/text-field';

describe('assertWithinLimit', () => {
  const bounded = { min: 2, max: 4 };

  it('accepts a value at either bound, counting characters rather than UTF-16 units', () => {
    expect(() => {
      assertWithinLimit('name', 'ab', bounded);
    }).not.toThrow();
    expect(() => {
      assertWithinLimit('name', '😀😀😀😀', bounded);
    }).not.toThrow();
  });

  it('refuses a value outside the bounds with a 400 naming the field and the range', () => {
    expect(() => {
      assertWithinLimit('name', 'a', bounded);
    }).toThrow(new AppError({ message: 'name must be between 2 and 4 characters' }));
    expect(() => {
      assertWithinLimit('name', 'abcde', bounded);
    }).toThrow('name must be between 2 and 4 characters');
    try {
      assertWithinLimit('name', 'abcde', bounded);
    } catch (error) {
      expect((error as AppError).statusCode).toBe(400);
    }
  });

  it('names only the maximum when the limit has no minimum', () => {
    expect(() => {
      assertWithinLimit('comment', 'abc', { max: 2 });
    }).toThrow('comment must be at most 2 characters');
    expect(() => {
      assertWithinLimit('comment', '', { max: 2 });
    }).not.toThrow();
  });
});

describe('isOutsideMuseumScope', () => {
  it.each<[number | null | undefined, number | null, boolean]>([
    [undefined, 5, false],
    [null, 5, false],
    [null, null, false],
    [5, 5, false],
    [5, 6, true],
    [5, null, true],
    [0, 5, true],
    [0, 0, false],
  ])('scope %p and item museum %p → outside %p', (scope, museumId, outside) => {
    expect(isOutsideMuseumScope(scope, museumId)).toBe(outside);
  });
});
