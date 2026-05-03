// src/lib/eventTypes.js
//
// Two orthogonal concepts:
//
//   1. EVENT TYPE — drives the COPY on the guest page.
//      Values: wedding | birthday | bar_mitzvah | bat_mitzvah.
//      Each type provides: subtitle, description, ctaLabel, footer, and a
//      DEFAULT theme color.
//
//   2. THEME COLOR — drives the COLORS on the guest page.
//      Values: gold | pink | blue.  Exactly three palettes — the user wants
//      a simple picker, not a custom color per event.
//      The super-admin can pick any color for any event type, so they are
//      fully independent.
//
// Firestore `weddings` document may carry any of these extra fields:
//   eventType:      'wedding' | 'birthday' | 'bar_mitzvah' | 'bat_mitzvah'
//                   — missing/unknown → 'wedding' (backward-compat).
//   themeColor:     'gold' | 'pink' | 'blue'
//                   — missing/unknown → defaults from the event type.
//   celebrantName:  string  — used by birthday / bar_mitzvah / bat_mitzvah
//   age:            number  — used by birthday (e.g. "יום הולדת 78")
//   customTitle:       string  — optional full override of the main title
//   customSubtitle:    string  — optional override of the small label above title
//   customDescription: string  — optional override of the description paragraph
//
// Existing fields still in use for 'wedding':
//   brideName, groomName, weddingDate

// ─── Theme colors ─────────────────────────────────────────────────────────────
//
// Each palette key maps 1:1 to a visual spot on the guest page:
//   label       — small label above the title
//   name        — main title color
//   accent      — decorative "&" separator / border color
//   description — short description paragraph
//   bgGradient  — page background (top-to-bottom)
//   footer      — tiny faded tagline
//   button      — CTA button tint overlay
//   swatch      — single solid color shown in the admin picker
export const THEME_COLORS = {
    gold: {
        id: 'gold',
        label: 'זהב',
        swatch: '#D3B665',
        palette: {
            label: '#96884e',
            name: '#3d2e1a',
            accent: '#D3B665',
            description: '#7a6548',
            bgGradient: 'linear-gradient(180deg, #ffffff 0%, #fdfcf9 30%, #f9f3e8 60%, #f2e8d3 100%)',
            footer: 'rgba(138,109,64,0.2)',
            button: 'rgba(255, 213, 116, 0.6)',
        },
    },

    pink: {
        id: 'pink',
        label: 'ורוד',
        swatch: '#e9a3b0',
        palette: {
            label: '#b45a6f',
            name: '#3a1f2a',
            accent: '#e9a3b0',
            description: '#7a5260',
            bgGradient: 'linear-gradient(180deg, #ffffff 0%, #fff7f8 30%, #fde8ec 60%, #f8d2d9 100%)',
            footer: 'rgba(180,90,111,0.22)',
            button: 'rgba(249, 190, 202, 0.65)',
        },
    },

    blue: {
        id: 'blue',
        label: 'כחול',
        swatch: '#7aa4d6',
        palette: {
            label: '#2b4a7a',
            name: '#1a2540',
            accent: '#7aa4d6',
            description: '#49577a',
            bgGradient: 'linear-gradient(180deg, #ffffff 0%, #f7faff 30%, #e7f0fb 60%, #cfdff4 100%)',
            footer: 'rgba(43,74,122,0.22)',
            button: 'rgba(150, 185, 230, 0.65)',
        },
    },
}

export const THEME_COLOR_ORDER = ['gold', 'pink', 'blue']

export function normalizeThemeColor(raw) {
    if (raw && Object.prototype.hasOwnProperty.call(THEME_COLORS, raw)) return raw
    return null // null means "use event-type default"
}

// ─── Event types ──────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
    wedding: 'wedding',
    birthday: 'birthday',
    bar_mitzvah: 'bar_mitzvah',
    bat_mitzvah: 'bat_mitzvah',
}

export const EVENT_TYPE_ORDER = ['wedding', 'birthday', 'bar_mitzvah', 'bat_mitzvah']

// Per-event-type config that's NOT locale-dependent. The user-facing
// strings (label, subtitle, description, ctaLabel, footer) live in
// src/i18n/messages/{locale}.json under the "eventTypes.{type}" key.
// `defaultTheme` is the only thing that's truly type-specific and not
// language-specific — Bar Mitzvah is blue, birthday is pink, etc.
const EVENT_TYPE_META = {
    wedding: { id: 'wedding', defaultTheme: 'gold' },
    birthday: { id: 'birthday', defaultTheme: 'pink' },
    bar_mitzvah: { id: 'bar_mitzvah', defaultTheme: 'blue' },
    bat_mitzvah: { id: 'bat_mitzvah', defaultTheme: 'blue' },
}

// Lazy-loaded fallback message catalogue. We ALWAYS resolve via the JSON
// files so we don't keep two parallel sources of truth. The Hebrew
// catalogue is the legacy default for every getEventConfig() caller that
// doesn't pass a locale.
import heMessages from '../i18n/messages/he.json'
import enMessages from '../i18n/messages/en.json'
import esMessages from '../i18n/messages/es.json'
import itMessages from '../i18n/messages/it.json'

const LOCALE_MESSAGES = {
    he: heMessages,
    en: enMessages,
    es: esMessages,
    it: itMessages,
}

