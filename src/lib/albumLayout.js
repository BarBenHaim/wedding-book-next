// src/lib/albumLayout.js
//
// Composing an album page out of photographs nobody prepared.
//
// The blessing book solves an easier problem: one photo per page, in a
// slot the guest already cropped to 4:3. An album gets whatever people
// actually have — a panorama from a phone, a portrait from a camera, a
// square from Instagram, a screenshot — and has to put several of them
// on one page and make it look designed.
//
// ── The rule the whole file is built on ──────────────────────────────
//
// NOTHING IS CROPPED AND NOTHING IS STRETCHED. Every photo keeps its
// real aspect ratio. That is what makes the difference between an album
// and a template: a template forces the picture into a hole, an album
// arranges itself around the picture. The user's words for the thing to
// avoid were "not like Lupa" — and cropping to fit is exactly what that
// look is made of.
//
// The engine below therefore never scales x and y independently and
// never clips. It only ever solves for HEIGHTS, given widths.
//
// ── Justified rows, which is the actual idea ─────────────────────────
//
// Photographs of mixed shapes tile beautifully if you group them into
// rows and give every photo in a row the SAME HEIGHT. Widths then fall
// out of the aspect ratios, and one height per row makes the row fill
// the page exactly:
//
//     h = (contentWidth - gutters) / Σ aspect
//
// That single line is the whole trick. It is what Flickr and Google
// Photos use, and it is why their grids never look cropped: they are
// not solving a grid, they are solving one number per row.
//
// ── Why a page is not just a big justified grid ──────────────────────
//
// Because a book has rhythm and a wall of thumbnails does not. Six
// photos on every page for forty pages is a contact sheet. So pages are
// composed from a small set of COMPOSITIONS — a single photograph given
// the whole page, a quiet pair, a feature with two supporting shots, a
// justified cluster — and the planner alternates between them while
// reacting to what the next photos actually are. A panorama takes the
// page alone because anything else wastes it. Four portraits become one
// row, not two.
//
// Everything here is pure: same photos in, same album out, on the
// server, in the browser, and in the print export. That determinism is
// not tidiness — the printed PDF is rendered in a different pass from
// the screen preview, and the two must agree exactly.

// Photo shape: { id, url, aspect }  where aspect = width / height.

/** A missing or nonsense aspect becomes 3:2 — the commonest photo shape,
 *  and a safe neutral that never explodes a row. */
export function safeAspect(a) {
    const n = Number(a)
    if (!Number.isFinite(n) || n <= 0) return 1.5
    // Clamp the extremes. A 10:1 panorama in a row of four would squash
    // its neighbours to slivers; a 1:8 strip would blow the row height
    // past the page. Beyond these the photo is given its own row.
    return Math.min(Math.max(n, 0.25), 4)
}

export const LANDSCAPE = 'landscape'
export const PORTRAIT = 'portrait'
export const SQUARE = 'square'

export function orientation(aspect) {
    const a = safeAspect(aspect)
    if (a >= 1.2) return LANDSCAPE
    if (a <= 0.85) return PORTRAIT
    return SQUARE
}

/** A photo wide enough that sharing a row with anything wastes it. */
export function isPanorama(aspect) {
    return safeAspect(aspect) >= 2.2
}

export const DEFAULT_OPTS = {
    // Page box in abstract units. The renderer scales this to whatever
    // the screen or the print sheet needs; keeping the engine unitless
    // is what lets one plan drive both.
    pageW: 1000,
    pageH: 1000,
    margin: 8, // % of page width
    gutter: 2, // % of page width
    // A row is allowed to grow past its natural height by this much when
    // the page has room left. Without a cap a lone photo on a page would
    // inflate to fill it and lose all the air that makes an album feel
    // expensive.
    maxUpscale: 1.35,
    // A single photograph given the whole page usually wants more of it
    // than a cluster does. Presets that want a near-full-bleed opening
    // set this lower than `margin`; it is still a margin, because the
    // one thing this engine will not do is crop to the trim.
    soloMargin: null,
}

