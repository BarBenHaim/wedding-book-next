'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import QRCodeStyling from 'qr-code-styling'

export default function WeddingPortal() {
    const { weddingId } = useParams()
    const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`
    const qrRef = useRef(null)
    const qrCode = useRef(null)

    useEffect(() => {
        qrCode.current = new QRCodeStyling({
            data: guestLink,
            width: 240,
            height: 240,
            type: 'svg',
            margin: 10,
            qrOptions: {
                errorCorrectionLevel: 'H',
            },
            dotsOptions: {
                color: '#9333ea', // סגול (כמו המותג)
                type: 'rounded',
            },
            backgroundOptions: {
                color: '#ffffff',
            },
            cornersSquareOptions: {
                color: '#ec4899', // ורוד (כמו המותג)
                type: 'extra-rounded',
            },
            cornersDotOptions: {
                color: '#9333ea',
            },
            image: '/logo-small.png', // תמונה קטנה במרכז (תוסיף ל-public)
            imageOptions: {
                crossOrigin: 'anonymous',
                margin: 4,
                imageSize: 0.3,
            },
        })

        qrCode.current.append(qrRef.current)
    }, [guestLink])

    async function handleDownload(type = 'png') {
        await qrCode.current.download({ name: `WeddingTales-QR-${weddingId}`, extension: type })
    }

    return (
        <div className='min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-purple-50 to-pink-50 px-6 py-16 font-[Heebo] text-center'>
            <h1 className='text-4xl font-bold text-gray-900 mb-4'>העמוד האישי שלכם מוכן 🎉</h1>
            <p className='text-gray-700 max-w-md mb-10 leading-relaxed'>
                הורידו שלט להדפסה או את הברקוד המעוצב — והפכו את זה לחלק מהחתונה שלכם 💍
            </p>

            <div ref={qrRef} className='bg-white p-6 rounded-xl shadow-md mb-6' />

            <div className='flex flex-col sm:flex-row gap-4'>
                <button
                    onClick={() => handleDownload('pdf')}
                    className='px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition'
                >
                    הורידו שלט להדפסה 🖨️
                </button>

                <button
                    onClick={() => handleDownload('png')}
                    className='px-6 py-3 rounded-full bg-white border border-purple-300 text-purple-700 font-medium hover:bg-purple-50 transition'
                >
                    הורידו רק את הברקוד 🎨
                </button>
            </div>

            <div className='mt-10 text-gray-600 text-sm max-w-sm leading-relaxed'>
                <p>💡 מומלץ לשים את הברקוד ליד הבר או עמדת הצילום.</p>
                <p>🖼️ אפשר לשלב אותו בעיצוב השלטים שלכם או על המסך באולם.</p>
                <p>📱 כל סריקה תוביל את האורחים לעמוד הברכות שלכם.</p>
            </div>

            <div className='mt-16 text-gray-500 text-sm'>
                <p>
                    נוצר באהבה על ידי{' '}
                    <span
                        style={{
                            fontFamily: "'Great Vibes', cursive",
                            fontSize: '20px',
                            backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                            WebkitBackgroundClip: 'text',
                            color: 'transparent',
                        }}
                    >
                        Wedding Tales
                    </span>
                </p>
            </div>
        </div>
    )
}
