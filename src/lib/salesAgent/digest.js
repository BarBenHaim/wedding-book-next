// src/lib/salesAgent/digest.js
//
// The morning message: what happened, and what needs Lord today.
//
// Written to be read on a lock screen at 08:30 with one thumb, which
// drives every decision here:
//
//  • Action first, history second. "Two people are waiting for you" has
//    to be the first line; yesterday's lead count is context, not news.
//  • Names and numbers, not counts alone. "צריכים אותך: 2" makes you
//    open a laptop. The two phone numbers let you act from the message.
//  • Silence when there is nothing. A digest that arrives every morning
//    saying "אין מה לעשות" is a digest you stop reading inside a week,
//    and then you miss the one that mattered. `hasNews` is false on a
//    genuinely empty day and the sender skips it.
//
// `lines` exists alongside `text` because a WhatsApp *template* — which
// is what a scheduled, business-initiated message needs once the 24-hour
// window has closed — cannot carry newlines inside a variable. So the
// same digest is offered twice: as one string for free-form sends, and
// as single-line parts for template parameters.

import { relativeHe } from './leadsView'

const DAY_MS = 86400000

// 'YYYY-MM-DD' → Israel-local day boundaries in epoch ms. The business
// day is Asia/Jerusalem; using UTC would roll "yesterday" over at 02:00
// or 03:00 local and put last night's leads in the wrong bucket.
function israelDayBounds(iso) {
    const start = new Date(`${iso}T00:00:00+03:00`).getTime()
    return { start, end: start + DAY_MS }
}

function yesterdayISO(todayISO) {
    const d = new Date(`${todayISO}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function heDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
    if (!m) return String(iso || '')
    return `${Number(m[3])} ב${HE_MONTHS[Number(m[2]) - 1] || ''}`
}

// One line per person who is actually blocked on Lord. Truncated hard —
// past four, the message stops being scannable and the count carries it.
function waitingLines(leads, limit = 4) {
    const out = []
    for (const l of leads.slice(0, limit)) {
        const who = l.name || l.profileName || l.phone
        const why = l.handoffReason ? ` · ${String(l.handoffReason).slice(0, 60)}` : ''
        const age = l.waitingHours != null ? ` (${l.waitingHours} שע׳)` : ''
        out.push(`· ${who}${age}${why}`)
    }
    if (leads.length > limit) out.push(`· ועוד ${leads.length - limit}`)
    return out
}

/**
 * @param {Array}  items     leads already run through deriveLead()
 * @param {string} todayISO  'YYYY-MM-DD' in Israel
 * @param {object} experiments  summarizeExperiments() output
 * @param {Array}  gaps         summarizeGaps() output
 */
export function buildDigest(items = [], { todayISO, nowMs = Date.now(), experiments, gaps = [] } = {}) {
    const yISO = yesterdayISO(todayISO)
    const { start, end } = israelDayBounds(yISO)
    const inYesterday = ms => ms != null && ms >= start && ms < end

    const waiting = items.filter(l => l.attention === 'handoff')
    const readyToPay = items.filter(l => l.attention === 'ready_to_pay')
    const dueToday = items.filter(l => l.attention === 'followup_due' || l.attention === 'callback_due')

    const activeYesterday = items.filter(l => inYesterday(l.lastInboundMs))
    const newYesterday = items.filter(l => inYesterday(l.createdAtMs))
    const wonYesterday = items.filter(l => l.stage === 'closed_won' && inYesterday(l.updatedMs))

    // A quiet day is a real thing and must not generate a message. The
    // test is "is there anything to do, or anything that happened" — not
    // "does the CRM contain rows".
    const hasNews =
        waiting.length > 0 || readyToPay.length > 0 || dueToday.length > 0 || activeYesterday.length > 0

    const blocks = []
    blocks.push(`בוקר טוב. סיכום ל-${heDate(yISO)}.`)

    if (waiting.length > 0) {
        blocks.push([`צריכים אותך עכשיו: ${waiting.length}`, ...waitingLines(waiting)].join('\n'))
    }
    if (readyToPay.length > 0) {
        blocks.push([`מוכנים לשלם: ${readyToPay.length}`, ...waitingLines(readyToPay, 3)].join('\n'))
    }
    if (dueToday.length > 0) {
        blocks.push(`פולו-אפ להיום: ${dueToday.length}`)
    }

    const y = []
    y.push(`${activeYesterday.length} שיחות`)
    if (newYesterday.length > 0) y.push(`${newYesterday.length} חדשים`)
    if (wonYesterday.length > 0) y.push(`${wonYesterday.length} סגירות`)
    blocks.push(`אתמול: ${y.join(', ')}`)

    if (gaps.length > 0 && gaps[0].count > 1) {
        blocks.push(`הבוט נתקע הכי הרבה על: ${gaps[0].reason} (${gaps[0].count} פעמים)`)
    }

    if (experiments) {
        if (experiments.verdict === 'winner') {
            const w = experiments.rows.find(r => r.id === experiments.winner)
            blocks.push(`ניסוי הפתיחות: "${w?.label}" מוביל באופן מובהק. שווה להפוך אותה לברירת מחדל.`)
        } else if (experiments.verdict === 'too-close') {
            blocks.push('ניסוי הפתיחות: המובילות עדיין צמודות מדי. אל תחליף כלום עדיין.')
        } else if (experiments.needed > 0) {
            blocks.push(`ניסוי הפתיחות: עוד כ-${experiments.needed} לידים עד שיהיה מה לקרוא.`)
        }
    }

    const text = blocks.join('\n\n')

    // Template-safe parts: one line each, no newlines, no tabs, no runs
    // of spaces — WhatsApp rejects a template parameter containing any of
    // those, which is exactly how a scheduled digest silently stops
    // arriving.
    const lines = [
        waiting.length > 0 ? `צריכים אותך: ${waiting.length}` : 'אף אחד לא ממתין לך',
        dueToday.length > 0 ? `פולו-אפ להיום: ${dueToday.length}` : 'אין פולו-אפים להיום',
        `אתמול: ${y.join(', ')}`,
        readyToPay.length > 0 ? `מוכנים לשלם: ${readyToPay.length}` : 'אין מוכנים לשלם',
    ].map(sanitizeParam)

    return {
        hasNews,
        date: yISO,
        text,
        lines,
        counts: {
            waiting: waiting.length,
            readyToPay: readyToPay.length,
            dueToday: dueToday.length,
            activeYesterday: activeYesterday.length,
            newYesterday: newYesterday.length,
            wonYesterday: wonYesterday.length,
        },
    }
}

// WhatsApp rejects a template parameter with a newline, a tab, or more
// than four consecutive spaces. Silently — the send just fails.
export function sanitizeParam(s) {
    return String(s || '').replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}

export { yesterdayISO, heDate }
export default { buildDigest, sanitizeParam }
