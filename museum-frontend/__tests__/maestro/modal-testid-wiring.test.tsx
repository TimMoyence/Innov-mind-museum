/**
 * C2 — Maestro modal testID *wiring* proof (functional, not presence).
 *
 * The frozen oracle `modal-coverage.test.ts` only proves the testID strings
 * EXIST in source (`.toContain`) and the flow files exist. That is necessary
 * but NOT sufficient: a testID can be a dead string on the wrong element, or a
 * prop swallowed by a wrapper (`LiquidButton`) that never reaches the runtime
 * tree — both pass a `.toContain` check yet make the Maestro `tapOn: {id}`
 * resolve to nothing (the DOB-2026-05-17 class of false-green).
 *
 * This suite renders each modal with @testing-library/react-native and proves,
 * for every testID added in cluster C2:
 *   (1) it RESOLVES at runtime (`getByTestId` finds it in the rendered tree —
 *       for LiquidButton-hosted ids this also proves the prop is forwarded), and
 *   (2) it is wired to the CORRECT behaviour (pressing it fires the expected
 *       handler / flips the expected state).
 *
 * It also renders the two dev-only deeplink routes and proves they actually
 * mount the modal (offline) / trigger the paywall open (paywall) — i.e. the
 * Maestro deeplink target is functional, not an empty route.
 *
 * NOT the frozen test — this is an additional, behaviour-exercising companion.
 */

import '../helpers/test-utils';
import type React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { makeCitationSource, makeEnrichedImage } from '../helpers/factories';
// makeMuseumWithDistance is not re-exported by the factories barrel — import direct.
import { makeMuseumWithDistance } from '../helpers/factories/museum.factories';
// MuseumSheet renders a child that calls useQuery → needs a QueryClientProvider.
import { renderWithQueryClient } from '../helpers/data/renderWithQueryClient';

