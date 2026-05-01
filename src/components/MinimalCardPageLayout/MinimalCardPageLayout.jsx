'use client'

// MinimalCardPageLayout
//
// Production wedding-book layout — the "Minimal Card" template.
//
// Sister to StoryPageLayout but tighter and more refined:
//   • Photo at the top, sharp corners (no rounding), 4:3.
//   • Hairline gold rule directly below the photo — visually anchors
//     the photo to the card without needing overlap or shadows.
//   • Card sits flush below (no negative margin, no overlap) with a
//     thin gold border instead of a drop shadow.
//   • Designer-book / portfolio aesthetic. Best when the user wants the
//     calmness of a printed art book over the social-card feel.
//
// Used by BookPageTemplate when styleSettings.template === 'minimal'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.4)'
const GOLD_FAINT = 'rgba(170,136,64,0.18)'
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

export default function MinimalCardPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    const photoWidth = w(80)
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
                flexDirection: 'column',
                alignItems: 'center',
                padding: h(8) + 'px ' + w(10) + 'px',
            }}
        >
            {/* Photo — sharp corners, gentle shadow */}
            {hasImage && (
                <div
                    style={{
                        width: photoWidth,
                        height: photoHeight,
                        background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        border: '1px solid rgba(170,136,64,0.35)',
                        flexShrink: 0,
                    }}
                />
            )}

            {/* Hairline gold rule — anchors the photo to the card below */}
            {hasImage && (
                <div
                    style={{
                        width: photoWidth,
                        height: 1,
                        background: GOLD_SOFT,
                        flexShrink: 0,
                    }}
                />
            )}

            {/* Card flush below — thin border, no shadow, no overlap */}
            <div
                style={{
                    width: photoWidth,
                    flex: 1,
                    background: '#ffffff',
                    border: '1px solid ' + GOLD_FAINT,
                    borderTop: 'none',
                    padding: h(4) + 'px ' + w(5) + 'px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 0,
                }}
            >
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.4),
                            lineHeight: 1.6,
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                            fontSize: h(1.7),
                            color: GOLD,
                            fontWeight: 700,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
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
