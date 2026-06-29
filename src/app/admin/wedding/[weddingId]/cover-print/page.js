'use client'

// /admin/wedding/[weddingId]/cover-print
//
// Super-admin tool that exports the hardcover WRAPAROUND cover as a single
// print-ready image for "בית דפוס ירושלים":
//
//   Full (with bleed/wrap): 459 × 248 mm
//   Trim (board area):      419 × 208 mm   → 20 mm wrap on every side
//   Layout (across trim):   front panel 196 · spine 27 (9+9+9) · back panel 196
//
// We render, left→right: [front cover | spine | back cover], each full height
// (incl. the top/bottom wrap), with the cover artwork bleeding into the wrap so
// there is no white edge after the case is wrapped. The spine is filled with
// the cover's own background so it reads continuous. RTL Hebrew books open on
// the right, so the front cover sits on the LEFT of the flat outside spread by
// default — a toggle flips it if the print house expects the opposite.
//
// Output: one JPG @ 300 DPI (5421 × 2929 px). Just the artwork — no guide
// lines; the print house overlays its own trim/spine template.

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { resolveTextureUrl } from '@/lib/resolveAsset'
import { Printer, Lock, CheckCircle2, Loader2, AlertTriangle, ArrowLeft, Download, Info } from 'lucide-react'

// ── Print math (Jerusalem print house wraparound spec) ──────────────
const DPI = 300
const MM_PER_INCH = 25.4
const mmToPx = mm => Math.round((mm / MM_PER_INCH) * DPI)

const FULL_W = mmToPx(459) // 5421
const FULL_H = mmToPx(248) // 2929
const WRAP_MM = 20
const PANEL_MM = 196
const SPINE_MM = 27 // 9 + 9 + 9
// Each side panel region INCLUDES its outer wrap (20mm) so art bleeds to edge.
const REGION_W = mmToPx(WRAP_MM + PANEL_MM) // 216mm ≈ 2551
const SPINE_W = mmToPx(SPINE_MM)            // 27mm ≈ 319
const JPEG_QUALITY = 0.95

function SuperAdminGate({ children }) {
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) { setState('denied'); return }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [])
    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>ייצוא להדפסה זמין רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

