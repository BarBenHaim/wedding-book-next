'use client'

// EditorialPageLayout
//
// Production wedding-book layout — the "Editorial" template. Magazine
// spread aesthetic: asymmetric, lots of whitespace, sans-serif typography,
// big typographic accent (oversized opening quote), photo anchored to a
// bottom corner, name in tracked uppercase at the bottom-left.
//
// Design intent:
//   • A modern alternative to the traditional symmetric polaroid feel.
//   • Strong visual contrast between the tiny tracked-caps label, the
//     mid-weight body, and the giant quote-mark accent.
//   • Photo is decoration (anchor in the corner) not the hero — text
//     leads. Best for entries with longer / more poetic blessings.
//
// Used by BookPageTemplate when styleSettings.template === 'editorial'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'

const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.4)'
const INK = '#1a1410'

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

export default function EditorialPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo: 4:3 anchored to the bottom-left corner. Modest size — this
    // layout treats the photo as decorative anchor, not the hero.
    const photoWidth = w(38)
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
            }}
        >
            {/* Tracked-caps label — top-right (RTL natural) */}
            <div
                style={{
                    position: 'absolute',
                    top: h(8),
                    right: w(8),
                    fontSize: h(1.3),
                    letterSpacing: '0.3em',
                    color: GOLD,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontFamily: 'inherit',
                }}
            >
                ברכה
            </div>

            {/* Giant gold opening quote-mark — top-left (the visual punch) */}
            <div
                style={{
                    position: 'absolute',
                    top: h(4),
                    left: w(8),
                    fontFamily: 'Georgia, serif',
                    fontSize: h(18),
                    lineHeight: 0.7,
                    color: GOLD,
                    opacity: 0.45,
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
            >
                &ldquo;
            </div>

            {/* Body text — right-aligned (RTL natural), positioned in the
                upper-right zone with breathing room around it */}
            {hasText && (
                <p
                    className={fontClass}
                    style={{
                        position: 'absolute',
                        top: h(20),
                        right: w(8),
                        left: w(46), // leaves room for the photo anchored bottom-left
                        fontSize: h(2.5),
                        lineHeight: 1.6,
                        textAlign: 'right',
                        margin: 0,
                        whiteSpace: 'pre-line',
                        wordWrap: 'break-word',
                    }}
                >
                    {cleanText}
                </p>
            )}

            {/* Photo anchor — bottom-left, 4:3, with a subtle gold rule
                above to tie it visually to the layout */}
            {hasImage && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: h(15),
                        left: w(8),
                    }}
                >
                    <div
                        style={{
                            width: photoWidth,
                            height: photoHeight,
                            background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                            boxShadow: '0 6px 18px rgba(0,0,0,0.13)',
                        }}
                    />
                </div>
            )}

            {/* Name + heart — bottom-left, tracked uppercase, sits below
                the photo. If no photo, sits at the bottom-left alone. */}
            {hasName && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: h(7),
                        left: w(8),
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5em',
                    }}
                >
                    <div style={{ width: w(6), height: 1, background: GOLD_SOFT }} />
                    <Heart />
                    <span
                        style={{
                            fontSize: h(1.5),
                            letterSpacing: '0.25em',
                            color: GOLD,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                        }}
                    >
                        {entry.name}
                    </span>
                </div>
            )}
        </div>
    )
}
