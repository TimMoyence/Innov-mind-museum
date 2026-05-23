/**
 * Regression-guard for MuseumSheet backdrop-tap dismiss (audit #10).
 *
 * UFR-022 run `2026-05-23-chat-composer-buttons-modal-dismiss`, R11.
 *
 * PASSES on current code (audit verdict: non-blocking-and-currently-correct).
 * Future refactor that re-introduces a pointer-events absorber here will
 * fail this test.
 */

import '../../../helpers/test-utils';
import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import type { UseMuseumEnrichmentResult } from '@/features/museum/application/useMuseumEnrichment';

const mockUseMuseumEnrichment = jest.fn<UseMuseumEnrichmentResult, [number | null, string]>();
jest.mock('@/features/museum/application/useMuseumEnrichment', () => ({
  useMuseumEnrichment: (museumId: number | null, locale: string) =>
    mockUseMuseumEnrichment(museumId, locale),
}));

import { MuseumSheet } from '@/features/museum/ui/MuseumSheet';
import { makeMuseumWithDistance } from '../../../helpers/factories/museum.factories';
import { renderWithQueryClient } from '../../../helpers/data/renderWithQueryClient';

const enrichmentStub: UseMuseumEnrichmentResult = {
  data: null,
  status: 'idle',
  refresh: () => undefined,
};

describe('MuseumSheet — backdrop tap dismisses (audit #10, R11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMuseumEnrichment.mockReturnValue(enrichmentStub);
  });

  it('calls onClose when the backdrop Pressable is pressed', () => {
    const onClose = jest.fn();
    const view = renderWithQueryClient(
      <MuseumSheet
        museum={makeMuseumWithDistance()}
        onClose={onClose}
        onStartChat={jest.fn()}
        onOpenInMaps={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    // The MuseumSheet backdrop has accessibilityLabel from i18n key
    // `museumDirectory.close_sheet_a11y` (test-utils mock returns the key).
    const backdrop = view.getByLabelText('museumDirectory.close_sheet_a11y');
    fireEvent.press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
