export function TemplateClassic({ entry }) {
    const isImage = typeof entry.content === 'string' && entry.content.startsWith('http')

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px',
                backgroundColor: '#fff8f0',
                border: '2px solid #e0c5aa',
                borderRadius: 10,
                fontFamily: 'serif',
                textAlign: 'center',
                boxSizing: 'border-box',
            }}
        >
            <div>
                <h2 style={{ color: '#d17b0f' }}>{entry.name}</h2>
                {isImage ? (
                    <img
                        src={entry.content}
                        alt=''
                        style={{
                            width: '100%',
                            maxHeight: '350px',
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '2px solid #ccc',
                            marginTop: 10,
                        }}
                    />
                ) : (
                    <p style={{ fontSize: 18, lineHeight: 1.6 }}>{entry.content}</p>
                )}
            </div>
        </div>
    )
}

export function TemplateFramedPhoto({ entry }) {
    const isImage = typeof entry.content === 'string' && entry.content.startsWith('http')

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px',
                backgroundColor: '#e9f5ff',
                border: '5px double #88bbee',
                borderRadius: 12,
                boxSizing: 'border-box',
                fontFamily: 'sans-serif',
                textAlign: 'center',
            }}
        >
            <div>
                <h2 style={{ color: '#336699' }}>{entry.name}</h2>
                {isImage ? (
                    <img
                        src={entry.content}
                        alt=''
                        style={{
                            width: '100%',
                            maxHeight: '350px',
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '4px solid #ccc',
                            marginTop: 10,
                        }}
                    />
                ) : (
                    <p
                        style={{
                            fontSize: 18,
                            lineHeight: 1.6,
                            marginTop: 15,
                            backgroundColor: '#fff',
                            padding: 10,
                            borderRadius: 6,
                            boxShadow: '0 0 5px rgba(0,0,0,0.1)',
                        }}
                    >
                        {entry.content}
                    </p>
                )}
            </div>
        </div>
    )
}

export function TemplateFloral({ entry }) {
    const isImage = typeof entry.content === 'string' && entry.content.startsWith('http')

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px',
                backgroundImage: 'url(https://www.transparenttextures.com/patterns/flowers.png)',
                backgroundColor: '#fff0f5',
                borderRadius: 10,
                boxSizing: 'border-box',
                fontFamily: 'cursive',
                textAlign: 'center',
            }}
        >
            <div>
                <h2 style={{ color: '#a52a2a' }}>{entry.name}</h2>
                {isImage ? (
                    <img
                        src={entry.content}
                        alt=''
                        style={{
                            width: '100%',
                            maxHeight: '350px',
                            objectFit: 'cover',
                            borderRadius: 8,
                            border: '3px solid #d899bb',
                            marginTop: 10,
                        }}
                    />
                ) : (
                    <p style={{ fontSize: 18, color: '#333' }}>{entry.content}</p>
                )}
            </div>
        </div>
    )
}
