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

// Outer wrapper — fetches locale from the wedding doc once, then wraps
// the form in NextIntlClientProvider so every string speaks the language
// the super-admin configured for the event. Same pattern used by the
// portal and thanks page.
export default function TextPage() {
    const { weddingId } = useParams()
    const [locale, setLocale] = useState('he')

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId))
                if (cancelled) return
                if (snap.exists()) setLocale(normalizeLocale(snap.data().locale))
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
            <PhotoApp />
        </NextIntlClientProvider>
    )
}

function PhotoApp() {
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
        <div className='min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] px-4 py-6 font-sans'>
            {/* רקע Glow מקורי */}
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-[#AA8840]/10 blur-3xl'></div>
            <div className='absolute bottom-10 right-10 h-80 w-80 rounded-full bg-[#AA8840]/8 blur-3xl'></div>

            <div className='relative z-10 w-full max-w-2xl bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-6 md:p-8 border border-white/50 animate-scaleIn'>
                {/* Stepper — 44px+ touch targets */}
                <div className='flex justify-center items-center mb-6 gap-3'>
                    {/* Step 1 */}
                    <button
                        onClick={() => setStep(1)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-full transition-all duration-300 ${
                            step === 1
                                ? 'bg-[#AA8840]/10 text-[#AA8840] ring-2 ring-[#AA8840]'
                                : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                isTextDone
                                    ? 'bg-green-500 text-white'
                                    : step === 1
                                      ? 'bg-[#AA8840] text-white'
                                      : 'bg-gray-300 text-white'
                            }`}
                        >
                            {isTextDone ? '✓' : '1'}
                        </div>
                        <span className='font-semibold text-sm'>{t('step1Label')}</span>
                    </button>

                    {/* Connecting line */}
                    <div
                        className={`w-10 h-0.5 rounded-full transition-colors duration-300 ${isTextDone ? 'bg-gradient-to-l from-[#AA8840]/40 to-[#AA8840]/20' : 'bg-gray-200'}`}
                    ></div>

                    {/* Step 2 */}
                    <button
                        onClick={() => isTextDone && setStep(2)}
                        disabled={!isTextDone}
                        className={`flex items-center gap-2 px-5 py-3 rounded-full transition-all duration-300 ${
                            step === 2 ? 'bg-[#AA8840]/10 text-[#AA8840] ring-2 ring-[#AA8840]' : 'text-gray-500'
                        } ${!isTextDone ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                isPhotoDone
                                    ? 'bg-green-500 text-white'
                                    : step === 2
                                      ? 'bg-[#AA8840] text-white'
                                      : 'bg-gray-300 text-white'
                            }`}
                        >
                            {isPhotoDone ? '✓' : '2'}
                        </div>
                        <span className='font-semibold text-sm'>{t('step2Label')}</span>
                    </button>
                </div>

                {/* --- תוכן שלב 1: טקסט --- */}
                {step === 1 && (
                    <div className='space-y-5 animate-fadeIn'>
                        <div>
                            <label className='block text-start text-sm font-medium text-gray-700 mb-1'>
                                {t('nameLabel')}
                            </label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('namePlaceholder')}
                                className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-800 placeholder-[#AA8840]/30 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition'
                            />
                        </div>
                        <div>
                            <label className='block text-start text-sm font-medium text-gray-700 mb-1'>
                                {t('blessingLabel')}
                            </label>
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder={t('blessingPlaceholder')}
                                className='w-full h-36 rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-800 placeholder-[#AA8840]/30 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none resize-none transition'
                                maxLength={210}
                            />
                            {/* text-end keeps the counter at the trailing edge of the
                                form in either direction (was hardcoded text-left). */}
                            <div className='text-end text-xs text-gray-400 mt-1'>{t('charCount', { used: text.length, max: 210 })}</div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            disabled={!text.trim()}
                            className='w-full mt-4 py-3.5 rounded-xl gold-shimmer text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {t('continueToPhoto')}
                        </button>
                    </div>
                )}

                {/* --- תוכן שלב 2: תמונה --- */}
                {step === 2 && (
                    <div className='space-y-6 animate-fadeIn'>
                        {/* קונטיינר תמונה (יחס 4:3) */}
                        <div className='relative w-full aspect-[4/3] bg-gray-50 rounded-xl overflow-hidden border-2 border-dashed border-[#AA8840]/20 shadow-inner group'>
                            {/* 1. מצב בחירה (ריק) */}
                            {!photoUrl && !cameraOpen && (
                                <div className='absolute inset-0 flex flex-col items-center justify-center gap-6'>
                                    {/* אייקון מצלמה SVG נקי */}
                                    <div className='text-[#AA8840]/40 bg-[#AA8840]/5 p-4 rounded-full'>
                                        <svg
                                            xmlns='http://www.w3.org/2000/svg'
                                            fill='none'
                                            viewBox='0 0 24 24'
                                            strokeWidth={1.5}
                                            stroke='currentColor'
                                            className='w-10 h-10'
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

                                    <div className='flex gap-4'>
                                        <button
                                            onClick={() => setCameraOpen(true)}
                                            className='px-6 py-2.5 bg-[#AA8840] text-white rounded-full text-sm font-bold shadow hover:bg-[#AA8840]/90 transition flex items-center gap-2'
                                        >
                                            {t('camera')}
                                        </button>
                                        <label className='px-6 py-2.5 bg-white text-[#AA8840] border border-[#AA8840]/20 rounded-full text-sm font-bold shadow hover:bg-[#AA8840]/5 cursor-pointer transition flex items-center gap-2'>
                                            {t('gallery')}
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

                        {/* כפתורים למטה */}
                        {photoUrl && !cameraOpen && (
                            <div className='flex gap-4'>
                                <button
                                    onClick={() => {
                                        setPhotoUrl('')
                                        setPhotoBlob(null)
                                        setIsUpload(false)
                                    }}
                                    className='flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition'
                                >
                                    {t('replacePhoto')}
                                </button>
                                <button
                                    onClick={onSubmit}
                                    disabled={submitting}
                                    className='flex-[2] py-3.5 rounded-xl gold-shimmer text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50'
                                >
                                    {submitting ? t('submitting') : t('submit')}
                                </button>
                            </div>
                        )}

                        {!photoUrl && !cameraOpen && (
                            <button
                                onClick={() => setStep(1)}
                                className='w-full py-2 text-gray-400 text-sm hover:text-[#AA8840] transition flex items-center justify-center gap-1'
                            >
                                {t('backToEdit')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
