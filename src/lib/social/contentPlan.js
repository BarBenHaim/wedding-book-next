// src/lib/social/contentPlan.js
//
// What to post, and why that post rather than another one.
//
// The hard part of running a business account daily is not rendering an
// image, it is having something worth saying five days a week without
// repeating yourself or drifting into "check out our amazing product".
// So the plan is a fixed rotation of ANGLES, each with a job, a source
// image drawn from real printed books, and a brief the caption writer
// has to satisfy.
//
// Two rules shape everything here.
//
// The images are real. Every asset points at a photo of a book we
// actually printed. For a product whose entire value is a physical
// keepsake, a generated picture of a fake book is worse than no picture:
// it looks almost right, and "almost right" is exactly what a person
// paying 950 shekels for an heirloom is scanning for.
//
// The rotation is deterministic, not random. A random picker will show
// the same angle three days running and then hide the strongest one for
// two weeks. Indexing by day number guarantees the mix.

// The real portfolio, by event type. Paths are public and stable; the
// digest-style whitelist pattern is used again here so nothing can point
// the composer at a URL that does not exist.
const ORIGIN = 'https://app.weddingtales.co.il'

// Only the files that actually exist as JPG. The site also ships .webp
// versions of spreads 3 to 5, and an earlier version of this file assumed
// the .jpg set matched - so the rotation happily pointed at
// wedding/spread-4.jpg, which is not there. Nothing complained until an
// image generation silently failed against a 404, which is the whole
// argument for the test that now walks these paths on disk.
//
// Three photos per event type is enough for the rotation. Widening it is
// a matter of exporting the remaining spreads as JPG and adding the
// numbers here; the test will confirm they landed.
export const PHOTOS = {
    bar_mitzvah: {
        cover: `${ORIGIN}/imgs/portfolio/bar-mitzvah/cover.jpg`,
        spreads: [1, 2].map(n => `${ORIGIN}/imgs/portfolio/bar-mitzvah/spread-${n}.jpg`),
        label: 'בר מצווה',
    },
    wedding: {
        cover: `${ORIGIN}/imgs/portfolio/wedding/cover.jpg`,
        spreads: [1, 2].map(n => `${ORIGIN}/imgs/portfolio/wedding/spread-${n}.jpg`),
        label: 'חתונה',
    },
    birthday: {
        cover: `${ORIGIN}/imgs/portfolio/birthday/cover.jpg`,
        spreads: [1, 2].map(n => `${ORIGIN}/imgs/portfolio/birthday/spread-${n}.jpg`),
        label: 'יום הולדת',
    },
}

export const EVENT_TYPES = Object.keys(PHOTOS)

// ── The angles ──────────────────────────────────────────────────────
//
// Each one has a different job. Six of them, so a daily rotation takes
// more than a working week to come back around and the feed does not
// read as a loop.
export const ANGLES = [
    {
        id: 'real_spread',
        job: 'הוכחה חברתית. להראות ספר אמיתי, לא רינדור',
        headline: 'ככה זה נראה בסוף',
        photo: 'spread',
        brief: `הראה עמוד אמיתי מתוך ספר שהופק. תאר במשפט אחד מה רואים בתמונה:
ברכה של אורח והתמונה שלו, אחד ליד השני. בלי סופרלטיבים, בלי "מרהיב".
המטרה שהקורא יבין תוך שנייה מה המוצר.`,
    },
    {
        id: 'how_it_works',
        job: 'להסיר את החשש התפעולי: מה האורחים בעצם צריכים לעשות',
        headline: 'האורחים סורקים, כותבים, וזהו',
        photo: 'cover',
        brief: `הסבר את שלושת הצעדים מנקודת המבט של האורח: סורק QR, כותב ברכה,
מעלה תמונה. הדגש שאין אפליקציה להוריד. שלוש שורות לכל היותר.`,
    },
    {
        id: 'participation_tip',
        job: 'לתת ערך לפני שמבקשים משהו. גם משפר את המוצר בפועל',
        headline: 'טיפ לאירוע',
        photo: 'spread',
        brief: `תן טיפ מעשי אחד שגורם ליותר אורחים לכתוב. אל תמכור בפוסט הזה
בכלל, אפילו לא בסוף. פוסט שנותן בלי לבקש הוא מה שגורם לאנשים לעקוב.`,
    },
    {
        id: 'objection',
        job: 'לענות בפומבי על ההתנגדות שחוזרת בפרטי',
        headline: 'שאלה שחוזרת',
        photo: 'spread',
        brief: `קח שאלה אמיתית שלקוחות שואלים ותענה עליה ישר. למשל אם אפשר
להוסיף ברכות אחרי האירוע, או מה קורה אם מישהו לא הספיק. תשובה כנה,
בלי להתחמק, בלי לסיים ב"צרו קשר".`,
    },
    {
        id: 'moment',
        job: 'רגש. זה מה שמוכר מזכרת, לא מפרט טכני',
        headline: 'בעוד עשרים שנה',
        photo: 'cover',
        brief: `כתוב על הרגע שבו פותחים את הספר שנים אחרי האירוע וקוראים את
כתב היד של מישהו. משפט אחד או שניים, שקטים. בלי פאתוס ובלי מוזיקה
דרמטית במילים.`,
    },
    {
        id: 'season',
        job: 'רלוונטיות לעונה, ותזכורת שצריך להזמין מראש',
        headline: 'עונת האירועים',
        photo: 'cover',
        brief: `חבר לעונה או לחודש הנוכחי. הזכר בעדינות שהעיצוב לוקח כמה ימים
ושכדאי לסגור לפני. בלי דחיפות מומצאת ובלי "נשארו מקומות".`,
    },
]

