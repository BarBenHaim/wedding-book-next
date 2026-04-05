'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Cropper from 'react-easy-crop'
import { saveEntry } from '../../../../lib/classifyMedia'

export default function TextPage() {
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
            alert('לא ניתן לגשת למצלמה')
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
            0.95
        )
    }

    // --- שליחה ---
    async function onSubmit(e) {
        e.preventDefault()
        if (!text.trim() || !photoUrl) return

        setSubmitting(true)
        try {
            let finalBlob = photoBlob

            // חיתוך אם הועלה קובץ
            if (isUpload && photoUrl && croppedAreaPixels) {
                const image = await createImage(photoUrl)
                const canvas = document.createElement('canvas')
                canvas.width = croppedAreaPixels.width
                canvas.height = croppedAreaPixels.height
                const ctx = canvas.getContext('2d')

                ctx.drawImage(
                    image,
                    croppedAreaPixels.x,
                    croppedAreaPixels.y,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height,
                    0,
                    0,
                    croppedAreaPixels.width,
                    croppedAreaPixels.height
                )

                await new Promise(resolve => {
                    canvas.toBlob(
                        blob => {
                            finalBlob = blob
                            resolve()
                        },
                        'image/jpeg',
                        0.95
                    )
                })
            }

            await saveEntry(weddingId, {
                name: name || '',
                text: text.trim(),
                image: finalBlob,
            })

            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error(err)
            alert('שגיאה בשליחה')
        } finally {
            setSubmitting(false)
        }
    }

    function createImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.addEventListener('load', () => resolve(img))
            img.addEventListener('error', error => reject(error))
            img.setAttribute('crossOrigin', 'anonymous')
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
                        <span className='font-semibold text-sm'>ברכה</span>
                    </button>

                    {/* Connecting line */}
                    <div className={`w-10 h-0.5 rounded-full transition-colors duration-300 ${isTextDone ? 'bg-gradient-to-l from-[#AA8840]/40 to-[#AA8840]/20' : 'bg-gray-200'}`}></div>

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
                        <span className='font-semibold text-sm'>תמונה</span>
                    </button>
                </div>

                {/* --- תוכן שלב 1: טקסט --- */}
                {step === 1 && (
                    <div className='space-y-5 animate-fadeIn'>
                        <div>
                            <label className='block text-right text-sm font-medium text-gray-700 mb-1'>
                                שם (אופציונלי)
                            </label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder='מי כותב/ת?'
                                className='w-full rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-800 placeholder-[#AA8840]/30 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none transition'
                            />
                        </div>
                        <div>
                            <label className='block text-right text-sm font-medium text-gray-700 mb-1'>
                                הברכה שלכם
                            </label>
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder='כתבו משהו מהלב...'
                                className='w-full h-36 rounded-xl border border-[#AA8840]/20 bg-[#AA8840]/5 px-4 py-3 text-gray-800 placeholder-[#AA8840]/30 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/20 outline-none resize-none transition'
                                maxLength={210}
                            />
                            <div className='text-left text-xs text-gray-400 mt-1 ml-1'>{text.length}/210</div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            disabled={!text.trim()}
                            className='w-full mt-4 py-3.5 rounded-xl gold-shimmer text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            המשך לתמונה
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
                                            מצלמה
                                        </button>
                                        <label className='px-6 py-2.5 bg-white text-[#AA8840] border border-[#AA8840]/20 rounded-full text-sm font-bold shadow hover:bg-[#AA8840]/5 cursor-pointer transition flex items-center gap-2'>
                                            גלריה
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
                                    החלף תמונה
                                </button>
                                <button
                                    onClick={onSubmit}
                                    disabled={submitting}
                                    className='flex-[2] py-3.5 rounded-xl gold-shimmer text-white font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50'
                                >
                                    {submitting ? 'שולח...' : 'שליחת ברכה'}
                                </button>
                            </div>
                        )}

                        {!photoUrl && !cameraOpen && (
                            <button
                                onClick={() => setStep(1)}
                                className='w-full py-2 text-gray-400 text-sm hover:text-[#AA8840] transition flex items-center justify-center gap-1'
                            >
                                חזרה לעריכה
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
