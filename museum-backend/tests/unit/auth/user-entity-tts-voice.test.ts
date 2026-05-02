import { getMetadataArgsStorage } from 'typeorm';

import { User } from '@modules/auth/domain/user.entity';

it('declares ttsVoice column (varchar 32, nullable, name=tts_voice)', () => {
  const cols = getMetadataArgsStorage().columns.filter((c) => c.target === User);
  const col = cols.find((c) => c.propertyName === 'ttsVoice');
  expect(col).toBeDefined();
  expect(col?.options.name).toBe('tts_voice');
  expect(col?.options.type).toBe('varchar');
  expect(col?.options.length).toBe('32');
  expect(col?.options.nullable).toBe(true);
});
