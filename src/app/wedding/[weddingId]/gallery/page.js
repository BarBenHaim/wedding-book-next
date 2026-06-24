'use client'

// Public read-only gallery — lets a guest browse every blessing
// already submitted for this event. Currently only linked from the
// poker variant ("הממלכה" → "כל הברכות") but the route works for
// any event type the super-admin enables.
//
// Reads from `weddings/{id}/entries` directly via the client SDK.
// Firestore security rules already gate write access; reads on this
// subcollection are allowed for guests so the gallery doesn't need a
// dedicated server endpoint.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getMessages } from '@/i18n/getMessages'
import { normalizeLocale } from '@/i18n/locales'

export default function GalleryPage() {
    const { weddingId } = useParams()
    const [locale, setLocale] = useState('he')
    const [eventType, setEventType] = useState('wedding')
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        ;(async () => {
            try {
                const wSnap = await getDoc(doc(db, 'weddings', weddingId))
                if (!cancelled && wSnap.exists()) {
                    const data = wSnap.data()
                    setLocale(normalizeLocale(data.locale))
                    if (data.eventType) setEventType(data.eventType)
                }
            } catch {
                /* keep defaults */
            }

            try {
                // Order by `timestamp` — that's the field every write
                // path actually sets (uploadEntry, classifyMedia, the
                // /api/entries POST). orderBy in Firestore implicitly
                // filters out docs that lack the field, so ordering
                // by the wrong name returns zero rows even when the
                // collection is full.
                const entriesSnap = await getDocs(
                    query(
                        collection(db, 'weddings', weddingId, 'entries'),
                        orderBy('timestamp', 'desc'),
                    ),
                )
                if (cancelled) return
                setEntries(
                    entriesSnap.docs.map(d => {
                        const e = d.data()
                        return {
                            id: d.id,
                            name: e.name || '',
                            blessing: e.blessing || e.text || '',
                            preserveLineBreaks: !!e.preserveLineBreaks,
                            photoUrl: e.photoUrl || e.imageUrl || '',
                            createdAt:
                                e.timestamp?.toDate?.()?.toISOString?.() ||
                                e.createdAt?.toDate?.()?.toISOString?.() ||
                                null,
                        }
                    }),
                )
            } catch (err) {
                console.error('[gallery] load entries failed', err)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId])

    return (
        <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
            <GalleryApp eventType={eventType} entries={entries} loading={loading} />
        </NextIntlClientProvider>
    )
}

function GalleryApp({ eventType, entries, loading }) {
    const t = useTranslations('photo')
    const router = useRouter()
    const { weddingId } = useParams()
    const isPoker = eventType === 'poker'

    // Hide global header + footer so the felt page (poker) takes the
    // full viewport. Same DOM-toggle approach used in the photo page.
    useEffect(() => {
        if (!isPoker || typeof document === 'undefined') return
        const header = document.querySelector('body > header')
        const footer = document.querySelector('body > footer')
        const prevHeader = header?.style.display
        const prevFooter = footer?.style.display
        if (header) header.style.display = 'none'
        if (footer) footer.style.display = 'none'
        return () => {
            if (header) header.style.display = prevHeader || ''
            if (footer) footer.style.display = prevFooter || ''
        }
    }, [isPoker])

    const palette = isPoker
        ? {
              pageBg: '#0a2818',
              pageBgImage: 'url(/backgrounds/pokerbg.webp)',
              titleColor: '#fde9b3',
              subtitleColor: '#94b09b',
              cardBg: 'linear-gradient(180deg, #1c2820 0%, #131d17 100%)',
              cardBorder: '1px solid rgba(212,175,55,0.28)',
              labelColor: '#e8d9a8',
              textColor: '#fde9b3',
              backBg: 'linear-gradient(180deg, #c43b3b 0%, #7d1414 100%)',
          }
        : {
              pageBg: '#f8f4ec',
              pageBgImage: 'none',
              titleColor: '#1a1410',
              subtitleColor: '#9a8a72',
              cardBg: '#ffffff',
              cardBorder: '1px solid rgba(212,184,103,0.22)',
              labelColor: '#1a1410',
              textColor: '#3d2e1a',
              backBg: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
          }

    return (
        <div
            className={`flex flex-col items-center px-4 py-8 font-sans relative overflow-x-hidden ${
                isPoker ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'
            }`}
            style={{
                backgroundColor: palette.pageBg,
                backgroundImage: palette.pageBgImage,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundAttachment: 'fixed',
            }}
        >
            <div className='relative z-10 w-full max-w-[26rem]'>
                {/* Back button — sends the guest back to the blessing form */}
                <button
                    onClick={() => router.push(`/wedding/${weddingId}/photo`)}
                    className='mb-5 rounded-full text-white font-bold text-[13px] flex items-center gap-1.5 transition-all active:scale-[0.98]'
                    style={{
                        background: palette.backBg,
                        padding: '9px 14px',
                        boxShadow: '0 8px 18px -8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.20)',
                    }}
                >
                    <svg viewBox='0 0 24 24' className='w-[14px] h-[14px] rtl:rotate-180' fill='none' stroke='currentColor' strokeWidth={2}>
                        <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                    </svg>
                    <span>חזרה</span>
                </button>

                <h2
                    className='font-bold text-center mb-1'
                    style={{
                        color: palette.titleColor,
                        fontSize: '28px',
                        textShadow: isPoker ? '0 2px 8px rgba(0,0,0,0.6)' : 'none',
                    }}
                >
                    כל הברכות
                </h2>
                <p
                    className='text-center mb-7'
                    style={{
                        color: palette.subtitleColor,
                        fontSize: '13.5px',
                        textShadow: isPoker ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                    }}
                >
                    {entries.length > 0
                        ? `${entries.length} ברכות עד כה`
                        : 'עדיין לא נשלחו ברכות'}
                </p>

                {loading && (
                    <div
                        className='text-center py-12'
                        style={{ color: palette.subtitleColor, fontSize: '14px' }}
                    >
                        טוען...
                    </div>
                )}

                {!loading && entries.length === 0 && (
                    <div
                        className='rounded-2xl text-center px-6 py-10'
                        style={{
                            background: palette.cardBg,
                            border: palette.cardBorder,
                            color: palette.subtitleColor,
                            fontSize: '14px',
                        }}
                    >
                        היו הראשונים לכתוב ברכה!
                    </div>
                )}

                {!loading && entries.length > 0 && (
                    <div className='flex flex-col gap-4'>
                        {entries.map(e => (
                            <div
                                key={e.id}
                                className='rounded-2xl overflow-hidden'
                                style={{
                                    background: palette.cardBg,
                                    border: palette.cardBorder,
                                    boxShadow: '0 12px 28px -16px rgba(0,0,0,0.4)',
                                }}
                            >
                                {e.photoUrl && (
                                    <img
                                        src={e.photoUrl}
                                        alt=''
                                        className='w-full aspect-[4/3] object-cover'
                                        loading='lazy'
                                    />
                                )}
                                <div className='px-4 pt-3 pb-4'>
                                    <div
                                        className='font-bold mb-1'
                                        style={{ color: palette.labelColor, fontSize: '15px' }}
                                    >
                                        {e.name || 'אנונימי'}
                                    </div>
                                    {/* Match the book: render the blessing exactly as
                                        typed when the admin set preserveLineBreaks on
                                        this entry; otherwise collapse whitespace to a
                                        single flowing line. */}
                                    <div
                                        className='leading-relaxed'
                                        style={{ color: palette.textColor, fontSize: '14px', whiteSpace: e.preserveLineBreaks ? 'pre-wrap' : 'normal' }}
                                    >
                                        {e.preserveLineBreaks ? e.blessing : (e.blessing || '').replace(/\s+/g, ' ').trim()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
