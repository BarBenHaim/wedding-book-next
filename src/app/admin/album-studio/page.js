'use client'

// /admin/album-studio — the photo album studio.
//
// The blessing book is a book of texts that happen to have pictures.
// This is the other product: a book of photographs, laid out by
// albumLayout.js, which never crops and never stretches anything.
//
// The screen is deliberately one screen. Choosing the event, gathering
// the photographs, picking a look and seeing the result are one task,
// and splitting them across steps would mean deciding on a preset
// before seeing a single spread in it.
//
// Photographs come from two places and are treated identically once
// they are in the list: the ones guests already uploaded with their
// blessings (free — they are already in the system) and a batch the
// photographer sends, uploaded here. The engine cares only about the
// aspect ratio, which is why "any resolution" is not a feature that had
// to be built: there is no fixed slot for a photo to fail to fill.

import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import AlbumPage from '@/components/AlbumPage/AlbumPage'
import { planAlbum, toSpreads } from '@/lib/albumLayout'
import { ALBUM_PRESETS, ALBUM_PRESET_ORDER, getAlbumPreset, albumGeometry } from '@/lib/albumPresets'
import { Lock, Images, Upload, Trash2, ArrowRight, ArrowLeft, Save, RefreshCw, Loader2, BookOpen } from 'lucide-react'

const UNIT = 1000

// Page shapes an album can be bound in. Square is the album default and
// the one Picabook prints best; the other two exist because a book of
// landscapes and a book of portraits want different pages, and forcing
// both into a square is how you end up with white bars.
const SHAPES = [
    { id: 'square', label: 'ריבוע', ratio: 1 },
    { id: 'landscape', label: 'רוחב', ratio: 0.75 },
    { id: 'portrait', label: 'גובה', ratio: 1.3 },
]

function shapeOf(id) {
    return SHAPES.find(s => s.id === id) || SHAPES[0]
}

export default function AlbumStudioPage() {
    return (
        <AdminPageWrapper>
            <Gate>
                <Studio />
            </Gate>
        </AdminPageWrapper>
    )
}

function Gate({ children }) {
    const [state, setState] = useState('checking')
    useEffect(() => onAuthStateChanged(auth, u => setState(u && isSuperAdmin(u.email) ? 'ok' : 'no')), [])
    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען…</div>
    if (state === 'no') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378]'>סטודיו האלבומים זמין רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

const token = () => auth.currentUser.getIdToken(false)

/** Measure a photo's aspect ratio in the browser when we were not told it. */
function measure(url) {
    return new Promise(resolve => {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null)
        img.onerror = () => resolve(null)
        img.src = url
    })
}

