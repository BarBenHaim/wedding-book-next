'use client'

import { resolveTextureUrl } from '@/lib/resolveAsset'

// ─── Cover text position presets ─────────────────────────────────────────────
// One of 9 anchors on the cover. Falls back to the original centered layout
// when the field is missing on legacy docs (backward-compat).
//
//   ┌─────────┬─────────┬─────────┐
//   │  tl     │   tc    │   tr    │
//   ├─────────┼─────────┼─────────┤
//   │  cl     │ center  │   cr    │
//   ├─────────┼─────────┼─────────┤
//   │  bl     │   bc    │   br    │
//   └─────────┴─────────┴─────────┘
//
// `edge` = distance from the cover edge, expressed as a % of the cover height
// so the spacing scales naturally with the preview/PDF render.
const EDGE = '6%'

function getTextPositionStyle(position) {
    switch (position) {
        case 'tl':
            return { position: 'absolute', top: EDGE, left: EDGE }
        case 'tc':
            return { position: 'absolute', top: EDGE, left: '50%', transform: 'translateX(-50%)' }
        case 'tr':
            return { position: 'absolute', top: EDGE, right: EDGE }
        case 'cl':
            return { position: 'absolute', top: '50%', left: EDGE, transform: 'translateY(-50%)' }
        case 'cr':
            return { position: 'absolute', top: '50%', right: EDGE, transform: 'translateY(-50%)' }
        case 'bl':
            return { position: 'absolute', bottom: EDGE, left: EDGE }
        case 'bc':
            return { position: 'absolute', bottom: EDGE, left: '50%', transform: 'translateX(-50%)' }
        case 'br':
            return { position: 'absolute', bottom: EDGE, right: EDGE }
        case 'center':
        default:
            // Keep the original centered-in-flex behavior so untouched covers
            // render byte-identically to before this feature shipped.
            return { position: 'relative' }
    }
}

// When the user hasn't explicitly set a text-internal alignment, infer a
// sensible one from the chosen position (right-side anchors → right-aligned,
// etc.). Explicit `coverTextAlign` still wins.
function inferAlignItems(position, explicitAlign) {
    if (explicitAlign === 'right') return 'flex-end'
    if (explicitAlign === 'left') return 'flex-start'
    if (explicitAlign === 'center') return 'center'
    switch (position) {
        case 'tl':
        case 'cl':
        case 'bl':
            return 'flex-start'
        case 'tr':
        case 'cr':
        case 'br':
            return 'flex-end'
        default:
            return 'center'
    }
}

export default function BookCoverTemplate({ styleSettings, scaledWidth, scaledHeight }) {
    const coverFontSize = ((styleSettings.coverFontSizePercent || 3) / 100) * scaledWidth
    const imgX = styleSettings.coverImageX || 50
    const imgY = styleSettings.coverImageY || 50
    const imgScale = (styleSettings.coverImageScale || 100) / 100
    const textPosition = styleSettings.coverTextPosition || 'center'
    const textPositionStyle = getTextPositionStyle(textPosition)
    const alignItems = inferAlignItems(textPosition, styleSettings.coverTextAlign)

    // 🧩 רקע / טקסטורה
    // Resolve legacy /_next/static/media/tex*.<hash>.png URLs to the stable
    // /textures/*.png paths so covers saved before the stable-URL refactor
    // still render.
    const resolvedCoverTexture = resolveTextureUrl(styleSettings.coverTexture)
    const resolvedTexture = resolveTextureUrl(styleSettings.texture)
    const backgroundImage =
        resolvedCoverTexture === 'none'
            ? 'none'
            : resolvedCoverTexture === null || resolvedCoverTexture === undefined
            ? resolvedTexture
                ? `url(${resolvedTexture})`
                : 'none'
            : resolvedCoverTexture
            ? `url(${resolvedCoverTexture})`
            : resolvedTexture
            ? `url(${resolvedTexture})`
            : 'none'

    // 🧩 מסגרת
    const frameSrc =
        styleSettings.coverFrame === 'none'
            ? null
            : styleSettings.coverFrame === null
            ? styleSettings.frame
            : styleSettings.coverFrame

    return (
        <div
            className='relative flex flex-col items-center justify-center text-center overflow-hidden'
            style={{
                width: scaledWidth,
                height: scaledHeight,
                backgroundColor: styleSettings.backgroundColor || '#ffffff',
                backgroundImage,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
            }}
        >
            {/* תמונת כריכה */}
            {styleSettings.coverImage && (
                <img
                    src={styleSettings.coverImage}
                    alt='cover'
                    className='absolute'
                    style={{
                        top: `${imgY}%`,
                        left: `${imgX}%`,
                        transform: `translate(-50%, -50%) scale(${imgScale})`,
                        width: 'auto',
                        height: 'auto',
                        maxWidth: '80%',
                        maxHeight: '80%',
                        objectFit: 'contain',
                        zIndex: 3,
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* מסגרת */}
            {frameSrc && (
                <img
                    src={frameSrc}
                    alt='frame'
                    className='absolute inset-0 w-full h-full object-contain pointer-events-none'
                    style={{ zIndex: 5 }}
                />
            )}

            {/* טקסטים */}
            {(styleSettings.coverTitle || styleSettings.coverSubtitle) && (
                <div
                    style={{
                        ...textPositionStyle,
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems,
                        background: styleSettings.coverTextBg || 'transparent',
                        padding: styleSettings.coverTextBg ? '0.5em 1em' : 0,
                        borderRadius: styleSettings.coverTextBg ? '8px' : 0,
                        maxWidth: ((styleSettings.textMaxWidth || 80) / 100) * scaledWidth,
                    }}
                >
                    {styleSettings.coverTitle && (
                        <h1
                            className={styleSettings.fontClass}
                            style={{
                                color: styleSettings.coverTextColor || styleSettings.fontColor || '#000',
                                fontSize: `${coverFontSize}px`,
                                margin: 0,
                                textShadow:
                                    styleSettings.coverTextBg || styleSettings.backgroundColor !== '#ffffff'
                                        ? 'none'
                                        : '0 0 8px rgba(0,0,0,0.3)',
                            }}
                        >
                            {styleSettings.coverTitle}
                        </h1>
                    )}
                    {styleSettings.coverSubtitle && (
                        <h2
                            className={styleSettings.fontClass}
                            style={{
                                color: styleSettings.coverTextColor || styleSettings.fontColor || '#000',
                                fontSize: `${coverFontSize * 0.7}px`,
                                margin: 0,
                                marginTop: '0.5em',
                                textShadow:
                                    styleSettings.coverTextBg || styleSettings.backgroundColor !== '#ffffff'
                                        ? 'none'
                                        : '0 0 6px rgba(0,0,0,0.3)',
                            }}
                        >
                            {styleSettings.coverSubtitle}
                        </h2>
                    )}
                </div>
            )}

            {/* שכבת overlay אם בעתיד תוסיף אפקט נוסף */}
            {styleSettings.coverOverlay && styleSettings.coverOverlay !== 'none' && (
                <div
                    className='absolute inset-0 pointer-events-none opacity-40'
                    style={{
                        backgroundImage: `url(${styleSettings.coverOverlay})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        zIndex: 4,
                    }}
                />
            )}
        </div>
    )
}
