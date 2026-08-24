// src/lib/salesAgent/leadsView.js
//
// Everything the leads table needs to decide WHAT MATTERS, kept pure and
// free of Firebase so it can be tested and so the same answer is produced
// on the server and in the browser.
//
// The point of this module is a single opinion: a CRM screen is not a
// place to admire data, it is a place to find out who to talk to next.
// A flat list sorted by "recently updated" cannot answer that — the lead
// who has been waiting six hours for a human sinks below three delivery
// receipts. So every lead is scored into exactly one attention bucket,
// and the table is sorted by that first and time second.
//
// The buckets, in the order they outrank each other:
//
//   1. handoff       — the bot stopped and asked for a person. The
//                      conversation is FROZEN until someone replies, so
//                      every minute here is a minute of silence the
//                      customer can feel. Nothing outranks it.
//   2. ready_to_pay  — they asked for the payment link. Money already on
//                      the table; the only way to lose it is to be slow.
//   3. callback_due  — they said "I'll get back to you" on a date that
//                      has arrived. The highest-yield, least-annoying
//                      moment there is to reach out.
//   4. followup_due  — the agent scheduled a nudge for today.
//
// Terminal leads (paid, or politely closed) are never in a bucket. A CRM
// that keeps nagging you about a customer who already paid is a CRM you
// stop opening.

import { STAGES, TERMINAL_STAGES } from './catalog'
import { isVerifiedPayment } from './paymentTruth'

const DAY_MS = 86400000

// Hebrew labels and a colour tone per funnel stage. Tones are names, not
// class strings, so this file stays free of Tailwind and testable.
export const STAGE_META = {
    new: { label: 'חדש', tone: 'slate', order: 0 },
    engaged: { label: 'בשיחה', tone: 'sky', order: 1 },
    demo_sent: { label: 'נשלח דמו', tone: 'indigo', order: 2 },
    offer_sent: { label: 'הצעה נשלחה', tone: 'amber', order: 3 },
    objection: { label: 'התנגדות', tone: 'orange', order: 4 },
    commit_later: { label: 'הבטיח לחזור', tone: 'violet', order: 5 },
    ready_to_pay: { label: 'מוכן לשלם', tone: 'emerald', order: 6 },
    closed_won: { label: 'שילם', tone: 'green', order: 7 },
    closed_lost: { label: 'לא נסגר', tone: 'gray', order: 8 },
    handoff: { label: 'צריך אותך', tone: 'red', order: 9 },
}

export function stageMeta(stage) {
    return STAGE_META[stage] || { label: stage || 'חדש', tone: 'slate', order: 0 }
}

export const EVENT_TYPE_LABELS = {
    bar_mitzvah: 'בר מצווה',
    bat_mitzvah: 'בת מצווה',
    wedding: 'חתונה',
    birthday: 'יום הולדת',
    brit: 'ברית',
    other: 'אחר',
}

export function eventTypeLabel(t) {
    return EVENT_TYPE_LABELS[t] || (t ? String(t) : '')
}

export const PACKAGE_LABELS = {
    digital: 'דיגיטלי ₪690',
    printed: 'מודפס ₪990',
    premium: 'פרימיום ₪1490',
}

// The buckets, most urgent first. `key` is what the UI filters on.
export const ATTENTION_BUCKETS = [
    { key: 'handoff', label: 'צריכים אותך', hint: 'הבוט עצר וביקש בן אדם. השיחה קפואה עד שתענה.', tone: 'red' },
    { key: 'ready_to_pay', label: 'מוכנים לשלם', hint: 'ביקשו קישור תשלום. הדרך היחידה להפסיד אותם היא לאחר.', tone: 'emerald' },
    { key: 'callback_due', label: 'הבטיחו לחזור', hint: 'אמרו שיחזרו בתאריך שכבר הגיע.', tone: 'violet' },
    { key: 'followup_due', label: 'פולו-אפ להיום', hint: 'הסוכן קבע לחזור אליהם היום.', tone: 'amber' },
]

const BUCKET_RANK = ATTENTION_BUCKETS.reduce((acc, b, i) => ({ ...acc, [b.key]: i }), {})

export function isTerminal(stage) {
    return TERMINAL_STAGES.includes(stage)
}

// A lead is "paused for a human" for 48h after a handoff. That window is
// duplicated from leadsCore rather than imported so this module has no
// reason to reach into the bot's runtime.
const HUMAN_PAUSE_MS = 48 * 3600 * 1000

