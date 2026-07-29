'use client'

// /admin/wedding/[weddingId]/page-image
//
// Super-admin tool to download a SINGLE page (or cover) of the book as an
// image, rendered EXACTLY the way the /viewer shows it.
//
// Numbering (as the owner asked):
//   • page 1            → front cover
//   • last page (N)     → back cover
//   • pages 2 … N-1     → the interior pages, in book order (one per entry)
//
// "Exactly like the viewer" means we render with the SAME design objects
// the viewer uses:
//   • Covers   → wedding.coverDesign (falls back to bookDesign), which
//     includes the cover background image and any scale/position the owner
//     set — so if they enlarged the cover background in the viewer, the
//     download reflects it.
//   • Interior → resolveInteriorDesign(wedding) (same as the viewer/book).
// Both go through the very same BookCoverTemplate / BookPageTemplate
// components the viewer renders, so the output matches 1:1.

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import { getEntries } from '@/lib/classifyMedia'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import BookBackCoverTemplate from '@/components/BookBackCoverTemplate/BookBackCoverTemplate'
import defaultStyle, { resolveInteriorDesign } from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { expandBookPages } from '@/lib/bookPages'
import { Printer, Lock, Loader2, AlertTriangle, ArrowLeft, Download } from 'lucide-react'

// Square render resolution. The book pages are square; this is high enough
// for print/sharing and matches the viewer's proportions exactly.
const PX = 2800
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
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>הורדת עמודים זמינה רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