export function pageBox(opts = {}, kind = null) {
    const o = { ...DEFAULT_OPTS, ...opts }
    const pct = kind === 'solo' && Number.isFinite(o.soloMargin) ? o.soloMargin : o.margin
    const m = (pct / 100) * o.pageW
    return {
        left: m,
        top: m,
        width: o.pageW - m * 2,
        height: o.pageH - m * 2,
        gutter: (o.gutter / 100) * o.pageW,
    }
}

/**
 * Solve one row: every photo gets the same height, widths follow from
 * the aspect ratios, and the row fills `contentW` exactly.
 */
export function solveRow(aspects, contentW, gutter) {
    const list = aspects.map(safeAspect)
    if (!list.length) return { height: 0, widths: [] }
    const sum = list.reduce((a, b) => a + b, 0)
    const available = contentW - gutter * (list.length - 1)
    const height = available / sum
    return { height, widths: list.map(a => a * height) }
}

/**
 * Pack photos into rows, then solve the whole block to the page height.
 *
 * Two passes on purpose. The first decides WHO shares a row, using a
 * target height as the yardstick for "this row is full". The second
 * scales every row by one factor so the block lands on the page — which
 * keeps the relative sizes the first pass chose. Solving both at once
 * gives rows that fit but look arbitrary.
 */
/**
 * Split photos into R contiguous rows with roughly equal aspect sums.
 *
 * Contiguous on purpose: the order people uploaded their photos is the
 * order the evening happened in, and an album that reshuffles it to
 * make prettier rows tells the story wrong.
 */
export function splitBalanced(photos, rows) {
    const R = Math.max(1, Math.min(rows, photos.length))
    if (R === 1) return [photos.slice()]
    const total = photos.reduce((s, p) => s + safeAspect(p.aspect), 0)
    const per = total / R
    const out = []
    let cur = []
    let acc = 0
    for (let i = 0; i < photos.length; i++) {
        const a = safeAspect(photos[i].aspect)
        cur.push(photos[i])
        acc += a
        const rowsLeft = R - out.length - 1
        const photosLeft = photos.length - i - 1
        // Close the row once it has its share — unless closing would
        // leave a later row with nothing to put in it.
        if (out.length < R - 1 && acc >= per - a / 2 && photosLeft > rowsLeft - 1 && photosLeft >= rowsLeft) {
            out.push(cur)
            cur = []
            acc = 0
        }
    }
    if (cur.length) out.push(cur)
    while (out.length > R) {
        const last = out.pop()
        out[out.length - 1] = out[out.length - 1].concat(last)
    }
    return out
}

/**
 * Turn a row grouping into placed rectangles.
 *
 * Every row is justified to the full content width, which fixes its
 * height at (width - gutters) / Σ aspect. Those heights are not free
 * parameters, so the block either fits the page or it does not — and
 * when it does not, the whole block scales down together and is
 * centred. Scaling both axes by one factor is what keeps the promise:
 * a photo can end up smaller, never a different shape.
 */
export function layoutRows(rows, box) {
    const g = box.gutter
    const solved = rows.map(r => solveRow(r.map(p => p.aspect), box.width, g))
    const total = solved.reduce((h, r) => h + r.height, 0) + g * (rows.length - 1)
    const scale = total > box.height ? box.height / total : 1
    const blockH = total * scale
    let y = box.top + (box.height - blockH) / 2

    const out = []
    solved.forEach((r, i) => {
        const h = r.height * scale
        const widths = r.widths.map(w => w * scale)
        const rowW = widths.reduce((a, b) => a + b, 0) + g * scale * (widths.length - 1)
        let x = box.left + (box.width - rowW) / 2
        rows[i].forEach((p, j) => {
            out.push({ photo: p, x, y, width: widths[j], height: h })
            x += widths[j] + g * scale
        })
        y += h + g * scale
    })
    return out
}

/**
 * Justified cluster: pick the row count that fills the page best.
 *
 * More rows means shorter rows means a taller block, so total height
 * grows with the row count. The best page is therefore the largest row
 * count that still fits — found by trying them, which for four
 * candidates is honest and instant, and avoids a solver whose behaviour
 * nobody could predict from reading it.
 */
