// src/i18n/locales.js
//
// Single source of truth for the languages the app supports.
//
// We do NOT use Next.js [locale] route segments. The locale is owned by
// the wedding document in Firestore — set once by the super-admin per
// event, then every couple/celebrant page (portal, guest page, etc.)
// reads it from the doc and wraps its content in NextIntlClientProvider
// with that locale. URLs stay /w/abc, /wedding/.../portal — same shape
// they have today, no breaking redirects, no SEO migration.
//
// To add a language:
//   1. Add it to LOCALES below
//   2. Create src/i18n/messages/{code}.json (copy he.json, translate)
//   3. (optional) update font registry if the script needs different fonts

export const LOCALES = {
    he: { id: 'he', label: 'עברית', dir: 'rtl', dateFormat: 'dd/MM/yyyy' },
    en: { id: 'en', label: 'English', dir: 'ltr', dateFormat: 'MM/dd/yyyy' },
    es: { id: 'es', label: 'Español', dir: 'ltr', dateFormat: 'dd/MM/yyyy' },
    it: { id: 'it', label: 'Italiano', dir: 'ltr', dateFormat: 'dd/MM/yyyy' },
}

export const LOCALE_ORDER = ['he', 'en', 'es', 'it']
export const DEFAULT_LOCALE = 'he'

/** Coerce any incoming string to a valid locale id. Falls back to default. */
export function normalizeLocale(raw) {
    if (raw && Object.prototype.hasOwnProperty.call(LOCALES, raw)) return raw
    return DEFAULT_LOCALE
}

/** Get the full locale entry (id, label, dir, dateFormat). Always valid. */
export function getLocale(raw) {
    return LOCALES[normalizeLocale(raw)]
}

/** Convenience: 'rtl' or 'ltr' for the <html dir> attribute. */
export function dirFor(raw) {
    return getLocale(raw).dir
}
