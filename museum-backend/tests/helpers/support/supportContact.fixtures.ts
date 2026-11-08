export interface SupportContactInput {
  name: string;
  email: string;
  message: string;
  website?: string;
  fillMs?: number;
}

export function makeSupportContactInput(
  overrides: Partial<SupportContactInput> = {},
): SupportContactInput {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'I cannot access my saved tickets from the web support page.',
    website: '',
    fillMs: 30_000,
    ...overrides,
  };
}
