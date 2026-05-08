// src/components/EntryPhoto/EntryPhoto.jsx
//
// Shared natural-aspect photo renderer for book layouts.
//
// Every layout (Polaroid, Scrapbook, Notebook, Collage, classic
// BookPageTemplate) used to inline the same <img> with maxWidth/
// maxHeight + objectFit:contain. When the cropping behaviour
// changed (e.g. switching from background-image:cover to a real
// <img> at natural aspect), we had to edit five files in parallel.
//
// This component is the single place that owns "how a guest photo
// is shown on a printed page." The behaviour locked in here:
//
//   • objectFit: contain   — never crops a photo, never distorts
//   • width: auto, height: auto inside max{Width,Height} — natural aspect
//   • display: block       — no inline whitespace artefacts under the image
//
// Layouts pass their slot's reserved dimensions via maxWidth/maxHeight;
// the photo renders at whatever native ratio it has, capped to those.
// Decoration around it (white mat, tape, ornaments) is the layout's job.

export default function EntryPhoto({
    src,
    maxWidth,
    maxHeight,
    style = {},
    className = '',
    alt = '',
}) {
    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={{
                maxWidth,
                maxHeight,
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
                ...style,
            }}
        />
    )
}
