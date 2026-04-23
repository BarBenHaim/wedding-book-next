'use client'

import { useEffect, useState, useRef } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../../lib/firebaseClient'
import { normalizeBlessing } from '../../../../lib/normalizeText'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Heebo } from 'next/font/google'

const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700', '900'] })

const ITEMS_PER_PAGE = 12

// Icons
const TrashIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4.5 h-4.5'>
        <path
            fillRule='evenodd'
            d='M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z'
            clipRule='evenodd'
        />
    </svg>
)

const EditIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4.5 h-4.5'>
        <path d='M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32L19.513 8.2Z' />
    </svg>
)

const DragIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4 h-4'>
        <path fillRule='evenodd' d='M3 9a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 9Zm0 6.75a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z' clipRule='evenodd' />
    </svg>
)

const ImageIcon = () => (
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor' className='w-4.5 h-4.5'>
        <path fillRule='evenodd' d='M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z' clipRule='evenodd' />
    </svg>
)

export default function AdminDashboard() {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState(null)
    const [editValues, setEditValues] = useState({ name: '', text: '' })
    const [expandedId, setExpandedId] = useState(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [uploadingImageId, setUploadingImageId] = useState(null)
    const fileInputRef = useRef(null)
    const replaceTargetId = useRef(null)
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

    // Pagination
    const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE)
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedEntries = entries.slice(startIdx, startIdx + ITEMS_PER_PAGE)

    async function handleDeleteEntry(id) {
        if (!confirm('למחוק את הברכה לצמיתות?')) return
        await deleteDoc(doc(db, 'weddings', weddingId, 'entries', id))
        setEntries(prev => prev.filter(e => e.id !== id))
    }

    async function handleUpdateEntry(id) {
        if (!weddingId) return
        const cleanedText = normalizeBlessing(editValues.text)
        await updateDoc(doc(db, 'weddings', weddingId, 'entries', id), {
            name: editValues.name,
            text: cleanedText,
        })
        setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...editValues, text: cleanedText } : e)))
        setEditingId(null)
    }

    async function handleDragEnd(result) {
        if (!result.destination) return
        // Calculate actual indices within full entries array
        const sourceActual = startIdx + result.source.index
        const destActual = startIdx + result.destination.index
        const reordered = Array.from(entries)
        const [moved] = reordered.splice(sourceActual, 1)
        reordered.splice(destActual, 0, moved)
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

    function triggerImageReplace(entryId) {
        replaceTargetId.current = entryId
        fileInputRef.current?.click()
    }

    async function handleImageFileChange(e) {
        const file = e.target.files?.[0]
        if (!file || !replaceTargetId.current) return
        const entryId = replaceTargetId.current
        replaceTargetId.current = null
        e.target.value = '' // reset input

        setUploadingImageId(entryId)
        try {
            const filename = `photo-${Date.now()}.jpg`
            const photoRef = storageRef(storage, `weddings/${weddingId}/${filename}`)
            await uploadBytes(photoRef, file)
            const newUrl = await getDownloadURL(photoRef)

            await updateDoc(doc(db, 'weddings', weddingId, 'entries', entryId), {
                imageUrl: newUrl,
            })
            setEntries(prev => prev.map(ent => (ent.id === entryId ? { ...ent, imageUrl: newUrl } : ent)))
        } catch (err) {
            console.error('Error replacing image:', err)
            alert('שגיאה בהעלאת התמונה')
        } finally {
            setUploadingImageId(null)
        }
    }

    if (loading) {
        return (
            <div className='flex h-screen items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]'>
                <div className='animate-spin rounded-full h-10 w-10 border-[3px] border-[#AA8840]/20 border-t-[#AA8840]'></div>
            </div>
        )
    }

    return (
        <AdminPageWrapper>
            <div
                className={`min-h-screen bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#AA8840]/5 via-[#F5F5F5] to-[#c9a44e]/5 px-4 sm:px-6 py-6 md:p-12 font-sans text-gray-800 animate-fadeIn ${heebo.className}`}
            >
                {/* Hidden file input for image replacement */}
                <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/*'
                    className='hidden'
                    onChange={handleImageFileChange}
                />

                {/* Header */}
                <div className='max-w-4xl mx-auto mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 pb-5 border-b border-[#AA8840]/15'>
                    <div>
                        <h1 className='text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#AA8840] to-[#c9a44e] mb-1.5'>
                            ניהול הברכות שלכם
                        </h1>
                        <p className='text-base text-gray-500'>
                            <span className='font-bold text-[#AA8840]'>{entries.length}</span> רגעים שנאספו
                        </p>
                    </div>

                    {entries.length > 0 && (
                        <button
                            onClick={resetToChronological}
                            className='group flex items-center gap-2 bg-white text-[#AA8840] px-4 py-2.5 rounded-xl hover:bg-[#AA8840]/5 transition-all shadow-sm border border-[#AA8840]/15 font-semibold text-sm'
                        >
                            <svg className='w-4 h-4 group-hover:rotate-180 transition-transform duration-500' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' /></svg>
                            סדר לפי זמן
                        </button>
                    )}
                </div>

                {/* List */}
                <div className='max-w-4xl mx-auto'>
                    {entries.length === 0 ? (
                        <div className='flex flex-col items-center justify-center py-16 md:py-24 bg-white/60 backdrop-blur-xl rounded-[2rem] border-2 border-dashed border-[#AA8840]/20 shadow-sm'>
                            <div className='w-20 h-20 md:w-24 md:h-24 bg-gradient-to-tr from-[#AA8840]/10 to-[#c9a44e]/10 rounded-full flex items-center justify-center mb-5 shadow-inner'>
                                <svg className='w-8 h-8 md:w-10 md:h-10 text-[#AA8840]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' /></svg>
                            </div>
                            <p className='text-lg md:text-xl font-bold text-gray-800'>הספר ממתין לברכות הראשונות</p>
                            <p className='text-gray-500 mt-2 text-sm'>שתפו את הקישור והקסם יתחיל...</p>
                        </div>
                    ) : (
                        <>
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId='entries-list'>
                                    {provided => (
                                        <div {...provided.droppableProps} ref={provided.innerRef} className='grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
                                            {paginatedEntries.map((entry, index) => (
                                                <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            style={{ ...provided.draggableProps.style }}
                                                            className={`
                                                                group relative overflow-hidden
                                                                bg-white rounded-2xl
                                                                border transition-all duration-200 ease-out
                                                                cursor-grab active:cursor-grabbing
                                                                ${
                                                                    snapshot.isDragging
                                                                        ? 'shadow-2xl border-[#AA8840]/30 scale-[1.02] z-50 ring-2 ring-[#AA8840]/20'
                                                                        : 'shadow-sm border-gray-100 hover:shadow-md hover:border-[#AA8840]/15'
                                                                }
                                                            `}
                                                        >
                                                            {editingId === entry.id ? (
                                                                /* Edit mode */
                                                                <div className='p-4' onClick={e => e.stopPropagation()}>
                                                                    <div className='space-y-3'>
                                                                        <input
                                                                            value={editValues.name}
                                                                            onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                                                                            placeholder='שם האורח'
                                                                            className='w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-[#AA8840]/20 focus:border-[#AA8840] outline-none'
                                                                        />
                                                                        <textarea
                                                                            value={editValues.text}
                                                                            onChange={e => setEditValues({ ...editValues, text: e.target.value })}
                                                                            placeholder='תוכן הברכה'
                                                                            className='w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-[#AA8840]/20 focus:border-[#AA8840] outline-none resize-none h-24'
                                                                        />
                                                                        <div className='flex gap-2 justify-end'>
                                                                            <button onClick={() => setEditingId(null)} className='text-sm text-gray-500 px-3.5 py-2 hover:bg-gray-50 rounded-lg transition-colors'>
                                                                                ביטול
                                                                            </button>
                                                                            <button onClick={() => handleUpdateEntry(entry.id)} className='text-sm font-bold gold-shimmer text-white px-5 py-2 rounded-lg'>
                                                                                שמור
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {/* Photo area — lazy loaded thumbnail */}
                                                                    {entry.imageUrl && (
                                                                        <div className='relative w-full aspect-[4/3] bg-gray-50 overflow-hidden'>
                                                                            <img
                                                                                src={entry.imageUrl}
                                                                                alt=''
                                                                                loading='lazy'
                                                                                className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-500'
                                                                            />
                                                                            {uploadingImageId === entry.id && (
                                                                                <div className='absolute inset-0 bg-black/40 flex items-center justify-center'>
                                                                                    <svg className='w-8 h-8 text-white animate-spin' fill='none' viewBox='0 0 24 24'>
                                                                                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'/>
                                                                                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z'/>
                                                                                    </svg>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* Content */}
                                                                    <div className='p-4'>
                                                                        {/* Name + date */}
                                                                        <div className='flex justify-between items-start gap-2 mb-1.5'>
                                                                            <h3 className='text-[15px] font-bold text-gray-900 truncate'>
                                                                                {entry.name || 'אורח אנונימי'}
                                                                            </h3>
                                                                            {entry.timestamp?.seconds && (
                                                                                <span className='text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5'>
                                                                                    {new Date(entry.timestamp.seconds * 1000).toLocaleDateString('he-IL')}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* Text */}
                                                                        {entry.text && (
                                                                            <div className='text-[13px] text-gray-500 leading-relaxed'>
                                                                                <p className={expandedId !== entry.id && entry.text?.length > 80 ? 'line-clamp-2' : ''}>
                                                                                    {entry.text}
                                                                                </p>
                                                                                {entry.text?.length > 80 && (
                                                                                    <button
                                                                                        onClick={e => { e.stopPropagation(); setExpandedId(expandedId === entry.id ? null : entry.id) }}
                                                                                        className='mt-1 text-xs font-semibold text-[#AA8840] hover:text-[#AA8840]/70'
                                                                                    >
                                                                                        {expandedId === entry.id ? 'פחות' : 'עוד...'}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* No text indicator */}
                                                                        {!entry.text && !entry.imageUrl && (
                                                                            <p className='text-[13px] text-gray-300 italic'>ללא תוכן</p>
                                                                        )}

                                                                        {/* Actions */}
                                                                        <div
                                                                            className='flex items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200'
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                        >
                                                                            <button
                                                                                onClick={() => { setEditingId(entry.id); setEditValues({ name: entry.name, text: entry.text }) }}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all'
                                                                            >
                                                                                <EditIcon />
                                                                                <span>ערוך</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => triggerImageReplace(entry.id)}
                                                                                disabled={uploadingImageId === entry.id}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all disabled:opacity-50'
                                                                            >
                                                                                <ImageIcon />
                                                                                <span>{entry.imageUrl ? 'החלף תמונה' : 'הוסף תמונה'}</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg active:scale-95 transition-all'
                                                                            >
                                                                                <TrashIcon />
                                                                                <span>מחק</span>
                                                                            </button>
                                                                            <span className='mr-auto text-gray-200'>
                                                                                <DragIcon />
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className='flex items-center justify-center gap-2 mt-8'>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all'
                                    >
                                        <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' /></svg>
                                    </button>

                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                                                currentPage === page
                                                    ? 'bg-[#AA8840] text-white shadow-md'
                                                    : 'text-gray-500 hover:bg-white hover:shadow-sm'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    ))}

                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className='w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all'
                                    >
                                        <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' /></svg>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AdminPageWrapper>
    )
}
