'use client'

// KetubahPageLayout
//
// Production wedding-book layout — the "Ketubah" template. Inspired by
// the formal Jewish marriage contract (כתובה): heavy gold double-line
// frame with ornate corner accents, small framed portrait at the top,
// an ornament divider, the blessing in formal Hebrew serif rows, and
// a filled-gold-heart "wax seal" with the guest's name at the bottom.
//
// Design intent:
//   • Wedding-y in the most explicit, ceremonial sense — feels like a
//     keepsake document.
//   • All ornament is pure CSS (gradients, ::before-style absolute
//     blocks). No image assets needed; print-crisp at any size.
//   • Photo stays a clean 4:3 rectangle inside a thin gold frame —
//     no cropping, no oval, no clip-path.
//
// Used by BookPageTemplate when styleSettings.template === 'ketubah'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { frankRuhl } from '@/app/fonts'

const GOLD = '#aa8840'
const GOLD_DEEP = '#8a6d30'
const GOLD_SOFT = 'rgba(170,136,64,0.40)'
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

// Pure-CSS corner ornament — small rotated diamond + diagonal line.
// Positioned via the parent's `style` (top/left/right/bottom).
function CornerOrnament({ rotate = 0, ...positionStyle }) {
    return (
        <div
            style={{
                position: 'absolute',
                width: '3em',
                height: '3em',
                transform: 'rotate(' + rotate + 'deg)',
                pointerEvents: 'none',
                ...positionStyle,
            }}
        >
            {/* Diagonal stroke */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: 1,
                    background: GOLD_SOFT,
                    transform: 'rotate(45deg)',
                }}
            />
            {/* Center diamond */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '0.5em',
                    height: '0.5em',
                    transform: 'translate(-50%,-50%) rotate(45deg)',
                    background: GOLD,
                }}
            />
        </div>
    )
}

export default function KetubahPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo geometry — small framed portrait at top.
    const photoWidth = w(38)
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || frankRuhl.className

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fdfaf0',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                fontSize: h(2.2),
            }}
        >
            {/* ── Double gold frame ── */}
            <div
                style={{
                    position: 'absolute',
                    inset: w(4),
                    border: '2px solid ' + GOLD,
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: w(5.2),
                    border: '1px solid ' + GOLD_SOFT,
                    pointerEvents: 'none',
                }}
            />

            {/* ── Corner ornaments (4) ── */}
            <CornerOrnament top={w(3)} left={w(3)} rotate={0} />
            <CornerOrnament top={w(3)} right={w(3)} rotate={90} />
            <CornerOrnament bottom={w(3)} right={w(3)} rotate={180} />
            <CornerOrnament bottom={w(3)} left={w(3)} rotate={270} />

            {/* ── Inner content ── */}
            <div
                style={{
                    position: 'absolute',
                    inset: w(8),
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                }}
            >
                {/* Framed portrait at top */}
                {hasImage && (
                    <div
                        style={{
                            padding: w(0.6),
                            background: GOLD,
                            marginBottom: h(2),
                        }}
                    >
                        <div
                            style={{
                                width: photoWidth,
                                height: photoHeight,
                                background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                            }}
                        />
                    </div>
                )}

                {/* Ornament divider — line + diamond + line */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: w(1.5),
                        marginBottom: h(2.5),
                    }}
                >
                    <div style={{ width: w(10), height: 1, background: GOLD_SOFT }} />
                    <div
                        style={{
                            width: '0.5em',
                            height: '0.5em',
                            background: GOLD,
                            transform: 'rotate(45deg)',
                        }}
                    />
                    <div style={{ width: w(10), height: 1, background: GOLD_SOFT }} />
                </div>

                {/* Formal blessing — serif rows, slightly larger */}
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.5),
                            lineHeight: 1.7,
                            color: textColor,
                            margin: 0,
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            maxWidth: w(75),
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                        }}
                    >
                        {cleanText}
                    </p>
                )}

                {/* Wax seal — filled gold heart in a circle, with name below */}
                {hasName && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            marginTop: h(2),
                        }}
                    >
                        <div
                            style={{
                                width: h(5),
                                height: h(5),
                                borderRadius: '50%',
                                background:
                                    'radial-gradient(circle at 35% 35%, #d4b867 0%, ' +
                                    GOLD +
                                    ' 60%, ' +
                                    GOLD_DEEP +
                                    ' 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: h(2.5),
                                lineHeight: 1,
                                marginBottom: h(1.2),
                            }}
                        >
                            <Heart filled color='#ffffff' />
                        </div>
                        <span
                            className={fontClass}
                            style={{
                                fontSize: h(2.0),
                                color: GOLD_DEEP,
                                fontWeight: 700,
                                letterSpacing: '0.05em',
                            }}
                        >
                            {entry.name}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
