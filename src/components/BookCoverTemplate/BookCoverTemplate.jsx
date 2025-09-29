'use client'

export default function BookCoverTemplate({ styleSettings, scaledWidth, scaledHeight }) {
    const w = p => (p / 100) * scaledWidth
    const h = p => (p / 100) * scaledHeight
    const coverFontSize = ((styleSettings.coverFontSizePercent || 3) / 100) * scaledWidth

    return (
        <div
            className='relative flex flex-col items-center justify-center text-center overflow-hidden'
            style={{
                width: scaledWidth,
                height: scaledHeight,
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: `url(${styleSettings.coverTexture || styleSettings.texture || ''})`,
                backgroundSize: 'cover',
            }}
        >
            {/* מסגרת */}
            {styleSettings.coverFrame && (
                <img
                    src={styleSettings.coverFrame}
                    alt='frame'
                    className='absolute inset-0 w-full h-full object-contain pointer-events-none'
                    style={{ zIndex: 5 }}
                />
            )}

            {/* תמונה */}
            {styleSettings.coverImage && (
                <img
                    src={styleSettings.coverImage}
                    alt='cover'
                    style={{
                        position: 'absolute',
                        top: h(styleSettings.coverImageY || 0),
                        left: w(styleSettings.coverImageX || 0),
                        width: w(styleSettings.coverImageScale || 80),
                        height: 'auto',
                        objectFit: 'contain',
                        zIndex: 1,
                    }}
                />
            )}

            {/* טקסט */}
            {styleSettings.coverTitle && (
                <h1
                    className={styleSettings.fontClass}
                    style={{
                        color: styleSettings.fontColor,
                        fontSize: `${coverFontSize}px`,
                        zIndex: 10,
                        marginTop: h(styleSettings.nameMarginTop || 5),
                        maxWidth: w(styleSettings.textMaxWidth || 80),
                    }}
                >
                    {styleSettings.coverTitle}
                </h1>
            )}
            {styleSettings.coverSubtitle && (
                <h2
                    className={`${styleSettings.fontClass} mt-2`}
                    style={{
                        color: styleSettings.fontColor,
                        fontSize: `${coverFontSize * 0.7}px`,
                        zIndex: 10,
                        maxWidth: w(styleSettings.textMaxWidth || 80),
                    }}
                >
                    {styleSettings.coverSubtitle}
                </h2>
            )}
        </div>
    )
}
