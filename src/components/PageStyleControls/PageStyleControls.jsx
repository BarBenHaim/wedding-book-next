'use client'

// Per-page design overrides, edited on the page itself.
//
// You click a page in the book, the rail becomes that page's controls,
// and every slider moves the real page behind you as you drag it. There
// is no thumbnail, no picker and no preview tile, because the book IS
// the preview — anything less means designing against an approximation
// and finding out at the printer.
//
// ── Live means local first ──────────────────────────────────────────
//
// A slider that waits for a round trip per tick feels broken, and at
// twenty ticks a second it would also be twenty writes. So the draft
// lives here, is applied to the book the instant it changes, and is
// written to Firestore on a debounce. The screen is never waiting on the
// network; the network is catching up with the screen.
//
// ── Inherit is the default and stays visible ────────────────────────
//
// Every control starts INHERITED and shows the book's current value. The
// moment you move it, it pins — and says so, with a way back. That
// distinction is the whole feature: a pinned key stops following the
// book forever, so an operator who pins nine sliders while exploring has
// quietly broken this page's relationship with every future preset
// change. Pins are deliberate, visible and individually reversible.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth, storage } from '@/lib/firebaseClient'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import imageCompression from 'browser-image-compression'
import { PHOTO_FRAMES } from '@/lib/photoFrames'
import { TEXTURES_REGISTRY } from '@/lib/studioPresets'
import { buildPageIndex, pageLabel } from '@/lib/bookPageIndex'
import { sanitizePageStyle, overriddenKeys, mergePageStyle } from '@/lib/pageStyle'
import { getBlessingText } from '@/lib/normalizeText'
import { pageFitFactor, effectiveFontPercent, nameFontPercent, DEFAULT_MIN_FACTOR } from '@/lib/fontFit'
import { applyPresetClean } from '@/lib/bookDesignSchema'

const GOLD = '#AA8840'
const SAVE_DEBOUNCE_MS = 450

function Row({ label, pinned, onUnpin, children, hint }) {
    return (
        <div className='mb-3'>
            <div className='flex items-center justify-between gap-2 mb-1'>
                <span className='text-[11.5px] font-bold text-gray-600 flex items-center gap-1.5'>
                    {label}
                    {pinned && (
                        <span className='text-[9px] px-1 py-px rounded' style={{ background: '#f5efe3', color: GOLD }}>
                            נעול
                        </span>
                    )}
                </span>
                {pinned && (
                    <button onClick={onUnpin} className='text-[10.5px] font-bold text-gray-400 hover:text-gray-600'>
                        חזרה לספר
                    </button>
                )}
            </div>
            {children}
            {hint && <p className='text-[10px] text-gray-400 mt-1'>{hint}</p>}
        </div>
    )
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }) {
    return (
        <div className='flex items-center gap-2'>
            <input
                type='range' min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                className='flex-1 accent-[#AA8840]'
            />
            <span className='text-[11px] font-bold text-gray-500 w-12 text-left tabular-nums' dir='ltr'>
                {value}{suffix}
            </span>
        </div>
    )
}