export function justifiedBlock(photos, box) {
    const g = box.gutter
    const maxRows = Math.min(4, photos.length)
    let best = null
    for (let R = 1; R <= maxRows; R++) {
        const rows = splitBalanced(photos, R)
        if (rows.length !== R) continue
        const solved = rows.map(r => solveRow(r.map(p => p.aspect), box.width, g))
        const total = solved.reduce((h, r) => h + r.height, 0) + g * (R - 1)
        if (total <= box.height && (!best || total > best.total)) best = { rows, total }
    }
    // Nothing fit — the photos are so tall that even one row overflows.
    // layoutRows scales that case down and centres it.
    const rows = best ? best.rows : splitBalanced(photos, 1)
    return layoutRows(rows, box)
}

/** One photograph, given the page, at its own shape. */
export function soloBlock(photos, box) {
    const p = photos[0]
    if (!p) return []
    const a = safeAspect(p.aspect)
    let w = box.width
    let h = w / a
    if (h > box.height) {
        h = box.height
        w = h * a
    }
    return [{
        photo: p,
        x: box.left + (box.width - w) / 2,
        y: box.top + (box.height - h) / 2,
        width: w,
        height: h,
    }]
}

/**
 * Two photographs, as a deliberate pair rather than a short grid.
 *
 * Two landscapes stack, because side by side they would each be half a
 * page wide and an inch tall. Everything else sits side by side on one
 * justified row, which gives them a shared height and a shared baseline
 * — the thing that makes a pair read as a pair.
 */
export function pairBlock(photos, box) {
    if (photos.length < 2) return soloBlock(photos, box)
    const [a, b] = photos
    const bothWide = orientation(a.aspect) === LANDSCAPE && orientation(b.aspect) === LANDSCAPE
    if (!bothWide) return layoutRows([[a, b]], box)
    // Two landscapes, stacked. Their combined natural height is far more
    // than a page of equal margins allows, so layoutRows would shrink
    // them to a pair of postage stamps floating in white. The side
    // margin is the one the eye reads as the page's margin; the top and
    // bottom can give way. So this composition — and only this one —
    // borrows vertical space back.
    // Borrowed, not taken: never more than about half the top margin, so
    // a stacked pair still sits ON a page instead of running off it.
    // Without the clamp the block reaches the trim, and a photograph
    // touching the trim on a bound album is a photograph with its edge
    // in the gutter or under the knife.
    const relief = Math.min(box.height * 0.07, box.top * 0.55)
    const tall = { ...box, top: box.top - relief, height: box.height + relief * 2 }
    return layoutRows([[a], [b]], tall)
}

/**
 * One large photograph with a column of two beside it.
 *
 * The hero keeps its own shape, so the column's height is measured
 * against it rather than assumed. A fixed two-thirds split would put a
 * portrait hero next to a stack of landscapes and leave a hole.
 */
export function featureBlock(photos, box) {
    if (photos.length < 3) return pairBlock(photos, box)
    const g = box.gutter
    const [hero, s1, s2] = photos

    const heroW = (box.width - g) * 0.62
    const colW = box.width - g - heroW
    const heroH = heroW / safeAspect(hero.aspect)
    const colHs = [s1, s2].map(p => colW / safeAspect(p.aspect))
    const colH = colHs[0] + colHs[1] + g
    const blockH = Math.max(heroH, colH)
    const scale = blockH > box.height ? box.height / blockH : 1
    const top = box.top + (box.height - blockH * scale) / 2

    const out = [{
        photo: hero,
        x: box.left,
        y: top + ((blockH - heroH) / 2) * scale,
        width: heroW * scale,
        height: heroH * scale,
    }]
    let y = top + ((blockH - colH) / 2) * scale
    ;[s1, s2].forEach((p, i) => {
        const h = colHs[i] * scale
        out.push({ photo: p, x: box.left + (heroW + g) * scale, y, width: colW * scale, height: h })
        y += h + g * scale
    })
    return out
}

