'use client'

import { useEffect, useState } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'
import { doc, updateDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'

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

    // גרירה ושמירה אוטומטית
    async function handleDragEnd(result) {
        if (!result.destination) return
        const reordered = Array.from(entries)
        const [moved] = reordered.splice(result.source.index, 1)
        reordered.splice(result.destination.index, 0, moved)
        setEntries(reordered)

        // שמירה ל־Firestore לפי הסדר החדש
        const batch = writeBatch(db)
        reordered.forEach((entry, index) => {
            batch.update(doc(db, 'weddings', weddingId, 'entries', entry.id), {
                orderIndex: index,
            })
        })
        await batch.commit()
    }

    // איפוס לסדר כרונולוגי
    async function resetToChronological() {
        const sorted = [...entries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        setEntries(sorted)

        const batch = writeBatch(db)
        sorted.forEach((entry, index) => {
            batch.update(doc(db, 'weddings', weddingId, 'entries', entry.id), {
                orderIndex: index,
            })
        })
        await batch.commit()
    }

    if (loading) {
        return (
            <div className='flex h-[calc(100vh-4rem)] items-center justify-center'>
                <p className='text-lg text-gray-600 animate-pulse'>טוען נתונים...</p>
            </div>
        )
    }

    return (
        <AdminPageWrapper>
            <div className='relative min-h-[calc(100vh-4rem)] bg-gradient-to-br from-purple-50 via-white to-purple-100 px-6 py-10'>
                <div className='mx-auto max-w-5xl space-y-10'>
                    {/* כותרת */}
                    <div className='text-center'>
                        <h1 className='text-3xl font-bold text-gray-800 mb-2'>
                            {brideName || groomName
                                ? `ניהול ספר החתונה של ${brideName} & ${groomName}`
                                : 'ניהול ספר החתונה'}
                        </h1>
                        <p className='text-gray-600'>כאן תנהלו הגדרות, ברכות ותמונות.</p>
                    </div>

                    {/* הגדרות ספר */}
                    <section className='rounded-2xl bg-white/90 backdrop-blur-sm p-6 shadow-lg'>
                        <h2 className='mb-4 text-xl font-semibold text-purple-700'>🎨 הגדרות ספר</h2>
                        <div className='grid gap-4 md:grid-cols-3'>
                            <input
                                placeholder='שם הכלה'
                                value={brideName}
                                onChange={e => setBrideName(e.target.value)}
                                className='rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                            />
                            <input
                                placeholder='שם החתן'
                                value={groomName}
                                onChange={e => setGroomName(e.target.value)}
                                className='rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                            />
                            <input
                                placeholder='קישור לתמונת כריכה'
                                value={backgroundImage}
                                onChange={e => setBackgroundImage(e.target.value)}
                                className='rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                            />
                        </div>
                        <button
                            onClick={handleSaveSettings}
                            className='mt-4 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-2 text-white font-medium shadow hover:scale-105 transition'
                        >
                            💾 שמור שינויים
                        </button>
                    </section>

                    {/* ניהול תכנים */}
                    <section>
                        <div className='flex items-center justify-between mb-4'>
                            <h2 className='text-xl font-semibold text-purple-700'>🎁 ניהול ברכות ותמונות</h2>
                            <button
                                onClick={resetToChronological}
                                className='rounded-lg border border-purple-300 px-4 py-2 text-purple-700 hover:bg-purple-50 transition'
                            >
                                🔄 איפוס לסדר כרונולוגי
                            </button>
                        </div>

                        {entries.length === 0 ? (
                            <p className='text-gray-500 text-center'>עדיין אין ברכות או תמונות.</p>
                        ) : (
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId='entries-list'>
                                    {provided => (
                                        <div {...provided.droppableProps} ref={provided.innerRef} className='space-y-4'>
                                            {entries.map((entry, index) => (
                                                <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                    {provided => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className='flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow hover:shadow-md transition'
                                                        >
                                                            {/* ידית גרירה */}
                                                            <div className='cursor-grab text-gray-400 text-xl'>⋮⋮</div>

                                                            {/* תמונה ממוזערת */}
                                                            {entry.imageUrl ? (
                                                                <img
                                                                    src={entry.imageUrl}
                                                                    alt='thumb'
                                                                    className='h-16 w-16 object-cover rounded-lg border'
                                                                />
                                                            ) : (
                                                                <div className='h-16 w-16 flex items-center justify-center rounded-lg bg-gray-100 text-gray-400 text-sm'>
                                                                    ללא תמונה
                                                                </div>
                                                            )}

                                                            {/* פרטי ברכה */}
                                                            <div className='flex-1'>
                                                                <p className='font-medium text-gray-700'>
                                                                    {entry.name || 'אורח אנונימי'}
                                                                </p>
                                                                {entry.text && (
                                                                    <p className='text-sm text-gray-600 truncate'>
                                                                        {entry.text}
                                                                    </p>
                                                                )}
                                                                <p className='text-xs text-gray-400'>
                                                                    {entry.timestamp
                                                                        ? new Date(entry.timestamp).toLocaleString(
                                                                              'he-IL'
                                                                          )
                                                                        : '—'}
                                                                </p>
                                                            </div>

                                                            {/* כפתור מחיקה */}
                                                            <button
                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                className='rounded-lg border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50 transition'
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>
                        )}
                    </section>
                </div>
            </div>
        </AdminPageWrapper>
    )
}
