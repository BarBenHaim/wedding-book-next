// src/i18n/getMessages.js
//
// Synchronous message loader. Each locale's messages are bundled at build
// time, so there's no async/network cost — `getMessages('en')` returns
// the parsed JSON immediately.
//
// Usage on the client:
//   <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
//
// Usage on the server (RSC):
//   const messages = getMessages(locale)
//
// Adding a language: import the new JSON, register it in MESSAGES.

import he from './messages/he.json'
import en from './messages/en.json'
import es from './messages/es.json'
import it from './messages/it.json'

import { normalizeLocale } from './locales'

const MESSAGES = { he, en, es, it }

/**
 * Get the message catalogue for a given locale.
 * Falls back to the default locale (Hebrew) if a translation is missing
 * for the requested locale, so the app never renders raw keys.
 */
export function getMessages(rawLocale) {
    const locale = normalizeLocale(rawLocale)
    return MESSAGES[locale] || MESSAGES.he
}
