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
        <div className='min-h-screen flex flex-col items-center bg-gradient-to-b from-white to-[#f8f5ff] px-6 py-16 font-[Heebo] text-center'>
            {/* כותרת חתונתית */}
            <h1
                className='text-5xl mb-4'
                style={{
                    fontFamily: "'Great Vibes', cursive",
                    backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    fontWeight: '400',
                }}
            >
                Wedding Tales
            </h1>

            {/* טקסט פתיחה */}
            <h2 className='text-3xl font-semibold text-gray-800 mb-3'>השלט שלכם מוכן 💍</h2>
            <p className='text-gray-600 max-w-md mb-10 leading-relaxed'>
                הורידו שלט יפה ומוכן להדפסה או רק את הברקוד עצמו, ותנו לאורחים שלכם להפוך לחלק מהיום שלכם 🎉
            </p>

            {/* QR */}
            <div id='qr-code' className='bg-white p-8 rounded-2xl shadow-lg mb-6 border border-purple-100'>
                <QRCode value={guestLink} size={260} />
            </div>

            {/* כפתורים */}
            <div className='flex flex-col sm:flex-row gap-4 mb-10'>
                <button
                    onClick={handleDownloadPDF}
                    className='px-8 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition'
                >
                    📄 הורידו שלט מוכן להדפסה
                </button>

                <button
                    onClick={handleDownloadQR}
                    className='px-8 py-3 rounded-full bg-white border border-purple-300 text-purple-700 font-medium hover:bg-purple-50 transition'
                >
                    🎨 הורידו רק את הברקוד
                </button>
            </div>

            {/* אזור הוראות עם טיפים אישיים */}
            <div className='max-w-md text-gray-800 text-sm leading-relaxed space-y-4 bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm'>
                <h3 className='text-lg font-semibold text-purple-700 mb-2'>איך להשתמש בשלט? 💡</h3>
                <ul className='text-right list-disc list-inside space-y-2'>
                    <li>תלו את השלט במקום בולט — ליד הבר, עמדת הצילום או בכניסה.</li>
                    <li>מומלץ להדפיס על נייר איכותי בגודל A4 או A3.</li>
                    <li>אפשר להוסיף כמה שלטים באולם כדי שכל האורחים יראו.</li>
                    <li>אפשר גם להציג את הברקוד על מסך או טלוויזיה באולם.</li>
                    <li>כל סריקה תוביל ישירות לעמוד שלכם — בלי צורך באפליקציה!</li>
                </ul>
            </div>

            {/* קישור ישיר */}
            <div className='mt-10 text-xs text-gray-400 max-w-xs break-words'>
                <p>קישור לעמוד שלכם:</p>
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
            <div className='mt-14 text-gray-400 text-sm'>
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
