// src/lib/ownerLook.js: pure helpers for the one-photo studio (names, labels, the cover fields).
//
// The owner uploads one photo in the personal area; the image model draws covers and the upper part of a
// sign around it (lib/ownerLookAi.js, api/owner/event-look/render). What is here is plain data and arithmetic,
// testable without a browser: how an event is named on its cover, what picking a cover writes to the event
// (only cover fields, and enough to put the old cover back), and the name of the sign look.

// ── Names and labels ────────────────────────────────────────────────────────

export const EVENT_LABEL_HE = Object.freeze({
    wedding: 'חתונה',
    bar_mitzvah: 'בר מצווה',
    twins_bar_mitzvah: 'בר מצווה',
    bat_mitzvah: 'בת מצווה',
    birthday: 'יום הולדת',
    poker: 'ערב פוקר',
    travel: 'מסע',
})

/** "דנה ויובל", "גל", or '' when the event has no name yet. Twins read "דניאל ונועם". */
export function lookNames(w) {
    if (!w) return ''
    const t = (...v) => v.map(x => (typeof x === 'string' ? x.trim() : '')).find(Boolean) || ''
    if (w.eventType === 'twins_bar_mitzvah') {
        const a = t(w.celebrantNameHe, w.celebrantName)
        const b = t(w.celebrantName2He, w.celebrantName2)
        if (a && b) return `${a} ו${b}`
        if (a || b) return a || b
    }
    if (w.eventType === 'wedding' || w.brideName || w.groomName || w.brideNameHe || w.groomNameHe) {
        const a = t(w.brideNameHe, w.brideName)
        const b = t(w.groomNameHe, w.groomName)
        if (a && b) return `${a} ו${b}`
        if (a || b) return a || b
    }
    return t(w.celebrantNameHe, w.celebrantName, w.customTitle, w.ownerNameHe, w.ownerName)
}

export function eventLabel(eventType) {
    return (typeof eventType === 'string' && EVENT_LABEL_HE[eventType]) || ''
}

// ── What picking a cover writes, and how to undo it ─────────────────────────

// The fields a picked cover touches. The cover template paints coverImage inset at 80% and scaled, so a
// full-cover picture is asked for at 125%; the print exports paint it edge to edge on their own.
export const COVER_PICK_FIELDS = Object.freeze({
    coverTexture: 'none', // an explicit plain background: the default cover art must not show behind or around it
    coverFrame: 'none',
    coverImageX: 50,
    coverImageY: 50,
    coverImageScale: 125,
    coverTitle: '',
    coverSubtitle: '',
})
export const COVER_KEYS = Object.freeze(['coverImage', ...Object.keys(COVER_PICK_FIELDS), 'coverAuto'])

/** The values the cover fields have now, so a pick can be undone. Absent fields stay absent (null). */
export function coverBefore(coverDesign) {
    const cd = coverDesign && typeof coverDesign === 'object' ? coverDesign : {}
    const out = {}
    for (const k of COVER_KEYS) out[k] = cd[k] === undefined ? null : cd[k]
    return out
}

/** Firestore update (dotted paths, so nothing else in coverDesign is touched) for picking a cover picture. */
export function coverPickUpdate({ url, optionId, before, now = new Date() }) {
    const set = { 'coverDesign.coverImage': url, 'coverDesign.coverAuto': { optionId, at: now.toISOString(), from: 'photo' } }
    for (const [k, v] of Object.entries(COVER_PICK_FIELDS)) set[`coverDesign.${k}`] = v
    // the first pick keeps what was there; picking again does not overwrite that with an earlier auto cover
    return { set, before }
}

/** Update that puts the previous cover back: { set, remove } where remove lists fields to delete. */
export function coverUndoUpdate(before) {
    const set = {}
    const remove = []
    for (const k of COVER_KEYS) {
        const v = before ? before[k] : null
        if (v === null || v === undefined) remove.push(`coverDesign.${k}`)
        else set[`coverDesign.${k}`] = v
    }
    return { set, remove }
}

/** True when picking a cover would replace one a person or a preset chose (not one of ours, not an empty cover). */
export function pickWouldReplaceChoice(coverDesign, coverIsUndressed) {
    if (coverIsUndressed(coverDesign)) return false
    return !coverDesign?.coverAuto
}

// ── Signs ───────────────────────────────────────────────────────────────────

/** The sign look that shows the artwork made from the owner's photo (posterArt.url) with the live QR below it. */
export const ART_LOOK = 'art'
export const isArtLook = look => look === ART_LOOK
