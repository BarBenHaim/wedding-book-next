// src/lib/fullPhoto.js
//
// "The whole photo goes into the book."
//
// By default a guest who picks a photo from the gallery frames it in a
// 4:3 cropper and we upload only the framed part — every page of the
// book then carries a photo of the same shape. An event with the
// "אל תחתוך תמונות" switch on (`weddings/{id}.noPhotoCrop`) is the
// opposite promise: the book shows each photo whole, in its own shape
// (see src/lib/photoSlot.js). Until 11.11.2026 the guest page ignored
// that switch and cropped anyway, so the book had nothing but 4:3
// photos to show "whole". With the switch on, the guest page now skips
// the cropper and uploads the entire picture.
//
// Pure geometry only — the page does the canvas work.

// Longest edge we keep, in pixels. The printed page is 21cm; at 300dpi
// that is 2480px, so nothing the printer can use is thrown away, and a
// 12-megapixel phone photo stops being a 6MB upload on venue Wi-Fi.
export const FULL_PHOTO_MAX_EDGE = 2400

/** Does this event keep photos whole? */
export function keepsWholePhoto(wedding) {
    return wedding?.noPhotoCrop === true
}

/**
 * The part of the picture to keep and the size to save it at.
 *
 * `crop` is the cropper's pixel box ({x, y, width, height}) — used as is
 * when the event crops. When the event keeps photos whole the box is the
 * entire picture, scaled down only if it is larger than the printer can
 * use. Returns null when there is nothing sane to draw.
 *
 * → { sx, sy, sw, sh, width, height }
 */
export function photoDrawPlan({ wholePhoto, naturalWidth, naturalHeight, crop, maxEdge = FULL_PHOTO_MAX_EDGE }) {
    if (wholePhoto) {
        const w = Math.floor(Number(naturalWidth))
        const h = Math.floor(Number(naturalHeight))
        if (!(w >= 1) || !(h >= 1)) return null
        const scale = Math.min(1, maxEdge / Math.max(w, h))
        return { sx: 0, sy: 0, sw: w, sh: h, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
    }
    const cw = Number(crop?.width)
    const ch = Number(crop?.height)
    if (!(cw >= 1) || !(ch >= 1)) return null
    return { sx: Number(crop.x) || 0, sy: Number(crop.y) || 0, sw: cw, sh: ch, width: cw, height: ch }
}
