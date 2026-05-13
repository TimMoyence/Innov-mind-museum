/** Locales supported by the Musaium product surface (BE + Web + Mobile). */
export declare const SUPPORTED_LOCALES: readonly ["fr", "en"];
/** Type union of the supported locales — use as `Locale` in app code. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];
/** Default locale when no Accept-Language / body override is provided. */
export declare const DEFAULT_LOCALE: Locale;
/** Type guard narrowing an unknown string to `Locale`. */
export declare function isSupportedLocale(value: unknown): value is Locale;
