export default function BookPageTemplate({ entry, styleSettings }) {
    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: styleSettings.backgroundColor,
                backgroundImage: styleSettings.textureUrl ? `url(${styleSettings.textureUrl})` : 'none',
                backgroundSize: 'cover',
                fontFamily: styleSettings.fontFamily,
                fontSize: `${styleSettings.fontSize}px`,
                color: styleSettings.fontColor,
                border: `${styleSettings.borderWidth}px solid ${styleSettings.borderColor}`,
                borderRadius: styleSettings.borderRadius,
                padding: '20px',
                textAlign: 'center',
                boxSizing: 'border-box',
            }}
        >
            <div>
                <h2>{entry.name}</h2>
                {entry.type === 'text' && <p>{entry.content}</p>}
                {entry.type === 'photo' && (
                    <img
                        src={entry.content}
                        alt=''
                        style={{
                            maxWidth: '100%',
                            maxHeight: '320px',
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            marginTop: '10px',
                        }}
                    />
                )}
            </div>
        </div>
    )
}
