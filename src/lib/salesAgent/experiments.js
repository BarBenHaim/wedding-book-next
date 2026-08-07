// src/lib/salesAgent/experiments.js
//
// How the agent gets better at selling, and — just as important — how it
// avoids fooling its owner into thinking it has.
//
// The honest framing first. A language model does not learn from
// yesterday's conversations; nothing here trains anything. What it does
// is run a controlled experiment: every new lead is permanently assigned
// one opening approach, the outcome of that conversation is recorded
// against it, and the table reports which approach is actually winning.
// The improvement comes from a human reading that and promoting the
// winner, not from the model quietly changing its mind.
//
// The second half matters more than the first at this volume. With a
// handful of leads a day, two approaches that are genuinely identical
// will still show a 20-point gap for weeks purely by chance. A dashboard
// that declares a winner from 8 leads per arm is worse than no
// dashboard: it invites the owner to throw away a good opener because of
// noise. So every rate here carries a sample size, and no winner is
// declared until the gap survives a crude significance check.
//
// Assignment is a hash of the phone number rather than a random draw, so
// a lead can never be re-rolled into a different arm by a retry, a lost
// write, or a replayed webhook. Same customer, same arm, forever.

// Four openings that encode genuinely different beliefs about why people
// buy this product. They are deliberately far apart — testing two
// rewordings of the same idea burns months to learn nothing.
export const OPENING_VARIANTS = [
    {
        id: 'question_first',
        label: 'שאלה קודם',
        hypothesis: 'שיחה נפתחת טוב יותר כששואלים על האירוע לפני שמוכרים',
        directive: `פתח בשאלה אחת קצרה על האירוע שלו (איזה אירוע ומתי). בלי מחיר,
בלי קישור, בלי לתאר את המוצר. משפט אחד ושאלה.`,
    },
    {
        id: 'demo_first',
        label: 'דמו מיד',
        hypothesis: 'מי שכותב ברכה בעצמו כבר מדמיין את האירוע שלו',
        directive: `שלח כבר בהודעה הראשונה את קישור הדמו החי, עם משפט אחד שמסביר
מה לעשות איתו. אחר כך שאלה אחת על האירוע.`,
    },
    {
        id: 'value_then_ask',
        label: 'משפט ערך ואז שאלה',
        hypothesis: 'צריך להבין מה זה לפני שמוכנים לענות על שאלות',
        directive: `משפט אחד קונקרטי על מה שהם מקבלים בסוף (ספר עם הברכות
והתמונות של האורחים), ואז שאלה אחת על האירוע. בלי מחיר בשלב הזה.`,
    },
    {
        id: 'price_upfront',
        label: 'מחיר מראש',
        hypothesis: 'חלק מהאנשים רק רוצים לדעת כמה, ונושרים כשמתחמקים',
        directive: `אמור מיד את טווח המחירים (690 עד 1490, לפי חבילה), במשפט אחד
ובלי התנצלות, ואז שאלה אחת על האירוע.`,
    },
]

export const VARIANT_IDS = OPENING_VARIANTS.map(v => v.id)

export function findVariant(id) {
    return OPENING_VARIANTS.find(v => v.id === id) || null
}

/**
 * Deterministic arm assignment. A hash, not a coin flip: a retried
 * webhook or a lost write must never move a lead between arms, or the
 * measurement is quietly corrupted in the direction of whichever arm
 * happens to retry more.
 */
export function assignVariant(phone) {
    const s = String(phone || '')
    if (!s) return VARIANT_IDS[0]
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
    }
    return VARIANT_IDS[h % VARIANT_IDS.length]
}

/**
 * The opener directive, but only while it is still the opener. Injecting
 * "lead with a question" into message nine would make the agent restart
 * the conversation, which is both bad selling and a corrupted
 * experiment — the arm would be measuring something it never did.
 */
export function shouldApplyOpening(lead) {
    if (!lead) return true
    if (lead.isNew) return true
    return (Number(lead.userTurns) || 0) <= 1
}

// Below this, a rate is a rumour. Shown anyway — hiding it entirely
// looks broken — but flagged, never ranked.
export const MIN_SAMPLE = 30