function messagesFor(locale) {
    return LOCALE_MESSAGES[locale] || LOCALE_MESSAGES.he
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function normalizeEventType(raw) {
    if (raw && Object.prototype.hasOwnProperty.call(EVENT_TYPE_META, raw)) return raw
    return 'wedding'
}

/**
 * Get the resolved config for an event type, in a specific locale.
 *
 *   getEventConfig('bar_mitzvah')       → Hebrew (legacy default)
 *   getEventConfig('bar_mitzvah', 'en') → English
 *
 * Returned shape preserves the historical API (id, hebrewLabel, subtitle,
 * description, ctaLabel, footer, defaultTheme) so existing call-sites
 * keep working without changes. `hebrewLabel` is preserved for legacy
 * consumers; the locale-aware key is `label` (same value in Hebrew).
 */
export function getEventConfig(rawType, locale = 'he') {
    const type = normalizeEventType(rawType)
    const meta = EVENT_TYPE_META[type]
    const msg = messagesFor(locale)?.eventTypes?.[type] || {}
    const fallback = LOCALE_MESSAGES.he.eventTypes[type]
    return {
        id: meta.id,
        defaultTheme: meta.defaultTheme,
        label: msg.label || fallback.label,
        hebrewLabel: LOCALE_MESSAGES.he.eventTypes[type].label, // legacy alias
        subtitle: msg.subtitle || fallback.subtitle,
        description: msg.description || fallback.description,
        ctaLabel: msg.ctaLabel || fallback.ctaLabel,
        footer: msg.footer || fallback.footer,
    }
}

/**
 * Resolve the theme color id for a wedding doc:
 *   1. data.themeColor if valid
 *   2. event type default
 *   3. 'gold'
 */
export function resolveThemeColorId(data = {}) {
    const explicit = normalizeThemeColor(data.themeColor)
    if (explicit) return explicit
    const cfg = getEventConfig(data.eventType)
    return cfg.defaultTheme || 'gold'
}

/**
 * Return the full palette object (label/name/accent/…) for a wedding doc.
 * Always returns a valid palette.
 */
export function getPalette(data = {}) {
    const id = resolveThemeColorId(data)
    return THEME_COLORS[id].palette
}

/**
 * Get the full theme entry (id + label + swatch + palette) for a wedding doc.
 */
export function getTheme(data = {}) {
    return THEME_COLORS[resolveThemeColorId(data)]
}

/**
 * Build the main display title from a wedding document.
 * Priority:
 *   1. customTitle
 *   2. per-type default built from doc fields
 *   3. '' (renders a spacer)
 *
 * Returns:
 *   { kind: 'names', left, right }  — wedding (bride & groom)
 *   { kind: 'single', text }        — birthday / bar / bat / customTitle
 *   { kind: 'empty' }               — nothing yet
 */
export function buildTitle(data = {}, locale = 'he') {
    if (data.customTitle && typeof data.customTitle === 'string' && data.customTitle.trim()) {
        return { kind: 'single', text: data.customTitle.trim() }
    }

    const type = normalizeEventType(data.eventType)

    if (type === 'wedding') {
        const bride = (data.brideName || '').trim()
        const groom = (data.groomName || '').trim()
        if (!bride && !groom) return { kind: 'empty' }
        return { kind: 'names', left: bride, right: groom }
    }

    if (type === 'birthday') {
        const name = (data.celebrantName || '').trim()
        const age = Number.isFinite(Number(data.age)) && data.age !== '' ? Number(data.age) : null
        if (!name && age == null) return { kind: 'empty' }
        // Birthday formatting differs between languages — each language has
        // its own idiom for "Nth birthday of X". Kept inline (rather than
        // in messages/*.json) because the order of {name}/{age} sometimes
        // flips, and ICU plural rules for ordinals would dwarf this code.
        if (age != null && name) {
            if (locale === 'en') return { kind: 'single', text: `${name}'s ${age}${nthSuffix(age)} birthday` }
            if (locale === 'es') return { kind: 'single', text: `${age}º cumpleaños de ${name}` }
            if (locale === 'it') return { kind: 'single', text: `${age}° compleanno di ${name}` }
            return { kind: 'single', text: `יום הולדת ${age} ל${name}` }
        }
        if (age != null) {
            if (locale === 'en') return { kind: 'single', text: `${age}${nthSuffix(age)} birthday` }
            if (locale === 'es') return { kind: 'single', text: `${age}º cumpleaños` }
            if (locale === 'it') return { kind: 'single', text: `${age}° compleanno` }
            return { kind: 'single', text: `יום הולדת ${age}` }
        }
        return { kind: 'single', text: name }
    }

    // bar_mitzvah / bat_mitzvah
    const name = (data.celebrantName || '').trim()
    if (!name) return { kind: 'empty' }
    return { kind: 'single', text: name }
}

// English ordinal suffix helper (1st, 2nd, 3rd, 4th...). Internal only.
function nthSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
}

/**
 * Small label ABOVE the title (e.g. "ספר הברכות של").
 * Respects customSubtitle.
 */
export function buildSubtitle(data = {}, locale = 'he') {
    if (data.customSubtitle && typeof data.customSubtitle === 'string' && data.customSubtitle.trim()) {
        return data.customSubtitle.trim()
    }
    return getEventConfig(data.eventType, locale).subtitle
}

/**
 * Description paragraph below the title (e.g. "יום הבר מצווה זוכר לתמיד...").
 * Respects customDescription.
 */
export function buildDescription(data = {}, locale = 'he') {
    if (data.customDescription && typeof data.customDescription === 'string' && data.customDescription.trim()) {
        return data.customDescription.trim()
    }
    return getEventConfig(data.eventType, locale).description
}

/**
 * Which optional fields does the admin UI need to expose for a given event type?
 */
export function fieldsForType(rawType) {
    const type = normalizeEventType(rawType)
    if (type === 'wedding') return ['brideName', 'groomName', 'weddingDate']
    if (type === 'birthday') return ['celebrantName', 'age', 'weddingDate']
    return ['celebrantName', 'weddingDate']
}
