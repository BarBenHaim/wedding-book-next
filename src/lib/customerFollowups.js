// The four messages that accompany a paying customer around their event, and
// the rules of when each one may go. Pure: no Firebase, no clock.
// Spec: docs/superpowers/specs/2026-11-25-customer-board-and-followups-design.md
//
// The keys are the same `lifecycleSent` keys as the (paused) e-mails in
// lib/lifecycle.js, so a moment is only ever handled once, on one channel.

import { daysBetween } from './lifecycle'
import { eventDay } from './journeyStage'
import { eventSignUrl } from './eventLinks'

export const FOLLOWUPS = [
    { key: 'share_14', template: 'wt_share_14', label: 'שבועיים לפני: קישור לאורחים' },
    { key: 'eve', template: 'wt_eve', label: 'לפני האירוע: השלט' },
    { key: 'post_1', template: 'wt_after', label: 'אחרי האירוע: מזל טוב וקישורים' },
    { key: 'post_3', template: 'wt_review', label: 'מעבר על הספר ואישור' },
]

const DAY_MS = 86_400_000
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

const HEBREW = new Intl.DateTimeFormat('en-US-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' })
// Rosh Hashana, Yom Kippur, Sukkot, Shmini Atzeret, Pesach (first and last), Shavuot.
const HOLIDAYS = new Set(['1 Tishri', '2 Tishri', '10 Tishri', '15 Tishri', '22 Tishri', '15 Nisan', '21 Nisan', '6 Sivan'])

export function isNoSendDay(iso) {
    const date = new Date(`${iso}T00:00:00Z`)
    return date.getUTCDay() === 6 || HOLIDAYS.has(HEBREW.format(date))
}

// Working days from `from` up to, and not including, `to`.
function sendableBetween(from, to) {
    let count = 0
    for (let day = from; day < to; day = addDays(day, 1)) if (!isNoSendDay(day)) count++
    return count
}

export function mobileOf(raw) {
    let digits = String(raw || '').replace(/\D/g, '')
    if (digits.startsWith('00')) digits = digits.slice(2)
    if (digits.startsWith('0')) digits = `972${digits.slice(1)}`
    if (digits.length === 9 && digits.startsWith('5')) digits = `972${digits}`
    return /^9725\d{8}$/.test(digits) ? digits : ''
}

// The name a message speaks of: the couple or the celebrant, never the book's own title.
export function eventNameOf(w) {
    const text = value => String(value || '').trim()
    if (w?.eventType === 'wedding' || (!w?.celebrantName && !w?.celebrantNameHe)) {
        const couple = [text(w?.brideNameHe) || text(w?.brideName), text(w?.groomNameHe) || text(w?.groomName)].filter(Boolean)
        if (couple.length) return couple.join(' ו')
    }
    return [text(w?.celebrantNameHe) || text(w?.celebrantName), text(w?.celebrantName2)].filter(Boolean).join(' ו')
}

// Why this customer gets no automatic message, or null when they may.
export function followupBlock(w, facts = {}) {
    if (!(Number(w?.amountPaid) > 0)) return 'unpaid'
    if (w.isDemo === true || w.createdVia === 'demo') return 'demo'
    if (w.closedAt) return 'closed'
    if (w.printOrderedAt || w.printOrder || w.shippedAt || w.deliveredAt) return 'in_print'
    if (w.lifecycleOff === true) return 'muted'
    if (!mobileOf(w.ownerPhone) && !mobileOf(facts.phone)) return 'no_phone'
    if (!eventNameOf(w)) return 'no_title'
    if (facts.openRequests > 0) return 'open_request'
    if (facts.paused) return 'human'
    return null
}

function inWindow(key, { day, today, toEvent }) {
    const since = -toEvent
    if (key === 'share_14') return toEvent >= 8 && toEvent <= 14
    if (key === 'eve') {
        if (toEvent < 1 || toEvent > 5) return false
        // Two days before; earlier only when every later day before the event is a rest day.
        return toEvent <= 2 || sendableBetween(addDays(today, 1), day) === 0
    }
    const start = key === 'post_1' ? 1 : 5
    // Two working days from the start, so a Saturday moves a message and does not drop it.
    return since >= start && since <= start + 5 && sendableBetween(addDays(day, start), today) < 2
}

