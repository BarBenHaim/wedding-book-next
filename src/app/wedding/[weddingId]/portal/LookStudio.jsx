'use client'

// One photo in, covers and signs out (portal?view=look).
//
// The owner picks a photo and says yes to sending it for the drawing. The image model draws three covers and two
// signs around the person, one request per design so each one appears as soon as it is ready
// (api/owner/event-look/render). Nothing is applied to the event until the owner picks a design, a cover that
// somebody chose before is asked about first, and it can be brought back.

import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { Heebo } from 'next/font/google'
import { db, auth } from '../../../../lib/firebaseClient'
import { uploadEventImage } from '@/lib/uploadEventImage'
import { coverIsUndressed } from '@/lib/defaultCovers'
import { coverBefore, coverPickUpdate, coverUndoUpdate, pickWouldReplaceChoice, ART_LOOK } from '@/lib/ownerLook'
import { LOOK_OPTIONS, LOOK_LIMIT_PER_EVENT } from '@/lib/ownerLookAi'
import { readPhoto, photoToJpeg } from '@/lib/photoPrep'
import { PosterArt } from './PosterSheet'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['400', '600', '700', '900'] })
const SITE = 'https://app.weddingtales.co.il'
const INK = '#14183A'
const BLUE = '#2748E8'
const PARALLEL = 2

const card = { background: '#fff', borderRadius: 22, boxShadow: '0 1px 2px rgba(20,24,58,0.06), 0 14px 30px -22px rgba(20,24,58,0.35)' }
const pill = (primary, disabled) => ({
    minHeight: 46, padding: '0 18px', borderRadius: 999, border: primary ? 'none' : `1.5px solid ${INK}`, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    fontSize: 15, fontWeight: 800, background: primary ? BLUE : '#fff', color: primary ? '#fff' : INK, opacity: disabled ? 0.55 : 1,
})

const REASON = {
    limit: 'הגעתם למספר העיצובים המרבי לאירוע הזה.',
    'missing-openai-key': 'שירות יצירת העיצובים עוד לא מופעל. נסו שוב מאוחר יותר.',
    timeout: 'העיצוב לקח יותר מדי זמן. אפשר לנסות שוב.',
    'openai-failed': 'השירות לא הצליח לצייר את העיצוב הזה. אפשר לנסות שוב.',
    'no-image': 'השירות לא החזיר תמונה. אפשר לנסות שוב.',
}

