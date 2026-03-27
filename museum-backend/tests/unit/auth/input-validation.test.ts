import { validateNameField, sanitizePromptInput } from '@shared/validation/input';

describe('validateNameField', () => {
  it('returns undefined for undefined', () => {
    expect(validateNameField(undefined, 'firstname')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(validateNameField('', 'firstname')).toBeUndefined();
  });

  it('trims whitespace', () => {
    expect(validateNameField('  Alice  ', 'firstname')).toBe('Alice');
  });

  it('accepts valid names with accents', () => {
    expect(validateNameField('Jean-Pierre', 'firstname')).toBe('Jean-Pierre');
    expect(validateNameField("O'Brien", 'lastname')).toBe("O'Brien");
    expect(validateNameField('Éloïse', 'firstname')).toBe('Éloïse');
  });

  it('rejects names exceeding max length', () => {
    const longName = 'A'.repeat(101);
    expect(() => validateNameField(longName, 'firstname')).toThrow('at most 100');
  });

  it('rejects names with XSS characters', () => {
    expect(() => validateNameField('<script>alert(1)</script>', 'firstname')).toThrow(
      'invalid characters',
    );
  });

  it('rejects names with numbers', () => {
    expect(() => validateNameField('Alice123', 'firstname')).toThrow('invalid characters');
  });
});

describe('sanitizePromptInput', () => {
  it('strips zero-width characters', () => {
    expect(sanitizePromptInput('hello\u200Bworld')).toBe('helloworld');
  });

  it('strips control characters', () => {
    expect(sanitizePromptInput('hello\x00world')).toBe('helloworld');
  });

  it('trims and truncates', () => {
    const long = 'a'.repeat(300);
    expect(sanitizePromptInput(long)).toHaveLength(200);
  });

  it('respects custom maxLength', () => {
    expect(sanitizePromptInput('hello world', 5)).toBe('hello');
  });
});