function msOf(v) {
    if (!v) return 0
    if (typeof v === 'number') return v
    if (typeof v?.toMillis === 'function') return v.toMillis()
    if (typeof v?.seconds === 'number') return v.seconds * 1000
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * Score one lead. Input is a plain object (the API converts Firestore
 * Timestamps to epoch ms before this runs), output is the same lead plus
 * the derived fields the table renders and sorts on.
 */
export function deriveLead(lead, { todayISO, nowMs = Date.now() } = {}) {
    const stage = lead?.stage || 'new'
    const terminal = isTerminal(stage)
    const humanSince = msOf(lead?.humanSince)
    // `human` with no timestamp means paused indefinitely — that is the
    // safe reading in the bot, and it must be the same reading here or
    // the table would tell you a frozen conversation is fine.
    const paused = !!lead?.human && (!humanSince || nowMs - humanSince < HUMAN_PAUSE_MS)

    const lastInboundMs = msOf(lead?.lastInboundAt)
    const lastMessageMs = msOf(lead?.lastMessageAt) || lastInboundMs
    const updatedMs = msOf(lead?.updatedAt) || lastMessageMs

    let attention = null
    if (!terminal) {
        if (stage === 'handoff' || paused) attention = 'handoff'
        else if (stage === 'ready_to_pay') attention = 'ready_to_pay'
        else if (lead?.callbackPromised && todayISO && lead.callbackPromised <= todayISO) attention = 'callback_due'
        else if (lead?.followUpAt && todayISO && lead.followUpAt <= todayISO) attention = 'followup_due'
    }

    return {
        ...lead,
        stage,
        terminal,
        paused,
        attention,
        // Lower sorts first. 99 keeps un-bucketed leads below every
        // bucketed one without needing a second sort key.
        attentionRank: attention ? BUCKET_RANK[attention] : 99,
        // How long this person has been staring at silence. This is the
        // number that should make you uncomfortable, so it is computed
        // even when the handoff has aged past the 48h auto-resume.
        waitingHours: humanSince ? Math.max(0, Math.floor((nowMs - humanSince) / 3600000)) : null,
        silentDays: lastInboundMs ? Math.max(0, Math.floor((nowMs - lastInboundMs) / DAY_MS)) : null,
        lastInboundMs,
        lastMessageMs,
        updatedMs,
        displayName: lead?.name || lead?.profileName || lead?.phone || '',
        waLink: lead?.phone ? `https://wa.me/${lead.phone}` : null,
        turnCount: Array.isArray(lead?.turns) ? lead.turns.length : lead?.turnCount || 0,
    }
}

/** Attention first, then whoever moved most recently. */
export function sortLeads(leads) {
    return [...(leads || [])].sort((a, b) => {
        if (a.attentionRank !== b.attentionRank) return a.attentionRank - b.attentionRank
        return (b.updatedMs || 0) - (a.updatedMs || 0)
    })
}

export function filterLeads(leads, { bucket = null, stage = null, eventType = null, q = '' } = {}) {
    const needle = String(q || '').trim().toLowerCase()
    return (leads || []).filter(l => {
        if (bucket && l.attention !== bucket) return false
        if (stage && l.stage !== stage) return false
        if (eventType && l.eventType !== eventType) return false
        if (!needle) return true
        const hay = [l.phone, l.name, l.profileName, l.celebrantName, l.notes, l.handoffReason]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
        return hay.includes(needle)
    })
}

/**
 * The numbers above the table. Deliberately few: counts per bucket (what
 * to do now), counts per stage (where the funnel leaks), and won/lost
 * over a window (whether any of this is working).
 *
 * `sinceMs` scopes the funnel to a period. Lifetime totals flatter and
 * inform nothing — what matters is whether last week beat the week
 * before.
 */
export function summarizeLeads(leads, { sinceMs = 0 } = {}) {
    const buckets = {}
    for (const b of ATTENTION_BUCKETS) buckets[b.key] = 0
    const byStage = {}
    for (const s of STAGES) byStage[s] = 0

    let inWindow = 0
    let won = 0
    let unverifiedWon = 0
    let lost = 0
    let revenue = 0
    let openLeads = 0

    for (const l of leads || []) {
        if (l.attention) buckets[l.attention] = (buckets[l.attention] || 0) + 1
        if (!l.terminal) openLeads++

        const recent = !sinceMs || (l.updatedMs || 0) >= sinceMs
        if (!recent) continue
        inWindow++
        byStage[l.stage] = (byStage[l.stage] || 0) + 1
        if (l.stage === 'closed_won') {
            if (isVerifiedPayment(l)) {
                won++
                revenue += Number(l.amount) || 0
            } else {
                unverifiedWon++
            }
        }
        if (l.stage === 'closed_lost') lost++
    }

    const decided = won + lost
    return {
        total: (leads || []).length,
        inWindow,
        openLeads,
        buckets,
        byStage,
        won,
        unverifiedWon,
        lost,
        revenue,
        // Close rate over DECIDED leads only. Dividing by every lead in
        // the window counts conversations that are still alive as
        // failures, which reads as a much worse business than it is.
        closeRate: decided ? Math.round((won / decided) * 100) : null,
    }
}

/** 'YYYY-MM-DD' for a given ms, in the business's timezone. */
export function isoInIsrael(ms = Date.now()) {
    return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

/** "לפני 3 שעות" / "לפני 2 ימים" — short, Hebrew, no library. */
export function relativeHe(ms, nowMs = Date.now()) {
    if (!ms) return ''
    const diff = Math.max(0, nowMs - ms)
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'הרגע'
    if (mins < 60) return `לפני ${mins} דק׳`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `לפני ${hours} שע׳`
    const days = Math.floor(hours / 24)
    if (days < 30) return `לפני ${days} ימים`
    const months = Math.floor(days / 30)
    return `לפני ${months} חוד׳`
}

export default { deriveLead, sortLeads, filterLeads, summarizeLeads, stageMeta, ATTENTION_BUCKETS, STAGE_META }
