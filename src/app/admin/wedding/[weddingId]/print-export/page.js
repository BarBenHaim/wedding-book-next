'use client'

// /admin/wedding/[weddingId]/print-export
//
// Super-admin tool that renders every book page to a JPG at print
// resolution and bundles them as a ZIP ready to upload to
// wowpro.co.il (WOW Professional).
//
// ── What WOW Pro actually expects (verified from FAQ + research) ──
//
// File naming (quoted from wowpro.co.il/p/ImportantToKnow):
//   "File names should be numbered sequentially, e.g. 001, 002.
//    The cover file should be saved under the name `cover`."
//
// Each file is a SPREAD — two facing pages bonded as one rigid
// 700g leaf. NOT a single page. The Silver album spec: "every two
// pages are bonded to rigid 300g cardboard, resulting in 700g page
// thickness." 12 spreads = 24 visible pages.
//
// Inner-spread dimensions (40×20 cm layflat):
//   Trim:  4724 × 2362 px @ 300 dpi
//   Bleed: +5 mm all around → 4842 × 2480 px (recommended)
//   Safe area: keep important content ≥ 5 mm from outer edges,
//              ≥ 10 mm from the centre gutter.
//
// The cover (`cover.jpg`) is a FULL WRAP: front + spine + back, all
// in one file. The spine width depends on the page count (layflat
// spreads are thick — ~1.4 mm per spread is a safe estimate). WOW
// Pro doesn't publish exact wrap dimensions publicly; they live
// inside the photographer dashboard. So:
//   • Cover generation is OPTIONAL here. Default: skip the cover
//     and let the user pick a ready-made cover from WOW Pro's
//     catalog (covers_catalog) — simplest, no risk of wrong wrap.
//   • If the user opts in to "generate cover", we produce a
//     best-effort wrap with computed spine. The dashboard's exact
//     template should still be cross-checked.
//
// All output is JPG, sRGB, 300 dpi, q ≥ 0.92.

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

// Bleed safety margin recommended for WOW Pro. They cite a 3-4 mm
// possible trim — 5 mm is the safe industry default.
const BLEED_MM = 5

// Layflat spread thickness — used to estimate spine width on the
// cover wrap. Each printed spread is glued onto 300g cardboard ×2 =
// ~1.4 mm physical thickness per spread. This is a conservative
// estimate — WOW Pro's actual template (in the photographer
// dashboard) is the source of truth.
const SPINE_MM_PER_SPREAD = 1.4

// ── Product presets ────────────────────────────────────────────────
// Each preset defines the trim size of one spread (closed-page-width
// × open-height in cm). Inner-spread pixel dims include the 5 mm
// bleed all around. Cover wrap dims are computed dynamically because
// the spine width depends on the user's chosen spread count.
const PRODUCT_PRESETS = {
    '20x40_layflat': {
        label: '20×40 layflat (סגור 20×20)',
        spreadCm: { w: 40, h: 20 },    // open spread = 40×20 cm
        pageCm:   { w: 20, h: 20 },    // closed page = 20×20 cm
        defaultSpreadCount: 12,
    },
    '25x50_layflat': {
        label: '25×50 layflat (סגור 25×25)',
        spreadCm: { w: 50, h: 25 },
        pageCm:   { w: 25, h: 25 },
        defaultSpreadCount: 14,
    },
    '30x60_layflat': {
        label: '30×60 layflat (סגור 30×30)',
        spreadCm: { w: 60, h: 30 },
        pageCm:   { w: 30, h: 30 },
        defaultSpreadCount: 16,
    },
    '20x20_singles': {
        label: '20×20 עמודים בודדים (לא layflat)',
        spreadCm: { w: 20, h: 20 },
        pageCm:   { w: 20, h: 20 },
        defaultSpreadCount: 24,
        singleMode: true,
    },
}