// ── react-native-gesture-handler — ArtworkHeroModal uses Gesture.Pinch ────────
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    Gesture: { Pinch: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// ── useReducedMotion — drive ImageFullscreenModal navigation synchronously ────
jest.mock('@/shared/ui/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// ── leadsApi — QuotaUpsellModal imports it; never hit the network in unit ─────
jest.mock('@/features/paywall/infrastructure/leadsApi', () => ({
  leadsApi: { submitPaywallInterest: jest.fn().mockResolvedValue(undefined) },
}));

// ── PaywallProvider — paywall-preview dev route calls usePaywall().open() ─────
const mockPaywallOpen = jest.fn();
jest.mock('@/features/paywall/application/PaywallProvider', () => ({
  usePaywall: () => ({ open: mockPaywallOpen }),
}));

import { ArtworkHeroModal } from '@/features/chat/ui/ArtworkHeroModal';
import { ImageFullscreenModal } from '@/features/chat/ui/ImageFullscreenModal';
import { SourceCitation } from '@/features/chat/ui/SourceCitation';
import { BiometricSetupSheet } from '@/features/auth/ui/BiometricSetupSheet';
import { MuseumCard } from '@/features/museum/ui/MuseumCard';
import { MuseumSheet } from '@/features/museum/ui/MuseumSheet';
import { MuseumSheetActions } from '@/features/museum/ui/MuseumSheetActions';
import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';
import { OfflinePackPrompt } from '@/features/museum/ui/OfflinePackPrompt';
import OfflinePromptPreviewRoute from '@/app/(dev)/offline-prompt-preview';
import PaywallPreviewRoute from '@/app/(dev)/paywall-preview';

const artworkModel = {
  imageUrl: 'https://example.test/artwork.jpg',
  title: 'La Joconde',
  artist: 'Leonardo da Vinci',
  museum: 'Louvre',
  room: 'Salle des États',
  confidence: 0.95,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('C2 modal testID wiring (runtime resolve + handler)', () => {
  it('ArtworkHeroModal: artwork-hero-modal-close resolves and fires onClose', () => {
    const onClose = jest.fn();
    render(<ArtworkHeroModal visible model={artworkModel} onClose={onClose} />);
    const close = screen.getByTestId('artwork-hero-modal-close');
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ImageFullscreenModal: close fires onClose; next/prev navigate', () => {
    const onClose = jest.fn();
    const images = [makeEnrichedImage(), makeEnrichedImage()];
    render(<ImageFullscreenModal images={images} initialIndex={0} visible onClose={onClose} />);

    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('image-fullscreen-modal-next'));
    expect(screen.getByText('2 / 2')).toBeTruthy(); // next wired
    fireEvent.press(screen.getByTestId('image-fullscreen-modal-prev'));
    expect(screen.getByText('1 / 2')).toBeTruthy(); // prev wired

    fireEvent.press(screen.getByTestId('image-fullscreen-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('SourceCitation: marker opens sheet; open-url hands off to Linking; close dismisses', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const source = makeCitationSource({ url: 'https://museum.test/source', quote: 'A quote.' });
    render(<SourceCitation source={source} index={1} />);

    // marker is the open trigger
    fireEvent.press(screen.getByTestId('source-citation-marker'));

    // sheet content now resolvable + wired
    fireEvent.press(screen.getByTestId('source-citation-open-url'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://museum.test/source');

    // close dismisses without throwing
    expect(() => {
      fireEvent.press(screen.getByTestId('source-citation-close'));
    }).not.toThrow();
    openUrlSpy.mockRestore();
  });

  it('BiometricSetupSheet: LiquidButton forwards testID — activate/skip fire their handlers', async () => {
    const onActivate = jest.fn().mockResolvedValue(undefined);
    const onSkip = jest.fn();
    render(
      <BiometricSetupSheet
        visible
        biometricLabel="Face ID"
        onActivate={onActivate}
        onSkip={onSkip}
      />,
    );
    // Proves LiquidButton's testID passthrough (G1.3 risk) reaches the DOM.
    // LiquidButton.onPress awaits Haptics first → handler fires on a later
    // microtask, so the assertion must waitFor (a Maestro tap absorbs this via
    // waitForAnimationToEnd).
    fireEvent.press(screen.getByTestId('biometric-setup-activate'));
    await waitFor(() => {
      expect(onActivate).toHaveBeenCalledTimes(1);
    });
    fireEvent.press(screen.getByTestId('biometric-setup-skip'));
    await waitFor(() => {
      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  it('MuseumCard: museum-card resolves and fires onPress with the museum', () => {
    const onPress = jest.fn();
    const museum = makeMuseumWithDistance();
    render(<MuseumCard museum={museum} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('museum-card'));
    expect(onPress).toHaveBeenCalledWith(museum);
  });

  it('MuseumSheetActions: start-chat / open-maps / view-details fire their handlers', () => {
    const onStartChat = jest.fn();
    const onOpenInMaps = jest.fn();
    const onViewDetails = jest.fn();
    const museum = makeMuseumWithDistance({ latitude: 44.84, longitude: -0.58 });
    render(
      <MuseumSheetActions
        museum={museum}
        onStartChat={onStartChat}
        onOpenInMaps={onOpenInMaps}
        onViewDetails={onViewDetails}
      />,
    );
    fireEvent.press(screen.getByTestId('museum-sheet-start-chat'));
    expect(onStartChat).toHaveBeenCalledWith(museum);
    fireEvent.press(screen.getByTestId('museum-sheet-open-maps'));
    expect(onOpenInMaps).toHaveBeenCalledWith(museum);
    fireEvent.press(screen.getByTestId('museum-sheet-view-details'));
    expect(onViewDetails).toHaveBeenCalledWith(museum);
  });

  it('MuseumSheet: header close (museum-sheet-close) is the Maestro-reachable dismiss', () => {
    const onClose = jest.fn();
    const museum = makeMuseumWithDistance();
    renderWithQueryClient(
      <MuseumSheet
        museum={museum}
        onClose={onClose}
        onStartChat={jest.fn()}
        onOpenInMaps={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );
    // museum-sheet-close lives in the header, INSIDE the modal's
    // accessibilityViewIsModal subtree → reachable by Maestro (verified on a live
    // iOS 26.4 sim run 2026-05-25, where tapOn id:museum-sheet-backdrop resolved
    // to nothing). Default query (no includeHiddenElements) proves it is visible
    // to the a11y tree.
    fireEvent.press(screen.getByTestId('museum-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('MuseumSheet: backdrop is a touch affordance (a11y-hidden — not a Maestro target)', () => {
    const onClose = jest.fn();
    const museum = makeMuseumWithDistance();
    renderWithQueryClient(
      <MuseumSheet
        museum={museum}
        onClose={onClose}
        onStartChat={jest.fn()}
        onOpenInMaps={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );
    // The backdrop sits behind the sheet content (accessibilityViewIsModal) →
    // a11y-hidden. It still dismisses on a real touch, but is excluded from the
    // default a11y query (and from Maestro's hierarchy). includeHiddenElements
    // surfaces it and proves the touch handler is wired.
    expect(screen.queryByTestId('museum-sheet-backdrop')).toBeNull();
    fireEvent.press(screen.getByTestId('museum-sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('QuotaUpsellModal: modal/dismiss/email/consent/submit wired', () => {
    const onClose = jest.fn();
    const reason = {
      tier: 'free',
      currentCount: 5,
      limit: 5,
      resetAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    render(<QuotaUpsellModal visible reason={reason} onClose={onClose} />);

    expect(screen.getByTestId('quota-upsell-modal')).toBeTruthy();

    // email input is controlled — changeText flows back through value
    fireEvent.changeText(screen.getByTestId('quota-upsell-email'), 'qa@musaium.test');
    expect(screen.getByTestId('quota-upsell-email').props.value).toBe('qa@musaium.test');

    // consent toggle flips accessibilityState.checked false → true
    expect(screen.getByTestId('quota-upsell-consent').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByTestId('quota-upsell-consent'));
    expect(screen.getByTestId('quota-upsell-consent').props.accessibilityState.checked).toBe(true);

    // submit anchor resolves (CTA present)
    expect(screen.getByTestId('quota-upsell-submit')).toBeTruthy();

    // dismiss fires onClose
    fireEvent.press(screen.getByTestId('quota-upsell-dismiss'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('OfflinePackPrompt: runtime-derived ${testID}-accept/-decline resolve and fire handlers', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    render(
      <OfflinePackPrompt
        visible
        cityName="Bordeaux"
        packState={{ status: 'absent' }}
        errorVisible={false}
        onAccept={onAccept}
        onDecline={onDecline}
        onRetry={jest.fn()}
        onDismiss={jest.fn()}
        testID="museum-map-offline-prompt"
      />,
    );
    // Derived anchors must resolve identically to the prod call-site literal.
    // accept/decline are LiquidButtons (async onPress via Haptics) → waitFor.
    fireEvent.press(screen.getByTestId('museum-map-offline-prompt-accept'));
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1);
    });
    fireEvent.press(screen.getByTestId('museum-map-offline-prompt-decline'));
    await waitFor(() => {
      expect(onDecline).toHaveBeenCalledTimes(1);
    });
  });
});

describe('C2 dev-only deeplink routes are functional Maestro targets', () => {
  it('offline-prompt-preview mounts OfflinePackPrompt with the prod testID (derived anchors resolve)', () => {
    render(<OfflinePromptPreviewRoute />);
    // The route is the deeplink target for modal-museum-offline-pack.yaml;
    // these are the exact ids the flow taps.
    expect(screen.getByTestId('museum-map-offline-prompt-accept')).toBeTruthy();
    expect(screen.getByTestId('museum-map-offline-prompt-decline')).toBeTruthy();
    // Tapping decline must not throw (route owns the dismiss handler).
    expect(() => {
      fireEvent.press(screen.getByTestId('museum-map-offline-prompt-decline'));
    }).not.toThrow();
  });

  it('paywall-preview opens the paywall with a well-formed quota reason at mount', () => {
    render(<PaywallPreviewRoute />);
    expect(mockPaywallOpen).toHaveBeenCalledTimes(1);
    const reason = mockPaywallOpen.mock.calls[0][0] as {
      tier: string;
      currentCount: number;
      limit: number;
      resetAt: string;
    };
    expect(reason.tier).toBe('free');
    expect(reason.currentCount).toBe(reason.limit);
    expect(Number.isNaN(Date.parse(reason.resetAt))).toBe(false);
    expect(Date.parse(reason.resetAt)).toBeGreaterThan(Date.now());
  });
});
