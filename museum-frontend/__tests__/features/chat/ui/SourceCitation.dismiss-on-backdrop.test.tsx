/**
 * Regression-guard for SourceCitation backdrop-tap dismiss (audit #12).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`, R11.
 *
 * PASSES on current code (audit verdict: non-blocking-and-currently-correct).
 */

import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { SourceCitation } from '@/features/chat/ui/SourceCitation';
import { makeCitationSource } from '../../../helpers/factories/citation-source.factories';

describe('SourceCitation — backdrop tap dismisses preview sheet (audit #12, R11)', () => {
  it('tapping the marker opens the sheet; tapping the backdrop closes it', () => {
    const source = makeCitationSource({ title: 'Wikidata source' });
    const view = render(<SourceCitation source={source} index={1} />);

    // Open by tapping the marker (testID is not declared; we use the
    // accessibilityLabel set on the Pressable).
    fireEvent.press(view.getByLabelText('chat.sources.viewSource'));

    // Backdrop is a Pressable with accessibilityLabel `chat.sources.closeSheet`.
    // The close button in the header also shares the label; the backdrop is
    // the first match in DOM order.
    const closeAffordances = view.getAllByLabelText('chat.sources.closeSheet');
    expect(closeAffordances.length).toBeGreaterThanOrEqual(1);
    const first = closeAffordances[0];
    if (!first) throw new Error('expected at least one close affordance');
    fireEvent.press(first);

    // After dismiss, the open-link CTA must no longer be visible.
    expect(view.queryByLabelText('chat.sources.openLink')).toBeNull();
  });
});
