'use client'

export default function BookCoverTemplate({ styleSettings, scaledWidth, scaledHeight }) {
    const coverFontSize = ((styleSettings.coverFontSizePercent || 3) / 100) * scaledWidth

    return (
        <div
            className='relative flex flex-col items-center justify-center text-center overflow-hidden'
            style={{
                width: scaledWidth,
                height: scaledHeight,
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.coverImage
                    ? `url(${styleSettings.coverImage})`
                    : styleSettings.coverTexture || styleSettings.texture
                    ? `url(${styleSettings.coverTexture || styleSettings.texture})`
                    : 'none',
                backgroundSize: 'cover',
                backgroundPosition: `${styleSettings.coverImageX || 50}% ${styleSettings.coverImageY || 50}%`,
                backgroundRepeat: 'no-repeat',
            }}
        >
            {/* מסגרת */}
            {styleSettings.coverFrame && styleSettings.coverFrame !== 'none' && (
                <img
                    src={styleSettings.coverFrame}
                    alt='frame'
                    className='absolute inset-0 w-full h-full object-contain pointer-events-none'
                    style={{ zIndex: 5 }}
                />
            )}

            {/* טקסט */}
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
                    }}
                >
                    {styleSettings.coverTitle && (
                        <h1
                            className={styleSettings.fontClass}
                            style={{
                                color: styleSettings.coverTextColor || styleSettings.fontColor,
                                fontSize: `${coverFontSize}px`,
                                margin: 0,
                                maxWidth: ((styleSettings.textMaxWidth || 80) / 100) * scaledWidth,
                            }}
                        >
                            {styleSettings.coverTitle}
                        </h1>
                    )}
                    {styleSettings.coverSubtitle && (
                        <h2
                            className={`${styleSettings.fontClass}`}
                            style={{
                                color: styleSettings.coverTextColor || styleSettings.fontColor,
                                fontSize: `${coverFontSize * 0.7}px`,
                                margin: 0,
                                marginTop: '0.5em',
                                maxWidth: ((styleSettings.textMaxWidth || 80) / 100) * scaledWidth,
                            }}
                        >
                            {styleSettings.coverSubtitle}
                        </h2>
                    )}
                </div>
            )}
        </div>
    )
}
