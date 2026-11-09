import type { CitationSource } from '@modules/chat/domain/chat.types';

export function makeCitationSource(overrides: Partial<CitationSource> = {}): CitationSource {
  return {
    url: 'https://www.wikidata.org/wiki/Q12418',
    type: 'wikidata',
    title: 'Mona Lisa',
    quote: 'The Mona Lisa is a half-length portrait by Leonardo da Vinci.',
    ...overrides,
  };
}
