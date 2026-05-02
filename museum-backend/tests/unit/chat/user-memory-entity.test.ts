import { getMetadataArgsStorage } from 'typeorm';
import { UserMemory } from '@modules/chat/domain/userMemory.entity';

describe('UserMemory entity columns', () => {
  it('declares languagePreference column', () => {
    const cols = getMetadataArgsStorage().columns.filter((c) => c.target === UserMemory);
    const col = cols.find((c) => c.propertyName === 'languagePreference');
    expect(col).toBeDefined();
    expect(col?.options.name).toBe('language_preference');
    expect(col?.options.type).toBe('varchar');
    expect(col?.options.nullable).toBe(true);
  });

  it('declares sessionDurationP90Minutes column', () => {
    const cols = getMetadataArgsStorage().columns.filter((c) => c.target === UserMemory);
    const col = cols.find((c) => c.propertyName === 'sessionDurationP90Minutes');
    expect(col).toBeDefined();
    expect(col?.options.name).toBe('session_duration_p90_minutes');
    expect(col?.options.type).toBe('integer');
    expect(col?.options.nullable).toBe(true);
  });
});
