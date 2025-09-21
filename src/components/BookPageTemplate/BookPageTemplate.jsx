'use client'

const BASE_SIZE = 2362

export default function BookPageTemplate({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    return (
        <div
            className='relative flex flex-col items-center text-center box-border overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.texture ? `url(${styleSettings.texture})` : 'none',
                backgroundRepeat: 'repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: styleSettings.fontColor,
                borderRadius: w(styleSettings.borderRadius || 0),
                padding: h(styleSettings.pagePadding || 4),
                boxSizing: 'border-box',
            }}
        >
            {/* מסגרת מעל הכל */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='pointer-events-none absolute top-0 left-0 w-full h-full'
                    style={{
                        objectFit: 'cover',
                        zIndex: 10,
                    }}
                />
            )}

            {/* שם האורח */}
            {hasName && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        fontSize: h((styleSettings.fontSizePercent || 3) * 0.7),
                        lineHeight: 1.2,
                        color: styleSettings.fontColor,
                        opacity: 0.85,
                        maxWidth: w(60),
                        marginTop: h(2),
                        marginBottom: h(2),
                        textAlign: 'right',
                        wordWrap: 'break-word',
                        zIndex: 5,
                        position: 'relative',
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* תמונה */}
            {hasImage && (
                <div
                    className='rounded-xl shadow-md relative'
                    style={{
                        width: w(styleSettings.imageStyle?.width || 90),
                        height: h(styleSettings.imageStyle?.height || 70),
                        marginTop: h(2),
                        backgroundImage: `url(${entry.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: styleSettings.imageStyle?.borderRadius || '12px',
                        zIndex: 5,
                    }}
                />
            )}

            {/* טקסט */}
            {hasText && (
                <div
                    style={{
                        maxWidth: w(85),
                        marginTop: h(3),
                        display: 'inline-block',
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <p
                        className={styleSettings.fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSizePercent || 3),
                            color: styleSettings.fontColor,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-line',
                            wordWrap: 'break-word',
                        }}
                    >
                        {entry.text}
                    </p>
                </div>
            )}
        </div>
    )
}