function Studio() {
    const [weddings, setWeddings] = useState([])
    const [sel, setSel] = useState('')
    const [photos, setPhotos] = useState([])
    const [preset, setPreset] = useState('magazine')
    const [shape, setShape] = useState('square')
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [toast, setToast] = useState(null)
    const fileRef = useRef(null)

    const flash = (m, type = 'ok') => { setToast({ m, type }); setTimeout(() => setToast(null), 3200) }

    useEffect(() => {
        ;(async () => {
            try {
                const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${await token()}` } })
                if (!res.ok) return
                const list = await res.json()
                setWeddings(Array.isArray(list) ? list : [])
                if (list[0]) pick(list[0], list)
            } catch { /* ignore */ }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function pick(w, list = weddings) {
        const row = typeof w === 'string' ? list.find(x => x.id === w) : w
        if (!row) return
        setSel(row.id)
        const saved = row.albumDesign
        if (saved && Array.isArray(saved.photos) && saved.photos.length) {
            setPhotos(saved.photos)
            setPreset(saved.preset || 'magazine')
            setShape(saved.shape || 'square')
        } else {
            setPhotos([])
            setPreset(saved?.preset || 'magazine')
            setShape(saved?.shape || 'square')
        }
    }

    /**
     * Pull in every photo the guests already uploaded.
     *
     * Entries carry `imgAspect` when they were measured at upload time;
     * older ones were not, so those are measured here. Nothing is
     * skipped for being small or oddly shaped — that is the whole
     * premise of the album.
     */
    async function loadGuestPhotos() {
        if (!sel) return
        setLoading(true)
        try {
            const snap = await getDocs(collection(db, 'weddings', sel, 'entries'))
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.imageUrl)
            const have = new Set(photos.map(p => p.url))
            const fresh = rows.filter(r => !have.has(r.imageUrl))
            const withAspect = await Promise.all(
                fresh.map(async r => ({
                    id: 'g_' + r.id,
                    url: r.imageUrl,
                    aspect: Number(r.imgAspect) > 0 ? Number(r.imgAspect) : await measure(r.imageUrl),
                    from: 'guest',
                    name: r.name || '',
                })),
            )
            setPhotos(prev => [...prev, ...withAspect])
            flash(withAspect.length ? `נוספו ${withAspect.length} תמונות של אורחים` : 'אין תמונות חדשות להוסיף')
        } catch (e) {
            flash('טעינת התמונות נכשלה: ' + (e?.message || ''), 'err')
        } finally {
            setLoading(false)
        }
    }

    async function onUpload(e) {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        if (!files.length || !sel) return
        setUploading(true)
        try {
            const added = []
            for (const file of files) {
                const safe = (file.name || 'photo').replace(/[^\w.\-]/g, '_')
                const r = storageRef(storage, `weddings/${sel}/album/${Date.now()}-${safe}`)
                await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' })
                const url = await getDownloadURL(r)
                added.push({ id: 'u_' + Math.random().toString(36).slice(2, 10), url, aspect: await measure(url), from: 'upload', name: '' })
            }
            setPhotos(prev => [...prev, ...added])
            flash(`הועלו ${added.length} תמונות`)
        } catch (e2) {
            flash('ההעלאה נכשלה: ' + (e2?.message || ''), 'err')
        } finally {
            setUploading(false)
        }
    }

    const move = (i, d) => setPhotos(prev => {
        const j = i + d
        if (j < 0 || j >= prev.length) return prev
        const next = prev.slice()
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
    })
    const remove = i => setPhotos(prev => prev.filter((_, k) => k !== i))

    const ratio = shapeOf(shape).ratio
    const pages = useMemo(
        () => planAlbum(photos, albumGeometry(preset, UNIT, UNIT * ratio)),
        [photos, preset, ratio],
    )
    const spreads = useMemo(() => toSpreads(pages), [pages])

    async function save() {
        if (!sel) return flash('בחרו אירוע', 'err')
        setBusy(true)
        try {
            const patch = {
                albumDesign: {
                    preset,
                    shape,
                    photos: photos.map(p => ({ id: p.id, url: p.url, aspect: p.aspect ?? null, from: p.from || 'guest' })),
                    pageCount: pages.length,
                    updatedAt: new Date().toISOString(),
                },
            }
            const res = await fetch('/api/admin/weddings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
                body: JSON.stringify({ weddingId: sel, patch }),
            })
            if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'שמירה נכשלה')
            setWeddings(prev => prev.map(w => (w.id === sel ? { ...w, ...patch } : w)))
            flash('האלבום נשמר ✓')
        } catch (e) {
            flash(e.message, 'err')
        } finally {
            setBusy(false)
        }
    }

    const previewW = 250
    const previewH = previewW * ratio

    return (
        <div dir='rtl' className='min-h-screen' style={{ background: '#f8f4ec' }}>
            <div className='max-w-[1500px] mx-auto px-4 py-8'>
                <div className='flex items-center justify-between gap-3 mb-6 flex-wrap'>
                    <div className='flex items-center gap-3'>
                        <div className='w-11 h-11 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                            <Images size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='text-xl font-bold text-[#1a1410]'>סטודיו אלבומים</h1>
                            <p className='text-xs text-[#a89378]'>ספר תמונות מעוצב — כל תמונה בצורה שלה, בלי חיתוך ובלי מתיחה.</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2'>
                        <a href='/admin/studio' className='text-sm font-bold text-[#7a6a52] bg-white border border-[#e7dcc6] rounded-xl px-3 py-2'>סטודיו הספר</a>
                        <button
                            onClick={save}
                            disabled={busy || !photos.length}
                            className='inline-flex items-center gap-1.5 text-sm font-bold text-white rounded-xl px-4 py-2 disabled:opacity-50'
                            style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}
                        >
                            {busy ? <Loader2 size={15} className='animate-spin' /> : <Save size={15} />} שמירה
                        </button>
                    </div>
                </div>

                <div className='grid lg:grid-cols-[380px_1fr] gap-6 items-start'>
                    {/* ── Controls ─────────────────────────────────── */}
                    <div className='space-y-4'>
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>אירוע</label>
                            <select
                                value={sel}
                                onChange={e => pick(e.target.value)}
                                className='w-full rounded-xl border border-[#e7dcc6] px-3 py-2.5 text-sm bg-white outline-none focus:border-[#AA8840]'
                            >
                                {weddings.map(w => {
                                    const name = w.brideName && w.groomName ? `${w.brideName} ו${w.groomName}` : (w.celebrantName || w.ownerEmail || w.id)
                                    return <option key={w.id} value={w.id}>{name}</option>
                                })}
                            </select>
                            <div className='flex gap-2 mt-3'>
                                <button
                                    onClick={loadGuestPhotos}
                                    disabled={loading || !sel}
                                    className='flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-50'
                                    style={{ background: 'rgba(184,137,61,0.10)', color: '#8a6d40', border: '1px solid rgba(212,184,103,0.45)' }}
                                >
                                    {loading ? <Loader2 size={13} className='animate-spin' /> : <RefreshCw size={13} />} תמונות האורחים
                                </button>
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading || !sel}
                                    className='flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold disabled:opacity-50'
                                    style={{ background: 'rgba(184,137,61,0.10)', color: '#8a6d40', border: '1px solid rgba(212,184,103,0.45)' }}
                                >
                                    {uploading ? <Loader2 size={13} className='animate-spin' /> : <Upload size={13} />} העלאת תמונות
                                </button>
                            </div>
                            <input ref={fileRef} type='file' accept='image/*' multiple className='hidden' onChange={onUpload} />
                            <p className='text-[10.5px] text-[#a89378] mt-2 leading-relaxed'>
                                כל רזולוציה וכל יחס — הפריסה נבנית סביב הצורה של כל תמונה, ולכן אין משבצת שתמונה יכולה לא להתאים לה.
                            </p>
                        </div>

                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2.5'>סגנון</label>
                            <div className='space-y-2'>
                                {ALBUM_PRESET_ORDER.map(id => {
                                    const p = ALBUM_PRESETS[id]
                                    const active = preset === id
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => setPreset(id)}
                                            className='w-full text-right rounded-xl border p-2.5 transition-colors'
                                            style={{ borderColor: active ? '#AA8840' : '#e7dcc6', background: active ? '#AA88400d' : '#fff' }}
                                        >
                                            <div className='flex items-center gap-2 mb-1'>
                                                <span className='flex rounded-md overflow-hidden border border-[#e7dcc6]' style={{ width: 34, height: 16 }}>
                                                    {p.swatch.map(c => <span key={c} style={{ background: c, flex: 1 }} />)}
                                                </span>
                                                <span className='text-[12px] font-bold text-[#5a4a32]'>{p.label}</span>
                                            </div>
                                            <p className='text-[10.5px] text-[#a89378] leading-relaxed'>{p.hint}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>צורת העמוד</label>
                            <div className='flex gap-1 rounded-lg p-1' style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}>
                                {SHAPES.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setShape(s.id)}
                                        className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-bold transition-all ${shape === s.id ? 'text-white shadow-sm' : 'text-[#7a6a52] hover:bg-white'}`}
                                        style={shape === s.id ? { background: 'linear-gradient(180deg,#d3b46a,#b8893d)' } : undefined}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <p className='text-[10.5px] text-[#a89378] mt-2 leading-relaxed'>
                                {pages.length} עמודים · {spreads.length} כפולות · {photos.length} תמונות
                            </p>
                        </div>

                        {photos.length > 0 && (
                            <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                                <label className='block text-xs font-bold text-[#7a6a52] mb-2'>סדר התמונות</label>
                                <p className='text-[10.5px] text-[#a89378] mb-2.5 leading-relaxed'>
                                    הסדר הוא סדר הסיפור — הפריסה שומרת עליו ולא מסדרת מחדש כדי לייפות שורה.
                                </p>
                                <div className='grid grid-cols-4 gap-1.5 max-h-[340px] overflow-y-auto'>
                                    {photos.map((p, i) => (
                                        <div key={p.id} className='relative group rounded-lg overflow-hidden' style={{ aspectRatio: '1 / 1', background: '#f0ece4' }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={p.url} alt='' className='w-full h-full object-cover' />
                                            <div className='absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-0.5'>
                                                <button onClick={() => move(i, -1)} className='text-white p-1' title='אחורה'><ArrowRight size={13} /></button>
                                                <button onClick={() => remove(i)} className='text-red-300 p-1' title='הסרה'><Trash2 size={13} /></button>
                                                <button onClick={() => move(i, 1)} className='text-white p-1' title='קדימה'><ArrowLeft size={13} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── The album ────────────────────────────────── */}
                    <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                        <div className='flex items-center gap-2 mb-3'>
                            <BookOpen size={14} style={{ color: '#c9a44e' }} />
                            <span className='text-xs font-bold text-[#7a6a52]'>תצוגת כפולות</span>
                        </div>
                        {!photos.length ? (
                            <div className='py-24 text-center'>
                                <p className='text-sm text-[#a89378] mb-1'>עוד אין תמונות באלבום.</p>
                                <p className='text-[12px] text-[#c0ad8e]'>הביאו את תמונות האורחים, או העלו אצווה מהצלם.</p>
                            </div>
                        ) : (
                            <div className='space-y-4 max-h-[76vh] overflow-y-auto pl-1'>
                                {spreads.map((sp, i) => (
                                    <div key={i} className='flex gap-[2px] mx-auto w-fit' style={{ boxShadow: '0 3px 18px rgba(60,45,20,0.16)' }}>
                                        {[sp.left, sp.right].map((pg, k) => (
                                            <div key={k} style={{ width: previewW, height: previewH, background: getAlbumPreset(preset).pageBg }}>
                                                {pg && (
                                                    <AlbumPage
                                                        page={pg}
                                                        presetId={preset}
                                                        width={previewW}
                                                        height={previewH}
                                                        unit={UNIT}
                                                        pageNumber={pg.index + 1}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {toast && (
                <div
                    className='fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-[13px] font-bold shadow-lg z-50'
                    style={{
                        background: toast.type === 'err' ? '#b3402e' : 'linear-gradient(180deg,#d3b46a,#b8893d)',
                        color: '#fff',
                    }}
                >
                    {toast.m}
                </div>
            )}
        </div>
    )
}
