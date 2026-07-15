// src/lib/coverPhotoBake.js
//
// Turn an uploaded photo into a cover-ready PNG whose EDGES FADE TO
// TRANSPARENT, so it melts into whatever cover background the event
// uses (like a professionally-composited cover: the child/couple in
// the middle, the artwork breathing around them).
//
// Why bake the fade INTO the pixels (alpha) instead of a CSS mask on
// the renderer:
//   1. One asset renders identically EVERYWHERE — wizard preview,
//      viewer, digital book, and the html2canvas print/export
//      pipeline (html2canvas does not support CSS mask-image; a
//      runtime mask would print with hard edges).
//   2. Zero changes to BookCoverTemplate: it already renders
//      styleSettings.coverImage centered with scale/position knobs.
//
// Client-only (uses <canvas>); call from a browser event handler.

const MAX_EDGE = 1000 // px — plenty for on-screen + print covers
const MAX_BYTES = 2_400_000 // guard for the create-event JSON payload

// fadeStart: 0..1 — how far from the center (as a fraction of the
// half-diagonal) the photo stays fully opaque before the fade begins.
export async function bakeCoverPhoto(file, { fadeStart = 0.55 } = {}) {
    const dataUrl = await readAsDataURL(file)
    const img = await loadImage(dataUrl)

    // Downscale to MAX_EDGE on the long side (keeps aspect).
    const ratio = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * ratio))
    const h = Math.max(1, Math.round(img.height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)

    // Elliptical alpha fade: erase progressively toward the edges.
    // The circular gradient is drawn in a scaled coordinate space so
    // it becomes an ellipse matching the photo's aspect — corners
    // reach full transparency, the center stays untouched.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.scale(w / 2, h / 2) // unit circle now spans the full photo
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(Math.min(0.95, Math.max(0, fadeStart)), 'rgba(0,0,0,0)')
    g.addColorStop(0.86, 'rgba(0,0,0,0.55)')
    g.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = g
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
    ctx.globalCompositeOperation = 'source-over'

    // PNG keeps the alpha. If the result is too heavy for the create
    // payload, shrink once and retry — faces stay sharp at 760px too.
    let out = canvas.toDataURL('image/png')
    if (out.length > MAX_BYTES) {
        const s = document.createElement('canvas')
        const k = 760 / Math.max(w, h)
        s.width = Math.max(1, Math.round(w * Math.min(1, k)))
        s.height = Math.max(1, Math.round(h * Math.min(1, k)))
        s.getContext('2d').drawImage(canvas, 0, 0, s.width, s.height)
        out = s.toDataURL('image/png')
    }
    return out
}

function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('read failed'))
        r.readAsDataURL(file)
    })
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('image decode failed'))
        img.src = src
    })
}
