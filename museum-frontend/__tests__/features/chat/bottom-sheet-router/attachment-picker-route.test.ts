/**
 * Red test for A1 — `attachment-picker` route registry entry.
 *
 * Validates that the C4 routes registry is extended (R8/R9, AC20/AC21) with
 * an `attachment-picker` entry whose presentation is `sheet` (slide-up) and
 * which is non-blocking (the user must be able to dismiss the picker via
 * backdrop tap, swipe-down, or Android back).
 *
 * Spec: docs/chat-ux-refonte/specs/A1.md §1.2.
 */

import '../../../helpers/test-utils';
import { ROUTES, type BottomSheetRouteId } from '@/features/chat/ui/bottom-sheet-router/routes';

describe('attachment-picker route (A1)', () => {
  it('is part of the BottomSheetRouteId union (AC20)', () => {
    // Type-level assertion: the literal 'attachment-picker' must be assignable
    // to BottomSheetRouteId. If it is missing from the union, this assignment
    // fails at compile time and breaks the suite.
    const id: BottomSheetRouteId = 'attachment-picker';
    expect(id).toBe('attachment-picker');
  });

  it('is registered in ROUTES (AC21)', () => {
    expect(ROUTES['attachment-picker']).toBeDefined();
  });

  it('uses presentation "sheet" (R9, AC21)', () => {
    const def = ROUTES['attachment-picker'];
    expect(def?.presentation).toBe('sheet');
  });

  it('is non-blocking (R9, AC21)', () => {
    const def = ROUTES['attachment-picker'];
    expect(def?.blocking).toBe(false);
  });

  it('declares the a11y announce key (R9, AC21)', () => {
    const def = ROUTES['attachment-picker'];
    expect(def?.a11yAnnounceKey).toBe('a11y.attachmentPicker.opened');
  });

  it('exposes a Content component (R11)', () => {
    const def = ROUTES['attachment-picker'];
    expect(typeof def?.Content).toBe('function');
  });
});
