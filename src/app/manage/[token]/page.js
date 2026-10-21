'use client'

// /manage/[token] — the book owner manages the blessings, no login.
//
// Opened from a WhatsApp link the super-admin sends (minted in /admin →
// "קישור ניהול ברכות"). The token in the URL is the whole key; every
// read and write goes through /api/manage/[token] on the server, so the
// browser never writes to Firestore. Photos go browser → Storage into
// this event's folder (storage.rules already allow that for guests),
// and only the resulting URL is sent to the API.
//
// Built for a phone in one hand. Per blessing: edit name/text, swap or
// add a photo (and undo that), take it out of the book (with undo), and
// move it. Blank pages placed by us can be moved, nothing else.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import imageCompression from 'browser-image-compression'
import {
    Lock, Check, Loader2, RefreshCcw, ArrowUp, ArrowDown, Pencil, ImagePlus, Trash2, Undo2, GripVertical, X,
} from 'lucide-react'
import { Heebo } from 'next/font/google'
import { storage } from '@/lib/firebaseClient'
import BookLoader from '@/components/BookLoader/BookLoader'

const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700', '900'] })

const EVENT_LABEL = {
    wedding: 'החתונה',
    bar_mitzvah: 'הבר מצווה',
    bat_mitzvah: 'הבת מצווה',
    birthday: 'יום ההולדת',
    brit: 'הברית',
}

const GOLD = 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)'
const ORDER_SAVE_DELAY_MS = 900

function moveItem(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
    const next = list.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
}

function rotationOf(e) {
    return ((((Number(e.photoRotation) || 0) % 360) + 360) % 360)
}

