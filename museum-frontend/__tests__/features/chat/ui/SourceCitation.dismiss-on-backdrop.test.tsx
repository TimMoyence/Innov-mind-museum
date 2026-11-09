import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SourceCitation } from '@/features/chat/ui/SourceCitation';
import { makeCitationSource } from '../../../helpers/factories/citation-source.factories';

describe('SourceCitation — backdrop tap dismisses preview sheet (audit #12, R11)', () => {
  it('tapping the marker opens the sheet; tapping the backdrop closes it', () => {
    const source = makeCitationSource({ title: 'Wikidata source' });
    const view = render(<SourceCitation source={source} index={1} />);

    fireEvent.press(view.getByLabelText('chat.sources.viewSource'));

    const closeAffordances = view.getAllByLabelText('chat.sources.closeSheet');
    expect(closeAffordances.length).toBeGreaterThanOrEqual(1);
    const first = closeAffordances[0];
    if (!first) throw new Error('expected at least one close affordance');
    fireEvent.press(first);

    expect(view.queryByLabelText('chat.sources.openLink')).toBeNull();
  });
});
