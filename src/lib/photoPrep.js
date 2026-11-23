'use client'

// src/lib/photoPrep.js: reads a photo in the browser and turns it into a JPEG small enough to upload.
// Redrawing it on a canvas applies the camera's rotation and drops its metadata (location, device).

const MAX_EDGE = 1600
const MAX_BYTES = 3_500_000 // the upload route refuses 4MB; leave room for the form fields

/** Decode a file or blob to a bitmap with the camera's rotation applied. */
export async function readPhoto(file) {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch {
            /* fall through to the image element */
        }
    }
    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        await img.decode()
        return img
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }
}

export async function photoToJpeg(img, { maxEdge = MAX_EDGE, quality = 0.88 } = {}) {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const k = Math.min(1, maxEdge / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * k))
    canvas.height = Math.max(1, Math.round(h * k))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    let q = quality
    for (let i = 0; i < 5; i += 1) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q))
        if (blob && blob.size <= MAX_BYTES) return blob
        q -= 0.12
    }
    return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.5))
}
