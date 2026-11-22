// src/lib/lifecycle.js — pure: which message, if any, a customer's event is due for today.
//
// The road from a paid order to a printed book has quiet stretches where nothing
// happens unless somebody nudges: the owner has not sent the link, the event is a
// week away, the event is over and the book is waiting to be approved, the deposit
// is waiting for its balance. Nobody should have to remember those, so a daily job
// asks this module "what is due for this event?" and sends the answer.
//
// Rules of the road:
//  - One message per event per run, and each message at most once (the caller stores
//    what was sent). A window is "due since": a missed day is caught up inside the
//    window, but an old message never fires after its moment has passed.
//  - Only events opened by a paid order after START_MS. The company's older events
//    are never mailed by this engine.
//  - Pure: no Firebase, no mailer, no clock. The caller passes `now`.

// Events created before this moment are not this engine's business.
export const LIFECYCLE_START_MS = Date.parse('2026-11-23T00:00:00+02:00')

const DAY = 24 * 60 * 60 * 1000

/** YYYY-MM-DD of an instant, in Israel. */
export function israelDate(ms) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

/** Whole days from isoA to isoB (positive when B is later). */
export function daysBetween(isoA, isoB) {
    const a = Date.parse(`${isoA}T00:00:00Z`)
    const b = Date.parse(`${isoB}T00:00:00Z`)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN
    return Math.round((b - a) / DAY)
}

/** The book's name as the owner knows it. */
export function bookTitleOf(w) {
    if (!w) return ''
    if (w.customTitle) return String(w.customTitle).trim()
    const a = String(w.brideNameHe || w.brideName || '').trim()
    const b = String(w.groomNameHe || w.groomName || '').trim()
    if (w.eventType === 'wedding' && (a || b)) return [a, b].filter(Boolean).join(' & ')
    return String(w.celebrantNameHe || w.celebrantName || '').trim()
}

// Each rule: key, a test on { sinceOrder, toEvent, sinceEvent, entries, w }, and the
// copy kind. `toEvent` is days until the event (negative once it has passed) and is
// NaN when the event has no date.
const RULES = [
    // Nobody wrote yet, two days after the order: the link has probably not been sent.
    { key: 'nudge_share', kind: 'nudge', when: c => c.entries === 0 && c.sinceOrder >= 2 && c.sinceOrder <= 21 && !(c.toEvent < 3) },
    // Two weeks out: the best time to send the link.
    { key: 'share_14', kind: 'share', when: c => c.toEvent <= 14 && c.toEvent >= 8 && c.sinceOrder >= 2 },
    // The last days: the sign must be printed and standing.
    { key: 'eve', kind: 'eve', when: c => c.toEvent <= 2 && c.toEvent >= 0 },
    // The day after: the book is full of stories, and some guests have not written yet.
    { key: 'post_1', kind: 'post1', when: c => c.sinceEvent >= 1 && c.sinceEvent <= 2 },
    // Three days after: time to go through the book and approve it.
    { key: 'post_3', kind: 'review', when: c => c.sinceEvent >= 3 && c.sinceEvent <= 6 },
    // The deposit is waiting for its balance: a week, two weeks, a month after the event.
    { key: 'balance_7', kind: 'balance', when: c => c.deposit && c.sinceEvent >= 7 && c.sinceEvent <= 13 },
    { key: 'balance_14', kind: 'balance', when: c => c.deposit && c.sinceEvent >= 14 && c.sinceEvent <= 29 },
    { key: 'balance_30', kind: 'balance', when: c => c.deposit && c.sinceEvent >= 30 && c.sinceEvent <= 44 },
]

/**
 * What is due for this event today.
 *   w        the wedding document (plain object)
 *   entries  how many blessings it has
 *   now      ms
 *   sent     { [key]: ms } of what already went out (w.lifecycleSent)
 * Returns { key, kind } or null.
 */
export function nextMessage({ w, entries = 0, now = Date.now(), sent = {} } = {}) {
    if (!w || w.lifecycleOff === true) return null
    if (w.createdVia !== 'order') return null
    const createdMs = w.createdAt?.toMillis ? w.createdAt.toMillis() : (w.createdAt?._seconds ? w.createdAt._seconds * 1000 : Number(w.createdAt) || 0)
    if (!createdMs || createdMs < LIFECYCLE_START_MS) return null
    if (!w.ownerEmail) return null

    const today = israelDate(now)
    const sinceOrder = daysBetween(israelDate(createdMs), today)
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(String(w.weddingDate || ''))
    const toEvent = hasDate ? daysBetween(today, w.weddingDate) : NaN
    const sinceEvent = Number.isFinite(toEvent) ? -toEvent : NaN
    const ctx = {
        sinceOrder,
        toEvent: Number.isFinite(toEvent) ? toEvent : NaN,
        sinceEvent: Number.isFinite(sinceEvent) ? sinceEvent : NaN,
        entries: Number(entries) || 0,
        deposit: w.paymentStage === 'deposit',
        w,
    }
    // Latest moment in the road first: if two are due, the one closest to today wins.
    const due = RULES.filter(r => !sent[r.key] && r.when(ctx))
    if (!due.length) return null
    return { key: due[due.length - 1].key, kind: due[due.length - 1].kind }
}

