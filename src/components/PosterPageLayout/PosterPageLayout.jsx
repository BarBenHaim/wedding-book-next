'use client'

// PosterPageLayout
//
// Production wedding-book layout — the "Poster" template. Movie/event
// poster aesthetic: the guest's NAME is the visual hero (huge tracked-
// uppercase banner across the top), photo demoted to a feature image
// in the middle, blessing acts as a "tagline" below, and a
// "WEDDING TALES PRESENTS" footer caps the page.
//
// Design intent:
//   • Typography drives the page — photo is supporting actor.
//   • Different from any existing layout because the NAME is the loudest
//     element, not the photo or the blessing.
//   • Strong rhythm: huge → medium → small → tiny. A clear hierarchy
//     that stops the reader.
//   • All gold accents are flat solid (no gradients, no shadows) for
//     print stability.
//
// Used by BookPageTemplate when styleSettings.template === 'poster'.

import { normalizeBlessing } from '@/lib/normalizeText'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { heebo } from '@/app/fonts'

const GOLD = '#aa8840'
const GOLD_SOFT = 'rgba(170,136,64,0.35)'
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

export default function PosterPageLayout({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const cleanText = normalizeBlessing(entry.text)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const hasName = Boolean(entry.name)
    const hasText = Boolean(cleanText)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    // Photo: deliberately small (~50% width) so it doesn't compete with
    // the name. Centered between the name banner above and the blessing
    // below. 4:3 always.
    const photoWidth = w(50)
    const photoHeight = photoWidth * 0.75

    const textColor = styleSettings.fontColor || INK
    const fontClass = styleSettings.fontClass || heebo.className

    return (
        <div
            className='relative box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor || '#fefcf6',
                backgroundImage: resolvedTexture ? 'url(' + resolvedTexture + ')' : 'none',
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: textColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: h(8) + 'px ' + w(8) + 'px',
            }}
        >
            {/* ── Top "presented by" tagline ── */}
            <div
                style={{
                    fontSize: h(1.2),
                    letterSpacing: '0.4em',
                    color: GOLD,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    marginBottom: h(2),
                    fontFamily: heebo.style?.fontFamily,
                }}
            >
                Wedding Tales · ברכה
            </div>

            {/* ── HUGE name banner ── */}
            {hasName && (
                <div
                    className={fontClass}
                    style={{
                        fontSize: h(8),
                        lineHeight: 1.0,
                        color: textColor,
                        textAlign: 'center',
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                        marginBottom: h(0.5),
                        wordBreak: 'break-word',
                        maxWidth: w(95),
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* ── Gold rule + heart + gold rule (decorative anchor) ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: w(2.5),
                    marginBottom: h(3),
                    fontSize: h(2.2),
                    color: GOLD,
                }}
            >
                <div style={{ width: w(15), height: 1.5, background: GOLD_SOFT }} />
                <Heart filled />
                <div style={{ width: w(15), height: 1.5, background: GOLD_SOFT }} />
            </div>

            {/* ── Photo: feature image, smaller ── */}
            {hasImage && (
                <div
                    style={{
                        width: photoWidth,
                        height: photoHeight,
                        background: 'url(' + entry.imageUrl + ') center/cover no-repeat',
                        border: '1px solid rgba(170,136,64,0.4)',
                        marginBottom: h(3),
                        flexShrink: 0,
                    }}
                />
            )}

            {/* ── Blessing as "tagline" — italicized serif feel ── */}
            {hasText && (
                <p
                    className={fontClass}
                    style={{
                        fontSize: h(2.0),
                        lineHeight: 1.5,
                        textAlign: 'center',
                        color: textColor,
                        fontStyle: 'italic',
                        margin: 0,
                        maxWidth: w(80),
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        whiteSpace: 'pre-line',
                        wordWrap: 'break-word',
                    }}
                >
                    “{cleanText}”
                </p>
            )}

            {/* ── Bottom presents footer ── */}
            <div
                style={{
                    fontSize: h(1.1),
                    letterSpacing: '0.35em',
                    color: GOLD,
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    marginTop: h(2),
                    fontFamily: heebo.style?.fontFamily,
                }}
            >
                — A Wedding Tale —
            </div>
        </div>
    )
}