// ── The rhythm ───────────────────────────────────────────────────────
//
// A fixed cycle rather than randomness. Randomness produces the one
// thing an album must not have: a page you cannot reproduce. The same
// photos must plan identically on the screen, in the PDF and next week.
const RHYTHM = ['solo', 'justified', 'pair', 'justified', 'feature', 'justified', 'pair', 'justified']

const CAPACITY = { solo: 1, pair: 2, feature: 3, justified: 6 }

/**
 * Which composition suits the photos at the head of the queue.
 *
 * The rhythm proposes and the photographs dispose: a panorama always
 * takes the page alone, and a composition is skipped when there are not
 * enough photos left to fill it honestly.
 */
export function chooseComposition(queue, beat, opts = {}) {
    if (!queue.length) return null
    if (isPanorama(queue[0].aspect)) return 'solo'
    // Endgame. Two photos left should be a pair and three should be a
    // feature, whatever the rhythm wanted — an album that finishes on a
    // single stranded photograph reads as having run out rather than
    // having ended.
    if (queue.length === 2) return 'pair'
    if (queue.length === 3) return 'feature'
    if (queue.length === 4) return 'justified'
    const proposed = RHYTHM[beat % RHYTHM.length]
    if (queue.length < CAPACITY[proposed]) {
        // Not enough left. Fall back to the largest composition that
        // fits rather than padding a page with air.
        if (queue.length >= 3) return 'feature'
        if (queue.length === 2) return 'pair'
        return 'solo'
    }
    if (proposed === 'pair') {
        // Two photos of different orientations side by side leaves a
        // step in the page. Send a mixed couple to the justified packer,
        // which handles unequal shapes as a matter of course.
        const [a, b] = queue
        if (orientation(a.aspect) !== orientation(b.aspect) && queue.length >= 4) return 'justified'
    }
    return proposed
}

/** The composition that suits a chunk of exactly this many photos. */
export function kindForCount(n) {
    if (n <= 1) return 'solo'
    if (n === 2) return 'pair'
    if (n === 3) return 'feature'
    return 'justified'
}

/** How many photos a composition takes from the queue. */
export function takeCount(kind, queue) {
    if (kind === 'justified') {
        // Prefer 4 or 5 over 6: a page of six is where a cluster starts
        // reading as a contact sheet. Never leave one photo stranded.
        const n = Math.min(queue.length, 5)
        const left = queue.length - n
        return left === 1 ? n + 1 : n
    }
    return Math.min(CAPACITY[kind], queue.length)
}

/**
 * Plan a whole album.
 *
 * @returns {Array<{index, kind, items:[{photo,x,y,width,height}]}>}
 */
export function planAlbum(photos, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts }
    const box = pageBox(o)
    const soloBox = pageBox(o, 'solo')
    const queue = (Array.isArray(photos) ? photos : []).filter(p => p && p.url)
    const pages = []
    let i = 0
    let beat = 0
    let guard = 0
    while (i < queue.length && guard++ < 10000) {
        const rest = queue.slice(i)
        let kind = chooseComposition(rest, beat, o)
        if (!kind) break
        let take = takeCount(kind, rest)
        // A panorama anywhere in the chunk, not just at its head, ends
        // the chunk before itself. Sharing a row with a 3:1 photograph
        // reduces everything beside it to a sliver, and the panorama
        // itself to a stripe — so it waits and gets the next page whole.
        const panoAt = rest.findIndex((p, k) => k > 0 && isPanorama(p.aspect))
        if (panoAt > 0 && panoAt < take) {
            take = panoAt
            kind = kindForCount(take)
        }
        const chunk = rest.slice(0, take)
        const items =
            kind === 'solo' ? soloBlock(chunk, soloBox)
            : kind === 'pair' ? pairBlock(chunk, box)
            : kind === 'feature' ? featureBlock(chunk, box)
            : justifiedBlock(chunk, box)
        pages.push({ index: pages.length, kind, items })
        i += take
        beat += 1
    }
    return pages
}

/** Pages grouped into facing spreads, for the print exporters. */
export function toSpreads(pages) {
    const out = []
    for (let i = 0; i < pages.length; i += 2) {
        out.push({ left: pages[i] || null, right: pages[i + 1] || null })
    }
    return out
}
