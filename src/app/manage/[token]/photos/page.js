'use client'

// /manage/[token]/photos — the photos of the book, and nothing else.
//
// The manage page shows a blessing per card with a small thumbnail; that
// is the right view for fixing a name and the wrong one for going
// through a hundred pictures to find the blurry ones. This is the same
// link with the words taken away: a contact sheet of every photo in the
// book, a full-screen view to flip through them, and one decision per
// photo — it stays, or it goes out.
//
// "Out" never destroys anything (see lib/manageLinks.js, planPhotoRemoval):
//   • a blessing with words keeps its page, without the photo;
//   • a page that is only a photo leaves the book whole.
// Both wait under "הוצאו מהספר" and come back with one tap, today or
// next week — the list is read from the server, not kept in the tab.
//
// Photos are shown whole (contain, never cropped): the owner is judging
// the picture, so the picture is what they must see. They load as small
// versions from our own domain (lib/imgProxy.js), like ניהול ברכות.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Lock, Check, Loader2, Images, ArrowRight, ChevronRight, ChevronLeft, X, Undo2, ImageOff } from 'lucide-react'
import { Heebo } from 'next/font/google'
import BookLoader from '@/components/BookLoader/BookLoader'
import useWorld from '@/components/Hall/useWorld'
import { worldOfEvent } from '@/lib/eventWorld'
import { thumbUrl, fallBackToOriginal } from '@/lib/imgProxy'

const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '700', '900'] })

const EVENT_LABEL = {
    wedding: 'החתונה',
    bar_mitzvah: 'הבר מצווה',
    twins_bar_mitzvah: 'הבר מצווה',
    bat_mitzvah: 'הבת מצווה',
    birthday: 'יום ההולדת',
    brit: 'הברית',
}

const GOLD = 'var(--wt-primary)'
const SWIPE_PX = 56

function rotationOf(n) {
    return ((((Number(n) || 0) % 360) + 360) % 360)
}

// Same order as every reader of the book: explicit place first, then time.
function inBookOrder(a, b) {
    const ao = Number.isInteger(a.orderIndex) ? a.orderIndex : Infinity
    const bo = Number.isInteger(b.orderIndex) ? b.orderIndex : Infinity
    if (ao !== bo) return ao - bo
    return (a.timestamp || 0) - (b.timestamp || 0)
}

function photoCount(n) {
    return n === 1 ? 'תמונה אחת' : `${n} תמונות`
}

