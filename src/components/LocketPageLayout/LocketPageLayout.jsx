'use client'

// LocketPageLayout
//
// Production wedding-book layout — the "Locket" template.
// Used by BookPageTemplate when styleSettings.template === 'locket'.
//
// Visual character:
//   • Photo presented as an OVAL — border-radius:50% on the 4:3 box gives
//     a natural ellipse without cropping the photo (we never crop, ever).
//   • Tiny gold-ring around the oval, like a lavaliere.
//   • Decorative gold hairline + filled heart "ornament line" between
//     photo and blessing.
//   • Blessing in elegant Hebrew serif (Frank Ruhl by default).
//   • Name framed by TWO gold hearts at the bottom — formal portrait feel.
//
// Designed against the pearl-ornate background (texture:
// /textures/polaroid-frame-pearl.png) but works on any background. Padding
// is generous so the oval and signature both clear the corner ornaments
// of the most ornate frame in the asset library.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.40)'

function Heart({ color = GOLD, filled = false }) {
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
                fill={filled ? color : 'none'}
                stroke={color}
                strokeWidth={2}
                strokeLinejoin='round'
            />
        </svg>
    )
}

export default function LocketPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Oval photo geometry: 4:3 box with 50% radius → wide ellipse.
    // photoWidth chosen to fit comfortably inside the pearl frame's inner
    // clear area (~70% of page). Ring thickness w(0.6) — subtle gold halo.
    const photoWidth = w(54)
    const photoHeight = photoWidth * 0.75
    const ringThickness = w(0.6)

    const textColor = styleSettings.fontColor || '#3d2e1a'
    const fontClass = styleSettings.fontClass || ''

    return (
        <div
            className='relative flex flex-col items-center box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fcfaf6',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                padding: h(12) + 'px ' + w(11) + 'px',
                color: textColor,
            }}
        >
            {/* Optional overlay frame — kept for parity with the other
                templates, though usually null for locket since the texture
                already provides the decorative frame. */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            {/* Oval photo with gold ring */}
            {hasImage && (
                <div
                    style={{
                        padding: ringThickness,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, ' + GOLD + ' 0%, #d4b867 50%, ' + GOLD + ' 100%)',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.13)',
                        marginBottom: h(3),
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <div
                        style={{
                            width: photoWidth,
                            height: photoHeight,
                            borderRadius: '50%',
                            background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        }}
                    />
                </div>
            )}

            {/* Decorative ornament line: short gold hairline + filled heart
                + short gold hairline. Provides a graceful transition from
                photo to blessing. */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: w(2),
                    marginBottom: h(2.5),
                    position: 'relative',
                    zIndex: 5,
                }}
            >
                <div style={{ width: w(8), height: 1, background: GOLD_SOFT }} />
                <Heart filled />
                <div style={{ width: w(8), height: 1, background: GOLD_SOFT }} />
            </div>

            {/* Blessing — flexes to fill remaining vertical space */}
            {hasText && (
                <p
                    className={fontClass}
                    style={{
                        fontSize: h(2.6),
                        lineHeight: 1.6,
                        textAlign: 'center',
                        maxWidth: w(72),
                        margin: 0,
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

            {/* Name flanked by TWO hearts — the locket's signature touch */}
            {hasName && (
                <div
                    className={fontClass}
                    style={{
                        fontSize: h(2.3),
                        color: GOLD,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5em',
                        letterSpacing: '0.04em',
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <Heart />
                    <span>{entry.name}</span>
                    <Heart />
                </div>
            )}
        </div>
    )
}
