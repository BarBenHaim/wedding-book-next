'use client'

// /admin/wedding/[weddingId]/print-export
//
// Super-admin tool that renders every book page to a JPG at print
// resolution and bundles them as a ZIP ready to upload to
// wowpro.co.il (WOW Professional).
//
// ── What WOW Pro actually expects (verified from their FAQ) ──
// Spec source: https://www.wowpro.co.il/p/ImportantToKnow
//
// File format: JPG ONLY. Color profile: sRGB. Resolution: 300 DPI.
// File naming: 001.jpg, 002.jpg, 003.jpg, … (sequential, 3-digit pad)
//              + cover.jpg (only if you're not picking a stock cover
//              from their catalog).
//
// Each numbered file is a SPREAD — two facing pages bonded as one
// rigid 700g layflat panel. NOT a single page. Submit at the
// finished spread size; WOW Pro may trim 3–4 mm from each side
// during cutting. **NO BLEED extension required.** Keep critical
// content ≥ 10 mm from the outer edges (our safe-area
// recommendation — WOW doesn't publish one).
//
// Pages: minimum 24, maximum 70 — counted as single SIDES. So
// 24 pages = 12 spreads = 12 numbered files; 70 pages = 35 spreads
// = 35 files. The selected page count on WOW Pro must exactly
// match the number of files uploaded.
//
// Cover: `cover.jpg` only needed for the "full image" or "window"
// cover types. For fabric / material / UV-text / emboss covers
// (the default), you skip the file and select the cover style on
// WOW Pro instead. When a cover file IS needed, WOW Pro treats it
// as a single spread at the album's spread dimensions — they
// handle the spine internally. We do NOT compute a spine width.
//
// All output is JPG, sRGB, 300 dpi, q ≥ 0.92.
//
// ── 6 album sizes available on WOW Pro ──
//
//   Squares     Spread        Pixels @ 300 DPI
//   ─────────   ───────       ──────────────
//   20×40       40×20 cm      4724 × 2362
//   25×50       50×25 cm      5906 × 2953
//   30×60       60×30 cm      7087 × 3543
//   40×80 XXL   80×40 cm      9449 × 4724
//
//   Horizontals
//   20×54       54×20 cm      6378 × 2362
//   30×80       80×30 cm      9449 × 3543

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

// ── Print math helpers ────────────────────────────────────────────
const DPI = 300
const MM_PER_INCH = 25.4
const mmToPx = mm => Math.round((mm / MM_PER_INCH) * DPI)
const cmToPx = cm => mmToPx(cm * 10)

// WOW Pro doesn't ask for a bleed extension — you submit at the
// finished spread size and they may trim 3–4 mm from each side
// during cutting. Our SAFE_INSET keeps important content (text,
// faces) away from the cut line. 10 mm is our own recommendation —
// WOW doesn't publish a number.
const TRIM_TOLERANCE_MM = 4   // max edge WOW may trim during cutting
const SAFE_INSET_MM = 10      // recommended distance from outer edges

// ── Product presets ────────────────────────────────────────────────
// Six album sizes verified from wowpro.co.il/products/1 and the
// configurator dropdown. All are Silver Halide layflat books —
// WOW Pro doesn't sell a singles/perfect-bound product. Spread
// dims are submitted exactly as defined; pixel dims are pure
// cm→px at 300 DPI, NO bleed extension.
const PRODUCT_PRESETS = {
    '20x40_layflat': {
        label: 'ריבועי 20×40 (סגור 20×20)',
        spreadCm: { w: 40, h: 20 },
        pageCm:   { w: 20, h: 20 },
        // Default = 12 spreads = 24 pages (WOW Pro minimum).
        defaultSpreadCount: 12,
    },
    '25x50_layflat': {
        label: 'ריבועי 25×50 (סגור 25×25)',
        spreadCm: { w: 50, h: 25 },
        pageCm:   { w: 25, h: 25 },
        defaultSpreadCount: 12,
    },
    '30x60_layflat': {
        label: 'ריבועי 30×60 (סגור 30×30)',
        spreadCm: { w: 60, h: 30 },
        pageCm:   { w: 30, h: 30 },
        defaultSpreadCount: 12,
    },
    '40x80_xxl_layflat': {
        label: 'ריבועי XXL 40×80 (סגור 40×40)',
        spreadCm: { w: 80, h: 40 },
        pageCm:   { w: 40, h: 40 },
        defaultSpreadCount: 12,
    },
    '20x54_horizontal_layflat': {
        label: 'שוכב 20×54 (סגור 27×20)',
        spreadCm: { w: 54, h: 20 },
        pageCm:   { w: 27, h: 20 },
        defaultSpreadCount: 12,
    },
    '30x80_horizontal_layflat': {
        label: 'שוכב 30×80 (סגור 40×30)',
        spreadCm: { w: 80, h: 30 },
        pageCm:   { w: 40, h: 30 },
        defaultSpreadCount: 12,
    },
}

