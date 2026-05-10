import '../../../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { ImageCarouselSkeleton } from '@/features/chat/ui/ImageCarouselSkeleton';

describe('ImageCarouselSkeleton (C2.4 v2)', () => {
  it('renders 3 placeholder thumbs inside a non-scrollable progressbar container', () => {
    const { toJSON } = render(<ImageCarouselSkeleton />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('exposes the progressbar a11y role with the localized loading label', () => {
    render(<ImageCarouselSkeleton />);
    // i18n is mocked to return the key as-is.
    const node = screen.getByLabelText('chat.enrichment.skeleton_loading');
    expect(node).toBeTruthy();
  });
});