function Choice({ options, value, onChange }) {
    return (
        <div className='flex flex-wrap gap-1.5'>
            {options.map(o => (
                <button
                    key={String(o.value)}
                    onClick={() => onChange(o.value)}
                    className='px-2 py-1 rounded-lg text-[11px] font-bold transition-all'
                    style={value === o.value
                        ? { background: GOLD, color: '#fff' }
                        : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

export default function PageStyleControls({
    entries = [],
    styleSettings,
    weddingId,
    selectedId,
    onSelect,
    onEntriesChange,
    onEntryPatch,
}) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [draft, setDraft] = useState({})
    const [photoBusy, setPhotoBusy] = useState(false)
    const photoInput = useRef(null)
    const timer = useRef(null)
    // What is waiting on the debounce, and which page it belongs to.
    const pending = useRef(null)
    const flushRef = useRef(null)
    const alive = useRef(true)

    useEffect(() => {
        alive.current = true
        return () => { alive.current = false }
    }, [])

    const selected = useMemo(() => entries.find(e => e.id === selectedId) || null, [entries, selectedId])

    const pageIndex = useMemo(
        () => buildPageIndex(entries, applyPresetClean(styleSettings || {})),
        [entries, styleSettings],
    )

    // Reseed only when the SELECTION changes. Reseeding on every entries
    // change would fight the user: the optimistic update writes back into
    // entries, which would reset the draft mid-drag.
    useEffect(() => {
        // Whatever the page we are LEAVING still had on the debounce
        // goes out now, before the draft is replaced under it.
        flushRef.current?.()
        setDraft(sanitizePageStyle(entries.find(e => e.id === selectedId)?.pageStyle))
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId])

    const pinned = useMemo(() => new Set(overriddenKeys(draft)), [draft])

    // The values the controls display: the book's design with this page's
    // pins on top. An inherited slider therefore shows the book's number
    // rather than a zero that would lie about what is on the page.
    const effective = useMemo(
        () => mergePageStyle(applyPresetClean(styleSettings || {}), draft),
        [styleSettings, draft],
    )

    // Replace, not merge: the browser holds the whole override, so an
    // unpin is simply a draft with one fewer key. Merging server-side
    // would make removal impossible to express.
    // The entry id travels WITH the payload instead of being read from
    // state at send time. A write still on the debounce when the
    // operator clicks another page has to land on the page they edited,
    // not on the one they are now looking at.
    const flush = useCallback(async (next, entryId) => {
        if (!entryId) return
        setSaving(true)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/page-style', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId, pageStyle: next, replace: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`)
            if (alive.current) setError(null)
        } catch (err) {
            // The page still looks right — the change is in local state —
            // so say so plainly rather than reverting under their hands.
            if (alive.current) setError(`${err?.message || 'שגיאה'} · השינוי לא נשמר`)
        } finally {
            if (alive.current) setSaving(false)
        }
    }, [weddingId])

    const send = useCallback(() => {
        const p = pending.current
        pending.current = null
        if (p) flush(p.style, p.entryId)
    }, [flush])

    /**
     * Push whatever is waiting on the debounce, immediately.
     *
     * 450ms is invisible while a slider is being dragged and fatal the
     * moment it stops. Click a control, hit סיום, refresh — and the
     * write had never left the browser. Worse, the old unmount cleanup
     * CANCELLED the pending timer, so closing the rail actively threw
     * the last change away. Every exit from a page now goes through
     * here: סיום, switching pages, and unmount.
     */
    const flushNow = useCallback(() => {
        clearTimeout(timer.current)
        send()
    }, [send])
    flushRef.current = flushNow

    const apply = useCallback(next => {
        setDraft(next)
        onEntriesChange?.(selectedId, next) // the book redraws now
        pending.current = { entryId: selectedId, style: next }
        clearTimeout(timer.current)
        timer.current = setTimeout(send, SAVE_DEBOUNCE_MS)
    }, [selectedId, onEntriesChange, send])

    // The exit nobody clicks.
    useEffect(() => () => flushRef.current?.(), [])

    const set = (key, value) => apply({ ...draft, [key]: value })
    const setImage = (key, value) => apply({ ...draft, imageStyle: { ...(draft.imageStyle || {}), [key]: value } })
    const unpin = key => {
        const next = { ...draft }
        delete next[key]
        apply(next)
    }
    const resetAll = () => apply({})

    // ── Replacing the photo ──────────────────────────────────────────
    //
    // The file goes browser → Storage directly and only the URL reaches
    // the API, which keeps a multi-megabyte photo out of a serverless
    // request body. Measured before upload so the book can letterbox it
    // correctly on the first paint rather than after a round trip.
    const replacePhoto = useCallback(async file => {
        if (!file || !selected) return
        setPhotoBusy(true)
        setError(null)
        try {
            const compressed = await imageCompression(file, {
                maxSizeMB: 4,
                maxWidthOrHeight: 3000,
                useWebWorker: true,
            })
            const aspect = await new Promise(resolve => {
                const img = new Image()
                const url = URL.createObjectURL(compressed)
                img.onload = () => { resolve(img.naturalWidth / img.naturalHeight); URL.revokeObjectURL(url) }
                img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
                img.src = url
            })

            const path = `weddings/${weddingId}/replace_${selected.id}_${Date.now()}.jpg`
            const snap = await uploadBytes(storageRef(storage, path), compressed, { contentType: compressed.type || 'image/jpeg' })
            const url = await getDownloadURL(snap.ref)

            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/photo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId: selected.id, imageUrl: url, imgAspect: aspect }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || `HTTP ${res.status}`)

            // Mirror what resolveEntryPhoto does on the next load, so the
            // page redraws now instead of after a refresh.
            onEntryPatch?.(selected.id, {
                imageUrlOverride: url,
                imgAspectOverride: data.imgAspectOverride,
                imageUrl: url,
                imgAspect: data.imgAspectOverride ?? null,
                originalImageUrl: selected.originalImageUrl || selected.imageUrl || null,
            })
        } catch (err) {
            setError(err?.message || 'החלפת התמונה נכשלה')
        } finally {
            setPhotoBusy(false)
            if (photoInput.current) photoInput.current.value = ''
        }
    }, [selected, weddingId, onEntryPatch])

    const restorePhoto = useCallback(async () => {
        if (!selected) return
        setPhotoBusy(true)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/entries/photo', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, entryId: selected.id, reset: true }),
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok) throw new Error(data?.error || 'שחזור נכשל')
            onEntryPatch?.(selected.id, {
                imageUrlOverride: null,
                imgAspectOverride: null,
                imageUrl: selected.originalImageUrl || null,
                imgAspect: null,
                originalImageUrl: null,
            })
        } catch (err) {
            setError(err?.message || 'שחזור נכשל')
        } finally {
            setPhotoBusy(false)
        }
    }, [selected, weddingId, onEntryPatch])

    // ── What the font slider will really do ─────────────────────────
    //
    // A long blessing is shrunk to fit by the template, and the shrink
    // multiplies whatever the slider says. Without this readout the
    // control lies: drag a long page to 5% and the book renders 3.1%,
    // the slider still reads 5, and nothing on screen explains why the
    // text did not move. The book's own formula, imported, not copied.
    const fontFit = useMemo(() => {
        if (!selected) return { factor: 1, shown: 0, longText: false }
        const of = {
            textLength: String(getBlessingText(selected) || '').length,
            hasImage: Boolean(selected.imageUrl),
        }
        const factor = pageFitFactor({ ...of, styleSettings: effective })
        // Whether the blessing is long enough for the fit logic to
        // engage AT ALL — asked with the floor removed. Keying the
        // switch's visibility on the shrink actually happening would
        // make the switch delete itself on the first click, since
        // turning the shrink off is precisely what it does.
        const longText = pageFitFactor({ ...of, styleSettings: { ...effective, fontMinFactor: 0 } }) < 0.995
        return { factor, shown: effectiveFontPercent(effective, factor), longText }
    }, [selected, effective])

    // ── Is there a name on this page at all? ────────────────────────
    //
    // The template renders the name block when there IS a name, and
    // also when there is a photo but no name — an invisible ghost that
    // holds the exact line and margins so the photo lands at the same
    // height as on a signed page. On a page with neither, the block is
    // not rendered and these controls change nothing at all.
    //
    // Worth saying out loud rather than letting four sliders sit there
    // looking operational.
    const nameState = useMemo(() => {
        const hasName = Boolean(selected?.name)
        const hasImage = Boolean(selected?.imageUrl)
        if (hasName) return { hint: undefined }
        if (hasImage) return { hint: 'אין שם בברכה הזאת — הפקדים שומרים על המקום שלו כדי שהתמונה תישאר באותו גובה' }
        return { hint: 'אין שם ואין תמונה בברכה הזאת — הפקדים לא ישנו כלום בעמוד' }
    }, [selected])

    // The name has no size of its own until it is pinned: it follows the
    // blessing at 70%. Showing the derived number rather than a constant
    // means the slider still reads true after the font-size slider above
    // it has been moved. Rounded because 3 × 0.7 is 2.0999999999999996.
    const nameSizeValue = Math.round(nameFontPercent(effective) * 10) / 10

    // WHICH pages are pinned, not just how many. A page that quietly
    // stops following the book design is the expensive kind of
    // surprise: the rendering path is identical everywhere, so there is
    // nothing to debug and nothing to see — you just open pages until
    // you find it. The count alone was the wrong half of the answer.
    const pinnedList = useMemo(
        () =>
            entries
                .filter(e => overriddenKeys(e.pageStyle).length > 0)
                .map(e => ({
                    id: e.id,
                    label: pageLabel(pageIndex.byEntry[e.id]) || '—',
                    name: e.name || '',
                    count: overriddenKeys(e.pageStyle).length,
                })),
        [entries, pageIndex],
    )

    // Closed state: a one-line invitation rather than a panel taking a
    // third of the rail for a mode nobody is in yet.
    if (!selected) {
        return (
            <div className='shrink-0 border-t border-[#f0e6d2] bg-white/90 px-4 py-2.5'>
                <p className='text-[11.5px] text-gray-500 leading-relaxed'>
                    לחץ על עמוד בספר כדי לערוך רק אותו.
                </p>
                {pinnedList.length > 0 && (
                    <div className='mt-1.5'>
                        <p className='text-[10.5px] font-bold' style={{ color: GOLD }}>
                            {pinnedList.length} עמודים לא עוקבים אחרי עיצוב הספר:
                        </p>
                        <div className='flex flex-wrap gap-1 mt-1'>
                            {pinnedList.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => onSelect?.(p.id)}
                                    title={`${p.count} הגדרות נעולות · לחץ לפתיחה`}
                                    className='px-1.5 py-0.5 rounded text-[10.5px] font-bold max-w-[150px] truncate'
                                    style={{ background: '#f5efe3', color: GOLD, border: '1px solid #ead9b3' }}
                                >
                                    <span dir='ltr' className='tabular-nums'>{p.label}</span>
                                    {p.name ? ` · ${p.name}` : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className='shrink-0 border-t border-[#f0e6d2] bg-white/95'>
            <div className='flex items-center justify-between gap-2 px-4 py-2'>
                <div className='min-w-0'>
                    <p className='text-[12.5px] font-extrabold text-[#3d2e1a] truncate'>
                        עמוד <span dir='ltr' className='tabular-nums'>{pageLabel(pageIndex.byEntry[selected.id]) || '—'}</span>
                        {selected.name ? ` · ${selected.name}` : ''}
                    </p>
                    <p className='text-[10px] text-gray-400'>
                        {pinned.size ? `${pinned.size} שינויים לעמוד הזה` : 'יורש הכל מעיצוב הספר'}
                        {saving ? ' · שומר…' : ''}
                    </p>
                </div>
                <div className='flex items-center gap-2 shrink-0'>
                    {pinned.size > 0 && (
                        <button onClick={resetAll} className='text-[10.5px] font-bold text-red-500 hover:text-red-600'>
                            אפס
                        </button>
                    )}
                    <button onClick={() => { flushNow(); onSelect?.(null) }} className='text-[11px] font-bold text-gray-400 hover:text-gray-600'>
                        סיום
                    </button>
                </div>
            </div>

            {error && (
                <div className='mx-4 mb-2 px-2 py-1.5 rounded text-[11px]' style={{ background: '#fff5f5', color: '#b32424' }}>
                    {error}
                </div>
            )}

            <div className='px-4 pb-3 max-h-[46vh] overflow-y-auto'>
                <Row
                    label='גודל שם האורח'
                    pinned={pinned.has('nameFontSizePercent')}
                    onUnpin={() => unpin('nameFontSizePercent')}
                    hint={nameState.hint || (pinned.has('nameFontSizePercent') ? undefined : 'עוקב אחרי גודל הברכה (70%) עד שנוגעים בו')}
                >
                    <Slider
                        value={nameSizeValue}
                        min={1} max={5} step={0.1}
                        onChange={v => set('nameFontSizePercent', v)}
                        suffix='%'
                    />
                </Row>

                <Row label='יישור שם האורח' pinned={pinned.has('nameAlign')} onUnpin={() => unpin('nameAlign')}>
                    <Choice
                        value={effective.nameAlign ?? 'center'}
                        onChange={v => set('nameAlign', v)}
                        options={[
                            { value: 'right', label: 'ימין' },
                            { value: 'center', label: 'מרכז' },
                            { value: 'left', label: 'שמאל' },
                            { value: 'auto', label: 'לפי השפה' },
                        ]}
                    />
                </Row>

                <Row label='ריווח השם מלמעלה' pinned={pinned.has('nameMarginTop')} onUnpin={() => unpin('nameMarginTop')}>
                    <Slider value={effective.nameMarginTop ?? 1} min={0} max={20} onChange={v => set('nameMarginTop', v)} suffix='%' />
                </Row>

                <Row label='ריווח השם מלמטה' pinned={pinned.has('nameMarginBottom')} onUnpin={() => unpin('nameMarginBottom')}>
                    <Slider value={effective.nameMarginBottom ?? 1} min={0} max={20} onChange={v => set('nameMarginBottom', v)} suffix='%' />
                </Row>

                <Row label='ריווח תמונה מלמעלה' pinned={pinned.has('imageMarginTop')} onUnpin={() => unpin('imageMarginTop')}>
                    <Slider value={effective.imageMarginTop ?? 2} min={0} max={25} onChange={v => set('imageMarginTop', v)} suffix='%' />
                </Row>

                <Row label='ריווח תמונה מלמטה' pinned={pinned.has('imageMarginBottom')} onUnpin={() => unpin('imageMarginBottom')}>
                    <Slider value={effective.imageMarginBottom ?? 2} min={0} max={25} onChange={v => set('imageMarginBottom', v)} suffix='%' />
                </Row>

                <Row label='גודל התמונה' pinned={pinned.has('imageStyle')} onUnpin={() => unpin('imageStyle')}>
                    <Slider value={effective.imageStyle?.width ?? 80} min={30} max={100} onChange={v => setImage('width', v)} suffix='%' />
                </Row>

                <Row
                    label='התמונה בעמוד'
                    pinned={!!selected.originalImageUrl}
                    onUnpin={restorePhoto}
                    hint='התמונה של האורח נשמרת תמיד — ״חזרה לספר״ מחזיר אותה'
                >
                    <div className='flex items-center gap-2'>
                        {selected.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={selected.imageUrl}
                                alt=''
                                className='w-12 h-12 rounded-lg object-cover shrink-0'
                                style={{ border: '1px solid #ead9b3' }}
                            />
                        ) : (
                            <div className='w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-[9px] text-gray-400'
                                style={{ background: '#f5efe3', border: '1px solid #ead9b3' }}>
                                בלי
                            </div>
                        )}
                        <input
                            ref={photoInput}
                            type='file'
                            accept='image/*'
                            disabled={photoBusy}
                            onChange={e => replacePhoto(e.target.files?.[0])}
                            className='text-[11px] text-[#7a6a52] flex-1 min-w-0'
                        />
                    </div>
                    {photoBusy && <p className='text-[10px] text-gray-400 mt-1'>מעלה…</p>}
                </Row>

                <Row
                    label='חיתוך התמונה'
                    pinned={pinned.has('photoFit')}
                    onUnpin={() => unpin('photoFit')}
                    hint='״ללא חיתוך״ מראה את התמונה השלמה, גם אם הספר כולו חותך'
                >
                    <Choice
                        value={effective.photoFit ?? 'cover'}
                        onChange={v => set('photoFit', v)}
                        options={[{ value: 'cover', label: 'מילוי (4:3)' }, { value: 'contain', label: 'ללא חיתוך' }]}
                    />
                </Row>

                <Row label='יישור התמונה' pinned={pinned.has('imageAlign')} onUnpin={() => unpin('imageAlign')}>
                    <Choice
                        value={effective.imageAlign ?? 'center'}
                        onChange={v => set('imageAlign', v)}
                        options={[{ value: 'right', label: 'ימין' }, { value: 'center', label: 'מרכז' }, { value: 'left', label: 'שמאל' }]}
                    />
                </Row>

                <Row label='מסגרת לתמונה' pinned={pinned.has('photoFrame')} onUnpin={() => unpin('photoFrame')}>
                    <Choice
                        value={effective.photoFrame ?? null}
                        onChange={v => set('photoFrame', v)}
                        options={[{ value: null, label: 'בלי' }, ...PHOTO_FRAMES.map(f => ({ value: f.id, label: f.label }))]}
                    />
                </Row>

                <Row label='ריווח הברכה מלמעלה' pinned={pinned.has('textMarginTop')} onUnpin={() => unpin('textMarginTop')}>
                    <Slider value={effective.textMarginTop ?? 0} min={0} max={20} onChange={v => set('textMarginTop', v)} suffix='%' />
                </Row>

                <Row
                    label='גודל הפונט של הברכה'
                    pinned={pinned.has('fontSizePercent')}
                    onUnpin={() => unpin('fontSizePercent')}
                    hint={fontFit.factor < 0.995
                        ? `הברכה ארוכה, אז הספר מקטין אותה בפועל ל־${fontFit.shown.toFixed(1)}%`
                        : undefined}
                >
                    <Slider
                        value={effective.fontSizePercent ?? 3}
                        min={1.5} max={6} step={0.1}
                        onChange={v => set('fontSizePercent', v)}
                        suffix='%'
                    />
                </Row>

                {/* Only for blessings long enough that the fit logic
                    engages. A switch for something that cannot happen is
                    noise, and this one can push text off the page — it
                    should appear exactly where it is the answer to a
                    visible problem, and nowhere else. */}
                {fontFit.longText && (
                    <Row
                        label='הקטנה אוטומטית לטקסט ארוך'
                        pinned={pinned.has('fontMinFactor')}
                        onUnpin={() => unpin('fontMinFactor')}
                        hint={fontFit.factor < 0.995
                            ? `כרגע מוקטן ל־${fontFit.shown.toFixed(1)}% · ״להשאיר בגודל״ מכבד את הסליידר במדויק, ובטקסט ארוך מאוד זה עלול לחרוג מהעמוד`
                            : '״להשאיר בגודל״ מכבד את הסליידר במדויק — בטקסט ארוך מאוד זה עלול לחרוג מהעמוד'}
                    >
                        {/* BOTH sides pin. Wiring 'shrink' to unpin looked
                            elegant — the same state the page inherits —
                            but it means the click stores nothing, and on
                            a book whose global design says "do not
                            shrink" it does nothing at all and survives no
                            refresh. Every other control here pins on
                            change and unpins through ״חזרה לספר״; this
                            one had no business being different. */}
                        <Choice
                            value={effective.fontMinFactor >= 1 ? 'off' : 'on'}
                            onChange={v => set('fontMinFactor', v === 'off' ? 1 : DEFAULT_MIN_FACTOR)}
                            options={[
                                { value: 'on', label: 'להקטין כדי להיכנס' },
                                { value: 'off', label: 'להשאיר בגודל' },
                            ]}
                        />
                    </Row>
                )}

                <Row
                    label='רוחב מקסימלי לברכה'
                    pinned={pinned.has('textMaxWidth')}
                    onUnpin={() => unpin('textMaxWidth')}
                    hint='צר יותר = שורות קצרות וקריאות; רחב יותר = פחות שורות'
                >
                    <Slider
                        value={effective.textMaxWidth ?? 85}
                        min={40} max={100}
                        onChange={v => set('textMaxWidth', v)}
                        suffix='%'
                    />
                </Row>

                <Row label='ריפוד העמוד' pinned={pinned.has('pagePadding')} onUnpin={() => unpin('pagePadding')}>
                    <Slider value={effective.pagePadding ?? 4} min={0} max={20} onChange={v => set('pagePadding', v)} suffix='%' />
                </Row>

                <Row label='צבע רקע העמוד' pinned={pinned.has('backgroundColor')} onUnpin={() => unpin('backgroundColor')}>
                    <div className='flex items-center gap-2'>
                        <input
                            type='color'
                            value={effective.backgroundColor || '#ffffff'}
                            onChange={e => set('backgroundColor', e.target.value)}
                            className='w-9 h-8 rounded cursor-pointer border border-[#ead9b3]'
                        />
                        <span className='text-[11px] text-gray-500 tabular-nums' dir='ltr'>{effective.backgroundColor || '#ffffff'}</span>
                    </div>
                </Row>

                <Row
                    label='מרקם רקע'
                    pinned={pinned.has('backgroundUrl')}
                    onUnpin={() => unpin('backgroundUrl')}
                    hint='״בלי״ מסיר את הרקע רק בעמוד הזה, גם אם לספר יש מרקם'
                >
                    <div className='flex flex-wrap gap-1.5'>
                        <button
                            onClick={() => set('backgroundUrl', null)}
                            className='px-2 py-1 rounded-lg text-[11px] font-bold'
                            style={pinned.has('backgroundUrl') && effective.backgroundUrl === null
                                ? { background: GOLD, color: '#fff' }
                                : { background: '#fff', color: '#7a6a52', border: '1px solid #ead9b3' }}
                        >
                            בלי
                        </button>
                        {TEXTURES_REGISTRY.map(t => (
                            <button
                                key={t.id}
                                onClick={() => set('backgroundUrl', t.src)}
                                title={t.label}
                                className='w-8 h-8 rounded-lg bg-cover bg-center'
                                style={{
                                    backgroundImage: `url(${t.src})`,
                                    outline: effective.backgroundUrl === t.src ? `2px solid ${GOLD}` : '1px solid #ead9b3',
                                }}
                            />
                        ))}
                    </div>
                </Row>
            </div>
        </div>
    )
}
