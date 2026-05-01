'use client'

// StoryPageLayout
//
// Production wedding-book layout — the "Story" template. Modern card-based
// composition: a 4:3 photo dominates the upper portion of the page, and a
// soft white card with a drop shadow floats over the lower portion, holding
// the blessing and the name+heart signature.
//
// Design intent:
//   • Inspired by the "social card" aesthetic — a polished modern feel.
//   • The card visually overlaps the photo by ~h(4) so the composition
//     reads as one elevated object, not two stacked elements.
//   • Photo aspect always 4:3, card width sized so the gold heart and
//     the longest reasonable name fit on a single line at h(2.0).
//
// Used by BookPageTemplate when styleSettings.template === 'story'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

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

export default function StoryPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo: 4:3 hero at top, full inner-width minus padding.
    const photoWidth = w(82)
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || ''

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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: h(8) + 'px ' + w(9) + 'px',
            }}
        >
            {/* Hero photo — 4:3, rounded corners, drop shadow */}
            {hasImage && (
                <div
                    style={{
                        width: photoWidth,
                        height: photoHeight,
                        background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        borderRadius: w(2),
                        border: '1px solid rgba(170,136,64,0.35)',
                        flexShrink: 0,
                        zIndex: 1,
                    }}
                />
            )}

            {/* Floating white card — overlaps the photo by h(-4) so the
                composition reads as one elevated unit. Card grows
                vertically to fit the blessing length. */}
            <div
                style={{
                    marginTop: hasImage ? -h(4) : 0,
                    width: w(75),
                    flex: 1,
                    background: '#ffffff',
                    borderRadius: w(2),
                    border: '1px solid rgba(170,136,64,0.35)',
                    padding: h(4) + 'px ' + w(6) + 'px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                    zIndex: 2,
                }}
            >
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.4),
                            lineHeight: 1.55,
                            textAlign: 'center',
                            color: textColor,
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
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
                            marginTop: h(2),
                            paddingTop: h(2),
                            borderTop: '1px solid rgba(170,136,64,0.18)',
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4em',
                            fontSize: h(2.0),
                            color: GOLD,
                            fontWeight: 600,
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
