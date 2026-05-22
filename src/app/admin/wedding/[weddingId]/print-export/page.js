'use client'

// /admin/wedding/[weddingId]/print-export
//
// Super-admin tool that renders every book page (cover + N spreads)
// to a JPG at print resolution and bundles them as a ZIP ready to
// upload to wowpro.co.il (WOW Professional).
//
// ── File-naming + format contract (learned the hard way) ────────
//
// First upload attempt to WOW Pro returned two errors:
//   1. "Wrong file count — product requires 12 pages/files"
//   2. "File proportions / resolution incorrect" on files 15-18
//
// What we learned:
//   • WOW Pro products are FIXED PAGE COUNT. A 20×40 layflat album
//     = 12 spreads exactly. The number is product-specific.
//   • Each "file" is a full open SPREAD (40×20 cm landscape, 2:1
//     aspect), NOT a single square page. Squares get rejected for
//     "wrong proportions". Files we sent at 2362×2362 also rejected
//     for "insufficient resolution" because the horizontal axis
//     needs 4724 px for a 40 cm × 300 dpi spread.
//   • cover.jpg is a separate file outside the page-count cap and
//     is square (front cover only, 20×20 cm).
//
// So this exporter produces:
//   cover.jpg              ← front cover, 2362×2362 (20×20 cm @ 300dpi)
//   001.jpg, 002.jpg, ...  ← spreads. EXACTLY `targetSpreadCount`
//                            files. 40×20 cm = 4724×2362 px.
//
// Each spread renders two consecutive entries side-by-side. In RTL
// reading order: the FIRST entry goes on the RIGHT half (where the
// reader's eye starts), the SECOND entry on the LEFT half. Padding
// blanks fill any spread slots that don't have entries.
//
// ── Why client-side rendering (html2canvas + JSZip) ──
// Reuses the EXACT React components that already render the digital
// book (BookCoverTemplate + BookPageTemplate). Avoids the Vercel
// serverless bundle limit that Puppeteer + Chromium blow past.

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
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import {
    Printer, Lock, CheckCircle2, Loader2, AlertTriangle,
    ArrowLeft, FileArchive, Info,
} from 'lucide-react'

// ── Product presets ────────────────────────────────────────────────
// Each one defines what a single spread JPG looks like and what
// the cover JPG looks like.
//
// For layflat albums the math is: closed-width × open-height in cm,
// times 300dpi, rounded. Cover = closed-width × open-height (square
// for square albums).
//
// All values below are AT 300 DPI which is WOW Pro's published spec.
// If we ever want to add the optional "bleed" margin WOW Pro
// recommends for full-bleed art, bump each dimension by ~59 px
// (5 mm × 300 dpi / 25.4) — but their template downloads should be
// consulted first.
const PRODUCT_PRESETS = {
    '20x40_layflat': {
        label: '20×40 layflat (סגור 20×20)',
        spread: { wPx: 4724, hPx: 2362, wCm: 40, hCm: 20 },
        cover: { wPx: 2362, hPx: 2362, wCm: 20, hCm: 20 },
        defaultSpreadCount: 12,
    },
    '25x50_layflat': {
        label: '25×50 layflat (סגור 25×25)',
        spread: { wPx: 5906, hPx: 2953, wCm: 50, hCm: 25 },
        cover: { wPx: 2953, hPx: 2953, wCm: 25, hCm: 25 },
        defaultSpreadCount: 14,
    },
    '30x60_layflat': {
        label: '30×60 layflat (סגור 30×30)',
        spread: { wPx: 7087, hPx: 3543, wCm: 60, hCm: 30 },
        cover: { wPx: 3543, hPx: 3543, wCm: 30, hCm: 30 },
        defaultSpreadCount: 16,
    },
    '20x20_singles': {
        label: '20×20 עמודים בודדים (לא layflat)',
        spread: { wPx: 2362, hPx: 2362, wCm: 20, hCm: 20 }, // single-page mode
        cover: { wPx: 2362, hPx: 2362, wCm: 20, hCm: 20 },
        defaultSpreadCount: 24,
        singleMode: true, // flag — each file = one page, not a spread
    },
}

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
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>
                    ייצוא להדפסה זמין רק למנהל הראשי.
                </p>
            </div>
        )
    }
    return children
}

