'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import QRCode from 'react-qr-code'

export default function WeddingPortal() {
    const { weddingId } = useParams()
    const guestLink = `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`

    const [fgColor, setFgColor] = useState('#8B5CF6')
    const [copied, setCopied] = useState(false)

    async function handleDownloadPDF() {
        const params = new URLSearchParams({
            weddingId,
            fg: fgColor.replace('#', ''),
        })
        const response = await fetch(`/api/generate-qr-pdf?${params.toString()}`)
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

    function handleCopy() {
        navigator.clipboard.writeText(guestLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className='min-h-screen flex flex-col items-center bg-gradient-to-b from-white to-[#f8f5ff] px-6 py-20 font-[Heebo] text-center'>
            {/* כותרת */}
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

            <h2 className='text-3xl font-semibold text-gray-800 mb-2'>עמוד החתונה שלכם מוכן!</h2>
            <p className='text-gray-600 max-w-md mb-12 leading-relaxed'>
                הורידו שלט מוכן או את הברקוד בלבד, ותנו לאורחים שלכם להפוך לחלק מהיום שלכם
            </p>

            {/* קופסה מרכזית */}
            <div className='bg-white p-10 rounded-3xl shadow-lg border border-purple-100 flex flex-col items-center w-full max-w-120'>
                {/* ברקוד */}
                <div id='qr-code' className='mb-6'>
                    <QRCode value={guestLink} size={260} fgColor={fgColor} bgColor='#ffffff' level='H' />
                </div>

                {/* בחירת צבע */}
                <div className='flex items-center justify-center gap-3 mb-6'>
                    <label className='text-sm text-gray-700 font-medium'>בחירת צבע</label>
                    <input
                        type='color'
                        value={fgColor}
                        onChange={e => setFgColor(e.target.value)}
                        className='w-6 h-6 cursor-pointer'
                    />
                </div>

                {/* כפתורי הורדה */}
                <div className='flex flex-col sm:flex-row gap-4 w-full'>
                    <button
                        onClick={handleDownloadPDF}
                        className='flex-1 px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition'
                    >
                        הורידו שלט מוכן
                    </button>
                    <button
                        onClick={handleDownloadQR}
                        className='flex-1 px-6 py-3 rounded-full bg-white border border-purple-300 text-purple-700 font-medium hover:bg-purple-50 transition'
                    >
                        הורידו רק את הברקוד
                    </button>
                </div>
            </div>

            {/* קישור ישיר + העתקה */}
            <div className='mt-10 flex flex-col items-center text-sm text-gray-600'>
                <p className='mb-2'>קישור לעמוד שלכם:</p>
                <div className='flex items-center gap-3 bg-white shadow-sm px-4 py-2 border border-purple-100'>
                    <a
                        href={guestLink}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-purple-600 font-medium hover:underline break-all max-w-[220px] overflow-hidden text-ellipsis'
                    >
                        {guestLink}
                    </a>
                    <button
                        onClick={handleCopy}
                        className='text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 font-medium hover:bg-purple-200 transition'
                    >
                        {copied ? '✔ הועתק' : 'העתק'}
                    </button>
                </div>
            </div>

            {/* הוראות */}
            <div className='mt-14 max-w-md text-gray-800 text-sm leading-relaxed space-y-4 bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-purple-100 shadow-sm'>
                <h3 className='text-lg font-semibold text-purple-700 mb-2'>קצת טיפים מאיתנו</h3>
                <ul className='text-right list-disc list-inside space-y-2'>
                    <li>תלו את השלט במקום בולט — ליד הבר, עמדת הצילום או בכניסה.</li>
                    <li>הדפיסו על נייר איכותי בגודל A4 או A3.</li>
                    <li>אפשר לשים כמה שלטים באולם כדי שכולם יראו.</li>
                    <li>או להציג את הברקוד על מסך או טלוויזיה.</li>
                </ul>
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