function PageImageContent() {
    const { weddingId } = useParams()
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    const [loadStatus, setLoadStatus] = useState('loading')
    const [error, setError] = useState('')
    const [pageNum, setPageNum] = useState(1)
    const [busy, setBusy] = useState(false)
    const [renderingItem, setRenderingItem] = useState(null)
    const stageRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const wSnap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (!wSnap.exists()) { setLoadStatus('error'); setError('האירוע לא נמצא'); return }
                setWedding({ id: weddingId, ...wSnap.data() })
                const list = await getEntries(weddingId)
                if (cancelled) return
                setEntries(list)
                setLoadStatus('ready')
            } catch (err) {
                console.error('[page-image] load failed', err)
                if (!cancelled) { setLoadStatus('error'); setError('שגיאה בטעינת האירוע') }
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    const locale = wedding?.locale || 'he'
    // Interior pages — same source AND same canonical fill the
    // viewer/book use, so the downloaded page-image matches the screen.
    const styleSettings = (() => ({ ...applyPresetClean(resolveInteriorDesign(wedding)), locale }))()
    // Covers — same source the viewer's front cover uses (incl. background
    // image + scale the owner set), so the download matches what's on screen.
    const coverDesign = (() => {
        const c = wedding?.coverDesign || wedding?.bookDesign || {}
        return { ...defaultStyle, ...c, locale }
    })()

    // Interior pages, with smart auto-split honored (matches the book/viewer).
    const bookPages = expandBookPages(entries, { autoSplit: styleSettings.autoSplit, splitThreshold: styleSettings.splitThreshold, entriesPerPage: styleSettings.entriesPerPage, photoLayout: styleSettings.photoLayout })

    // total = front cover + interior pages + back cover.
    const total = bookPages.length + 2

    // Map a 1-based page number to what to render.
    function itemForPage(num) {
        if (num <= 1) return { kind: 'cover', name: 'cover-front' }
        if (num >= total) return { kind: 'back', name: 'cover-back' }
        const entry = bookPages[num - 2] || null
        return { kind: 'page', entry, name: `page-${String(num).padStart(3, '0')}` }
    }

    const captureStage = useCallback(async () => {
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
        await new Promise(r => setTimeout(r, 350))
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(stageRef.current, {
            useCORS: true, allowTaint: false, backgroundColor: '#ffffff',
            scale: 1, width: PX, height: PX, windowWidth: PX, windowHeight: PX, logging: false, x: 0, y: 0,
        })
        return await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY))
    }, [])

    async function download(num) {
        if (busy) return
        const item = itemForPage(num)
        setBusy(true)
        setError('')
        try {
            setRenderingItem(item)
            await new Promise(r => setTimeout(r, 250))
            const blob = await captureStage()
            const safe = (wedding?.brideNameHe || wedding?.brideName || wedding?.celebrantNameHe || wedding?.celebrantName || weddingId)
                .replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            const a = document.createElement('a')
            const url = URL.createObjectURL(blob)
            a.href = url
            a.download = `${safe}-${item.name}.jpg`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 2000)
        } catch (err) {
            console.error('[page-image] export failed', err)
            setError('ההורדה נכשלה: ' + (err?.message || 'שגיאה'))
        } finally {
            setRenderingItem(null)
            setBusy(false)
        }
    }

    if (loadStatus === 'loading') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען אירוע...</div>
    if (loadStatus === 'error') return <div className='flex h-screen flex-col items-center justify-center gap-2 text-[#b32424]'><AlertTriangle size={28} /><p>{error}</p></div>

    const weddingTitle = (() => {
        const b = wedding?.brideNameHe || wedding?.brideName || ''
        const g = wedding?.groomNameHe || wedding?.groomName || ''
        const c = wedding?.celebrantNameHe || wedding?.celebrantName || ''
        return (b && g) ? `${b} ו${g}` : (c || weddingId)
    })()

    const labelForNum = pageNum <= 1 ? 'כריכה קדמית' : pageNum >= total ? 'כריכה אחורית' : `עמוד פנים ${pageNum - 1}`

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[760px] mx-auto'>
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <Download size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>הורדת עמוד / כריכה כתמונה</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>בדיוק כמו ב-viewer · {PX}×{PX}px</p>
                        </div>
                    </div>
                    <a href='/admin' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                        <ArrowLeft size={13} /> חזרה לאדמין
                    </a>
                </div>

                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-1'>אירוע</p>
                    <p className='text-[18px] font-bold text-[#1a1410] mb-1'>{weddingTitle}</p>
                    <p className='text-[12px] text-[#7a6a52]'>{entries.length} ברכות · סה&quot;כ {total} עמודים (כולל 2 כריכות)</p>
                </div>

                {/* Quick covers */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-3'>כריכות</p>
                    <div className='flex flex-wrap gap-2'>
                        <button onClick={() => download(1)} disabled={busy}
                            className='inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                            <Download size={15} /> הורד כריכה קדמית
                        </button>
                        <button onClick={() => download(total)} disabled={busy}
                            className='inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-[#7a6a52] disabled:opacity-60'
                            style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                            <Download size={15} /> הורד כריכה אחורית
                        </button>
                    </div>
                </div>

                {/* By page number */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-3'>לפי מספר עמוד</p>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <input type='number' min={1} max={total} value={pageNum}
                            onChange={e => setPageNum(Math.max(1, Math.min(total, parseInt(e.target.value, 10) || 1)))}
                            disabled={busy}
                            className='w-24 px-3 py-2 rounded-lg text-[14px] font-bold text-[#3d2e1a] outline-none text-center'
                            style={{ background: '#fff', border: '1px solid #ead9b3' }} />
                        <span className='text-[13px] font-semibold text-[#3d2e1a]'>{labelForNum}</span>
                        <button onClick={() => download(pageNum)} disabled={busy}
                            className='inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60 ms-auto'
                            style={{ background: '#0e9f8e' }}>
                            {busy ? <Loader2 size={15} className='animate-spin' /> : <Download size={15} />}
                            {busy ? 'מפיק…' : 'הורד עמוד'}
                        </button>
                    </div>
                    <p className='text-[11px] text-[#a89378] mt-2 leading-relaxed'>
                        מספר 1 = כריכה קדמית · מספר {total} = כריכה אחורית · 2–{total - 1} = עמודי הפנים לפי הסדר. התמונה תצא בדיוק כמו שהיא נראית ב-viewer (כולל רקע הכריכה וההגדלה שלך).
                    </p>
                    {error && <div className='mt-3 px-3 py-2 rounded-lg text-[12px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>{error}</div>}
                </div>
            </div>

            {/* Hidden capture stage — square, rendered identically to the viewer. */}
            <div ref={stageRef} aria-hidden
                style={{ position: 'fixed', top: 0, left: -99999, width: PX, height: PX, overflow: 'hidden', backgroundColor: '#ffffff', pointerEvents: 'none', direction: 'rtl' }}>
                {renderingItem?.kind === 'cover' && wedding && (
                    <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={PX} scaledHeight={PX} />
                )}
                {renderingItem?.kind === 'back' && (
                    <BookBackCoverTemplate scaledWidth={PX} scaledHeight={PX} />
                )}
                {renderingItem?.kind === 'page' && (
                    renderingItem.entry ? (
                        <BookPageTemplate entry={renderingItem.entry} styleSettings={styleSettings} scaledWidth={PX} scaledHeight={PX} />
                    ) : (
                        <div style={{
                            width: '100%', height: '100%',
                            backgroundColor: styleSettings?.backgroundColor || '#fdfaf3',
                            backgroundImage: styleSettings?.backgroundUrl ? `url(${styleSettings.backgroundUrl})` : 'none',
                            backgroundRepeat: 'repeat', backgroundSize: 'cover', backgroundPosition: 'center',
                        }} />
                    )
                )}
            </div>
        </div>
    )
}

export default function PageImagePage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <PageImageContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
