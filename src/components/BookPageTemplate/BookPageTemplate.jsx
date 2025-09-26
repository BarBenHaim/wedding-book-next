'use client'

const BASE_SIZE = 2362

export default function BookPageTemplate({ entry, styleSettings, scaledWidth, scaledHeight }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    const elementsCount = [hasName, hasText, hasImage].filter(Boolean).length
    const onlyOne = elementsCount === 1

    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    return (
        <div
            className={`relative flex flex-col items-center text-center box-border overflow-hidden ${
                onlyOne ? 'justify-center' : ''
            }`}
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
                padding: h(styleSettings.pagePadding ?? 4),
                boxSizing: 'border-box',
            }}
        >
            {/* מסגרת */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{ zIndex: 10, objectFit: 'cover' }}
                />
            )}

            {/* שם האורח */}
            {hasName && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        fontSize: h(
                            styleSettings.nameFontSizePercent ??
                                (styleSettings.fontSizePercent ? styleSettings.fontSizePercent * 0.7 : 2.1)
                        ),
                        color: styleSettings.fontColor,
                        opacity: 0.85,
                        marginTop: onlyOne ? 0 : h(styleSettings.nameMarginTop ?? 2),
                        marginBottom: onlyOne ? 0 : h(styleSettings.nameMarginBottom ?? 2),
                        textAlign: styleSettings.nameAlign ?? 'center',
                        maxWidth: w(styleSettings.nameMaxWidth ?? 60),
                        wordWrap: 'break-word',
                        position: 'relative',
                        zIndex: 5,
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
                        width: w(styleSettings.imageStyle?.width ?? 90),
                        height: h(styleSettings.imageStyle?.height ?? 70),
                        backgroundImage: `url(${entry.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: styleSettings.imageStyle?.borderRadius ?? '12px',
                        marginTop: onlyOne ? 0 : h(styleSettings.imageMarginTop ?? 2),
                        marginBottom: onlyOne ? 0 : h(styleSettings.imageMarginBottom ?? 2),
                        alignSelf:
                            styleSettings.imageAlign === 'left'
                                ? 'flex-start'
                                : styleSettings.imageAlign === 'right'
                                ? 'flex-end'
                                : 'center',
                        zIndex: 5,
                    }}
                />
            )}

            {/* טקסט */}
            {hasText && (
                <div
                    style={{
                        maxWidth: w(styleSettings.textMaxWidth ?? 85),
                        marginTop: onlyOne ? 0 : h(styleSettings.textMarginTop ?? 3),
                        textAlign: styleSettings.textAlign ?? 'center',
                        position: 'relative',
                        zIndex: 5,
                    }}
                >
                    <p
                        className={styleSettings.fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSizePercent ?? 3),
                            color: styleSettings.fontColor,
                            lineHeight: styleSettings.textLineHeight ?? 1.5,
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
