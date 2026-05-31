'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import { generateSlug } from '../../../../lib/generateSlug'
import { normalizeEventType, getEventConfig } from '../../../../lib/eventTypes'
import { NextIntlClientProvider, useTranslations, useLocale } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale, dirFor } from '@/i18n/locales'
import { getEntries } from '@/lib/classifyMedia'
import CoupleDesignPicker from '@/components/CoupleDesignPicker/CoupleDesignPicker'

// ייבוא רכיב לוח השנה המקצועי
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { registerLocale } from 'react-datepicker'
import { he } from 'date-fns/locale/he'
import { enUS } from 'date-fns/locale/en-US'
import { es as esLocale } from 'date-fns/locale/es'
import { it as itLocale } from 'date-fns/locale/it'
registerLocale('he', he)
registerLocale('en', enUS)
registerLocale('es', esLocale)
registerLocale('it', itLocale)

// Map our locale ids to the date-picker registration code. Kept as a
// separate map so we can swap (e.g. Spanish → es-419 for Latin America)
// without touching call sites.
const DATEPICKER_LOCALE = { he: 'he', en: 'en', es: 'es', it: 'it' }

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

// Background options reference messages keys instead of hardcoded labels,
// so each option's name lives in messages/{locale}.json and translates
// automatically.
const BG_OPTIONS = [
    { id: 'wedding-bg', file: 'wedding-bg.png', labelKey: 'bgClassic' },
    { id: 'wedding-bg2', file: 'wedding-bg2.png', labelKey: 'bgGoldMarble' },
]

// ── Outer: owns the runtime locale state and wraps everything in
// NextIntlClientProvider so descendants can call useTranslations() /
// useLocale(). Starts with Hebrew so the page is sensible during the
// initial Firestore fetch; the inner component bubbles the doc's
// locale up via onLocaleDiscovered() once it loads, and the provider
// re-renders with the right messages.
export default function WeddingPortal() {
    const [locale, setLocale] = useState('he')
    // Stable callback identity so the inner's useEffect dep array doesn't
    // re-fire the fetch on every render.
    const onLocaleDiscovered = useCallback(next => setLocale(prev => (prev === next ? prev : next)), [])
    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <PortalApp onLocaleDiscovered={onLocaleDiscovered} />
        </NextIntlClientProvider>
    )
}

