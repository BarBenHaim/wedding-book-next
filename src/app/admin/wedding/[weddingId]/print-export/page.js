'use client'

// /admin/wedding/[weddingId]/print-export
//
// Super-admin tool that renders every book page (cover + N entries)
// to a JPG at print resolution and bundles them as a ZIP ready to
// upload to wowpro.co.il (WOW Professional).
//
// File-naming contract — quoted from wowpro.co.il/p/ImportantToKnow:
//   "File names should be numbered sequentially, e.g. 001, 002.
//    The cover file should be saved under the name `cover`."
//
// So the ZIP we produce contains:
//   cover.jpg         ← rendered FrontCover (2362×2362 px @ 300dpi)
//   001.jpg, 002.jpg, ..., NNN.jpg  ← one JPG per entry, same dims
//
// Why client-side rendering (html2canvas + JSZip) instead of
// server-side Puppeteer:
//   1. Reuses the EXACT same React components the digital book
//      already renders — BookCoverTemplate + BookPageTemplate — so
//      what the couple sees in /book/[token] is what gets printed.
//      No "second renderer" to keep in sync.
//   2. Avoids the 50 MB Vercel serverless bundle ceiling that
//      Puppeteer + Chromium blow past.
//   3. Photos are already in the browser's cache from the digital
//      book / admin preview, so a 60-page export takes ~30-60s
//      total, which is acceptable for a once-per-wedding action.
//
// Notes / caveats:
//   • html2canvas can't capture CSS filters and a few exotic
//     properties perfectly. We render with `useCORS: true` so
//     Firebase Storage photos work, and we deliberately render
//     into a hidden 2362×2362 div so the captured pixel count is
//     exactly 300 DPI for a 20×20 cm page. NO downscaling, NO
//     upscaling.
//   • Cover is a special case — has no `entry`; uses BookCoverTemplate.
//   • Photos load with originalUrl from Firebase Storage. We give
//     each page a 1.5s buffer after mount to let images decode
//     before capture.

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
    Printer, Lock, Download, CheckCircle2, Loader2, AlertTriangle,
    ArrowLeft, Image as ImageIcon, FileArchive,
} from 'lucide-react'

