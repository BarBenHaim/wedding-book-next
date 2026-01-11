'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState, useEffect } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore' // ייבוא פיירבייס
import { db } from '../../../../lib/firebaseClient'

// --- אייקונים מעוצבים ---
const PdfIcon = () => (
    <svg className='w-6 h-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
        />
    </svg>
)

const LinkIcon = () => (
    <svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
        <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
        />
    </svg>
)

const CheckIcon = () => (
    <svg className='w-5 h-5 text-green-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={3} d='M5 13l4 4L19 7' />
    </svg>
)

const WhatsAppIcon = () => (
    <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 24 24'>
        <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
    </svg>
)

export default function WeddingPortal() {
    const { weddingId } = useParams()

    // State לשמות
    const [brideName, setBrideName] = useState('')
    const [groomName, setGroomName] = useState('')

    const [downloading, setDownloading] = useState(false)
    const [copied, setCopied] = useState(false)

    // טעינת שמות קיימים מה-DB
    useEffect(() => {
        if (!weddingId) return
        async function fetchNames() {
            try {
                const docRef = doc(db, 'weddings', weddingId)
                const docSnap = await getDoc(docRef)
                if (docSnap.exists()) {
                    const data = docSnap.data()
                    if (data.brideName) setBrideName(data.brideName)
                    if (data.groomName) setGroomName(data.groomName)
                }
            } catch (error) {
                console.error('Error fetching names:', error)
            }
        }
        fetchNames()
    }, [weddingId])

    // שמירת שמות ל-DB (באירוע onBlur)
    async function saveNamesToDB() {
        if (!weddingId) return
        try {
            const docRef = doc(db, 'weddings', weddingId)
            await updateDoc(docRef, {
                brideName: brideName,
                groomName: groomName,
            })
        } catch (error) {
            console.error('Error saving names:', error)
        }
    }

    const guestLink = useMemo(() => {
        const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        return `${baseUrl}/wedding/${weddingId}`
    }, [weddingId])

    async function handleDownloadPDF() {
        try {
            setDownloading(true)
            // נשמור שוב ליתר ביטחון לפני היצירה
            await saveNamesToDB()

            const params = new URLSearchParams({ weddingId: String(weddingId || '') })
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

    function handleCopy() {
        navigator.clipboard.writeText(guestLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    function handleShareWhatsApp() {
        // שימוש בשמות בהודעה אם קיימים
        const names = brideName && groomName ? `של ${brideName} ו${groomName}` : ''
        const text = `היי! נשמח שתעלו תמונות וברכות לאלבום החתונה ${names} כאן: ✨\n${guestLink}`

        const url = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(url, '_blank')
    }

    return (
        <div className='min-h-[calc(100vh-4rem)] bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center p-4 font-sans'>
            <div className='w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/50 p-8 md:p-12 relative overflow-hidden'>
                {/* קישוט רקע */}
                <div className='absolute top-0 right-0 w-64 h-64 bg-purple-200/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none'></div>
                <div className='absolute bottom-0 left-0 w-64 h-64 bg-pink-200/30 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none'></div>

                {/* לוגו */}
                <div className='text-center mb-6 relative z-10'>
                    <h1
                        className='text-4xl mb-2 drop-shadow-sm'
                        style={{
                            fontFamily: "'Great Vibes', cursive",
                            backgroundImage: 'linear-gradient(to right, #ec4899, #8b5cf6)',
                            WebkitBackgroundClip: 'text',
                            color: 'transparent',
                        }}
                    >
                        Wedding Tales
                    </h1>
                </div>

                {/* --- אזור שמות החתן והכלה (חדש!) --- */}
                <div className='relative z-10 flex items-center justify-center gap-4 mb-10' dir='rtl'>
                    <input
                        type='text'
                        value={brideName}
                        onChange={e => setBrideName(e.target.value)}
                        onBlur={saveNamesToDB}
                        placeholder='שם הכלה'
                        className='w-1/2 bg-transparent border-b-2 border-purple-200 focus:border-purple-500 outline-none text-center text-xl md:text-2xl font-bold text-gray-800 placeholder-purple-300 py-1 transition-colors'
                    />
                    <span className='text-3xl text-purple-400 font-[Great Vibes]'>&</span>
                    <input
                        type='text'
                        value={groomName}
                        onChange={e => setGroomName(e.target.value)}
                        onBlur={saveNamesToDB}
                        placeholder='שם החתן'
                        className='w-1/2 bg-transparent border-b-2 border-purple-200 focus:border-purple-500 outline-none text-center text-xl md:text-2xl font-bold text-gray-800 placeholder-purple-300 py-1 transition-colors'
                    />
                </div>

                <div className='space-y-8 relative z-10'>
                    {/* כפתור הורדת שלט */}
                    <div className='text-center'>
                        <h2 className='text-xl font-bold text-gray-800 mb-2'>הדפסת שלט לאירוע</h2>
                        <p className='text-gray-500 text-sm mb-6 px-4 leading-relaxed'>
                            הכינו את האורחים! הורידו שלט מעוצב עם ברקוד, הדפיסו, ותלו בכניסה לאולם.
                        </p>

                        <button
                            onClick={handleDownloadPDF}
                            disabled={downloading}
                            className='group relative w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-600 text-white font-bold text-lg shadow-lg hover:shadow-pink-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-70 disabled:hover:scale-100 cursor-pointer flex items-center justify-center gap-3'
                        >
                            {downloading ? (
                                <span className='flex items-center gap-2'>
                                    <span className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></span>
                                    מייצר PDF...
                                </span>
                            ) : (
                                <>
                                    <PdfIcon />
                                    <span>הורדת שלט מוכן (PDF)</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className='w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent'></div>

                    {/* שיתוף דיגיטלי */}
                    <div className='text-center'>
                        <h2 className='text-xl font-bold text-gray-800 mb-4'>או שתפו קישור ישיר 💌</h2>

                        <div className='flex items-center gap-2 bg-white/50 border border-gray-200 rounded-xl p-2 mb-4 hover:border-purple-200 transition-colors'>
                            <div className='flex-1 text-left text-sm text-gray-500 truncate px-2 font-mono dir-ltr'>
                                {guestLink}
                            </div>
                            <button
                                onClick={handleCopy}
                                className='bg-white text-gray-600 p-2.5 rounded-lg shadow-sm border border-gray-100 hover:bg-gray-50 hover:text-purple-600 transition'
                                title='העתק קישור'
                            >
                                {copied ? <CheckIcon /> : <LinkIcon />}
                            </button>
                        </div>

                        <button
                            onClick={handleShareWhatsApp}
                            className='w-full py-3.5 rounded-xl bg-[#25D366] text-white font-bold shadow-md hover:shadow-green-500/30 hover:bg-[#20bd5a] hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-2'
                        >
                            <WhatsAppIcon />
                            <span>שליחה בוואטסאפ</span>
                        </button>
                    </div>
                </div>
            </div>

            <p className='mt-8 text-gray-400 text-sm font-medium opacity-80'>נוצר באהבה עבור היום המיוחד שלכם ❤️</p>
        </div>
    )
}