// Build the print dimensions for a given preset + spread count.
// Returns { spread: {wPx,hPx,wCm,hCm}, cover: {wPx,hPx,spineMm} }
// — cover wPx grows with spine width.
function computeDims(preset, spreadCount) {
    const isSingle = !!preset.singleMode
    const spreadWcm = preset.spreadCm.w
    const spreadHcm = preset.spreadCm.h
    const pageWcm   = preset.pageCm.w
    const pageHcm   = preset.pageCm.h

    const spreadWpx = cmToPx(spreadWcm) + mmToPx(BLEED_MM) * 2
    const spreadHpx = cmToPx(spreadHcm) + mmToPx(BLEED_MM) * 2

    // Cover wrap = front + spine + back + bleed.
    // For single-page (non-layflat) products there's no real spine —
    // just front cover. For layflat we estimate spine from the
    // chosen spread count.
    const spineMm = isSingle ? 0 : SPINE_MM_PER_SPREAD * spreadCount
    const coverWcm = pageWcm * 2 + (spineMm / 10) // front + back + spine, in cm
    const coverHcm = pageHcm

    const coverWpx = cmToPx(coverWcm) + mmToPx(BLEED_MM) * 2
    const coverHpx = cmToPx(coverHcm) + mmToPx(BLEED_MM) * 2

    return {
        spread: { wPx: spreadWpx, hPx: spreadHpx, wCm: spreadWcm, hCm: spreadHcm, isSingle },
        cover:  { wPx: coverWpx, hPx: coverHpx, wCm: coverWcm.toFixed(1), hCm: coverHcm, spineMm },
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
    const isSingleMode = !!preset.singleMode
    const dims = computeDims(preset, spreadCount)

    const slotsAvailable = isSingleMode ? spreadCount : spreadCount * 2
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
        if (isSingleMode) {
            const out = []
            for (let i = 0; i < spreadCount; i++) {
                out.push({ kind: 'singlePage', entry: entries[i] || null, index: i })
            }
            return out
        }
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

            // 2) Spreads / Pages
            for (let i = 0; i < renderList.length; i++) {
                const item = renderList[i]
                const num = String(i + 1).padStart(3, '0')
                setProgress({ done: stepIdx, total, label: `מצלם ${isSingleMode ? 'עמוד' : 'spread'} ${num}...` })
                setRenderingPage(item)
                await new Promise(r => setTimeout(r, 120))
                const blob = await captureCurrentStage(dims.spread.wPx, dims.spread.hPx)
                zip.file(`${num}.jpg`, blob)
                stepIdx++
                setProgress({ done: stepIdx, total, label: `${num} ✓` })
            }

            // 3) Manifest
            const manifest = [
                `Wedding Tales — WOW Professional export`,
                `Wedding: ${wedding?.brideNameHe || wedding?.brideName || ''} ${wedding?.groomNameHe ? 'ו' + wedding.groomNameHe : (wedding?.groomName ? 'and ' + wedding.groomName : '')}`,
                `Generated: ${new Date().toISOString()}`,
                `Product: ${preset.label}`,
                `Layout: ${isSingleMode ? 'single page per file' : 'spread (2 entries per file)'}`,
                `Spread dimensions: ${dims.spread.wCm}×${dims.spread.hCm} cm + ${BLEED_MM} mm bleed = ${dims.spread.wPx}×${dims.spread.hPx} px @ ${DPI} dpi`,
                includeCover ? `Cover wrap: ${dims.cover.wCm}×${dims.cover.hCm} cm (incl. ${dims.cover.spineMm.toFixed(1)} mm spine, ${BLEED_MM} mm bleed) = ${dims.cover.wPx}×${dims.cover.hPx} px` : `Cover: not included — pick a ready-made cover from WOW Pro's catalog`,
                `Files: ${includeCover ? 'cover.jpg + ' : ''}${renderList.length} ${isSingleMode ? 'pages' : 'spreads'}`,
                `Entries in book: ${entries.length} · Slots filled: ${Math.min(entries.length, slotsAvailable)} / ${slotsAvailable}`,
                ``,
                `Color profile: sRGB. Quality: JPG q=0.92.`,
                `Safe area: keep critical content >= 5 mm from outer edges, >= 10 mm from centre gutter.`,
                ``,
                `Upload to: https://www.wowpro.co.il/dashboard`,
                `Spec source: https://www.wowpro.co.il/p/ImportantToKnow`,
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
                            <p className='text-[12px] text-[#a89378] mt-0.5'>spreads + bleed + כריכה אופציונלית</p>
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
                            spread = {dims.spread.wPx}×{dims.spread.hPx} px (כולל {BLEED_MM} מ&quot;מ bleed) @ {DPI}dpi
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
                                    : `${spreadCount} spreads = ${spreadCount * 2} עמודי תוכן`}
                            </span>
                        </div>
                        <p className='text-[11px] text-[#a89378] mt-1.5'>
                            חייב להתאים בדיוק לכמות הדפים של המוצר שהזמנת ב-WOW Pro (אחרת ההעלאה נדחית).
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
                                <p className='text-[12.5px] font-bold text-[#3d2e1a]'>כלול קובץ כריכה מלא (cover.jpg)</p>
                                <p className='text-[11px] text-[#7a6a52] leading-relaxed mt-0.5'>
                                    {includeCover ? (
                                        <>
                                            יוצר עטיפה מלאה: <b>{dims.cover.wCm}×{dims.cover.hCm} ס&quot;מ</b> ({dims.cover.wPx}×{dims.cover.hPx} px),
                                            כולל שדרה משוערת של <b>{dims.cover.spineMm.toFixed(1)} מ&quot;מ</b> ל-{spreadCount} spreads.
                                            <span className='block mt-1 text-[#b32424]'>⚠️ רוחב השדרה הוא הערכה — צריך לאמת מול תבנית WOW Pro לפני שמכניסים תוכן קריטי על השדרה.</span>
                                        </>
                                    ) : (
                                        <>
                                            <b>מומלץ:</b> השאר ללא כריכה, בחר עטיפה מוכנה מהקטלוג של WOW Pro
                                            (<a href='https://www.wowpro.co.il/shops/covers_catalog' target='_blank' rel='noreferrer' className='underline' style={{ color: '#aa8840' }}>covers_catalog</a>) —
                                            עור, בד, מתכת, חלון תמונה. בלי סיכון של מידות שגויות.
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
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>הערות חשובות</p>
                    <ul className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-disc pr-5'>
                        <li>כל spread = 40×20 ס&quot;מ עם {BLEED_MM} מ&quot;מ bleed לכל צד = {dims.spread.wPx}×{dims.spread.hPx} px @ 300dpi.</li>
                        <li>ערך ראשון נכנס לעמוד הימני של ה-spread, ערך שני לעמוד השמאלי (סדר קריאה עברי).</li>
                        <li>תוכן חשוב להחזיק לפחות 5 מ&quot;מ מהקצוות ו-10 מ&quot;מ מקו האמצע (gutter) של ה-spread.</li>
                        <li>קובץ הכריכה (אם מסומן) הוא <b>עטיפה מלאה</b> — קדמית + שדרה + אחורית. רוחב השדרה מחושב {SPINE_MM_PER_SPREAD} מ&quot;מ לכל spread (הערכה).</li>
                        <li><b>מספר הקבצים חייב להתאים בדיוק</b> למוצר ב-WOW Pro — אחרת ההעלאה נדחית.</li>
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
                    <CoverWrap
                        wedding={wedding}
                        coverDesign={coverDesign}
                        dims={dims}
                    />
                )}
                {renderingPage?.kind === 'singlePage' && (
                    <div style={{ width: '100%', height: '100%' }}>
                        {renderingPage.entry ? (
                            <BookPageTemplate
                                entry={renderingPage.entry}
                                styleSettings={styleSettings}
                                scaledWidth={dims.spread.wPx}
                                scaledHeight={dims.spread.hPx}
                            />
                        ) : (
                            <BlankPage styleSettings={styleSettings} />
                        )}
                    </div>
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

// ── Full-cover wrap renderer ────────────────────────────────────────
// Lays out the cover as [Front | Spine | Back] in RTL reading order.
// Front (BookCoverTemplate) goes on the RIGHT — that's the side the
// reader sees when the closed book is in front of them with the
// binding on the right (Hebrew convention).
// Spine in the middle. Back cover gets a quiet matching background
// — no text, no photos. Bleed is baked into the captured pixels by
// the parent stage sizing.
function CoverWrap({ wedding, coverDesign, dims }) {
    const totalW = dims.cover.wPx
    const totalH = dims.cover.hPx
    const spinePx = mmToPx(dims.cover.spineMm)
    const sidePx = Math.round((totalW - spinePx) / 2)

    // Same surface as the book pages — keeps the back cover visually
    // consistent with the inside, without putting names/photos there.
    const backSurface = {
        backgroundColor: coverDesign?.backgroundColor || '#fdfaf3',
        backgroundImage: coverDesign?.backgroundUrl ? `url(${coverDesign.backgroundUrl})` : 'none',
        backgroundRepeat: 'repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    }

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* RIGHT: Front cover (visible when book is closed, Hebrew RTL) */}
            <div style={{ width: sidePx, height: totalH, overflow: 'hidden' }}>
                <BookCoverTemplate
                    wedding={wedding}
                    styleSettings={coverDesign}
                    scaledWidth={sidePx}
                    scaledHeight={totalH}
                />
            </div>
            {/* MIDDLE: Spine — quiet, matches book surface */}
            <div style={{ width: spinePx, height: totalH, ...backSurface }} />
            {/* LEFT: Back cover */}
            <div style={{ width: sidePx, height: totalH, ...backSurface }} />
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
