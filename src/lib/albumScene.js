// src/lib/albumScene.js
//
// Composing a page as layers, the way a design file is built.
//
// albumLayout.js answers "where do the photographs go". This answers the
// larger question: what else is on the page, in what order, and how does
// each photograph meet the paper. The output is a flat, ordered list of
// LAYERS — paper, wash, ornaments, pictures, frames, overlays, type —
// each with resolved geometry and resolved style, and nothing left for
// the renderer to decide.
//
// That flatness is the point. The renderer becomes trivial, the print
// export renders the same list the screen did, and a page can be
// inspected in a test without a DOM.
//
// ── The no-crop rule, and the one honest exception ───────────────────
//
// A 9:16 photograph cannot fill a 1:1 page. There are exactly three
// outcomes — crop it, leave space, or extend the background — and no
// fourth. The album picks the third, and draws the distinction in code:
//
//   role 'primary'  the photograph the album is showing. Fitted inside
//                   its area, whole, always. Never cropped.
//   role 'ambient'  a SECOND, decorative copy of the same picture, or a
//                   wash built from its colour, behind the first. This
//                   one may be cropped, because it is scenery.
//
// The viewer still sees every pixel of the photograph. What fills the
// rest of the page is not a compromised version of it, it is a
// background derived from it — which is a design decision, not a
// concession.
//
// ── Why the wash and not a blur ──────────────────────────────────────
//
// The usual trick is a blurred enlargement. html2canvas cannot blur, so
// that page would look right on screen and print flat — see the note in
// albumTreatments.js. The wash is built from the photograph's own
// average colour, sampled once in the studio, and it prints exactly as
// it renders.

import { safeAspect, planAlbum, solveRow } from './albumLayout'
import { getLanguage } from './albumLanguages'
import { resolveTreatment, chooseTreatment, toneWash } from './albumTreatments'
import { ornamentUrl, rand, between } from './albumOrnaments'
import { planPage, SCORE_FLOOR } from './albumScoring'

