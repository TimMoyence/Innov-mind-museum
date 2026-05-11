import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { makeCitationSource } from '../../helpers/factories';

import { SourceCitation } from '@/features/chat/ui/SourceCitation';

describe('SourceCitation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the citation index marker [n] (numbered from 1)', () => {
    const source = makeCitationSource({ title: 'Mona Lisa — Wikidata' });
    render(<SourceCitation source={source} index={1} />);
    expect(screen.getByText('[1]')).toBeTruthy();
  });

  it('renders different index markers for different positions in the list', () => {
    const source = makeCitationSource();
    render(<SourceCitation source={source} index={3} />);
    expect(screen.getByText('[3]')).toBeTruthy();
  });

  it('opens the bottom-sheet showing title + quote when the marker is tapped', () => {
    const source = makeCitationSource({
      title: 'Mona Lisa — Wikidata',
      quote: 'The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.',
    });
    render(<SourceCitation source={source} index={1} />);

    // Pre-tap: bottom-sheet content not yet visible.
    expect(screen.queryByText('Mona Lisa — Wikidata')).toBeNull();

    fireEvent.press(screen.getByLabelText('chat.sources.viewSource'));

    // Post-tap: title + quote visible inside the sheet.
    expect(screen.getByText('Mona Lisa — Wikidata')).toBeTruthy();
    expect(
      screen.getByText('The Mona Lisa is a half-length portrait painting by Leonardo da Vinci.'),
    ).toBeTruthy();
  });

  it('opens the URL via Linking.openURL when the "open source" button is pressed', () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const source = makeCitationSource({ url: 'https://www.wikidata.org/wiki/Q12418' });
    render(<SourceCitation source={source} index={1} />);

    // Open the sheet first, then tap the external-link CTA.
    fireEvent.press(screen.getByLabelText('chat.sources.viewSource'));
    fireEvent.press(screen.getByLabelText('chat.sources.openLink'));

    expect(openURLSpy).toHaveBeenCalledWith('https://www.wikidata.org/wiki/Q12418');
    openURLSpy.mockRestore();
  });

  it('exposes a11y label on the citation marker (button role + viewSource label)', () => {
    const source = makeCitationSource();
    render(<SourceCitation source={source} index={2} />);
    const marker = screen.getByLabelText('chat.sources.viewSource');
    expect(marker).toBeTruthy();
    expect(marker.props.accessibilityRole).toBe('button');
  });

  it('renders gracefully when the quote is an empty string (no crash, sheet still opens)', () => {
    const source = makeCitationSource({ title: 'Source without quote', quote: '' });
    render(<SourceCitation source={source} index={1} />);
    expect(screen.getByText('[1]')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('chat.sources.viewSource'));
    // Title still shown, quote area handles empty defensively.
    expect(screen.getByText('Source without quote')).toBeTruthy();
  });
});
