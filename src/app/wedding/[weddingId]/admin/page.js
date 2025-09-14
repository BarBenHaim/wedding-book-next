'use client'

import { useEffect, useState } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'

export default function AdminDashboard() {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const { weddingId } = useParams() // מזהה החתונה מה־URL

    useEffect(() => {
        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId) // נעביר את ה־weddingId
            setEntries(data)
            setLoading(false)
        }
        fetchData()
    }, [weddingId])

    if (loading) {
        return (
            <div className='container'>
                <h1>לוח בקרה לחתן ולכלה</h1>
                <p>טוען ברכות ותמונות...</p>
            </div>
        )
    }

    return (
        <div className='container'>
            <h1>לוח בקרה לחתן ולכלה</h1>
            <p>
                ברכות ותמונות לחתונה: <strong>{weddingId}</strong>
            </p>

            <div className='grid'>
                {entries.map((entry, idx) => (
                    <div key={idx} className='card'>
                        <p>
                            <strong>{entry.type === 'text' ? '✍️ טקסט' : '📷 תמונה'}</strong>
                        </p>
                        {entry.type === 'text' && <p style={{ whiteSpace: 'pre-line' }}>{entry.content}</p>}
                        {entry.type === 'photo' && (
                            <img src={entry.content} alt='ברכה מצולמת' width='200' style={{ borderRadius: 8 }} />
                        )}
                        <p style={{ fontSize: 12, color: '#888' }}>
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString('he-IL') : '—'}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