// ── the e-mails ───────────────────────────────────────────────────────

import { emailLogoImg } from './brandAssets'

const INK = '#14183A'
const ACCENT = '#2545E0'
const PAPER = '#F3F0EA'
const LINE = '#E4DFD3'
const MUTED = '#5A5D75'
const FONT = "Arial,'Segoe UI',Helvetica,sans-serif"

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function btn(href, label, solid = true) {
    const bg = solid ? INK : '#FFFFFF'
    const color = solid ? '#FFFFFF' : INK
    const border = solid ? `1px solid ${INK}` : `1.5px solid ${INK}`
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px;"><tr><td align="center" bgcolor="${bg}" style="border-radius:14px;border:${border};"><a href="${esc(href)}" style="display:block;padding:15px 28px;font:700 16px/1.2 ${FONT};color:${color};text-decoration:none;border-radius:14px;">${esc(label)}</a></td></tr></table>`
}

/** The words of each kind. `c` carries: title, entries, balanceDue, days. */
export function messageCopy(kind, c) {
    const t = c.title ? `ספר הברכות של ${c.title}` : 'ספר הברכות שלכם'
    switch (kind) {
        case 'nudge':
            return {
                subject: `${t}: עוד לא נכנסו ברכות. שולחים את הקישור?`,
                heading: 'הספר פתוח, והאורחים עוד לא יודעים',
                paragraphs: ['שלחתם כבר לאורחים את הקישור? זה לוקח חצי דקה: לוחצים, בוחרים קבוצה בוואטסאפ ושולחים. כל מי שכותב ברכה מוסיף עוד עמוד לספר.'],
                primary: 'share',
            }
        case 'share':
            return {
                subject: `${t}: שבועיים לאירוע, זה הזמן לשלוח לאורחים`,
                heading: 'עוד שבועיים לאירוע',
                paragraphs: [`עד עכשיו נכנסו ${c.entries} ברכות. מי שמקבל את הקישור לפני האירוע כותב בלי לחץ, ובאירוע עצמו כולם כבר מכירים את הספר.`],
                primary: 'share',
                secondary: 'sign',
            }
        case 'eve':
            return {
                subject: `${t}: האירוע בקרוב, מדפיסים את השלט?`,
                heading: 'האירוע ממש בקרוב',
                paragraphs: ['שלט "ברכו את" עם ה־QR של הספר מוכן להדפסה, בגודל A4. מציבים אותו בכניסה או על השולחנות, וכל אורח שסורק מגיע ישר לטופס.'],
                primary: 'sign',
                secondary: 'share',
            }
        case 'post1':
            return {
                subject: `${t}: איך היה האירוע?`,
                heading: 'מזל טוב, האירוע מאחוריכם',
                paragraphs: [
                    `כבר נכנסו ${c.entries} ברכות לספר. אפשר לשלוח את הקישור שוב למי שלא הספיק לכתוב: הוא עובד גם אחרי האירוע.`,
                ],
                primary: 'share',
                secondary: 'portal',
            }
        case 'review':
            return {
                subject: `${t}: מוכן לעבור על הספר?`,
                heading: 'הגיע הזמן לעבור על הספר',
                paragraphs: [
                    'באזור האישי אפשר לראות כל ברכה, לתקן, להחליף תמונה ולבחור עיצוב וכריכה. כשהכול נראה טוב, מאשרים והספר יוצא לדפוס.',
                ],
                primary: 'portal',
            }
        case 'balance':
            return {
                subject: `${t}: נשאר רק לאשר ולשלם את היתרה`,
                heading: 'הספר מחכה לכם',
                paragraphs: [
                    `שילמתם מקדמה. כשהספר מוכן ואתם מרוצים ממנו, משלמים את היתרה${c.balanceDue ? ` (${c.balanceDue} ₪)` : ''} והוא יוצא לדפוס ומגיע עד הבית.`,
                ],
                primary: 'balance',
                secondary: 'portal',
            }
        default:
            return null
    }
}

