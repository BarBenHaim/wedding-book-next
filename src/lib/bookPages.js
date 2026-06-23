// Shared book pagination: turns the raw entries list into the actual
// sequence of PAGES the book renders. Used by the viewer, the digital
// book, and every export so the page layout is identical everywhere.
//
// Smart split ("autoSplit"): a long blessing that shares a page with a
// photo ends up cramped + the body font shrinks to stay readable. When
// enabled, an entry whose blessing is long AND has a photo is split into
// TWO pages — a blessing-only page (centered, roomy) followed by a
// photo-only page (the photo big on its own). Short blessings stay on a
// single combined page. When disabled, it's the classic 1 page per entry.

const DEFAULT_SPLIT_THRESHOLD = 240 // blessing chars beyond which we split (with a photo)

/**
 * Expand entries into render-ready page objects (each shaped like an entry,
 * consumed by BookPageTemplate).
 *
 * @param {Array} entries
 * @param {object} [opts]
 * @param {boolean} [opts.autoSplit=false]
 * @param {number}  [opts.splitThreshold=240]
 * @returns {Array} page objects (carry `_split: 'text' | 'photo'` on split pages)
 */
export function expandBookPages(entries, opts = {}) {
    const list = Array.isArray(entries) ? entries : []
    const autoSplit = opts.autoSplit === true
    const threshold = Number.isFinite(opts.splitThreshold) ? opts.splitThreshold : DEFAULT_SPLIT_THRESHOLD

    if (!autoSplit) return list.map(e => ({ ...e }))

    const pages = []
    for (const e of list) {
        const textLen = (e?.text || '').trim().length
        const hasImage = Boolean(e?.imageUrl)
        if (hasImage && textLen >= threshold) {
            // 1) Blessing-only page — keep name + text, drop the photo so the
            //    blessing sits large and centered on its own page.
            pages.push({ ...e, imageUrl: null, _split: 'text' })
            // 2) Photo-only page — just the photo (big, on its own), carrying
            //    the same framing (focal point + rotation) the owner set.
            pages.push({
                id: `${e.id || 'entry'}__photo`,
                name: '',
                text: '',
                imageUrl: e.imageUrl,
                photoPosition: e.photoPosition,
                photoRotation: e.photoRotation,
                timestamp: e.timestamp,
                _split: 'photo',
            })
        } else {
            pages.push({ ...e })
        }
    }
    return pages
}

export { DEFAULT_SPLIT_THRESHOLD }
