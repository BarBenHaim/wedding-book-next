'use client'

// PolaroidPageLayout
//
// Production polaroid layout for the wedding book. Used by BookPageTemplate
// when styleSettings.template === 'polaroid'. Lives at the same scope as
// BookPageTemplate so the live viewer, the live print PDF, and the auto-
// export PDF all render it consistently.
//
// Design intent:
//   • Photo in a thick white mat (Polaroid-style — extra-thick at the
//     bottom), tilted -2.5°. Photo aspect is ALWAYS 4:3 — no crop ever.
//   • Blessing in the page's chosen font (handwritten by default), centered
//     below the polaroid.
//   • Guest name + small gold heart at the very bottom — the "memory book"
//     signature motif.
//
// Respects styleSettings:
//   - backgroundColor — page background (when no texture)
//   - texture          — page background-image (e.g. ornate gold frame)
//   - fontClass        — font for both blessing and name (typically
//                        gveretLevin for the polaroid character)
//   - fontColor        — main text color
//   - frame            — overlay PNG. Honored if set; usually null on
//                        polaroid since the texture already provides the
//                        decorative frame.
//
// Photo proportions are FIXED inside this layout — imageStyle.width/height
// from styleSettings is intentionally ignored, because the polaroid mat
// thickness only looks right at this specific scale. If the user wants a
// different photo size, they should switch back to the classic template
// where imageStyle is honored.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import EntryPhoto from '../EntryPhoto/EntryPhoto'

const GOLD = '#aa8840'

// Open-outline gold heart, sized in `em` so it scales with surrounding font.
function Heart({ color = GOLD }) {
    return (
        <svg
            viewBox='0 0 24 24'
            style={{
                width: '0.95em',
                height: '0.95em',
                display: 'inline-block',
                verticalAlign: '-0.12em',
                flexShrink: 0,
            }}
        >
            <path
                d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
                fill='none'
                stroke={color}
                strokeWidth={2}
                strokeLinejoin='round'
            />
        </svg>
    )
}

export default function PolaroidPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    // Same normalization as BookPageTemplate so legacy entries with messy
    // whitespace still render cleanly.
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    // % helpers — same convention as BookPageTemplate. ANY length must go
    // through these so the layout scales correctly across the 3 render
    // canvases (interactive viewer, live PDF, auto-export PDF).
    const { w, h } = pageScale(scaledWidth, scaledHeight)

    // Polaroid geometry. Tuned so the content sits inside the inner clear
    // area of the ornate-frame texture (~75% of page). Photo chosen to
    // feel like the hero of the page without colliding with the corner
    // ornaments — total polaroid width = photoWidth + 2*matSide =
    // w(62) + 2*w(2.5) = w(67), leaving ~w(13) margin to the page
    // padding on each side.
    const photoWidth = w(62)
    const photoHeight = photoWidth * 0.75 // 4:3 — never violated
    const matSide = w(2.5)
    const matBottom = w(7)

    // Resolve text colors with sensible polaroid defaults if the user
    // didn't override. Heart stays gold regardless — it's the brand mark.
    const textColor = styleSettings.fontColor || '#3d2e1a'
    const fontClass = styleSettings.fontClass || ''
    // Independent name font, falls back to the body fontClass
    // (matches the classic renderer). Set via the studio's
    // guest-name-font picker.
    const nameFontClass = styleSettings.nameFontClass || fontClass

    // Texture as its OWN absolutely-positioned layer so we can fade it
    // independently of the page color. CSS has no direct opacity on
    // background-image, so this is the cleanest way: the page bg-color
    // shows through wherever the texture is faded. textureOpacity in [0,1].
    const textureOpacity = styleSettings.textureOpacity ?? 1

    return (
        <div
            className='relative flex flex-col items-center box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fcfaf6',
                padding: h(10) + 'px ' + w(10) + 'px',
                color: textColor,
            }}
        >
            {/* Texture layer — separate so its opacity is independent of
                the content above it. zIndex 0 keeps it behind everything;
                pointer-events:none lets clicks pass through. */}
            {resolvedTexture && (
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: 'url(' + resolvedTexture + ')',
                        backgroundRepeat: 'no-repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: textureOpacity,
                        pointerEvents: 'none',
                        zIndex: 0,
                    }}
                />
            )}

            {/* Optional overlay frame (rare for polaroid since texture
                usually does the decorative work). Kept for parity with the
                classic template so user choices in DesignControls always
                have an effect. */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            {/* Polaroid frame — 4:3 photo inside a thick white mat, tilted */}
            {hasImage && (
                <div
                    style={{
                        background: '#ffffff',
                        padding: matSide + 'px ' + matSide + 'px ' + matBottom + 'px ' + matSide + 'px',
                        transform: 'rotate(-2.5deg)',
                        marginBottom: h(3),
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    {/* Shared natural-aspect photo. The white mat
                        sizes to the photo's actual dimensions, so a
                        4:3 lands a classic landscape polaroid and a
                        portrait shot lands a portrait polaroid. */}
                    <EntryPhoto
                        src={entry.imageUrl}
                        maxWidth={photoWidth}
                        maxHeight={photoHeight}
                    />
                </div>
            )}

            {/* Blessing — flexes to fill remaining vertical space, centered */}
            {hasText && (
                <p
                    className={fontClass}
                    style={{
                        fontSize: h(styleSettings.fontSizePercent ?? 3.0),
                        // Layout honors fontWeight from the preset;
                        // falls back to the font file natural weight.
                        fontWeight: styleSettings.fontWeight,
                        lineHeight: 1.5,
                        textAlign: 'center',
                        maxWidth: w(75),
                        margin: 0,
                        marginBottom: h(2),
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        zIndex: 5,
                        whiteSpace: 'pre-line',
                        wordWrap: 'break-word',
                    }}
                >
                    {cleanText}
                </p>
            )}

            {/* Signature row — gold heart + name. Always at the bottom of
                the page, in the page's font. */}
            {hasName && (
                <div
                    className={nameFontClass}
                    style={{
                        fontSize: h(styleSettings.nameFontSizePercent ?? 2.6),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        color: styleSettings.fontColor ?? GOLD,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4em',
                        lineHeight: 1.2,
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <Heart />
                    <span>{entry.name}</span>
                </div>
            )}
        </div>
    )
}
