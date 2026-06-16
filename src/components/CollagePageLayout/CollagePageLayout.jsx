'use client'

// CollagePageLayout
//
// Production wedding-book layout — the "Collage" template. A chaotic
// memory-board page: the photo sits at a tilt with washi-tape on its
// corners, surrounded by scattered "ephemera" — a fake handwritten date
// tag, a ticket-stub graphic, a torn ribbon strip, and a few gold stars.
//
// Different from ScrapbookPageLayout (which is one neat tilted photo).
// Collage feels like the couple emptied an envelope of mementos onto the
// page. Multiple rotation angles, deliberate visual noise, every piece
// at a different tilt — to feel HAND-MADE.
//
// All decorations are CSS-only (no asset). Positions are deterministic
// so the page renders identically across viewer / live PDF / auto-export.
//
// Used by BookPageTemplate when styleSettings.template === 'collage'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { gveretLevin } from '@/app/fonts'
import { pageScale } from '@/lib/pageGeometry'
import EntryPhoto from '../EntryPhoto/EntryPhoto'

const GOLD = '#aa8840'
const GOLD_LIGHT = '#d4b867'
const TAPE_AMBER = 'rgba(212,184,103,0.55)'
const TAPE_CREAM = 'rgba(245,236,218,0.85)'
const INK = '#3d2e1a'

function Heart({ color = GOLD, filled = false, size = '0.95em' }) {
    return (
        <svg
            viewBox='0 0 24 24'
            style={{
                width: size,
                height: size,
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

// 4-pointed gold sparkle — stylized "ping" star drawn from two crossing
// rotated rectangles. Sized in `em` so it tracks surrounding font.
function Sparkle({ size = '1em', color = GOLD }) {
    return (
        <svg viewBox='0 0 24 24' style={{ width: size, height: size, display: 'inline-block' }}>
            <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' fill={color} />
        </svg>
    )
}

export default function CollagePageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const { w, h } = pageScale(scaledWidth, scaledHeight)

    // Photo positioned absolutely so we can tilt it freely + overlap with
    // the surrounding ephemera. 4:3 always preserved.
    const photoWidth = w(70)
    const photoHeight = photoWidth * 0.75
    const printBorder = w(1.2)

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || gveretLevin.className
    // Independent name font, falls back to the body fontClass
    // (matches the classic renderer). Set via the studio's
    // guest-name-font picker.
    const nameFontClass = styleSettings.nameFontClass || fontClass

    // Direction support — the blessing block's anchor flips per locale so
    // the handwritten text reads naturally in either direction.
    const isRtl = !(styleSettings.locale === 'en' || styleSettings.locale === 'es' || styleSettings.locale === 'it')
    const dir = isRtl ? 'rtl' : 'ltr'

    return (
        <div
            className='relative box-border overflow-hidden'
            dir={dir}
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fbf6e9',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
            }}
        >
            {/* ── Scattered gold sparkles (4 corners-ish) ── */}
            <div style={{ position: 'absolute', top: h(6), left: w(8), opacity: 0.6, transform: 'rotate(-15deg)' }}>
                <Sparkle size={h(2.4) + 'px'} color={GOLD_LIGHT} />
            </div>
            <div style={{ position: 'absolute', top: h(11), right: w(12), opacity: 0.5 }}>
                <Sparkle size={h(1.6) + 'px'} color={GOLD} />
            </div>
            <div style={{ position: 'absolute', bottom: h(28), left: w(6), opacity: 0.45 }}>
                <Sparkle size={h(2.0) + 'px'} color={GOLD} />
            </div>
            <div style={{ position: 'absolute', bottom: h(8), right: w(8), opacity: 0.55, transform: 'rotate(20deg)' }}>
                <Sparkle size={h(2.2) + 'px'} color={GOLD_LIGHT} />
            </div>

            {/* ── Photo with washi-tape (rotated +3°) ── */}
            {hasImage && (
                <div
                    style={{
                        position: 'absolute',
                        top: h(10),
                        left: w(15),
                        background: '#ffffff',
                        padding: printBorder,
                        transform: 'rotate(3deg)',
                        zIndex: 5,
                        border: '1px solid rgba(170,136,64,0.25)',
                    }}
                >
                    {/* Shared natural-aspect photo. */}
                    <EntryPhoto
                        src={entry.imageUrl}
                        maxWidth={photoWidth}
                        maxHeight={photoHeight}
                        objectPosition={entry.photoPosition || 'center'}
                    />
                    {/* Washi tape — top-left corner */}
                    <div
                        style={{
                            position: 'absolute',
                            top: -h(0.2),
                            left: -w(2),
                            width: w(11),
                            height: h(2),
                            background: TAPE_AMBER,
                            transform: 'rotate(-32deg)',
                        }}
                    />
                    {/* Washi tape — bottom-right corner */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: -h(1),
                            right: -w(2),
                            width: w(10),
                            height: h(1.8),
                            background: TAPE_CREAM,
                            transform: 'rotate(-25deg)',
                            border: '1px solid rgba(170,136,64,0.25)',
                        }}
                    />
                </div>
            )}

            {/* ── Blessing — handwritten, anchored to the start side of
                the reading direction. insetInline* + textAlign:start
                resolve via the dir on the page wrapper above, so the
                blessing reads naturally in Hebrew (right-anchored) or
                English/Spanish/Italian (left-anchored). */}
            {hasText && (
                <div
                    style={{
                        position: 'absolute',
                        top: h(72),
                        insetInlineStart: w(10),
                        insetInlineEnd: w(30),
                        textAlign: 'start',
                        zIndex: 6,
                    }}
                >
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSizePercent ?? 2.6),
                        // Layout honors fontWeight from the preset;
                        // falls back to the font file natural weight.
                        fontWeight: styleSettings.fontWeight,
                            lineHeight: 1.45,
                            color: textColor,
                            margin: 0,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                            transform: 'rotate(-1deg)',
                            // No logical transform-origin in CSS — flip the
                            // keyword by direction so the tilt pivots from
                            // the same visual anchor (the line-start edge).
                            transformOrigin: isRtl ? 'right center' : 'left center',
                        }}
                    >
                        {cleanText}
                    </p>
                </div>
            )}

            {/* ── Signature — name + heart, bottom corner, tilted ──
                Position controllable from the admin design studio
                (collage-only sliders): nameOffsetX, nameOffsetY,
                nameRotation. Defaults match the original hand-placed
                values (left: 15%, bottom: 12%, rotate: 6deg) so older
                presets render unchanged.

                Coordinate system:
                  • nameOffsetX  → % from the LEFT edge of the page
                                   (0 = left edge, 100 = right edge,
                                   the name starts at this anchor).
                  • nameOffsetY  → % from the BOTTOM edge.
                  • nameRotation → degrees; positive = clockwise.
            */}
            {hasName && (
                <div
                    className={nameFontClass}
                    style={{
                        position: 'absolute',
                        bottom: h(styleSettings.nameOffsetY ?? 12),
                        left: w(styleSettings.nameOffsetX ?? 15),
                        fontSize: h(styleSettings.nameFontSizePercent ?? 2.8),
                        fontWeight: styleSettings.nameFontWeight ?? styleSettings.fontWeight,
                        color: styleSettings.nameColor ?? styleSettings.fontColor ?? GOLD,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3em',
                        transform: `rotate(${styleSettings.nameRotation ?? 6}deg)`,
                        transformOrigin: 'left center',
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
