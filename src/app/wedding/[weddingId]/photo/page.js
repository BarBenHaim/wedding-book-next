'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { saveEntry } from '../../../../lib/classifyMedia'

export default function PhotoPage() {
    const liveVideoRef = useRef(null)
    const [stream, setStream] = useState(null)
    const [photoUrl, setPhotoUrl] = useState('')
    const [photoBlob, setPhotoBlob] = useState(null)
    const router = useRouter()
    const { weddingId } = useParams()

    useEffect(() => {
        initCamera()
        return () => {
            if (stream) {
                stream.getTracks().forEach(t => t.stop())
            }
        }
    }, []) // פעם אחת בלבד

    async function initCamera() {
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 },
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
        const context = canvas.getContext('2d')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

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
    }

    async function upload() {
        if (!photoBlob || !weddingId) return

        const reader = new FileReader()
        reader.onloadend = async () => {
            const dataUrl = reader.result
            try {
                await saveEntry(weddingId, 'photo', dataUrl)
                router.push(`/wedding/${weddingId}/thanks`)
            } catch (err) {
                console.error('Error uploading photo:', err)
                alert('שגיאה בהעלאת התמונה')
            }
        }

        reader.readAsDataURL(photoBlob)
    }

    return (
        <div className='container'>
            <div className='card'>
                <h2 className='title'>📷 צילום ברכה בתמונה</h2>

                {!photoUrl && (
                    <video
                        ref={liveVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', maxWidth: 400, borderRadius: 12, background: '#000' }}
                    />
                )}

                {photoUrl && (
                    <img src={photoUrl} alt='תמונה שצולמה' style={{ width: '100%', maxWidth: 400, borderRadius: 12 }} />
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                    {!photoUrl && (
                        <button className='btn btn-primary' onClick={takePhoto}>
                            📸 צלם תמונה
                        </button>
                    )}
                    {photoUrl && (
                        <>
                            <button className='btn' onClick={retake}>
                                🔁 צלם שוב
                            </button>
                            <button className='btn btn-gold' onClick={upload}>
                                💾 שלח ברכה
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
