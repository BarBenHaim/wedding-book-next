// src/lib/salesAgent/mediaLibrary.js
//
// The media the bot is allowed to send, and how we find out which of it
// is worth sending.
//
// Until now the six images lived in catalog.js as code. That was fine
// while there were six and they never changed, and it stops being fine
// the moment Lord wants to try a video he shot last week. Anything he
// has to ask me to add is something he will not bother trying, and the
// whole value of testing creative is trying more of it than you believe
// in.
//
// So: the catalog images stay as the floor, and anything uploaded from
// the leads screen joins them. The model sees one merged list and does
// not know or care which is which.
//
// ── Measuring ────────────────────────────────────────────────────────
//
// "The bot tries them and sees what works" is the part worth getting
// right, because the obvious version of it is wrong. Counting sends
// tells you what the bot likes. What matters is what happened AFTER.
//
// Two signals, both cheap and both honest:
//
//   replied  — they wrote back within 24 hours of receiving it. This is
//              the fast one, the one that moves within a day, and the
//              one that tells you whether the thing earned attention.
//   won      — that conversation ended in a sale. Slow, noisy, and the
//              only one that pays. Attributed to every asset sent in the
//              conversation, not just the last, because the last-touch
//              version would credit whatever happened to be sent near
//              the finish line.
//
// Neither is proof. Twelve sends is not a result, and the scoring below
// says so out loud rather than ranking noise with a confident number.

// WhatsApp's own limits, which are what actually decide whether a send
// succeeds. Getting these wrong means an upload that looks fine in the
// admin and fails silently at the API - the worst possible place to
// find out.
export const LIMITS = {
    image: { maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png'] },
    video: { maxBytes: 16 * 1024 * 1024, types: ['video/mp4', 'video/3gpp'] },
}

export const KIND_HE = { image: 'תמונה', video: 'סרטון' }

// Enough sends that a difference means something. Below it the screen
// shows the count and refuses to show a rate, because a 100% reply rate
// on two sends is the most misleading number a dashboard can print.
export const MIN_SENDS_FOR_RATE = 8

const slugish = /^[a-z0-9_]{2,40}$/

/**
 * Is this file sendable at all?
 *
 * Returns a Hebrew reason rather than a boolean, because the reason is
 * what the upload panel shows and "invalid file" helps nobody.
 */
export function validateUpload({ kind, type, size } = {}) {
    const rules = LIMITS[kind]
    if (!rules) return { ok: false, reason: 'סוג קובץ לא נתמך' }
    if (!rules.types.includes(String(type || '').toLowerCase())) {
        const allowed = rules.types.map(t => t.split('/')[1].toUpperCase()).join(' או ')
        return { ok: false, reason: `וואטסאפ מקבלת רק ${allowed}` }
    }
    const mb = Math.round(rules.maxBytes / (1024 * 1024))
    if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: 'קובץ ריק' }
    if (size > rules.maxBytes) {
        return { ok: false, reason: `גדול מדי — ${KIND_HE[kind]} עד ${mb}MB בוואטסאפ` }
    }
    return { ok: true, reason: null }
}

/**
 * The key the model will use to ask for this asset.
 *
 * Latin and lowercase even though everything else here is Hebrew: this
 * string travels through a JSON field the model fills in, and a Hebrew
 * key there is one more thing that can come back subtly wrong.
 */
export function keyFrom(label, existing = []) {
    const taken = new Set(Array.isArray(existing) ? existing : [])
    const base = String(label || '')
        .trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_').replace(/^_|_$/g, '')
        .slice(0, 32)

    // A Hebrew label sanitises down to nothing, which is the common case
    // rather than the edge case here. Numbering is honest about that -
    // better a key that says nothing than a mangled transliteration the
    // model then tries to interpret.
    if (!slugish.test(base)) {
        let n = 1
        while (taken.has(`media_${n}`)) n++
        return `media_${n}`
    }
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}_${n}`)) n++
    return `${base}_${n}`
}

/**
 * One list for the prompt: the built-in catalog plus whatever Lord
 * uploaded, with uploads winning a key collision.
 *
 * Uploads win because a collision means he deliberately named something
 * after a built-in, and the thing he just uploaded is the thing he wants
 * tried.
 */
export function mergeMedia(catalogMedia = {}, custom = []) {
    const out = {}
    for (const [key, m] of Object.entries(catalogMedia)) {
        out[key] = { ...m, kind: 'image', source: 'catalog' }
    }
    for (const item of Array.isArray(custom) ? custom : []) {
        if (!item?.key || !item?.url || item.disabled) continue
        out[item.key] = {
            url: item.url,
            caption: item.caption || '',
            when: item.when || '',
            kind: item.kind === 'video' ? 'video' : 'image',
            source: 'upload',
        }
    }
    return out
}

const rate = (num, den) => (den > 0 ? num / den : 0)

/**
 * How an asset is doing, stated at the confidence the data supports.
 *
 * `enough` is the field that matters. Without it the screen ranks two
 * sends above forty, Lord deletes something that was working, and the
 * measurement has made his marketing worse than no measurement.
 */
export function scoreMedia(stat = {}) {
    const sent = Number(stat.sent) || 0
    const replied = Number(stat.replied) || 0
    const won = Number(stat.won) || 0
    const enough = sent >= MIN_SENDS_FOR_RATE
    return {
        sent, replied, won,
        replyRate: rate(replied, sent),
        winRate: rate(won, sent),
        enough,
        // Reply rate leads because it moves in a day and a sale takes a
        // fortnight; a win is worth three replies because it is the
        // thing being optimised. Only ever used to sort a list.
        score: enough ? rate(replied, sent) + 3 * rate(won, sent) : -1,
    }
}

/** Best first, unproven last, so the screen reads top to bottom. */
export function rankMedia(stats = {}) {
    return Object.entries(stats)
        .map(([key, stat]) => ({ key, ...scoreMedia(stat) }))
        .sort((a, b) => b.score - a.score || b.sent - a.sent)
}

/**
 * What the prompt is told about performance.
 *
 * Only the proven ones, only when there is a real spread, and phrased as
 * evidence rather than an order. Told "always send X" the model sends X
 * to somebody asking about a bat mitzvah when X is a wedding book, and
 * a rule that overrides relevance is worse than no rule.
 */
export function performanceNote(stats = {}, media = {}) {
    const ranked = rankMedia(stats).filter(r => r.enough && media[r.key])
    if (ranked.length < 2) return null

    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    if (best.replyRate - worst.replyRate < 0.15) return null

    const pct = r => `${Math.round(r * 100)}%`
    const lines = [
        `- ${best.key} עובד הכי טוב: ${pct(best.replyRate)} מהאנשים ענו אחריו (${best.sent} שליחות).`,
    ]
    if (worst.replyRate < best.replyRate) {
        lines.push(`- ${worst.key} עובד פחות: ${pct(worst.replyRate)} (${worst.sent} שליחות).`)
    }
    const won = ranked.filter(r => r.won > 0).sort((a, b) => b.winRate - a.winRate)[0]
    if (won && won.key !== best.key) {
        lines.push(`- ${won.key} הופיע בשיחות שנסגרו בעסקה יותר מהאחרים.`)
    }
    lines.push('זה מידע, לא הוראה. רלוונטיות לסוג האירוע קודמת תמיד למספרים.')
    return `## מה עבד עד עכשיו\n${lines.join('\n')}`
}

export default {
    LIMITS, KIND_HE, MIN_SENDS_FOR_RATE,
    validateUpload, keyFrom, mergeMedia, scoreMedia, rankMedia, performanceNote,
}
