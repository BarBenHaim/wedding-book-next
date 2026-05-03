'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import Cropper from 'react-easy-crop'
import { enqueue, genId } from '../../../../lib/offlineQueue'
import { uploadQueuedEntry } from '../../../../lib/uploadEntry'
import { normalizeBlessing } from '../../../../lib/normalizeText'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'

// Outer wrapper — fetches locale + eventType from the wedding doc once,
// then wraps the form in NextIntlClientProvider so every string speaks
// the language the super-admin configured. eventType drives the page
// title ("Leave a blessing for the couple/Bar Mitzvah/...").
export default function TextPage() {
    const { weddingId } = useParams()
    const [locale, setLocale] = useState('he')
    const [eventType, setEventType] = useState('wedding')

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (snap.exists()) {
                    const data = snap.data()
                    setLocale(normalizeLocale(data.locale))
                    if (data.eventType) setEventType(data.eventType)
                }
            } catch {
                /* keep Hebrew default */
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId])

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <PhotoApp eventType={eventType} />
        </NextIntlClientProvider>
    )
}

// Map eventType to the i18n key that holds the corresponding page-title
// translation. Keeps the JSX tidy and adding a new event type is a one-
// line change here + new translations.
const TITLE_KEY_BY_EVENT = {
    wedding: 'pageTitleWedding',
    birthday: 'pageTitleBirthday',
    bar_mitzvah: 'pageTitleBarMitzvah',
    bat_mitzvah: 'pageTitleBatMitzvah',
}

