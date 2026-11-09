import '../../../helpers/test-utils';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { makeEnrichedImage } from '../../../helpers/factories/chat.factories';
import { ImageCarousel } from '@/features/chat/ui/ImageCarousel';
import { fontSize } from '@/shared/ui/tokens';

describe('M3 · la légende sous les vignettes est lisible', () => {
  it('M3 · la légende suit la couleur secondaire du thème et la petite taille de texte', () => {
    render(
      <ImageCarousel
        images={[makeEnrichedImage({ rationale: 'Le pont au coucher du soleil' })]}
        onImagePress={jest.fn()}
      />,
    );

    const caption = StyleSheet.flatten(
      screen.getByText('Le pont au coucher du soleil').props.style,
    );

    expect(caption.color).toBe('#334155');
    expect(caption.fontSize).toBe(fontSize.xs);
  });
});
