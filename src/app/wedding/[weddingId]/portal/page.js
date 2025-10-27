'use client'

import { useParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import QRCode from 'react-qr-code'

export default function WeddingPortal() {
    const { weddingId } = useParams()
    const guestLink = useMemo(() => `${process.env.NEXT_PUBLIC_BASE_URL}/wedding/${weddingId}`, [weddingId])

    const [fgColor, setFgColor] = useState('#8B5CF6')
    const [copied, setCopied] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const qrRef = useRef(null)

    const presets = ['#8B5CF6', '#EC4899', '#111827', '#10B981', '#F59E0B']

    async function handleDownloadPDF() {
        try {
            setDownloading(true)
            const params = new URLSearchParams({
                weddingId: String(weddingId || ''),
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
        } finally {
            setDownloading(false)
        }
    }

    function handleDownloadQR() {
        const svg = qrRef.current?.querySelector('svg')
        if (!svg) return
        const serializer = new XMLSerializer()
        const svgData = serializer.serializeToString(svg)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        img.onload = () => {
            const scale = 4
            canvas.width = img.width * scale
            canvas.height = img.height * scale
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
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
        setTimeout(() => setCopied(false), 1800)
    }

    async function handleShare() {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Wedding Tales', text: 'קישור לעמוד החתונה שלנו', url: guestLink })
            } else {
                handleCopy()
            }
        } catch {}
    }

    function handleShareWhatsApp() {
        const url = `https://wa.me/?text=${encodeURIComponent(`מצטרפים לסיפור שלנו ✨\n${guestLink}`)}`
        window.open(url, '_blank')
    }

    return (
        <div className='min-h-screen bg-gradient-to-b from-white to-[#f8f5ff] px-6 py-10 font-[Heebo]'>
            <div className='mx-auto max-w-6xl'>
                {/* כותרת עליונה */}
                <div className='flex flex-col items-center text-center'>
                    <h1
                        className='text-5xl mb-2'
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
                    <h2 className='text-2xl md:text-3xl font-semibold text-gray-800 mb-2'>פורטל ה-QR והשיתוף שלכם</h2>
                    <p className='text-gray-600 max-w-2xl mb-10 leading-relaxed'>
                        הורידו שלט מוכן או את הברקוד בלבד, שתפו את הקישור—והאורחים הופכים לחלק מהסיפור שלכם.
                    </p>
                </div>

                {/* פריסה: דו־עמודתית במסכים רחבים */}
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 items-start'>
                    {/* עמודה: QR ותצוגה */}
                    <section className='bg-white rounded-3xl shadow-lg border border-purple-100 p-6 md:p-8'>
                        <h3 className='text-lg font-semibold text-gray-800 mb-4'>תצוגת הברקוד</h3>

                        <div className='flex items-center justify-center'>
                            <div
                                id='qr-code'
                                ref={qrRef}
                                className='p-4 rounded-2xl border border-gray-100 bg-white shadow-sm'
                                style={{ direction: 'ltr' }}
                            >
                                <QRCode value={guestLink} size={260} fgColor={fgColor} bgColor='#ffffff' level='H' />
                            </div>
                        </div>

                        {/* בחירת צבע + Presets */}
                        <div className='mt-6'>
                            <label className='block text-sm font-medium text-gray-700 mb-2'>בחרו צבע לברקוד</label>
                            <div className='flex items-center gap-3'>
                                <input
                                    type='color'
                                    value={fgColor}
                                    onChange={e => setFgColor(e.target.value)}
                                    className='w-8 h-8 rounded-md cursor-pointer border'
                                    aria-label='בחירת צבע מותאם אישית'
                                />
                                <div className='flex items-center gap-2'>
                                    {presets.map(c => (
                                        <button
                                            key={c}
                                            aria-label={`בחירת צבע ${c}`}
                                            onClick={() => setFgColor(c)}
                                            className='w-7 h-7 rounded-full border hover:scale-105 transition cursor-pointer'
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* כפתורי הורדה */}
                        <div className='mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3'>
                            <button
                                onClick={handleDownloadPDF}
                                disabled={downloading}
                                className='px-6 py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium shadow-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer'
                            >
                                {downloading ? 'מכין...' : 'הורידו שלט מוכן (PDF)'}
                            </button>
                            <button
                                onClick={handleDownloadQR}
                                className='px-6 py-3 rounded-full bg-white border border-purple-300 text-purple-700 font-medium hover:bg-purple-50 transition cursor-pointer'
                            >
                                הורידו רק את הברקוד (PNG)
                            </button>
                        </div>

                        {/* טיפים */}
                        <div className='mt-8 bg-white/70 backdrop-blur-sm rounded-2xl p-5 border border-purple-100'>
                            <h4 className='text-sm font-semibold text-purple-700 mb-2'>טיפים לשימוש</h4>
                            <ul className='text-sm text-gray-700 list-disc list-inside space-y-1'>
                                <li>לתלות ליד הבר / בכניסה / עמדת צילום.</li>
                                <li>להדפיס A4/A3 על נייר איכותי או להציג על מסך.</li>
                                <li>מומלץ כמה עותקים ברחבי האולם.</li>
                            </ul>
                        </div>
                    </section>

                    {/* עמודה: לינק, שיתוף, הסבר קצר */}
                    <section className='space-y-6'>
                        {/* קופסת קישור + העתקה/פתיחה */}
                        <div className='bg-white rounded-3xl shadow-lg border border-purple-100 p-6 md:p-8'>
                            <h3 className='text-lg font-semibold text-gray-800 mb-4'>קישור ישיר לאורחים</h3>
                            <div className='flex flex-col gap-3'>
                                <div className='flex items-center gap-3'>
                                    <input
                                        readOnly
                                        value={guestLink}
                                        className='flex-1 px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 text-sm selection:bg-purple-100'
                                    />
                                    <button
                                        onClick={handleCopy}
                                        className='px-4 py-2 rounded-xl bg-purple-100 text-purple-700 text-sm font-medium hover:bg-purple-200 transition cursor-pointer'
                                    >
                                        {copied ? '✔ הועתק' : 'העתק'}
                                    </button>
                                </div>
                                <div className='flex flex-wrap gap-3'>
                                    <a
                                        href={guestLink}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='px-4 py-2 rounded-xl bg-gray-100 text-gray-800 text-sm hover:bg-gray-200 transition cursor-pointer'
                                    >
                                        פתיחה בעמוד חדש
                                    </a>
                                    <button
                                        onClick={handleShare}
                                        className='px-4 py-2 rounded-xl bg-green-600 text-white text-sm hover:opacity-90 transition cursor-pointer'
                                    >
                                        שיתוף מהיר (נייד)
                                    </button>
                                    <button
                                        onClick={handleShareWhatsApp}
                                        className='px-4 py-2 rounded-xl bg-[#25D366] text-white text-sm hover:opacity-90 transition cursor-pointer'
                                    >
                                        שיתוף ב-WhatsApp
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* “איך זה עובד” */}
                        <div className='bg-white rounded-3xl shadow-lg border border-purple-100 p-6 md:p-8'>
                            <h3 className='text-lg font-semibold text-gray-800 mb-4'>איך זה עובד?</h3>
                            <ol className='space-y-3 text-sm text-gray-700'>
                                <li className='flex gap-3'>
                                    <span className='inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold'>
                                        1
                                    </span>
                                    תולים שלט עם QR או משתפים את הקישור.
                                </li>
                                <li className='flex gap-3'>
                                    <span className='inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold'>
                                        2
                                    </span>
                                    האורחים סורקים, מעלים תמונות וכותבים ברכות.
                                </li>
                                <li className='flex gap-3'>
                                    <span className='inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold'>
                                        3
                                    </span>
                                    אתם מקבלים ספר חתונה אמיתי—דיגיטלי ומודפס.
                                </li>
                            </ol>
                        </div>

                        {/* חתימה */}
                        <div className='text-center text-gray-400 text-sm pt-2'>
                            נוצר באהבה על ידי{' '}
                            <span
                                style={{
                                    fontFamily: "'Great Vibes', cursive",
                                    fontSize: '18px',
                                    backgroundImage: 'linear-gradient(to right, #ec4899, #9333ea)',
                                    WebkitBackgroundClip: 'text',
                                    color: 'transparent',
                                }}
                            >
                                Wedding Tales
                            </span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
