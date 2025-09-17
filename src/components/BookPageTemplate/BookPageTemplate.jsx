export default function BookPageTemplate({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    // פונקציות עזר
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
            }}
        >
            {/* שם האורח */}
            {hasName && (
                <div
                    style={{
                        position: 'absolute',
                        top: h(2),
                        right: w(2),
                        fontSize: h(styleSettings.fontSize),
                        opacity: 0.7,
                    }}
                >
                    {entry.name}
                </div>
            )}

            {/* תמונה */}
            {hasImage && (
                <img
                    src={entry.imageUrl}
                    alt='תמונה מהאורח'
                    style={{
                        width: `${styleSettings.imageStyle.width}%`,
                        maxHeight: `${styleSettings.imageStyle.height}%`,
                        borderRadius: styleSettings.imageStyle.borderRadius,
                        borderWidth: styleSettings.imageStyle.borderWidth,
                        borderStyle: styleSettings.imageStyle.borderStyle,
                        boxShadow: styleSettings.imageStyle.boxShadow,
                        objectFit: 'contain',
                        marginTop: `${styleSettings.imageStyle.marginTop}%`,
                        display: 'block',
                    }}
                />
            )}

            {/* טקסט */}
            {hasText && (
                <div style={{ maxWidth: '85%', marginTop: h(3) }}>
                    <p
                        style={{
                            fontSize: h(styleSettings.fontSize),
                            color: styleSettings.fontColor,
                            lineHeight: 1.4,
                            whiteSpace: 'pre-line',
                        }}
                    >
                        {entry.text}
                    </p>
                </div>
            )}
        </div>
    )
}
