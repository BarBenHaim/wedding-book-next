'use client'

// /admin/wedding/[weddingId]/albume-export
//
// Super-admin tool that renders every book page to a single 22×22 cm
// JPG at print resolution and bundles them as a ZIP, ready to upload
// to albume.co.il ("אלבומי") — the "כיס 22×22" (pocket) hard-cover album.
//
// ── Why this is SEPARATE from the WOW Pro exporter ──
// WOW Pro takes 2-up *spreads* (two pages bonded as one layflat panel).
// albume is different: the "כיס 22×22" product is a normal square album
// printed as SINGLE pages, and its order flow auto-arranges loose photos
// OR lets you drop one full-page image per page in the editor. So for a
// 1:1 reproduction of our designed book, each book page must be exported
// as ONE full 22×22 image — not a spread. Keeping this in its own page
// means we never touch the working WOW Pro wiring.
//
// ── What albume's order flow looks like (verified on albume.co.il) ──
// The whole order wizard (album name, design, size, cover type, page
// count) is a CLIENT-SIDE MODAL on a fixed URL (/express_album). None of
// those selections are reflected in the URL and there are no query
// params, so a "ready link" that pre-selects 22×22 + hard cover + name
// is NOT possible — albume exposes no deep-link or public API. The most
// we can automate is: open the wizard and copy the album name to the
// clipboard so the operator pastes it (then 2 clicks: כיס 22×22 + כריכה
// קשה), and upload these files.
//
// ── File spec ──
// 22×22 cm @ 300 DPI = 2598 × 2598 px, JPG, sRGB. No bleed extension —
// keep critical content (faces, text) ≥ 10 mm from the edges. Files are
// named 001.jpg, 002.jpg, … in book reading order; an optional
// cover.jpg (front cover, same 22×22) is included if requested.

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
import { expandBookPages } from '@/lib/bookPages'
import {
    Printer, Lock, CheckCircle2, Loader2, AlertTriangle,
    ArrowLeft, FileArchive, Info, ExternalLink, Check,
} from 'lucide-react'

// ── Print math ──────────────────────────────────────────────────────
// We render at 360 DPI (not the 300 minimum) so there is ~20% pixel
// headroom: when the operator stretches the image to full bleed in
// albume's editor — pushing it past the 22 cm trim — the effective
// resolution still stays comfortably above the 300 DPI print standard,
// and albume's per-photo quality indicator stays green. NOTE: the true
// ceiling is the guest photo itself (uploaded at max 2560 px on the
// long edge), so a 360-DPI page keeps the photo region near its native
// resolution while making the text / frame / decorations crisper.
const DPI = 360
const MM_PER_INCH = 25.4
const mmToPx = mm => Math.round((mm / MM_PER_INCH) * DPI)
const cmToPx = cm => mmToPx(cm * 10)

// albume "כיס" pocket album — fixed 22×22 cm square, single pages.
const PAGE_CM = 22
const PAGE_PX = cmToPx(PAGE_CM) // 3118 px @ 360 DPI (≈ 2598 px would be 300 DPI)
const JPEG_QUALITY = 0.95

// Bleed — render every page/cover slightly LARGER than the 22×22 trim so
// that when albume auto-places the image it covers the whole page edge to
// edge (into the dashed bleed area) with no cream gap. albume trims the
// overflow. Square in / square out, so no distortion.
const BLEED_MM = 4
const BLEED_PX = mmToPx(BLEED_MM)
const FULL_PX = PAGE_PX + 2 * BLEED_PX // full bled canvas, square

const SAFE_INSET_MM = 10        // keep faces/text this far from edges
const ALBUME_URL = 'https://www.albume.co.il/express_album'

// albume "בצ'יק" express default is 24 pages; you can add more in the
// editor. We let the operator pick 24–100 single pages.
const MIN_PAGES = 24
const MAX_PAGES = 100

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

