'use client'

// ScrapbookPageLayout
//
// Production wedding-book layout — the "Scrapbook" template.
// Used by BookPageTemplate when styleSettings.template === 'scrapbook'.
//
// Visual character:
//   • Photo "pasted" onto the page with a slight (+1.5°) tilt and a
//     thin white print border — looks like a physical photograph dropped
//     into a memory book.
//   • Two CSS-only washi-tape strips at the top corners (semi-transparent
//     gold rectangles, opposite rotations) — no asset needed.
//   • Blessing in handwritten Hebrew below the photo.
//   • Signature ("♥ name") absolute-positioned in the lower-LEFT corner,
//     tilted -3°, like a guest signing the page in pen.
//
// Designed against the minimalist botanical background (texture:
// /textures/polaroid-frame-botanical.png) — the open clear area suits the
// off-center signature placement. Works on any background.

import { getBlessingText } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { pageScale } from '@/lib/pageGeometry'
import EntryPhoto from '../EntryPhoto/EntryPhoto'

const GOLD = '#aa8840'
const TAPE_GOLD = 'rgba(170,136,64,0.30)'

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

export default function ScrapbookPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = getBlessingText(entry)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const { w, h } = pageScale(scaledWidth, scaledHeight)

    // Photo geometry — 4:3 with a thin white print border. The white
    // padding makes it look like a real printed photograph. Slight tilt
    // for the scrapbook character.
    const photoWidth = w(60)
    const photoHeight = photoWidth * 0.75
    const printBorder = w(1.2)

    const textColor = styleSettings.fontColor || '#3d2e1a'
    const fontClass = styleSettings.fontClass || ''
    // Independent name font, falls back to the body fontClass
    // (matches the classic renderer). Set via the studio's
    // guest-name-font picker.
    const nameFontClass = styleSettings.nameFontClass || fontClass

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fdf9ee',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                padding: h(11) + 'px ' + w(11) + 'px',
                color: textColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}
        >
            {/* Optional overlay frame — kept for parity. */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            {/* Tilted photo with washi-tape corners */}
            {hasImage && (
                <div
                    style={{
                        position: 'relative',
                        background: '#ffffff',
                        padding: printBorder,
                        border: '1px solid rgba(170,136,64,0.35)',
                        transform: 'rotate(1.5deg)',
                        marginBottom: h(4),
                        zIndex: 5,
                    }}
                >
                    {/* Shared natural-aspect photo. */}
                    <EntryPhoto
                        src={entry.imageUrl}
                        maxWidth={photoWidth}
                        maxHeight={photoHeight}
                        objectPosition={entry.photoPosition || 'center'}
                        rotation={entry.photoRotation || 0}
                    />

                    {/* Washi tape — top-left, tilted clockwise */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -h(1.5),
                            left: -w(2),
                            width: w(8),
                            height: h(2),
                            background: TAPE_GOLD,
                            transform: 'rotate(-25deg)',
                        }}
                    />
                    {/* Washi tape — top-right, tilted counter-clockwise */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -h(1.5),
                            right: -w(2),
                            width: w(8),
                            height: h(2),
                            background: TAPE_GOLD,
                            transform: 'rotate(25deg)',
                        }}
                    />
                </div>
            )}

            {/* Blessing — handwritten flow below the photo */}
            {hasText && (
                <p
                    className={fontClass}
                    style={{
                        fontSize: h(styleSettings.fontSizePercent ?? 2.9),
                        // Layout honors fontWeight from the preset;
                        // falls back to the font file natural weight.
                        fontWeight: styleSettings.fontWeight,
                        lineHeight: 1.55,
                        textAlign: 'center',
                        maxWidth: w(78),
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

            {/* Signature — absolute-positioned bottom-left, tilted.
                Stays inside the page's safe inner area thanks to the w(11)
                page padding. */}
            {hasName && (
                <div
                    className={nameFontClass}
                    style={{
                        position: 'absolute',
                        bottom: h(7),
                        left: w(8),
                        fontSize: h(styleSettings.nameFontSizePercent ?? 2.6),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        color: styleSettings.nameColor ?? styleSettings.fontColor ?? GOLD,
                        transform: 'rotate(-3deg)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3em',
                        zIndex: 6,
                    }}
                >
                    <Heart filled />
                    <span>{entry.name}</span>
                </div>
            )}
        </div>
    )
}