export default function ManagePage() {
    const { token } = useParams()
    const [status, setStatus] = useState('loading') // loading | invalid | error | ready
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    const [editing, setEditing] = useState(null) // { id, name, text }
    const [busyId, setBusyId] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null) // entry id
    const [trash, setTrash] = useState([]) // [{ entry, index }] deleted this visit, undoable
    const [toast, setToast] = useState(null) // { kind: 'ok' | 'err', text }
    const [orderState, setOrderState] = useState('idle') // idle | dirty | saving | saved | failed
    const orderTimer = useRef(null)
    const latestOrder = useRef([])
    const fileInput = useRef(null)
    const photoTarget = useRef(null)

    const api = useCallback(async (payload) => {
        const res = await fetch(`/api/manage/${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (res.status === 404 && data?.error === 'Link not found') { setStatus('invalid'); throw new Error('invalid') }
        if (!res.ok || !data?.ok) throw new Error(data?.error || `status ${res.status}`)
        return data
    }, [token])

    const load = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch(`/api/manage/${encodeURIComponent(token)}`, { cache: 'no-store' })
            if (res.status === 404) { setStatus('invalid'); return }
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setWedding(json.wedding || null)
            const list = Array.isArray(json.entries) ? json.entries : []
            setEntries(list)
            latestOrder.current = list.map(e => e.id)
            setStatus('ready')
        } catch (err) {
            console.error('[manage] load failed', err)
            setStatus('error')
        }
    }, [token])

    useEffect(() => { load() }, [load])
    useEffect(() => () => { if (orderTimer.current) clearTimeout(orderTimer.current) }, [])
    useEffect(() => {
        if (!toast) return undefined
        const t = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(t)
    }, [toast])

    const say = (text, kind = 'ok') => setToast({ text, kind })

    // ── Order ───────────────────────────────────────────────────────
    const saveOrder = useCallback(async () => {
        const order = latestOrder.current
        setOrderState('saving')
        try {
            await api({ action: 'order', order })
            if (latestOrder.current !== order) return saveOrder()
            setOrderState('saved')
        } catch (err) {
            if (err.message !== 'invalid') setOrderState('failed')
        }
    }, [api])

    function applyOrder(next) {
        setEntries(next)
        latestOrder.current = next.map(e => e.id)
        setOrderState('dirty')
        if (orderTimer.current) clearTimeout(orderTimer.current)
        orderTimer.current = setTimeout(saveOrder, ORDER_SAVE_DELAY_MS)
    }

    function nudge(index, to) {
        if (to < 0 || to >= entries.length || to === index) return
        applyOrder(moveItem(entries, index, to))
    }

    // ── Edit ────────────────────────────────────────────────────────
    async function saveEdit() {
        if (!editing) return
        setBusyId(editing.id)
        try {
            const data = await api({ action: 'edit', entryId: editing.id, name: editing.name, text: editing.text })
            setEntries(prev => prev.map(e => (e.id === editing.id ? { ...e, name: data.name ?? e.name, text: data.text ?? e.text } : e)))
            setEditing(null)
            say('הברכה עודכנה')
        } catch (err) {
            if (err.message !== 'invalid') say('השמירה נכשלה, נסו שוב', 'err')
        } finally {
            setBusyId(null)
        }
    }

    // ── Photo ───────────────────────────────────────────────────────
    function pickPhoto(entryId) {
        photoTarget.current = entryId
        fileInput.current?.click()
    }

    async function onPhotoFile(file) {
        const entryId = photoTarget.current
        if (!file || !entryId || !wedding?.id) return
        setBusyId(entryId)
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 4, maxWidthOrHeight: 3000, useWebWorker: true })
            const aspect = await new Promise(resolve => {
                const img = new Image()
                const url = URL.createObjectURL(compressed)
                img.onload = () => { resolve(img.naturalWidth / img.naturalHeight); URL.revokeObjectURL(url) }
                img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
                img.src = url
            })
            const path = `weddings/${wedding.id}/manage_${entryId}_${Date.now()}.jpg`
            const snap = await uploadBytes(storageRef(storage, path), compressed, { contentType: compressed.type || 'image/jpeg' })
            const url = await getDownloadURL(snap.ref)
            await api({ action: 'photo', entryId, imageUrl: url, imgAspect: aspect })
            setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, imageUrl: url, photoReplaced: true, photoPosition: null, photoRotation: 0 } : e)))
            say('התמונה עודכנה')
        } catch (err) {
            if (err.message !== 'invalid') say('העלאת התמונה נכשלה, נסו שוב', 'err')
        } finally {
            setBusyId(null)
            photoTarget.current = null
            if (fileInput.current) fileInput.current.value = ''
        }
    }

    async function restorePhoto(entry) {
        setBusyId(entry.id)
        try {
            const data = await api({ action: 'restorePhoto', entryId: entry.id })
            setEntries(prev => prev.map(e => (e.id === entry.id ? { ...e, imageUrl: data.imageUrl || null, photoReplaced: false } : e)))
            say(entry.guestHadPhoto ? 'התמונה המקורית חזרה' : 'התמונה הוסרה')
        } catch (err) {
            if (err.message !== 'invalid') say('לא הצלחנו, נסו שוב', 'err')
        } finally {
            setBusyId(null)
        }
    }

    // ── Delete / undo ───────────────────────────────────────────────
    async function doDelete(entry) {
        const index = entries.findIndex(e => e.id === entry.id)
        setBusyId(entry.id)
        try {
            await api({ action: 'delete', entryId: entry.id })
            setEntries(prev => prev.filter(e => e.id !== entry.id))
            latestOrder.current = latestOrder.current.filter(id => id !== entry.id)
            setTrash(prev => [{ entry, index }, ...prev])
            setConfirmDelete(null)
        } catch (err) {
            if (err.message !== 'invalid') say('ההסרה נכשלה, נסו שוב', 'err')
        } finally {
            setBusyId(null)
        }
    }

    async function undoDelete(item) {
        setBusyId(item.entry.id)
        try {
            const data = await api({ action: 'undoDelete', entryId: item.entry.id })
            setEntries(prev => {
                const next = prev.slice()
                next.splice(Math.min(item.index, next.length), 0, data.entry || item.entry)
                latestOrder.current = next.map(e => e.id)
                return next
            })
            setTrash(prev => prev.filter(t => t.entry.id !== item.entry.id))
            say('הברכה חזרה לספר')
        } catch (err) {
            if (err.message !== 'invalid') say('השחזור נכשל, נסו שוב', 'err')
        } finally {
            setBusyId(null)
        }
    }

    const eventNoun = useMemo(() => EVENT_LABEL[wedding?.eventType] || 'האירוע', [wedding])
    const blessingCount = entries.filter(e => e.kind !== 'blank').length

    if (status === 'loading') return <BookLoader />

    if (status === 'invalid') {
        return (
            <div className={`${heebo.className} min-h-screen flex flex-col items-center justify-center text-center px-6`} dir='rtl' style={{ background: '#f8f4ec' }}>
                <div className='w-14 h-14 rounded-2xl flex items-center justify-center mb-4' style={{ background: GOLD }}>
                    <Lock size={22} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1.5'>הקישור אינו תקף</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>
                    ייתכן שהקישור בוטל או שהוא לא הועתק במלואו. כתבו לנו בוואטסאפ ונשלח קישור חדש.
                </p>
            </div>
        )
    }

    if (status === 'error') {
        return (
            <div className={`${heebo.className} min-h-screen flex flex-col items-center justify-center text-center px-6`} dir='rtl' style={{ background: '#f8f4ec' }}>
                <p className='text-[#7a6a52] text-[14px] mb-3'>לא הצלחנו לטעון את הברכות</p>
                <button onClick={() => { setStatus('loading'); load() }} className='px-4 py-2 rounded-lg text-white text-[13px] font-bold' style={{ background: GOLD }}>
                    נסו שוב
                </button>
            </div>
        )
    }

    return (
        <div className={`${heebo.className} min-h-screen`} dir='rtl' style={{ background: 'linear-gradient(180deg, #f8f4ec 0%, #fdfaf3 100%)' }}>
            <input
                ref={fileInput}
                type='file'
                accept='image/*'
                className='hidden'
                onChange={e => onPhotoFile(e.target.files?.[0])}
            />

            <div className='max-w-[680px] mx-auto px-3 sm:px-6 pt-6 pb-32'>
                {/* Header */}
                <div className='flex items-center gap-3 mb-4'>
                    <div className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0' style={{ background: GOLD, boxShadow: '0 14px 28px -12px rgba(170,136,64,0.50)' }}>
                        <Pencil size={20} className='text-white' />
                    </div>
                    <div className='min-w-0'>
                        <p className='text-[11px] text-[#a89378] tracking-wide font-semibold mb-0.5'>ניהול ספר הברכות של {eventNoun}</p>
                        <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight truncate'>{wedding?.title || 'הספר שלכם'}</h1>
                    </div>
                </div>

                <div className='mb-4 rounded-2xl bg-white border border-[#ead9b3] px-4 py-3 text-[13px] text-[#5b4a30] leading-relaxed shadow-sm'>
                    כאן אפשר לתקן שם או טעות בברכה, להחליף או להוסיף תמונה, להוציא ברכה מהספר ולשנות את הסדר. הסדר כאן הוא הסדר שבו הברכות יודפסו. כל שינוי נשמר מיד.
                </div>

                {/* Toolbar */}
                <div className='flex items-center justify-between gap-2 mb-3'>
                    <div className='text-[12.5px] text-[#7a6a52]'>
                        {blessingCount} {blessingCount === 1 ? 'ברכה' : 'ברכות'}
                    </div>
                    <div className='flex items-center gap-2'>
                        <a
                            href={`/arrange/${encodeURIComponent(token)}`}
                            className='inline-flex items-center gap-1.5 bg-white text-[#AA8840] px-3 py-2 rounded-xl text-[12px] font-semibold border border-[#AA8840]/20'
                        >
                            <GripVertical size={13} />
                            סידור בגרירה
                        </a>
                        <button
                            onClick={() => { setStatus('loading'); load() }}
                            className='inline-flex items-center justify-center w-9 h-9 bg-white text-[#7a6a52] rounded-xl border border-[#ead9b3]'
                            title='רענון'
                            aria-label='רענון'
                        >
                            <RefreshCcw size={14} />
                        </button>
                    </div>
                </div>

                {/* Removed this visit — undo stays available until the page is closed */}
                {trash.length > 0 && (
                    <div className='mb-3 rounded-2xl border border-[#f0d9d3] bg-[#fff8f6] px-3 py-2.5'>
                        <p className='text-[12px] font-bold text-[#9a3b2a] mb-1.5'>הוצאו מהספר עכשיו</p>
                        <div className='space-y-1.5'>
                            {trash.map(item => (
                                <div key={item.entry.id} className='flex items-center justify-between gap-2 text-[12.5px]'>
                                    <span className='truncate text-[#5b4a30]'>{item.entry.name || 'ברכה ללא שם'}</span>
                                    <button
                                        onClick={() => undoDelete(item)}
                                        disabled={busyId === item.entry.id}
                                        className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#ead9b3] text-[#AA8840] font-bold text-[12px] shrink-0 disabled:opacity-50'
                                    >
                                        <Undo2 size={13} /> החזר לספר
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {entries.length === 0 ? (
                    <div className='text-center py-16 text-[#7a6a52] text-[14px]'>עדיין אין ברכות בספר הזה.</div>
                ) : (
                    <div className='space-y-3'>
                        {entries.map((entry, index) => {
                            const busy = busyId === entry.id
                            const isEditing = editing?.id === entry.id
                            const place = (
                                <div className='flex items-center gap-1 shrink-0'>
                                    <span className='w-7 text-center text-[13px] font-extrabold text-[#AA8840] tabular-nums'>{index + 1}</span>
                                    <button onClick={() => nudge(index, index - 1)} disabled={index === 0} className='w-9 h-9 rounded-lg border border-[#AA8840]/20 text-[#AA8840] flex items-center justify-center disabled:opacity-25' aria-label='למעלה'>
                                        <ArrowUp size={15} />
                                    </button>
                                    <button onClick={() => nudge(index, index + 1)} disabled={index === entries.length - 1} className='w-9 h-9 rounded-lg border border-[#AA8840]/20 text-[#AA8840] flex items-center justify-center disabled:opacity-25' aria-label='למטה'>
                                        <ArrowDown size={15} />
                                    </button>
                                </div>
                            )

                            if (entry.kind === 'blank') {
                                return (
                                    <div key={entry.id} className='flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#d9c39a] bg-[#fbf6ec] px-3 py-2.5'>
                                        <div className='min-w-0'>
                                            <div className='font-bold text-[13.5px] text-[#5b4a30]'>עמוד עיצוב</div>
                                            <div className='text-[11.5px] text-[#a89378]'>עמוד שהוספנו לעיצוב הספר. אפשר להזיז אותו.</div>
                                        </div>
                                        {place}
                                    </div>
                                )
                            }

                            return (
                                <div key={entry.id} className='rounded-2xl bg-white border border-[#f0e8d4] shadow-sm overflow-hidden'>
                                    <div className='flex gap-3 p-3'>
                                        {entry.imageUrl ? (
                                            <div className='w-[88px] h-[88px] rounded-xl overflow-hidden bg-[#f8f4ec] shrink-0'>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={entry.imageUrl}
                                                    alt=''
                                                    loading='lazy'
                                                    className='w-full h-full object-cover'
                                                    style={{ objectPosition: entry.photoPosition || 'center', transform: `rotate(${rotationOf(entry)}deg)` }}
                                                />
                                            </div>
                                        ) : (
                                            <div className='w-[88px] h-[88px] rounded-xl shrink-0 flex flex-col items-center justify-center gap-1 border border-dashed border-[#d9c39a] text-[#b8a07a] text-[11px]' style={{ background: '#fdfaf3' }}>
                                                <ImagePlus size={18} />
                                                בלי תמונה
                                            </div>
                                        )}
                                        <div className='flex-1 min-w-0'>
                                            {isEditing ? (
                                                <div className='space-y-2'>
                                                    <label className='block'>
                                                        <span className='block text-[11px] font-bold text-[#7a6a52] mb-1'>שם</span>
                                                        <input
                                                            id={`name-${entry.id}`}
                                                            value={editing.name}
                                                            onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                                                            className='w-full rounded-xl border border-[#ead9b3] px-3 py-2 text-[14px] font-bold text-[#1a1410] outline-none focus:border-[#AA8840]'
                                                        />
                                                    </label>
                                                    <label className='block'>
                                                        <span className='block text-[11px] font-bold text-[#7a6a52] mb-1'>הברכה</span>
                                                        <textarea
                                                            id={`text-${entry.id}`}
                                                            value={editing.text}
                                                            onChange={e => setEditing(v => ({ ...v, text: e.target.value }))}
                                                            rows={6}
                                                            className='w-full rounded-xl border border-[#ead9b3] px-3 py-2 text-[14px] text-[#3d2e1a] leading-relaxed outline-none focus:border-[#AA8840] resize-y'
                                                        />
                                                    </label>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className='font-bold text-[15px] text-[#1a1410] truncate'>{entry.name || 'ברכה ללא שם'}</div>
                                                    <p className='text-[13px] text-[#5b4a30] leading-relaxed mt-0.5 line-clamp-4' style={entry.preserveLineBreaks ? { whiteSpace: 'pre-line' } : undefined}>
                                                        {entry.text || <span className='text-[#b8a07a]'>אין טקסט</span>}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className='flex flex-wrap items-center gap-1.5 px-3 pb-3'>
                                        {isEditing ? (
                                            <>
                                                <button onClick={saveEdit} disabled={busy} className='inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-60' style={{ background: GOLD }}>
                                                    {busy ? <Loader2 size={14} className='animate-spin' /> : <Check size={14} />} שמירה
                                                </button>
                                                <button onClick={() => setEditing(null)} disabled={busy} className='inline-flex items-center gap-1 px-3 py-2 rounded-xl text-[13px] font-semibold text-[#7a6a52] border border-[#ead9b3] bg-white'>
                                                    <X size={14} /> ביטול
                                                </button>
                                            </>
                                        ) : confirmDelete === entry.id ? (
                                            <>
                                                <span className='text-[13px] font-bold text-[#9a3b2a]'>להוציא את הברכה מהספר?</span>
                                                <button onClick={() => doDelete(entry)} disabled={busy} className='inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold bg-[#b42318] disabled:opacity-60'>
                                                    {busy ? <Loader2 size={14} className='animate-spin' /> : <Trash2 size={14} />} כן, להוציא
                                                </button>
                                                <button onClick={() => setConfirmDelete(null)} className='px-3 py-2 rounded-xl text-[13px] font-semibold text-[#7a6a52] border border-[#ead9b3] bg-white'>
                                                    לא
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => { setConfirmDelete(null); setEditing({ id: entry.id, name: entry.name, text: entry.text }) }}
                                                    disabled={busy}
                                                    className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-[#AA8840] border border-[#AA8840]/25 bg-white'
                                                >
                                                    <Pencil size={13} /> עריכה
                                                </button>
                                                <button
                                                    onClick={() => pickPhoto(entry.id)}
                                                    disabled={busy}
                                                    className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-bold text-[#AA8840] border border-[#AA8840]/25 bg-white disabled:opacity-60'
                                                >
                                                    {busy ? <Loader2 size={13} className='animate-spin' /> : <ImagePlus size={13} />}
                                                    {entry.imageUrl ? 'החלפת תמונה' : 'הוספת תמונה'}
                                                </button>
                                                {entry.photoReplaced && (
                                                    <button
                                                        onClick={() => restorePhoto(entry)}
                                                        disabled={busy}
                                                        className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#7a6a52] border border-[#ead9b3] bg-white'
                                                    >
                                                        <Undo2 size={13} /> {entry.guestHadPhoto ? 'התמונה המקורית' : 'הסרת התמונה'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => { setEditing(null); setConfirmDelete(entry.id) }}
                                                    disabled={busy}
                                                    className='inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#b42318] border border-[#f0d9d3] bg-white'
                                                >
                                                    <Trash2 size={13} /> הוצאה מהספר
                                                </button>
                                                <div className='mr-auto'>{place}</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Status bar — the order save, and short confirmations */}
            <div className='fixed inset-x-0 bottom-0 pointer-events-none' style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
                <div className='max-w-[680px] mx-auto px-3 sm:px-6'>
                    {(toast || orderState !== 'idle') && (
                        <div className={`pointer-events-auto rounded-2xl px-4 py-3 shadow-lg border text-[13px] font-semibold flex items-center justify-between gap-3 ${
                            toast?.kind === 'err' || (!toast && orderState === 'failed') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-[#ead9b3] text-[#5b4a30]'
                        }`} role='status'>
                            <span className='inline-flex items-center gap-2'>
                                {toast ? (
                                    <>
                                        {toast.kind === 'ok' ? <Check size={15} className='text-emerald-600' /> : null}
                                        {toast.text}
                                    </>
                                ) : (
                                    <>
                                        {(orderState === 'saving' || orderState === 'dirty') && <Loader2 size={15} className='animate-spin text-[#AA8840]' />}
                                        {orderState === 'saved' && <Check size={15} className='text-emerald-600' />}
                                        {(orderState === 'saving' || orderState === 'dirty') && 'שומר את הסדר…'}
                                        {orderState === 'saved' && 'הסדר נשמר'}
                                        {orderState === 'failed' && 'שמירת הסדר נכשלה'}
                                    </>
                                )}
                            </span>
                            {!toast && orderState === 'failed' && (
                                <button onClick={saveOrder} className='px-3 py-1.5 rounded-lg text-white text-[12px] font-bold' style={{ background: GOLD }}>
                                    נסו שוב
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
