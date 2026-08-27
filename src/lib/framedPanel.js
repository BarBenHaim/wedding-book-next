// src/lib/framedPanel.js
//
// Putting a form exactly inside a panel that lives in a photograph.
//
// The previous approach was to TUNE the content until it happened to fit
// — pick a font size, pick a textarea height, measure on three phones,
// ship. That works on the three phones. It fails on the fourth, and it
// fails the moment a super-admin's 2600-character limit makes the box
// taller, and its failure modes are the two worst ones available: an
// inner scrollbar, or a form hanging out of the frame.
//
// This computes the panel's real rectangle instead, and scales the form
// to it. The form is authored once at a fixed design width and then
// drawn at whatever size the panel actually is. There is nothing left to
// tune and nothing left to overflow: at any viewport, on any device, the
// form is exactly as big as the acrylic in front of it.
//
// Two facts make the rectangle computable:
//   • the background is `cover`, whose scaling rule is fully determined
//     by the viewport and the asset's aspect;
//   • the panel's rails were measured off the asset as percentages.
//
// Percentages of the ASSET, not of the viewport — that distinction is
// the whole reason this holds when `cover` crops.

/**
 * Where the panel is on screen, in CSS pixels.
 *
 * `cover` scales the asset by whichever axis needs more, then centres
 * it, so part of it hangs outside the viewport. The panel goes with it —
 * which is exactly why a form positioned in viewport percentages drifts
 * off the rails on every aspect the numbers were not measured at.
 */
export function panelRect({ viewportW, viewportH, assetW, assetH, rails } = {}) {
    const vw = Number(viewportW)
    const vh = Number(viewportH)
    const aw = Number(assetW)
    const ah = Number(assetH)
    if (!(vw > 0) || !(vh > 0) || !(aw > 0) || !(ah > 0) || !rails) return null

    const top = Number(rails.top)
    const bottom = Number(rails.bottom)
    const left = Number(rails.left)
    const right = Number(rails.right)
    if (![top, bottom, left, right].every(Number.isFinite)) return null
    if (bottom <= top || right <= left) return null

    const scale = Math.max(vw / aw, vh / ah)
    const dispW = aw * scale
    const dispH = ah * scale
    const offX = (vw - dispW) / 2
    const offY = (vh - dispH) / 2

    const rect = {
        left: offX + (dispW * left) / 100,
        top: offY + (dispH * top) / 100,
        width: (dispW * (right - left)) / 100,
        height: (dispH * (bottom - top)) / 100,
    }

    // The part of the panel that is actually ON SCREEN.
    //
    // `cover` pushes the rest of the asset outside the viewport, and in
    // landscape it pushes most of the panel out: the rails end up at
    // -338 and 743 on an 844×390 window. Fitting a form to the panel's
    // full height there produces a form taller than the window, sitting
    // perfectly inside rails nobody can see. Everything downstream —
    // where to centre, how much to scale — uses this instead.
    const vLeft = Math.max(0, rect.left)
    const vTop = Math.max(0, rect.top)
    const vRight = Math.min(vw, rect.left + rect.width)
    const vBottom = Math.min(vh, rect.top + rect.height)
    rect.visible = {
        left: vLeft,
        top: vTop,
        width: Math.max(0, vRight - vLeft),
        height: Math.max(0, vBottom - vTop),
    }
    return rect
}

/**
 * How much to shrink a form of known natural size to sit inside a panel.
 *
 * Never above 1: scaling type UP past its design size is how a layout
 * starts looking like a poster of itself on a tablet. Below, it is free
 * to go as small as the panel demands, because the alternative is the
 * form leaving the frame — and a small form inside the acrylic reads as
 * design, while a big one crossing the rails reads as broken.
 */
export function fitScale({ panelW, panelH, padPct = 6, designW, contentH, minScale = 0.55 } = {}) {
    const pw = Number(panelW)
    const ph = Number(panelH)
    const dw = Number(designW)
    const ch = Number(contentH)
    if (!(pw > 0) || !(ph > 0) || !(dw > 0)) return null

    const pad = (Math.min(pw, ph) * (Number.isFinite(padPct) ? padPct : 6)) / 100
    const innerW = Math.max(1, pw - 2 * pad)
    const innerH = Math.max(1, ph - 2 * pad)

    const byWidth = innerW / dw
    // Before the content has been measured, width alone decides. The
    // height term arrives on the next frame and can only shrink it.
    const byHeight = ch > 0 ? innerH / ch : Infinity

    const raw = Math.min(byWidth, byHeight, 1)
    return {
        scale: Math.max(minScale, raw),
        // True when even the floor was not enough — the caller can let
        // the panel breathe rather than pretending everything fitted.
        clamped: raw < minScale,
        pad,
        innerW,
        innerH,
    }
}

export default { panelRect, fitScale }
