"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LOCALE = exports.SUPPORTED_LOCALES = void 0;
exports.isSupportedLocale = isSupportedLocale;
/** Locales supported by the Musaium product surface (BE + Web + Mobile). */
exports.SUPPORTED_LOCALES = ['fr', 'en'];
/** Default locale when no Accept-Language / body override is provided. */
exports.DEFAULT_LOCALE = 'fr';
/** Type guard narrowing an unknown string to `Locale`. */
function isSupportedLocale(value) {
    return typeof value === 'string' && exports.SUPPORTED_LOCALES.includes(value);
}
