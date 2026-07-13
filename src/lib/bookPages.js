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
 * @param {1|2}     [opts.entriesPerPage=1] — 2 = duo pages (two blessings
 *                  share one page; see DuoPageLayout). Duo ignores autoSplit:
 *                  the two features answer opposite goals (duo compresses,
 *                  split expands), so composition picks ONE.
 * @returns {Array} page objects (carry `_split: 'text' | 'photo'` on split
 *                  pages, `_duo: [a, b?]` on duo pages)
 */
export function expandBookPages(entries, opts = {}) {
    const list = Array.isArray(entries) ? entries : []
    const autoSplit = opts.autoSplit === true
    const threshold = Number.isFinite(opts.splitThreshold) ? opts.splitThreshold : DEFAULT_SPLIT_THRESHOLD
    // `padToSpread` keeps each split text→photo pair on ONE facing spread.
    // The flipbook groups the interior pages two-per-spread, so a split pair
    // must start on an EVEN index or it straddles two spreads (the photo ends
    // up facing the wrong blessing — "off by one"). When set, we drop a slim
    // divider leaf before a pair that would land on an odd index, and keep the
    // total interior count even so the covers stay single. Only meaningful for
    // the 2-up landscape flipbook — leave it off for single-page / print.
    const padToSpread = opts.padToSpread === true

    let padN = 0
    const divider = () => ({ id: `__divider_${padN++}`, _divider: true })

    // ── Duo composition — two blessings per page ─────────────────────
    // Entries pair up in order; an odd tail renders as a duo page with
    // a single (centered) block. Each duo page is ONE physical page, so
    // padToSpread only needs to even out the total count.
    if (opts.entriesPerPage === 2) {
        const pages = []
        for (let i = 0; i < list.length; i += 2) {
            const pair = [list[i], list[i + 1]]
                .filter(Boolean)
                .map(e => ({ ...e }))
            pages.push({ id: `__duo_${list[i]?.id || i}`, _duo: pair })
        }
        if (padToSpread && pages.length % 2 === 1) pages.push(divider())
        return pages
    }

    if (!autoSplit) return list.map(e => ({ ...e }))

    const pages = []
    for (const e of list) {
        const textLen = (e?.text || '').trim().length
        const hasImage = Boolean(e?.imageUrl)
        if (hasImage && textLen >= threshold) {
            // Align the pair to a fresh spread so the text + its photo face.
            if (padToSpread && pages.length % 2 === 1) pages.push(divider())
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
    // Even interior count → complete spreads + single covers.
    if (padToSpread && pages.length % 2 === 1) pages.push(divider())
    return pages
}

export { DEFAULT_SPLIT_THRESHOLD }
