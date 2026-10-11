// src/lib/entryKinds.js
//
// A blank page is an entry with nothing on it.
//
// The super-admin sometimes needs an empty leaf inside the book: to open
// a chapter on a right-hand page, to give a dedication room to breathe,
// to even out a spread before print. Until now the only way was to
// create a blessing with no text and hope the template drew nothing —
// which the notebook and collage layouts do not (they draw the empty
// card, the sparkles).
//
// So the empty leaf is an entry of its own KIND, `kind: 'blank'`. It
// lives in the same `entries` subcollection and carries an `orderIndex`
// like every blessing, so every reader of the book — flipbook, digital
// edition, the three PDF paths, Picabook, the arrange link — places it
// without knowing anything new. Only two places have to know:
//
//   • BookPageTemplate paints the page surface and the frame, nothing else;
//   • expandBookPages never pairs it with a blessing in duo mode.
//
// `kind` is the field name on purpose: the legacy /api/entries route
// wrote `type` on old documents, and that word is taken.

export const BLANK_KIND = 'blank'

export function isBlankPage(entry) {
    return !!entry && entry.kind === BLANK_KIND
}

// The document a blank page is created as. Seven fields, well under the
// twelve the rules allow; `orderIndex` is filled in by the order writer
// right after creation.
export function blankPageDoc({ createdBy = null, timestamp = new Date() } = {}) {
    return {
        kind: BLANK_KIND,
        name: '',
        text: '',
        imageUrl: null,
        orderIndex: null,
        timestamp,
        createdBy,
    }
}

// Where the new page goes. `order` is the current entry-id list in book
// order; `afterId` null (or unknown) means "at the end". Returns a new
// list with `newId` inserted.
export function insertAfter(order, afterId, newId) {
    const list = (Array.isArray(order) ? order : []).filter(id => id !== newId)
    const at = afterId ? list.indexOf(afterId) : -1
    if (at < 0) return [...list, newId]
    return [...list.slice(0, at + 1), newId, ...list.slice(at + 1)]
}

// Blessings only — for every counter that says "N ברכות" to a person.
export function withoutBlankPages(entries) {
    return (Array.isArray(entries) ? entries : []).filter(e => !isBlankPage(e))
}

// The photo a blank page shows edge to edge, if it has one. It lives in
// the page's own style (`pageStyle.backgroundUrl`, set from the viewer's
// "תמונה על כל העמוד"), not in `imageUrl` — the blessings screen reads it
// from here so a blank page with a photo is recognisable in the list
// instead of an empty card.
export function blankPagePhoto(entry) {
    if (!isBlankPage(entry)) return null
    const url = entry && entry.pageStyle && entry.pageStyle.backgroundUrl
    return typeof url === 'string' && url.trim() ? url : null
}

// Move one item to a 0-based position in a list. Out-of-range targets
// clamp to the ends; an unknown id returns the list unchanged. Pure, so
// the screen and the tests agree on what "move to 5" means.
export function moveToIndex(list, id, target) {
    const from = list.findIndex(e => e && e.id === id)
    if (from < 0) return list
    const to = Math.max(0, Math.min(list.length - 1, Math.trunc(Number(target)) || 0))
    if (to === from) return list
    const out = list.slice()
    const [moved] = out.splice(from, 1)
    out.splice(to, 0, moved)
    return out
}
