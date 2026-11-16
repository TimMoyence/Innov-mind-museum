import { AppError } from '@shared/errors/app.error';
import { assertOneOf } from '@shared/validation/one-of';

const SIZES = ['small', 'large'] as const;

describe('assertOneOf', () => {
  it('accepts every allowed value', () => {
    for (const size of SIZES) {
      expect(() => {
        assertOneOf('size', SIZES, size);
      }).not.toThrow();
    }
  });

  it('refuses any other value with a 400 naming the field and the allowed values in order', () => {
    const attempt = () => {
      assertOneOf('size', SIZES, 'medium');
    };

    expect(attempt).toThrow(AppError);
    expect(attempt).toThrow('size must be one of: small, large');
    try {
      attempt();
    } catch (error) {
      expect((error as AppError).statusCode).toBe(400);
    }
  });

  it('refuses an empty string and a different case', () => {
    expect(() => {
      assertOneOf('size', SIZES, '');
    }).toThrow('size must be one of');
    expect(() => {
      assertOneOf('size', SIZES, 'SMALL');
    }).toThrow('size must be one of');
  });
});
