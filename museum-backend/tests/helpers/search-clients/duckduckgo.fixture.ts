export interface DuckDuckGoRelatedTopic {
  FirstURL: string;
  Text: string;
}

/** A nested RelatedTopics group (category) — has no FirstURL/Text of its own. */
export interface DuckDuckGoRelatedGroup {
  Name: string;
  Topics: DuckDuckGoRelatedTopic[];
}

export interface DuckDuckGoApiResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: (DuckDuckGoRelatedTopic | DuckDuckGoRelatedGroup)[];
}

export function makeDuckDuckGoRelatedTopic(
  overrides: Partial<DuckDuckGoRelatedTopic> = {},
): DuckDuckGoRelatedTopic {
  return {
    FirstURL: 'https://duckduckgo.com/result',
    Text: 'Example related topic text',
    ...overrides,
  };
}

export function makeDuckDuckGoApiResponse(
  overrides: Partial<DuckDuckGoApiResponse> = {},
): DuckDuckGoApiResponse {
  return {
    Heading: 'Example Heading',
    AbstractText: 'Example abstract text',
    AbstractURL: 'https://example.com/abstract',
    RelatedTopics: [],
    ...overrides,
  };
}
