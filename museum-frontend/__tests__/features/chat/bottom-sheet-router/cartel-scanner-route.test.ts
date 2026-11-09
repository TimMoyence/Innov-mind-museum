import '../../../helpers/test-utils';
import { ROUTES, type BottomSheetRouteId } from '@/features/chat/ui/bottom-sheet-router/routes';

describe('cartel-scanner route (B4)', () => {
  it('is part of the BottomSheetRouteId union (AC9)', () => {
    const id: BottomSheetRouteId = 'cartel-scanner';
    expect(id).toBe('cartel-scanner');
  });

  it('is registered in ROUTES (AC9)', () => {
    expect(ROUTES['cartel-scanner']).toBeDefined();
  });

  it('uses presentation "fullscreen" (R6, AC10)', () => {
    const def = ROUTES['cartel-scanner'];
    expect(def?.presentation).toBe('fullscreen');
  });

  it('is non-blocking (R6, AC10)', () => {
    const def = ROUTES['cartel-scanner'];
    expect(def?.blocking).toBe(false);
  });

  it('declares the a11y announce key (R6, AC10)', () => {
    const def = ROUTES['cartel-scanner'];
    expect(def?.a11yAnnounceKey).toBe('a11y.cartelScanner.opened');
  });

  it('exposes a Content function component (R8, AC11)', () => {
    const def = ROUTES['cartel-scanner'];
    expect(typeof def?.Content).toBe('function');
  });
});
