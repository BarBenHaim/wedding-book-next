'use client'

// StampPageLayout
//
// Production wedding-book layout — the "Stamp" template. Page styled as
// an oversized postage stamp: perforated edges (CSS radial-gradient mask
// — no asset), the photo as the stamp's main illustration, a circular
// "postmark" stamp containing the name+heart, and the blessing as the
// envelope's address lines.
//
// Design intent:
//   • Playful and unmistakably postcard/letter — every guest's blessing
//     becomes a piece of mail to the couple.
//   • Perforated edge built with two repeating radial gradients (one for
//     each axis), masked away from the inner content area. Sharp at any
//     zoom, prints crisp.
//   • Postmark uses a CSS conic gradient + radial darken to mimic an
//     ink-stamped circle.
//
// Used by BookPageTemplate when styleSettings.template === 'stamp'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

const GOLD = '#aa8840'
const GOLD_DEEP = '#8a6d30'
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

export default function StampPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo: 4:3, sized to fit the stamp's "illustration" area.
    const photoWidth = w(72)
    const photoHeight = photoWidth * 0.75

    // Perforated-edge geometry. Gap = the size of one perforation
    // "tooth" — too small and the page looks dotty, too large and it
    // looks like a checkerboard. h(1.6) hits a postage-stamp sweet
    // spot at every render canvas.
    const perfSize = h(1.6)

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || ''

    // Perforated-edge background. Two superimposed repeating radial
    // gradients carve circular "bites" out of every edge of an inset
    // white frame. The result is a stamp-edge silhouette with no asset.
    const perforatedBg =
        'radial-gradient(circle at ' + perfSize + 'px ' + perfSize + 'px, transparent ' +
        (perfSize * 0.45) + 'px, #ffffff ' + (perfSize * 0.45) + 'px) ' +
        '0 0 / ' + (perfSize * 2) + 'px ' + (perfSize * 2) + 'px'

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#f5ecda',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                padding: h(4) + 'px ' + w(4) + 'px',
            }}
        >
            {/* The "stamp" — a white inner panel with perforated edges */}
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    background:
                        '#ffffff ' + perforatedBg.split(' / ')[0] + ' / ' + perforatedBg.split(' / ')[1],
                    padding: perfSize * 1.2 + 'px',
                }}
            >
                {/* Inner stamp content frame (sits inside the perforation ring) */}
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        background: '#ffffff',
                        border: '1px solid ' + GOLD,
                        padding: h(3) + 'px ' + w(4) + 'px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                    }}
                >
                    {/* Tracked-caps "POSTED" label, top-right (RTL natural) */}
                    <div
                        style={{
                            position: 'absolute',
                            top: h(2.5),
                            right: w(4),
                            fontSize: h(1.3),
                            letterSpacing: '0.3em',
                            color: GOLD,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                        }}
                    >
                        Wedding Tales · ברכה
                    </div>

                    {/* Photo as the stamp's main illustration */}
                    {hasImage && (
                        <div
                            style={{
                                width: photoWidth,
                                height: photoHeight,
                                background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                                marginTop: h(5),
                                marginBottom: h(3),
                                flexShrink: 0,
                            }}
                        />
                    )}

                    {/* Blessing as the address body — right-aligned RTL */}
                    {hasText && (
                        <p
                            className={fontClass}
                            style={{
                                fontSize: h(2.2),
                                lineHeight: 1.6,
                                color: textColor,
                                textAlign: 'center',
                                margin: 0,
                                maxWidth: w(75),
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

                    {/* Postmark — circular ink stamp with name+heart */}
                    {hasName && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: h(3),
                                left: w(4),
                                width: h(11),
                                height: h(11),
                                borderRadius: '50%',
                                border: '2px solid ' + GOLD_DEEP,
                                color: GOLD_DEEP,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transform: 'rotate(-12deg)',
                                opacity: 0.85,
                                fontSize: h(1.4),
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                            }}
                        >
                            <div style={{ fontSize: h(1.1), letterSpacing: '0.2em' }}>WEDDING</div>
                            <div style={{ fontSize: h(2.4), margin: h(0.4) + 'px 0' }}>
                                <Heart filled color={GOLD_DEEP} />
                            </div>
                            <div
                                style={{
                                    fontSize: h(1.4),
                                    maxWidth: h(9),
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    direction: 'rtl',
                                }}
                            >
                                {entry.name}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
