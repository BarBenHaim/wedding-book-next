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
        alert('✨ ההגדרות נשמרו בהצלחה')
    }

    async function handleDeleteEntry(id) {
        if (!confirm('האם למחוק את הברכה?')) return
        await deleteDoc(doc(db, 'weddings', weddingId, 'entries', id))
        setEntries(prev => prev.filter(e => e.id !== id))
    }

    if (loading) {
        return (
            <div className='flex h-[calc(100vh-4rem)] items-center justify-center'>
                <p className='text-lg text-gray-600 animate-pulse'>טוען נתונים...</p>
            </div>
        )
    }

    return (
        <div className='relative min-h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 px-6 py-10'>
            <div className='mx-auto max-w-6xl space-y-10'>
                {/* כותרת */}
                <div className='text-center'>
                    <h1 className='text-4xl font-bold text-gray-800 mb-2'>
                        {brideName || groomName
                            ? `ברוכים הבאים לאזור הניהול של ${brideName} & ${groomName}`
                            : 'אזור הניהול של ספר החתונה'}
                    </h1>
                    <p className='text-gray-600'>כאן תוכלו לנהל את ההגדרות, הברכות והתמונות שנכנסות לספר.</p>
                </div>

                {/* הגדרות ספר */}
                <section className='rounded-2xl bg-white/90 backdrop-blur-sm p-8 shadow-lg'>
                    <h2 className='mb-6 text-2xl font-semibold text-purple-700'>🎨 הגדרות ספר</h2>
                    <div className='grid gap-6 md:grid-cols-3'>
                        <input
                            placeholder='שם הכלה'
                            value={brideName}
                            onChange={e => setBrideName(e.target.value)}
                            className='rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                        <input
                            placeholder='שם החתן'
                            value={groomName}
                            onChange={e => setGroomName(e.target.value)}
                            className='rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                        <input
                            placeholder='קישור לתמונת רקע'
                            value={backgroundImage}
                            onChange={e => setBackgroundImage(e.target.value)}
                            className='rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                    </div>
                    <button
                        onClick={handleSaveSettings}
                        className='mt-6 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-8 py-3 text-white font-medium shadow-lg hover:scale-105 transition'
                    >
                        💾 שמור שינויים
                    </button>
                </section>

                {/* ניהול תכנים */}
                <section>
                    <h2 className='mb-6 text-2xl font-semibold text-purple-700'>🎁 ניהול ברכות ותמונות</h2>
                    {entries.length === 0 ? (
                        <p className='text-gray-500 text-center'>עדיין אין ברכות או תמונות.</p>
                    ) : (
                        <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
                            {entries.map(entry => (
                                <div
                                    key={entry.id}
                                    className='rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm p-6 shadow-lg'
                                >
                                    <p className='mb-2 text-sm text-gray-500'>{entry.name || 'אורח אנונימי'}</p>

                                    {entry.text && (
                                        <p className='mb-4 whitespace-pre-line text-gray-800'>
                                            <strong className='text-purple-600'>✍️ ברכה:</strong>
                                            <br />
                                            {entry.text}
                                        </p>
                                    )}

                                    {entry.imageUrl && (
                                        <div className='mb-4'>
                                            <strong className='text-pink-600'>📷 תמונה:</strong>
                                            <img
                                                src={entry.imageUrl}
                                                alt='ברכה מצולמת'
                                                className='mt-2 w-full rounded-xl shadow'
                                            />
                                        </div>
                                    )}

                                    <p className='mb-4 text-xs text-gray-400'>
                                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString('he-IL') : '—'}
                                    </p>

                                    <button
                                        onClick={() => handleDeleteEntry(entry.id)}
                                        className='w-full rounded-xl border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50 transition'
                                    >
                                        🗑️ מחק ברכה
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
