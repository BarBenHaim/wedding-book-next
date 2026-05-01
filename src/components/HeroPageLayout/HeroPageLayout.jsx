'use client'

// HeroPageLayout
//
// Production wedding-book layout — the "Hero" template.
//
// Photo-first variant of StoryPageLayout. The photo dominates the page
// (~92% of inner width, 4:3 ratio so ~69% of inner height on a square
// page), and a smaller white "caption card" overlaps the photo's bottom
// edge by ~30% — like an Instagram hero post with a caption sticker.
//
// Design intent:
//   • The photo IS the page. The blessing is a caption underneath the
//     image, not a panel below it.
//   • Card width is intentionally smaller than the photo so the photo's
//     edges visually breathe.
//   • Strong shadow under the photo + softer shadow under the card give
//     a stacked-depth feel without competing.
//
// Used by BookPageTemplate when styleSettings.template === 'hero'.

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

export default function HeroPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Hero photo — bigger than Story (92% vs 82%), takes ~69% of page
    // height in 4:3. Card overlaps the bottom 30% of the photo.
    const photoWidth = w(92)
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
                padding: h(4) + 'px ' + w(4) + 'px',
            }}
        >
            {/* Hero photo — large, rounded, deep shadow */}
            {hasImage && (
                <div
                    style={{
                        width: photoWidth,
                        height: photoHeight,
                        background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        borderRadius: w(2.5),
                        border: '1px solid rgba(170,136,64,0.4)',
                        flexShrink: 0,
                        zIndex: 1,
                    }}
                />
            )}

            {/* Caption card — smaller than the photo, overlaps its bottom */}
            <div
                style={{
                    marginTop: hasImage ? -h(15) : 0,
                    width: w(72),
                    flex: 1,
                    background: '#ffffff',
                    borderRadius: w(2),
                    border: '1px solid rgba(170,136,64,0.35)',
                    padding: h(3) + 'px ' + w(5) + 'px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: h(1.5),
                    position: 'relative',
                    zIndex: 2,
                    minHeight: 0,
                }}
            >
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.2),
                            lineHeight: 1.5,
                            textAlign: 'center',
                            color: textColor,
                            margin: 0,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                            overflow: 'hidden',
                        }}
                    >
                        {cleanText}
                    </p>
                )}

                {hasName && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4em',
                            fontSize: h(1.9),
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
