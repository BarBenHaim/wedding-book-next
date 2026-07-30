'use client'

// /admin/wedding/[weddingId]/picabook-export
//
// Super-admin tool that renders every book page to a single 20×20 cm JPG at
// print resolution and bundles them as a ZIP, ready to drop into Picabook
// (picabook.co.il) — the square book ("ספר ריבועי", 20×20).
//
// ── Picabook's documented full-page workflow (from their site) ──
// Picabook is an online editor + a downloadable "Picabook Designer". Per their
// "full page" tip (picabook.co.il/HE-IL/tip_fullpage.asp) you CAN design each
// page in external software and drop it in as a full-page image:
//   • Prepare one JPG per page at the GROSS size = net + 2 mm bleed each side
//     (the 2 mm is trimmed at print).  Square net 20×20 → gross 204×204 mm.
//   • 200–300 DPI. We use 300 → 204 mm ≈ 2410 px.  JPG, sRGB only.
//   • In the editor pick a "עמוד מלא" (full page) layout and its FIRST option
//     (single image, H1V0), or use the photo wizard to drop them all in order.
// There is no public API / pre-filled link (the wizard is client-side), so the
// most we automate is opening Picabook + copying the album name to clipboard.
//
// ── Why SEPARATE from the albume / WOW Pro exporters ──
// Same reasoning as albume: this is a 1:1 single-page reproduction at a DIFFERENT
// trim size (20×20 vs albume's 22×22), so it lives in its own page and never
// touches the working albume / WOW wiring.
//
// ── File spec ──
// 20×20 cm net + 2 mm bleed = 2410 × 2410 px, JPG, sRGB, 300 DPI. Files named
// 001.jpg, 002.jpg, … in book reading order; optional cover.jpg + cover_back.jpg.

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
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { applyPresetClean } from '@/lib/bookDesignSchema'
import { expandBookPages } from '@/lib/bookPages'
import {
    Printer, Lock, CheckCircle2, Loader2, AlertTriangle,
    ArrowLeft, FileArchive, Info, ExternalLink, Check,
} from 'lucide-react'

// ── Print math (Picabook spec) ──────────────────────────────────────
// Picabook recommends 200–300 DPI and a 2 mm bleed each side that gets
// trimmed. We render at exactly 300 DPI (their print standard + the px
// figures in their own size table) so the per-photo quality indicator
// stays green without bloating files beyond what they print.
const DPI = 300
const MM_PER_INCH = 25.4
const mmToPx = mm => Math.round((mm / MM_PER_INCH) * DPI)
const cmToPx = cm => mmToPx(cm * 10)

// Square book — 20×20 cm net, single pages.
const PAGE_CM = 20
const PAGE_PX = cmToPx(PAGE_CM) // ≈ 2362 px @ 300 DPI (20 cm net)
const JPEG_QUALITY = 0.95

// Bleed — Picabook's documented full-page bleed is 2 mm each side (trimmed
// at print). Rendering into the bleed makes the image cover edge-to-edge with
// no cream gap. Square in / square out, so no distortion.
const BLEED_MM = 2
const BLEED_PX = mmToPx(BLEED_MM)
const FULL_PX = PAGE_PX + 2 * BLEED_PX // ≈ 2410 px, full bled square canvas

const SAFE_INSET_MM = 8          // keep faces/text this far from edges
const PICABOOK_URL = 'https://www.picabook.co.il/HE-IL/Albums.asp?type=0'

// Picabook albums are even-page from 24 up. We let the operator pick 24–140
// in steps of 2 so the count is always valid.
const MIN_PAGES = 24
const MAX_PAGES = 140

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

