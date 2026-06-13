export interface GoogleCseApiItem {
  link: string;
  title: string;
  snippet: string;
}

export function makeGoogleCseItem(overrides: Partial<GoogleCseApiItem> = {}): GoogleCseApiItem {
  return {
    link: 'https://example.com/result',
    title: 'Example Result',
    snippet: 'Example snippet content',
    ...overrides,
  };
}

export function makeGoogleCseApiResponse(items: GoogleCseApiItem[] = [makeGoogleCseItem()]): {
  items: GoogleCseApiItem[];
} {
  return { items };
}