/** { subject, html, text } for a message kind. `links` = { share, sign, portal, balance }. */
export function renderLifecycleEmail(kind, ctx, links) {
    const copy = messageCopy(kind, ctx)
    if (!copy) return null
    const label = {
        share: 'שליחה לאורחים בוואטסאפ',
        sign: 'פתיחת השלט להדפסה',
        portal: 'כניסה לאזור האישי',
        balance: 'לאישור ולתשלום היתרה',
    }
    const buttons = [copy.primary && btn(links[copy.primary], label[copy.primary], true), copy.secondary && btn(links[copy.secondary], label[copy.secondary], false)]
        .filter(Boolean)
        .join('')
    const paras = copy.paragraphs.map(p => `<p style="margin:0 0 20px;font:400 16px/1.7 ${FONT};color:${MUTED};">${esc(p)}</p>`).join('')
    const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}"><tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;direction:rtl;text-align:right;font-family:${FONT};color:${INK};">
  <tr><td align="center" style="padding:6px 0 18px;">${emailLogoImg(190)}</td></tr>
  <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:22px;border:1px solid ${LINE};padding:28px 24px;">
    <h1 style="margin:0 0 12px;font:800 25px/1.25 ${FONT};color:${INK};">${esc(copy.heading)}</h1>
    ${paras}
    ${buttons}
  </td></tr>
  <tr><td align="center" style="padding:16px 12px 0;font:400 13.5px/1.6 ${FONT};color:#7A7D93;">אפשר לעזור במשהו? עונים למייל הזה, או <a href="https://wa.me/972515350253" style="color:${INK};font-weight:700;">כותבים לנו בוואטסאפ</a>.</td></tr>
</table>
</td></tr></table>
</body></html>`
    const text = [copy.heading, '', ...copy.paragraphs, '', ...[copy.primary, copy.secondary].filter(Boolean).map(k => `${label[k]}: ${links[k]}`)].join('\n')
    return { subject: copy.subject, html, text }
}

/**
 * { subject, html, text } — sent at once when the balance of a deposit is paid: the
 * customer should not have to wonder whether paying "worked". `links` = { portal }.
 */
export function renderBalancePaidEmail(ctx, links) {
    const t = ctx.title ? `ספר הברכות של ${ctx.title}` : 'ספר הברכות שלכם'
    const heading = 'היתרה שולמה, הספר יוצא לדפוס'
    const para = 'תודה! הספר מאושר ויוצא עכשיו לדפוס. הוא מגיע עד הבית תוך 14 ימי עסקים בערך. כל מה שנשאר זה לחכות, ואפשר לראות את הספר באזור האישי בכל רגע.'
    const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}"><tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;direction:rtl;text-align:right;font-family:${FONT};color:${INK};">
  <tr><td align="center" style="padding:6px 0 18px;">${emailLogoImg(190)}</td></tr>
  <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:22px;border:1px solid ${LINE};padding:28px 24px;">
    <h1 style="margin:0 0 12px;font:800 25px/1.25 ${FONT};color:${INK};">${esc(heading)}</h1>
    <p style="margin:0 0 20px;font:400 16px/1.7 ${FONT};color:${MUTED};">${esc(para)}</p>
    ${btn(links.portal, 'כניסה לאזור האישי', true)}
  </td></tr>
  <tr><td align="center" style="padding:16px 12px 0;font:400 13.5px/1.6 ${FONT};color:#7A7D93;">אפשר לעזור במשהו? עונים למייל הזה, או <a href="https://wa.me/972515350253" style="color:${INK};font-weight:700;">כותבים לנו בוואטסאפ</a>.</td></tr>
</table>
</td></tr></table>
</body></html>`
    return {
        subject: `${t}: היתרה שולמה והוא יוצא לדפוס`,
        html,
        text: `${heading}

${para}

כניסה לאזור האישי: ${links.portal}`,
    }
}

/**
 * The exceptions worth a line to the owner of the business: things a customer
 * will not report and nothing else will catch. Empty list = no e-mail.
 */
export function digestLines({ failedLocks = [], quietEvents = [], overdueBalances = [] } = {}) {
    const lines = []
    for (const l of failedLocks) lines.push(`הזמנה ${l.orderId}: שולמה, והאירוע לא נפתח (${l.error || 'שגיאה'}). WooCommerce ינסה שוב; אם זה לא נפתר, לשלוח את ההזמנה שוב.`)
    for (const e of quietEvents) lines.push(`אירוע ${e.title || e.id}: בעוד ${e.days} ימים ועדיין אין ברכות. ${e.email || ''}`.trim())
    for (const b of overdueBalances) lines.push(`אירוע ${b.title || b.id}: היתרה (${b.balanceDue || 800} ₪) לא שולמה ${b.days} ימים אחרי האירוע. ${b.email || ''}`.trim())
    return lines
}