/** Fit a photo inside a box, whole and centred. Never crops. */
export function containBox(box, aspect) {
    const a = safeAspect(aspect)
    let w = box.w
    let h = w / a
    if (h > box.h) {
        h = box.h
        w = h * a
    }
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

const areaToBox = (area, W, H) => ({ x: area[0] * W, y: area[1] * H, w: area[2] * W, h: area[3] * H })

/**
 * Build one page's layers from a recipe and its photographs.
 *
 * @param {object} recipe  from albumRecipes
 * @param {Array}  photos  [{ id, url, aspect, tone }]
 * @param {object} opts    { languageId, pageW, pageH, index, title }
 */
export function composeScene(recipe, photos, opts = {}) {
    const { languageId = 'editorial', pageW = 1000, pageH = 1000, index = 0, title = null } = opts
    const lang = getLanguage(languageId)
    const scale = pageW / 1000
    const layers = []
    // One seed per page: every wobble on this page is reproducible, and
    // page 7 never looks like page 3.
    const r = rand(index * 7919 + 13)

    // ── paper ────────────────────────────────────────────────────────
    layers.push({ type: 'paper', z: 0, style: { background: lang.paper } })

    if (lang.wallpaper) {
        const url = ornamentUrl(lang.wallpaper.name, {
            w: 400, h: 400, color: lang.ornamentColor, seed: lang.wallpaper.seedBase + index,
        })
        if (url) {
            layers.push({
                type: 'wallpaper', z: 1,
                style: { backgroundImage: `url("${url}")`, backgroundSize: 'cover', opacity: lang.wallpaper.opacity },
            })
        }
    }

    // ── ambient: the page washed in a photograph's own colour ────────
    if (recipe.ambient) {
        const src = photos[recipe.ambient.from] || photos[0]
        if (src) {
            layers.push({
                type: 'ambient', z: 2, role: 'ambient',
                style: { backgroundImage: toneWash(src.tone, lang.paper, 0.55) },
            })
        }
    }

    // ── ornaments the language actually owns ─────────────────────────
    for (const orn of recipe.ornaments || []) {
        if (!lang.ornaments.includes(orn.name)) continue
        // A passport stamp with nothing written on it is a circle. If the
        // album has no place name to put in it, it does not belong.
        if (orn.needsTitle && !title) continue
        const size = (orn.size || 0.12) * pageW
        const url = ornamentUrl(orn.name, {
            w: size, h: size * 0.32, size, color: lang.ornamentColor,
            seed: index * 31 + Math.round(orn.at[0] * 100),
            text: orn.text || (orn.needsTitle ? title : ''), sub: orn.sub || '',
        })
        if (!url) continue
        const h = orn.name === 'tape' ? size * 0.28 : orn.name === 'route' ? size * 0.42 : size
        layers.push({
            type: 'ornament', z: 3, name: orn.name, url,
            x: orn.at[0] * pageW - size / 2,
            y: orn.at[1] * pageH - h / 2,
            w: size, h,
            rotate: (orn.rotate || 0) * lang.rotationBudget + (orn.flip ? 180 : 0),
        })
    }

    // ── the photographs ──────────────────────────────────────────────
    // Slots that share a `row` are solved together with the justified row
    // equation instead of being contained one by one. Four photographs
    // each centred in its own equal box come out at four different
    // heights on four different baselines, which is exactly what a strip
    // along the foot of a page must not look like.
    const rowBoxes = solveRowGroups(recipe, photos, pageW, pageH)

    recipe.slots.forEach((slot, i) => {
        const photo = photos[i]
        if (!photo) return
        const allowed = (slot.treatments || ['plain']).filter(t => lang.treatments.includes(t))
        const kind = chooseTreatment(allowed.length ? allowed : ['plain'], photo.aspect, i)
        const t = resolveTreatment(kind, {
            paper: lang.paper, ink: lang.ink, accent: lang.accent, scale,
            fade: slot.fade || 'right', fadeDepth: slot.fadeDepth ?? 0.42,
        })

        // The frame is drawn around the photo, so the photo is fitted
        // into the area MINUS the frame — otherwise a framed picture
        // quietly grows past the region the recipe gave it.
        const pad = t.frame ? framePadding(t.frame, scale) : { x: 0, y: 0 }
        const area = areaToBox(slot.area, pageW, pageH)
        const inner = rowBoxes[i] || containBox(
            { x: area.x + pad.x, y: area.y + pad.y, w: Math.max(1, area.w - pad.x * 2), h: Math.max(1, area.h - pad.y * 2) },
            photo.aspect,
        )

        const [rMin, rMax] = slot.rotate || [0, 0]
        const rotate = (rMin === rMax ? rMin : between(r, rMin, rMax)) * lang.rotationBudget

        layers.push({
            // `z` is the PAINT order and a recipe may deliberately put a
            // later photograph under an earlier one. `slotIndex` keeps the
            // story order recoverable after the sort below — without it,
            // reading the layer list top to bottom silently reorders the
            // evening.
            type: 'photo', role: 'primary', z: 10 + (slot.z || 1), slotIndex: i,
            photo, treatment: kind, crops: t.crops,
            x: inner.x, y: inner.y, w: inner.w, h: inner.h,
            rotate,
            photoStyle: t.photo,
            frameStyle: t.frame,
            framePad: pad,
            overlays: t.overlays,
        })
    })

    // ── type ─────────────────────────────────────────────────────────
    if (recipe.title && title) {
        const sizeKey = recipe.title.size || 'medium'
        layers.push({
            type: 'title', z: 40, text: title,
            x: recipe.title.at[0] * pageW,
            y: recipe.title.at[1] * pageH,
            align: recipe.title.align || 'center',
            style: {
                fontFamily: lang.type.family,
                fontWeight: lang.type.weight,
                textTransform: lang.type.transform,
                letterSpacing: lang.type.letterSpacing,
                fontSize: `${(lang.type.sizes[sizeKey] / 100) * pageH}px`,
                color: lang.ink,
            },
        })
    }

    return { index, recipeId: recipe.id, layers: layers.sort((a, b) => a.z - b.z) }
}

/**
 * Place every `row` group with the justified equation: one shared
 * height, widths from the aspect ratios, filling the group's combined
 * width exactly. Returns a sparse map of slot index → box.
 */
export function solveRowGroups(recipe, photos, pageW, pageH) {
    const out = {}
    const groups = {}
    recipe.slots.forEach((slot, i) => {
        if (!slot.row) return
        ;(groups[slot.row] = groups[slot.row] || []).push(i)
    })
    for (const idx of Object.values(groups)) {
        const areas = idx.map(i => recipe.slots[i].area)
        const x0 = Math.min(...areas.map(a => a[0]))
        const x1 = Math.max(...areas.map(a => a[0] + a[2]))
        const y0 = Math.min(...areas.map(a => a[1]))
        const y1 = Math.max(...areas.map(a => a[1] + a[3]))
        const boxW = (x1 - x0) * pageW
        const boxH = (y1 - y0) * pageH
        // The gutter is whatever the recipe already left between the
        // boxes, so a row keeps the rhythm its author drew.
        const gaps = idx.length > 1
            ? (areas[1][0] - (areas[0][0] + areas[0][2])) * pageW
            : 0
        const gutter = Math.max(0, gaps)
        const aspects = idx.map(i => photos[i]?.aspect).filter(a => a != null)
        if (aspects.length !== idx.length) continue
        const { height, widths } = solveRow(aspects, boxW, gutter)
        const h = Math.min(height, boxH)
        const k = h / height
        const rowW = widths.reduce((a, b) => a + b * k, 0) + gutter * (idx.length - 1)
        let x = x0 * pageW + (boxW - rowW) / 2
        const y = y0 * pageH + (boxH - h) / 2
        idx.forEach((slotIndex, j) => {
            out[slotIndex] = { x, y, w: widths[j] * k, h }
            x += widths[j] * k + gutter
        })
    }
    return out
}

/** A frame's padding, read back off the style descriptor it produced. */
function framePadding(frameStyle, scale) {
    const p = String(frameStyle.padding || '0')
    const nums = p.match(/[\d.]+/g)?.map(Number) || [0]
    const top = nums[0] || 0
    const side = nums.length > 1 ? nums[1] : top
    void scale
    return { x: side, y: top }
}

/**
 * Plan a whole album as scenes.
 *
 * For each page the scorer proposes a rough. When nothing scores above
 * the floor — photographs too odd, or a group the library was never
 * drawn for — the page falls back to the justified engine, which can
 * lay out anything. That is the safety property: the designer can be
 * ambitious because it is allowed to decline.
 */
export function planAlbumScenes(photos, opts = {}) {
    const {
        languageId = 'editorial', pageW = 1000, pageH = 1000,
        title = null, titleOnFirstOnly = true,
    } = opts
    const lang = getLanguage(languageId)
    const queue = (Array.isArray(photos) ? photos : []).filter(p => p && p.url)
    const pageRatio = pageH / pageW
    const scenes = []
    const recent = []
    let i = 0
    let guard = 0

    while (i < queue.length && guard++ < 5000) {
        const rest = queue.slice(i)
        const best = planPage(rest, { pageRatio, recent, world: languageId })

        if (best && best.raw >= SCORE_FLOOR) {
            const group = rest.slice(0, best.take)
            scenes.push(composeScene(best.recipe, group, {
                languageId, pageW, pageH, index: scenes.length,
                title: !title ? null : titleOnFirstOnly ? (scenes.length === 0 ? title : null) : title,
            }))
            recent.push(best.recipe.id)
            if (recent.length > 3) recent.shift()
            i += best.take
            continue
        }

        // Nothing fits. Hand the next few photographs to the engine that
        // can arrange anything, and carry on.
        const chunk = rest.slice(0, Math.min(5, rest.length))
        const scene = fallbackScene(chunk, { languageId, pageW, pageH, index: scenes.length })
        scenes.push(scene)
        recent.push('__fallback')
        if (recent.length > 3) recent.shift()
        // Advance by what the fallback actually PLACED, not by what it
        // was offered. planAlbum may split five photographs over two
        // pages, and only the first becomes this scene — consuming all
        // five here is how photographs silently vanish from an album.
        i += scene.layers.filter(l => l.type === 'photo').length || chunk.length
    }

    void lang
    return scenes
}

/** A page from the justified engine, expressed as layers. */
export function fallbackScene(photos, opts = {}) {
    const { languageId = 'editorial', pageW = 1000, pageH = 1000, index = 0 } = opts
    const lang = getLanguage(languageId)
    const pages = planAlbum(photos, { pageW, pageH, margin: 9, gutter: 2.2, soloMargin: 7 })
    const items = pages[0]?.items || []
    const layers = [{ type: 'paper', z: 0, style: { background: lang.paper } }]
    items.forEach((it, k) => {
        layers.push({
            type: 'photo', role: 'primary', z: 10 + k, photo: it.photo, treatment: 'plain',
            crops: false, x: it.x, y: it.y, w: it.width, h: it.height,
            rotate: 0, photoStyle: {}, frameStyle: null, framePad: { x: 0, y: 0 }, overlays: [],
        })
    })
    return { index, recipeId: '__fallback', layers }
}
