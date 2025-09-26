'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { saveEntry } from '../../../../lib/classifyMedia'

export default function TextPage() {
    const [activeTab, setActiveTab] = useState('text')
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [photoUrl, setPhotoUrl] = useState('')
    const [photoBlob, setPhotoBlob] = useState(null)
    const [stream, setStream] = useState(null)
    const [cameraOpen, setCameraOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const liveVideoRef = useRef(null)
    const router = useRouter()
    const { weddingId } = useParams()

    useEffect(() => {
        if (cameraOpen) initCamera()
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop())
        }
    }, [cameraOpen])

    async function initCamera() {
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                    aspectRatio: 4 / 3,
                },
            })
            setStream(s)
            if (liveVideoRef.current) liveVideoRef.current.srcObject = s
        } catch {
            alert('לא ניתן להפעיל מצלמה. בדקו הרשאות דפדפן.')
        }
    }

    function takePhoto() {
        const video = liveVideoRef.current
        if (!video) return

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
            blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob)
                    setPhotoBlob(blob)
                    setPhotoUrl(url)
                    setCameraOpen(false) // סגירת מצלמה → נשאר רק הפריים שצולם
                }
            },
            'image/jpeg',
            0.95
        )
    }

    async function onSubmit(e) {
        e.preventDefault()
        if (!text.trim() && !photoBlob) return
        if (!weddingId) {
            alert('לא נמצא מזהה חתונה')
            return
        }

        setSubmitting(true)
        try {
            await saveEntry(weddingId, {
                name: name || 'אורח אנונימי',
                text: text.trim() || null,
                image: photoBlob || null,
            })
            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error('Error saving entry:', err)
            alert('שגיאה בשמירת הברכה')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className='relative flex h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-br from-purple-50 via-white to-purple-100 px-6 py-12 font-sans'>
            {/* Glow רקע */}
            <div className='absolute -top-24 left-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl'></div>
            <div className='absolute bottom-0 right-0 h-96 w-96 rounded-full bg-pink-300/30 blur-3xl'></div>

            {/* כרטיס */}
            <div className='relative z-10 w-full max-w-3xl rounded-2xl bg-white/90 backdrop-blur-md p-8 shadow-2xl'>
                <h2 className='mb-3 text-center text-3xl font-bold text-gray-800'>השאירו ברכה ותמונה לזוג</h2>
                <p className='mb-8 text-center text-sm text-gray-600'>
                    תוכלו לבחור אם לכתוב ברכה אישית או להוסיף תמונה (מומלץ לשלב את שניהם 💜)
                </p>

                {/* Tabs */}
                <div className='mb-8 flex justify-center gap-6 border-b border-gray-200'>
                    <button
                        type='button'
                        onClick={() => setActiveTab('text')}
                        className={`relative px-6 py-2 font-medium transition ${
                            activeTab === 'text'
                                ? 'border-b-2 border-purple-600 text-purple-700'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        ✍️ כתיבת ברכה
                        {text.trim() && (
                            <span className='absolute -right-3 -top-1 h-3 w-3 rounded-full bg-green-500'></span>
                        )}
                    </button>
                    <button
                        type='button'
                        onClick={() => setActiveTab('photo')}
                        className={`relative px-6 py-2 font-medium transition ${
                            activeTab === 'photo'
                                ? 'border-b-2 border-purple-600 text-purple-700'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        📸 הוספת תמונה
                        {photoUrl && (
                            <span className='absolute -right-3 -top-1 h-3 w-3 rounded-full bg-green-500'></span>
                        )}
                    </button>
                </div>

                <form onSubmit={onSubmit} className='space-y-6'>
                    {/* שם */}
                    <div>
                        <label className='block text-right text-sm font-medium text-gray-700'>שם (אופציונלי)</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='שם פרטי'
                            className='mt-2 w-full rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-gray-700 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                        />
                    </div>

                    {/* טאב תוכן – גובה קבוע */}
                    <div className='relative h-[400px] transition-all'>
                        {activeTab === 'text' && (
                            <div className='flex flex-col h-full animate-fadeIn'>
                                <label className='block text-right text-sm font-medium text-gray-700'>
                                    הברכה שלכם (עד 175 תווים)
                                </label>
                                <textarea
                                    value={text}
                                    onChange={e => setText(e.target.value.slice(0, 175))}
                                    placeholder='כתבו כאן...'
                                    className='mt-2 flex-1 resize-none rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-gray-700 shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200'
                                />
                                <div className='mt-1 text-right text-xs text-gray-500'>{text.length}/175</div>
                            </div>
                        )}

                        {activeTab === 'photo' && (
                            <div className='flex flex-col h-full animate-fadeIn space-y-4'>
                                {/* קונטיינר ביחס 4:3 */}
                                <div className='relative flex-1 aspect-[4/3] w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shadow'>
                                    {!photoUrl && !cameraOpen && (
                                        <span className='text-gray-400 text-sm'>עדיין לא נוספה תמונה</span>
                                    )}

                                    {cameraOpen && (
                                        <video
                                            ref={liveVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className='absolute inset-0 w-full h-full object-cover'
                                        />
                                    )}

                                    {photoUrl && (
                                        <img
                                            src={photoUrl}
                                            alt='תמונה שצולמה'
                                            className='absolute inset-0 w-full h-full object-cover'
                                        />
                                    )}
                                </div>

                                {/* כפתורי פעולה */}
                                <div className='flex justify-center gap-4'>
                                    {!photoUrl && !cameraOpen && (
                                        <button
                                            type='button'
                                            onClick={() => setCameraOpen(true)}
                                            className='rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-white font-medium shadow-lg hover:scale-105 transition'
                                        >
                                            הפעל מצלמה
                                        </button>
                                    )}

                                    {cameraOpen && (
                                        <>
                                            <button
                                                type='button'
                                                onClick={takePhoto}
                                                className='rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-white font-medium shadow-lg hover:scale-105 transition'
                                            >
                                                צלם
                                            </button>
                                            <button
                                                type='button'
                                                onClick={() => setCameraOpen(false)}
                                                className='rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 shadow hover:bg-gray-50 transition'
                                            >
                                                ביטול
                                            </button>
                                        </>
                                    )}

                                    {photoUrl && (
                                        <button
                                            type='button'
                                            onClick={() => {
                                                setPhotoUrl('')
                                                setPhotoBlob(null)
                                                setCameraOpen(false)
                                            }}
                                            className='rounded-xl border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 shadow hover:bg-gray-50 transition'
                                        >
                                            ❌ מחק תמונה
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* שליחה */}
                    <button
                        type='submit'
                        disabled={submitting || (!text.trim() && !photoBlob)}
                        className='w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 text-lg font-semibold text-white shadow-lg hover:scale-105 transition disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        {submitting ? 'שולח...' : 'שלח ברכה'}
                    </button>
                </form>
            </div>
        </div>
    )
}