// One photo, whole, inside whatever box it is given. A photo the book
// shows turned (photoRotation) is turned here too, so a picture that is
// upright in print does not look broken on this page. The quarter turns
// need the box's own size (cqw/cqh), hence the container.
function Photo({ url, rotation, width, eager = false }) {
    const turned = rotation === 90 || rotation === 270
    return (
        <span className='block w-full h-full relative' style={{ containerType: 'size' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={thumbUrl(url, width)}
                data-original={url}
                onError={fallBackToOriginal}
                alt=''
                loading={eager ? 'eager' : 'lazy'}
                decoding='async'
                draggable={false}
                className='absolute top-1/2 left-1/2 object-contain select-none'
                style={{
                    width: turned ? '100cqh' : '100%',
                    height: turned ? '100cqw' : '100%',
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                }}
            />
        </span>
    )
}

export default function ManagePhotosPage() {
    const { token } = useParams()
    const [status, setStatus] = useState('loading') // loading | invalid | error | ready
    const [wedding, setWedding] = useState(null)
    useWorld(worldOfEvent(wedding))
    const [entries, setEntries] = useState([])
    const [removedPages, setRemovedPages] = useState([])
    const [tab, setTab] = useState('in') // in | out
    const [open, setOpen] = useState(null) // index into the current tab's list, or null
    const [busy, setBusy] = useState(() => new Set())
    const [toast, setToast] = useState(null) // { kind, text, undo? }
    const [bigWidth, setBigWidth] = useState(1200)
    const [drag, setDrag] = useState(0)
    const dragStart = useRef(null)
    const pushedHistory = useRef(false)

    const load = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch(`/api/manage/${encodeURIComponent(token)}?photos=1`, { cache: 'no-store' })
            if (res.status === 404) { setStatus('invalid'); return }
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setWedding(json.wedding || null)
            setEntries(Array.isArray(json.entries) ? json.entries : [])
            setRemovedPages(Array.isArray(json.removedPages) ? json.removedPages : [])
            setStatus('ready')
        } catch (err) {
            console.error('[manage photos] load failed', err)
            setStatus('error')
        }
    }, [token])

    useEffect(() => { load() }, [load])
    useEffect(() => {
        setBigWidth(Math.min(1920, Math.ceil(window.innerWidth * Math.min(window.devicePixelRatio || 1, 3))))
    }, [])
    useEffect(() => {
        if (!toast) return undefined
        const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3200)
        return () => clearTimeout(t)
    }, [toast])

    // ── The two lists ───────────────────────────────────────────────
    const inBook = useMemo(
        () => entries
            .filter(e => e.kind !== 'blank' && e.imageUrl)
            .map(e => ({ id: e.id, url: e.imageUrl, name: e.name, rotation: rotationOf(e.photoRotation), wholePage: !e.hasText })),
        [entries],
    )
    const out = useMemo(
        () => [
            ...entries
                .filter(e => e.removedPhotoUrl)
                .map(e => ({ id: e.id, url: e.removedPhotoUrl, name: e.name, rotation: rotationOf(e.photoRotation), wholePage: false })),
            ...removedPages.map(p => ({ id: p.id, url: p.imageUrl, name: p.name, rotation: rotationOf(p.photoRotation), wholePage: true })),
        ],
        [entries, removedPages],
    )
    const list = tab === 'in' ? inBook : out
    const current = open != null ? list[open] : null

    // The list under an open photo can shrink (the photo was just taken
    // out): stay on the same place, which is now the next photo.
    useEffect(() => {
        if (open == null) return
        if (list.length === 0) closeViewer()
        else if (open > list.length - 1) setOpen(list.length - 1)
    }, [list.length, open])

    // ── Server ──────────────────────────────────────────────────────
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

    const setBusyFor = (id, on) => setBusy(prev => {
        const next = new Set(prev)
        if (on) next.add(id)
        else next.delete(id)
        return next
    })

    async function takeOut(item) {
        if (busy.has(item.id)) return
        setBusyFor(item.id, true)
        try {
            const data = await api({ action: 'removePhoto', entryId: item.id })
            if (data.mode === 'page') {
                setEntries(prev => prev.filter(e => e.id !== item.id))
                if (data.page) setRemovedPages(prev => [data.page, ...prev.filter(p => p.id !== item.id)])
            } else if (data.entry) {
                setEntries(prev => prev.map(e => (e.id === item.id ? data.entry : e)))
            }
            setToast({ kind: 'ok', text: 'התמונה הוצאה מהספר', undo: { ...item } })
        } catch (err) {
            if (err.message !== 'invalid') setToast({ kind: 'err', text: 'לא הצלחנו להוציא את התמונה, נסו שוב' })
        } finally {
            setBusyFor(item.id, false)
        }
    }

    async function bringBack(item) {
        if (busy.has(item.id)) return
        setBusyFor(item.id, true)
        try {
            const data = await api({ action: 'returnPhoto', entryId: item.id })
            if (data.mode === 'page') {
                setRemovedPages(prev => prev.filter(p => p.id !== item.id))
                if (data.entry) setEntries(prev => [...prev.filter(e => e.id !== item.id), data.entry].sort(inBookOrder))
            } else if (data.entry) {
                setEntries(prev => prev.map(e => (e.id === item.id ? data.entry : e)))
            }
            setToast({ kind: 'ok', text: 'התמונה חזרה לספר' })
        } catch (err) {
            if (err.message === 'invalid') return
            setToast({
                kind: 'err',
                text: err.message === 'entry-has-photo'
                    ? 'לברכה הזו כבר נוספה תמונה אחרת. כדי להחזיר את זו, הסירו קודם את החדשה בעמוד ניהול הברכות.'
                    : 'לא הצלחנו להחזיר את התמונה, נסו שוב',
            })
        } finally {
            setBusyFor(item.id, false)
        }
    }

    // ── The full-screen view ────────────────────────────────────────
    function openViewer(index) {
        setOpen(index)
        setDrag(0)
        // The phone's back button closes the photo instead of leaving the page.
        if (!pushedHistory.current) {
            window.history.pushState({ wtPhoto: true }, '')
            pushedHistory.current = true
        }
    }

    function closeViewer() {
        if (pushedHistory.current) {
            pushedHistory.current = false
            window.history.back()
        }
        setOpen(null)
    }

    const step = useCallback((by) => {
        setDrag(0)
        setOpen(i => {
            if (i == null) return i
            const next = i + by
            return next < 0 || next > list.length - 1 ? i : next
        })
    }, [list.length])

    useEffect(() => {
        const onPop = () => { pushedHistory.current = false; setOpen(null) }
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    useEffect(() => {
        if (open == null) return undefined
        const onKey = e => {
            if (e.key === 'Escape') closeViewer()
            // Right-to-left: the next photo is to the left.
            else if (e.key === 'ArrowLeft') step(1)
            else if (e.key === 'ArrowRight') step(-1)
        }
        const before = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = before
            window.removeEventListener('keydown', onKey)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open == null, step])

    // The neighbours are on their way before the finger asks for them.
    useEffect(() => {
        if (open == null) return
        for (const i of [open + 1, open - 1]) {
            const n = list[i]
            if (n) new window.Image().src = thumbUrl(n.url, bigWidth)
        }
    }, [open, list, bigWidth])

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        dragStart.current = { x: e.clientX, y: e.clientY, locked: false }
    }
    function onPointerMove(e) {
        const s = dragStart.current
        if (!s) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (!s.locked) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
            if (Math.abs(dy) > Math.abs(dx)) { dragStart.current = null; return }
            s.locked = true
        }
        setDrag(dx)
    }
    function onPointerUp() {
        const s = dragStart.current
        dragStart.current = null
        if (!s?.locked) return
        // Right-to-left: pulling the photo to the right brings the next one.
        if (drag > SWIPE_PX) step(1)
        else if (drag < -SWIPE_PX) step(-1)
        setDrag(0)
    }

    const eventNoun = EVENT_LABEL[wedding?.eventType] || 'האירוע'
    const page = { background: 'transparent' }

    if (status === 'loading') return <BookLoader />

    if (status === 'invalid') {
        return (
            <div className={`${heebo.className} min-h-screen flex flex-col items-center justify-center text-center px-6`} dir='rtl' style={{ background: 'transparent' }}>
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
            <div className={`${heebo.className} min-h-screen flex flex-col items-center justify-center text-center px-6`} dir='rtl' style={{ background: 'transparent' }}>
                <p className='text-[#7a6a52] text-[14px] mb-3'>לא הצלחנו לטעון את התמונות</p>
                <button onClick={() => { setStatus('loading'); load() }} className='px-4 py-2 rounded-lg text-white text-[13px] font-bold' style={{ background: GOLD }}>
                    נסו שוב
                </button>
            </div>
        )
    }

    const nothingAtAll = inBook.length === 0 && out.length === 0

    return (
        <div className={`${heebo.className} min-h-screen`} dir='rtl' style={page}>
            <div className='max-w-[1080px] mx-auto px-3 sm:px-6 pt-5 pb-32'>
                <a
                    href={`/manage/${encodeURIComponent(token)}`}
                    className='inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#AA8840] py-2 -my-2 mb-2'
                >
                    <ArrowRight size={15} />
                    לניהול הברכות
                </a>

                {/* Header */}
                <div className='flex items-center gap-3 mb-4'>
                    <div className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0' style={{ background: GOLD, boxShadow: '0 14px 28px -12px rgba(30,16,66,0.45)' }}>
                        <Images size={21} className='text-white' />
                    </div>
                    <div className='min-w-0'>
                        <p className='text-[11px] text-[#a89378] tracking-wide font-semibold mb-0.5'>התמונות בספר הברכות של {eventNoun}</p>
                        <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight truncate'>{wedding?.title || 'הספר שלכם'}</h1>
                    </div>
                </div>

                {nothingAtAll ? (
                    <div className='text-center py-16 text-[#7a6a52] text-[14px]'>עדיין אין תמונות בספר הזה.</div>
                ) : (
                    <>
                        <div className='mb-3 rounded-2xl bg-white border border-[#ead9b3] px-4 py-3 text-[13px] text-[#5b4a30] leading-relaxed shadow-sm'>
                            לחיצה על תמונה פותחת אותה בגדול. תמונה שמוציאים מהספר לא נמחקת, ואפשר להחזיר אותה מתי שרוצים. הברכה שלצידה נשארת בספר.
                        </div>

                        {/* In the book / taken out */}
                        <div className='sticky top-0 z-10 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 mb-2' style={{ background: 'rgba(246,232,201,0.96)', backdropFilter: 'blur(8px)' }}>
                            <div role='tablist' aria-label='אילו תמונות להציג' className='grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#efe6d2]'>
                                {[
                                    { key: 'in', label: 'בספר', n: inBook.length },
                                    { key: 'out', label: 'הוצאו מהספר', n: out.length },
                                ].map(t => (
                                    <button
                                        key={t.key}
                                        role='tab'
                                        aria-selected={tab === t.key}
                                        onClick={() => setTab(t.key)}
                                        className={`h-11 rounded-xl text-[13.5px] font-bold transition-colors ${
                                            tab === t.key ? 'bg-white text-[#1a1410] shadow-sm' : 'text-[#7a6a52]'
                                        }`}
                                    >
                                        {t.label} <span className='tabular-nums font-semibold opacity-70'>({t.n})</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {list.length === 0 ? (
                            <div className='text-center py-14 text-[#7a6a52] text-[14px] leading-relaxed'>
                                {tab === 'in' ? 'אין כרגע תמונות בספר. כל התמונות נמצאות תחת "הוצאו מהספר".' : 'לא הוצאתם אף תמונה. כל התמונות בספר.'}
                            </div>
                        ) : (
                            <ul className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3'>
                                {list.map((item, index) => {
                                    const isBusy = busy.has(item.id)
                                    return (
                                        <li key={`${tab}-${item.id}`} className='rounded-2xl bg-white border border-[#f0e8d4] shadow-sm overflow-hidden'>
                                            <button
                                                onClick={() => openViewer(index)}
                                                className='block w-full aspect-square bg-[#f3ecdf]'
                                                aria-label={`פתיחת התמונה${item.name ? ` של ${item.name}` : ''} בגדול`}
                                            >
                                                <Photo url={item.url} rotation={item.rotation} width={640} eager={index < 4} />
                                            </button>
                                            <div className='flex items-center justify-between gap-1.5 pr-2.5 pl-1.5 py-1.5'>
                                                <span className={`min-w-0 truncate text-[12.5px] ${item.name ? 'font-bold text-[#3d2e1a]' : 'text-[#b8a07a]'}`}>
                                                    {item.name || 'עמוד תמונה'}
                                                </span>
                                                {tab === 'in' ? (
                                                    <button
                                                        onClick={() => takeOut(item)}
                                                        disabled={isBusy}
                                                        className='shrink-0 inline-flex items-center gap-1 h-10 px-3 rounded-xl text-[12.5px] font-bold text-[#b42318] border border-[#f0d9d3] bg-white disabled:opacity-60'
                                                    >
                                                        {isBusy ? <Loader2 size={13} className='animate-spin' /> : <ImageOff size={13} />}
                                                        הוצאה
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => bringBack(item)}
                                                        disabled={isBusy}
                                                        className='shrink-0 inline-flex items-center gap-1 h-10 px-3 rounded-xl text-[12.5px] font-bold text-[#AA8840] border border-[#AA8840]/25 bg-white disabled:opacity-60'
                                                    >
                                                        {isBusy ? <Loader2 size={13} className='animate-spin' /> : <Undo2 size={13} />}
                                                        החזרה
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </>
                )}
            </div>

            {/* One photo, as large as the screen allows */}
            {current && (
                <div className='fixed inset-0 z-[60] flex flex-col' style={{ background: '#14110d' }} role='dialog' aria-modal='true' aria-label='תמונה בגדול'>
                    <div className='flex items-center justify-between gap-3 px-3 text-white' style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
                        <button onClick={closeViewer} className='w-11 h-11 rounded-full flex items-center justify-center bg-white/10' aria-label='סגירה'>
                            <X size={20} />
                        </button>
                        <div className='min-w-0 text-center'>
                            <div className='text-[14.5px] font-bold truncate'>{current.name || 'עמוד תמונה'}</div>
                            <div className='text-[12px] text-white/60 tabular-nums'>{open + 1} מתוך {list.length}</div>
                        </div>
                        <span className='w-11' aria-hidden='true' />
                    </div>

                    <div
                        className='flex-1 min-h-0 relative overflow-hidden'
                        style={{ touchAction: 'pan-y' }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onPointerLeave={onPointerUp}
                    >
                        <div
                            key={`${tab}-${current.id}`}
                            className='absolute inset-0 p-2 sm:p-6'
                            style={{ transform: `translateX(${drag}px)`, transition: dragStart.current ? 'none' : 'transform 160ms ease-out' }}
                        >
                            <Photo url={current.url} rotation={current.rotation} width={bigWidth} eager />
                        </div>
                    </div>

                    <div className='px-3 pt-2 text-white' style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
                        <p className='text-center text-[12px] text-white/60 leading-snug mb-2 min-h-[16px]'>
                            {tab === 'in'
                                ? (current.wholePage ? 'בעמוד הזה יש רק תמונה. אם מוציאים אותה, העמוד כולו יוצא מהספר.' : 'אם מוציאים את התמונה, הברכה נשארת בספר בלי תמונה.')
                                : (current.wholePage ? 'העמוד הזה הוצא מהספר.' : 'התמונה הוצאה, הברכה עדיין בספר.')}
                        </p>
                        <div className='flex items-center gap-2 max-w-[520px] mx-auto'>
                            <button
                                onClick={() => step(-1)}
                                disabled={open === 0}
                                className='w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center bg-white/10 disabled:opacity-25'
                                aria-label='התמונה הקודמת'
                            >
                                <ChevronRight size={22} />
                            </button>
                            {tab === 'in' ? (
                                <button
                                    onClick={() => takeOut(current)}
                                    disabled={busy.has(current.id)}
                                    className='flex-1 h-12 rounded-2xl inline-flex items-center justify-center gap-2 text-[14.5px] font-bold bg-white text-[#b42318] disabled:opacity-60'
                                >
                                    {busy.has(current.id) ? <Loader2 size={16} className='animate-spin' /> : <ImageOff size={16} />}
                                    להוציא מהספר
                                </button>
                            ) : (
                                <button
                                    onClick={() => bringBack(current)}
                                    disabled={busy.has(current.id)}
                                    className='flex-1 h-12 rounded-2xl inline-flex items-center justify-center gap-2 text-[14.5px] font-bold text-white disabled:opacity-60'
                                    style={{ background: 'linear-gradient(180deg, #fff6e0 0%, #efd9ac 100%)', color: 'var(--wt-ink)' }}
                                >
                                    {busy.has(current.id) ? <Loader2 size={16} className='animate-spin' /> : <Undo2 size={16} />}
                                    להחזיר לספר
                                </button>
                            )}
                            <button
                                onClick={() => step(1)}
                                disabled={open === list.length - 1}
                                className='w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center bg-white/10 disabled:opacity-25'
                                aria-label='התמונה הבאה'
                            >
                                <ChevronLeft size={22} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Short confirmations, with the way back */}
            <div className='fixed inset-x-0 z-[70] pointer-events-none' style={current ? { top: 'max(64px, calc(env(safe-area-inset-top) + 64px))' } : { bottom: 'max(14px, env(safe-area-inset-bottom))' }}>
                <div className='max-w-[520px] mx-auto px-3'>
                    {toast && (
                        <div
                            className={`pointer-events-auto rounded-2xl px-4 py-3 shadow-lg border text-[13px] font-semibold flex items-center justify-between gap-3 ${
                                toast.kind === 'err' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-[#ead9b3] text-[#5b4a30]'
                            }`}
                            role='status'
                        >
                            <span className='inline-flex items-center gap-2'>
                                {toast.kind === 'ok' ? <Check size={15} className='text-emerald-600 shrink-0' /> : null}
                                {toast.text}
                            </span>
                            {toast.undo && (
                                <button
                                    onClick={() => { const item = toast.undo; setToast(null); bringBack(item) }}
                                    className='shrink-0 inline-flex items-center gap-1 px-3 h-9 rounded-lg bg-white border border-[#ead9b3] text-[#AA8840] font-bold text-[12.5px]'
                                >
                                    <Undo2 size={13} /> ביטול
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
