'use client'

// Shared no-crop ("album") slot sizing.
//
// Every book layout reserves a photo slot that is 4:3 by default — the
// aspect the guest cropper enforces, and what makes a book of 30 pages
// read as one uniform product. When a wedding has the no-crop toggle on
// (`weddings/{id}.noPhotoCrop` → styleSettings.photoFit === 'contain'),
// the slot instead follows each photo's real shape, so a portrait photo
// gets a portrait slot and nothing is cut off.
//
// The math lives here rather than in each layout so the classic
// template, the four alternate layouts (polaroid / scrapbook / notebook
// / collage) and the duo page all size photos identically — which is
// what keeps the html2canvas print export matching the screen.

import useImageAspect from './useImageAspect'

/**
 * Pure slot geometry. Returns the box a photo should occupy.
 *
 * @param {number}      width       the width the layout allotted (px)
 * @param {number|null} aspect      resolved photo aspect (w/h), or null
 * @param {number}      rotation    0 | 90 | 180 | 270
 * @param {number|null} maxHeight   cap before the box scales down
 * @param {number}      coverRatio  height/width of the crop slot (0.75 = 4:3)
 * @param {boolean}     noCrop      false → the classic fixed slot
 */
export function noCropBox({ width, aspect, rotation = 0, maxHeight = null, coverRatio = 0.75, noCrop = false }) {
    if (!noCrop) return { width, height: width * coverRatio }
    // A quarter-turn swaps the photo's visible orientation, so the slot
    // has to invert with it — otherwise a rotated portrait gets a
    // landscape box and the bars come back.
    const rot = (((Number(rotation) || 0) % 360) + 360) % 360
    const a = Number(aspect) > 0 ? (rot === 90 || rot === 270 ? 1 / Number(aspect) : Number(aspect)) : null
    // Aspect not known yet (legacy photo still being measured): keep a
    // slightly tall box. `contain` means nothing is cropped either way —
    // this only affects how much empty space shows for one frame.
    if (!a) return { width, height: width * 1.15 }
    let h = width / a
    let wOut = width
    if (Number.isFinite(maxHeight) && maxHeight > 0 && h > maxHeight) {
        h = maxHeight
        wOut = h * a
    }
    return { width: wOut, height: h }
}

/**
 * Hook form: resolves the entry's aspect (stored, else measured for
 * legacy photos) and returns the slot box plus the object-fit to use.
 *
 * Layouts call this at the top level of their component body.
 */
export default function useNoCropSlot({ styleSettings, entry, width, maxHeight = null, coverRatio = 0.75 }) {
    const noCrop = (styleSettings?.photoFit ?? 'cover') === 'contain'
    const aspect = useImageAspect(entry?.imageUrl || null, entry?.imgAspect, noCrop)
    const box = noCropBox({
        width,
        aspect,
        rotation: entry?.photoRotation || 0,
        maxHeight,
        coverRatio,
        noCrop,
    })
    return { ...box, fit: noCrop ? 'contain' : 'cover' }
}
