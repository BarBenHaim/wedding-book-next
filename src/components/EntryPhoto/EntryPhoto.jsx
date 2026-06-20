// src/components/EntryPhoto/EntryPhoto.jsx
//
// Shared photo renderer for book layouts (Polaroid, Scrapbook,
// Notebook, Collage, classic BookPageTemplate).
//
// Behaviour:
//   • Fills the slot exactly (width: maxWidth, height: maxHeight)
//   • objectFit: cover  — crops the photo to the container's
//     aspect ratio so EVERY page in the book shows photos at
//     consistent 4:3 (or whatever the layout's slot defines).
//
// Why cover, not contain?
//   The book is a uniform product. A reader flipping through 30
//   pages where some are landscape and others are portrait with
//   cream margins reads as inconsistent / amateur. The cropper in
//   /photo already enforces 4:3 for every NEW upload, so the only
//   photos that get cropped here are LEGACY uploads that never
//   went through the cropper. For those, a small crop is the
//   lesser evil vs. a "shrunken portrait floating in cream space".
//
// The cropper itself stays 4:3 — guests still get a cropping UX
// before submitting, so what they see in the book is exactly what
// they framed.

export default function EntryPhoto({
    src,
    maxWidth,
    maxHeight,
    style = {},
    className = '',
    alt = '',
    eager = true,
    // Focal point for the cover-crop, as a CSS object-position value
    // (e.g. "50% 30%"). Set per-entry from the admin "frame photo"
    // editor (entry.photoPosition) so the owner can re-center a photo
    // that got cropped badly. Defaults to 'center' — unchanged behavior
    // for every entry that was never re-framed.
    objectPosition = 'center',
    // Quarter-turn rotation in degrees (0 | 90 | 180 | 270), set from the
    // admin "rotate photo" control (entry.photoRotation) for guests who
    // uploaded a sideways/upside-down photo. Defaults to 0.
    rotation = 0,
}) {
    // The slot is ALWAYS maxWidth×maxHeight in layout (a wrapper reserves
    // it) so rotating the photo never shifts the text/name below it. The
    // photo is absolutely centred inside and fills the slot via
    // object-fit:cover. For 90°/270° the photo's pre-rotation dimensions
    // are swapped so that AFTER rotation it still covers the slot exactly
    // (no cream bars). For 0°/180° this is identical to the old behaviour.
    const rot = (((Number(rotation) || 0) % 360) + 360) % 360
    const swapped = rot === 90 || rot === 270
    const imgW = swapped ? maxHeight : maxWidth
    const imgH = swapped ? maxWidth : maxHeight

    // Default to EAGER loading: in the digital book, lazy-loaded photos
    // would only fetch once react-pageflip brought the page into view,
    // leaving a visible delay. /book/[token] also preloads every entry
    // photo at mount, so by the time a user reaches a page it's cached.
    return (
        <div
            className={className}
            style={{
                width: maxWidth,
                height: maxHeight,
                position: 'relative',
                overflow: 'hidden',
                display: 'block',
                // Caller styles (borderRadius, margins, alignSelf, boxShadow,
                // zIndex, border…) apply to the slot wrapper. overflow:hidden
                // means a borderRadius here clips the photo to rounded corners.
                ...style,
            }}
        >
            <img
                src={src}
                alt={alt}
                loading={eager ? 'eager' : 'lazy'}
                decoding='async'
                fetchpriority={eager ? 'high' : 'auto'}
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: imgW,
                    height: imgH,
                    objectFit: 'cover',
                    objectPosition,
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    transformOrigin: 'center center',
                    display: 'block',
                }}
            />
        </div>
    )
}
