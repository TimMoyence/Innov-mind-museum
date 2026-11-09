export const B2B_LEAD_ROLES = ['director', 'curator', 'digital', 'other'] as const;
export type B2bLeadRole = (typeof B2B_LEAD_ROLES)[number];

export interface B2bLeadPayload {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: true;
  website?: string;
}

export function makeB2bLeadPayload(overrides: Partial<B2bLeadPayload> = {}): B2bLeadPayload {
  return {
    email: 'sales@museum.fr',
    name: 'Alice Curator',
    museum: 'Louvre Lens',
    role: 'director',
    message: 'We would like to discuss Musaium for our 2026 season programming.',
    consent: true,
    website: '',
    ...overrides,
  };
}
