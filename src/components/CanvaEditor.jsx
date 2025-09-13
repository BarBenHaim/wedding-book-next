// src/components/CanvaEditor.jsx
import { useEffect, useRef, useState } from 'react'

export default function CanvaEditor({ onFinish }) {
    const [canvaUrl, setCanvaUrl] = useState('')
    const iframeRef = useRef(null)

    useEffect(() => {
        // 🧩 שלב 1: הגדר את ID של תבנית מקנבה
        const templateId = 'DAFx7sFQJpE' // ⬅️ החלף ל-ID של התבנית שלך

        // 🧩 שלב 2: בנה את הקישור עם האפשרות embed + editor
        const url = `https://www.canva.com/design/${templateId}/edit?embed&embedType=editor`
        setCanvaUrl(url)

        // 🧩 שלב 3: האזנה להודעות מ־Canva דרך window.postMessage
        const handleMessage = event => {
            // בדוק שההודעה מגיעה מקנבה
            if (event.origin.includes('canva.com')) {
                const { data } = event

                // אם המשתמש לחץ "Publish", קנבה מחזירה previewUrl
                if (data?.type === 'design-publish') {
                    const designUrl = data?.data?.previewUrl
                    if (designUrl) {
                        onFinish(designUrl) // 🔥 מחזיר להורה את ה-URL של העיצוב
                    }
                }
            }
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [onFinish])

    return (
        <div
            style={{
                width: '100%',
                height: '600px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                overflow: 'hidden',
            }}
        >
            {canvaUrl ? (
                <iframe
                    ref={iframeRef}
                    src={canvaUrl}
                    width='100%'
                    height='100%'
                    frameBorder='0'
                    allow='clipboard-write'
                    allowFullScreen
                    title='Canva Editor'
                ></iframe>
            ) : (
                <p>טוען עורך קנבה...</p>
            )}
        </div>
    )
}
