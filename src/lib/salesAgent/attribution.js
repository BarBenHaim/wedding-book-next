// src/lib/salesAgent/attribution.js
//
// Where a lead came from, read off their first sentence.
//
// The comment-to-DM automation ends with a wa.me link carrying prefilled
// text, so the person's opening message is one we wrote. That makes
// attribution possible without a tracking code: instead of appending
// something like [ref:ig] and hoping nobody deletes it, each channel
// gets its own natural opening line, and this file matches on it.
//
//   Instagram → "היי, הגעתי מהאינסטגרם ואשמח לפרטים"
//   Facebook  → "היי, הגעתי מפייסבוק ואשמח לפרטים"
//
// Two reasons for phrasing over codes. A code is the first thing a
// person edits out, because it looks like surveillance in the middle of
// a message they are about to send under their own name. And a sentence
// keeps working when somebody retypes it from memory, which a code never
// does.
//
// The cost of being wrong is asymmetric and shapes everything below. A
// missed attribution costs a row in a report. A WRONG one is worse: it
// tells Lord an ad is working when it is not, and ad budget moves on
// that. So this only ever fires on a lead's FIRST message, and it stays
// silent rather than guessing.

// Ordered: the most specific claim wins. Somebody who names Instagram
// gets Instagram even if they also say "the ad".
const RULES = [
    { source: 'instagram_ad', re: /אינסטגרם|אינסטה|instagram|\binsta\b/i },
    { source: 'facebook_ad', re: /פייסבוק|פייסבוק|facebook|\bfb\b/i },
    { source: 'tiktok', re: /טיקטוק|tiktok/i },
    // No platform named, but clearly an ad or a video. Worth separating
    // from an organic WhatsApp enquiry even without knowing which
    // network it came from.
    { source: 'meta_ad', re: /המודעה|מודעה שלכם|בפרסומת|הסרטון שלכם|ראיתי סרטון/ },
    { source: 'google', re: /גוגל|google/i },
    { source: 'referral', re: /המליצ|שמעתי עליכם|חבר שלי הזמין|דרך חברה/ },
]

/**
 * The channel this message implies, or null when it implies nothing.
 *
 * Null is the common answer and the correct one. Most people just write
 * "היי כמה עולה", which says nothing about where they saw us, and
 * inventing a source for them would quietly corrupt the only numbers
 * that decide where the ad budget goes.
 */
export function detectSource(text) {
    const s = String(text || '')
    if (!s.trim()) return null
    for (const rule of RULES) {
        if (rule.re.test(s)) return rule.source
    }
    return null
}

/**
 * The source to store for this exchange.
 *
 * Only the first message can set it. Later ones cannot, and that is the
 * point: somebody saying "I also saw your ad on Instagram" three
 * messages into a conversation that started from a friend's
 * recommendation did not come from Instagram, and letting the last
 * mention win would rewrite history every time.
 */
export function resolveSource({ isNew, text, existing, fallback }) {
    if (existing) return existing
    if (isNew) return detectSource(text) || fallback || null
    return fallback || null
}

// Hebrew labels for the admin table. Kept beside the detection so a new
// channel cannot be added without also being nameable on screen.
export const SOURCE_LABELS = {
    instagram_ad: 'אינסטגרם',
    facebook_ad: 'פייסבוק',
    tiktok: 'טיקטוק',
    meta_ad: 'מודעה',
    google: 'גוגל',
    referral: 'המלצה',
    whatsapp: 'וואטסאפ ישיר',
}

export function sourceLabel(source) {
    if (!source) return null
    return SOURCE_LABELS[source] || source
}

export default { detectSource, resolveSource, sourceLabel, SOURCE_LABELS }