function AlbumeExportContent() {
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
                // Default to enough pages to hold every blessing (rounded
                // up to the 24 minimum), so the common case is one click.
                // Account for smart auto-split (a long blessing becomes 2 pages).
                const _bd = wSnap.data()?.bookDesign || wSnap.data()?.book?.designSettings || {}
                const _needed = expandBookPages(list, { autoSplit: _bd.autoSplit, splitThreshold: _bd.splitThreshold }).length
                setPageCount(Math.max(MIN_PAGES, Math.min(MAX_PAGES, _needed)))
                setLoadStatus('ready')
            } catch (err) {
                console.error('[albume-export] load failed', err)
                if (!cancelled) { setLoadStatus('error'); setError('שגיאה בטעינת האירוע') }
            }
        })()
        return () => { cancelled = true }
    }, [weddingId])

    const styleSettings = (() => {
        const fromWedding = wedding?.bookDesign || wedding?.book?.designSettings || {}
        return { ...defaultStyle, ...fromWedding }
    })()
    // Cover design — mirror the /viewer exactly: coverDesign, else fall back
    // to bookDesign, merged over defaults, with the event locale injected so
    // BookCoverTemplate builds the title in the right language. This is the
    // SAME source the viewer's front cover uses, so the exported cover looks
    // identical to what the couple sees in the viewer.
    const coverDesign = (() => {
        const c = wedding?.coverDesign || wedding?.bookDesign || {}
        return { ...defaultStyle, ...c, locale: wedding?.locale || 'he' }
    })()

    // Expand entries into the actual page sequence (smart auto-split honored
    // from the book design) — the print must match the displayed book.
    const bookPages = expandBookPages(entries, { autoSplit: styleSettings.autoSplit, splitThreshold: styleSettings.splitThreshold })
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

            // 1) Covers (optional) — front + back, full-bleed, same look as the viewer.
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

            // 2) Pages — one full-bleed 22×22 JPG per book page.
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

            // 3) Manifest
            const manifest = [
                `Wedding Tales — albume (אלבומי) export`,
                `Event: ${weddingTitle}`,
                `Suggested album name: ${albumName}`,
                `Generated: ${new Date().toISOString()}`,
                ``,
                `Product on albume:  כיס 22×22 (pocket) · hard cover (כריכה קשה)`,
                `Page dimensions:    22×22 cm trim + ${BLEED_MM}mm bleed = ${FULL_PX} × ${FULL_PX} px @ ${DPI} DPI`,
                `File format:        JPG, sRGB, ${DPI} DPI, q=${JPEG_QUALITY}`,
                `Files:              ${includeCover ? 'cover.jpg (front) + cover_back.jpg (back) + ' : ''}001.jpg … ${String(renderList.length).padStart(3, '0')}.jpg  (one image per page)`,
                `Note:               images include bleed — in albume just let it auto-fill; it covers edge to edge.`,
                ``,
                `Blessings in book:  ${entries.length} · Pages exported: ${pageCount} (${Math.max(0, pageCount - entries.length)} blank)`,
                `Safe area:          keep faces / text at least ${SAFE_INSET_MM} mm from every edge.`,
                ``,
                `HOW TO ORDER ON albume.co.il (no API / no pre-filled link exists):`,
                `  1. Open ${ALBUME_URL}  (button: "פתח albume + העתק שם")`,
                `  2. Paste the album name (already on your clipboard).`,
                `  3. Choose size: כיס 22×22.   Choose cover: כריכה קשה.`,
                `  4. Set page count to ${pageCount}, then upload these JPG files in order.`,
                `  5. In the editor, place ONE image per page, filling the page (no extra crop).`,
            ].join('\n')
            zip.file('README.txt', manifest)

            setProgress({ done: total, total, label: 'אורז ZIP...' })
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })

            const a = document.createElement('a')
            const url = URL.createObjectURL(zipBlob)
            const safeName = (wedding?.brideNameHe || wedding?.brideName || wedding?.celebrantNameHe || wedding?.celebrantName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            a.href = url
            a.download = `albume-${safeName}-22x22-${pageCount}p${includeCover ? '+cover' : ''}.zip`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 2000)

            setDone(true)
            setRenderingItem(null)
        } catch (err) {
            console.error('[albume-export] failed', err)
            setError('הייצוא נכשל: ' + (err?.message || 'שגיאה לא ידועה'))
        } finally {
            setRunning(false)
        }
    }

    const copyNameAndOpenAlbume = async () => {
        try {
            await navigator.clipboard.writeText(albumName)
            setCopied(true)
            setTimeout(() => setCopied(false), 2500)
        } catch {
            /* clipboard may be blocked — still open albume below */
        }
        window.open(ALBUME_URL, '_blank', 'noopener,noreferrer')
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
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>ייצוא ל-albume (כיס 22×22)</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>עמוד בודד · 22×22 ס&quot;מ · {PAGE_PX}×{PAGE_PX}px · sRGB {DPI}dpi</p>
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

                {/* Step 1: open albume + copy name */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>שלב 1 · פתיחת albume</p>
                    <button
                        onClick={copyNameAndOpenAlbume}
                        className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[14px] font-bold'
                        style={{ background: '#0e9f8e', color: '#fff', boxShadow: '0 10px 22px -10px rgba(14,159,142,0.5)' }}
                    >
                        {copied ? <Check size={16} /> : <ExternalLink size={16} />}
                        {copied ? 'השם הועתק! נפתח albume…' : 'פתח albume + העתק שם אלבום'}
                    </button>
                    <p className='text-[11.5px] text-[#7a6a52] leading-relaxed mt-2'>
                        נפתח <b>אלבום בצ&apos;יק</b> ב-albume, ושם האלבום (&quot;{albumName}&quot;) מועתק ללוח. הדבק אותו בשדה
                        &quot;שם האלבום&quot;, בחר <b>גודל: כיס 22×22</b>, <b>כריכה: קשה</b>, ו<b>{pageCount} עמודים</b>.
                        <br />
                        <span className='text-[#a89378]'>הערה: ל-albume אין קישור מוכן שבוחר את הכל מראש — האשף שלהם רץ בצד-לקוח ללא פרמטרים ב-URL, אז זה הקיצור המקסימלי האפשרי.</span>
                    </p>
                </div>

                {/* Step 2: export files */}
                <div className='rounded-2xl p-5 mb-4 space-y-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold'>שלב 2 · ייצוא קבצי העמודים</p>

                    <div>
                        <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>מספר עמודים ({MIN_PAGES}–{MAX_PAGES})</label>
                        <div className='flex items-center gap-2'>
                            <input
                                type='number'
                                min={MIN_PAGES}
                                max={MAX_PAGES}
                                step='1'
                                value={pageCount}
                                onChange={e => {
                                    const v = Math.max(MIN_PAGES, Math.min(MAX_PAGES, parseInt(e.target.value, 10) || MIN_PAGES))
                                    setPageCount(v)
                                }}
                                disabled={running}
                                className='w-24 px-3 py-2 rounded-lg text-[14px] font-bold text-[#3d2e1a] outline-none text-center'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            />
                            <span className='text-[12px] text-[#7a6a52]'>= {pageCount} קבצי JPG (עמוד אחד לכל קובץ)</span>
                        </div>
                        <p className='text-[11px] text-[#a89378] mt-1.5'>
                            כל עמוד = 22×22 ס&quot;מ + {BLEED_MM}מ&quot;מ bleed = {FULL_PX}×{FULL_PX}px @ {DPI}dpi · התמונות נחתכות אוטומטית וממלאות מקצה לקצה ב-albume. בחר את אותו מספר עמודים ב-albume.
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
                                <p className='text-[12.5px] font-bold text-[#3d2e1a]'>כלול כריכות (קדמית + אחורית)</p>
                                <p className='text-[11px] text-[#7a6a52] leading-relaxed mt-0.5'>
                                    יוצר <b>cover.jpg</b> (כריכה קדמית — בדיוק כמו ב-viewer) ו-<b>cover_back.jpg</b> (כריכה אחורית בעיצוב תואם), עם bleed כדי שימלאו מקצה לקצה. השאר דולק אם אתה רוצה שהמערכת תפיק גם את הכריכות.
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Capacity preview */}
                    <div className='rounded-lg px-3 py-2.5 flex items-start gap-2' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                        <Info size={14} className='flex-shrink-0 mt-0.5' style={{ color: '#aa8840' }} />
                        <div className='flex-1 text-[12px] text-[#3d2e1a] leading-relaxed'>
                            יש לך <b>{entries.length}</b> ברכות. ההגדרה הנוכחית: <b>{pageCount}</b> עמודים.
                            {willPad && <span className='text-[#7a6a52]'> ‒ יוסיף {pageCount - slotsNeeded} עמודים ריקים.</span>}
                            {willTrim && <span className='text-[#b32424]'> ‒ ⚠️ {slotsNeeded - pageCount} ברכות לא ייכנסו! העלה את מספר העמודים.</span>}
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
                            <span className='text-[14px] font-bold text-[#3d2e1a]'>ה-ZIP ירד! העלה את הקבצים ב-albume.</span>
                        </div>
                    )}
                    {error && (
                        <div className='mt-1 px-3 py-2 rounded-lg text-[12px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                            {error}
                        </div>
                    )}
                </div>

                <div className='rounded-2xl p-5' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.20)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>הערות</p>
                    <ul className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-disc pr-5'>
                        <li>כל עמוד = 22×22 ס&quot;מ = {PAGE_PX}×{PAGE_PX}px @ {DPI}dpi (מעל תקן 300dpi), JPG sRGB. שמור תוכן חשוב לפחות <b>{SAFE_INSET_MM} מ&quot;מ מהקצוות</b>.</li>
                        <li>ב-albume בחר <b>כיס 22×22</b> + <b>כריכה קשה</b>, והעלה את הקבצים לפי הסדר (001, 002, …). בעורך הצב תמונה אחת לכל עמוד שממלאת את העמוד.</li>
                        <li>ל-albume <b>אין API או קישור מוכן</b> — האשף רץ בצד-לקוח. הכפתור למעלה פותח את האשף ומעתיק את שם האלבום, וזה הקיצור המקסימלי האפשרי.</li>
                        <li>קובץ <code>README.txt</code> בתוך ה-ZIP מסכם את כל ההגדרות וההוראות.</li>
                    </ul>
                </div>
            </div>

            {/* Hidden capture stage — full bled 22×22 canvas (FULL_PX). */}
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
                {/* Back cover — clean full-bleed background from the cover
                    design (the floral / themed surface) without title or
                    photo, so it matches the front aesthetically. */}
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

export default function AlbumeExportPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <AlbumeExportContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
