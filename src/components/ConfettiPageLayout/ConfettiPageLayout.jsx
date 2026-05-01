'use client'

// ConfettiPageLayout
//
// Production wedding-book layout — the "Confetti" template. Festive
// celebratory composition: the photo sits centered with a subtle gold
// frame, while small gold hearts and dots float at deterministic
// positions around the page like wedding confetti caught in mid-air.
// Blessing flows below; name+heart at the bottom in gveretLevin script.
//
// Design intent:
//   • The most JOYFUL of the layouts — wedding-party energy.
//   • Confetti positions are HARD-CODED (deterministic) so the page
//     renders the same in the live viewer, the live print PDF, and the
//     auto-export PDF. Random positions would create a different page
//     each render and screw up the WYSIWYG ↔ print parity contract.
//   • All confetti scaled with h() — they grow with the page, never go
//     pixel-tiny on small previews or pixel-huge on print.
//
// Used by BookPageTemplate when styleSettings.template === 'confetti'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { gveretLevin } from '@/app/fonts'

const GOLD = '#aa8840'
const GOLD_LIGHT = '#d4b867'
const INK = '#1a1410'

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

// Deterministic confetti pattern — each entry: { top%, left%, kind, rotate, size }
// Distributed around the edges, AVOIDING the center where the photo lives.
// 'h'=heart, 'd'=dot, 's'=sparkle (small diamond)
const CONFETTI = [
    // Top band
    { top: 4, left: 8, kind: 'h', rotate: -15, sz: 1.8 },
    { top: 7, left: 22, kind: 'd', sz: 0.9 },
    { top: 3, left: 38, kind: 's', rotate: 20, sz: 1.0 },
    { top: 6, left: 56, kind: 'h', rotate: 25, sz: 1.4, filled: true },
    { top: 4, left: 72, kind: 'd', sz: 1.2 },
    { top: 8, left: 88, kind: 'h', rotate: -20, sz: 1.6 },
    { top: 14, left: 4, kind: 's', rotate: 0, sz: 0.8 },
    { top: 14, left: 92, kind: 's', rotate: 45, sz: 1.0 },
    // Sides
    { top: 26, left: 3, kind: 'h', rotate: 10, sz: 1.2 },
    { top: 28, left: 95, kind: 'd', sz: 0.8 },
    { top: 44, left: 2, kind: 'd', sz: 1.1 },
    { top: 46, left: 96, kind: 'h', rotate: -18, sz: 1.4, filled: true },
    { top: 60, left: 4, kind: 's', rotate: 30, sz: 0.9 },
    { top: 62, left: 94, kind: 's', rotate: -10, sz: 1.0 },
    // Bottom band — denser
    { top: 78, left: 6, kind: 'd', sz: 1.0 },
    { top: 82, left: 18, kind: 'h', rotate: 30, sz: 1.5 },
    { top: 79, left: 32, kind: 's', rotate: -25, sz: 1.1 },
    { top: 85, left: 50, kind: 'd', sz: 0.8 },
    { top: 80, left: 66, kind: 'h', rotate: -10, sz: 1.3, filled: true },
    { top: 84, left: 80, kind: 's', rotate: 15, sz: 1.0 },
    { top: 78, left: 92, kind: 'h', rotate: 18, sz: 1.6 },
]

function ConfettiPiece({ piece, h }) {
    const baseStyle = {
        position: 'absolute',
        top: piece.top + '%',
        left: piece.left + '%',
        transform: 'rotate(' + (piece.rotate || 0) + 'deg)',
        opacity: 0.65,
        pointerEvents: 'none',
        zIndex: 0,
    }
    if (piece.kind === 'h') {
        return (
            <div style={baseStyle}>
                <Heart color={GOLD} filled={piece.filled} size={h(piece.sz)} />
            </div>
        )
    }
    if (piece.kind === 'd') {
        return (
            <div
                style={{
                    ...baseStyle,
                    width: h(piece.sz),
                    height: h(piece.sz),
                    borderRadius: '50%',
                    background: GOLD_LIGHT,
                }}
            />
        )
    }
    // sparkle = small rotated square (looks like a diamond)
    return (
        <div
            style={{
                ...baseStyle,
                width: h(piece.sz),
                height: h(piece.sz),
                background: GOLD,
                transform: 'rotate(' + ((piece.rotate || 0) + 45) + 'deg)',
            }}
        />
    )
}

export default function ConfettiPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo sits centered. Width chosen so the confetti band on the
    // sides doesn't overlap with the photo at any common page size.
    const photoWidth = w(64)
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || gveretLevin.className

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fffbf2',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
            }}
        >
            {/* Confetti — render BEHIND content (zIndex 0) */}
            {CONFETTI.map((piece, i) => (
                <ConfettiPiece key={i} piece={piece} h={h} />
            ))}

            {/* Content stack — z-indexed above confetti */}
            <div
                style={{
                    position: 'relative',
                    zIndex: 2,
                    width: '100%',
                    height: '100%',
                    padding: h(8) + 'px ' + w(8) + 'px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                {/* Photo with thin gold frame */}
                {hasImage && (
                    <div
                        style={{
                            padding: w(0.6),
                            background: 'linear-gradient(135deg, ' + GOLD + ' 0%, #d4b867 50%, ' + GOLD + ' 100%)',
                            marginBottom: h(3),
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

                {/* Blessing */}
                {hasText && (
                    <p
                        className={fontClass}
                        style={{
                            fontSize: h(2.9),
                            lineHeight: 1.5,
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

                {/* Name + filled heart */}
                {hasName && (
                    <div
                        className={fontClass}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4em',
                            fontSize: h(2.6),
                            color: GOLD,
                            fontWeight: 600,
                            marginTop: h(2),
                        }}
                    >
                        <Heart color={GOLD} filled />
                        <span>{entry.name}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
