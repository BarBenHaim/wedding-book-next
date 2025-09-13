import { useEffect, useState } from 'react'
import mediaSample from '../lib/mediaSample.json'
const media = mediaSample
console.log(media)
export default function MediaGallery() {
    const [entries, setEntries] = useState({ images: [], videos: [], texts: [] })

    useEffect(() => {
        const allEntries = JSON.parse(localStorage.getItem('guestbookEntries') || '[]')

        const images = allEntries.filter(e => e.type === 'photo')
        const videos = allEntries.filter(e => e.type === 'video')
        const texts = allEntries.filter(e => e.type === 'text')

        setEntries({ images, videos, texts })
    }, [])

    return (
        <div className='nedia-gallery'>
            {/* תמונות */}
            {entries.images.length > 0 && (
                <>
                    <h2>📸 תמונות</h2>
                    <div className='grid'>
                        {entries.images.map((img, idx) => (
                            <img
                                key={idx}
                                src={img.content}
                                alt={`photo-${idx}`}
                                style={{ maxWidth: 200, borderRadius: 12 }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* טקסטים */}
            {entries.texts.length > 0 && (
                <>
                    <h2>📝 ברכות בטקסט</h2>
                    <div className='grid' style={{ flexDirection: 'column', gap: 12 }}>
                        {entries.texts.map((text, idx) => (
                            <div
                                key={idx}
                                style={{
                                    background: '#f6f6f6',
                                    padding: 12,
                                    borderRadius: 12,
                                    maxWidth: 600,
                                }}
                            >
                                {text.content.split('\n').map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
