'use client'

export default function BookCoverTemplate({ styleSettings, scaledWidth, scaledHeight }) {
    const w = percent => (percent / 100) * scaledWidth
    const h = percent => (percent / 100) * scaledHeight

    return (
        <div
            className='relative flex flex-col items-center justify-center text-center overflow-hidden'
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.texture ? `url(${styleSettings.texture})` : 'none',
                backgroundSize: 'cover',
                backgroundRepeat: 'repeat',
                backgroundPosition: 'center',
                color: styleSettings.fontColor,
            }}
        >
            {/* כותרת הכריכה */}
            <h1
                className={styleSettings.fontClass}
                style={{
                    fontSize: h(styleSettings.coverTitleSizePercent ?? 6),
                    fontWeight: 'bold',
                    color: styleSettings.fontColor,
                }}
            >
                {styleSettings.coverTitle || 'החתונה שלנו'}
            </h1>

            {/* תת־כותרת (אופציונלי) */}
            {styleSettings.coverSubtitle && (
                <p
                    className={styleSettings.fontClass}
                    style={{
                        fontSize: h(styleSettings.coverSubtitleSizePercent ?? 3),
                        marginTop: h(2),
                        opacity: 0.9,
                        color: styleSettings.fontColor,
                    }}
                >
                    {styleSettings.coverSubtitle}
                </p>
            )}

            {/* מסגרת */}
            {styleSettings.frame && (
                <img
                    src={styleSettings.frame}
                    alt='frame'
                    className='absolute top-0 left-0 w-full h-full pointer-events-none'
                    style={{
                        zIndex: 10,
                        objectFit: 'cover',
                    }}
                />
            )}
        </div>
    )
}
