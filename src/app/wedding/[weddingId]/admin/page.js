'use client'

import { useEffect, useState } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'

export default function AdminDashboard() {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [brideName, setBrideName] = useState('')
    const [groomName, setGroomName] = useState('')
    const [backgroundImage, setBackgroundImage] = useState('')
    const { weddingId } = useParams()

    useEffect(() => {
        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            setEntries(data)
            setLoading(false)

            const weddingDoc = await getDoc(doc(db, 'weddings', weddingId))
            if (weddingDoc.exists()) {
                const data = weddingDoc.data()
                setBrideName(data.brideName || '')
                setGroomName(data.groomName || '')
                setBackgroundImage(data.backgroundImage || '')
            }
        }
        fetchData()
    }, [weddingId])

    async function handleSaveSettings() {
        if (!weddingId) return
        await updateDoc(doc(db, 'weddings', weddingId), {
            brideName,
            groomName,
            backgroundImage,
        })
        alert('ההגדרות נשמרו בהצלחה')
    }

    async function handleDeleteEntry(id) {
        if (!confirm('האם אתה בטוח שברצונך למחוק את הברכה?')) return
        await deleteDoc(doc(db, 'weddings', weddingId, 'entries', id))
        setEntries(entries.filter(e => e.id !== id))
    }

    if (loading) {
        return (
            <div className='container'>
                <h1>לוח בקרה לחתן ולכלה</h1>
                <p>טוען נתונים...</p>
            </div>
        )
    }

    return (
        <div className='container'>
            <h1>לוח בקרה לחתונה – {weddingId}</h1>

            <section style={{ marginBottom: 32 }}>
                <h2>🎨 הגדרות ספר</h2>
                <input placeholder='שם הכלה' value={brideName} onChange={e => setBrideName(e.target.value)} />
                <input placeholder='שם החתן' value={groomName} onChange={e => setGroomName(e.target.value)} />
                <input
                    placeholder='קישור לתמונת רקע'
                    value={backgroundImage}
                    onChange={e => setBackgroundImage(e.target.value)}
                />
                <button onClick={handleSaveSettings}>שמור</button>
            </section>

            <section>
                <h2>🎁 ניהול תכנים</h2>
                <div className='grid'>
                    {entries.map((entry, idx) => (
                        <div key={entry.id} className='card'>
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
                            <button onClick={() => handleDeleteEntry(entry.id)}>🗑️ מחק</button>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
