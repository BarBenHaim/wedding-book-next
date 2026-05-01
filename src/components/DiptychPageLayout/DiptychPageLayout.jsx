'use client'

// DiptychPageLayout
//
// Production wedding-book layout — the "Diptych" template. The page is
// split into two equal columns by a thin gold rule. Photo lives in the
// right column (RTL natural reading order — first), text + name+heart
// live in the left column.
//
// Design intent:
//   • Contemporary minimalist split — feels like a designer art print.
//   • The gold rule between columns is the only ornament; everything
//     else is whitespace and clean type. Lets the photo and the text
//     breathe at equal weight.
//   • Photo: 4:3, vertically centered in its column. On a square page,
//     a 4:3 photo at column-width gives a natural top/bottom margin
//     without forcing it.
//
// Used by BookPageTemplate when styleSettings.template === 'diptych'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.4)'
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

export default function DiptychPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Each column is ~38% of page width after subtracting outer padding
    // and the central gold rule. Photo width capped to that to preserve
    // 4:3 (height = 38 * 0.75 = ~28.5% of page height — comfortable in
    // a square page with vertical centering).
    const colWidth = w(38)
    const photoWidth = colWidth
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || ''

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fdfbf5',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                display: 'flex',
                flexDirection: 'row',
                padding: h(8) + 'px ' + w(8) + 'px',
                gap: w(4),
            }}
        >
            {/* Right column (RTL "first") — text + name+heart, vertically centered */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    textAlign: 'right',
                    minWidth: 0,
                }}
            >
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.4),
                            lineHeight: 1.65,
                            margin: 0,
                            marginBottom: h(4),
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
                            display: 'flex',
                            alignItems: 'center',
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

            {/* Central gold rule — full inner-height, hairline */}
            <div
                style={{
                    width: 1,
                    background: GOLD_SOFT,
                    flexShrink: 0,
                    alignSelf: 'stretch',
                }}
            />

            {/* Left column (RTL "second") — photo, vertically centered */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 0,
                }}
            >
                {hasImage && (
                    <div
                        style={{
                            width: photoWidth,
                            height: photoHeight,
                            background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.13)',
                        }}
                    />
                )}
            </div>
        </div>
    )
}