function CoverPrintContent() {
    const { weddingId } = useParams()
    const [wedding, setWedding] = useState(null)
    const [loadStatus, setLoadStatus] = useState('loading')
    const [frontSide, setFrontSide] = useState('left') // 'left' = Hebrew RTL default
    const [running, setRunning] = useState(false)
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const stageRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const wSnap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (!wSnap.exists()) { setLoadStatus('error'); setError('האירוע לא נמצא'); return }
                setWedding({ id: weddingId, ...wSnap.data() })
                setLoadStatus('ready')
            } catch (err) {
                console.error('[cover-print] load failed', err)
                if (!cancelled) { setLoadStatus('error'); setError('שגיאה בטעינת האירוע') }
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    // Front cover design — mirror /viewer (coverDesign, else bookDesign) + locale.
    const coverDesign = (() => {
        const c = wedding?.coverDesign || wedding?.bookDesign || {}
        return { ...defaultStyle, ...c, locale: wedding?.locale || 'he' }
    })()

    // Spine fill — the cover's own background so the wrap reads continuous.
    const spineStyle = (() => {
        const tex = resolveTextureUrl(coverDesign.coverTexture) || resolveTextureUrl(coverDesign.texture)
        const url = tex && tex !== 'none' ? tex : null
        return {
            backgroundColor: coverDesign.backgroundColor || '#f5f0e8',
            backgroundImage: url ? `url(${url})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'repeat',
        }
    })()

    const weddingTitle = (() => {
        const b = wedding?.brideNameHe || wedding?.brideName || ''
        const g = wedding?.groomNameHe || wedding?.groomName || ''
        const c = wedding?.celebrantNameHe || wedding?.celebrantName || ''
        return (b && g) ? `${b} ו${g}` : (c || weddingId)
    })()

    const capture = useCallback(async () => {
        if (!stageRef.current) throw new Error('stage missing')
        const imgs = stageRef.current.querySelectorAll('img')
        await Promise.all(Array.from(imgs).map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve()
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true })
                img.addEventListener('error', resolve, { once: true })
                setTimeout(resolve, 8000)
            })
        }))
        await new Promise(r => setTimeout(r, 400))
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(stageRef.current, {
            useCORS: true, allowTaint: false, backgroundColor: '#ffffff',
            scale: 1, width: FULL_W, height: FULL_H, windowWidth: FULL_W, windowHeight: FULL_H, logging: false, x: 0, y: 0,
        })
        return await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY))
    }, [])

    const handleExport = async () => {
        if (running) return
        setRunning(true); setDone(false); setError('')
        try {
            await new Promise(r => setTimeout(r, 250))
            const blob = await capture()
            const safe = (wedding?.brideNameHe || wedding?.brideName || wedding?.celebrantNameHe || wedding?.celebrantName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            const a = document.createElement('a')
            const url = URL.createObjectURL(blob)
            a.href = url
            a.download = `${safe}-cover-jerusalem-459x248-bleed.jpg`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 2000)
            setDone(true)
        } catch (err) {
            console.error('[cover-print] failed', err)
            setError('הייצוא נכשל: ' + (err?.message || 'שגיאה לא ידועה'))
        } finally {
            setRunning(false)
        }
    }

    if (loadStatus === 'loading') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען אירוע...</div>
    if (loadStatus === 'error') return <div className='flex h-screen flex-col items-center justify-center gap-2 text-[#b32424]'><AlertTriangle size={28} /><p>{error}</p></div>

    // Build the left→right order. Hebrew RTL → front on the LEFT by default.
    const front = (
        <div key='front' style={{ width: REGION_W, height: FULL_H, flexShrink: 0 }}>
            <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={REGION_W} scaledHeight={FULL_H} />
        </div>
    )
    const spine = <div key='spine' style={{ width: SPINE_W, height: FULL_H, flexShrink: 0, ...spineStyle }} />
    const back = (
        <div key='back' style={{ width: REGION_W, height: FULL_H, flexShrink: 0 }}>
            <BookBackCoverTemplate scaledWidth={REGION_W} scaledHeight={FULL_H} />
        </div>
    )
    const order = frontSide === 'left' ? [front, spine, back] : [back, spine, front]

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[760px] mx-auto'>
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <Printer size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>הדפסה בבית דפוס ירושלים</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>כריכה עוטפת · 459×248 מ&quot;מ עם bleed · {FULL_W}×{FULL_H}px · {DPI}dpi</p>
                        </div>
                    </div>
                    <a href='/admin' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                        <ArrowLeft size={13} /> חזרה לאדמין
                    </a>
                </div>

                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-1'>אירוע</p>
                    <p className='text-[18px] font-bold text-[#1a1410] mb-1'>{weddingTitle}</p>
                    <p className='text-[12px] text-[#7a6a52]'>ID: <code className='font-mono text-[11px]'>{weddingId}</code></p>
                </div>

                {/* Preview (scaled down) */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-3'>תצוגה מקדימה (חזית · שדרה · גב)</p>
                    <div className='w-full overflow-hidden rounded-lg' style={{ border: '1px solid #ead9b3' }}>
                        <div style={{ width: '100%', aspectRatio: `${FULL_W} / ${FULL_H}`, display: 'flex' }}>
                            <div style={{ flex: `${REGION_W}` }}><div style={{ width: '100%', height: '100%' }}>{frontSide === 'left'
                                ? <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={520} scaledHeight={566} />
                                : <BookBackCoverTemplate scaledWidth={520} scaledHeight={566} />}</div></div>
                            <div style={{ flex: `${SPINE_W}`, ...spineStyle }} />
                            <div style={{ flex: `${REGION_W}` }}><div style={{ width: '100%', height: '100%' }}>{frontSide === 'left'
                                ? <BookBackCoverTemplate scaledWidth={520} scaledHeight={566} />
                                : <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={520} scaledHeight={566} />}</div></div>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 mt-3 flex-wrap'>
                        <span className='text-[12px] text-[#7a6a52]'>צד הכריכה הקדמית:</span>
                        {[{ k: 'left', l: 'שמאל (עברית RTL — ברירת מחדל)' }, { k: 'right', l: 'ימין' }].map(o => (
                            <button key={o.k} onClick={() => setFrontSide(o.k)}
                                className='text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors'
                                style={frontSide === o.k ? { background: '#AA8840', color: '#fff', borderColor: '#AA8840' } : { background: '#fff', color: '#7a6a52', borderColor: '#ead9b3' }}>
                                {o.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div className='rounded-lg px-3 py-2.5 flex items-start gap-2 mb-4' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                    <Info size={14} className='flex-shrink-0 mt-0.5' style={{ color: '#aa8840' }} />
                    <div className='flex-1 text-[12px] text-[#3d2e1a] leading-relaxed'>
                        קובץ אחד @ {DPI}dpi בגודל המלא עם bleed (459×248 מ&quot;מ). העיצוב גולש לאזור העטיפה (20 מ&quot;מ מסביב) כדי שלא יישאר קצה לבן. שמור תוכן חשוב (שם/פנים) בתוך אזור ה-trim (419×208) ורחוק מהשדרה.
                    </div>
                </div>

                {!running && !done && (
                    <button onClick={handleExport} className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-[14px] font-bold' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.45)' }}>
                        <Download size={16} /> הורד כריכה עוטפת (JPG)
                    </button>
                )}
                {running && (
                    <div className='flex items-center justify-center gap-2 py-3'>
                        <Loader2 size={18} className='animate-spin' style={{ color: '#aa8840' }} />
                        <span className='text-[13px] font-bold text-[#3d2e1a]'>מצלם כריכה בגודל מלא… (קובץ גדול, רגע)</span>
                    </div>
                )}
                {done && !running && (
                    <div className='flex items-center justify-center gap-2 py-2'>
                        <CheckCircle2 size={20} style={{ color: '#4f7a3e' }} />
                        <span className='text-[14px] font-bold text-[#3d2e1a]'>הכריכה ירדה! מוכנה לשליחה לבית הדפוס.</span>
                    </div>
                )}
                {error && <div className='mt-3 px-3 py-2 rounded-lg text-[12px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>{error}</div>}
            </div>

            {/* Hidden full-size capture stage — 459×248mm @ 300dpi. */}
            <div ref={stageRef} aria-hidden dir='ltr'
                style={{ position: 'fixed', top: 0, left: -999999, width: FULL_W, height: FULL_H, display: 'flex', overflow: 'hidden', backgroundColor: '#ffffff', pointerEvents: 'none' }}>
                {wedding && order}
            </div>
        </div>
    )
}

export default function CoverPrintPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <CoverPrintContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
