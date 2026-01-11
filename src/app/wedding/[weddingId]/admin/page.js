'use client'

import { useEffect, useState } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Heebo } from 'next/font/google'

// הגדרת פונט לכותרות
const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700', '900'] })

// אייקונים מעוצבים
const TrashIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-5 h-5'>
        <path
            fillRule='evenodd'
            d='M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z'
            clipRule='evenodd'
        />
    </svg>
)

const EditIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-5 h-5'>
        <path d='M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32L19.513 8.2Z' />
    </svg>
)

export default function AdminDashboard() {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState(null)
    const [editValues, setEditValues] = useState({ name: '', text: '' })
    const [expandedId, setExpandedId] = useState(null)
    const { weddingId } = useParams()

    useEffect(() => {
        async function fetchData() {
            if (!weddingId) return
            const data = await getEntries(weddingId)
            const sorted = data.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
            setEntries(sorted)
            setLoading(false)
        }
        fetchData()
    }, [weddingId])

    async function handleDeleteEntry(id) {
        if (!confirm('למחוק את הברכה לצמיתות?')) return
        await deleteDoc(doc(db, 'weddings', weddingId, 'entries', id))
        setEntries(prev => prev.filter(e => e.id !== id))
    }

    async function handleUpdateEntry(id) {
        if (!weddingId) return
        await updateDoc(doc(db, 'weddings', weddingId, 'entries', id), {
            name: editValues.name,
            text: editValues.text,
        })
        setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...editValues } : e)))
        setEditingId(null)
    }

    async function handleDragEnd(result) {
        if (!result.destination) return
        const reordered = Array.from(entries)
        const [moved] = reordered.splice(result.source.index, 1)
        reordered.splice(result.destination.index, 0, moved)
        setEntries(reordered)

        const batch = writeBatch(db)
        reordered.forEach((entry, index) => {
            batch.update(doc(db, 'weddings', weddingId, 'entries', entry.id), {
                orderIndex: index,
            })
        })
        await batch.commit()
    }

    async function resetToChronological() {
        const sorted = [...entries].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
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
            <div className='flex h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50'>
                <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-purple-200 border-t-purple-600'></div>
            </div>
        )
    }

    return (
        <AdminPageWrapper>
            {/* רקע גרדיאנט עדין ויוקרתי */}
            <div
                className={`min-h-screen bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-purple-100/40 via-white to-pink-100/40 p-6 md:p-12 font-sans text-gray-800 ${heebo.className}`}
            >
                {/* Header */}
                <div className='max-w-4xl mx-auto mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-purple-100/50'>
                    <div>
                        <h1 className='text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-pink-600 mb-2'>
                            ניהול הברכות שלכם
                        </h1>
                        <p className='text-lg text-gray-600 font-medium'>
                            <span className='font-bold text-purple-700'>{entries.length}</span> רגעים קסומים שנאספו
                        </p>
                    </div>

                    {entries.length > 0 && (
                        <button
                            onClick={resetToChronological}
                            className='group flex items-center gap-2 bg-white text-purple-700 px-5 py-2.5 rounded-xl hover:bg-purple-50 transition-all shadow-sm hover:shadow-md border border-purple-100 font-bold text-sm'
                        >
                            <span className='group-hover:rotate-180 transition-transform duration-500'></span>
                            סדר לפי זמן קבלה
                        </button>
                    )}
                </div>

                {/* List Container */}
                <div className='max-w-4xl mx-auto'>
                    {entries.length === 0 ? (
                        <div className='flex flex-col items-center justify-center py-24 bg-white/60 backdrop-blur-xl rounded-[2rem] border-2 border-dashed border-purple-200 shadow-sm'>
                            <div className='w-24 h-24 bg-gradient-to-tr from-purple-100 to-pink-100 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner'>
                                ✨
                            </div>
                            <p className='text-xl font-bold text-gray-800'>הספר ממתין לברכות הראשונות</p>
                            <p className='text-gray-500 mt-2'>שתפו את הקישור והקסם יתחיל...</p>
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId='entries-list'>
                                {provided => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className='space-y-5'>
                                        {entries.map((entry, index) => (
                                            <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps} // 🔥 גרירה מכל מקום
                                                        style={{ ...provided.draggableProps.style }}
                                                        className={`
                                                            group relative overflow-hidden
                                                            bg-white/90 backdrop-blur-xl rounded-[1.5rem] p-5 flex gap-6 items-start
                                                            border transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                                                            cursor-grab active:cursor-grabbing
                                                            
                                                            /* מצבי עיצוב שונים */
                                                            ${
                                                                snapshot.isDragging
                                                                    ? 'shadow-[0_20px_40px_-15px_rgba(168,85,247,0.3)] border-purple-300 scale-[1.03] z-50 ring-4 ring-purple-100'
                                                                    : 'shadow-[0_4px_20px_-5px_rgba(0,0,0,0.08)] border-white/50 hover:border-purple-200 hover:shadow-[0_8px_30px_-10px_rgba(168,85,247,0.15)]'
                                                            }
                                                        `}
                                                    >
                                                        {/* תמונה - גדולה ומרשימה */}

                                                        {/* תוכן */}
                                                        <div className='flex-1 min-w-0 py-1'>
                                                            {editingId === entry.id ? (
                                                                // מצב עריכה
                                                                <div
                                                                    className='animate-fadeIn space-y-4 bg-purple-50/50 p-4 rounded-xl border border-purple-100'
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    <input
                                                                        value={editValues.name}
                                                                        onChange={e =>
                                                                            setEditValues({
                                                                                ...editValues,
                                                                                name: e.target.value,
                                                                            })
                                                                        }
                                                                        placeholder='שם האורח'
                                                                        className='w-full bg-white border border-purple-200 rounded-xl px-4 py-2.5 text-base font-bold text-gray-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none'
                                                                    />
                                                                    <textarea
                                                                        value={editValues.text}
                                                                        onChange={e =>
                                                                            setEditValues({
                                                                                ...editValues,
                                                                                text: e.target.value,
                                                                            })
                                                                        }
                                                                        placeholder='תוכן הברכה'
                                                                        className='w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-none h-28'
                                                                    />
                                                                    <div className='flex gap-3 justify-end'>
                                                                        <button
                                                                            onClick={() => setEditingId(null)}
                                                                            className='text-sm font-medium text-gray-500 px-4 py-2 hover:bg-gray-100/50 rounded-lg transition-colors'
                                                                        >
                                                                            ביטול
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateEntry(entry.id)}
                                                                            className='text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-500 text-white px-6 py-2 rounded-lg hover:shadow-lg hover:shadow-purple-500/20 transition-all'
                                                                        >
                                                                            שמור שינויים
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                // מצב צפייה
                                                                <div className='h-full flex flex-col'>
                                                                    <div className='flex justify-between items-start mb-2'>
                                                                        <h3 className='text-xl font-bold text-gray-900 truncate pr-4'>
                                                                            {entry.name || 'אורח אנונימי'}
                                                                        </h3>

                                                                        {/* תאריך */}
                                                                        {entry.timestamp?.seconds && (
                                                                            <span className='text-[11px] font-medium text-purple-600/70 bg-purple-50/80 px-2.5 py-1 rounded-full whitespace-nowrap border border-purple-100'>
                                                                                {new Date(
                                                                                    entry.timestamp.seconds * 1000
                                                                                ).toLocaleDateString('he-IL')}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <div className='flex-1 text-[15px] text-gray-600 leading-relaxed whitespace-pre-wrap relative'>
                                                                        <p
                                                                            className={
                                                                                expandedId !== entry.id &&
                                                                                entry.text?.length > 120
                                                                                    ? 'line-clamp-3'
                                                                                    : ''
                                                                            }
                                                                        >
                                                                            {entry.text || (
                                                                                <span className='italic text-gray-400'>
                                                                                    ללא טקסט...
                                                                                </span>
                                                                            )}
                                                                        </p>

                                                                        {entry.text?.length > 120 && (
                                                                            <button
                                                                                onClick={e => {
                                                                                    e.stopPropagation()
                                                                                    setExpandedId(
                                                                                        expandedId === entry.id
                                                                                            ? null
                                                                                            : entry.id
                                                                                    )
                                                                                }}
                                                                                className='mt-1 text-sm font-bold text-purple-600 hover:text-purple-800 focus:outline-none bg-white/80 backdrop-blur-sm px-2 rounded'
                                                                            >
                                                                                {expandedId === entry.id
                                                                                    ? 'הסתר ▴'
                                                                                    : 'קרא עוד ▾'}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* פעולות - כפתורים מעוצבים */}
                                                        {editingId !== entry.id && (
                                                            <div
                                                                className='absolute left-5 top-5 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100'
                                                                onMouseDown={e => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingId(entry.id)
                                                                        setEditValues({
                                                                            name: entry.name,
                                                                            text: entry.text,
                                                                        })
                                                                    }}
                                                                    className='p-2.5 bg-white text-gray-400 border border-gray-200/80 rounded-xl hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50/50 shadow-sm hover:shadow-md transition-all'
                                                                    title='ערוך'
                                                                >
                                                                    <EditIcon />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                                    className='p-2.5 bg-white text-gray-400 border border-gray-200/80 rounded-xl hover:text-red-500 hover:border-red-200 hover:bg-red-50/50 shadow-sm hover:shadow-md transition-all'
                                                                    title='מחק'
                                                                >
                                                                    <TrashIcon />
                                                                </button>
                                                            </div>
                                                        )}
                                                        {/* אינדיקטור גרירה עדין */}
                                                        <div className='absolute right-3 inset-y-0 flex items-center text-gray-300 opacity-0 group-hover:opacity-30 pointer-events-none transition-opacity'>
                                                            <svg
                                                                xmlns='http://www.w3.org/2000/svg'
                                                                viewBox='0 0 24 24'
                                                                fill='currentColor'
                                                                className='w-6 h-6'
                                                            >
                                                                <path
                                                                    fillRule='evenodd'
                                                                    d='M3 9a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 9Zm0 6.75a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z'
                                                                    clipRule='evenodd'
                                                                />
                                                            </svg>
                                                        </div>
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
                </div>
            </div>
        </AdminPageWrapper>
    )
}
