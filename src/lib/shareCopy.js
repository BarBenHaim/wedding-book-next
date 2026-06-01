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
    const names = type === 'wedding' ? [bride, groom].filter(Boolean).join(' ו') : celebrant

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
