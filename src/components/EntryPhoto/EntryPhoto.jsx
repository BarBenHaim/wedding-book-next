// src/components/EntryPhoto/EntryPhoto.jsx
//
// Shared photo renderer for book layouts (Polaroid, Scrapbook,
// Notebook, Collage, classic BookPageTemplate).
//
// Fills the slot exactly (width: maxWidth, height: maxHeight) and
// objectFit: cover so every page reads as a uniform entry. Rendering
// goes through <SmartImg>, which auto-retries transient load failures
// and, if a photo ultimately can't load, shows a soft cream slot
// instead of the browser's broken-image icon.
import SmartImg from '../SmartImg/SmartImg'

export default function EntryPhoto({
    src,
    maxWidth,
    maxHeight,
    style = {},
    className = '',
    alt = '',
    eager = true,
}) {
    const imgStyle = {
        width: maxWidth,
        height: maxHeight,
        objectFit: 'cover',
        objectPosition: 'center',
        display: 'block',
        ...style,
    }
    const fallback = (
        <div
            className={className}
            aria-hidden='true'
            style={{ ...imgStyle, background: 'linear-gradient(135deg,#f3ece0 0%,#e9e0cf 100%)' }}
        />
    )
    return (
        <SmartImg
            src={src}
            alt={alt}
            className={className}
            loading={eager ? 'eager' : 'lazy'}
            decoding='async'
            fetchpriority={eager ? 'high' : 'auto'}
            style={imgStyle}
            fallback={fallback}
        />
    )
}
