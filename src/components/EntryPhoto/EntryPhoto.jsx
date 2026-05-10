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
    eager = false,
}) {
    // loading="lazy" + decoding="async" let the browser defer the
    // photo request until react-pageflip's transform brings the
    // page into (or near) the viewport, instead of firing N
    // simultaneous fetches when every entry mounts up-front. With
    // weddings carrying 50+ entries each at ~1 MB after compression,
    // this is the difference between ~75 MB on first paint and ~2 MB.
    //
    // The `eager` prop lets a parent opt out for the first-visible
    // page so the open-the-book impression isn't a blank photo slot.
    // No caller passes it today — react-pageflip preloads adjacent
    // spreads aggressively enough that the visible page lands
    // before the user perceives the gap.
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
                objectPosition: 'center',
                display: 'block',
                ...style,
            }}
        />
    )
}