function PrintExportContent() {
    const { weddingId } = useParams()
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    const [loadStatus, setLoadStatus] = useState('loading')
    const [productPreset, setProductPreset] = useState('20x40_layflat')
    // Allow the user to override the spread count — different WOW Pro
    // SKUs have different fixed page counts. Starts at the preset's
    // default; user can adjust if they bought a different SKU.
    const [spreadCount, setSpreadCount] = useState(PRODUCT_PRESETS['20x40_layflat'].defaultSpreadCount)
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [renderingPage, setRenderingPage] = useState(null)

    const stageRef = useRef(null)

    // When the product preset changes, snap the spread count to the
    // new preset's default so the user starts from sane numbers.
    useEffect(() => {
        setSpreadCount(PRODUCT_PRESETS[productPreset].defaultSpreadCount)
    }, [productPreset])

    // ── Load wedding + entries ─────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const wSnap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (!wSnap.exists()) { setLoadStatus('error'); setError('החתונה לא נמצאה'); return }
                setWedding({ id: weddingId, ...wSnap.data() })
                const list = await getEntries(weddingId)
                if (cancelled) return
                setEntries(list)
                setLoadStatus('ready')
            } catch (err) {
                console.error('[print-export] load failed', err)
                if (!cancelled) { setLoadStatus('error'); setError('שגיאה בטעינת החתונה') }
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    const styleSettings = (() => {
        const fromWedding = wedding?.bookDesign || wedding?.book?.designSettings || {}
        return { ...defaultStyle, ...fromWedding }
    })()
    const coverDesign = (() => {
        const c = wedding?.coverDesign || {}
        return { ...defaultStyle, ...c }
    })()

    const preset = PRODUCT_PRESETS[productPreset]
    const isSingleMode = !!preset.singleMode

    // How many entry-slots does the user's order have room for?
    // Singles: one entry per file → spreadCount files.
    // Spreads: two entries per file → 2 × spreadCount slots.
    const slotsAvailable = isSingleMode ? spreadCount : spreadCount * 2
    const slotsNeeded = entries.length
    const willPad = slotsNeeded < slotsAvailable
    const willTrim = slotsNeeded > slotsAvailable

    // ── Capture helper ─────────────────────────────────────────────
    // Wait for images in the stage to decode, then run html2canvas
    // at the EXACT pixel target. No DPR multiplication, no scaling.
    const captureCurrentStage = useCallback(async (wPx, hPx) => {
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
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            scale: 1,
            width: wPx,
            height: hPx,
            windowWidth: wPx,
            windowHeight: hPx,
            logging: false,
            x: 0,
            y: 0,
        })
        return await new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92)
        })
    }, [])

    // ── Build the list of "pages" to render. In single mode this is
    //    one entry per page. In spread mode this is pairs of entries
    //    rendered side-by-side. Blank slots get a `null` entry → the
    //    page renders empty (just the page background).
    const buildRenderList = () => {
        if (isSingleMode) {
            const out = []
            for (let i = 0; i < spreadCount; i++) {
                out.push({ kind: 'singlePage', entry: entries[i] || null, index: i })
            }
            return out
        }
        // Spread mode: pair entries (2 per spread). RTL reading
        // order → first entry RIGHT, second entry LEFT.
        const out = []
        for (let i = 0; i < spreadCount; i++) {
            const rightIdx = i * 2
            const leftIdx = i * 2 + 1
            out.push({
                kind: 'spread',
                right: entries[rightIdx] || null,
                left: entries[leftIdx] || null,
                index: i,
            })
        }
        return out
    }

    const handleExport = async () => {
        if (running) return
        setRunning(true)
        setDone(false)
        setError('')
        const renderList = buildRenderList()
        const total = 1 + renderList.length // cover + N
        setProgress({ done: 0, total, label: 'מתחיל...' })

        try {
            const JSZip = (await import('jszip')).default
            const zip = new JSZip()

            // 1) Cover
            setProgress({ done: 0, total, label: 'מצלם כריכה...' })
            setRenderingPage({ kind: 'cover' })
            await new Promise(r => setTimeout(r, 120))
            const coverBlob = await captureCurrentStage(preset.cover.wPx, preset.cover.hPx)
            zip.file('cover.jpg', coverBlob)
            setProgress({ done: 1, total, label: 'כריכה ✓' })

            // 2) Spreads / Pages
            for (let i = 0; i < renderList.length; i++) {
                const item = renderList[i]
                const num = String(i + 1).padStart(3, '0')
                setProgress({ done: i + 1, total, label: `מצלם ${isSingleMode ? 'עמוד' : 'spread'} ${num}...` })
                setRenderingPage(item)
                await new Promise(r => setTimeout(r, 120))
                const blob = await captureCurrentStage(preset.spread.wPx, preset.spread.hPx)
                zip.file(`${num}.jpg`, blob)
                setProgress({ done: i + 2, total, label: `${num} ✓` })
            }

            // 3) Manifest
            const manifest = [
                `Wedding Tales — WOW Professional export`,
                `Wedding: ${wedding?.brideNameHe || wedding?.brideName || ''} ${wedding?.groomNameHe ? 'ו' + wedding.groomNameHe : (wedding?.groomName ? 'and ' + wedding.groomName : '')}`,
                `Generated: ${new Date().toISOString()}`,
                `Product: ${preset.label}`,
                `Layout: ${isSingleMode ? 'single page per file' : 'spread (2 entries per file)'}`,
                `Spread dimensions: ${preset.spread.wCm}×${preset.spread.hCm} cm @ 300dpi (${preset.spread.wPx}×${preset.spread.hPx} px)`,
                `Cover dimensions: ${preset.cover.wCm}×${preset.cover.hCm} cm @ 300dpi (${preset.cover.wPx}×${preset.cover.hPx} px)`,
                `Files: cover.jpg + ${renderList.length} ${isSingleMode ? 'pages' : 'spreads'}`,
                `Entries in book: ${entries.length}`,
                `Slots filled: ${Math.min(entries.length, slotsAvailable)} / ${slotsAvailable}`,
                ``,
                `Upload to: https://www.wowpro.co.il/dashboard`,
            ].join('\n')
            zip.file('README.txt', manifest)

            setProgress({ done: total, total, label: 'אורז ZIP...' })
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })

            const a = document.createElement('a')
            const url = URL.createObjectURL(zipBlob)
            const safeName = (wedding?.brideNameHe || wedding?.brideName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            a.href = url
            a.download = `wowpro-${safeName}-${productPreset}-${spreadCount}p.zip`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 2000)

            setDone(true)
            setRenderingPage(null)
        } catch (err) {
            console.error('[print-export] failed', err)
            setError('הייצוא נכשל: ' + (err?.message || 'שגיאה לא ידועה'))
        } finally {
            setRunning(false)
        }
    }

    if (loadStatus === 'loading') {
        return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען חתונה...</div>
    }
    if (loadStatus === 'error') {
        return <div className='flex h-screen flex-col items-center justify-center gap-2 text-[#b32424]'><AlertTriangle size={28} /><p>{error}</p></div>
    }

    const weddingTitle = (() => {
        const b = wedding?.brideNameHe || wedding?.brideName || ''
        const g = wedding?.groomNameHe || wedding?.groomName || ''
        const c = wedding?.celebrantNameHe || wedding?.celebrantName || ''
        return (b && g) ? `${b} ו${g}` : (c || weddingId)
    })()

    // For the hidden stage, we size to the LARGER of cover/spread
    // dimensions and let the rendered template size itself within.
    // We re-mount the template each render pass so dimensions match.
    const stageW = renderingPage?.kind === 'cover' ? preset.cover.wPx : preset.spread.wPx
    const stageH = renderingPage?.kind === 'cover' ? preset.cover.hPx : preset.spread.hPx

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[900px] mx-auto'>
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <Printer size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>ייצוא ל-WOW Pro</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>קבצי spread מוכנים להעלאה ל-wowpro.co.il</p>
                        </div>
                    </div>
                    <a href='/admin' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                        <ArrowLeft size={13} /> חזרה לאדמין
                    </a>
                </div>

                {/* Wedding card */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-1'>חתונה</p>
                    <p className='text-[18px] font-bold text-[#1a1410] mb-1'>{weddingTitle}</p>
                    <p className='text-[12px] text-[#7a6a52]'>{entries.length} ברכות בספר · ID: <code className='font-mono text-[11px]'>{weddingId}</code></p>
                </div>

                {/* Settings */}
                <div className='rounded-2xl p-5 mb-4 space-y-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold'>הגדרות הדפסה</p>

                    <div>
                        <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>סוג מוצר ב-WOW Pro</label>
                        <select
                            value={productPreset}
                            onChange={e => setProductPreset(e.target.value)}
                            disabled={running}
                            className='w-full px-3 py-2 rounded-lg text-[13px] font-semibold text-[#3d2e1a] outline-none'
                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                        >
                            {Object.entries(PRODUCT_PRESETS).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                        <p className='text-[11px] text-[#a89378] mt-1.5'>
                            spread = {preset.spread.wPx}×{preset.spread.hPx} px @ 300dpi · cover = {preset.cover.wPx}×{preset.cover.hPx} px
                        </p>
                    </div>

                    <div>
                        <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>
                            מספר {isSingleMode ? 'עמודים' : 'spreads'} להפקה
                        </label>
                        <div className='flex items-center gap-2'>
                            <input
                                type='number'
                                min='1'
                                max='60'
                                value={spreadCount}
                                onChange={e => setSpreadCount(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                                disabled={running}
                                className='w-24 px-3 py-2 rounded-lg text-[14px] font-bold text-[#3d2e1a] outline-none text-center'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            />
                            <span className='text-[12px] text-[#7a6a52]'>
                                {isSingleMode
                                    ? `${spreadCount} קבצים = ${spreadCount} עמודים`
                                    : `${spreadCount} spreads = ${spreadCount * 2} עמודי תוכן (${spreadCount} קבצי JPG)`}
                            </span>
                        </div>
                        <p className='text-[11px] text-[#a89378] mt-1.5 leading-relaxed'>
                            חייב להתאים בדיוק לכמות הדפים של המוצר שהזמנת ב-WOW Pro (אחרת ההעלאה נדחית).
                        </p>
                    </div>

                    {/* Capacity preview */}
                    <div className='rounded-lg px-3 py-2.5 flex items-start gap-2' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                        <Info size={14} className='flex-shrink-0 mt-0.5' style={{ color: '#aa8840' }} />
                        <div className='flex-1 text-[12px] text-[#3d2e1a] leading-relaxed'>
                            יש לך <b>{entries.length}</b> ברכות. ההגדרה הנוכחית מכילה <b>{slotsAvailable}</b> {isSingleMode ? 'עמודים' : 'מקומות'}.
                            {willPad && <span className='text-[#7a6a52]'> ‒ יוסיף {slotsAvailable - slotsNeeded} עמודים ריקים.</span>}
                            {willTrim && <span className='text-[#b32424]'> ‒ ⚠️ {slotsNeeded - slotsAvailable} ברכות לא ייכנסו! העלה את ספירת הדפים.</span>}
                            {!willPad && !willTrim && <span className='text-[#4f7a3e]'> ‒ ✓ התאמה מושלמת.</span>}
                        </div>
                    </div>
                </div>

                {/* Action */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: 'linear-gradient(135deg, rgba(170,136,64,0.10) 0%, rgba(170,136,64,0.02) 100%)', border: '1px solid rgba(212,184,103,0.35)' }}>
                    {!running && !done && (
                        <button
                            onClick={handleExport}
                            className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-[14px] font-bold'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.45)' }}
                        >
                            <FileArchive size={16} /> ייצא ZIP של {spreadCount + 1} קבצים
                        </button>
                    )}
                    {running && (
                        <div>
                            <div className='flex items-center gap-2 mb-3'>
                                <Loader2 size={18} className='animate-spin' style={{ color: '#aa8840' }} />
                                <span className='text-[13px] font-bold text-[#3d2e1a]'>{progress.label}</span>
                                <span className='text-[12px] text-[#a89378] ms-auto'>{progress.done}/{progress.total}</span>
                            </div>
                            <div className='w-full h-2 rounded-full overflow-hidden' style={{ background: '#f0e8d4' }}>
                                <div className='h-full rounded-full transition-all' style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: 'linear-gradient(90deg, #d3b46a 0%, #aa8840 100%)' }} />
                            </div>
                        </div>
                    )}
                    {done && !running && (
                        <div className='flex items-center justify-center gap-2 py-2 flex-wrap'>
                            <CheckCircle2 size={20} style={{ color: '#4f7a3e' }} />
                            <span className='text-[14px] font-bold text-[#3d2e1a]'>ה-ZIP ירד! העלה ב-</span>
                            <a href='https://www.wowpro.co.il/dashboard' target='_blank' rel='noreferrer' className='text-[14px] font-bold underline' style={{ color: '#aa8840' }}>
                                wowpro.co.il
                            </a>
                        </div>
                    )}
                    {error && (
                        <div className='mt-3 px-3 py-2 rounded-lg text-[12px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className='rounded-2xl p-5' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.20)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>הערות חשובות</p>
                    <ul className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-disc pr-5'>
                        <li>קובץ כל spread הוא 40×20 ס&quot;מ (יחס 2:1) ברזולוציית הדפסה אמיתית של 300dpi.</li>
                        <li>ערך ראשון נכנס לעמוד הימני של ה-spread, ערך שני לעמוד השמאלי (סדר קריאה עברי).</li>
                        <li><b>מספר הקבצים חייב להתאים בדיוק</b> למוצר ב-WOW Pro — אחרת ההעלאה נדחית עם השגיאה &quot;מספר קבצים שגוי&quot;.</li>
                        <li>אם ההעלאה הזו עדיין נדחית, בדוק עם WOW Pro מה ה-aspect ratio המדויק של המוצר שלך — אפשר לעדכן בקוד תוך 5 דק׳.</li>
                    </ul>
                </div>
            </div>

            {/* Hidden capture stage. Sized exactly to whatever's
                currently being rendered (cover or spread). Positioned
                far offscreen but with real layout so html2canvas can
                measure it. RTL forced so Hebrew renders correctly. */}
            <div
                ref={stageRef}
                aria-hidden
                style={{
                    position: 'fixed',
                    top: 0,
                    left: -99999,
                    width: stageW,
                    height: stageH,
                    overflow: 'hidden',
                    backgroundColor: '#ffffff',
                    pointerEvents: 'none',
                    direction: 'rtl',
                }}
            >
                {renderingPage?.kind === 'cover' && wedding && (
                    <BookCoverTemplate
                        wedding={wedding}
                        styleSettings={coverDesign}
                        scaledWidth={preset.cover.wPx}
                        scaledHeight={preset.cover.hPx}
                    />
                )}
                {renderingPage?.kind === 'singlePage' && (
                    <div style={{ width: '100%', height: '100%' }}>
                        {renderingPage.entry ? (
                            <BookPageTemplate
                                entry={renderingPage.entry}
                                styleSettings={styleSettings}
                                scaledWidth={preset.spread.wPx}
                                scaledHeight={preset.spread.hPx}
                            />
                        ) : (
                            <BlankPage styleSettings={styleSettings} />
                        )}
                    </div>
                )}
                {renderingPage?.kind === 'spread' && (
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                        {/* Right page (first entry — RTL reading order) */}
                        <div style={{ flex: 1, height: '100%', borderRight: '0', overflow: 'hidden' }}>
                            {renderingPage.right ? (
                                <BookPageTemplate
                                    entry={renderingPage.right}
                                    styleSettings={styleSettings}
                                    scaledWidth={preset.spread.wPx / 2}
                                    scaledHeight={preset.spread.hPx}
                                />
                            ) : (
                                <BlankPage styleSettings={styleSettings} />
                            )}
                        </div>
                        {/* Left page (second entry) */}
                        <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                            {renderingPage.left ? (
                                <BookPageTemplate
                                    entry={renderingPage.left}
                                    styleSettings={styleSettings}
                                    scaledWidth={preset.spread.wPx / 2}
                                    scaledHeight={preset.spread.hPx}
                                />
                            ) : (
                                <BlankPage styleSettings={styleSettings} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// Blank page placeholder — used to fill spread slots that don't have
// an entry, so the file count comes out exact. Reuses the wedding's
// background so the blank reads as "intentional white space" not as
// "broken page".
function BlankPage({ styleSettings }) {
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: styleSettings?.backgroundColor || '#fdfaf3',
                backgroundImage: styleSettings?.backgroundUrl ? `url(${styleSettings.backgroundUrl})` : 'none',
                backgroundRepeat: 'repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        />
    )
}

export default function PrintExportPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <PrintExportContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
