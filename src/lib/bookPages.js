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
    // Physical-binding parity shift. 0 (default): spreads are page-pairs
    // (0,1),(2,3)… — the flipbook and WOW's 2-up spread files. 1: page 1
    // stands ALONE facing the inner cover (typical square print albums),
    // so spreads are (1,2),(3,4)… and a facing pair must start on an ODD
    // 0-based index. The exporters expose this as an operator toggle.
    const spreadOffset = opts.spreadOffset === 1 ? 1 : 0
    const onSpreadStart = len => (len + spreadOffset) % 2 === 0

    let padN = 0
    const divider = () => ({ id: `__divider_${padN++}`, _divider: true })

    // ── Smart photo layout (albums) ──────────────────────────────────
    // photoLayout 'smart': photo-only entries compose by their measured
    // aspect (imgAspect, captured at upload). Landscape → a full-width
    // page of its own; two consecutive portraits → ONE side-by-side pair
    // page (nothing cropped — two verticals fill a square page naturally);
    // a lone portrait → a tall centered page; square → classic centered.
    // Entries WITH text/name flow through untouched. Pair order flips on
    // every pair (deterministic rhythm) so spreads feel designed, not
    // templated. Photos without a stored aspect keep today's behavior.
    if (opts.photoLayout === 'smart') {
        const out = []
        const isPhotoOnly = e => Boolean(e?.imageUrl) && !(e?.text || '').trim() && !(e?.name || '').trim()
        const aspectOf = e => (Number(e?.imgAspect) > 0 ? Number(e.imgAspect) : null)
        const kindOf = e => {
            const a = aspectOf(e)
            if (!a) return 'unknown'
            if (a < 0.9) return 'portrait'
            if (a > 1.15) return 'landscape'
            return 'square'
        }
        let flip = false
        let i = 0
        while (i < list.length) {
            const e = list[i]
            if (!isPhotoOnly(e)) { out.push({ ...e }); i++; continue }
            const k = kindOf(e)
            // No stored aspect (legacy photo) → true passthrough, exactly
            // today's behavior — no composition guess.
            if (k === 'unknown') { out.push({ ...e }); i++; continue }
            if (k === 'portrait') {
                const next = list[i + 1]
                if (next && isPhotoOnly(next) && kindOf(next) === 'portrait') {
                    const pair = (flip ? [next, e] : [e, next]).map(x => ({ ...x }))
                    flip = !flip
                    out.push({ id: `__pair_${e.id || i}`, _photoPair: pair })
                    i += 2
                    continue
                }
                out.push({ ...e, _photo: 'tall' })
                i++
                continue
            }
            out.push({ ...e, _photo: k === 'landscape' ? 'wide' : 'square' })
            i++
        }
        if (padToSpread && !onSpreadStart(out.length)) out.push(divider())
        return out
    }

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
        if (padToSpread && !onSpreadStart(pages.length)) pages.push(divider())
        return pages
    }

    // Per-entry manual split (entry.forceSplit) works even when the
    // global autoSplit is OFF — the fast path only applies when nothing
    // in the list asks to split (bit-identical output to the old code).
    const anyForced = list.some(e => e?.forceSplit === true && e?.imageUrl)
    if (!autoSplit && !anyForced) return list.map(e => ({ ...e }))

    const pages = []
    for (const e of list) {
        const textLen = (e?.text || '').trim().length
        const hasImage = Boolean(e?.imageUrl)
        const wantsSplit = e?.forceSplit === true || (autoSplit && textLen >= threshold)
        if (hasImage && wantsSplit) {
            // Align the pair to a fresh spread so the text + its photo face.
            if (padToSpread && !onSpreadStart(pages.length)) pages.push(divider())
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
                // Carry the measured aspect too — without it a split photo
                // page had no shape to size its slot from, so a no-crop
                // book letterboxed exactly the pages that show the photo
                // largest.
                imgAspect: e.imgAspect,
                timestamp: e.timestamp,
                // The per-page design override travels with the photo
                // half too. Without this line, splitting a page silently
                // reverted the operator's work on exactly the half they
                // were tuning - the photo one.
                pageStyle: e.pageStyle,
                _split: 'photo',
            })
        } else {
            pages.push({ ...e })
        }
    }
    // Complete spreads (respecting the binding offset) → no dangling half.
    if (padToSpread && !onSpreadStart(pages.length)) pages.push(divider())
    return pages
}

export { DEFAULT_SPLIT_THRESHOLD }
