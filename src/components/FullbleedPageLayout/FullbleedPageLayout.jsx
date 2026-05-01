'use client'

// FullbleedPageLayout
//
// Production wedding-book layout — the "Fullbleed" template. Photo
// dominates the entire upper portion of the page (4:3 at 100% page
// width = 75% of page height on a square page) flush to all three top
// edges. A frosted-glass white card OVERLAPS the photo's bottom edge,
// holding the blessing and the name+heart signature.
//
// Design intent:
//   • Hotel-brochure / luxury-magazine aesthetic. Photo is the page;
//     the text sits in its world.
//   • Glass card creates a visual layer on top of the image — feels
//     "modern editorial" without competing with the photo.
//   • Photo aspect always 4:3 (no crop). The bottom of the page
//     (~25% height) is just the page background showing through, hidden
//     behind the glass card.
//
// Used by BookPageTemplate when styleSettings.template === 'fullbleed'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { davidLibre } from '@/app/fonts'

const GOLD = '#aa8840'
const INK = '#1a1410'

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

export default function FullbleedPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo at 100% page width → 75% page height (4:3). Sits flush at
    // the top, no padding, no border, no rounded corners.
    const photoWidth = scaledWidth
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || davidLibre.className

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#f5f0e8',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                padding: 0,
            }}
        >
            {/* ── Photo — full-bleed top, no crop, no border, no radius ── */}
            {hasImage && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: photoWidth,
                        height: photoHeight,
                        background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        zIndex: 1,
                    }}
                />
            )}

            {/* ── Frosted-glass card overlapping photo's bottom edge ──
                Positioned absolute so it can sit on top of the photo
                regardless of whether the photo is present.
                Backdrop-filter blurs the photo behind the card → frosted
                glass. Falls back to a slightly translucent white if the
                browser doesn't support backdrop-filter. */}
            <div
                style={{
                    position: 'absolute',
                    bottom: h(7),
                    left: w(8),
                    right: w(8),
                    background: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(170,136,64,0.4)',
                    padding: h(3.5) + 'px ' + w(5) + 'px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: h(2),
                    zIndex: 5,
                }}
            >
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.2),
                            lineHeight: 1.55,
                            textAlign: 'center',
                            color: textColor,
                            margin: 0,
                            maxWidth: w(78),
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                        }}
                    >
                        {cleanText}
                    </p>
                )}

                {hasName && (
                    <div
                        style={{
                            paddingTop: hasText ? h(1.5) : 0,
                            borderTop: hasText ? '1px solid rgba(170,136,64,0.25)' : 'none',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4em',
                            fontSize: h(1.9),
                            color: GOLD,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                        }}
                    >
                        <Heart filled />
                        <span>{entry.name}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
