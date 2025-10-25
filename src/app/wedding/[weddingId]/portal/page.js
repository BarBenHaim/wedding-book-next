'use client'

import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { useState } from 'react'

export default function WeddingPortal() {
    const { weddingId } = useParams()
    const [showQR, setShowQR] = useState(false)
    const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

    function handleShare() {
        const text = `💍 ברוכים הבאים לחתונה שלנו!\n\nהעלו תמונות וברכות בקישור 👇\n${guestLink}`
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(url, '_blank')
    }

    async function handleDownloadPDF() {
        const response = await fetch(`/api/generate-qr-pdf?weddingId=${weddingId}`)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `WeddingTales-QR-${weddingId}.pdf`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className='min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-purple-50 to-pink-50 px-6 py-12 text-center font-[Heebo]'>
            <h1 className='text-3xl font-bold text-gray-900 mb-4'>🎉 מזל טוב!</h1>
            <p className='text-gray-600 max-w-md mb-8'>
                זהו העמוד האישי שלכם ב-Wedding Tales. מכאן תוכלו לשתף את האורחים, להציג את הברקוד באולם ולהדפיס גרסה
                מוכנה.
            </p>

            {!showQR ? (
                <button
                    onClick={() => setShowQR(true)}
                    className='px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition'
                >
                    הצג ברקוד על המסך 📱
                </button>
            ) : (
                <div className='bg-white p-6 rounded-xl shadow-lg mb-6'>
                    <QRCode value={guestLink} size={240} />
                </div>
            )}

            <div className='flex flex-col sm:flex-row gap-4 mt-4'>
                <button
                    onClick={handleShare}
                    className='px-5 py-2 rounded-full bg-green-500 text-white font-medium hover:bg-green-600 transition'
                >
                    שתפו בוואטסאפ 💬
                </button>

                <button
                    onClick={handleDownloadPDF}
                    className='px-5 py-2 rounded-full bg-purple-600 text-white font-medium hover:bg-purple-700 transition'
                >
                    הורידו קובץ להדפסה 🖨️
                </button>
            </div>

            <div className='mt-10 text-sm text-gray-500 max-w-xs'>
                <p>1️⃣ סורקים את הברקוד</p>
                <p>2️⃣ מצלמים ומברכים</p>
                <p>3️⃣ הכול נאסף לספר שלכם 🎁</p>
            </div>
        </div>
    )
}