function PhotoApp({ eventType }) {
    const t = useTranslations('photo')
    const [step, setStep] = useState(1) // 1: Text, 2: Photo
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [photoUrl, setPhotoUrl] = useState('')
    const [photoBlob, setPhotoBlob] = useState(null)

    // מצלמה
    const [stream, setStream] = useState(null)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraFacing, setCameraFacing] = useState('user')

    // חיתוך (Crop)
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
    const [isUpload, setIsUpload] = useState(false)

    const [submitting, setSubmitting] = useState(false)
    const liveVideoRef = useRef(null)
    const router = useRouter()
    const { weddingId } = useParams()

    // --- לוגיקת מצלמה ---
    useEffect(() => {
        if (cameraOpen) startCamera()
        return () => stopCamera()
    }, [cameraOpen, cameraFacing])

    async function startCamera() {
        stopCamera()
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: cameraFacing,
                    width: { ideal: 1920 },
                    height: { ideal: 1440 }, // יחס 4:3
                },
            })
            setStream(s)
            if (liveVideoRef.current) liveVideoRef.current.srcObject = s
        } catch (err) {
            console.error('Camera Error:', err)
            alert(t('cameraError'))
            setCameraOpen(false)
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
    }

    function takePhoto() {
        const video = liveVideoRef.current
        if (!video) return

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')

        // תיקון מראה למצלמה קדמית
        if (cameraFacing === 'user') {
            ctx.translate(canvas.width, 0)
            ctx.scale(-1, 1)
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
            blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob)
                    setPhotoBlob(blob)
                    setPhotoUrl(url)
                    setIsUpload(false)
                    setCameraOpen(false)
                }
            },
            'image/jpeg',
            0.95,
        )
    }

    // --- שליחה ---
    // The submit handler does NOT wait for Firebase. It produces a compressed
    // JPEG blob (applying the crop if needed), saves the full blessing to
    // IndexedDB, and hands control to the thanks page immediately. The thanks
    // page is the component that actually ships the entry to Firebase — with
    // retry + offline detection. Guests see "thanks!" in <1s regardless of
    // how spotty the venue's reception is.
    async function onSubmit(e) {
        e.preventDefault()
        if (!text.trim() || !photoUrl) return

        setSubmitting(true)

        // Step 1 — produce the final image blob (with crop if needed).
        // Failures here are LOCAL (canvas / decode), not network. We want
        // to fall back gracefully to "save without image" instead of
        // blocking the whole blessing.
        let finalBlob = photoBlob
        let imageProcessingError = null

        if (isUpload && photoUrl && croppedAreaPixels) {
            try {
                // Guard against degenerate crop boxes that the cropper can
                // briefly emit (zero width/height crashes canvas creation).
                if (
                    !croppedAreaPixels.width ||
                    !croppedAreaPixels.height ||
                    croppedAreaPixels.width < 1 ||
                    croppedAreaPixels.height < 1
                ) {
                    throw new Error('crop-invalid-size')
                }

                const image = await createImage(photoUrl)
                const canvas = document.createElement('canvas')
                canvas.width = croppedAreaPixels.width
                canvas.height = croppedAreaPixels.height
                const ctx = canvas.getContext('2d')
                if (!ctx) throw new Error('canvas-no-2d-context')

                ctx.drawImage(
                    image,
                    croppedAreaPixels.x,
                    croppedAreaPixels.y,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height,
                    0,
                    0,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height,
                )

                const cropped = await new Promise((resolve, reject) => {
                    canvas.toBlob(
                        blob => {
                            // Some browsers (low memory / large images) call
                            // back with null instead of throwing. Treat that
                            // as an error so we can fall back.
                            if (!blob) reject(new Error('toblob-null'))
                            else resolve(blob)
                        },
                        'image/jpeg',
                        0.95,
                    )
                })
                finalBlob = cropped
            } catch (err) {
                console.error('[photo] image processing failed:', err)
                imageProcessingError = err
                // Fall back to the un-cropped original blob if we have one.
                // Better to ship the full photo than nothing.
                if (photoBlob) {
                    finalBlob = photoBlob
                    imageProcessingError = null // recovered
                }
            }
        }

        // If image processing definitively failed AND we have no blob to
        // ship, ask the user whether to save without a photo.
        if (imageProcessingError && !finalBlob) {
            const proceed = window.confirm(t('imageProcessFail'))
            if (!proceed) {
                setSubmitting(false)
                return
            }
            finalBlob = null
        }

        // Step 2 — persist + upload. Two-tier strategy:
        //
        // Tier 1 (preferred): IDB enqueue → optimistic redirect → upload
        //   on the thanks page. Best UX: guest sees "thanks!" instantly,
        //   the upload happens with retry + survives bad reception.
        //
        // Tier 2 (fallback): direct upload to Firebase. Used when IDB
        //   throws — common on iOS Safari with strict cookie/storage
        //   settings, or in private mode. Slower (we wait for the upload)
        //   but it actually works.
        //
        // The old code only had tier 1, so guests with strict iOS Safari
        // settings could never submit. The fallback ensures everyone
        // can blesss successfully, even if they pay a few seconds for it.

        const entry = {
            id: genId(),
            weddingId,
            name: name || '',
            text: normalizeBlessing(text),
            image: finalBlob,
        }

        // Tier 1 — try IDB enqueue.
        let enqueued = false
        try {
            await enqueue(entry)
            enqueued = true
        } catch (err) {
            // Don't surface to user yet. Log for debugging and try direct
            // upload instead. IDB rejections often surface with a null
            // error object (Safari) — guard against that in logging.
            console.warn(
                '[photo] IDB enqueue failed, falling back to direct upload:',
                err?.message || err?.name || 'unknown IDB error',
                err,
            )
        }

        if (enqueued) {
            // Off to the thanks screen — it handles the network upload
            // with retry + status UI.
            router.push(`/wedding/${weddingId}/thanks`)
            return
        }

        // Tier 2 — direct upload to Firebase. uploadQueuedEntry tries
        // to update the IDB record as well; that update is harmless if
        // the record never made it into IDB (it just no-ops).
        try {
            await uploadQueuedEntry(entry)
            // Success — go to the thanks screen. The thanks page will
            // not find this entry in IDB, but it'll show the standard
            // thank-you state (no pending items).
            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error('[photo] direct upload also failed:', err)
            const rawMsg = err?.message || err?.name || ''
            let userMessage
            if (
                /Failed to fetch|NetworkError|network|ETIMEDOUT|ERR_INTERNET/i.test(
                    rawMsg,
                )
            ) {
                userMessage = t('errNetwork')
            } else if (/permission|PERMISSION_DENIED|unauthor/i.test(rawMsg)) {
                userMessage = t('errPermission')
            } else if (rawMsg) {
                userMessage = t('errSpecific', { reason: rawMsg })
            } else {
                userMessage = t('errGeneric')
            }
            alert(userMessage)
            setSubmitting(false)
        }
    }

    function createImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.addEventListener('load', () => resolve(img))
            img.addEventListener('error', () => reject(new Error('image-load-failed')))
            // IMPORTANT: do NOT set crossOrigin for blob: URLs.
            // On iOS Safari, setting crossOrigin='anonymous' on a blob URL
            // makes the load fail silently (Safari treats it as a CORS request
            // and rejects). Only blob URLs are passed here (from camera capture
            // or `<input type=file>`), and they're always same-origin, so we
            // don't need CORS at all.
            img.src = url
        })
    }

    const isTextDone = text.trim().length > 0
    const isPhotoDone = !!photoUrl

    return (
        <div
            className='min-h-[calc(100vh-4rem)] flex items-start justify-center px-4 py-8 font-sans relative overflow-hidden'
            style={{
                // Premium ivory wash — base is a near-white warm neutral
                // (#f8f4ec, "fine paper"). Two very low-opacity radial
                // glows give the surface depth without any saturated
                // yellow: a cool white halo at the top opens the space,
                // a barely-there gold pool in the bottom-right corner
                // hints at the brand colour without dominating.
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 900px 480px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 520px 520px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                    'radial-gradient(ellipse 440px 440px at 8% 105%, rgba(186,156,108,0.05) 0%, rgba(186,156,108,0) 60%)',
                ].join(', '),
            }}
        >

            {/* Layout container — narrower max-width matches the mockup's
                phone-first composition. Each section sits directly on the
                champagne wash. */}
            <div className='relative z-10 w-full max-w-[26rem] animate-scaleIn'>
                {/* Stepper — slim white pill bar. Active step is marked by
                    a SOLID gold number badge + dark-ink label. No tinted
                    pill background (the previous version felt boxed-in). */}
                <div
                    className='bg-white rounded-full mb-9 mx-auto flex items-center justify-center'
                    style={{
                        maxWidth: '20rem',
                        padding: '4px',
                        boxShadow: '0 6px 20px -6px rgba(170,136,64,0.18), 0 1px 3px rgba(170,136,64,0.10)',
                        border: '1px solid rgba(212,184,103,0.35)',
                    }}
                >
                    {/* Step 1 — pill is transparent; the gold-filled circle
                        does the heavy lifting visually. Active label is
                        ink-dark, inactive is muted tan. */}
                    <button
                        onClick={() => setStep(1)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full transition-colors duration-200 ${
                            step === 1 ? 'text-[#3d2e1a]' : 'text-[#a89378]'
                        }`}
                    >
                        <span
                            className='inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white'
                            style={{
                                background: isTextDone
                                    ? '#7da76a' // soft sage green for "done"
                                    : step === 1
                                        ? 'linear-gradient(180deg,#c9a44e 0%,#a8843a 100%)'
                                        : '#d6cab2',
                                boxShadow: step === 1 ? '0 2px 6px rgba(170,136,64,0.35)' : 'none',
                            }}
                        >
                            {isTextDone ? '✓' : '1'}
                        </span>
                        <span className='font-bold text-[13px] tracking-wide'>{t('step1Label')}</span>
                    </button>

                    {/* Connecting line — hairline tan that turns gold once
                        the first step is complete. */}
                    <div
                        className='h-px w-8 mx-1 transition-colors duration-300'
                        style={{ background: isTextDone ? '#c9a44e' : '#e1d4b4' }}
                    />

                    {/* Step 2 */}
                    <button
                        onClick={() => isTextDone && setStep(2)}
                        disabled={!isTextDone}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full transition-colors duration-200 ${
                            step === 2 ? 'text-[#3d2e1a]' : 'text-[#a89378]'
                        } ${!isTextDone ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        <span
                            className='inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white'
                            style={{
                                background: isPhotoDone
                                    ? '#7da76a'
                                    : step === 2
                                        ? 'linear-gradient(180deg,#c9a44e 0%,#a8843a 100%)'
                                        : '#d6cab2',
                                boxShadow: step === 2 ? '0 2px 6px rgba(170,136,64,0.35)' : 'none',
                            }}
                        >
                            {isPhotoDone ? '✓' : '2'}
                        </span>
                        <span className='font-bold text-[13px] tracking-wide'>{t('step2Label')}</span>
                    </button>
                </div>

                {/* --- תוכן שלב 1: טקסט --- */}
                {/* Redesigned to match the cleaner mockup: a heart-and-title
                    block above the form, the form itself in a soft white
                    card divided by a heart separator, then a full-width
                    gold gradient continue button, and a tiny lock-icon
                    trust line at the bottom. The state hooks and validation
                    below are unchanged — only the JSX shell was redrawn. */}
                {step === 1 && (
                    <div className='animate-fadeIn'>
                        {/* ── Title block ──
                            Generous breathing room above and below; the
                            small gold heart anchors the title without
                            competing with it. */}
                        <div className='text-center mb-7'>
                            <svg
                                viewBox='0 0 24 24'
                                className='w-[18px] h-[18px] mx-auto mb-3.5'
                                fill='#c9a44e'
                            >
                                <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                            </svg>
                            <h2
                                className='font-bold mb-2 leading-[1.15]'
                                style={{ color: '#1a1410', fontSize: '26px', letterSpacing: '-0.01em' }}
                            >
                                {t(TITLE_KEY_BY_EVENT[eventType] || 'pageTitleWedding')}
                            </h2>
                            <p
                                className='leading-relaxed'
                                style={{ color: '#9a8a72', fontSize: '13.5px' }}
                            >
                                {t('pageSubtitle')}
                            </p>
                        </div>

                        {/* ── Form card ──
                            Pure white, soft warm shadow, very subtle gold
                            border. Two sections divided by an inline-heart
                            ornament. Section labels are dark/bold and the
                            small gold icon hugs the trailing edge. */}
                        <div
                            className='bg-white rounded-[22px] px-5 pt-5 pb-5'
                            style={{
                                boxShadow:
                                    '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                                border: '1px solid rgba(212,184,103,0.22)',
                            }}
                        >
                            {/* Name section */}
                            <div>
                                <div className='flex items-center justify-between mb-2.5'>
                                    <span style={{ color: '#1a1410', fontSize: '14px', fontWeight: 700 }}>
                                        {t('nameLabel')}
                                    </span>
                                    <svg
                                        viewBox='0 0 24 24'
                                        className='w-[18px] h-[18px]'
                                        fill='none'
                                        stroke='#c9a44e'
                                        strokeWidth={1.8}
                                    >
                                        <path strokeLinecap='round' strokeLinejoin='round' d='M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z' />
                                    </svg>
                                </div>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={t('namePlaceholder')}
                                    className='w-full rounded-xl bg-white outline-none transition'
                                    style={{
                                        border: '1px solid #ead9b3',
                                        padding: '12px 16px',
                                        color: '#1a1410',
                                        fontSize: '14px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#c9a44e')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#ead9b3')}
                                />
                            </div>

                            {/* Heart divider — thin gold lines flanking a
                                small filled heart, tighter spacing than
                                before so it reads as one ornament. */}
                            <div className='flex items-center justify-center gap-2.5 my-5'>
                                <span
                                    className='block h-px flex-1'
                                    style={{ background: 'linear-gradient(to left, transparent, #e1d4b4, transparent)' }}
                                />
                                <svg viewBox='0 0 24 24' className='w-[11px] h-[11px] shrink-0' fill='#c9a44e'>
                                    <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                                </svg>
                                <span
                                    className='block h-px flex-1'
                                    style={{ background: 'linear-gradient(to right, transparent, #e1d4b4, transparent)' }}
                                />
                            </div>

                            {/* Blessing section */}
                            <div>
                                <div className='flex items-center justify-between mb-2.5'>
                                    <span style={{ color: '#1a1410', fontSize: '14px', fontWeight: 700 }}>
                                        {t('blessingLabel')}
                                    </span>
                                    <svg
                                        viewBox='0 0 24 24'
                                        className='w-[18px] h-[18px]'
                                        fill='none'
                                        stroke='#c9a44e'
                                        strokeWidth={1.8}
                                    >
                                        <path strokeLinecap='round' strokeLinejoin='round' d='M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13L2.25 21.75l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Zm0 0L19.5 7.125' />
                                    </svg>
                                </div>
                                <textarea
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    placeholder={t('blessingPlaceholder')}
                                    className='w-full rounded-xl bg-white outline-none transition resize-none leading-relaxed'
                                    style={{
                                        border: '1px solid #ead9b3',
                                        padding: '12px 16px',
                                        color: '#1a1410',
                                        fontSize: '14px',
                                        height: '128px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#c9a44e')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#ead9b3')}
                                    maxLength={210}
                                />
                                <div
                                    className='text-end mt-1.5'
                                    style={{ color: '#b9a684', fontSize: '11px' }}
                                >
                                    {t('charCount', { used: text.length, max: 210 })}
                                </div>
                            </div>
                        </div>

                        {/* ── Continue button ──
                            Solid antique-gold gradient, deep warm shadow.
                            Sparkle leads the row, chevron follows the
                            label and rotates per direction so it always
                            points "forward" in the user's reading flow. */}
                        <button
                            onClick={() => setStep(2)}
                            disabled={!text.trim()}
                            className='w-full mt-7 rounded-2xl text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-[0.99]'
                            style={{
                                background:
                                    'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                boxShadow:
                                    '0 14px 32px -10px rgba(170,136,64,0.55), 0 4px 10px -4px rgba(170,136,64,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                                padding: '15px 18px',
                                fontSize: '15.5px',
                                letterSpacing: '0.01em',
                            }}
                        >
                            {/* Sparkle on the leading side. In RTL flex
                                row, this child sits on the right (start
                                edge); in LTR it sits on the left. Either
                                way it leads the label visually. */}
                            <svg viewBox='0 0 24 24' className='w-[15px] h-[15px] opacity-95 shrink-0' fill='currentColor'>
                                <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                            </svg>
                            <span>{t('continueToPhoto')}</span>
                            <svg
                                viewBox='0 0 24 24'
                                className='w-[15px] h-[15px] rtl:rotate-180 shrink-0'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={2.6}
                            >
                                <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                            </svg>
                        </button>

                        {/* ── Trust line ── */}
                        <div
                            className='flex items-center justify-center gap-1.5 mt-4'
                            style={{ color: '#b9a684', fontSize: '11px' }}
                        >
                            <svg viewBox='0 0 24 24' className='w-[12px] h-[12px]' fill='none' stroke='currentColor' strokeWidth={1.7}>
                                <path strokeLinecap='round' strokeLinejoin='round' d='M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z' />
                            </svg>
                            <span>{t('securityNote')}</span>
                        </div>
                    </div>
                )}

                {/* --- תוכן שלב 2: תמונה --- */}
                {/* Visually mirrors step 1: title block above + premium
                    white card. The interactive guts (camera, cropper,
                    file upload) are intentionally untouched — only the
                    surrounding chrome was restyled. */}
                {step === 2 && (
                    <div className='animate-fadeIn'>
                        {/* ── Title block — same composition as step 1 ── */}
                        <div className='text-center mb-7'>
                            <svg viewBox='0 0 24 24' className='w-[18px] h-[18px] mx-auto mb-3.5' fill='#c9a44e'>
                                <path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' />
                            </svg>
                            <h2
                                className='font-bold mb-2 leading-[1.15]'
                                style={{ color: '#1a1410', fontSize: '26px', letterSpacing: '-0.01em' }}
                            >
                                {t('pageTitleStep2')}
                            </h2>
                            <p
                                className='leading-relaxed'
                                style={{ color: '#9a8a72', fontSize: '13.5px' }}
                            >
                                {t('pageSubtitleStep2')}
                            </p>
                        </div>

                        {/* ── Photo card ── */}
                        <div
                            className='bg-white rounded-[22px] p-5'
                            style={{
                                boxShadow:
                                    '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                                border: '1px solid rgba(212,184,103,0.22)',
                            }}
                        >
                        {/* קונטיינר תמונה (יחס 4:3) — solid soft border
                            instead of dashed gold; the dashed look read
                            as "draft / unfinished". */}
                        <div
                            className='relative w-full aspect-[4/3] rounded-2xl overflow-hidden group'
                            style={{
                                background: '#fbf6ec',
                                border: '1px solid #ead9b3',
                            }}
                        >
                            {/* 1. מצב בחירה (ריק) */}
                            {!photoUrl && !cameraOpen && (
                                <div className='absolute inset-0 flex flex-col items-center justify-center gap-6 px-4'>
                                    {/* Camera icon — stronger gold,
                                        circular cream wash, no harsh
                                        contrast. */}
                                    <div
                                        className='rounded-full flex items-center justify-center'
                                        style={{
                                            width: 72,
                                            height: 72,
                                            background: '#fff8e8',
                                            border: '1px solid #ead9b3',
                                        }}
                                    >
                                        <svg
                                            xmlns='http://www.w3.org/2000/svg'
                                            fill='none'
                                            viewBox='0 0 24 24'
                                            strokeWidth={1.5}
                                            stroke='#c9a44e'
                                            className='w-9 h-9'
                                        >
                                            <path
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                                d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z'
                                            />
                                            <path
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                                d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z'
                                            />
                                        </svg>
                                    </div>

                                    <div className='flex gap-3 w-full max-w-[280px]'>
                                        <button
                                            onClick={() => setCameraOpen(true)}
                                            className='flex-1 rounded-full text-white font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]'
                                            style={{
                                                background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                                padding: '11px 14px',
                                                boxShadow:
                                                    '0 8px 18px -8px rgba(170,136,64,0.45), inset 0 1px 0 rgba(255,255,255,0.20)',
                                            }}
                                        >
                                            <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='none' stroke='currentColor' strokeWidth={2}>
                                                <path strokeLinecap='round' strokeLinejoin='round' d='M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z' />
                                                <path strokeLinecap='round' strokeLinejoin='round' d='M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z' />
                                            </svg>
                                            <span>{t('camera')}</span>
                                        </button>
                                        <label
                                            className='flex-1 rounded-full font-bold text-[13px] cursor-pointer flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]'
                                            style={{
                                                background: '#ffffff',
                                                border: '1px solid #ead9b3',
                                                color: '#a8843a',
                                                padding: '11px 14px',
                                            }}
                                        >
                                            <svg viewBox='0 0 24 24' className='w-[15px] h-[15px]' fill='none' stroke='currentColor' strokeWidth={1.8}>
                                                <path strokeLinecap='round' strokeLinejoin='round' d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z' />
                                            </svg>
                                            <span>{t('gallery')}</span>
                                            <input
                                                type='file'
                                                accept='image/*'
                                                className='hidden'
                                                onChange={e => {
                                                    const file = e.target.files?.[0]
                                                    if (file) {
                                                        setPhotoBlob(file)
                                                        setPhotoUrl(URL.createObjectURL(file))
                                                        setIsUpload(true)
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* 2. מצב מצלמה חיה */}
                            {cameraOpen && (
                                <div className='absolute inset-0 bg-black'>
                                    <video
                                        ref={liveVideoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`w-full h-full object-cover ${
                                            cameraFacing === 'user' ? 'scale-x-[-1]' : ''
                                        }`}
                                    />
                                    {/* כפתורי שליטה צפים ויפים */}
                                    <div className='absolute bottom-6 left-0 w-full flex justify-center items-center gap-10'>
                                        <button
                                            onClick={() => setCameraOpen(false)}
                                            className='w-12 h-12 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 active:scale-[0.98] transition'
                                        >
                                            <svg
                                                xmlns='http://www.w3.org/2000/svg'
                                                fill='none'
                                                viewBox='0 0 24 24'
                                                strokeWidth={2}
                                                stroke='currentColor'
                                                className='w-6 h-6'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    d='M6 18 18 6M6 6l12 12'
                                                />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={takePhoto}
                                            className='w-20 h-20 rounded-full border-4 border-white/80 flex items-center justify-center active:scale-[0.98] transition'
                                        >
                                            <div className='w-16 h-16 bg-white rounded-full' />
                                        </button>

                                        <button
                                            onClick={() =>
                                                setCameraFacing(prev => (prev === 'user' ? 'environment' : 'user'))
                                            }
                                            className='w-12 h-12 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 active:scale-[0.98] transition'
                                        >
                                            <svg
                                                xmlns='http://www.w3.org/2000/svg'
                                                fill='none'
                                                viewBox='0 0 24 24'
                                                strokeWidth={2}
                                                stroke='currentColor'
                                                className='w-6 h-6'
                                            >
                                                <path
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                    d='M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99'
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 3. עריכה (Cropper) */}
                            {photoUrl && isUpload && !cameraOpen && (
                                <div className='absolute inset-0'>
                                    <Cropper
                                        image={photoUrl}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={4 / 3}
                                        onCropChange={setCrop}
                                        onZoomChange={setZoom}
                                        onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                                    />
                                </div>
                            )}

                            {/* 4. תצוגה סופית */}
                            {photoUrl && !isUpload && !cameraOpen && (
                                <img src={photoUrl} className='w-full h-full object-cover' alt='Preview' />
                            )}
                        </div>

                        </div>
                        {/* ── Action buttons (close out the photo card) ── */}
                        {photoUrl && !cameraOpen && (
                            <div className='flex gap-3 mt-6'>
                                <button
                                    onClick={() => {
                                        setPhotoUrl('')
                                        setPhotoBlob(null)
                                        setIsUpload(false)
                                    }}
                                    className='flex-1 rounded-2xl font-bold text-[13.5px] transition-all active:scale-[0.99]'
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #ead9b3',
                                        color: '#9a8a72',
                                        padding: '13px 14px',
                                    }}
                                >
                                    {t('replacePhoto')}
                                </button>
                                <button
                                    onClick={onSubmit}
                                    disabled={submitting}
                                    className='flex-[2] rounded-2xl text-white font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-[0.99]'
                                    style={{
                                        background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                        boxShadow:
                                            '0 14px 32px -10px rgba(170,136,64,0.55), 0 4px 10px -4px rgba(170,136,64,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
                                        padding: '14px 18px',
                                        fontSize: '15px',
                                        letterSpacing: '0.01em',
                                    }}
                                >
                                    {submitting ? (
                                        <>
                                            <svg className='w-4 h-4 animate-spin' fill='none' viewBox='0 0 24 24'>
                                                <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' />
                                                <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z' />
                                            </svg>
                                            <span>{t('submitting')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg viewBox='0 0 24 24' className='w-[15px] h-[15px] opacity-95' fill='currentColor'>
                                                <path d='M12 2 L13.2 9.5 L21 11 L13.2 12.5 L12 22 L10.8 12.5 L3 11 L10.8 9.5 Z' />
                                            </svg>
                                            <span>{t('submit')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {!photoUrl && !cameraOpen && (
                            <button
                                onClick={() => setStep(1)}
                                className='w-full mt-5 text-[13px] flex items-center justify-center gap-1.5 transition-colors'
                                style={{ color: '#9a8a72' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#a8843a')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#9a8a72')}
                            >
                                {/* Chevron points "back" — flips on dir so
                                    it's correct in RTL (←) and LTR (←). */}
                                <svg viewBox='0 0 24 24' className='w-[14px] h-[14px] rtl:rotate-180' fill='none' stroke='currentColor' strokeWidth={2}>
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                                </svg>
                                <span>{t('backToEdit')}</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
