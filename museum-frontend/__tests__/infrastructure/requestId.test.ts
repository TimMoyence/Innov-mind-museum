import { generateRequestId } from '@/shared/infrastructure/requestId';

describe('generateRequestId', () => {
  it('returns a string matching UUID v4 format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()));
    expect(ids.size).toBe(50);
  });

  it('always has version nibble 4', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRequestId();
      expect(id[14]).toBe('4');
    }
  });

  it('always has variant nibble in [8,9,a,b]', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRequestId();
      expect(['8', '9', 'a', 'b']).toContain(id[19]);
    }
  });
});
