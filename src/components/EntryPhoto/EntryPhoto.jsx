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
}) {
    // Default to EAGER loading per the user's request: in the digital
    // book, photos that lazy-loaded would only fetch when react-pageflip
    // brought the page into view — leaving a visible delay between
    // the flip animation completing and the photo appearing. The
    // /book/[token] route now ALSO preloads every entry photo at
    // mount via `new window.Image()` (see page.js), so by the time
    // a user reaches any page the photo is already cached.
    //
    // Callers that want to opt back into lazy loading (e.g. a future
    // archive view that lists hundreds of entries) can pass
    // eager={false}; the existing behavior is preserved.
    return (
        <img
            src={src}
            alt={alt}
            className={className}
            loading={eager ? 'eager' : 'lazy'}
            decoding='async'
            fetchpriority={eager ? 'high' : 'auto'}
            style={{
                width: maxWidth,
                height: maxHeight,
                objectFit: 'cover',
                objectPosition,
                display: 'block',
                ...style,
            }}
        />
    )
}
