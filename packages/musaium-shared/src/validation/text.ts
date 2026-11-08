export interface TextLimit {
  readonly min?: number;
  readonly max: number;
}

export const TEXT_LIMITS = {
  password: { min: 8, max: 128 },
  personName: { max: 100 },
  museumName: { min: 1, max: 200 },
  museumSlug: { min: 1, max: 128 },
  museumAddress: { max: 500 },
  museumDescription: { max: 2000 },
  contactName: { min: 1, max: 120 },
  contactMessage: { min: 10, max: 5000 },
  leadMuseum: { min: 1, max: 200 },
  ticketSubject: { min: 3, max: 200 },
  ticketDescription: { min: 10, max: 5000 },
  ticketCategory: { max: 64 },
  ticketMessage: { min: 1, max: 2000 },
  reviewComment: { min: 10, max: 2000 },
  reviewerNotes: { max: 2000 },
} as const satisfies Record<string, TextLimit>;

export function charCount(value: string): number {
  return Array.from(value).length;
}

export function isWithinLimit(value: string, { min = 0, max }: TextLimit): boolean {
  const count = charCount(value);
  return count >= min && count <= max;
}

export function describeLimit(field: string, { min = 0, max }: TextLimit): string {
  return min > 0
    ? `${field} must be between ${String(min)} and ${String(max)} characters`
    : `${field} must be at most ${String(max)} characters`;
}

export function clampChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}
