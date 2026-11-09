export interface SmokeCredentials {
  email: string;
  password: string;
}

export const makeSmokeCredentials = (
  overrides: Partial<SmokeCredentials> = {},
): SmokeCredentials => ({
  email: 'smoke+lifecycle@test.musaium',
  password: 'Sm0ke!Lifecycle-Test',
  ...overrides,
});

export const makeSmokeEmail = (label: string): string => `smoke+${label}@test.musaium`;
