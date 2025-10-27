'use client'

import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'

export default function WeddingPortal() {
    const { weddingId } = useParams()
    const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

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

    function handleDownloadQR() {
        const svg = document.querySelector('#qr-code svg')
        const serializer = new XMLSerializer()
        const svgData = serializer.serializeToString(svg)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()

        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        img.onload = () => {
            canvas.width = img.width * 4
            canvas.height = img.height * 4
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            const pngFile = canvas.toDataURL('image/png')
            const a = document.createElement('a')
            a.href = pngFile
            a.download = `WeddingTales-QR-${weddingId}.png`
            a.click()
            URL.revokeObjectURL(url)
        }

        img.src = url
    }

    return (
        <div className='min-h-screen flex flex-col items-center bg-gradient-to-br from-white via-purple-50 to-pink-50 px-6 py-16 font-[Heebo] text-center'>
            {/* פתיח */}
            <h1 className='text-4xl font-bold text-gray-900 mb-4'>העמוד האישי שלכם מוכן 🎉</h1>
            <p className='text-gray-700 max-w-md mb-10 leading-relaxed'>
                מכאן תוכלו לשתף את האורחים, להוריד שלט מוכן להדפסה או רק את הברקוד עצמו. כל מה שצריך כדי לגרום לכולם
                להיות חלק מהיום שלכם 💍
            </p>

            {/* QR */}
            <div id='qr-code' className='bg-white p-6 rounded-xl shadow-md mb-6'>
                <QRCode value={guestLink} size={240} />
            </div>

            {/* כפתורים */}
            <div className='flex flex-col sm:flex-row gap-4 mb-12'>
                <button
                    onClick={handleDownloadPDF}
                    className='px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition'
                >
                    הורידו שלט להדפסה 🖨️
                </button>

                <button
                    onClick={handleDownloadQR}
                    className='px-6 py-3 rounded-full bg-white border border-purple-300 text-purple-700 font-medium hover:bg-purple-50 transition'
                >
                    הורידו רק את הברקוד 📷
                </button>
            </div>

            {/* המלצות קצרות */}
            <div className='max-w-md text-gray-700 text-sm leading-relaxed space-y-3'>
                <p>💡 מומלץ להדפיס כמה עותקים של השלט ולתלות באזורים מרכזיים – ליד הבר, עמדת הצילום והכניסה.</p>
                <p>📱 אפשר גם לשלוח את הקישור בקבוצת הוואטסאפ אחרי האירוע כדי לאסוף עוד רגעים וברכות.</p>
                <p>✨ כל מה שתעלו יופיע אוטומטית בספר החתונה שלכם.</p>
            </div>

            {/* קישור ישיר */}
            <div className='mt-12 text-xs text-gray-400 max-w-xs break-words'>
                <p>קישור ישיר לעמוד האורחים:</p>
                <a
                    href={guestLink}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-purple-600 hover:underline break-all'
                >
                    {guestLink}
                </a>
            </div>

            {/* חתימה */}
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
