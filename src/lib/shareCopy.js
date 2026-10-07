// Event-type + name aware share copy, used everywhere a wedding link is
// shared or previewed: the WhatsApp button (portal + email), the link
// preview <meta> tags (guest layouts), and the generated OG card image.
//
// One source of truth so "ספר הברכות לבר המצווה של גל" reads identically
// on the share button, the link preview title, and the preview image.
import { normalizeEventType } from '@/lib/eventTypes'

// "Book of blessings for X" prefix, per event type. The trailing " של"
// is dropped when there's no name yet.
const PREFIX = {
    wedding: 'ספר הברכות של',
    birthday: 'ספר הברכות ליום ההולדת של',
    bar_mitzvah: 'ספר הברכות לבר המצווה של',
    bat_mitzvah: 'ספר הברכות לבת המצווה של',
    poker: 'אלבום המשחק של',
    travel: 'ספר המסע של',
}

// Event noun used after the preposition מ ("…רגע מהחתונה" / "…מבר המצווה").
const NOUN = {
    wedding: 'החתונה',
    birthday: 'יום ההולדת',
    bar_mitzvah: 'בר המצווה',
    bat_mitzvah: 'בת המצווה',
    poker: 'הערב',
    travel: 'המסע',
}

export function buildShareCopy(data = {}) {
    const type = normalizeEventType(data?.eventType)
    const bride = (data?.brideNameHe || data?.brideName || '').trim()
    const groom = (data?.groomNameHe || data?.groomName || '').trim()
    const celebrant = (data?.celebrantNameHe || data?.celebrantName || '').trim()
    // Many production weddings (especially older orders) never had
    // brideName/groomName explicitly filled but DO carry an ownerName
    // from /api/createWedding (route.js:116). Without this fallback,
    // those weddings get a generic "ספר הברכות" in WhatsApp previews
    // even though a real name is right there in the doc.
    const owner = (data?.ownerNameHe || data?.ownerName || '').trim()

    let names
    if (type === 'wedding') {
        const joined = [bride, groom].filter(Boolean).join(' ו')
        // If neither bride nor groom is set but the owner is, use the
        // owner name as the single fallback. Better one real name
        // than the generic catch-all.
        names = joined || owner
    } else {
        names = celebrant || owner
    }

    const prefix = PREFIX[type] || PREFIX.wedding
    const noun = NOUN[type] || 'האירוע'
    const title = names ? `${prefix} ${names}` : prefix.replace(/ של$/, '')
    const who = names ? `את ${names}` : ''

    const description = names
        ? `ברכו ${who} ושתפו רגע מ${noun} — כל ברכה ותמונה נכנסות לספר המודפס`
        : `כתבו ברכה ושתפו רגע מ${noun} — כל ברכה ותמונה נכנסות לספר המודפס`
    const whatsapp = names
        ? `מוזמנים לברך ${who} ולשתף רגע מ${noun} 💛`
        : `מוזמנים לכתוב ברכה ולשתף רגע מ${noun} 💛`
    // Emoji-free line for the OG image (satori has no emoji font).
    const imageLine = names ? `ברכו ${who} ושתפו רגע מ${noun}` : `כתבו ברכה ושתפו רגע מ${noun}`

    return { type, names, prefix, noun, title, description, whatsapp, imageLine }
}

// The picture on the link card. WhatsApp shows it above the title the
// moment the guest link lands in a group, so it is the first thing a
// family sees of the product — the book itself, in the event's own
// world. One card per event world; events without their own card get
// the general one. Files live in /public/og. JPEG on purpose: WhatsApp
// quietly drops previews whose image is too heavy, and the bar-mitzvah
// card is 150 KB as JPEG against 1.1 MB as PNG.
const SHARE_IMAGE = {
    bar_mitzvah: { path: '/og/bar-mitzvah-book.jpg', type: 'image/jpeg', alt: 'ספר הברכות לבר מצווה' },
}
const DEFAULT_SHARE_IMAGE = { path: '/og/wedding-tales-book.png', type: 'image/png', alt: 'Wedding Tales' }

export function shareImageFor(eventType) {
    return SHARE_IMAGE[normalizeEventType(eventType)] || DEFAULT_SHARE_IMAGE
}
