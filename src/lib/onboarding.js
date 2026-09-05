// src/lib/onboarding.js — pure validation + doc-shaping for the
// self-serve onboarding flow (/start wizard → /api/onboarding/create-event).
// Pure on purpose: no Firebase, no Next — unit-testable under vitest.
//
// The wizard exposes only the mainstream event types; poker/travel and
// future types remain super-admin territory (/admin creates them).

export const PUBLIC_EVENT_TYPES = ['wedding', 'bar_mitzvah', 'bat_mitzvah', 'birthday']

export const EVENT_TYPE_META = {
    wedding: { label: 'חתונה', emoji: '💍', names: 'couple', blurb: 'ספר ברכות ותמונות מכל האורחים' },
    bar_mitzvah: { label: 'בר מצווה', emoji: '🕍', names: 'celebrant', blurb: 'זיכרון מרגש מיום אחד גדול' },
    bat_mitzvah: { label: 'בת מצווה', emoji: '✨', names: 'celebrant', blurb: 'כל האהבה — בספר אחד' },
    birthday: { label: 'יום הולדת', emoji: '🎂', names: 'celebrant', blurb: 'הפתעה שנשארת להרבה שנים' },
}

const THEME_IDS = ['gold', 'pink', 'blue']
const DEFAULT_THEME = { wedding: 'gold', birthday: 'pink', bar_mitzvah: 'blue', bat_mitzvah: 'blue' }

// Plan model: the free tier opens ONE event; the paid packages unlock
// up to MAX_EVENTS_PER_USER on the same account. A user counts as free
// while EVERY event they own carries plan:'free' — legacy paying
// customers have no plan field at all, so they resolve as paid.
export const FREE_EVENT_LIMIT = 1
export const MAX_EVENTS_PER_USER = 3

export function isFreePlan(w) {
    return ((w && w.plan) || '') === 'free'
}

const NAME_MAX = 40

// Strip control chars, collapse inner whitespace, trim, cap length.
export function cleanName(raw, max = NAME_MAX) {
    if (typeof raw !== 'string') return ''
    return raw
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
}

function isValidDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const d = new Date(s + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return false
    const y = d.getFullYear()
    const now = new Date().getFullYear()
    return y >= 2000 && y <= now + 5
}

// validateNewEvent(input) → { ok, errors, value }
//   errors: { field: hebrewMessage } — field names match the wizard inputs.
//   value:  normalized payload, safe to hand to buildWeddingDoc().
export function validateNewEvent(input) {
    const src = input && typeof input === 'object' ? input : {}
    const errors = {}
    const value = {}

    const eventType = typeof src.eventType === 'string' ? src.eventType : ''
    if (!PUBLIC_EVENT_TYPES.includes(eventType)) {
        errors.eventType = 'בחרו סוג אירוע'
    } else {
        value.eventType = eventType
    }

    if (eventType === 'wedding') {
        const bride = cleanName(src.brideName)
        const groom = cleanName(src.groomName)
        if (!bride) errors.brideName = 'איך קוראים לה?'
        if (!groom) errors.groomName = 'איך קוראים לו?'
        value.brideName = bride
        value.groomName = groom
    } else if (eventType) {
        const celebrant = cleanName(src.celebrantName)
        if (!celebrant) errors.celebrantName = 'למי חוגגים? כתבו שם'
        value.celebrantName = celebrant
        if (eventType === 'birthday' && src.age !== undefined && src.age !== null && src.age !== '') {
            const age = Number(src.age)
            if (!Number.isInteger(age) || age < 1 || age > 120) errors.age = 'גיל בין 1 ל-120'
            else value.age = age
        }
    }

    if (src.weddingDate !== undefined && src.weddingDate !== null && src.weddingDate !== '') {
        if (!isValidDateStr(src.weddingDate)) errors.weddingDate = 'תאריך לא תקין'
        else value.weddingDate = src.weddingDate
    }

    const theme = typeof src.themeColor === 'string' && THEME_IDS.includes(src.themeColor)
        ? src.themeColor
        : DEFAULT_THEME[eventType] || 'gold'
    value.themeColor = theme

    return { ok: Object.keys(errors).length === 0, errors, value }
}

// Owner-facing display title — mirrors how the guest page composes it.
export function eventDisplayTitle(value) {
    if (!value) return 'הספר שלכם'
    if (value.eventType === 'wedding') {
        const a = value.brideName || ''
        const b = value.groomName || ''
        if (a && b) return a + ' & ' + b
        return a || b || 'הספר שלכם'
    }
    return value.celebrantName || 'הספר שלכם'
}

// Shape the wedding document for a validated payload. Timestamps and
// server-generated fields (slug, tokens) are the API route's job.
export function buildWeddingDoc(value, owner = {}, via = 'self_serve') {
    const doc = {
        ownerId: owner.uid || null,
        ownerEmail: owner.email || null,
        ownerName: cleanName(owner.name || '', 60) || null,
        // The web wizard and the mobile app create events through the
        // same route, so the route has to say which one it was. Before
        // this an App Store signup and a website signup were the same
        // row, with no way to tell them apart afterwards.
        createdVia: via === 'app' ? 'app' : 'self_serve',
        plan: 'free',
        locale: 'he',
        eventType: value.eventType,
        themeColor: value.themeColor,
    }
    if (value.eventType === 'wedding') {
        doc.brideName = value.brideName
        doc.groomName = value.groomName
    } else {
        doc.celebrantName = value.celebrantName
        if (value.age !== undefined) doc.age = value.age
    }
    if (value.weddingDate) doc.weddingDate = value.weddingDate
    return doc
}
