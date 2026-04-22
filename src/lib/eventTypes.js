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
//   customTitle:    string  — optional full override of the main title
//   customSubtitle: string  — optional override of the small label above title
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

// Copy + default theme per event type.
const EVENT_TYPE_CONFIG = {
    wedding: {
        id: 'wedding',
        hebrewLabel: 'חתונה',
        subtitle: 'ספר הברכות של',
        description: 'זהו המקום לשתף את הרגעים שלכם, לכתוב ברכות מרגשות ולהוסיף תמונות שישמרו לנצח.',
        ctaLabel: 'יצירת ברכה',
        footer: 'Wedding Tales',
        defaultTheme: 'gold',
    },
    birthday: {
        id: 'birthday',
        hebrewLabel: 'יום הולדת',
        subtitle: 'ספר הברכות ליום ההולדת של',
        description: 'הרגעים הכי יפים ראויים להיזכר. כתבו ברכה, הוסיפו תמונה, ושמרו את השמחה לנצח.',
        ctaLabel: 'יצירת ברכה',
        footer: 'Birthday Tales',
        defaultTheme: 'pink',
    },
    bar_mitzvah: {
        id: 'bar_mitzvah',
        hebrewLabel: 'בר מצווה',
        subtitle: 'ספר הברכות לבר המצווה של',
        description: 'יום הבר מצווה זוכר לתמיד. שתפו ברכה, הוסיפו תמונה, והפכו את היום לספר מרגש.',
        ctaLabel: 'יצירת ברכה',
        footer: 'Bar Mitzvah Tales',
        defaultTheme: 'blue',
    },
    bat_mitzvah: {
        id: 'bat_mitzvah',
        hebrewLabel: 'בת מצווה',
        subtitle: 'ספר הברכות לבת המצווה של',
        description: 'יום הבת מצווה זוכר לתמיד. שתפו ברכה, הוסיפו תמונה, והפכו את היום לספר מרגש.',
        ctaLabel: 'יצירת ברכה',
        footer: 'Bat Mitzvah Tales',
        defaultTheme: 'blue',
    },
}

// ─── Public helpers ──────────────────────────────────────────────────────────

export function normalizeEventType(raw) {
    if (raw && Object.prototype.hasOwnProperty.call(EVENT_TYPE_CONFIG, raw)) return raw
    return 'wedding'
}

export function getEventConfig(rawType) {
    return EVENT_TYPE_CONFIG[normalizeEventType(rawType)]
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
export function buildTitle(data = {}) {
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
        if (age != null && name) return { kind: 'single', text: `יום הולדת ${age} ל${name}` }
        if (age != null) return { kind: 'single', text: `יום הולדת ${age}` }
        return { kind: 'single', text: name }
    }

    // bar_mitzvah / bat_mitzvah
    const name = (data.celebrantName || '').trim()
    if (!name) return { kind: 'empty' }
    return { kind: 'single', text: name }
}

/**
 * Small label ABOVE the title (e.g. "ספר הברכות של").
 * Respects customSubtitle.
 */
export function buildSubtitle(data = {}) {
    if (data.customSubtitle && typeof data.customSubtitle === 'string' && data.customSubtitle.trim()) {
        return data.customSubtitle.trim()
    }
    return getEventConfig(data.eventType).subtitle
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
