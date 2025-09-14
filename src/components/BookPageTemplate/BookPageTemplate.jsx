// BookPageTemplate.jsx
export default function BookPageTemplate({ entry, styleSettings }) {
    const hasName = Boolean(entry.name)
    const hasText = Boolean(entry.text)
    const hasImage = Boolean(entry.imageUrl)

    return (
        <div
            className='
                relative h-full flex flex-col items-center text-center
                p-6 rounded-2xl box-border border shadow-lg transition-all
            '
            style={{
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.textureUrl ? `url(${styleSettings.textureUrl})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                fontFamily: styleSettings.fontFamily,
                fontSize: `${styleSettings.fontSize}px`,
                color: styleSettings.fontColor,
                borderColor: styleSettings.borderColor,
                borderWidth: styleSettings.borderWidth,
                borderRadius: styleSettings.borderRadius,
            }}
        >
            {/* שם האורח בפינה ימין למעלה */}
            {hasName && (
                <div className='absolute top-2 right-3 text-sm opacity-70' style={{ color: styleSettings.fontColor }}>
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
                    }}
                />
            )}

            {/* ברכה */}
            {hasText && (
                <div className='flex-none mt-2 max-w-[85%]'>
                    <p
                        className='whitespace-pre-line leading-relaxed text-base sm:text-lg'
                        style={{
                            fontSize: `${styleSettings.fontSize * 0.95}px`,
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
