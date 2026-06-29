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
import imageCompression from 'browser-image-compression'
import { Printer, Lock, CheckCircle2, Loader2, AlertTriangle, ArrowLeft, Download, Info, ImageIcon, X } from 'lucide-react'

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
// Trim-only sizes — used when a dedicated bleed-margin image is uploaded
// and we want to isolate the inner content from the 20mm wrap strip so the
// bleed image fills that strip instead.
const WRAP_PX = mmToPx(WRAP_MM)             // 20mm  ≈ 236
const INNER_PANEL_W = mmToPx(PANEL_MM)      // 196mm ≈ 2315
const TRIM_H = mmToPx(248 - 2 * WRAP_MM)    // 208mm ≈ 2457
const JPEG_QUALITY = 0.95

// Per-cover upload card. Empty state shows the upload button; filled
// state shows a thumbnail, cover/repeat mode toggle, and a remove button.
// Identical for front and back covers — driven entirely by props.
function CoverImageUploader({ label, image, mode, onPick, onModeChange, onRemove, inputRef, uploading }) {
    return (
        <div className='rounded-lg p-3' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
            <p className='text-[11px] font-bold text-[#3d2e1a] mb-2'>{label}</p>
            {!image ? (
                <>
                    <input
                        ref={inputRef}
                        type='file'
                        accept='image/jpeg,image/png,image/webp'
                        className='hidden'
                        onChange={e => onPick(e.target.files?.[0])}
                    />
                    <button
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading}
                        className='inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52] disabled:opacity-60'
                        style={{ background: '#fff', border: '1px dashed #d3b46a' }}
                    >
                        {uploading ? <Loader2 size={14} className='animate-spin' /> : <ImageIcon size={14} />}
                        {uploading ? 'מעלה…' : `העלה תמונה — ${label}`}
                    </button>
                </>
            ) : (
                <div className='flex items-center gap-3'>
                    <div
                        className='shrink-0 rounded-lg'
                        style={{
                            width: 72,
                            height: 80,
                            background: `#fff url(${image}) center/${mode === 'cover' ? 'cover' : 'auto'} ${mode === 'cover' ? 'no-repeat' : 'repeat'}`,
                            border: '1px solid #ead9b3',
                        }}
                    />
                    <div className='flex-1 min-w-0'>
                        <p className='text-[11px] text-[#7a6a52] mb-1.5'>תמונה החליפה את התבנית — תכסה את כל הפאנל כולל ה־bleed</p>
                        <div className='flex items-center gap-1.5 flex-wrap'>
                            {[
                                { k: 'cover', l: 'מילוי מלא' },
                                { k: 'repeat', l: 'טקסטורה חוזרת' },
                            ].map(o => (
                                <button
                                    key={o.k}
                                    onClick={() => onModeChange(o.k)}
                                    className='text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors'
                                    style={mode === o.k ? { background: '#AA8840', color: '#fff', borderColor: '#AA8840' } : { background: '#fff', color: '#7a6a52', borderColor: '#ead9b3' }}
                                >
                                    {o.l}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={onRemove}
                        className='shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#b32424]'
                        style={{ background: '#fff5f5', border: '1px solid #ffcdcd' }}
                        title='הסר תמונה וחזור לתבנית הכריכה'
                    >
                        <X size={12} /> הסר
                    </button>
                </div>
            )}
        </div>
    )
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
    const [spineColor, setSpineColor] = useState('#efe3cc') // middle spacer / spine fill color
    // Optional image backgrounds. Held as data: URLs so html2canvas
    // rasterises them without CORS, and so nothing is left behind in Firebase
    // Storage after this one-off export. Cover mode fills the panel; repeat
    // mode tiles a seamless texture. When set for a front/back cover the
    // image REPLACES the in-app cover template for that panel — the panel
    // container is already REGION_W × FULL_H (2551 × 2929 px), which is the
    // full bleed-to-bleed area, so the image extends into the wrap by design.
    const [spineImage, setSpineImage] = useState(null)
    const [spineImageMode, setSpineImageMode] = useState('cover') // 'cover' | 'repeat'
    const [frontCoverImage, setFrontCoverImage] = useState(null)
    const [frontCoverImageMode, setFrontCoverImageMode] = useState('cover')
    const [backCoverImage, setBackCoverImage] = useState(null)
    const [backCoverImageMode, setBackCoverImageMode] = useState('cover')
    // Optional image for the bleed-margin strip (20mm wrap on all 4 sides,
    // between trim and bleed). When set, the inner content shrinks to the
    // trim area (419×208 mm) and this image fills the surrounding strip.
    // When NOT set, the existing behavior is preserved (the cover artwork
    // bleeds into the wrap as before).
    const [bleedImage, setBleedImage] = useState(null)
    const [bleedImageMode, setBleedImageMode] = useState('cover')
    const [uploadingTarget, setUploadingTarget] = useState(null) // 'spine' | 'front' | 'back' | 'bleed' | null
    const spineFileRef = useRef(null)
    const frontFileRef = useRef(null)
    const backFileRef = useRef(null)
    const bleedFileRef = useRef(null)
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
                // Smart default for the spine color: match the cover's own
                // background when it set a real (non-white) colour, so the
                // spacer blends; otherwise keep the warm cream default.
                const d = wSnap.data() || {}
                const bg = (d.coverDesign || d.bookDesign || {}).backgroundColor
                if (bg && !/^#?f{3,6}$|white/i.test(String(bg).replace('#', '#'))) setSpineColor(bg)
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

    // Spine / middle spacer fill. If an image was uploaded it takes
    // precedence and is rendered either filling the spine (cover) or tiled
    // as a seamless texture (repeat). The chosen colour sits underneath so
    // any transparency in the texture lands on the operator's surface.
    const spineStyle = spineImage
        ? { ...imageBgStyle(spineImage, spineImageMode), backgroundColor: spineColor }
        : { backgroundColor: spineColor }

    // Shared upload pipeline. Compresses (phone photos can hit 6MB+, which
    // would bloat the data URL fed to html2canvas) and resolves to a data:
    // URL. maxWidthOrHeight of 2800 keeps a noticeable safety margin over
    // the cover region (2551 × 2929 px) without storing pointless detail.
    async function compressToDataUrl(file) {
        const compressed = await imageCompression(file, {
            maxSizeMB: 3,
            maxWidthOrHeight: 2800,
            initialQuality: 0.9,
            useWebWorker: true,
        })
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(compressed)
        })
    }

    async function handleImagePick(target, file, fileRef) {
        if (!file) return
        setUploadingTarget(target)
        try {
            const dataUrl = await compressToDataUrl(file)
            if (target === 'spine') setSpineImage(dataUrl)
            else if (target === 'front') setFrontCoverImage(dataUrl)
            else if (target === 'back') setBackCoverImage(dataUrl)
            else if (target === 'bleed') setBleedImage(dataUrl)
        } catch (err) {
            console.error(`[cover-print] ${target} image upload failed`, err)
            alert('שגיאה בהעלאת התמונה')
        } finally {
            setUploadingTarget(null)
            if (fileRef?.current) fileRef.current.value = ''
        }
    }

    function handleRemoveImage(target) {
        if (target === 'spine') { setSpineImage(null); setSpineImageMode('cover') }
        else if (target === 'front') { setFrontCoverImage(null); setFrontCoverImageMode('cover') }
        else if (target === 'back') { setBackCoverImage(null); setBackCoverImageMode('cover') }
        else if (target === 'bleed') { setBleedImage(null); setBleedImageMode('cover') }
    }

    // Helper: build the CSS for an image-as-background panel.
    function imageBgStyle(url, mode) {
        return {
            backgroundImage: `url(${url})`,
            backgroundSize: mode === 'cover' ? 'cover' : 'auto',
            backgroundRepeat: mode === 'cover' ? 'no-repeat' : 'repeat',
            backgroundPosition: 'center',
            backgroundColor: '#ffffff',
        }
    }

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

    // Panel + stage sizing depends on whether a bleed-margin image was
    // uploaded. With bleed image: inner content shrinks to trim area
    // (INNER_PANEL_W × TRIM_H) and the surrounding 20mm strip reveals
    // the bleed image. Without: legacy behavior — each side panel
    // includes its outer wrap so the cover artwork bleeds to the edge.
    const panelW = bleedImage ? INNER_PANEL_W : REGION_W
    const panelH = bleedImage ? TRIM_H : FULL_H

    const front = (
        <div key='front' style={{ width: panelW, height: panelH, flexShrink: 0, ...(frontCoverImage ? imageBgStyle(frontCoverImage, frontCoverImageMode) : null) }}>
            {!frontCoverImage && (
                <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={panelW} scaledHeight={panelH} />
            )}
        </div>
    )
    const spine = <div key='spine' style={{ width: SPINE_W, height: panelH, flexShrink: 0, ...spineStyle }} />
    const back = (
        <div key='back' style={{ width: panelW, height: panelH, flexShrink: 0, ...(backCoverImage ? imageBgStyle(backCoverImage, backCoverImageMode) : null) }}>
            {!backCoverImage && (
                <BookBackCoverTemplate scaledWidth={panelW} scaledHeight={panelH} />
            )}
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
                        <div style={{ width: '100%', aspectRatio: `${FULL_W} / ${FULL_H}`, position: 'relative', ...(bleedImage ? imageBgStyle(bleedImage, bleedImageMode) : null), backgroundColor: bleedImage ? undefined : 'transparent' }}>
                            <div
                                style={
                                    bleedImage
                                        // Inset by WRAP_PX in % terms so the bleed strip stays visible.
                                        ? { position: 'absolute', top: `${(WRAP_PX / FULL_H) * 100}%`, bottom: `${(WRAP_PX / FULL_H) * 100}%`, left: `${(WRAP_PX / FULL_W) * 100}%`, right: `${(WRAP_PX / FULL_W) * 100}%`, display: 'flex' }
                                        : { width: '100%', height: '100%', display: 'flex' }
                                }
                            >
                                <div style={{ flex: `${panelW}`, ...((frontSide === 'left' ? frontCoverImage : backCoverImage) ? imageBgStyle(frontSide === 'left' ? frontCoverImage : backCoverImage, frontSide === 'left' ? frontCoverImageMode : backCoverImageMode) : null) }}>
                                    <div style={{ width: '100%', height: '100%' }}>
                                        {frontSide === 'left'
                                            ? (!frontCoverImage && <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={520} scaledHeight={566} />)
                                            : (!backCoverImage && <BookBackCoverTemplate scaledWidth={520} scaledHeight={566} />)}
                                    </div>
                                </div>
                                <div style={{ flex: `${SPINE_W}`, ...spineStyle }} />
                                <div style={{ flex: `${panelW}`, ...((frontSide === 'left' ? backCoverImage : frontCoverImage) ? imageBgStyle(frontSide === 'left' ? backCoverImage : frontCoverImage, frontSide === 'left' ? backCoverImageMode : frontCoverImageMode) : null) }}>
                                    <div style={{ width: '100%', height: '100%' }}>
                                        {frontSide === 'left'
                                            ? (!backCoverImage && <BookBackCoverTemplate scaledWidth={520} scaledHeight={566} />)
                                            : (!frontCoverImage && <BookCoverTemplate fillImage wedding={wedding} styleSettings={coverDesign} scaledWidth={520} scaledHeight={566} />)}
                                    </div>
                                </div>
                            </div>
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
                    {/* Bleed-margin background image. Spans the entire export
                        canvas; inner trim content sits inset by WRAP_PX so the
                        20mm strip around it reveals the image. Use this when
                        you want a separate frame/border that gets trimmed off
                        but prevents white edges. */}
                    <div className='mt-4 pt-3' style={{ borderTop: '1px solid #f0e8d4' }}>
                        <p className='text-[12px] font-bold text-[#3d2e1a] mb-2'>תמונת רקע לשוליים (Bleed)</p>
                        <p className='text-[11px] text-[#a89378] leading-relaxed mb-3'>
                            התמונה פרוסה על כל הקנבס <span className='font-mono'>{FULL_W}×{FULL_H}</span> פיקסלים @ {DPI}dpi (459×248 מ&quot;מ). התוכן הפנימי (חזית · שדרה · גב) מצטמצם לאזור ה־trim, והשוליים <span className='font-mono'>{WRAP_MM}</span> מ&quot;מ מסביב נחשפים לתמונה. למילוי מלא — מומלץ <span className='font-mono'>5500×3000</span> פיקסלים (מינימום <span className='font-mono'>{FULL_W}×{FULL_H}</span>). לטקסטורה חוזרת — כל גודל (גם <span className='font-mono'>1024×1024</span>). פורמטים: JPG, PNG, WebP.
                        </p>
                        <CoverImageUploader
                            label='שוליים (Bleed)'
                            image={bleedImage}
                            mode={bleedImageMode}
                            onPick={file => handleImagePick('bleed', file, bleedFileRef)}
                            onModeChange={setBleedImageMode}
                            onRemove={() => handleRemoveImage('bleed')}
                            inputRef={bleedFileRef}
                            uploading={uploadingTarget === 'bleed'}
                        />
                    </div>

                    {/* Front + back cover image uploads. When set, the image
                        REPLACES the in-app cover template for that panel and
                        fills the full bleed-to-bleed area automatically. */}
                    <div className='mt-4 pt-3' style={{ borderTop: '1px solid #f0e8d4' }}>
                        <p className='text-[12px] font-bold text-[#3d2e1a] mb-2'>תמונת רקע לכריכות</p>
                        <p className='text-[11px] text-[#a89378] leading-relaxed mb-3'>
                            כל פאנל מודפס ב־<span className='font-mono'>{REGION_W}×{FULL_H}</span> פיקסלים @ {DPI}dpi (כולל 20 מ&quot;מ wrap בכל צד). למילוי מלא — מומלץ <span className='font-mono'>2700×3100</span> פיקסלים (מינימום <span className='font-mono'>2400×2400</span>). לטקסטורה חוזרת — כל גודל (גם <span className='font-mono'>1024×1024</span>). פורמטים: JPG, PNG, WebP.
                        </p>
                        <CoverImageUploader
                            label='כריכה קדמית'
                            image={frontCoverImage}
                            mode={frontCoverImageMode}
                            onPick={file => handleImagePick('front', file, frontFileRef)}
                            onModeChange={setFrontCoverImageMode}
                            onRemove={() => handleRemoveImage('front')}
                            inputRef={frontFileRef}
                            uploading={uploadingTarget === 'front'}
                        />
                        <div className='h-3' />
                        <CoverImageUploader
                            label='כריכה אחורית'
                            image={backCoverImage}
                            mode={backCoverImageMode}
                            onPick={file => handleImagePick('back', file, backFileRef)}
                            onModeChange={setBackCoverImageMode}
                            onRemove={() => handleRemoveImage('back')}
                            inputRef={backFileRef}
                            uploading={uploadingTarget === 'back'}
                        />
                    </div>

                    <div className='mt-4 pt-3' style={{ borderTop: '1px solid #f0e8d4' }}>
                        <p className='text-[12px] font-bold text-[#3d2e1a] mb-2'>צבע / רקע השדרה</p>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <input
                                type='color'
                                value={spineColor}
                                onChange={e => setSpineColor(e.target.value)}
                                className='w-9 h-9 rounded-lg cursor-pointer p-0'
                                style={{ border: '1px solid #ead9b3', background: 'none' }}
                                aria-label='צבע שדרה'
                            />
                            <span className='text-[11px] font-mono text-[#7a6a52]'>{spineColor}</span>
                            {['#efe3cc', '#f5f0e8', '#ffffff', '#1a1410', '#b8893d'].map(c => (
                                <button
                                    key={c}
                                    onClick={() => setSpineColor(c)}
                                    title={c}
                                    aria-label={c}
                                    style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: (spineColor || '').toLowerCase() === c ? '2px solid #aa8840' : '1px solid #ead9b3', cursor: 'pointer' }}
                                />
                            ))}
                        </div>

                        {/* Or upload an image — overrides the color when set. */}
                        <div className='flex items-center gap-3 mt-3'>
                            <div className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold'>או</div>
                            <div className='flex-1' style={{ borderTop: '1px dashed #ead9b3' }} />
                        </div>

                        {!spineImage ? (
                            <div className='mt-3'>
                                <input
                                    ref={spineFileRef}
                                    type='file'
                                    accept='image/jpeg,image/png,image/webp'
                                    className='hidden'
                                    onChange={e => handleImagePick('spine', e.target.files?.[0], spineFileRef)}
                                />
                                <button
                                    onClick={() => spineFileRef.current?.click()}
                                    disabled={uploadingTarget === 'spine'}
                                    className='inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52] disabled:opacity-60'
                                    style={{ background: '#fff', border: '1px dashed #d3b46a' }}
                                >
                                    {uploadingTarget === 'spine' ? <Loader2 size={14} className='animate-spin' /> : <ImageIcon size={14} />}
                                    {uploadingTarget === 'spine' ? 'מעלה…' : 'העלה תמונה כרקע השדרה'}
                                </button>
                                <p className='text-[11px] text-[#a89378] mt-2 leading-relaxed'>
                                    רזולוציה מומלצת: למילוי מלא — לפחות <span className='font-mono'>600×3000</span> פיקסלים (השדרה מודפסת ב־{SPINE_W}×{FULL_H} פיקסלים @ {DPI}dpi). לטקסטורה חוזרת — כל גודל מתאים (גם <span className='font-mono'>500×500</span>). פורמטים: JPG, PNG, WebP.
                                </p>
                            </div>
                        ) : (
                            <div className='mt-3'>
                                <div className='flex items-center gap-3'>
                                    <div
                                        className='shrink-0 rounded-lg'
                                        style={{
                                            width: 48,
                                            height: 80,
                                            background: `${spineColor} url(${spineImage}) center/${spineImageMode === 'cover' ? 'cover' : 'auto'} ${spineImageMode === 'cover' ? 'no-repeat' : 'repeat'}`,
                                            border: '1px solid #ead9b3',
                                        }}
                                    />
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-[12px] font-bold text-[#3d2e1a] mb-1.5'>תמונת רקע מועלית</p>
                                        <div className='flex items-center gap-1.5 flex-wrap'>
                                            {[
                                                { k: 'cover', l: 'מילוי מלא' },
                                                { k: 'repeat', l: 'טקסטורה חוזרת' },
                                            ].map(o => (
                                                <button
                                                    key={o.k}
                                                    onClick={() => setSpineImageMode(o.k)}
                                                    className='text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors'
                                                    style={spineImageMode === o.k ? { background: '#AA8840', color: '#fff', borderColor: '#AA8840' } : { background: '#fff', color: '#7a6a52', borderColor: '#ead9b3' }}
                                                >
                                                    {o.l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveImage('spine')}
                                        className='shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#b32424]'
                                        style={{ background: '#fff5f5', border: '1px solid #ffcdcd' }}
                                        title='הסר תמונה וחזור לצבע'
                                    >
                                        <X size={12} /> הסר
                                    </button>
                                </div>
                            </div>
                        )}
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

            {/* Hidden full-size capture stage — 459×248mm @ 300dpi.
                In bleed mode the stage owns the bleed-margin image as its
                outermost background and inner content sits inset by WRAP_PX
                so the surrounding strip stays visible. Otherwise we keep
                the original flex layout where each panel includes its own
                outer wrap. */}
            <div ref={stageRef} aria-hidden dir='ltr'
                style={{
                    position: 'fixed', top: 0, left: -999999,
                    width: FULL_W, height: FULL_H,
                    overflow: 'hidden', pointerEvents: 'none',
                    backgroundColor: '#ffffff',
                    ...(bleedImage ? imageBgStyle(bleedImage, bleedImageMode) : null),
                    ...(bleedImage ? null : { display: 'flex' }),
                }}>
                {wedding && (bleedImage ? (
                    <div style={{ position: 'absolute', top: WRAP_PX, left: WRAP_PX, right: WRAP_PX, bottom: WRAP_PX, display: 'flex' }}>
                        {order}
                    </div>
                ) : order)}
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
