export interface DuckDuckGoRelatedTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoRelatedTopic[];
}

export interface DuckDuckGoApiResponse {
  AbstractText: string;
  AbstractURL: string;
  Heading: string;
  RelatedTopics: DuckDuckGoRelatedTopic[];
}

export function makeDuckDuckGoRelatedTopic(
  overrides: DuckDuckGoRelatedTopic = {},
): DuckDuckGoRelatedTopic {
  return {
    FirstURL: 'https://example.com/topic',
    Text: 'Related topic text',
    ...overrides,
  };
}

export function makeDuckDuckGoApiResponse(
  overrides: Partial<DuckDuckGoApiResponse> = {},
): DuckDuckGoApiResponse {
  return {
    AbstractText: '',
    AbstractURL: '',
    Heading: '',
    RelatedTopics: [],
    ...overrides,
  };
}
