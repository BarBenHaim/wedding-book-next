// src/lib/salesAgent/mediaGuard.js
//
// The net under "אשמח להראות לך".
//
// The transcripts made the media failure specific. שירלי asked for the
// video from the Facebook ad, and the bot answered: "יש לי תמונות של
// ספרים מוכנים אמיתיים, אשמח להראות לך איך זה נראה בפועל" — with
// image: null. It OFFERED the pictures instead of sending them. מאיה
// asked how the whole thing works with the upload-screen shot sitting
// right there in the library; she got three paragraphs. Across 72 model
// calls, the image field came back null every single time.
//
// This is the same failure as the price dodge: the model narrates the
// capability instead of using it, the prompt already says not to, and
// under pressure it does it anyway. Same remedy, too — a deterministic
// net behind the instruction, not a fifth paragraph of instruction.
//
// Two triggers, both cheap to detect:
//   • The customer asked to SEE something.
//   • The bot's own reply promised to show something.
// Either one plus image:null means the guard picks the picture the
// model should have picked, from the same library, by the same logic
// the prompt describes.

// ── What the customer asked for ─────────────────────────────────────
const SEE = [
    'לראות', 'תראה לי', 'תראי לי', 'איך זה נראה', 'איך נראה', 'איך הספר נראה',
    'תמונה', 'תמונות', 'דוגמה', 'דוגמא', 'דוגמאות',
    'סרטון', 'וידאו', 'video',
]

// ── What the bot promised ───────────────────────────────────────────
// "הנה תמונה" with nothing attached is the worst of these: the customer
// is now waiting for a picture that is not coming.
const OFFERED = [
    'אשמח להראות', 'אראה לך', 'אשלח לך תמונה', 'אשלח תמונה',
    'יש לי תמונות', 'יש לנו תמונות', 'הנה תמונה', 'מצרף תמונה', 'מצרפת תמונה',
]

// ── Which picture answers which question ────────────────────────────
const HOW_IT_WORKS = ['איך זה עובד', 'איך עובד', 'אפליקצי', 'לאורחים', 'סורקים', 'איך כותבים', 'איך חותמים', 'מסובך']
const INSIDE = ['מבפנים', 'עמודים', 'בתוך הספר', 'איך הברכות']
const COVER = ['כריכה', 'מבחוץ', 'עטיפה']

const norm = s => String(s || '').toLowerCase()
const hasAny = (text, list) => {
    const t = norm(text)
    return t ? list.some(p => t.includes(p)) : false
}

/** Did the customer ask to see something? */
export function wantsToSee(text) {
    return hasAny(text, SEE)
}

/** Did the reply promise a picture it did not attach? */
export function offeredToShow(messages) {
    const all = (Array.isArray(messages) ? messages : [messages]).join(' ')
    return hasAny(all, OFFERED)
}

/**
 * The picture the model should have picked.
 *
 * Preference order mirrors what the question was actually about, then
 * falls back by event type. Filters out everything this lead already
 * received — a repeated image reads as a glitch — and everything the
 * library does not have. Video is never auto-picked: the guard exists
 * to fix a dropped promise, and promising a video the transport cannot
 * send yet would be making the original mistake in a second place.
 */
export function pickMediaFor({ incomingText = '', eventType = null, seen = [], library = {} } = {}) {
    const et = String(eventType || '')
    const bookByEvent = et.includes('mitzvah') ? 'book_bar_mitzvah'
        : et === 'wedding' ? 'book_wedding'
        : et === 'birthday' ? 'book_birthday' : null
    const pagesByEvent = et.includes('mitzvah') ? 'pages_bar_mitzvah'
        : et === 'wedding' ? 'pages_wedding'
        : et === 'birthday' ? 'pages_birthday' : null

    const candidates = []
    if (hasAny(incomingText, HOW_IT_WORKS)) candidates.push('upload_screen')
    if (hasAny(incomingText, INSIDE)) candidates.push(pagesByEvent, 'book_open_spread')
    if (hasAny(incomingText, COVER)) candidates.push(bookByEvent, 'cover_personalised')
    // The general fallback: the finished product, then the personalised
    // cover, then how it works. Something real beats nothing every time.
    candidates.push(bookByEvent, 'book_open_spread', 'cover_personalised', pagesByEvent, 'upload_screen')

    const seenSet = new Set(Array.isArray(seen) ? seen : [])
    for (const key of candidates) {
        if (!key || seenSet.has(key)) continue
        const m = library[key]
        if (m && m.kind !== 'video') return key
    }
    return null
}

/**
 * The one call the route makes.
 * Returns a key to attach, or null to leave the reply alone.
 */
export function mediaGuard({ incomingText, messages, eventType, seen, library } = {}) {
    if (!wantsToSee(incomingText) && !offeredToShow(messages)) return null
    return pickMediaFor({ incomingText, eventType, seen, library })
}

export default { wantsToSee, offeredToShow, pickMediaFor, mediaGuard }