// The one message due today for this book, or null. `ignore` skips the rest-day
// and switch-on rules for a preview of what would be scheduled.
export function dueFollowup({ w, facts = {}, today, enabledDay }) {
    if (!enabledDay || isNoSendDay(today)) return null
    const day = eventDay(w?.weddingDate)
    if (!day || day < enabledDay || followupBlock(w, facts)) return null
    const toEvent = daysBetween(today, day)
    const sent = w.lifecycleSent || {}
    return FOLLOWUPS.find(item => !sent[item.key] && inWindow(item.key, { day, today, toEvent })) || null
}

// The first day, from today on, each unsent message would go. For the board.
// Without a switch-on day (sending by hand) no event is too old to list.
export function scheduleFor({ w, facts = {}, today, enabledDay = '2000-01-01' }) {
    const day = eventDay(w?.weddingDate)
    if (!day || followupBlock(w, facts)) return []
    const planned = []
    const sent = { ...(w.lifecycleSent || {}) }
    // Nothing is ever due more than three weeks before the event.
    let date = [today, enabledDay, addDays(day, -21)].sort().at(-1)
    for (; date <= addDays(day, 11); date = addDays(date, 1)) {
        const due = dueFollowup({ w: { ...w, lifecycleSent: sent }, facts, today: date, enabledDay })
        if (due) {
            planned.push({ key: due.key, label: due.label, day: date })
            sent[due.key] = true
        }
    }
    return planned
}

// The texts Lord approved on 25.11, word for word as to be submitted to Meta
// under the template names above. Used when he sends one himself. Each template
// also carries the footer "להפסקת העדכונים השיבו: הסר", set in WhatsApp
// Manager; the reply route acts on that word.
export const FOLLOWUP_TEXTS = {
    share_14: 'היי {{1}}, בעוד כשבועיים האירוע של {{2}} 🎉 זה זמן טוב לשלוח לאורחים את הקישור לכתיבת ברכה: {{3}} צוות Wedding Tales',
    eve: 'היי {{1}}, האירוע של {{2}} כבר ממש קרוב ✨ כדאי להדפיס את השלט ולהציב אותו בכניסה: {{3}} שיהיה אירוע מדהים!',
    post_1: 'היי {{1}}, מזל טוב! 💛 מקווים שהאירוע של {{2}} היה מרגש. לצפייה בספר: {{3}} ולמי שלא הספיק לכתוב ברכה, זה הקישור: {{4}} אפשר להעביר אותו לאורחים.',
    post_3: 'היי {{1}}, הברכות לספר של {{2}} מחכות לכם 📖 כשנוח, עברו עליהן ואשרו, ואז נתקדם להדפסה: {{3}} אם משהו לא ברור, פשוט השיבו כאן.',
}

export function renderFollowup(key, w, baseUrl) {
    const filled = templateFor(key, w, baseUrl)
    return filled && FOLLOWUP_TEXTS[key].replace(/\{\{(\d)\}\}/g, (_, n) => filled.params[Number(n) - 1])
}

export function templateFor(key, w, baseUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '')
    const name = String(w?.ownerName || '').trim().split(/\s+/)[0] || 'לכם'
    const event = eventNameOf(w)
    const id = encodeURIComponent(String(w?.id || ''))
    const guest = w?.slug ? `${base}/w/${w.slug}` : null
    const view = w?.digitalTokens?.[0] ? `${base}/wedding/${id}/book/${w.digitalTokens[0]}` : null
    // The sign and the review pages ask for the normal sign-in: these messages get forwarded.
    const links = {
        share_14: [guest],
        eve: [eventSignUrl(base, w?.id)],
        post_1: [view, guest],
        post_3: [`${base}/wedding/${id}/portal`],
    }[key]
    const template = FOLLOWUPS.find(item => item.key === key)?.template
    if (!template || !event || !links || links.some(link => !link)) return null
    return { name: template, params: [name, event, ...links] }
}
