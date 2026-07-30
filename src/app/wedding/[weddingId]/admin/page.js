'use client'

import { useEffect, useState, useRef } from 'react'
import { getEntries } from '../../../../lib/classifyMedia'
import { useParams } from 'next/navigation'
import { doc, updateDoc, deleteDoc, writeBatch, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, auth } from '../../../../lib/firebaseClient'
import { onAuthStateChanged } from 'firebase/auth'
import { isSuperAdmin } from '@/lib/superAdmin'
import imageCompression from 'browser-image-compression'
import { getBlessingText, normalizeBlessing, formatBlessingSmart } from '../../../../lib/normalizeText'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import EntryPhoto from '@/components/EntryPhoto/EntryPhoto'
import { Heebo } from 'next/font/google'
import BookLoader from '@/components/BookLoader/BookLoader'

const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700', '900'] })

const ITEMS_PER_PAGE = 12

// "4.7.2026 · 21:35" — the full upload moment of an entry. Managers
// asked to see WHEN each blessing arrived, not just the date.
const fmtUploadedAt = ts => {
    const sec = ts?.seconds ?? (typeof ts?.toDate === 'function' ? Math.floor(ts.toDate().getTime() / 1000) : null)
    if (!sec) return ''
    const d = new Date(sec * 1000)
    return `${d.toLocaleDateString('he-IL')} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
}

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
    const [showAll, setShowAll] = useState(false)
    // Dedicated "reorder" mode: a clean, compact, single-column drag list
    // (thumbnail + name + handle) shown instead of the big cards, so ordering
    // many blessings is simple — no pagination, no per-card clutter.
    const [reorderMode, setReorderMode] = useState(false)
    const [uploadingImageId, setUploadingImageId] = useState(null)
    const [framingId, setFramingId] = useState(null)
    const [framingPos, setFramingPos] = useState('50% 50%')
    const [framingRot, setFramingRot] = useState(0)
    const [savingFraming, setSavingFraming] = useState(false)
    const [duplicatingId, setDuplicatingId] = useState(null)
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

    // Pagination — `showAll` disables it so the owner can drag-reorder
    // across the WHOLE list (otherwise drag only works inside the current
    // 12-item page and you can't move an entry to another page).
    // ── בקרת העלאות ──────────────────────────────────────────────────
    // Reads the wedding's funnel events (owner-readable per Firestore
    // rules) and surfaces how many guest submissions succeeded/failed,
    // plus the latest error. Fails silently (strip hides) when the
    // viewer isn't the owner or the read is unavailable.
    const [uploadHealth, setUploadHealth] = useState(null)
    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDocs(query(collection(db, 'weddings', weddingId, 'scans'), orderBy('createdAt', 'desc'), limit(500)))
                if (cancelled) return
                let success = 0
                let failed = 0
                let lastError = null
                for (const d of snap.docs) {
                    const ev = d.data()
                    if (ev.event === 'blessing_sent_success') success++
                    else if (ev.event === 'blessing_sent_error') {
                        failed++
                        if (!lastError) {
                            lastError = {
                                meta: typeof ev.meta === 'string' ? ev.meta : '',
                                seconds: ev.createdAt?.seconds || null,
                            }
                        }
                    }
                }
                setUploadHealth({ success, failed, lastError })
            } catch {
                /* not the owner / offline — hide the strip */
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE)
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedEntries = entries.slice(startIdx, startIdx + ITEMS_PER_PAGE)
    const displayEntries = showAll ? entries : paginatedEntries
    // Offset added to a Draggable's local index to get its index in the
    // full entries array (0 in show-all / reorder mode, page offset otherwise).
    const pageOffset = showAll || reorderMode ? 0 : startIdx

    // Persist the current order to Firestore (orderIndex per entry).
    async function persistOrder(reordered) {
        const batch = writeBatch(db)
        reordered.forEach((entry, index) => {
            batch.update(doc(db, 'weddings', weddingId, 'entries', entry.id), {
                orderIndex: index,
            })
        })
        await batch.commit()
    }

    // Move a single entry across the FULL list — works regardless of which
    // pagination page it's on, so you can send an entry to the very front
    // or nudge it past a page boundary without dragging.
    async function moveEntry(entryId, where) {
        const idx = entries.findIndex(e => e.id === entryId)
        if (idx < 0) return
        let target = idx
        if (where === 'top') target = 0
        else if (where === 'bottom') target = entries.length - 1
        else if (where === 'up') target = Math.max(0, idx - 1)
        else if (where === 'down') target = Math.min(entries.length - 1, idx + 1)
        if (target === idx) return
        const reordered = Array.from(entries)
        const [moved] = reordered.splice(idx, 1)
        reordered.splice(target, 0, moved)
        setEntries(reordered)
        await persistOrder(reordered)
    }

    // ── Photo framing (focal point + rotation) ──────────────────────────
    function openFraming(entry) {
        setFramingId(entry.id)
        setFramingPos(entry.photoPosition || '50% 50%')
        setFramingRot((((Number(entry.photoRotation) || 0) % 360) + 360) % 360)
    }
    function setFocalFromImageClick(e) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = Math.min(100, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
        const y = Math.min(100, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
        setFramingPos(`${x}% ${y}%`)
    }
    function rotateFraming(delta) {
        setFramingRot(r => ((((r + delta) % 360) + 360) % 360))
    }
    async function saveFraming() {
        if (!framingId) return
        setSavingFraming(true)
        try {
            await updateDoc(doc(db, 'weddings', weddingId, 'entries', framingId), {
                photoPosition: framingPos,
                photoRotation: framingRot,
            })
            setEntries(prev => prev.map(e => (e.id === framingId ? { ...e, photoPosition: framingPos, photoRotation: framingRot } : e)))
            setFramingId(null)
        } catch (err) {
            console.error('Error saving framing:', err)
            alert('שגיאה בשמירת התמונה')
        } finally {
            setSavingFraming(false)
        }
    }

    async function handleDeleteEntry(id) {
        if (!confirm('למחוק את הברכה לצמיתות?')) return
        await deleteDoc(doc(db, 'weddings', weddingId, 'entries', id))
        setEntries(prev => prev.filter(e => e.id !== id))
    }

    // Duplicate a single blessing — creates a copy right after the original
    // (same name/text/photo + framing/rotation). The photo URL is shared with
    // the original (same event, same Storage object), so it's instant.
    async function duplicateEntry(entry) {
        if (!weddingId || duplicatingId) return
        setDuplicatingId(entry.id)
        try {
            const copy = {
                name: entry.name || '',
                text: entry.text || '',
                imageUrl: entry.imageUrl || null,
                photoPosition: entry.photoPosition || null,
                photoRotation: Number(entry.photoRotation) || 0,
                timestamp: entry.timestamp || null,
                orderIndex: entry.orderIndex ?? 0,
            }
            const ref = await addDoc(collection(db, 'weddings', weddingId, 'entries'), copy)
            const idx = entries.findIndex(e => e.id === entry.id)
            const reordered = Array.from(entries)
            reordered.splice(idx < 0 ? entries.length : idx + 1, 0, { id: ref.id, ...copy })
            setEntries(reordered)
            await persistOrder(reordered)
        } catch (err) {
            console.error('Error duplicating entry:', err)
            alert('שגיאה בשכפול הברכה')
        } finally {
            setDuplicatingId(null)
        }
    }

    async function handleUpdateEntry(id) {
        if (!weddingId) return
        // Store the text as-typed. The book templates collapse whitespace
        // at display time via getBlessingText() unless the entry has
        // preserveLineBreaks set — in which case the admin's line breaks
        // here will render verbatim on the book page.
        const nextText = editValues.text || ''
        const nextPLB = !!editValues.preserveLineBreaks
        await updateDoc(doc(db, 'weddings', weddingId, 'entries', id), {
            name: editValues.name,
            text: nextText,
            // Save the chosen line mode together with the text so "smart
            // paragraphs" actually renders (continuous = false, smart = true).
            preserveLineBreaks: nextPLB,
        })
        setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...editValues, text: nextText, preserveLineBreaks: nextPLB } : e)))
        setEditingId(null)
    }

    // Per-entry toggle: when true, the book templates render the text
    // exactly as typed (line breaks preserved). When false / missing,
    // whitespace collapses to a single flowing paragraph like before.
    // Per-entry manual split: blessing text on its own page, the photo
    // big on the next page — regardless of the preset's global autoSplit.
    async function toggleForceSplit(entryId, next) {
        if (!weddingId) return
        try {
            await updateDoc(doc(db, 'weddings', weddingId, 'entries', entryId), { forceSplit: next })
            setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, forceSplit: next } : e)))
        } catch (err) {
            console.error('Failed to toggle forceSplit', err)
            alert('שגיאה בשמירת הגדרת הפיצול')
        }
    }

    async function togglePreserveLineBreaks(entryId, next) {
        if (!weddingId) return
        try {
            await updateDoc(doc(db, 'weddings', weddingId, 'entries', entryId), {
                preserveLineBreaks: next,
            })
            setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, preserveLineBreaks: next } : e)))
        } catch (err) {
            console.error('Failed to toggle preserveLineBreaks', err)
            alert('שגיאה בשמירת הגדרת ירידות שורה')
        }
    }

    async function handleDragEnd(result) {
        if (!result.destination) return
        // Calculate actual indices within the full entries array. pageOffset
        // is 0 in show-all mode and the page start otherwise.
        const sourceActual = pageOffset + result.source.index
        const destActual = pageOffset + result.destination.index
        const reordered = Array.from(entries)
        const [moved] = reordered.splice(sourceActual, 1)
        reordered.splice(destActual, 0, moved)
        setEntries(reordered)
        await persistOrder(reordered)
    }

    async function resetToChronological() {
        const sorted = [...entries].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0))
        setEntries(sorted)
        await persistOrder(sorted)
    }

    // ── Super-admin: bulk PHOTO-ALBUM upload ─────────────────────────
    // Turns this event into a designed photo book with zero blessings:
    // every selected photo becomes a photo-only entry (empty name, no
    // text) — BookPageTemplate renders those as clean, centered full-
    // photo pages, and the whole existing book/viewer/print pipeline
    // just works. Ordering follows the selection order.
    const albumInputRef = useRef(null)
    const [albumUpload, setAlbumUpload] = useState(null) // {done,total}|null
    const [adminUser, setAdminUser] = useState(false)
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, u => setAdminUser(!!(u?.email && isSuperAdmin(u.email))))
        return unsub
    }, [])

    async function handleAlbumFiles(e) {
        const files = [...(e.target.files || [])]
        e.target.value = ''
        if (!files.length) return
        const baseOrder = entries.reduce((m, x) => Math.max(m, Number(x.orderIndex) || 0), 0) + 1
        setAlbumUpload({ done: 0, total: files.length })
        const added = []
        for (let i = 0; i < files.length; i++) {
            try {
                const compressed = await imageCompression(files[i], {
                    maxWidthOrHeight: 1600,
                    maxSizeMB: 0.7,
                    useWebWorker: true,
                })
                // Measure the photo once, at upload — the smart album
                // layout composes pages by this stored aspect without
                // ever having to load the image again.
                let imgAspect = null
                try {
                    const bmp = await createImageBitmap(compressed)
                    if (bmp.width > 0 && bmp.height > 0) imgAspect = Math.round((bmp.width / bmp.height) * 1000) / 1000
                    bmp.close?.()
                } catch { /* aspect stays null → uniform behavior */ }
                const filename = `album-${Date.now()}-${i}.jpg`
                const photoRef = storageRef(storage, `weddings/${weddingId}/${filename}`)
                await uploadBytes(photoRef, compressed)
                const imageUrl = await getDownloadURL(photoRef)
                const docData = {
                    name: '',
                    text: null,
                    imageUrl,
                    imgAspect,
                    timestamp: serverTimestamp(),
                    orderIndex: baseOrder + i,
                }
                const ref = await addDoc(collection(db, 'weddings', weddingId, 'entries'), docData)
                added.push({ id: ref.id, ...docData, timestamp: null })
            } catch (err) {
                console.error('[album] upload failed for file', i, err)
            }
            setAlbumUpload({ done: i + 1, total: files.length })
        }
        if (added.length) setEntries(prev => [...prev, ...added])
        setAlbumUpload(null)
        if (added.length < files.length) alert(`הועלו ${added.length} מתוך ${files.length} תמונות (חלק נכשלו — נסו שוב)`)
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

            // Aspect twin — keeps the smart/no-crop album layouts accurate
            // for photos replaced here too.
            let imgAspect = null
            try {
                const bmp = await createImageBitmap(file)
                if (bmp.width > 0 && bmp.height > 0) imgAspect = Math.round((bmp.width / bmp.height) * 1000) / 1000
                bmp.close?.()
            } catch { /* best-effort */ }

            await updateDoc(doc(db, 'weddings', weddingId, 'entries', entryId), {
                imageUrl: newUrl,
                imgAspect,
            })
            setEntries(prev => prev.map(ent => (ent.id === entryId ? { ...ent, imageUrl: newUrl, imgAspect } : ent)))
        } catch (err) {
            console.error('Error replacing image:', err)
            alert('שגיאה בהעלאת התמונה')
        } finally {
            setUploadingImageId(null)
        }
    }

    if (loading) {
        return <BookLoader />
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

                {/* Super-admin: bulk album upload (photo book, no blessings) */}
                <input
                    ref={albumInputRef}
                    type='file'
                    accept='image/*'
                    multiple
                    className='hidden'
                    onChange={handleAlbumFiles}
                />
                {adminUser && (
                    <div className='mb-5 flex justify-center'>
                        <button
                            onClick={() => albumInputRef.current?.click()}
                            disabled={!!albumUpload}
                            className='px-6 py-3 rounded-full font-bold text-[#241a0d] shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70'
                            style={{ background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)' }}
                        >
                            {albumUpload
                                ? `מעלה תמונות… ${albumUpload.done}/${albumUpload.total}`
                                : '📸 העלאת אלבום תמונות — ספר ללא ברכות (סופר־אדמין)'}
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className='max-w-4xl mx-auto mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 pb-5 border-b border-[#AA8840]/15'>
                    <div>
                        <h1 className='text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#AA8840] to-[#c9a44e] mb-1.5'>
                            ניהול הברכות שלכם
                        </h1>
                        <p className='text-base text-gray-500'>
                            <span className='font-bold text-[#AA8840]'>{entries.length}</span> רגעים שנאספו
                        </p>
                        {/* בקרת העלאות — הצלחות/כשלונות של שליחות אורחים */}
                        {uploadHealth && (uploadHealth.success > 0 || uploadHealth.failed > 0) && (
                            <div className='flex flex-wrap items-center gap-2 mt-2.5'>
                                <span className='inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-full' style={{ background: 'rgba(125,167,106,0.12)', color: '#4e7a3f', border: '1px solid rgba(125,167,106,0.35)' }}>
                                    ✓ {uploadHealth.success} שליחות הצליחו
                                </span>
                                {uploadHealth.failed > 0 ? (
                                    <span
                                        className='inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-full'
                                        style={{ background: 'rgba(196,59,59,0.10)', color: '#a02c2c', border: '1px solid rgba(196,59,59,0.30)' }}
                                        title={uploadHealth.lastError?.meta || ''}
                                    >
                                        ✗ {uploadHealth.failed} נכשלו
                                        {uploadHealth.lastError?.seconds ? ` · אחרונה: ${fmtUploadedAt({ seconds: uploadHealth.lastError.seconds })}` : ''}
                                    </span>
                                ) : (
                                    <span className='text-[11px] text-gray-400'>אין שליחות שנכשלו</span>
                                )}
                            </div>
                        )}
                    </div>

                    {entries.length > 0 && (
                        <div className='flex items-center gap-2'>
                            {/* Reorder mode — the simple way to set the order:
                                one tap opens a clean compact drag list. */}
                            <button
                                onClick={() => setReorderMode(v => !v)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shadow-sm border font-semibold text-sm ${
                                    reorderMode
                                        ? 'bg-[#AA8840] text-white border-[#AA8840]'
                                        : 'bg-white text-[#AA8840] border-[#AA8840]/15 hover:bg-[#AA8840]/5'
                                }`}
                                title='מצב סידור — גררו את הברכות לסדר הרצוי'
                            >
                                {reorderMode ? (
                                    <>
                                        <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M4.5 12.75l6 6 9-13.5' /></svg>
                                        סיום סידור
                                    </>
                                ) : (
                                    <>
                                        <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M3 7.5L7.5 3m0 0L12 7.5M7.5 3v18M21 16.5L16.5 21m0 0L12 16.5m4.5 4.5V3' /></svg>
                                        סדר ברכות
                                    </>
                                )}
                            </button>
                            {!reorderMode && entries.length > ITEMS_PER_PAGE && (
                                <button
                                    onClick={() => setShowAll(v => !v)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shadow-sm border font-semibold text-sm ${
                                        showAll
                                            ? 'bg-[#AA8840] text-white border-[#AA8840]'
                                            : 'bg-white text-[#AA8840] border-[#AA8840]/15 hover:bg-[#AA8840]/5'
                                    }`}
                                    title='הצגת כל הברכות בבת אחת'
                                >
                                    <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5' /></svg>
                                    {showAll ? 'תצוגת עמודים' : 'הצג הכל'}
                                </button>
                            )}
                            <button
                                onClick={resetToChronological}
                                className='group flex items-center gap-2 bg-white text-[#AA8840] px-4 py-2.5 rounded-xl hover:bg-[#AA8840]/5 transition-all shadow-sm border border-[#AA8840]/15 font-semibold text-sm'
                                title='סידור מחדש לפי סדר הכתיבה'
                            >
                                <svg className='w-4 h-4 group-hover:rotate-180 transition-transform duration-500' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' /></svg>
                                סדר לפי זמן
                            </button>
                        </div>
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
                    ) : reorderMode ? (
                        /* ── Compact reorder list — the simple ordering view ── */
                        <div>
                            <div className='mb-3 flex items-center justify-center gap-2 text-center text-sm text-[#7a6a52] bg-[#AA8840]/5 border border-[#AA8840]/15 rounded-xl py-2.5 px-4'>
                                <svg className='w-4 h-4 shrink-0' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M7.5 3 3 7.5m0 0L7.5 12M3 7.5h13.5m0 9L21 21m0 0-4.5 4.5M21 21H7.5' /></svg>
                                גררו את הברכות לסדר הרצוי — השינויים נשמרים אוטומטית
                            </div>
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId='reorder-list'>
                                    {provided => (
                                        <div ref={provided.innerRef} {...provided.droppableProps} className='space-y-2'>
                                            {entries.map((entry, index) => (
                                                <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                                    {(prov, snap) => (
                                                        <div
                                                            ref={prov.innerRef}
                                                            {...prov.draggableProps}
                                                            style={{ ...prov.draggableProps.style }}
                                                            className={`flex items-center gap-3 bg-white rounded-xl border px-2.5 py-2 ${
                                                                snap.isDragging
                                                                    ? 'shadow-xl ring-2 ring-[#AA8840]/30 border-[#AA8840]/30'
                                                                    : 'shadow-sm border-gray-100'
                                                            }`}
                                                        >
                                                            {/* Drag handle — only this grabs, so the row scrolls normally on touch */}
                                                            <div {...prov.dragHandleProps} className='cursor-grab active:cursor-grabbing text-gray-400 hover:text-[#AA8840] px-1 touch-none' title='גררו לסידור'>
                                                                <svg className='w-5 h-5' viewBox='0 0 24 24' fill='currentColor'><circle cx='9' cy='6' r='1.6' /><circle cx='15' cy='6' r='1.6' /><circle cx='9' cy='12' r='1.6' /><circle cx='15' cy='12' r='1.6' /><circle cx='9' cy='18' r='1.6' /><circle cx='15' cy='18' r='1.6' /></svg>
                                                            </div>
                                                            {/* Position number */}
                                                            <div className='w-6 text-center text-xs font-extrabold text-[#AA8840] shrink-0'>{index + 1}</div>
                                                            {/* Thumbnail */}
                                                            {entry.imageUrl ? (
                                                                <div className='w-12 h-12 rounded-lg overflow-hidden bg-gray-50 shrink-0'>
                                                                    <img
                                                                        src={entry.imageUrl}
                                                                        alt=''
                                                                        loading='lazy'
                                                                        className='w-full h-full object-cover'
                                                                        style={{ objectPosition: entry.photoPosition || 'center', transform: `rotate(${((((Number(entry.photoRotation) || 0) % 360) + 360) % 360)}deg)` }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className='w-12 h-12 rounded-lg bg-[#AA8840]/10 flex items-center justify-center shrink-0 text-[#AA8840]'>
                                                                    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.6}><path strokeLinecap='round' strokeLinejoin='round' d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' /></svg>
                                                                </div>
                                                            )}
                                                            {/* Name + snippet */}
                                                            <div className='flex-1 min-w-0'>
                                                                <div className='font-bold text-sm text-gray-900 truncate'>{entry.name || 'אורח/ת'}</div>
                                                                <div className='text-xs text-gray-500 truncate'>{entry.text || (entry.imageUrl ? 'ברכה עם תמונה' : '')}</div>
                                                                {entry.timestamp?.seconds && (
                                                                    <div className='text-[10px] text-gray-400 mt-0.5'>הועלתה {fmtUploadedAt(entry.timestamp)}</div>
                                                                )}
                                                            </div>
                                                            {/* Quick "to top" for big jumps */}
                                                            <button
                                                                onClick={() => moveEntry(entry.id, 'top')}
                                                                disabled={index === 0}
                                                                className='shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#AA8840]/20 text-[#AA8840] hover:bg-[#AA8840]/5 disabled:opacity-30 disabled:cursor-default'
                                                                title='העבר לראש הרשימה'
                                                            >
                                                                ↑ לראש
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
                        </div>
                    ) : (
                        <>
                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId='entries-list'>
                                    {provided => (
                                        <div {...provided.droppableProps} ref={provided.innerRef} className='grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
                                            {displayEntries.map((entry, index) => (
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
                                                                            style={editValues.preserveLineBreaks ? { whiteSpace: 'pre-line' } : undefined}
                                                                        />
                                                                        {/* Line mode: "רצף" = one flowing paragraph (default);
                                                                            "פסקאות חכמות" = auto-break at sentence ends for a
                                                                            clean, readable layout. The button reformats the text
                                                                            in place + sets how the book will render it. */}
                                                                        <div className='flex items-center gap-2 flex-wrap'>
                                                                            <span className='text-[11px] text-gray-400'>שורות:</span>
                                                                            <button
                                                                                type='button'
                                                                                onClick={() => setEditValues({ ...editValues, text: normalizeBlessing(editValues.text), preserveLineBreaks: false })}
                                                                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!editValues.preserveLineBreaks ? 'bg-[#AA8840] text-white border-[#AA8840]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#AA8840]/40'}`}
                                                                            >
                                                                                רצף
                                                                            </button>
                                                                            <button
                                                                                type='button'
                                                                                onClick={() => setEditValues({ ...editValues, text: formatBlessingSmart(editValues.text), preserveLineBreaks: true })}
                                                                                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${editValues.preserveLineBreaks ? 'bg-[#AA8840] text-white border-[#AA8840]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#AA8840]/40'}`}
                                                                            >
                                                                                פסקאות חכמות
                                                                            </button>
                                                                        </div>
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
                                                                                className='w-full h-full object-cover transition-transform duration-500'
                                                                                style={{
                                                                                    objectPosition: entry.photoPosition || 'center',
                                                                                    transform: `rotate(${((((Number(entry.photoRotation) || 0) % 360) + 360) % 360)}deg)`,
                                                                                }}
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
                                                                                {entry.name || ''}
                                                                            </h3>
                                                                            {entry.timestamp?.seconds && (
                                                                                <span className='text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5' title='מועד העלאת הברכה'>
                                                                                    {fmtUploadedAt(entry.timestamp)}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* Text — preview matches what the book will render: raw
                                                                            text (with breaks) if preserveLineBreaks is on, the
                                                                            collapsed normalized version otherwise. */}
                                                                        {entry.text && (
                                                                            <div className='text-[13px] text-gray-500 leading-relaxed'>
                                                                                <p
                                                                                    className={expandedId !== entry.id && entry.text?.length > 80 ? 'line-clamp-2' : ''}
                                                                                    style={entry.preserveLineBreaks ? { whiteSpace: 'pre-line' } : undefined}
                                                                                >
                                                                                    {getBlessingText(entry)}
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
                                                                                onClick={() => { setEditingId(entry.id); setEditValues({ name: entry.name, text: entry.text, preserveLineBreaks: !!entry.preserveLineBreaks }) }}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all'
                                                                            >
                                                                                <EditIcon />
                                                                                <span>ערוך</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => duplicateEntry(entry)}
                                                                                disabled={duplicatingId === entry.id}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all disabled:opacity-50'
                                                                                title='שכפל ברכה'
                                                                            >
                                                                                <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75' /></svg>
                                                                                <span>{duplicatingId === entry.id ? 'משכפל…' : 'שכפל'}</span>
                                                                            </button>
                                                                            <button
                                                                                onClick={() => triggerImageReplace(entry.id)}
                                                                                disabled={uploadingImageId === entry.id}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all disabled:opacity-50'
                                                                            >
                                                                                <ImageIcon />
                                                                                <span>{entry.imageUrl ? 'החלף תמונה' : 'הוסף תמונה'}</span>
                                                                            </button>
                                                                            {entry.imageUrl && (
                                                                                <button
                                                                                    onClick={() => openFraming(entry)}
                                                                                    className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-lg active:scale-95 transition-all'
                                                                                    title='מרכוז וסיבוב התמונה בספר'
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M6.75 3v2.25M6.75 3H4.5m2.25 0h12.75A1.5 1.5 0 0 1 21 4.5v12.75m0 0V19.5m0-2.25h-2.25M17.25 21v-2.25M17.25 21H4.5A1.5 1.5 0 0 1 3 19.5V6.75m0 0H5.25M3 6.75V4.5' /></svg>
                                                                                    <span>תמונה</span>
                                                                                </button>
                                                                            )}
                                                                            {/* Preserve-line-breaks toggle. Default OFF — guest's
                                                                                whitespace collapses on the book page. When ON,
                                                                                the book renders the blessing exactly as typed. */}
                                                                            {entry.text && (
                                                                                <button
                                                                                    onClick={() => togglePreserveLineBreaks(entry.id, !entry.preserveLineBreaks)}
                                                                                    className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg active:scale-95 transition-all ${
                                                                                        entry.preserveLineBreaks
                                                                                            ? 'text-[#AA8840] bg-[#AA8840]/10 hover:bg-[#AA8840]/15'
                                                                                            : 'text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5'
                                                                                    }`}
                                                                                    title={entry.preserveLineBreaks ? 'הברכה מוצגת בספר עם ירידות שורה כפי שנכתבו — לחץ לבטל' : 'הצג את הברכה בספר עם ירידות שורה כפי שנכתבו'}
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M3 6h18M3 12h12m-12 6h18M16 9l3 3m0 0l-3 3m3-3H9' /></svg>
                                                                                    <span>{entry.preserveLineBreaks ? 'שורות נשמרות' : 'שמור שורות'}</span>
                                                                                </button>
                                                                            )}
                                                                            {/* Manual split — this blessing's text gets its own
                                                                                page and the photo gets the next page, regardless
                                                                                of the preset's global auto-split. */}
                                                                            {entry.text && entry.imageUrl && (
                                                                                <button
                                                                                    onClick={() => toggleForceSplit(entry.id, !entry.forceSplit)}
                                                                                    className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg active:scale-95 transition-all ${
                                                                                        entry.forceSplit
                                                                                            ? 'text-[#AA8840] bg-[#AA8840]/10 hover:bg-[#AA8840]/15'
                                                                                            : 'text-gray-400 hover:text-[#AA8840] hover:bg-[#AA8840]/5'
                                                                                    }`}
                                                                                    title={entry.forceSplit ? 'הברכה מפוצלת: טקסט בעמוד, תמונה בעמוד הבא — לחץ לאחד' : 'פצל: הברכה בעמוד משלה והתמונה בעמוד הבא'}
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M4 4h16v7H4zM4 13h7v7H4zM13 13h7v7h-7z' /></svg>
                                                                                    <span>{entry.forceSplit ? 'מפוצל לשניים' : 'פצל לשני עמודים'}</span>
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => handleDeleteEntry(entry.id)}
                                                                                className='flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg active:scale-95 transition-all'
                                                                            >
                                                                                <TrashIcon />
                                                                                <span>מחק</span>
                                                                            </button>
                                                                            <div className='mr-auto flex items-center gap-0.5'>
                                                                                <button
                                                                                    onClick={() => moveEntry(entry.id, 'top')}
                                                                                    className='p-1.5 text-gray-300 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-md active:scale-95 transition-all'
                                                                                    title='העבר לראש הספר'
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M4.5 5.25h15M8.25 19.5V9.75m0 0L4.5 13.5m3.75-3.75L12 13.5' /></svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => moveEntry(entry.id, 'up')}
                                                                                    className='p-1.5 text-gray-300 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-md active:scale-95 transition-all'
                                                                                    title='הזז מעלה'
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M4.5 15.75l7.5-7.5 7.5 7.5' /></svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => moveEntry(entry.id, 'down')}
                                                                                    className='p-1.5 text-gray-300 hover:text-[#AA8840] hover:bg-[#AA8840]/5 rounded-md active:scale-95 transition-all'
                                                                                    title='הזז מטה'
                                                                                >
                                                                                    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} className='w-4 h-4'><path strokeLinecap='round' strokeLinejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5' /></svg>
                                                                                </button>
                                                                                <span className='text-gray-200 ms-0.5'>
                                                                                    <DragIcon />
                                                                                </span>
                                                                            </div>
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

                            {/* Pagination — hidden in show-all mode */}
                            {!showAll && totalPages > 1 && (
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

            {/* ── Photo framing modal (focal point) ─────────────────────── */}
            {framingId && (() => {
                const fe = entries.find(e => e.id === framingId)
                if (!fe) return null
                const parts = framingPos.replace(/%/g, '').trim().split(/\s+/)
                const fx = parseFloat(parts[0])
                const fy = parseFloat(parts[1])
                const markerX = Number.isFinite(fx) ? fx : 50
                const markerY = Number.isFinite(fy) ? fy : 50
                return (
                    <div
                        className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
                        onClick={() => setFramingId(null)}
                    >
                        <div
                            className='bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-auto p-5'
                            onClick={e => e.stopPropagation()}
                            dir='rtl'
                        >
                            <div className='flex items-center justify-between mb-2'>
                                <h3 className='text-lg font-bold text-gray-900'>עריכת תמונה — מרכוז וסיבוב</h3>
                                <button onClick={() => setFramingId(null)} className='text-gray-400 hover:text-gray-700 text-3xl leading-none'>×</button>
                            </div>
                            <p className='text-sm text-gray-500 mb-4'>
                                לחצו על הנקודה בתמונה שחשוב שתישאר במרכז בספר, וסובבו אם הועלתה הפוך/בצד. התצוגה המוקטנת מראה בדיוק איך זה ייראה בספר (4:3).
                            </p>
                            <div className='flex flex-col md:flex-row gap-5 items-start'>
                                {/* Full image — click to set focal point */}
                                <div className='flex-1 min-w-0'>
                                    <div className='inline-block relative max-w-full align-top'>
                                        <img
                                            src={fe.imageUrl}
                                            alt=''
                                            onClick={setFocalFromImageClick}
                                            className='block max-w-full max-h-[55vh] w-auto h-auto rounded-lg cursor-crosshair select-none'
                                        />
                                        <div
                                            className='absolute w-6 h-6 rounded-full border-2 border-white bg-[#AA8840]/70 shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2'
                                            style={{ left: `${markerX}%`, top: `${markerY}%` }}
                                        />
                                    </div>
                                    <p className='text-xs text-gray-400 mt-2'>התמונה המלאה שהאורח העלה</p>
                                </div>
                                {/* 4:3 crop preview — exactly how the book renders it (focal + rotation) */}
                                <div className='flex-shrink-0 mx-auto md:mx-0'>
                                    <div className='rounded-lg overflow-hidden border border-gray-200 shadow-sm'>
                                        <EntryPhoto
                                            src={fe.imageUrl}
                                            maxWidth={192}
                                            maxHeight={144}
                                            objectPosition={framingPos}
                                            rotation={framingRot}
                                        />
                                    </div>
                                    <p className='text-xs text-gray-400 mt-2 text-center'>כך זה ייראה בספר</p>
                                    {/* Rotate controls */}
                                    <div className='flex items-center justify-center gap-2 mt-3'>
                                        <button
                                            onClick={() => rotateFraming(-90)}
                                            className='flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#7a6a52] px-2 py-2 rounded-lg border border-gray-200 hover:border-[#AA8840]/40 hover:text-[#AA8840] transition-colors'
                                            title='סובב שמאלה'
                                        >
                                            <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3' /></svg>
                                            שמאלה
                                        </button>
                                        <button
                                            onClick={() => rotateFraming(90)}
                                            className='flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-[#7a6a52] px-2 py-2 rounded-lg border border-gray-200 hover:border-[#AA8840]/40 hover:text-[#AA8840] transition-colors'
                                            title='סובב ימינה'
                                        >
                                            <svg className='w-4 h-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 100 12h3' /></svg>
                                            ימינה
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => { setFramingPos('50% 50%'); setFramingRot(0) }}
                                        className='w-full text-xs text-gray-500 hover:text-[#AA8840] px-2 py-1.5 mt-2 rounded-md border border-gray-200 hover:border-[#AA8840]/30 transition-colors'
                                    >
                                        אפס (מרכז + ללא סיבוב)
                                    </button>
                                </div>
                            </div>
                            <div className='flex gap-2 justify-end mt-5 pt-4 border-t border-gray-100'>
                                <button onClick={() => setFramingId(null)} className='text-sm text-gray-500 px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors'>
                                    ביטול
                                </button>
                                <button
                                    onClick={saveFraming}
                                    disabled={savingFraming}
                                    className='text-sm font-bold gold-shimmer text-white px-6 py-2 rounded-lg disabled:opacity-50'
                                >
                                    {savingFraming ? 'שומר...' : 'שמור'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </AdminPageWrapper>
    )
}
