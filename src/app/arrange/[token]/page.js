'use client'

// /arrange/[token] — the book owner puts the blessings in order.
//
// Opened from a WhatsApp link the super-admin sends (minted in /admin,
// see src/lib/arrangeLinks.js). No login: the token in the URL is the
// whole key, and every read and write goes through /api/arrange/[token]
// on the server, so the browser never touches Firestore directly.
//
// Built for a phone held in one hand:
//   • one list, big rows, a drag handle on the side,
//   • ↑ ↓ buttons for people who do not like dragging,
//   • "לראש" for the one blessing that has to be first,
//   • saves on its own a moment after every change, and says so.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Lock, Check, Loader2, RefreshCcw, ArrowUp, ArrowDown, ChevronsUp, Clock3, Sparkles } from 'lucide-react'
import { Heebo } from 'next/font/google'
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
const SAVE_DELAY_MS = 900

function fmtUploadedAt(ms) {
    if (!ms) return ''
    try {
        return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    } catch {
        return ''
    }
}

function move(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
    const next = Array.from(list)
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
}

export default function ArrangePage() {
    const { token } = useParams()
    const [status, setStatus] = useState('loading') // loading | invalid | error | ready
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    // idle | dirty | saving | saved | failed
    const [saveState, setSaveState] = useState('idle')
    const [savedAt, setSavedAt] = useState(null)
    const timer = useRef(null)
    const latestOrder = useRef([])
    const inFlight = useRef(false)

    const load = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch(`/api/arrange/${encodeURIComponent(token)}`, { cache: 'no-store' })
            if (res.status === 404) { setStatus('invalid'); return }
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setWedding(json.wedding || null)
            setEntries(Array.isArray(json.entries) ? json.entries : [])
            latestOrder.current = (json.entries || []).map(e => e.id)
            setStatus('ready')
        } catch (err) {
            console.error('[arrange] load failed', err)
            setStatus('error')
        }
    }, [token])

    useEffect(() => { load() }, [load])

    // The save itself. Coalesces: if the order changed while a save was
    // in flight, one more save follows with the newest order.
    const save = useCallback(async () => {
        if (inFlight.current) return
        inFlight.current = true
        const order = latestOrder.current
        setSaveState('saving')
        try {
            const res = await fetch(`/api/arrange/${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order }),
            })
            const data = await res.json().catch(() => ({}))
            if (res.status === 404) { setStatus('invalid'); return }
            if (!res.ok || !data?.ok) throw new Error(data?.error || `status ${res.status}`)
            if (latestOrder.current !== order) {
                // Changed again meanwhile — go around once more.
                inFlight.current = false
                return save()
            }
            setSaveState('saved')
            setSavedAt(Date.now())
        } catch (err) {
            console.error('[arrange] save failed', err)
            setSaveState('failed')
        } finally {
            inFlight.current = false
        }
    }, [token])

    const scheduleSave = useCallback(next => {
        latestOrder.current = next.map(e => e.id)
        setSaveState('dirty')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(save, SAVE_DELAY_MS)
    }, [save])

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    function apply(next) {
        setEntries(next)
        scheduleSave(next)
    }

    function onDragEnd(result) {
        if (!result.destination) return
        apply(move(entries, result.source.index, result.destination.index))
    }

    function nudge(index, where) {
        let to = index
        if (where === 'top') to = 0
        else if (where === 'up') to = index - 1
        else if (where === 'down') to = index + 1
        if (to === index) return
        apply(move(entries, index, to))
    }

    function byTime() {
        apply([...entries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)))
    }

    const eventNoun = useMemo(() => EVENT_LABEL[wedding?.eventType] || 'האירוע', [wedding])

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
            <div className='max-w-[640px] mx-auto px-3 sm:px-6 pt-6 pb-32'>

                {/* Header */}
                <div className='flex items-center gap-3 mb-5'>
                    <div className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0' style={{ background: GOLD, boxShadow: '0 14px 28px -12px rgba(170,136,64,0.50)' }}>
                        <Sparkles size={20} className='text-white' />
                    </div>
                    <div className='min-w-0'>
                        <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-0.5'>סדר הברכות בספר {eventNoun}</p>
                        <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight truncate'>
                            {wedding?.title || 'הספר שלכם'}
                        </h1>
                    </div>
                </div>

                <div className='mb-4 rounded-2xl bg-white border border-[#ead9b3] px-4 py-3 text-[13px] text-[#5b4a30] leading-relaxed shadow-sm'>
                    הסדר כאן הוא הסדר שבו הברכות יודפסו. גררו ברכה מהידית שבצד, או השתמשו בחצים. כל שינוי נשמר לבד.
                </div>

                {/* Toolbar */}
                <div className='flex items-center justify-between gap-2 mb-3'>
                    <div className='text-[12px] text-[#7a6a52]'>
                        {entries.length} {entries.length === 1 ? 'ברכה' : 'ברכות'}
                    </div>
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={byTime}
                            disabled={entries.length < 2}
                            className='inline-flex items-center gap-1.5 bg-white text-[#AA8840] px-3 py-2 rounded-xl text-[12px] font-semibold border border-[#AA8840]/20 disabled:opacity-40'
                            title='סידור מחדש לפי סדר הכתיבה'
                        >
                            <Clock3 size={13} />
                            לפי זמן
                        </button>
                        <button
                            onClick={() => { setStatus('loading'); load() }}
                            className='inline-flex items-center justify-center w-9 h-9 bg-white text-[#7a6a52] rounded-xl border border-[#ead9b3]'
                            title='רענון'
                        >
                            <RefreshCcw size={14} />
                        </button>
                    </div>
                </div>

                {entries.length === 0 ? (
                    <div className='text-center py-16 text-[#7a6a52] text-[14px]'>עדיין אין ברכות בספר הזה.</div>
                ) : (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId='arrange-list'>
                            {provided => (
                                <div ref={provided.innerRef} {...provided.droppableProps} className='space-y-2'>
                                    {entries.map((entry, index) => (
                                        <Draggable key={entry.id} draggableId={entry.id} index={index}>
                                            {(prov, snap) => (
                                                <div
                                                    ref={prov.innerRef}
                                                    {...prov.draggableProps}
                                                    style={{ ...prov.draggableProps.style }}
                                                    className={`flex items-center gap-2.5 bg-white rounded-2xl border px-2 py-2 ${
                                                        snap.isDragging ? 'shadow-xl ring-2 ring-[#AA8840]/30 border-[#AA8840]/30' : 'shadow-sm border-[#f0e8d4]'
                                                    }`}
                                                >
                                                    <div
                                                        {...prov.dragHandleProps}
                                                        className='cursor-grab active:cursor-grabbing text-[#c9b48a] px-1 py-3 touch-none shrink-0'
                                                        title='גררו לסידור'
                                                        aria-label='גררו לסידור'
                                                    >
                                                        <svg className='w-5 h-5' viewBox='0 0 24 24' fill='currentColor'><circle cx='9' cy='6' r='1.7' /><circle cx='15' cy='6' r='1.7' /><circle cx='9' cy='12' r='1.7' /><circle cx='15' cy='12' r='1.7' /><circle cx='9' cy='18' r='1.7' /><circle cx='15' cy='18' r='1.7' /></svg>
                                                    </div>

                                                    <div className='w-7 text-center text-[13px] font-extrabold text-[#AA8840] shrink-0 tabular-nums'>{index + 1}</div>

                                                    {entry.imageUrl ? (
                                                        <div className='w-14 h-14 rounded-xl overflow-hidden bg-[#f8f4ec] shrink-0'>
                                                            <img
                                                                src={entry.imageUrl}
                                                                alt=''
                                                                loading='lazy'
                                                                className='w-full h-full object-cover'
                                                                style={{ objectPosition: entry.photoPosition || 'center', transform: `rotate(${((((Number(entry.photoRotation) || 0) % 360) + 360) % 360)}deg)` }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className='w-14 h-14 rounded-xl bg-[#AA8840]/10 flex items-center justify-center shrink-0 text-[#AA8840]'>
                                                            <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.6}><path strokeLinecap='round' strokeLinejoin='round' d='M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' /></svg>
                                                        </div>
                                                    )}

                                                    <div className='flex-1 min-w-0'>
                                                        <div className='font-bold text-[14px] text-[#1a1410] truncate'>{entry.kind === 'blank' ? 'עמוד ריק' : entry.name || 'אורח/ת'}</div>
                                                        <div className='text-[12px] text-[#7a6a52] truncate'>{entry.kind === 'blank' ? 'רק הרקע של הספר' : entry.text || (entry.imageUrl ? 'ברכה עם תמונה' : '')}</div>
                                                        {entry.timestamp && (
                                                            <div className='text-[10px] text-[#b3a48a] mt-0.5'>נכתבה {fmtUploadedAt(entry.timestamp)}</div>
                                                        )}
                                                    </div>

                                                    <div className='flex flex-col gap-1 shrink-0'>
                                                        <button
                                                            onClick={() => nudge(index, 'up')}
                                                            disabled={index === 0}
                                                            className='w-8 h-7 rounded-lg border border-[#AA8840]/20 text-[#AA8840] flex items-center justify-center disabled:opacity-25'
                                                            aria-label='למעלה'
                                                        >
                                                            <ArrowUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => nudge(index, 'down')}
                                                            disabled={index === entries.length - 1}
                                                            className='w-8 h-7 rounded-lg border border-[#AA8840]/20 text-[#AA8840] flex items-center justify-center disabled:opacity-25'
                                                            aria-label='למטה'
                                                        >
                                                            <ArrowDown size={14} />
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => nudge(index, 'top')}
                                                        disabled={index === 0}
                                                        className='w-8 h-[60px] rounded-lg border border-[#AA8840]/20 text-[#AA8840] flex items-center justify-center disabled:opacity-25 shrink-0'
                                                        title='העבירו לראש הרשימה'
                                                        aria-label='לראש הרשימה'
                                                    >
                                                        <ChevronsUp size={15} />
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
            </div>

            {/* Save status — pinned above the thumb */}
            <div className='fixed inset-x-0 bottom-0 pointer-events-none' style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
                <div className='max-w-[640px] mx-auto px-3 sm:px-6'>
                    <div className={`pointer-events-auto rounded-2xl px-4 py-3 shadow-lg border text-[13px] font-semibold flex items-center justify-between gap-3 ${
                        saveState === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-[#ead9b3] text-[#5b4a30]'
                    }`}>
                        <span className='inline-flex items-center gap-2'>
                            {saveState === 'saving' || saveState === 'dirty' ? <Loader2 size={15} className='animate-spin text-[#AA8840]' /> : null}
                            {saveState === 'saved' ? <Check size={15} className='text-emerald-600' /> : null}
                            {saveState === 'idle' && 'הסדר הנוכחי של הספר'}
                            {saveState === 'dirty' && 'שומר…'}
                            {saveState === 'saving' && 'שומר…'}
                            {saveState === 'saved' && `נשמר${savedAt ? ' ' + new Date(savedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}`}
                            {saveState === 'failed' && 'השמירה נכשלה'}
                        </span>
                        {saveState === 'failed' && (
                            <button onClick={save} className='px-3 py-1.5 rounded-lg text-white text-[12px] font-bold' style={{ background: GOLD }}>
                                נסו שוב
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