function PicabookExportContent() {
    const { weddingId } = useParams()
    const [wedding, setWedding] = useState(null)
    const [entries, setEntries] = useState([])
    const [loadStatus, setLoadStatus] = useState('loading')
    const [pageCount, setPageCount] = useState(MIN_PAGES)
    const [includeCover, setIncludeCover] = useState(true)
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')
    const [renderingItem, setRenderingItem] = useState(null)
    const [copied, setCopied] = useState(false)

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
                // Default to enough pages to hold every blessing (rounded up to
                // the even 24 minimum). Account for smart auto-split.
                const _bd = wSnap.data()?.bookDesign || wSnap.data()?.book?.designSettings || {}
                const _needed = expandBookPages(list, { autoSplit: _bd.autoSplit, splitThreshold: _bd.splitThreshold, entriesPerPage: _bd.entriesPerPage, photoLayout: _bd.photoLayout, padToSpread: true, spreadOffset: 1 }).length
                const _even = _needed % 2 === 0 ? _needed : _needed + 1
                setPageCount(Math.max(MIN_PAGES, Math.min(MAX_PAGES, _even)))
                setLoadStatus('ready')
            } catch (err) {
                console.error('[picabook-export] load failed', err)
                if (!cancelled) { setLoadStatus('error'); setError('שגיאה בטעינת האירוע') }
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    const styleSettings = (() => {
        const fromWedding = wedding?.bookDesign || wedding?.book?.designSettings || {}
        // Canonical fill — identical to the viewer/book resolution, so
        // the print export matches the on-screen book pixel-for-pixel.
        return applyPresetClean(fromWedding)
    })()
    // Cover design — mirror /viewer: coverDesign, else bookDesign, over defaults,
    // with the event locale so BookCoverTemplate builds the title correctly.
    const coverDesign = (() => {
        const c = wedding?.coverDesign || wedding?.bookDesign || {}
        return { ...defaultStyle, ...c, locale: wedding?.locale || 'he' }
    })()

    const bookPages = expandBookPages(entries, { autoSplit: styleSettings.autoSplit, splitThreshold: styleSettings.splitThreshold, entriesPerPage: styleSettings.entriesPerPage, photoLayout: styleSettings.photoLayout, padToSpread: true, spreadOffset: 1 })
    const slotsNeeded = bookPages.length
    const willPad = slotsNeeded < pageCount
    const willTrim = slotsNeeded > pageCount

    const weddingTitle = (() => {
        const b = wedding?.brideNameHe || wedding?.brideName || ''
        const g = wedding?.groomNameHe || wedding?.groomName || ''
        const c = wedding?.celebrantNameHe || wedding?.celebrantName || ''
        return (b && g) ? `${b} ו${g}` : (c || weddingId)
    })()
    const albumName = weddingTitle ? `ספר הברכות של ${weddingTitle}` : `ספר הברכות ${weddingId}`

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
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', JPEG_QUALITY)
        })
    }, [])

    const handleExport = async () => {
        if (running) return
        setRunning(true)
        setDone(false)
        setError('')

        const renderList = []
        for (let i = 0; i < pageCount; i++) {
            renderList.push({ kind: 'page', entry: bookPages[i] || null, index: i })
        }
        const total = (includeCover ? 2 : 0) + renderList.length
        setProgress({ done: 0, total, label: 'מתחיל...' })

        try {
            const JSZip = (await import('jszip')).default
            const zip = new JSZip()
            let stepIdx = 0

            if (includeCover) {
                setProgress({ done: stepIdx, total, label: 'מצלם כריכה קדמית...' })
                setRenderingItem({ kind: 'cover' })
                await new Promise(r => setTimeout(r, 200))
                zip.file('cover.jpg', await captureCurrentStage(FULL_PX, FULL_PX))
                stepIdx++

                setProgress({ done: stepIdx, total, label: 'מצלם כריכה אחורית...' })
                setRenderingItem({ kind: 'back' })
                await new Promise(r => setTimeout(r, 200))
                zip.file('cover_back.jpg', await captureCurrentStage(FULL_PX, FULL_PX))
                stepIdx++
                setProgress({ done: stepIdx, total, label: 'כריכות ✓' })
            }

            for (let i = 0; i < renderList.length; i++) {
                const num = String(i + 1).padStart(3, '0')
                setProgress({ done: stepIdx, total, label: `מצלם עמוד ${num}...` })
                setRenderingItem(renderList[i])
                await new Promise(r => setTimeout(r, 120))
                const blob = await captureCurrentStage(FULL_PX, FULL_PX)
                zip.file(`${num}.jpg`, blob)
                stepIdx++
                setProgress({ done: stepIdx, total, label: `${num} ✓` })
            }

            const manifest = [
                `Wedding Tales — Picabook export`,
                `Event: ${weddingTitle}`,
                `Suggested album name: ${albumName}`,
                `Generated: ${new Date().toISOString()}`,
                ``,
                `Product on Picabook:  ספר ריבועי (square book) 20×20 · hard cover`,
                `Page dimensions:      20×20 cm net + ${BLEED_MM}mm bleed = ${FULL_PX} × ${FULL_PX} px @ ${DPI} DPI`,
                `File format:          JPG, sRGB, ${DPI} DPI, q=${JPEG_QUALITY}`,
                `Files:                ${includeCover ? 'cover.jpg (front) + cover_back.jpg (back) + ' : ''}001.jpg … ${String(renderList.length).padStart(3, '0')}.jpg  (one image per page)`,
                `Bleed note:           images include 2mm bleed each side — Picabook trims it; the page fills edge to edge.`,
                ``,
                `Blessings in book:    ${entries.length} · Pages exported: ${pageCount} (${Math.max(0, pageCount - slotsNeeded)} blank)`,
                `Safe area:            keep faces / text at least ${SAFE_INSET_MM} mm from every edge.`,
                ``,
                `HOW TO ORDER ON picabook.co.il:`,
                `  1. Open ${PICABOOK_URL}  (button: "פתח Picabook + העתק שם")`,
                `  2. Choose the square book 20×20 ("ספר ריבועי"), hard cover, ${pageCount} pages (even).`,
                `  3. In the editor add these JPGs to the photo gallery, then for each page pick a`,
                `     "עמוד מלא" (full page) layout — its FIRST option (single image, H1V0) — or use the`,
                `     photo wizard ("אשף סידור התמונות") to drop them all in order at once.`,
                `  4. Each image fills its page; the 2mm bleed is trimmed automatically.`,
                ``,
                `Cover note: Picabook's hard cover is a wraparound (front+spine+back). cover.jpg is a`,
                `square front-cover image — use it in a window cover, or design the wraparound cover in`,
                `Picabook directly. The interior pages (001…) are the exact book content.`,
            ].join('\n')
            zip.file('README.txt', manifest)

            setProgress({ done: total, total, label: 'אורז ZIP...' })
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })

            const a = document.createElement('a')
            const url = URL.createObjectURL(zipBlob)
            const safeName = (wedding?.brideNameHe || wedding?.brideName || wedding?.celebrantNameHe || wedding?.celebrantName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            a.href = url
            a.download = `picabook-${safeName}-20x20-${pageCount}p${includeCover ? '+cover' : ''}.zip`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 2000)

            setDone(true)
            setRenderingItem(null)
        } catch (err) {
            console.error('[picabook-export] failed', err)
            setError('הייצוא נכשל: ' + (err?.message || 'שגיאה לא ידועה'))
        } finally {
            setRunning(false)
        }
    }

    const copyNameAndOpenPicabook = async () => {
        try {
            await navigator.clipboard.writeText(albumName)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
        } catch {
            /* clipboard may be blocked — still open Picabook below */
        }
        window.open(PICABOOK_URL, '_blank', 'noopener,noreferrer')
    }

    if (loadStatus === 'loading') {
        return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען אירוע...</div>
    }
    if (loadStatus === 'error') {
        return <div className='flex h-screen flex-col items-center justify-center gap-2 text-[#b32424]'><AlertTriangle size={28} /><p>{error}</p></div>
    }

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[900px] mx-auto'>
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <Printer size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>ייצוא ל-Picabook (ספר ריבועי 20×20)</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>עמוד בודד · 20×20 ס&quot;מ + 2מ&quot;מ bleed · {FULL_PX}×{FULL_PX}px · sRGB {DPI}dpi</p>
                        </div>
                    </div>
                    <a href='/admin' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                        <ArrowLeft size={13} /> חזרה לאדמין
                    </a>
                </div>

                {/* Event card */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-1'>אירוע</p>
                    <p className='text-[18px] font-bold text-[#1a1410] mb-1'>{weddingTitle}</p>
                    <p className='text-[12px] text-[#7a6a52]'>{entries.length} ברכות בספר · ID: <code className='font-mono text-[11px]'>{weddingId}</code></p>
                </div>

                {/* Step 1: open Picabook + copy name */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>שלב 1 · פתיחת Picabook</p>
                    <button
                        onClick={copyNameAndOpenPicabook}
                        className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-bold'
                        style={{ background: '#0e9f8e', color: '#fff', boxShadow: '0 10px 22px -10px rgba(14,159,142,0.5)' }}
                    >
                        {copied ? <Check size={16} /> : <ExternalLink size={16} />}
                        {copied ? 'השם הועתק! נפתח Picabook…' : 'פתח Picabook + העתק שם אלבום'}
                    </button>
                    <p className='text-[11.5px] text-[#7a6a52] leading-relaxed mt-2'>
                        נפתח עורך האלבומים של Picabook, ושם האלבום (&quot;{albumName}&quot;) מועתק ללוח. בחר
                        <b> ספר ריבועי 20×20</b>, <b>כריכה קשה</b>, ו<b>{pageCount} עמודים</b> (מספר זוגי).
                        <br />
                        <span className='text-[#a89378]'>הערה: גם ל-Picabook אין קישור מוכן שבוחר הכל מראש — העורך רץ בצד-לקוח, אז זה הקיצור המקסימלי.</span>
                    </p>
                </div>

                {/* Step 2: export files */}
                <div className='rounded-2xl p-5 mb-4 space-y-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold'>שלב 2 · ייצוא קבצי העמודים</p>

                    <div>
                        <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>מספר עמודים ({MIN_PAGES}–{MAX_PAGES}, זוגי)</label>
                        <div className='flex items-center gap-2'>
                            <input
                                type='number'
                                min={MIN_PAGES}
                                max={MAX_PAGES}
                                step='2'
                                value={pageCount}
                                onChange={e => {
                                    let v = parseInt(e.target.value, 10) || MIN_PAGES
                                    if (v % 2 !== 0) v += 1
                                    v = Math.max(MIN_PAGES, Math.min(MAX_PAGES, v))
                                    setPageCount(v)
                                }}
                                disabled={running}
                                className='w-24 px-3 py-2 rounded-lg text-[14px] font-bold text-[#3d2e1a] outline-none text-center'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            />
                            <span className='text-[12px] text-[#7a6a52]'>= {pageCount} קבצי JPG (עמוד אחד לכל קובץ)</span>
                        </div>
                        <p className='text-[11px] text-[#a89378] mt-1.5'>
                            כל עמוד = 20×20 ס&quot;מ + {BLEED_MM}מ&quot;מ bleed = {FULL_PX}×{FULL_PX}px @ {DPI}dpi · ה-bleed נחתך אוטומטית וממלא מקצה לקצה. בחר את אותו מספר עמודים ב-Picabook.
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
                                <p className='text-[12.5px] font-bold text-[#3d2e1a]'>כלול תמונות כריכה (קדמית + אחורית)</p>
                                <p className='text-[11px] text-[#7a6a52] leading-relaxed mt-0.5'>
                                    יוצר <b>cover.jpg</b> (כריכה קדמית ריבועית, כמו ב-viewer) ו-<b>cover_back.jpg</b>. שים לב: הכריכה הקשה ב-Picabook היא <b>עוטפת</b> (קדמי+שדרה+אחורי) — אפשר להשתמש בתמונה הריבועית בכריכת חלון או לעצב את העטיפה ישירות ב-Picabook.
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Capacity preview */}
                    <div className='rounded-lg px-3 py-2.5 flex items-start gap-2' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                        <Info size={14} className='flex-shrink-0 mt-0.5' style={{ color: '#aa8840' }} />
                        <div className='flex-1 text-[12px] text-[#3d2e1a] leading-relaxed'>
                            יש לך <b>{entries.length}</b> ברכות (= <b>{slotsNeeded}</b> עמודים אחרי פיצול). ההגדרה הנוכחית: <b>{pageCount}</b> עמודים.
                            {willPad && <span className='text-[#7a6a52]'> ‒ יוסיף {pageCount - slotsNeeded} עמודים ריקים.</span>}
                            {willTrim && <span className='text-[#b32424]'> ‒ ⚠️ {slotsNeeded - pageCount} עמודים לא ייכנסו! העלה את מספר העמודים.</span>}
                            {!willPad && !willTrim && <span className='text-[#4f7a3e]'> ‒ ✓ התאמה מושלמת.</span>}
                        </div>
                    </div>

                    {!running && !done && (
                        <button
                            onClick={handleExport}
                            className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-[14px] font-bold'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.45)' }}
                        >
                            <FileArchive size={16} /> ייצא ZIP של {pageCount + (includeCover ? 2 : 0)} קבצים
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
                            <span className='text-[14px] font-bold text-[#3d2e1a]'>ה-ZIP ירד! העלה את הקבצים ב-Picabook.</span>
                        </div>
                    )}
                    {error && (
                        <div className='mt-1 px-3 py-2 rounded-lg text-[12px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className='rounded-2xl p-5' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.20)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>הערות (מפרט Picabook)</p>
                    <ul className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-disc pr-5'>
                        <li>כל עמוד = 20×20 ס&quot;מ נטו + 2מ&quot;מ bleed = {FULL_PX}×{FULL_PX}px @ {DPI}dpi, JPG בפרופיל <b>sRGB</b>. שמור תוכן חשוב לפחות <b>{SAFE_INSET_MM} מ&quot;מ מהקצוות</b>.</li>
                        <li>ב-Picabook בעורך, לכל עמוד בחר תבנית <b>&quot;עמוד מלא&quot;</b> ואת האפשרות הראשונה (תמונה אחת), או השתמש ב<b>אשף סידור התמונות</b> כדי לסדר הכל בבת אחת לפי הסדר.</li>
                        <li>מספר העמודים ב-Picabook הוא <b>זוגי</b> (מ-24 ומעלה). בחר את אותו מספר שבחרת כאן.</li>
                        <li>הכריכה הקשה ב-Picabook היא <b>עטיפה</b> (קדמי+שדרה+אחורי) — תמונת הכריכה הריבועית כאן מתאימה לכריכת חלון או כבסיס; אפשר לעצב את העטיפה המלאה ישירות ב-Picabook.</li>
                        <li>קובץ <code>README.txt</code> בתוך ה-ZIP מסכם את כל ההגדרות וההוראות.</li>
                    </ul>
                </div>
            </div>

            {/* Hidden capture stage — full bled 20×20 canvas (FULL_PX). */}
            <div
                ref={stageRef}
                aria-hidden
                style={{
                    position: 'fixed',
                    top: 0,
                    left: -99999,
                    width: FULL_PX,
                    height: FULL_PX,
                    overflow: 'hidden',
                    backgroundColor: '#ffffff',
                    pointerEvents: 'none',
                    direction: 'rtl',
                }}
            >
                {renderingItem?.kind === 'cover' && wedding && (
                    <BookCoverTemplate
                        fillImage
                        wedding={wedding}
                        styleSettings={coverDesign}
                        scaledWidth={FULL_PX}
                        scaledHeight={FULL_PX}
                    />
                )}
                {renderingItem?.kind === 'back' && (
                    <BookBackCoverTemplate scaledWidth={FULL_PX} scaledHeight={FULL_PX} />
                )}
                {renderingItem?.kind === 'page' && (
                    renderingItem.entry ? (
                        <BookPageTemplate
                            entry={renderingItem.entry}
                            styleSettings={styleSettings}
                            scaledWidth={FULL_PX}
                            scaledHeight={FULL_PX}
                        />
                    ) : (
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
                )}
            </div>
        </div>
    )
}

export default function PicabookExportPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <PicabookExportContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
