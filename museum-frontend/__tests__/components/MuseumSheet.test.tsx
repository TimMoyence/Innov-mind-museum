import '../helpers/test-utils';
import type { ReactElement } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { MuseumSheet } from '@/features/museum/ui/MuseumSheet';
import { makeMuseumWithDistance as makeMuseum } from '../helpers/factories/museum.factories';
import { renderWithQueryClient } from '../helpers/data/renderWithQueryClient';

// MuseumSheet now eagerly prefetches enrichment via useMuseumEnrichment (react-query),
// so every render needs a QueryClient in scope.
const render = (ui: ReactElement) => renderWithQueryClient(ui);

describe('MuseumSheet', () => {
  const baseProps = {
    onClose: jest.fn(),
    onStartChat: jest.fn(),
    onOpenInMaps: jest.fn(),
    onViewDetails: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when museum is null', () => {
    render(<MuseumSheet museum={null} {...baseProps} />);
    expect(screen.queryByLabelText('museumDirectory.start_chat')).toBeNull();
  });

  it('renders museum name, address and distance when provided', () => {
    const museum = makeMuseum({
      name: 'Cap Sciences',
      address: '20 Quai de Bacalan',
      distanceMeters: 2_996_000,
    });
    render(<MuseumSheet museum={museum} {...baseProps} />);

    expect(screen.getByText('Cap Sciences')).toBeTruthy();
    expect(screen.getByText('20 Quai de Bacalan')).toBeTruthy();
    expect(screen.getByText('museumDirectory.distance_km')).toBeTruthy();
  });

  it('invokes onStartChat with the museum when primary button pressed', () => {
    const museum = makeMuseum();
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.start_chat'));
    expect(baseProps.onStartChat).toHaveBeenCalledWith(museum);
  });

  it('invokes onOpenInMaps when maps button pressed', () => {
    const museum = makeMuseum({ latitude: 44.86, longitude: -0.55 });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.open_in_maps'));
    expect(baseProps.onOpenInMaps).toHaveBeenCalledWith(museum);
  });

  it('invokes onViewDetails when view-details button pressed', () => {
    const museum = makeMuseum();
    render(<MuseumSheet museum={museum} {...baseProps} />);
    fireEvent.press(screen.getByLabelText('museumDirectory.view_details'));
    expect(baseProps.onViewDetails).toHaveBeenCalledWith(museum);
  });

  it('hides the maps button when coordinates are missing', () => {
    const museum = makeMuseum({ latitude: null, longitude: null });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    expect(screen.queryByLabelText('museumDirectory.open_in_maps')).toBeNull();
  });

  it('shows the localized category label', () => {
    const museum = makeMuseum({ museumType: 'art' });
    render(<MuseumSheet museum={museum} {...baseProps} />);
    expect(screen.getByText('museumDirectory.category.art')).toBeTruthy();
  });
});
