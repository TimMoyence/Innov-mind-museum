/**
 * Red test for B4 — `cartel-scanner` route registry entry.
 *
 * Validates that the C4 routes registry is extended (R5/R6, AC9/AC10/AC11)
 * with a `cartel-scanner` entry whose presentation is `fullscreen` (camera
 * preview wants the whole screen) and which is non-blocking (the user must
 * be able to cancel via Android back / swipe-down / explicit cancel button).
 *
 * Spec: docs/chat-ux-refonte/specs/B4.md §1.2.
 */

import '../../../helpers/test-utils';
import { ROUTES, type BottomSheetRouteId } from '@/features/chat/ui/bottom-sheet-router/routes';

describe('cartel-scanner route (B4)', () => {
  it('is part of the BottomSheetRouteId union (AC9)', () => {
    // Type-level assertion: the literal 'cartel-scanner' must be assignable
    // to BottomSheetRouteId. If it is missing, the assignment fails at
    // compile time and the suite never runs.
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