export const ANGLE_IDS = ANGLES.map(a => a.id)

export function findAngle(id) {
    return ANGLES.find(a => a.id === id) || null
}

// Days since an arbitrary fixed date, used to walk the rotation. Taking
// the date as a string keeps this pure and testable — no clock inside.
function dayNumber(iso) {
    const t = Date.parse(`${iso}T12:00:00Z`)
    if (Number.isNaN(t)) return 0
    return Math.floor(t / 86400000)
}

/**
 * The post for a given day.
 *
 * Angle and event type advance on different cycles (6 and 3), so the
 * pairing does not repeat until both line up — six days before the same
 * angle returns, eighteen before the same angle AND event type do.
 * Random selection cannot promise that and visibly clumps.
 */
export function planForDate(iso, { slot = 0 } = {}) {
    const n = dayNumber(iso) + slot
    const mod = (a, m) => ((a % m) + m) % m

    const angle = ANGLES[mod(n, ANGLES.length)]
    // The event type advances once per COMPLETE pass through the angles,
    // not once per day. Indexing both off the same counter looks varied
    // and is not: with 6 angles and 3 types the pair repeats every 6 days
    // rather than every 18, so the feed loops a fortnight early. A test
    // caught this; the eye would have taken a month.
    const type = EVENT_TYPES[mod(Math.floor(n / ANGLES.length), EVENT_TYPES.length)]
    const set = PHOTOS[type]
    const photo = angle.photo === 'cover' ? set.cover : set.spreads[mod(n, set.spreads.length)]

    return {
        date: iso,
        slot,
        angleId: angle.id,
        headline: angle.headline,
        job: angle.job,
        brief: angle.brief,
        eventType: type,
        eventLabel: set.label,
        photo,
    }
}

/** A run of days, for filling the queue a week ahead. */
export function planRange(startISO, days = 7, { slot = 0 } = {}) {
    const out = []
    const base = Date.parse(`${startISO}T12:00:00Z`)
    for (let i = 0; i < days; i++) {
        const d = new Date(base + i * 86400000).toISOString().slice(0, 10)
        out.push(planForDate(d, { slot }))
    }
    return out
}

// ── Hashtags ────────────────────────────────────────────────────────
//
// A fixed core plus the event type. Deliberately short: thirty tags
// reads as desperate on an Israeli business account, and the reach they
// buy is not worth how it looks.
const CORE_TAGS = ['#ספר_ברכות', '#מזכרת', '#WeddingTales']
const TYPE_TAGS = {
    bar_mitzvah: ['#בר_מצווה', '#ברמצווה'],
    wedding: ['#חתונה', '#חתונה_בישראל'],
    birthday: ['#יום_הולדת'],
}

export function hashtagsFor(eventType) {
    return [...CORE_TAGS, ...(TYPE_TAGS[eventType] || [])]
}

export default { ANGLES, PHOTOS, planForDate, planRange, hashtagsFor, findAngle }