// ── Print dimensions ───────────────────────────────────────────────
// WOW Pro layflat 20×20 cm closed = single page is 20×20 cm at 300dpi.
// 20 cm = 7.874 inch × 300 dpi = 2362 px (rounded).
// We expose a dropdown so the super-admin can swap to 25×25 or 30×30
// without changing code.
const PAGE_PRESETS = {
    '20x20': { label: '20×20 ס"מ (קלאסי)', cm: 20, px: 2362 },
    '25x25': { label: '25×25 ס"מ', cm: 25, px: 2953 },
    '30x30': { label: '30×30 ס"מ', cm: 30, px: 3543 },
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
    const [loadStatus, setLoadStatus] = useState('loading') // loading | ready | error
    const [pagePreset, setPagePreset] = useState('20x20')
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
    const [done, setDone] = useState(false)
    const [error, setError] = useState('')

    // The hidden capture stage — every page renders into this node
    // one at a time at native print resolution. Hidden via position
    // fixed + offscreen left, NOT display:none, because html2canvas
    // needs real layout to measure.
    const stageRef = useRef(null)
    const [renderingPage, setRenderingPage] = useState(null) // { kind: 'cover' | 'page', entry?, index? }

    // ── Load wedding + entries on mount ────────────────────────────
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

    // Derived style — same priority as the digital book: owner's
    // bookDesign first, then bookDesign.designSettings (legacy), then
    // defaultStyle. We merge over defaultStyle so missing fields fall
    // back gracefully (matches BookPageTemplate's `??` expectations).
    const styleSettings = (() => {
        const fromWedding = wedding?.bookDesign || wedding?.book?.designSettings || {}
        return { ...defaultStyle, ...fromWedding }
    })()

    const coverDesign = (() => {
        const c = wedding?.coverDesign || {}
        return { ...defaultStyle, ...c }
    })()

    // ── Render-and-capture for a single page ───────────────────────
    // Mounts <BookCoverTemplate /> or <BookPageTemplate /> into the
    // hidden stage, waits for images, snapshots with html2canvas,
    // returns a JPG Blob. The component unmounts when renderingPage
    // changes so each capture starts from a clean slate.
    const captureCurrentStage = useCallback(async (px) => {
        if (!stageRef.current) throw new Error('stage missing')

        // Wait for all <img> in the stage to load. html2canvas would
        // otherwise capture before photos decode and we'd get blank
        // image regions.
        const imgs = stageRef.current.querySelectorAll('img')
        await Promise.all(Array.from(imgs).map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve()
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true })
                img.addEventListener('error', resolve, { once: true })
                // Hard cap: don't hang forever on a single broken image
                setTimeout(resolve, 8000)
            })
        }))
        // Small extra beat to let CSS layout settle after image
        // decodes (Tailwind utility class transitions etc.)
        await new Promise(r => setTimeout(r, 250))

        // Dynamic import — keep the html2canvas chunk out of the
        // main admin bundle. It only loads when the user actually
        // exports.
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(stageRef.current, {
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            scale: 1, // stage already sized to native pixel target
            width: px,
            height: px,
            logging: false,
            // Allow the offscreen-positioned stage to capture properly
            x: 0, y: 0,
        })

        return await new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.92)
        })
    }, [])

    const handleExport = async () => {
        if (running) return
        setRunning(true)
        setDone(false)
        setError('')
        const px = PAGE_PRESETS[pagePreset].px
        const cm = PAGE_PRESETS[pagePreset].cm
        const total = 1 + entries.length // cover + N pages
        setProgress({ done: 0, total, label: 'מתחיל...' })

        try {
            const JSZip = (await import('jszip')).default
            const zip = new JSZip()

            // 1) Cover
            setProgress({ done: 0, total, label: 'מצלם כריכה...' })
            setRenderingPage({ kind: 'cover' })
            // Wait for the rendering pass — React state → effect → paint
            await new Promise(r => setTimeout(r, 80))
            const coverBlob = await captureCurrentStage(px)
            zip.file('cover.jpg', coverBlob)
            setProgress({ done: 1, total, label: 'כריכה הוכנה ✓' })

            // 2) Pages
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i]
                const num = String(i + 1).padStart(3, '0')
                setProgress({ done: i + 1, total, label: `מצלם עמוד ${num}...` })
                setRenderingPage({ kind: 'page', entry, index: i })
                await new Promise(r => setTimeout(r, 80))
                const blob = await captureCurrentStage(px)
                zip.file(`${num}.jpg`, blob)
                setProgress({ done: i + 2, total, label: `עמוד ${num} הוכן ✓` })
            }

            // 3) Manifest — handy notes for the photographer, ignored
            //    by WOW Pro upload but kept in the ZIP for traceability.
            const manifest = [
                `Wedding Tales — WOW Professional export`,
                `Wedding: ${wedding?.brideNameHe || wedding?.brideName || ''} ${wedding?.groomNameHe ? 'ו' + wedding.groomNameHe : (wedding?.groomName ? 'and ' + wedding.groomName : '')}`,
                `Generated: ${new Date().toISOString()}`,
                `Page size: ${cm}×${cm} cm @ 300dpi (${px}×${px} px)`,
                `Total files: ${total} (cover.jpg + ${entries.length} pages)`,
                ``,
                `Upload to: https://www.wowpro.co.il/dashboard`,
                `Naming convention reference: https://www.wowpro.co.il/p/ImportantToKnow`,
            ].join('\n')
            zip.file('README.txt', manifest)

            setProgress({ done: total, total, label: 'אורז ZIP...' })
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })

            // Trigger download
            const a = document.createElement('a')
            const url = URL.createObjectURL(zipBlob)
            const safeName = (wedding?.brideNameHe || wedding?.brideName || weddingId).replace(/[^a-zA-Z0-9א-ת_-]+/g, '_')
            a.href = url
            a.download = `wowpro-${safeName}-${pagePreset}.zip`
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

    const px = PAGE_PRESETS[pagePreset].px

    if (loadStatus === 'loading') {
        return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען חתונה...</div>
    }
    if (loadStatus === 'error') {
        return <div className='flex h-screen flex-col items-center justify-center gap-2 text-[#b32424]'>
            <AlertTriangle size={28} />
            <p>{error}</p>
        </div>
    }

    const weddingTitle = (() => {
        const b = wedding?.brideNameHe || wedding?.brideName || ''
        const g = wedding?.groomNameHe || wedding?.groomName || ''
        const c = wedding?.celebrantNameHe || wedding?.celebrantName || ''
        return (b && g) ? `${b} ו${g}` : (c || weddingId)
    })()

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
                            <p className='text-[12px] text-[#a89378] mt-0.5'>קבצי הדפסה מוכנים להעלאה ל-wowpro.co.il</p>
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
                <div className='rounded-2xl p-5 mb-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-3'>הגדרות הדפסה</p>
                    <label className='block text-[12px] font-semibold text-[#3d2e1a] mb-1'>גודל עמוד</label>
                    <select
                        value={pagePreset}
                        onChange={e => setPagePreset(e.target.value)}
                        disabled={running}
                        className='w-full px-3 py-2 rounded-lg text-[13px] font-semibold text-[#3d2e1a] outline-none mb-3'
                        style={{ background: '#fff', border: '1px solid #ead9b3' }}
                    >
                        {Object.entries(PAGE_PRESETS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label} — {v.px}×{v.px} px @ 300dpi</option>
                        ))}
                    </select>
                    <p className='text-[11px] text-[#a89378] leading-relaxed'>
                        כל JPG ירונדר באיכות הדפסה אמיתית (300dpi). זמן ייצוא משוער: {Math.ceil((entries.length + 1) * 0.8)} שניות.
                    </p>
                </div>

                {/* Action */}
                <div className='rounded-2xl p-5 mb-4' style={{ background: 'linear-gradient(135deg, rgba(170,136,64,0.10) 0%, rgba(170,136,64,0.02) 100%)', border: '1px solid rgba(212,184,103,0.35)' }}>
                    {!running && !done && (
                        <button
                            onClick={handleExport}
                            disabled={entries.length === 0}
                            className='w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-[14px] font-bold'
                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.45)', opacity: entries.length === 0 ? 0.5 : 1 }}
                        >
                            <FileArchive size={16} /> ייצא ZIP של {entries.length + 1} קבצים
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
                        <div className='flex items-center justify-center gap-2 py-2'>
                            <CheckCircle2 size={20} style={{ color: '#4f7a3e' }} />
                            <span className='text-[14px] font-bold text-[#3d2e1a]'>ה-ZIP ירד! העלה אותו ב-</span>
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

                {/* Help block */}
                <div className='rounded-2xl p-5' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.20)' }}>
                    <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-2'>איך זה עובד</p>
                    <ol className='text-[12.5px] text-[#3d2e1a] leading-relaxed space-y-1.5 list-decimal pr-5'>
                        <li>הכלי מרנדר כל עמוד בספר ברזולוציה של 300dpi (איכות הדפסה אמיתית).</li>
                        <li>הקבצים נשמרים בשמות <code className='font-mono text-[11px]'>cover.jpg, 001.jpg, 002.jpg...</code> — בדיוק כפי ש-WOW Pro מצפה.</li>
                        <li>פותחים את ZIP, גוררים את התמונות לעורך של WOW Pro לפי הסדר המספרי, והם ידאגו לכל השאר.</li>
                        <li>נוצר גם <code className='font-mono text-[11px]'>README.txt</code> עם פרטי החתונה לצורך תיעוד.</li>
                    </ol>
                </div>
            </div>

            {/* Hidden capture stage — exactly px×px so html2canvas
                captures at native print resolution with no scaling. */}
            <div
                ref={stageRef}
                aria-hidden
                style={{
                    position: 'fixed',
                    top: 0,
                    left: -99999, // offscreen but laid out
                    width: px,
                    height: px,
                    overflow: 'hidden',
                    backgroundColor: '#ffffff',
                    pointerEvents: 'none',
                    // Lock RTL so Hebrew renders correctly in capture
                    direction: 'rtl',
                }}
            >
                {renderingPage?.kind === 'cover' && wedding && (
                    <BookCoverTemplate
                        wedding={wedding}
                        styleSettings={coverDesign}
                        scaledWidth={px}
                        scaledHeight={px}
                    />
                )}
                {renderingPage?.kind === 'page' && renderingPage.entry && (
                    <BookPageTemplate
                        entry={renderingPage.entry}
                        styleSettings={styleSettings}
                        scaledWidth={px}
                        scaledHeight={px}
                    />
                )}
            </div>
        </div>
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
