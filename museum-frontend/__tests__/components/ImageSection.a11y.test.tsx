import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { ImageSection } from '@/features/chat/ui/bubbleSections/ImageSection';

const defaultProps = {
  messageId: 'msg-1',
  url: 'file:///tmp/photo.jpg',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  onImageError: jest.fn(),
};

describe('ImageSection a11y (C-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a localized accessibilityLabel on the attached image (T-C03-1)', () => {
    render(<ImageSection {...defaultProps} />);

    expect(screen.getByLabelText('a11y.chat.attached_image')).toBeTruthy();
  });

  it('sets accessibilityRole="image" on the attached image (T-C03-2)', () => {
    render(<ImageSection {...defaultProps} />);

    const tree = screen.toJSON();
    expect(tree).not.toBeNull();
    if (tree === null || Array.isArray(tree)) {
      throw new Error('expected a single image node');
    }
    expect(tree.props.accessibilityRole).toBe('image');
  });
});
