import '../../../helpers/test-utils';
import { ROUTES, type BottomSheetRouteId } from '@/features/chat/ui/bottom-sheet-router/routes';

describe('attachment-picker route (A1)', () => {
  it('is part of the BottomSheetRouteId union (AC20)', () => {
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
