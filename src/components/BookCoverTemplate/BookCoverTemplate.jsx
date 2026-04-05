'use client'

export default function BookCoverTemplate({ styleSettings, scaledWidth, scaledHeight }) {
    const coverFontSize = ((styleSettings.coverFontSizePercent || 3) / 100) * scaledWidth
    const imgX = styleSettings.coverImageX || 50
    const imgY = styleSettings.coverImageY || 50
    const imgScale = (styleSettings.coverImageScale || 100) / 100

    // 🧩 רקע / טקסטורה
    const backgroundImage =
        styleSettings.coverTexture === 'none'
            ? 'none'
            : styleSettings.coverTexture === null
            ? styleSettings.texture
                ? `url(${styleSettings.texture})`
                : 'none'
            : styleSettings.coverTexture
            ? `url(${styleSettings.coverTexture})`
            : styleSettings.texture
            ? `url(${styleSettings.texture})`
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
                        position: 'relative',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems:
                            styleSettings.coverTextAlign === 'right'
                                ? 'flex-end'
                                : styleSettings.coverTextAlign === 'left'
                                ? 'flex-start'
                                : 'center',
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
