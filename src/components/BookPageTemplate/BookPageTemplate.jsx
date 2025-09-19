const BASE_SIZE = 2362

// מסגרות אפשריות (זהות למה שיש ב-DesignControls)
const IMAGE_FRAMES = {
    none: {},
    gold: {
        border: '4px solid #d4af37',
        boxShadow: '0 4px 15px rgba(212,175,55,0.3)',
    },
    vintage: {
        border: '6px double #7a5230',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.4)',
    },
    modern: {
        border: 'none',
        boxShadow: '0 6px 15px rgba(0,0,0,0.25)',
    },
}

export default function BookPageTemplate({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    return (
        <div
            className='relative flex flex-col items-center text-center box-border'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.textureUrl ? `url(${styleSettings.textureUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: styleSettings.fontColor,
                border: `${w(styleSettings.borderWidth)}px solid ${styleSettings.borderColor}`,
                borderRadius: w(styleSettings.borderRadius),
                padding: h(styleSettings.pagePadding),
                boxSizing: 'border-box',
            }}
        >
            {/* שם האורח */}
            {hasName && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        top: h(2),
                        right: w(2),
                        fontSize: h(styleSettings.fontSize * 0.8),
                        lineHeight: 1.2,
                        color: styleSettings.fontColor,
                        opacity: 0.8,
                        maxWidth: w(60),
                        textAlign: 'right',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        zIndex: 5,
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* תמונה */}
            {hasImage && (
                <div
                    style={{
                        width: w(styleSettings.imageStyle.width),
                        maxWidth: '100%',
                        height: h(styleSettings.imageStyle.height),
                        marginTop: h(styleSettings.imageStyle.marginTop),
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <img
                        src={entry.imageUrl}
                        alt='תמונה מהאורח'
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: styleSettings.imageStyle.borderRadius,
                            objectFit: 'cover',
                            display: 'block',
                            // חיבור בין סגנונות בסיס לסגנון המסגרת
                            ...IMAGE_FRAMES[styleSettings.imageStyle.frame || 'none'],
                        }}
                    />
                </div>
            )}

            {/* טקסט */}
            {hasText && (
                <div
                    style={{
                        maxWidth: w(85),
                        marginTop: h(3),
                    }}
                >
                    <p
                        className={styleSettings.fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSize),
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
