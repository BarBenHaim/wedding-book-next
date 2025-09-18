const BASE_SIZE = 2362

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
                fontFamily: styleSettings.fontFamily,
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
                    style={{
                        position: 'absolute',
                        top: h(2),
                        right: w(2),
                        fontSize: h(styleSettings.fontSize * 0.8), // טיפה קטן מהטקסט
                        lineHeight: 1.2,
                        color: styleSettings.fontColor,
                        opacity: 0.8,
                        maxWidth: w(60), // הרבה יותר גמיש
                        textAlign: 'right',
                        whiteSpace: 'normal', // שורות שבורות במקום חתוך
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
                            borderWidth: styleSettings.imageStyle.borderWidth,
                            borderStyle: styleSettings.imageStyle.borderStyle,
                            boxShadow: styleSettings.imageStyle.boxShadow,
                            objectFit: 'cover',
                            display: 'block',
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