export default function LookStudio({ weddingId, w, onBack, onChanged }) {
    const fileRef = useRef(null)
    const [blob, setBlob] = useState(null)
    const [localUrl, setLocalUrl] = useState('')
    const [consent, setConsent] = useState(false)
    const [tiles, setTiles] = useState({}) // option id -> { status, url, error }
    const [running, setRunning] = useState(false)
    const [busy, setBusy] = useState('')
    const [msg, setMsg] = useState('')
    const used = Number(w?.lookRenders) || 0

    const cover = w?.coverDesign
    const hasAuto = Boolean(cover?.coverAuto) && Boolean(w?.coverDesignBefore)
    const started = Object.keys(tiles).length > 0

    const choose = useCallback(async file => {
        if (!file) return
        setMsg('')
        setBusy('read')
        try {
            if (!/^image\//.test(file.type)) throw new Error('not-image')
            const jpeg = await photoToJpeg(await readPhoto(file))
            setBlob(jpeg)
            setTiles({})
            setLocalUrl(prev => {
                if (prev) URL.revokeObjectURL(prev)
                return URL.createObjectURL(jpeg)
            })
        } catch {
            setMsg('לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG אחר.')
        } finally {
            setBusy('')
        }
    }, [])

    useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl) }, [localUrl])

    async function renderOne(option, photoUrl) {
        setTiles(t => ({ ...t, [option.id]: { status: 'busy' } }))
        try {
            const token = await auth.currentUser?.getIdToken()
            const res = await fetch('/api/owner/event-look/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId, option: option.id, photoUrl }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { reason: data.error })
            setTiles(t => ({ ...t, [option.id]: { status: 'done', url: data.url } }))
            return true
        } catch (err) {
            setTiles(t => ({ ...t, [option.id]: { status: 'error', error: REASON[err.reason] || 'לא הצלחנו לצייר את העיצוב הזה. אפשר לנסות שוב.' } }))
            return err.reason === 'limit' ? 'limit' : false
        }
    }

    async function generate() {
        if (!blob || !consent || running) return
        setRunning(true)
        setMsg('')
        try {
            const photoUrl = await uploadEventImage({ weddingId, filename: `owner-photo-${Date.now()}.jpg`, blob, contentType: 'image/jpeg' })
            setTiles(Object.fromEntries(LOOK_OPTIONS.map(o => [o.id, { status: 'wait' }])))
            const queue = [...LOOK_OPTIONS]
            let stop = false
            await Promise.all(Array.from({ length: PARALLEL }, async () => {
                while (queue.length && !stop) {
                    const next = queue.shift()
                    const r = await renderOne(next, photoUrl)
                    if (r === 'limit') stop = true
                }
            }))
            onChanged?.()
        } catch {
            setMsg('לא הצלחנו להעלות את התמונה. נסו שוב.')
        } finally {
            setRunning(false)
        }
    }

    async function pickCover(option) {
        if (busy) return
        const tile = tiles[option.id]
        if (!tile?.url) return
        if (pickWouldReplaceChoice(cover, coverIsUndressed) && !window.confirm('כבר יש לכם כריכה שבחרתם. להחליף אותה? אפשר לחזור אליה אחר כך.')) return
        setBusy(`cover:${option.id}`)
        setMsg('')
        try {
            // the first pick keeps what the cover was; picking again keeps that same original
            const before = hasAuto ? w.coverDesignBefore : coverBefore(cover)
            const { set } = coverPickUpdate({ url: tile.url, optionId: option.id, before })
            await updateDoc(doc(db, 'weddings', weddingId), { ...set, coverDesignBefore: before })
            onChanged?.()
            setMsg('הכריכה נשמרה. היא כבר בספר.')
        } catch (err) {
            setMsg(err?.code === 'permission-denied' ? 'אין הרשאה לשמור את הכריכה. התחברו שוב ונסו שוב.' : 'לא הצלחנו לשמור את הכריכה. נסו שוב.')
        } finally {
            setBusy('')
        }
    }

    async function undoCover() {
        if (busy || !hasAuto) return
        setBusy('undo')
        setMsg('')
        try {
            const { set, remove } = coverUndoUpdate(w.coverDesignBefore)
            const patch = { ...set, coverDesignBefore: deleteField() }
            for (const k of remove) patch[k] = deleteField()
            await updateDoc(doc(db, 'weddings', weddingId), patch)
            onChanged?.()
            setMsg('חזרנו לכריכה הקודמת.')
        } catch {
            setMsg('לא הצלחנו להחזיר את הכריכה הקודמת. נסו שוב.')
        } finally {
            setBusy('')
        }
    }

    async function pickSign(option) {
        if (busy) return
        const tile = tiles[option.id]
        if (!tile?.url) return
        setBusy(`sign:${option.id}`)
        setMsg('')
        try {
            await updateDoc(doc(db, 'weddings', weddingId), { posterArt: { url: tile.url, option: option.id, at: new Date().toISOString() }, posterLook: ART_LOOK })
            window.location.assign(`/wedding/${weddingId}/portal?view=poster`)
        } catch (err) {
            setMsg(err?.code === 'permission-denied' ? 'אין הרשאה לשמור את השלט. התחברו שוב ונסו שוב.' : 'לא הצלחנו לשמור את השלט. נסו שוב.')
            setBusy('')
        }
    }

    const guestLink = w?.slug ? `${SITE}/w/${w.slug}?go=photo` : `${SITE}/wedding/${weddingId}/photo`
    const shortLink = guestLink.replace(/^https?:\/\//, '').replace(/\?go=photo$/, '')
    const covers = LOOK_OPTIONS.filter(o => o.kind === 'cover')
    const signs = LOOK_OPTIONS.filter(o => o.kind === 'sign')
    const remaining = Math.max(0, LOOK_LIMIT_PER_EVENT - used)

    const tileBox = (option, children) => (
        <div key={option.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {children}
        </div>
    )
    const waiting = (tile, ratio) => (
        <div style={{ width: '100%', aspectRatio: ratio, borderRadius: 10, background: '#EEF0FA', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 14, fontSize: 14, fontWeight: 700, color: '#5A5D75' }}>
            {tile?.status === 'error' ? tile.error : tile?.status === 'busy' ? 'מציירים… זה לוקח כחצי דקה' : 'בתור'}
        </div>
    )

    return (
        <div className={heebo.className} dir='rtl' style={{ minHeight: '100vh', background: '#FBF8F2', color: INK, padding: '16px 14px 60px' }}>
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>עיצוב מתמונה אחת</h1>
                        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#5A5D75', lineHeight: 1.5 }}>מעלים תמונה, ומקבלים כריכות ושלטי "ברכו את" מצוירים סביבה. בוחרים את מה שאוהבים. שום דבר לא משתנה עד שבוחרים.</p>
                    </div>
                    <button type='button' onClick={onBack} style={pill(false)}>חזרה</button>
                </div>

                <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input ref={fileRef} type='file' accept='image/*' hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files?.[0]) }}
                        onClick={() => fileRef.current?.click()}
                        role='button'
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
                        style={{ border: '2px dashed #B7BDD9', borderRadius: 18, padding: localUrl ? 10 : '34px 16px', textAlign: 'center', cursor: 'pointer', background: '#F6F7FD', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}
                    >
                        {localUrl ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={localUrl} alt='' style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 14 }} />
                                <span style={{ fontWeight: 800, fontSize: 15 }}>להחליף תמונה</span>
                            </>
                        ) : (
                            <span style={{ fontWeight: 800, fontSize: 16 }}>{busy === 'read' ? 'קוראים את התמונה…' : 'לחצו לבחירת תמונה, או גררו לכאן'}</span>
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#5A5D75', lineHeight: 1.5 }}>תמונה ברורה של החוגג (או של הזוג), עם הפנים גלויות, עובדת הכי טוב. כדאי תמונה אחת, בלי הרבה אנשים אחרים.</p>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
                        <input type='checkbox' checked={consent} onChange={e => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }} />
                        <span>אני מאשר/ת לשלוח את התמונה לשירות חיצוני ליצירת תמונות (OpenAI), כדי שיצייר ממנה את העיצובים. התמונה לא תפורסם ולא תשמש לשום דבר אחר.</span>
                    </label>
                    <button type='button' disabled={!blob || !consent || running || remaining < LOOK_OPTIONS.length} onClick={generate} style={pill(true, !blob || !consent || running || remaining < LOOK_OPTIONS.length)}>
                        {running ? 'יוצרים עיצובים…' : started ? 'עוד סבב עיצובים' : 'ליצור עיצובים'}
                    </button>
                    {remaining < LOOK_OPTIONS.length && <p style={{ margin: 0, fontSize: 13, color: '#8A1F1F', fontWeight: 700 }}>הגעתם למספר העיצובים המרבי לאירוע הזה.</p>}
                    {msg && <p role='status' style={{ margin: 0, fontSize: 14, fontWeight: 700, color: /לא |אין /.test(msg) ? '#8A1F1F' : '#1F6B3A' }}>{msg}</p>}
                </div>

                {!started && hasAuto && (
                    <div style={{ ...card, padding: 18 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>הכריכה של הספר נוצרה מהתמונה שלכם. אפשר לחזור לכריכה שהייתה קודם.</p>
                        <button type='button' disabled={Boolean(busy)} onClick={undoCover} style={pill(false, Boolean(busy))}>חזרה לכריכה הקודמת</button>
                    </div>
                )}

                {started && (
                    <>
                        <div style={{ ...card, padding: 18 }}>
                            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 900 }}>כריכה לספר</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                                {covers.map(o => {
                                    const tile = tiles[o.id]
                                    return tileBox(o, (
                                        <>
                                            {tile?.status === 'done' ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={tile.url} alt={o.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, boxShadow: '0 10px 24px -14px rgba(20,24,58,0.5)' }} />
                                            ) : waiting(tile, '1 / 1')}
                                            <button type='button' disabled={tile?.status !== 'done' || Boolean(busy)} onClick={() => pickCover(o)} style={pill(true, tile?.status !== 'done' || Boolean(busy))}>{busy === `cover:${o.id}` ? 'שומרים…' : `הכריכה הזו: ${o.name}`}</button>
                                        </>
                                    ))
                                })}
                            </div>
                            {hasAuto && <button type='button' disabled={Boolean(busy)} onClick={undoCover} style={{ ...pill(false, Boolean(busy)), marginTop: 14 }}>חזרה לכריכה הקודמת</button>}
                        </div>

                        <div style={{ ...card, padding: 18 }}>
                            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 900 }}>שלט "ברכו את"</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                                {signs.map(o => {
                                    const tile = tiles[o.id]
                                    return tileBox(o, (
                                        <>
                                            {tile?.status === 'done' ? (
                                                <PosterArt w={w} look={ART_LOOK} artUrl={tile.url} guestLink={guestLink} shortLink={shortLink} ready style={{ width: '100%', aspectRatio: '210 / 297', borderRadius: 8 }} />
                                            ) : waiting(tile, '210 / 297')}
                                            <button type='button' disabled={tile?.status !== 'done' || Boolean(busy)} onClick={() => pickSign(o)} style={pill(true, tile?.status !== 'done' || Boolean(busy))}>{busy === `sign:${o.id}` ? 'שומרים…' : `השלט הזה: ${o.name}`}</button>
                                        </>
                                    ))
                                })}
                            </div>
                            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#5A5D75' }}>הקוד לסריקה נוסף לשלט אוטומטית, והוא אמיתי. אחרי הבחירה נפתח השלט להדפסה.</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
