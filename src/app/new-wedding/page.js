'use client'

import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient'
import { useRouter } from 'next/navigation'

export default function NewWeddingPage() {
    const [name, setName] = useState('')
    const [date, setDate] = useState('')
    const [emails, setEmails] = useState('')
    const [loading, setLoading] = useState(false)
    const [weddingId, setWeddingId] = useState(null)
    const router = useRouter()

    async function handleCreate(e) {
        e.preventDefault()
        setLoading(true)

        try {
            const docRef = await addDoc(collection(db, 'weddings'), {
                name,
                date,
                coupleEmails: emails.split(',').map(e => e.trim()),
                createdAt: new Date(),
            })
            setWeddingId(docRef.id)
        } catch (err) {
            console.error('שגיאה ביצירת חתונה:', err)
            alert('לא הצלחנו ליצור חתונה חדשה')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='container'>
            <h1 className='title'>✨ יצירת חתונה חדשה</h1>

            {!weddingId ? (
                <form onSubmit={handleCreate} style={{ display: 'grid', gap: 16, maxWidth: 500 }}>
                    <label>
                        שם החתונה:
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='למשל: חתונה של דנה ואסף'
                            required
                        />
                    </label>

                    <label>
                        תאריך:
                        <input type='date' value={date} onChange={e => setDate(e.target.value)} required />
                    </label>

                    <label>
                        מיילים של החתן והכלה (מופרדים בפסיקים):
                        <input
                            value={emails}
                            onChange={e => setEmails(e.target.value)}
                            placeholder='example1@gmail.com, example2@gmail.com'
                            required
                        />
                    </label>

                    <button type='submit' className='btn btn-primary' disabled={loading}>
                        {loading ? 'יוצר...' : 'צור חתונה'}
                    </button>
                </form>
            ) : (
                <div className='card' style={{ textAlign: 'center' }}>
                    <h2>✅ החתונה נוצרה בהצלחה!</h2>
                    <p>זה ה־ID של החתונה שלך:</p>
                    <code>{weddingId}</code>
                    <p style={{ marginTop: 16 }}>
                        לינק לאורחים: <br />
                        <a href={`/wedding/${weddingId}`} className='btn btn-gold'>
                            https://your-app.com/wedding/{weddingId}
                        </a>
                    </p>
                    <button onClick={() => router.push(`/wedding/${weddingId}/admin`)} className='btn'>
                        עבור ללוח הבקרה
                    </button>
                </div>
            )}
        </div>
    )
}
