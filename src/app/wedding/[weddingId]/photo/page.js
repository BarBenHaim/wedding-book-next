'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { saveEntry } from '../../../../lib/classifyMedia'

export default function PhotoPage() {
    const liveVideoRef = useRef(null)
    const [stream, setStream] = useState(null)
    const [photoUrl, setPhotoUrl] = useState('')
    const [photoBlob, setPhotoBlob] = useState(null)
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const router = useRouter()
    const { weddingId } = useParams()

    useEffect(() => {
        initCamera()
        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop())
            }
        }
    }, [])

    async function initCamera() {
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 }, // סלפי כברירת מחדל
            })
            setStream(s)
            if (liveVideoRef.current) {
                liveVideoRef.current.srcObject = s
            }
        } catch (e) {
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

        canvas.toBlob(blob => {
            if (blob) {
                const url = URL.createObjectURL(blob)
                setPhotoBlob(blob)
                setPhotoUrl(url)
            }
        }, 'image/jpeg')
    }

    function retake() {
        setPhotoBlob(null)
        setPhotoUrl('')
        initCamera()
    }

    async function onSubmit(e) {
        e.preventDefault()
        if (!photoBlob && !text.trim()) return
        if (!weddingId) {
            alert('לא נמצא מזהה חתונה')
            return
        }

        setSubmitting(true)

        try {
            let imageDataUrl = null

            if (photoBlob) {
                const reader = new FileReader()
                imageDataUrl = await new Promise(resolve => {
                    reader.onloadend = () => resolve(reader.result)
                    reader.readAsDataURL(photoBlob)
                })
            }

            await saveEntry(weddingId, {
                name: name || 'אורח אנונימי',
                text: text || null,
                image: imageDataUrl || null,
            })

            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error('Error uploading entry:', err)
            alert('שגיאה בהעלאת הברכה')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-pink-100 px-4 py-8'>
            <div className='w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl'>
                <h2 className='mb-6 text-center text-3xl font-serif text-gray-800'>📷 צילום ברכה</h2>

                <form onSubmit={onSubmit} className='space-y-6 text-center'>
                    {/* מצלמה / תמונה */}
                    {!photoUrl && (
                        <video
                            ref={liveVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className='mx-auto w-full max-w-md rounded-xl bg-black shadow-md'
                        />
                    )}

                    {photoUrl && (
                        <img
                            src={photoUrl}
                            alt='תמונה שצולמה'
                            className='mx-auto w-full max-w-md rounded-xl shadow-md'
                        />
                    )}

                    <div className='mt-4 flex justify-center gap-4'>
                        {!photoUrl && (
                            <button
                                type='button'
                                onClick={takePhoto}
                                className='rounded-lg bg-pink-500 px-6 py-3 text-white shadow hover:bg-pink-600 transition'
                            >
                                📸 צלם תמונה
                            </button>
                        )}
                        {photoUrl && (
                            <button
                                type='button'
                                onClick={retake}
                                className='rounded-lg border border-gray-300 px-6 py-3 text-gray-700 shadow hover:bg-gray-100 transition'
                            >
                                🔁 צלם שוב
                            </button>
                        )}
                    </div>

                    {/* שם */}
                    <div className='text-left'>
                        <label className='block text-sm font-medium text-gray-700'>שם (אופציונלי)</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='שם פרטי'
                            className='mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-700 shadow-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-200'
                        />
                    </div>

                    {/* ברכה */}
                    <div className='text-left'>
                        <label className='block text-sm font-medium text-gray-700'>הברכה שלכם (עד 500 תווים)</label>
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value.slice(0, 500))}
                            placeholder='כתבו כאן...'
                            rows={4}
                            className='mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-700 shadow-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-200'
                        />
                    </div>

                    {/* כפתור שליחה */}
                    <button
                        type='submit'
                        disabled={submitting || (!photoBlob && !text.trim())}
                        className='w-full rounded-lg bg-yellow-400 px-6 py-3 text-lg font-medium text-gray-800 shadow-md transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50'
                    >
                        💾 שלח ברכה
                    </button>
                </form>
            </div>
        </div>
    )
}
