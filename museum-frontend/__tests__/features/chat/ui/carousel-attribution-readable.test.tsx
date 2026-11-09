import '../../../helpers/test-utils';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { makeEnrichedImage } from '../../../helpers/factories/chat.factories';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { fontSize } from '@/shared/ui/tokens';

describe('M3 · le crédit photo posé sur une vignette reste dans l’échelle de texte', () => {
  it('M3 · le crédit Unsplash n’est jamais plus petit que le plus petit texte du design system', () => {
    render(
      <ImageCarousel
        images={[
          makeEnrichedImage({ source: 'unsplash', attribution: 'Photo by Ana on Unsplash' }),
        ]}
        onImagePress={jest.fn()}
      />,
    );

    const credit = StyleSheet.flatten(screen.getByText('Photo by Ana on Unsplash').props.style);

    expect(credit.fontSize).toBeGreaterThanOrEqual(fontSize['xs-']);
  });
});