function rate(n, d) {
    return d > 0 ? n / d : null
}

// Standard error of a proportion. Used only to answer "is this gap
// bigger than the noise", which is the one statistical question this
// screen has to get right.
function stderr(p, n) {
    if (!n || p == null) return Infinity
    return Math.sqrt(Math.max(p * (1 - p), 0.0001) / n)
}

const reached = (lead, stages) => {
    const list = Array.isArray(lead?.stagesReached) ? lead.stagesReached : []
    return stages.some(s => list.includes(s) || lead?.stage === s)
}

/**
 * Per-arm funnel.
 *
 * `replied` is the metric the owner actually asked for: of the people
 * who got this opening, how many wrote back after it. A lead exists only
 * because someone messaged us first, so "replied" means a SECOND inbound
 * message — proof the opener earned another turn rather than ending the
 * conversation.
 */
export function summarizeExperiments(leads, { minSample = MIN_SAMPLE } = {}) {
    const byVariant = new Map()
    for (const v of OPENING_VARIANTS) {
        byVariant.set(v.id, { ...v, leads: 0, replied: 0, reachedOffer: 0, won: 0, revenue: 0 })
    }

    for (const l of leads || []) {
        const id = l?.variant
        if (!byVariant.has(id)) continue // unassigned or retired arm
        const row = byVariant.get(id)
        row.leads++
        if ((Number(l.userTurns) || 0) >= 2) row.replied++
        if (reached(l, ['offer_sent', 'ready_to_pay', 'closed_won'])) row.reachedOffer++
        if (l.stage === 'closed_won') {
            row.won++
            row.revenue += Number(l.amount) || 0
        }
    }

    const rows = [...byVariant.values()].map(r => ({
        ...r,
        replyRate: rate(r.replied, r.leads),
        offerRate: rate(r.reachedOffer, r.leads),
        winRate: rate(r.won, r.leads),
        enough: r.leads >= minSample,
    }))

    // A winner is only named when (a) both it and the runner-up have a
    // real sample, and (b) the gap is wider than the two standard errors
    // combined. Anything less is a coin that landed heads twice.
    const ranked = rows.filter(r => r.enough && r.replyRate != null).sort((a, b) => b.replyRate - a.replyRate)
    let winner = null
    let verdict = 'collecting'
    if (ranked.length >= 2) {
        const [first, second] = ranked
        const margin = stderr(first.replyRate, first.leads) + stderr(second.replyRate, second.leads)
        if (first.replyRate - second.replyRate > margin) {
            winner = first.id
            verdict = 'winner'
        } else {
            verdict = 'too-close'
        }
    }

    const totalAssigned = rows.reduce((s, r) => s + r.leads, 0)
    return {
        rows: rows.sort((a, b) => (b.replyRate ?? -1) - (a.replyRate ?? -1)),
        winner,
        verdict, // 'collecting' | 'too-close' | 'winner'
        totalAssigned,
        minSample,
        // How many more leads before ANY comparison is readable: the two
        // fullest arms are the ones that will get there first, so this is
        // what each of them still needs, summed. Concrete beats "not
        // enough data yet" — it tells him whether that is next week or
        // next quarter.
        needed: rows
            .map(r => r.leads)
            .sort((a, b) => b - a)
            .slice(0, 2)
            .reduce((sum, n) => sum + Math.max(0, minSample - n), 0),
    }
}

/**
 * The part that is genuinely useful at five leads a day: what the bot
 * kept failing at. A/B tests need months; "the same question defeated it
 * four times this week" is actionable on Tuesday.
 */
export function summarizeGaps(leads, { limit = 8 } = {}) {
    const counts = new Map()
    for (const l of leads || []) {
        const reason = String(l?.handoffReason || '').trim()
        if (!reason) continue
        const key = reason.slice(0, 120)
        const cur = counts.get(key) || { reason: key, count: 0, phones: [] }
        cur.count++
        if (cur.phones.length < 3 && l.phone) cur.phones.push(l.phone)
        counts.set(key, cur)
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

export default { OPENING_VARIANTS, assignVariant, summarizeExperiments, summarizeGaps, findVariant }
