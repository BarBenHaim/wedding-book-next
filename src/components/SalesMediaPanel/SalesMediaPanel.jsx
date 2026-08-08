'use client'

// The bot's media library, and the scoreboard that says which of it
// works.
//
// Two jobs on one screen, and they belong together: the reason to upload
// a fourth video is that you can see the first three's numbers. Split
// across two screens, nobody looks at the numbers.
//
// ── Uploading ───────────────────────────────────────────────────────
//
// Files go browser → Firebase Storage directly, and only the resulting
// URL is posted to the API. A 16MB video through a Vercel function hits
// the 4.5MB body limit and fails as an opaque 413 after the whole upload
// has already been waited for. Storage takes it with a progress bar.
//
// The form asks for one thing that is not obvious: WHEN to send it. That
// field is the only part of the record the model reads as an instruction,
// so an empty one produces an asset that either never goes out or goes
// out to the wrong person. It is required, and the placeholder is a real
// example rather than "description".
//
// ── Numbers ─────────────────────────────────────────────────────────
//
// Below MIN_SENDS_FOR_RATE this shows the raw count and refuses to show
// a percentage. A 100% reply rate on two sends is the most misleading
// number a panel like this can print, and the decision it produces —
// deleting something that was actually working — is not recoverable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth, storage } from '@/lib/firebaseClient'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { Loader2, Upload, Trash2, Film, ImageIcon, RefreshCw, AlertTriangle, Info } from 'lucide-react'
import { validateUpload, KIND_HE } from '@/lib/salesAgent/mediaLibrary'

const CARD = { background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }
const GOLD = 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)'

const kindOf = type => (String(type || '').startsWith('video/') ? 'video' : 'image')
const pct = n => `${Math.round((n || 0) * 100)}%`
const mb = bytes => `${(Number(bytes || 0) / (1024 * 1024)).toFixed(1)}MB`

async function authedFetch(path, init = {}) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(path, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
}

function Stat({ label, value, muted }) {
    return (
        <div className='text-center'>
            <div className={`text-[15px] font-bold ${muted ? 'text-[#c9bda8]' : 'text-[#1a1410]'}`}>{value}</div>
            <div className='text-[10px] text-[#a89378] mt-0.5'>{label}</div>
        </div>
    )
}