function PortalApp({ onLocaleDiscovered }) {
    const { weddingId } = useParams()
    const t = useTranslations('portal')
    const locale = useLocale()

    // ── Event identity (admin-controlled — portal only READS this; the
    //    UI swaps name fields based on it). Defaults to 'wedding' so the
    //    page is sensible even before Firestore loads.
    const [eventType, setEventType] = useState('wedding')

    // ── Names. Wedding events use bride+groom; everything else (birthday /
    //    bar mitzvah / bat mitzvah) uses a single celebrant name.
    const [brideName, setBrideName] = useState('')
    const [groomName, setGroomName] = useState('')
    const [celebrantName, setCelebrantName] = useState('')
    // Birthday-only — drives "יום הולדת 78 / 78th birthday" style title
    // via buildTitle(). Stored as string in state so the input never
    // fights the user; converted to number on save.
    const [age, setAge] = useState('')

    const [weddingDate, setWeddingDate] = useState(null)
    const [slug, setSlug] = useState('')

    // Editable copy (customTitle/customSubtitle/customDescription) is
    // intentionally NOT loaded or edited here. It's owned by the
    // super-admin so couples + celebrants don't get overwhelmed by
    // marketing-copy choices. Firestore merge:true means our save
    // payloads preserve the admin's overrides untouched.

    const [copied, setCopied] = useState(false)
    const [bookToken, setBookToken] = useState('')
    const [entries, setEntries] = useState([])
    const [bookDesign, setBookDesign] = useState(null)
    const [bookRefresh, setBookRefresh] = useState(0)

    // Resolved event-type config — drives field labels + placeholders.
    // Now locale-aware: in English, cfg.label === 'Bar Mitzvah'.
    const cfg = useMemo(() => getEventConfig(eventType, locale), [eventType, locale])
    const isWedding = eventType === 'wedding'
    const isBirthday = eventType === 'birthday'

    // טעינת נתונים
    useEffect(() => {
        if (!weddingId) return
        async function fetchWeddingData() {
            try {
                const docRef = doc(db, 'weddings', weddingId)
                const docSnap = await getDoc(docRef)
                if (docSnap.exists()) {
                    const data = docSnap.data()
                    onLocaleDiscovered(normalizeLocale(data.locale))
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

                    // עיצוב הספר הנוכחי — לסימון הפריסט הפעיל בבורר
                    setBookDesign(data.bookDesign || data.coverDesign || null)

                    // טוקן לספר הדיגיטלי — אם אין, ניצור ונשמור (הבעלים מורשה לכתוב)
                    const existingToken =
                        Array.isArray(data.digitalTokens) && data.digitalTokens.length > 0
                            ? data.digitalTokens[0]
                            : null
                    if (existingToken) {
                        setBookToken(existingToken)
                    } else {
                        const tok =
                            typeof crypto !== 'undefined' && crypto.randomUUID
                                ? crypto.randomUUID()
                                : `tok-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
                        await setDoc(docRef, { digitalTokens: arrayUnion(tok) }, { merge: true })
                        setBookToken(tok)
                    }
                }
            } catch (error) {
                console.error('Error fetching:', error)
            }
        }
        fetchWeddingData()
    }, [weddingId, onLocaleDiscovered])

    // רשימת המעלים ברכות — מונה + שמות לתצוגה בפורטל
    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        getEntries(weddingId)
            .then(list => {
                if (!cancelled) setEntries(Array.isArray(list) ? list : [])
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [weddingId])

    // שמירה ל-DB. We send only the fields visible in the UI for the
    // current event type — that way switching the type from the admin
    // doesn't get the portal to wipe the OTHER set of name fields.
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
        } catch (error) {
            console.error('Error saving:', error)
        }
    }

    const guestLink = useMemo(() => {
        const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        if (slug) return `${baseUrl}/w/${slug}`
        return `${baseUrl}/wedding/${weddingId}`
    }, [weddingId, slug])

    // Display-friendly link
    const displayLink = useMemo(() => {
        const baseHost = process.env.NEXT_PUBLIC_BASE_URL
            ? new URL(process.env.NEXT_PUBLIC_BASE_URL).host
            : typeof window !== 'undefined'
              ? window.location.host
              : ''
        if (slug) return `${baseHost}/w/${slug}`
        const shortId = weddingId?.slice(0, 8) || ''
        return `${baseHost}/wedding/${shortId}...`
    }, [weddingId, slug])

    const bookLink = useMemo(() => {
        const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
        return bookToken ? `${baseUrl}/wedding/${weddingId}/book/${bookToken}` : ''
    }, [weddingId, bookToken])

    // שמירת העיצוב שהזוג בחר — כתיבה ישירה (הבעלים מורשה בחוקי Firestore)
    const handleSelectDesign = useCallback(
        async design => {
            if (!weddingId) return
            const docRef = doc(db, 'weddings', weddingId)
            await setDoc(
                docRef,
                { bookDesign: design, coverDesign: design, bookDesignSource: 'portal' },
                { merge: true },
            )
            setBookDesign(design)
            setBookRefresh(k => k + 1)
        },
        [weddingId],
    )

    return (
        <div
            className='min-h-[calc(100vh-4rem)] bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da] flex flex-col items-center justify-center px-4 py-6 font-sans'
            dir={dirFor(locale)}
        >
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
                    background-color: #aa8840 !important;
                    border-radius: 0.5rem;
                }
            `}</style>

            <div className='w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 p-6 md:p-8 relative overflow-hidden animate-scaleIn'>
                {/* לוגו */}
                <div className='text-center mb-3 relative z-10'>
                    <img
                        src='/logo-wt.png'
                        alt={t('logoAlt')}
                        className='h-12 w-auto mx-auto drop-shadow-[0_2px_8px_rgba(170,136,64,0.3)]'
                    />
                </div>

                {/* תג סוג האירוע — קבוע על-ידי הסופר-אדמין. הצגתו כאן
                    מבהירה לזוג/לחוגג/ת איזה סוג אירוע הוא עורך כרגע. */}
                <div className='text-center mb-5 relative z-10'>
                    <span className='inline-block bg-[#AA8840]/10 text-[#AA8840] text-[11px] font-bold tracking-wider uppercase px-3 py-1 rounded-full'>
                        {cfg.label}
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
                            placeholder={t('namePlaceholderBride')}
                            className='w-1/2 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                        />
                        <span className='text-3xl text-[#AA8840] font-[Great Vibes]'>&</span>
                        <input
                            type='text'
                            value={groomName}
                            onChange={e => setGroomName(e.target.value)}
                            onBlur={() => saveToDB()}
                            placeholder={t('namePlaceholderGroom')}
                            className='w-1/2 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                        />
                    </div>
                ) : (
                    <div className='relative z-10 mb-6'>
                        <div className={`flex items-center justify-center ${isBirthday ? 'gap-3' : ''}`}>
                            <input
                                type='text'
                                value={celebrantName}
                                onChange={e => setCelebrantName(e.target.value)}
                                onBlur={() => saveToDB()}
                                placeholder={t('namePlaceholderCelebrant')}
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
                                    placeholder={t('agePlaceholder')}
                                    className='w-20 bg-transparent border-b-2 border-[#AA8840]/20 focus:border-[#AA8840] outline-none text-center text-xl md:text-2xl font-bold text-gray-800 transition-all duration-300 focus:text-[#AA8840]'
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* לוח שנה מעוצב */}
                <div className='relative z-20 flex flex-col items-center mb-8'>
                    <label className='text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest'>
                        {isWedding ? t('dateLabelWedding') : t('dateLabelOther', { eventLabel: cfg.label })}
                    </label>
                    <DatePicker
                        selected={weddingDate}
                        onChange={date => {
                            setWeddingDate(date)
                            saveToDB(date)
                        }}
                        dateFormat='dd/MM/yyyy'
                        locale={DATEPICKER_LOCALE[locale] || 'en'}
                        placeholderText={t('datePickerPlaceholder')}
                        className='bg-[#AA8840]/5 text-[#AA8840] px-8 py-3 rounded-2xl border border-[#AA8840]/20 outline-none focus:ring-4 focus:ring-[#AA8840]/10 focus:border-[#AA8840] transition-all font-bold text-center cursor-pointer shadow-sm hover:bg-[#AA8840]/10 w-full'
                    />
                </div>

                {/* כפתורי פעולה */}
                <div className='space-y-6 relative z-10'>
                    {/* הספר שלכם — דפדוף בתוכן הנוכחי, בסגנון ה-viewer */}
                    <div>
                        <div className='flex items-center justify-between mb-3'>
                            <h2 className='text-lg font-bold text-gray-800'>הספר שלכם</h2>
                            <span className='text-xs font-semibold text-[#AA8840] bg-[#AA8840]/10 px-3 py-1 rounded-full'>
                                {entries.length > 0 ? `${entries.length} ברכות` : 'עדיין אין ברכות'}
                            </span>
                        </div>
                        {bookLink ? (
                            <>
                                <div
                                    className='rounded-[1.75rem] overflow-hidden shadow-2xl'
                                    style={{
                                        height: 600,
                                        background: 'radial-gradient(ellipse at 50% 30%, #2a1f17 0%, #14100c 100%)',
                                        border: '1px solid rgba(201,164,78,0.25)',
                                    }}
                                >
                                    <iframe
                                        key={bookRefresh}
                                        src={`${bookLink}?embed=1`}
                                        title='הספר שלכם'
                                        className='w-full h-full'
                                        style={{ border: 'none' }}
                                    />
                                </div>
                                <div className='text-center mt-2'>
                                    <a
                                        href={bookLink}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='inline-flex items-center justify-center gap-1 text-sm font-semibold text-[#AA8840] hover:underline'
                                    >
                                        פתחו במסך מלא ↗
                                    </a>
                                </div>
                            </>
                        ) : (
                            <p className='text-xs text-gray-400 text-center py-8'>טוען את הספר...</p>
                        )}
                    </div>

                    {/* בחירת עיצוב — נֵיטיב; הספר שלמעלה מתרענן מיד */}
                    <CoupleDesignPicker
                        activeDesign={bookDesign}
                        onSelect={handleSelectDesign}
                        title='בחרו עיצוב לספר'
                        hint='בחרו עיצוב — הספר שלמעלה יתעדכן מיד.'
                    />

                    <div className='w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent'></div>

                    <div className='text-center'>
                        <h2 className='text-lg font-bold text-gray-800 mb-1'>{t('shareTitle')}</h2>
                        <p className='text-xs text-gray-400 mb-4'>{t('shareSubtitle')}</p>
                        <a
                            href={`https://wa.me/?text=${encodeURIComponent('הוזמנתם לכתוב ברכה ולשתף רגע מהאירוע שלנו 💛 ' + guestLink)}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='w-full mb-3 flex items-center justify-center gap-2 rounded-2xl p-4 font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99]'
                            style={{ background: '#25D366' }}
                        >
                            <svg viewBox='0 0 24 24' className='w-5 h-5' fill='currentColor'>
                                <path d='M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z' />
                            </svg>
                            שיתוף בוואטסאפ
                        </a>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(guestLink)
                                setCopied(true)
                                setTimeout(() => setCopied(false), 2500)
                            }}
                            className={`w-full flex items-center gap-3 border rounded-2xl p-4 active:scale-[0.99] transition-all duration-200 ${copied ? 'border-emerald-300 bg-emerald-50/30' : 'bg-white/60 border-gray-200 hover:border-[#AA8840]/30 hover:bg-white/80'}`}
                        >
                            <div
                                className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${copied ? 'bg-emerald-100 text-emerald-600' : 'bg-[#AA8840]/10 text-[#AA8840]'}`}
                            >
                                {copied ? <CheckIcon /> : <LinkIcon />}
                            </div>
                            {/* text-start = aligns to the reading-direction's start.
                                In RTL → right edge (Hebrew); in LTR → left edge.
                                Was hardcoded to text-right which broke in LTR. */}
                            <div className='flex-1 text-start min-w-0'>
                                <p className='text-sm font-semibold text-gray-700 truncate'>{displayLink}</p>
                                <p className='text-[11px] text-gray-400 mt-0.5'>{t('copyHint')}</p>
                            </div>
                            <span
                                className={`text-sm font-bold flex-shrink-0 px-3 py-1.5 rounded-lg transition-all ${copied ? 'text-emerald-600 bg-emerald-50' : 'text-[#AA8840] bg-[#AA8840]/5'}`}
                            >
                                {copied ? t('copied') : t('copy')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
            <p className='mt-8 text-gray-400 text-xs font-medium opacity-60'>{t('footerTagline')}</p>
        </div>
    )
}
