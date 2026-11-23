// src/lib/customerMessages.js — the three messages Bar sends to a customer from the admin, by hand.
//
//   shipped  the book left us and is on its way
//   arrived  checking that it came, and asking for a photo of it on the shelf
//   details  everything in one place: view the book, manage the blessings, how it works, how many there are
//
// Each one is sent twice over the same words: as an e-mail (lib/emailEngine.js wraps it in the brand shell)
// and as a WhatsApp text (the same body, buttons collapsed to "label (url)"). Bar presses a button, so
// nothing here is automatic and nothing goes out without him: the customer lifecycle mails stay paused.
//
// Pure: templates and small helpers, no I/O. The variables ({{hi}}, {{blessingsLine}}, {{viewButton}} ...)
// are filled in by the e-mail engine, and the tests below check every one of them is a variable it knows.
//
// Facts used here are only the ones that are fixed for the product: hard cover 22x22 cm, nothing is printed
// before the owner approves every page, the guest link needs no app and no sign-up, the owner signs in to
// the management page with a mobile number. Nothing about a courier, a tracking number or a date is
// invented: Bar can add it in the optional note.

export const QUICK_KINDS = ['shipped', 'arrived', 'details']

/** "היי דנה," or just "היי," when the customer has no name on the order. */
export function greetingHi(ownerName) {
    const first = typeof ownerName === 'string' ? ownerName.trim().split(/\s+/)[0] : ''
    return first ? `היי ${first},` : 'היי,'
}

/** "בספר יש 24 ברכות." / "בספר יש ברכה אחת." and nothing at all when there are none yet. */
export function blessingsLine(count) {
    const n = Math.floor(Number(count))
    if (!Number.isFinite(n) || n <= 0) return ''
    return n === 1 ? 'בספר יש ברכה אחת.' : `בספר יש ${n} ברכות.`
}

export function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The optional free line Bar adds (a tracking number, a note): escaped, with a blank line after it. */
export function noteLine(note) {
    const t = typeof note === 'string' ? note.replace(/\r\n/g, '\n').trim().slice(0, 600) : ''
    return t ? `${escapeHtml(t)}\n\n` : ''
}

export const QUICK_TEMPLATES = {
    shipped: {
        label: 'הספר נשלח',
        subject: 'הספר שלכם בדרך אליכם 📦',
        body: `{{hi}}

הספר של {{coupleName}} יצא אליכם 📦
{{blessingsLine}}

{{noteLine}}אם הכתובת השתנתה, או שהוא לא הגיע בימים הקרובים, פשוט השיבו כאן ונבדוק.

אפשר לדפדף בו כבר עכשיו:
{{viewButton}}

צוות Wedding Tales 💛`,
    },
    arrived: {
        label: 'הספר הגיע?',
        subject: 'הספר הגיע? 💛',
        body: `{{hi}}

רצינו לוודא שהספר של {{coupleName}} הגיע אליכם בשלום ושהוא נראה כמו שציפיתם.
{{blessingsLine}}

אם משהו לא תקין, כתבו לנו בתשובה להודעה הזו ונטפל בזה.
אם הכול מעולה, נשמח לתמונה שלו על המדף, ולשמוע מה אמרו כשפתחו אותו 💛

{{noteLine}}הספר הדיגיטלי נשאר פתוח לכם תמיד:
{{viewButton}}

צוות Wedding Tales`,
    },
    details: {
        label: 'כל הפרטים לצפייה בספר',
        subject: 'הספר שלכם: צפייה, ניהול הברכות וכל הפרטים 💛',
        body: `{{hi}}

הנה כל מה שצריך לדעת על הספר של {{coupleName}}.
{{blessingsLine}}

<b>לצפות בספר</b>
פותחים ומדפדפים, גם מהטלפון. הוא מתעדכן בכל ברכה חדשה:
{{viewButton}}

<b>לנהל את הברכות</b>
בעמוד הניהול רואים את כל הברכות והתמונות שנאספו ומנהלים אותן. נכנסים עם מספר הנייד, בלי סיסמה:
{{portalButton}}

<b>לשתף עם האורחים</b>
זה הקישור שהאורחים פותחים כדי לכתוב ברכה, בלי אפליקציה ובלי הרשמה:
{{guestLink}}
או לשלוח בוואטסאפ בלחיצה אחת:
{{whatsappButton}}

<b>מה קורה אחר כך</b>
כשהספר מוכן עוברים על כל עמוד ומאשרים. שום דבר לא מודפס לפני האישור, והספר המודפס מגיע עד הבית בכריכה קשה בגודל 22×22 ס״מ.

{{noteLine}}יש שאלה? פשוט השיבו כאן.
צוות Wedding Tales 💛`,
    },
}

export function isQuickKind(k) {
    return QUICK_KINDS.includes(k)
}

/** The template for one kind, or null for an unknown kind (the route never takes a body from the browser). */
export function quickTemplate(kind) {
    return isQuickKind(kind) ? QUICK_TEMPLATES[kind] : null
}

/** Which message the admin offers first, given the stage of the event. */
export function suggestedKind(stage) {
    if (stage === 'in_print') return 'shipped'
    if (stage === 'shipped') return 'arrived'
    return 'details'
}
