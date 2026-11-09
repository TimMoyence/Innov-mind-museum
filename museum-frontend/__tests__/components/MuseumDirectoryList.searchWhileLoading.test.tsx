import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

import { MuseumDirectoryList } from '@/features/museum/ui/MuseumDirectoryList';

const props = {
  museums: [],
  searchQuery: 'Bord',
  onSearchChange: jest.fn(),
  onMuseumPress: jest.fn(),
  onRefresh: jest.fn(),
};

describe('MuseumDirectoryList — recherche pendant un chargement', () => {
  it('garde le champ de recherche et sa saisie pendant que la liste charge', () => {
    render(<MuseumDirectoryList {...props} isLoading />);

    expect(screen.getByPlaceholderText('museumDirectory.search_placeholder').props.value).toBe(
      'Bord',
    );
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(5);
  });
});
