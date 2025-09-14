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
        setEntries(prev => prev.filter(e => e.id !== id))
    }

    if (loading) {
        return (
            <div className='flex h-screen items-center justify-center'>
                <p className='text-lg text-gray-600'>טוען נתונים...</p>
            </div>
        )
    }

    return (
        <div className='container mx-auto px-4 py-8'>
            <h1 className='mb-6 text-center text-3xl font-serif text-gray-800'>לוח בקרה לחתונה – {weddingId}</h1>

            {/* הגדרות ספר */}
            <section className='mb-10 rounded-xl bg-white p-6 shadow'>
                <h2 className='mb-4 text-xl font-semibold'>🎨 הגדרות ספר</h2>
                <div className='grid gap-4 md:grid-cols-3'>
                    <input
                        placeholder='שם הכלה'
                        value={brideName}
                        onChange={e => setBrideName(e.target.value)}
                        className='rounded-lg border border-gray-300 px-4 py-2 shadow-sm focus:border-pink-400 focus:ring-2 focus:ring-pink-200'
                    />
                    <input
                        placeholder='שם החתן'
                        value={groomName}
                        onChange={e => setGroomName(e.target.value)}
                        className='rounded-lg border border-gray-300 px-4 py-2 shadow-sm focus:border-pink-400 focus:ring-2 focus:ring-pink-200'
                    />
                    <input
                        placeholder='קישור לתמונת רקע'
                        value={backgroundImage}
                        onChange={e => setBackgroundImage(e.target.value)}
                        className='rounded-lg border border-gray-300 px-4 py-2 shadow-sm focus:border-pink-400 focus:ring-2 focus:ring-pink-200'
                    />
                </div>
                <button
                    onClick={handleSaveSettings}
                    className='mt-4 rounded-lg bg-pink-500 px-6 py-2 text-white shadow hover:bg-pink-600 transition'
                >
                    שמור
                </button>
            </section>

            {/* ניהול תכנים */}
            <section>
                <h2 className='mb-4 text-xl font-semibold'>🎁 ניהול תכנים</h2>
                {entries.length === 0 ? (
                    <p className='text-gray-500'>אין עדיין ברכות או תמונות.</p>
                ) : (
                    <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
                        {entries.map(entry => (
                            <div key={entry.id} className='rounded-xl border border-gray-200 bg-white p-4 shadow'>
                                <p className='mb-2 text-sm text-gray-500'>{entry.name || 'אורח אנונימי'}</p>

                                {entry.text && (
                                    <p className='mb-3 whitespace-pre-line text-gray-800'>
                                        <strong>✍️ ברכה:</strong>
                                        <br />
                                        {entry.text}
                                    </p>
                                )}

                                {entry.imageUrl && (
                                    <div className='mb-3'>
                                        <strong>📷 תמונה:</strong>
                                        <img
                                            src={entry.imageUrl}
                                            alt='ברכה מצולמת'
                                            className='mt-2 w-full rounded-lg shadow'
                                        />
                                    </div>
                                )}

                                <p className='mb-3 text-xs text-gray-400'>
                                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString('he-IL') : '—'}
                                </p>

                                <button
                                    onClick={() => handleDeleteEntry(entry.id)}
                                    className='w-full rounded-lg border border-red-400 px-4 py-2 text-red-600 hover:bg-red-50 transition'
                                >
                                    🗑️ מחק
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
