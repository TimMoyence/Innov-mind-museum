/**
 * Honeypot anti-bot input.
 *
 * UFR-022 RUN_ID 2026-05-23-web-refactor-p4 — replaces the inline
 * `<div aria-hidden style={{position:'absolute',left:'-10000px',...}}>`
 * + `<input tabIndex={-1} autoComplete="off" aria-hidden>` pattern duplicated
 * line-for-line across the 2 marketing forms (`BetaSignupSection`, `B2bContactForm`).
 *
 * - Pure presentational component (no hooks — UB-R8, NFR-PERF-1).
 * - Caller-owns the controlled `value` / `onChange` (E-R1, E-R2).
 * - A11y: wrapper `aria-hidden="true"` + input `aria-hidden="true"` (U-R1, U-R3, UB-R1).
 * - Out of sequential tab order: `tabIndex={-1}` (UB-R2).
 * - `autoComplete="off"` (U-R3).
 * - Off-screen positioning via INLINE STYLE (server-renderable, no CSS dep).
 *   Combo `position: absolute; left: -10000px; height: 0; width: 0; overflow: hidden`
 *   has no Tailwind composite equivalent — kept inline by design (design §2.1).
 * - `className` is additive on the wrapper (O-R7) — off-screen style survives.
 * - i18n: `labelText` caller-owned (NFR-I18N-1, default English "Website").
 */

import type { CSSProperties } from 'react';

export interface HoneypotFieldProps {
  /** Controlled value. Bots auto-fill; humans never see/type. */
  value: string;
  /** Controlled change handler. */
  onChange: (value: string) => void;
  /**
   * HTML `name` attribute + seed for the input id.
   * Default: `"website"` (matches both current consumers).
   */
  fieldName?: string;
  /**
   * Visually-hidden label text (defence-in-depth for AT ignoring aria-hidden).
   * Default: `"Website"`.
   */
  labelText?: string;
  /**
   * Extra className appended to the wrapper. Off-screen inline style is
   * preserved (O-R7 — additive, not default-OR-override).
   */
  className?: string;
}

const OFF_SCREEN_STYLE: CSSProperties = {
  position: 'absolute',
  left: '-10000px',
  height: 0,
  width: 0,
  overflow: 'hidden',
};

export function HoneypotField({
  value,
  onChange,
  fieldName = 'website',
  labelText = 'Website',
  className,
}: HoneypotFieldProps) {
  const inputId = `hp-${fieldName}`;
  const wrapperClassName = className ?? undefined;

  return (
    <div aria-hidden="true" className={wrapperClassName} style={OFF_SCREEN_STYLE}>
      <label htmlFor={inputId}>{labelText}</label>
      <input
        id={inputId}
        type="text"
        name={fieldName}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
    </div>
  );
}