function MediaRow({ item, minSends, onDelete, busy }) {
    const s = item.stats
    const proven = s?.enough
    const isVideo = item.kind === 'video'

    return (
        <div className='flex items-start gap-3 p-3 rounded-xl' style={{ background: '#fdfbf7', border: '1px solid #f0e6d2' }}>
            <div className='w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center shrink-0' style={{ background: '#f5efe3' }}>
                {isVideo
                    ? <Film size={20} style={{ color: '#c9a44e' }} />
                    /* eslint-disable-next-line @next/next/no-img-element */
                    : <img src={item.url} alt='' className='w-full h-full object-cover' />}
            </div>

            <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-bold text-[13px] text-[#1a1410]' dir='ltr'>{item.key}</span>
                    <span className='text-[10px] px-1.5 py-0.5 rounded' style={{ background: isVideo ? '#eef2fd' : '#f5efe3', color: isVideo ? '#4a5fb8' : '#8a7550' }}>
                        {KIND_HE[item.kind]}
                    </span>
                    {item.source === 'catalog' && (
                        <span className='text-[10px] px-1.5 py-0.5 rounded text-[#a89378]' style={{ background: '#f5f1e8' }}>מובנה</span>
                    )}
                </div>
                <p className='text-[11.5px] text-[#7a6a52] mt-1 line-clamp-2'>{item.when || item.caption || '—'}</p>
            </div>

            <div className='flex items-center gap-4 shrink-0 pt-1'>
                {item.source === 'catalog' ? (
                    <span className='text-[10.5px] text-[#c9bda8] max-w-[110px] text-center leading-tight'>
                        לא נמדד — קיים מלפני המדידה
                    </span>
                ) : (
                    <>
                        <Stat label='נשלח' value={s?.sent || 0} />
                        <Stat label='ענו' value={proven ? pct(s.replyRate) : '—'} muted={!proven} />
                        <Stat label='נסגר' value={proven ? pct(s.winRate) : '—'} muted={!proven} />
                        {!proven && (
                            <span className='text-[10px] text-[#c9bda8] max-w-[90px] leading-tight text-center'>
                                צריך {minSends} שליחות למספר אמין
                            </span>
                        )}
                    </>
                )}
                {item.source === 'upload' && (
                    <button
                        onClick={() => onDelete(item.key)}
                        disabled={busy === item.key}
                        title='מחק'
                        className='p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40'
                    >
                        {busy === item.key ? <Loader2 size={14} className='animate-spin' /> : <Trash2 size={14} />}
                    </button>
                )}
            </div>
        </div>
    )
}

export default function SalesMediaPanel() {
    const [items, setItems] = useState([])
    const [minSends, setMinSends] = useState(8)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [busy, setBusy] = useState(null)

    const [file, setFile] = useState(null)
    const [when, setWhen] = useState('')
    const [label, setLabel] = useState('')
    const [progress, setProgress] = useState(null)
    const fileInput = useRef(null)

    const load = useCallback(async () => {
        setLoading(true)
        const data = await authedFetch('/api/sales-agent/media')
        if (data?.ok) {
            setItems(data.items || [])
            setMinSends(data.minSendsForRate || 8)
            setError(null)
        } else {
            setError(data?.error || 'לא הצלחתי לטעון את הספרייה')
        }
        setLoading(false)
    }, [])

    useEffect(() => { load() }, [load])

    // Checked the moment a file is chosen rather than on submit, so the
    // "too big for WhatsApp" answer arrives before the description is
    // written rather than after.
    const pick = e => {
        const f = e.target.files?.[0]
        setError(null)
        if (!f) return setFile(null)
        const check = validateUpload({ kind: kindOf(f.type), type: f.type, size: f.size })
        if (!check.ok) {
            setFile(null)
            setError(check.reason)
            if (fileInput.current) fileInput.current.value = ''
            return
        }
        setFile(f)
        if (!label) setLabel(f.name.replace(/\.[^.]+$/, ''))
    }

    const upload = async () => {
        if (!file || when.trim().length < 5) return
        setBusy('upload')
        setError(null)
        try {
            const kind = kindOf(file.type)
            const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60)
            const path = `sales-media/${Date.now()}_${safe}`
            const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type })

            await new Promise((resolve, reject) => {
                task.on('state_changed',
                    snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    resolve)
            })
            const url = await getDownloadURL(task.snapshot.ref)

            const saved = await authedFetch('/api/sales-agent/media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, url, when: when.trim(), label: label.trim(), type: file.type, bytes: file.size }),
            })
            if (!saved?.ok) throw new Error(saved?.error || 'השמירה נכשלה')

            setFile(null); setWhen(''); setLabel(''); setProgress(null)
            if (fileInput.current) fileInput.current.value = ''
            await load()
        } catch (err) {
            setError(err?.message || 'ההעלאה נכשלה')
        } finally {
            setBusy(null)
            setProgress(null)
        }
    }

    const remove = async key => {
        setBusy(key)
        const res = await authedFetch(`/api/sales-agent/media?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
        if (!res?.ok) setError(res?.error || 'המחיקה נכשלה')
        else await load()
        setBusy(null)
    }

    const ready = file && when.trim().length >= 5 && busy !== 'upload'

    return (
        <div className='rounded-2xl p-4 mb-3' style={CARD}>
            <div className='flex items-center justify-between mb-3 flex-wrap gap-2'>
                <div className='flex items-center gap-2'>
                    <ImageIcon size={16} style={{ color: '#c9a44e' }} />
                    <h2 className='font-bold text-[15px] text-[#1a1410]'>מה הבוט שולח</h2>
                </div>
                <button onClick={load} disabled={loading}
                    className='inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold text-[#7a6a52] disabled:opacity-50'
                    style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> רענן
                </button>
            </div>

            {/* upload */}
            <div className='rounded-xl p-3 mb-3' style={{ background: '#fdfbf7', border: '1px dashed #ead9b3' }}>
                <div className='flex flex-col sm:flex-row gap-2 items-stretch'>
                    <input
                        ref={fileInput}
                        type='file'
                        accept='image/jpeg,image/png,video/mp4'
                        onChange={pick}
                        className='text-[12px] text-[#7a6a52] flex-1'
                    />
                    <input
                        type='text' value={label} onChange={e => setLabel(e.target.value)}
                        placeholder='שם קצר'
                        className='px-3 py-2 rounded-lg text-[12.5px] sm:w-[160px]'
                        style={{ background: '#fff', border: '1px solid #ead9b3' }}
                    />
                </div>
                <input
                    type='text' value={when} onChange={e => setWhen(e.target.value)}
                    placeholder='מתי לשלוח את זה? למשל: בר מצווה, כששואלים איך הספר נראה מבפנים'
                    className='w-full mt-2 px-3 py-2 rounded-lg text-[12.5px]'
                    style={{ background: '#fff', border: '1px solid #ead9b3' }}
                />
                <div className='flex items-center justify-between gap-3 mt-2 flex-wrap'>
                    <p className='text-[11px] text-[#a89378] flex items-center gap-1.5'>
                        <Info size={12} />
                        השורה הזאת היא מה שהבוט קורא כדי להחליט למי לשלוח. תמונה עד 5MB, סרטון MP4 עד 16MB.
                    </p>
                    <button
                        onClick={upload} disabled={!ready}
                        className='inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-40'
                        style={{ background: GOLD }}
                    >
                        {busy === 'upload'
                            ? <><Loader2 size={13} className='animate-spin' /> {progress != null ? `${progress}%` : 'שומר'}</>
                            : <><Upload size={13} /> העלה</>}
                    </button>
                </div>
            </div>

            {error && (
                <div className='mb-3 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2'
                    style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                    <AlertTriangle size={13} /> {error}
                </div>
            )}

            {loading && !items.length ? (
                <div className='py-6 text-center text-[#a89378]'><Loader2 size={18} className='animate-spin mx-auto' /></div>
            ) : (
                <div className='space-y-2'>
                    {items.map(item => (
                        <MediaRow key={item.key} item={item} minSends={minSends} onDelete={remove} busy={busy} />
                    ))}
                </div>
            )}

            <p className='text-[11px] text-[#a89378] mt-3 leading-relaxed'>
                &quot;ענו&quot; = כמה מהאנשים כתבו בחזרה תוך 24 שעות מרגע ששלחנו להם את זה.
                &quot;נסגר&quot; = כמה מהשיחות שהוא הופיע בהן הסתיימו בעסקה. שיעור סגירה מיוחס לכל
                מה שנשלח בשיחה, לא רק לאחרון — אחרת הקרדיט הולך למה שנשלח הכי קרוב לקישור התשלום.
            </p>
        </div>
    )
}
