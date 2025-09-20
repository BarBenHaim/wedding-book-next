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
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: styleSettings.fontColor,
                borderRadius: w(styleSettings.borderRadius || 0),
                padding: h(styleSettings.pagePadding || 4),
                boxSizing: 'border-box',
            }}
        >
            {/* דקורציות */}
            {styleSettings.decorations?.includes('stars') && (
                <div className='absolute inset-0 pointer-events-none'>
                    <div className='absolute top-6 left-6 text-yellow-400 text-2xl'>⭐</div>
                    <div className='absolute bottom-10 right-10 text-yellow-300 text-xl'>⭐</div>
                    <div className='absolute top-1/2 left-1/4 text-yellow-200 text-lg'>⭐</div>
                </div>
            )}
            {styleSettings.decorations?.includes('hearts') && (
                <div className='absolute inset-0 pointer-events-none'>
                    <div className='absolute top-8 right-8 text-pink-400 text-2xl'>❤️</div>
                    <div className='absolute bottom-6 left-12 text-red-400 text-xl'>❤️</div>
                </div>
            )}
            {styleSettings.decorations?.includes('flowers') && (
                <div className='absolute inset-0 pointer-events-none'>
                    <div className='absolute top-10 left-10 text-pink-300 text-2xl'>🌸</div>
                    <div className='absolute bottom-8 right-8 text-pink-200 text-xl'>🌸</div>
                </div>
            )}
            {styleSettings.decorations?.includes('sparkles') && (
                <div className='absolute inset-0 pointer-events-none'>
                    <div className='absolute top-4 right-1/3 text-purple-300 text-2xl'>✨</div>
                    <div className='absolute bottom-12 left-1/4 text-pink-300 text-xl'>✨</div>
                </div>
            )}

            {/* שם האורח */}
            {hasName && (
                <div
                    className={styleSettings.fontClass}
                    style={{
                        fontSize: h(styleSettings.fontSize * 0.7 || 24),
                        lineHeight: 1.2,
                        color: styleSettings.fontColor,
                        opacity: 0.85,
                        maxWidth: w(60),
                        marginTop: h(2),
                        marginBottom: h(2),
                        textAlign: 'right',
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
                    className='rounded-xl shadow-md'
                    style={{
                        width: w(styleSettings.imageStyle?.width || 90),
                        height: h(styleSettings.imageStyle?.height || 70),
                        marginTop: h(2),
                        backgroundImage: `url(${entry.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: styleSettings.imageStyle?.borderRadius || '12px',
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
                    }}
                >
                    <p
                        className={styleSettings.fontClass}
                        style={{
                            fontSize: h(styleSettings.fontSize || 28),
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
