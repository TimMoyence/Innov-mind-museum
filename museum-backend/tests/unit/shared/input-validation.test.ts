import { sanitizePromptInput, validateNameField } from '@shared/validation/input';

describe('sanitizePromptInput', () => {
  it('trims and normalizes basic input', () => {
    expect(sanitizePromptInput('  hello  ')).toBe('hello');
  });

  it('strips zero-width characters', () => {
    const input = 'hello\u200Bworld\u200Ctest\u200D';
    expect(sanitizePromptInput(input)).toBe('helloworldtest');
  });

  it('strips control characters', () => {
    const input = 'hello\x00\x01\x08\x0B\x0C\x0E\x1F\x7Fworld';
    expect(sanitizePromptInput(input)).toBe('helloworld');
  });

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(300);
    expect(sanitizePromptInput(long, 100)).toHaveLength(100);
  });

  it('uses default maxLength of 200', () => {
    const long = 'b'.repeat(250);
    expect(sanitizePromptInput(long)).toHaveLength(200);
  });

  it('handles empty string', () => {
    expect(sanitizePromptInput('')).toBe('');
  });

  it('applies NFC normalization', () => {
    // e + combining acute accent -> é
    const input = 'e\u0301';
    const result = sanitizePromptInput(input);
    expect(result).toBe('\u00E9'); // NFC-normalized é
  });

  it('strips soft hyphens', () => {
    const input = 'test\u00ADword';
    expect(sanitizePromptInput(input)).toBe('testword');
  });

  it('strips word joiners', () => {
    const input = 'hello\u2060world';
    expect(sanitizePromptInput(input)).toBe('helloworld');
  });

  it('strips BOM character', () => {
    const input = '\uFEFFhello';
    expect(sanitizePromptInput(input)).toBe('hello');
  });

  it('does not truncate string of exactly 200 characters', () => {
    const exact = 'a'.repeat(200);
    expect(sanitizePromptInput(exact)).toHaveLength(200);
    expect(sanitizePromptInput(exact)).toBe(exact);
  });

  it('truncates string of 201 characters to 200', () => {
    const oneOver = 'a'.repeat(201);
    expect(sanitizePromptInput(oneOver)).toHaveLength(200);
  });
});

describe('validateNameField', () => {
  it('returns undefined for undefined input', () => {
    expect(validateNameField(undefined, 'firstname')).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(validateNameField(null as unknown as string, 'firstname')).toBeUndefined();
  });

  it('returns undefined for empty string after trim', () => {
    expect(validateNameField('   ', 'firstname')).toBeUndefined();
  });

  it('returns trimmed value for valid name', () => {
    expect(validateNameField(' Alice ', 'firstname')).toBe('Alice');
  });

  it('accepts names with hyphens and apostrophes', () => {
    expect(validateNameField("O'Brien", 'lastname')).toBe("O'Brien");
    expect(validateNameField('Jean-Pierre', 'firstname')).toBe('Jean-Pierre');
  });

  it('accepts Unicode names', () => {
    expect(validateNameField('日本太郎', 'firstname')).toBe('日本太郎');
    expect(validateNameField('François', 'firstname')).toBe('François');
  });

  it('accepts name of exactly 100 characters', () => {
    const exact = 'a'.repeat(100);
    expect(validateNameField(exact, 'firstname')).toBe(exact);
  });

  it('throws for name exceeding maxLength', () => {
    const long = 'a'.repeat(101);
    expect(() => validateNameField(long, 'firstname')).toThrow('must be at most 100 characters');
  });

  it('throws for name with custom maxLength exceeded', () => {
    expect(() => validateNameField('toolong', 'nickname', 5)).toThrow(
      'must be at most 5 characters',
    );
  });

  it('throws for name with invalid characters', () => {
    expect(() => validateNameField('Alice123', 'firstname')).toThrow('contains invalid characters');
    expect(() => validateNameField('test@user', 'firstname')).toThrow(
      'contains invalid characters',
    );
  });

  it('coerces non-string values to string then validates', () => {
    // The type says string|undefined but test the non-string branch
    // "42" contains digits which are not in the NAME_PATTERN (unicode letters only)
    expect(() => validateNameField(42 as unknown as string, 'field')).toThrow(
      'contains invalid characters',
    );
  });
});
