'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import { generateSlug } from '../../../../lib/generateSlug'
import { normalizeEventType, getEventConfig } from '../../../../lib/eventTypes'

// ייבוא רכיב לוח השנה המקצועי
import DatePicker from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css"
import { registerLocale } from  "react-datepicker";
import { he } from 'date-fns/locale/he';
registerLocale('he', he);

// --- אייקונים מעוצבים ---
const PdfIcon = () => (<svg className='w-6 h-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' /></svg>)
const LinkIcon = () => (<svg className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' /></svg>)
const CheckIcon = () => (<svg className='w-5 h-5 text-green-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={3} d='M5 13l4 4L19 7' /></svg>)

const BG_OPTIONS = [
    { id: 'wedding-bg', file: 'wedding-bg.png', label: 'קלאסי' },
    { id: 'wedding-bg2', file: 'wedding-bg2.png', label: 'זהב שיש' },
]

// Per-event-type microcopy used by the celebrant name input. Each entry
// covers: the input placeholder, and the small heading shown above it.
//
// `wedding` isn't here — wedding takes a different path with bride+groom
// inputs side by side.
const NAME_COPY_BY_TYPE = {
    birthday: { placeholder: 'שם החוגג/ת', heading: 'שם החוגג/ת' },
    bar_mitzvah: { placeholder: 'שם הבר מצווה', heading: 'שם הבר מצווה' },
    bat_mitzvah: { placeholder: 'שם הבת מצווה', heading: 'שם הבת מצווה' },
}

function nameCopyFor(eventType) {
    return NAME_COPY_BY_TYPE[eventType] || NAME_COPY_BY_TYPE.birthday
}

export default function WeddingPortal() {
    const { weddingId } = useParams()

    // ── Event identity (admin-controlled — portal only READS this; the
    //    UI swaps name fields based on it). Defaults to 'wedding' so the
    //    page is sensible even before Firestore loads.
    const [eventType, setEventType] = useState('wedding')

    // ── Names. Wedding events use bride+groom; everything else (birthday /
    //    bar mitzvah / bat mitzvah) uses a single celebrant name.
    const [brideName, setBrideName] = useState('')
    const [groomName, setGroomName] = useState('')
    const [celebrantName, setCelebrantName] = useState('')
    // Birthday-only — drives "יום הולדת 78" style title via buildTitle().
    // Stored as a string in state so the input never fights with the user
    // (empty string is a valid "not set"); converted to number on save.
    const [age, setAge] = useState('')

    const [weddingDate, setWeddingDate] = useState(null)
    const [selectedBg, setSelectedBg] = useState('wedding-bg')
    const [slug, setSlug] = useState('')

    // Editable copy (customTitle/customSubtitle/customDescription) is
    // intentionally NOT loaded or edited here. It's owned by the
    // super-admin so couples + celebrants don't get overwhelmed by
    // marketing-copy choices. Firestore merge:true means our save
    // payloads preserve the admin's overrides untouched.

    const [downloading, setDownloading] = useState(false)
    const [copied, setCopied] = useState(false)

    // Resolved event-type config — drives field labels + placeholders.
    const cfg = useMemo(() => getEventConfig(eventType), [eventType])
    const isWedding = eventType === 'wedding'
    const isBirthday = eventType === 'birthday'
    const nameCopy = useMemo(() => nameCopyFor(eventType), [eventType])

    // טעינת נתונים
    useEffect(() => {
        if (!weddingId) return
        async function fetchWeddingData() {
            try {
                const docRef = doc(db, 'weddings', weddingId)
                const docSnap = await getDoc(docRef)
                if (docSnap.exists()) {
                    const data = docSnap.data()
                    setEventType(normalizeEventType(data.eventType))
                    if (data.brideName) setBrideName(data.brideName)
                    if (data.groomName) setGroomName(data.groomName)
                    if (data.celebrantName) setCelebrantName(data.celebrantName)
                    if (data.age != null && data.age !== '') setAge(String(data.age))
                    if (data.weddingDate) setWeddingDate(new Date(data.weddingDate))

                    // טעינת slug — אם אין, ניצור אחד אוטומטית
                    if (data.slug) {
                        setSlug(data.slug)
                    } else {
                        const newSlug = generateSlug()
                        await setDoc(docRef, { slug: newSlug }, { merge: true })
                        setSlug(newSlug)
                    }
                }
            } catch (error) { console.error('Error fetching:', error) }
        }
        fetchWeddingData()
    }, [weddingId])

    // שמירה ל-DB. We send only the fields visible in the UI for the
    // current event type — that way switching the type from the admin
    // doesn't get the portal to wipe the OTHER set of name fields.
    // Empty custom* strings persist as null so the guest page falls back
    // to the per-event-type defaults.
    async function saveToDB(updatedDate = weddingDate) {
        if (!weddingId) return
        try {
            const docRef = doc(db, 'weddings', weddingId)
            // Only fields owned by the portal. customTitle / customSubtitle /
            // customDescription are super-admin-only — leaving them out of the
            // payload + merge:true preserves whatever the admin set.
            const payload = {
                weddingDate: updatedDate ? updatedDate.toISOString().split('T')[0] : null,
            }
            if (isWedding) {
                payload.brideName = brideName
                payload.groomName = groomName
            } else {
                payload.celebrantName = celebrantName
                if (isBirthday) {
                    // Empty input → null (not 0). Only persist a real number.
                    const ageNum = Number(age)
                    payload.age = age !== '' && Number.isFinite(ageNum) ? ageNum : null
                }
            }
            await setDoc(docRef, payload, { merge: true })
        } catch (error) { console.error('Error saving:', error) }
    }

    const guestLink = useMemo(() => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        if (slug) return `${baseUrl}/w/${slug}`
        return `${baseUrl}/wedding/${weddingId}`
    }, [weddingId, slug])

    // Display-friendly link
    const displayLink = useMemo(() => {
        const baseHost = process.env.NEXT_PUBLIC_BASE_URL
            ? new URL(process.env.NEXT_PUBLIC_BASE_URL).host
            : (typeof window !== 'undefined' ? window.location.host : '')
        if (slug) return `${baseHost}/w/${slug}`
        const shortId = weddingId?.slice(0, 8) || ''
        return `${baseHost}/wedding/${shortId}...`
    }, [weddingId, slug])

    return (
        <div className='min-h-[calc(100vh-4rem)] bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] flex flex-col items-center justify-center px-4 py-6 font-sans' dir='rtl'>

            {/* CSS מותאם אישית ללוח השנה */}
            <style jsx global>{`
                .react-datepicker {
                    font-family: inherit;
                    border-radius: 1.5rem;
                    border: none;
                    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
                    overflow: hidden;
                }
                .react-datepicker__header {
                    background-color: #f0ebe3;
                    border-bottom: none;
                    padding-top: 1rem;
                }
                .react-datepicker__day--selected {
                    background-color: #AA8840 !important;
                    border-radius: 0.5rem;
                }
            `}</style>

            <div className='w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 p-6 md:p-8 relative overflow-hidden animate-scaleIn'>

                {/* לוגו */}
                <div className='text-center mb-3 relative z-10'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='h-12 w-auto mx-auto drop-shadow-[0_2px_8px_rgba(170,136,64,0.3)]' />
                </div>

                {/* תג סוג האירוע — קבוע על-ידי הסופר-אדמין. הצגתו כאן
                    מבהירה לזוג/לחוגג/ת איזה סוג אירוע הוא עורך כרגע. */}
                <div className='text-center mb-5 relative z-10'>
                    <span className='inline-block bg-[#AA8840]/10 text-[#AA8840] text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full'>
                        {cfg.hebrewLabel}
                    </span>
                </div>

                {/* שמות — מבנה משתנה לפי סוג האירוע */}
                {isWedding ? (
                    <div className='relative z-10 flex items-center justify-center gap-4 mb-6'>
                        <input
                            type='text'
                            value={brideName}
                            onChange={e => setBrideName(e.target.value)}
                            onBlur={() => saveToDB()}
                            placeholder='שם הכלה'
                            className='w-1/2 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                        />
                        <span className='text-3xl text-[#AA8840] font-[Great Vibes]'>&</span>
                        <input
                            type='text'
                            value={groomName}
                            onChange={e => setGroomName(e.target.value)}
                            onBlur={() => saveToDB()}
                            placeholder='שם החתן'
                            className='w-1/2 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                        />
                    </div>
                ) : (
                    <div className='relative z-10 mb-6'>
                        <label className='block text-[11px] font-bold text-gray-400 mb-2 text-center uppercase tracking-widest'>
                            {nameCopy.heading}
                        </label>
                        <div className={`flex items-center justify-center ${isBirthday ? 'gap-3' : ''}`}>
                            <input
                                type='text'
                                value={celebrantName}
                                onChange={e => setCelebrantName(e.target.value)}
                                onBlur={() => saveToDB()}
                                placeholder={nameCopy.placeholder}
                                className='flex-1 min-w-0 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                            />
                            {isBirthday && (
                                <input
                                    type='number'
                                    min={1}
                                    max={120}
                                    value={age}
                                    onChange={e => setAge(e.target.value)}
                                    onBlur={() => saveToDB()}
                                    placeholder='גיל'
                                    className='w-20 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* לוח שנה מעוצב */}
                <div className='relative z-20 flex flex-col items-center mb-8'>
                    <label className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest">
                        {isWedding ? 'תאריך החתונה שלכם' : `תאריך ה${cfg.hebrewLabel}`}
                    </label>
                    <DatePicker
                        selected={weddingDate}
                        onChange={(date) => { setWeddingDate(date); saveToDB(date); }}
                        dateFormat="dd/MM/yyyy"
                        locale="he"
                        placeholderText="לחצו לבחירת תאריך"
                        className="bg-[#AA8840]/5 text-[#AA8840] px-8 py-3 rounded-2xl border border-[#AA8840]/20 outline-none focus:ring-4 focus:ring-[#AA8840]/10 focus:border-[#AA8840] transition-all font-bold text-center cursor-pointer shadow-sm hover:bg-[#AA8840]/10 w-full"
                    />
                </div>

                {/* כפתורי פעולה */}
                <div className='space-y-6 relative z-10'>

                    {/* בחירת רקע לשלט */}
                    <div>
                        <label className='block text-sm font-bold text-gray-600 mb-3'>בחרו עיצוב לשלט</label>
                        <div className='grid grid-cols-2 gap-3'>
                            {BG_OPTIONS.map((bg) => {
                                const isSelected = selectedBg === bg.id
                                return (
                                    <button
                                        key={bg.id}
                                        onClick={() => setSelectedBg(bg.id)}
                                        className='group relative rounded-xl overflow-hidden transition-all duration-300'
                                        style={{
                                            border: isSelected ? '2.5px solid #AA8840' : '2.5px solid transparent',
                                            boxShadow: isSelected ? '0 4px 20px rgba(170,136,64,0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
                                            transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                        }}
                                    >
                                        <div className='aspect-[3/4] relative'>
                                            <img
                                                src={`/backgrounds/${bg.file}`}
                                                alt={bg.label}
                                                className='w-full h-full object-cover'
                                            />
                                            {/* Selected overlay */}
                                            {isSelected && (
                                                <div className='absolute inset-0 bg-[#AA8840]/[0.08] flex items-start justify-end p-2'>
                                                    <div className='w-6 h-6 rounded-full bg-[#AA8840] flex items-center justify-center shadow-md'>
                                                        <svg className='w-3.5 h-3.5 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={3}>
                                                            <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                                                        </svg>
                                                    </div>
                                                </div>
                                            )}
                                            {/* Hover overlay */}
                                            {!isSelected && (
                                                <div className='absolute inset-0 bg-black/0 group-hover:bg-black/[0.04] transition-colors duration-200' />
                                            )}
                                        </div>
                                        <div className='py-2 px-1 text-center' style={{ background: isSelected ? 'rgba(170,136,64,0.05)' : 'white' }}>
                                            <span className='text-xs font-bold' style={{ color: isSelected ? '#AA8840' : '#666' }}>
                                                {bg.label}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* כפתור הורדה */}
                    <button
                        onClick={async () => {
                            try {
                                setDownloading(true)
                                const bgFile = BG_OPTIONS.find(b => b.id === selectedBg)?.file || 'wedding-bg.png'
                                const url = `/api/generate-qr-pdf?weddingId=${weddingId}&bg=${encodeURIComponent(bgFile)}${slug ? `&slug=${slug}` : ''}`
                                const res = await fetch(url)
                                if (!res.ok) throw new Error('PDF generation failed')
                                const blob = await res.blob()
                                const a = document.createElement('a')
                                a.href = URL.createObjectURL(blob)
                                // Filename mirrors the event identity. For weddings keep
                                // the historical "bride-groom" pattern; otherwise use the
                                // celebrant name (or fall back to the event-type label).
                                const filenameStem = isWedding
                                    ? [brideName, groomName].filter(Boolean).join('-') || 'wedding'
                                    : celebrantName || cfg.id
                                a.download = `WeddingTales-${filenameStem}.pdf`
                                a.click()
                                URL.revokeObjectURL(a.href)
                            } catch (err) {
                                console.error('PDF download error:', err)
                                alert('שגיאה ביצירת ה-PDF. נסו שוב.')
                            } finally {
                                setDownloading(false)
                            }
                        }}
                        disabled={downloading}
                        className='w-full py-4 px-6 rounded-2xl gold-shimmer text-white font-bold text-lg shadow-lg hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100'
                    >
                        {downloading ? (
                            <>
                                <svg className='w-6 h-6 animate-spin' fill='none' viewBox='0 0 24 24'>
                                    <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'/>
                                    <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8v8z'/>
                                </svg>
                                <span>יוצר PDF...</span>
                            </>
                        ) : (
                            <>
                                <PdfIcon /> <span>הורדת שלט מוכן (PDF)</span>
                            </>
                        )}
                    </button>

                    <div className='w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent'></div>

                    <div className='text-center'>
                        <h2 className='text-lg font-bold text-gray-800 mb-1'>שיתוף קישור ישיר</h2>
                        <p className='text-xs text-gray-400 mb-4'>שלחו את הקישור לאורחים כדי שיוכלו להעלות ברכות ותמונות</p>
                        <button
                            onClick={() => { navigator.clipboard.writeText(guestLink); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                            className={`w-full flex items-center gap-3 border rounded-2xl p-4 active:scale-[0.99] transition-all duration-200 ${copied ? 'border-emerald-300 bg-emerald-50/30' : 'bg-white/60 border-gray-200 hover:border-[#AA8840]/30 hover:bg-white/80'}`}
                        >
                            <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${copied ? 'bg-emerald-100 text-emerald-600' : 'bg-[#AA8840]/10 text-[#AA8840]'}`}>
                                {copied ? <CheckIcon /> : <LinkIcon />}
                            </div>
                            <div className='flex-1 text-right min-w-0'>
                                <p className='text-sm font-semibold text-gray-700 truncate'>{displayLink}</p>
                                <p className='text-[11px] text-gray-400 mt-0.5'>לחצו להעתקת הקישור המלא</p>
                            </div>
                            <span className={`text-sm font-bold flex-shrink-0 px-3 py-1.5 rounded-lg transition-all ${copied ? 'text-emerald-600 bg-emerald-50' : 'text-[#AA8840] bg-[#AA8840]/5'}`}>
                                {copied ? 'הועתק!' : 'העתק'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
            <p className='mt-8 text-gray-400 text-xs font-medium opacity-60'>נוצר באהבה עבור היום המיוחד שלכם</p>
        </div>
    )
}