// WOW Pro's hard limits — every product accepts 24 to 70 pages
// (FAQ: "אלבומי ה Silver מגיעים במינימום של 24 עמודים ועד
// למקסימום של 70 עמודים"). Pages = single sides, so spread count
// is half: 12 to 35.
const MIN_SPREADS = 12
const MAX_SPREADS = 35

// Build the print dimensions for a given preset. NO bleed, NO
// spine — the cover (when included) is rendered as a single
// spread at the album's spread dimensions, exactly like an
// interior file. WOW Pro handles the spine internally based on
// the page count selected on their site.
function computeDims(preset) {
    const spreadWcm = preset.spreadCm.w
    const spreadHcm = preset.spreadCm.h

    const spreadWpx = cmToPx(spreadWcm)
    const spreadHpx = cmToPx(spreadHcm)

    return {
        spread: { wPx: spreadWpx, hPx: spreadHpx, wCm: spreadWcm, hCm: spreadHcm },
        // Cover uses the same dimensions as a spread — that's the
        // shape WOW Pro asks for on the rare cover types that need
        // an upload (full-image or window). For fabric/material
        // covers no file is needed at all.
        cover:  { wPx: spreadWpx, hPx: spreadHpx, wCm: spreadWcm, hCm: spreadHcm },
    }
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
    const [spreadCount, setSpreadCount] = useState(PRODUCT_PRESETS['20x40_layflat'].defaultSpreadCount)
    // Cover defaults to OFF — most users will choose a ready-made
    // cover from WOW Pro's catalog. Opting in to generate is for the
    // user who wants a full custom cover.
    const [includeCover, setIncludeCover] = useState(false)
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [renderingPage, setRenderingPage] = useState(null)

    const stageRef = useRef(null)

    useEffect(() => {
        setSpreadCount(PRODUCT_PRESETS[productPreset].defaultSpreadCount)
    }, [productPreset])

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
    const dims = computeDims(preset)

    // Every spread holds 2 entries (right + left page in RTL).
    const slotsAvailable = spreadCount * 2
    const slotsNeeded = entries.length
    const willPad = slotsNeeded < slotsAvailable
    const willTrim = slotsNeeded > slotsAvailable

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

    const buildRenderList = () => {
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
        const total = (includeCover ? 1 : 0) + renderList.length
        setProgress({ done: 0, total, label: 'מתחיל...' })

        try {
            const JSZip = (await import('jszip')).default
            const zip = new JSZip()
            let stepIdx = 0

            // 1) Cover (optional)
            if (includeCover) {
                setProgress({ done: 0, total, label: 'מצלם כריכה...' })
                setRenderingPage({ kind: 'cover' })
                await new Promise(r => setTimeout(r, 150))
                const coverBlob = await captureCurrentStage(dims.cover.wPx, dims.cover.hPx)
                zip.file('cover.jpg', coverBlob)
                stepIdx++
                setProgress({ done: stepIdx, total, label: 'כריכה ✓' })
            }

            // 2) Spreads
            for (let i = 0; i < renderList.length; i++) {
                const item = renderList[i]
                const num = String(i + 1).padStart(3, '0')
                setProgress({ done: stepIdx, total, label: `מצלם spread ${num}...` })
                setRenderingPage(item)
                await new Promise(r => setTimeout(r, 120))
                const blob = await captureCurrentStage(dims.spread.wPx, dims.spread.hPx)
                zip.file(`${num}.jpg`, blob)
                stepIdx++
                setProgress({ done: stepIdx, total, label: `${num} ✓` })
            }

            // 3) Manifest
            const pageCount = spreadCount * 2
            const manifest = [
                `Wedding Tales — WOW Professional export`,
                `Wedding: ${wedding?.brideNameHe || wedding?.brideName || ''} ${wedding?.groomNameHe ? 'ו' + wedding.groomNameHe : (wedding?.groomName ? 'and ' + wedding.groomName : '')}`,
                `Generated: ${new Date().toISOString()}`,
                ``,
                `Product: ${preset.label}`,
                `Page count on WOW Pro: ${pageCount} pages (= ${spreadCount} spreads / files)`,
                `Spread dimensions: ${dims.spread.wCm} × ${dims.spread.hCm} cm = ${dims.spread.wPx} × ${dims.spread.hPx} px @ ${DPI} DPI`,
                includeCover
                    ? `Cover file: cover.jpg at the same dimensions (${dims.cover.wPx} × ${dims.cover.hPx} px). Only needed for full-image or window cover types on WOW Pro.`
                    : `Cover file: NOT included — pick a stock cover (fabric/material/UV text/emboss) from WOW Pro's catalog: https://www.wowpro.co.il/shops/covers_catalog`,
                ``,
                `File format: JPG, sRGB, ${DPI} DPI, q=0.92`,
                `Naming: ${includeCover ? 'cover.jpg + ' : ''}001.jpg, 002.jpg, ... ${String(renderList.length).padStart(3, '0')}.jpg`,
                ``,
                `Entries in book: ${entries.length} · Slots filled: ${Math.min(entries.length, slotsAvailable)} / ${slotsAvailable} (${slotsAvailable - Math.min(entries.length, slotsAvailable)} blank)`,
                ``,
                `Trim allowance: WOW Pro may cut up to ${TRIM_TOLERANCE_MM} mm from each side during finishing.`,
                `Recommended safe area: keep critical content (faces, text) at least ${SAFE_INSET_MM} mm from every outer edge.`,
                ``,
                `Upload at:    https://www.wowpro.co.il (choose product → upload designed files)`,
                `Cover catalog: https://www.wowpro.co.il/shops/covers_catalog`,
                `Spec source:   https://www.wowpro.co.il/p/ImportantToKnow`,
                ``,
                `IMPORTANT: the page count you select on WOW Pro's site must`,
                `match this export exactly — ${pageCount} pages (${spreadCount} files). Mismatched`,
                `uploads are rejected by their validator.`,
            ].join('\n')
            zip.file('README.txt', manifest)

            setProgress({ done: total, total, label: 'אורז ZIP...' })
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })

            const a = document.createElement('a')
            const url = URL.createObjectURL(zipBlob)
            const safeName = (wedding?.brideNameHe || wedding?.brideName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            a.href = url
            a.download = `wowpro-${safeName}-${productPreset}-${spreadCount}p${includeCover ? '+cover' : ''}.zip`
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

    const stageW = renderingPage?.kind === 'cover' ? dims.cover.wPx : dims.spread.wPx
    const stageH = renderingPage?.kind === 'cover' ? dims.cover.hPx : dims.spread.hPx

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
                            <p className='text-[12px] text-[#a89378] mt-0.5'>Silver Halide layflat · 6 גדלים · sRGB 300dpi</p>
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
                            spread = {dims.spread.wCm}×{dims.spread.hCm} ס&quot;מ = {dims.spread.wPx}×{dims.spread.hPx} px @ {DPI}dpi · ללא bleed
                        </p>
                    </div>

                    <div>
                        <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>
                            מספר עמודים ב-WOW Pro (24–70)
                        </label>
                        <div className='flex items-center gap-2'>
                            <input
                                type='number'
                                min={MIN_SPREADS * 2}
                                max={MAX_SPREADS * 2}
                                step='2'
                                value={spreadCount * 2}
                                onChange={e => {
                                    const pages = Math.max(MIN_SPREADS * 2, Math.min(MAX_SPREADS * 2, parseInt(e.target.value, 10) || MIN_SPREADS * 2))
                                    // Round to even page count → integer spread count.
                                    setSpreadCount(Math.round(pages / 2))
                                }}
                                disabled={running}
                                className='w-24 px-3 py-2 rounded-lg text-[14px] font-bold text-[#3d2e1a] outline-none text-center'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            />
                            <span className='text-[12px] text-[#7a6a52]'>
                                = {spreadCount} spreads ({spreadCount} קבצי JPG)
                            </span>
                        </div>
                        <p className='text-[11px] text-[#a89378] mt-1.5'>
                            בחר את אותו מספר עמודים ב-WOW Pro כשמזמינים. כל עמוד = צד אחד, כל spread = 2 עמודים = קובץ אחד.
                        </p>
                    </div>

                    {/* Cover toggle */}
                    <div className='rounded-lg p-3' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                        <label className='flex items-start gap-2.5 cursor-pointer'>
                            <input
                                type='checkbox'
                                checked={includeCover}
                                onChange={e => setIncludeCover(e.target.checked)}
                                disabled={running}
                                className='mt-1'
                                style={{ accentColor: '#aa8840' }}
                            />
                            <div className='flex-1'>
                                <p className='text-[12.5px] font-bold text-[#3d2e1a]'>כלול cover.jpg (לכריכה &quot;תמונה מלאה&quot; / &quot;חלון&quot; ב-WOW Pro)</p>
                                <p className='text-[11px] text-[#7a6a52] leading-relaxed mt-0.5'>
                                    {includeCover ? (
                                        <>
                                            יוצר קובץ <b>cover.jpg</b> בגודל <b>{dims.cover.wCm}×{dims.cover.hCm} ס&quot;מ</b> ({dims.cover.wPx}×{dims.cover.hPx} px) —
                                            אותן מידות בדיוק כמו spread פנים, כי WOW Pro לוקח את הקובץ כעטיפה אחת והם
                                            דואגים לחישוב השדרה לפי מספר העמודים שתבחר אצלם. רלוונטי רק לסוגי כריכה
                                            &quot;תמונה מלאה&quot; או &quot;חלון&quot;.
                                        </>
                                    ) : (
                                        <>
                                            <b>מומלץ למרבית האירועים:</b> השאר את ה-checkbox כבוי ובחר כריכה
                                            מהקטלוג של WOW Pro
                                            (<a href='https://www.wowpro.co.il/shops/covers_catalog' target='_blank' rel='noreferrer' className='underline' style={{ color: '#aa8840' }}>covers_catalog</a>) —
                                            בד / חומר / טקסט UV / תבליט. שום סיכון של מידות לא נכונות.
                                        </>
                                    )}
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Capacity preview */}
                    <div className='rounded-lg px-3 py-2.5 flex items-start gap-2' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                        <Info size={14} className='flex-shrink-0 mt-0.5' style={{ color: '#aa8840' }} />
                        <div className='flex-1 text-[12px] text-[#3d2e1a] leading-relaxed'>
                            יש לך <b>{entries.length}</b> ברכות. ההגדרה הנוכחית מכילה <b>{slotsAvailable}</b> מקומות ({spreadCount} spreads × 2).
                            {willPad && <span className='text-[#7a6a52]'> ‒ יוסיף {slotsAvailable - slotsNeeded} עמודים ריקים.</span>}
                            {willTrim && <span className='text-[#b32424]'> ‒ ⚠️ {slotsNeeded - slotsAvailable} ברכות לא ייכנסו! העלה את מספר העמודים.</span>}
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
                            <FileArchive size={16} /> ייצא ZIP של {spreadCount + (includeCover ? 1 : 0)} קבצים
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
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>הערות חשובות (מאומת מול ה-FAQ של WOW Pro)</p>
                    <ul className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-disc pr-5'>
                        <li>כל spread = {dims.spread.wCm}×{dims.spread.hCm} ס&quot;מ = {dims.spread.wPx}×{dims.spread.hPx} px @ 300dpi. <b>ללא bleed</b> — WOW Pro מקבלים בגודל הסופי וחותכים עד {TRIM_TOLERANCE_MM} מ&quot;מ בכל צד.</li>
                        <li>תוכן חשוב (פנים, טקסט) שמור לפחות <b>{SAFE_INSET_MM} מ&quot;מ מהקצוות</b>.</li>
                        <li>ערך ראשון נכנס לעמוד הימני של ה-spread, ערך שני לעמוד השמאלי (סדר קריאה עברי).</li>
                        <li>קבצים: JPG בלבד, sRGB, 300 DPI, איכות 0.92. שמות: <code>001.jpg, 002.jpg, ...</code> + <code>cover.jpg</code> אופציונלי.</li>
                        <li>טווח עמודים אצל WOW Pro: <b>24 עד 70 עמודים</b> (= 12 עד 35 spreads). מספר העמודים שתבחר אצלם חייב להתאים בדיוק למספר הקבצים בזיפ.</li>
                        <li>השדרה (spine) של הכריכה הקשה מטופלת אוטומטית ב-WOW Pro לפי מספר העמודים שתבחר — קובץ ה-cover.jpg הוא spread יחיד באותו גודל של עמוד פנים.</li>
                        <li>העלאה: <a href='https://www.wowpro.co.il' target='_blank' rel='noreferrer' className='underline' style={{ color: '#aa8840' }}>wowpro.co.il</a> (דרך מחשב בלבד — מובייל לא נתמך). מקור: <a href='https://www.wowpro.co.il/p/ImportantToKnow' target='_blank' rel='noreferrer' className='underline' style={{ color: '#aa8840' }}>חשוב לדעת</a>.</li>
                    </ul>
                </div>
            </div>

            {/* Hidden capture stage. Sized exactly to whatever's
                currently being rendered. Positioned far offscreen but
                with real layout so html2canvas can measure it.
                RTL forced so Hebrew renders correctly. */}
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
                    <CoverSpread
                        wedding={wedding}
                        coverDesign={coverDesign}
                        dims={dims}
                    />
                )}
                {renderingPage?.kind === 'spread' && (
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                        {/* Right page (first entry — RTL reading order) */}
                        <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                            {renderingPage.right ? (
                                <BookPageTemplate
                                    entry={renderingPage.right}
                                    styleSettings={styleSettings}
                                    scaledWidth={dims.spread.wPx / 2}
                                    scaledHeight={dims.spread.hPx}
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
                                    scaledWidth={dims.spread.wPx / 2}
                                    scaledHeight={dims.spread.hPx}
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

// ── Cover renderer ──────────────────────────────────────────────────
// WOW Pro treats the cover file as a single spread at the album's
// spread dimensions — they compute the actual physical wrap (front
// + spine + back) internally based on the page count selected on
// their site. So we render the front-cover design across the
// entire spread, exactly the way a /viewer cover renders. Hebrew
// reading order means the binding will end up on the right when
// printed; WOW Pro handles that based on the language setting in
// the order form.
function CoverSpread({ wedding, coverDesign, dims }) {
    return (
        <div style={{ width: '100%', height: '100%' }}>
            <BookCoverTemplate
                wedding={wedding}
                styleSettings={coverDesign}
                scaledWidth={dims.cover.wPx}
                scaledHeight={dims.cover.hPx}
            />
        </div>
    )
}

// Blank page placeholder for padded slots.
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
    )
}

// Blank page placeholder for padded slots.
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
