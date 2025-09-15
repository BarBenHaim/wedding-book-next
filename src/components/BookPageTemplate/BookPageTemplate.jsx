// BookPageTemplate.jsx
export default function BookPageTemplate({ entry, styleSettings, printMode = false }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    // יחס הקטנה – במסך קטן פי 4 מהפרינט
    const scaleFactor = printMode ? 1 : 0.25

    // פונקציה שממירה ערכים
    const scale = value => {
        if (typeof value === 'number') return value * scaleFactor + 'px'
        if (typeof value === 'string' && value.endsWith('px')) {
            return parseFloat(value) * scaleFactor + 'px'
        }
        return value // אחוזים או ערכים שלא קשורים לגודל
    }

    return (
        <div
            className='
                relative h-full flex flex-col items-center text-center
                rounded-2xl box-border border shadow-lg transition-all
            '
            style={{
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.textureUrl ? `url(${styleSettings.textureUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                fontFamily: styleSettings.fontFamily,
                fontSize: scale(styleSettings.fontSize),
                color: styleSettings.fontColor,
                borderColor: styleSettings.borderColor,
                borderWidth: scale(styleSettings.borderWidth),
                borderRadius: scale(styleSettings.borderRadius),
                padding: scale(120),
            }}
        >
            {/* שם האורח */}
            {hasName && (
                <div
                    className='absolute opacity-70'
                    style={{
                        top: scale(20),
                        right: scale(30),
                        color: styleSettings.fontColor,
                        fontSize: scale(styleSettings.fontSize * 0.7),
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
                    className='mx-auto'
                    style={{
                        ...styleSettings.imageStyle,
                        display: 'block',
                        margin: '0 auto',
                        maxHeight: scale(1600),
                        maxWidth: scale(2000),
                        objectFit: 'contain',
                    }}
                />
            )}

            {/* ברכה */}
            {hasText && (
                <div className='flex-none mt-4' style={{ maxWidth: '85%' }}>
                    <p
                        className='whitespace-pre-line leading-relaxed'
                        style={{
                            fontSize: scale(styleSettings.fontSize),
                            color: styleSettings.fontColor,
                        }}
                    >
                        {entry.text}
                    </p>
                </div>
            )}
        </div>
    )
}
