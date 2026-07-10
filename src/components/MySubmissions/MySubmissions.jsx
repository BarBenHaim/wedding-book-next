'use client'

// "Blessings you sent from this device" — shows the ACTUAL blessings this phone
// submitted (photo + name + text), pulled live from Firestore by the ids we
// recorded in localStorage (see lib/mySubmissions). Each card links to the edit
// screen. Purely additive: it never hides or replaces the "add a new blessing"
// flow — a guest can always keep adding more.
//
// Renders nothing until mounted on the client AND the device has at least one
// (still-existing) submission, so it's invisible for first-time visitors and
// never causes a hydration mismatch. Entries the owner has since deleted are
// dropped (and forgotten locally).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import { getSubmissions, removeSubmission } from '@/lib/mySubmissions'

const STR = {
    he: {
        title: 'הברכות ששלחת מהמכשיר הזה',
        sub: 'אפשר לערוך את הברכה או התמונה — וזה לא מבטל את האפשרות להוסיף עוד ברכות',
        edit: 'ערוך',
        photoOnly: 'ברכה עם תמונה',
        anon: 'אורח/ת',
    },
    en: {
        title: 'Blessings you sent from this device',
        sub: 'You can edit the text or photo — and still add more blessings',
        edit: 'Edit',
        photoOnly: 'Photo blessing',
        anon: 'Guest',
    },
    es: {
        title: 'Mensajes que enviaste desde este dispositivo',
        sub: 'Puedes editar el texto o la foto — y aún añadir más',
        edit: 'Editar',
        photoOnly: 'Mensaje con foto',
        anon: 'Invitado/a',
    },
    it: {
        title: 'Messaggi inviati da questo dispositivo',
        sub: 'Puoi modificare il testo o la foto — e aggiungerne altri',
        edit: 'Modifica',
        photoOnly: 'Messaggio con foto',
        anon: 'Ospite',
    },
}

export default function MySubmissions({ weddingId, locale = 'he', style }) {
    const [items, setItems] = useState([])
    const [ready, setReady] = useState(false)

    useEffect(() => {
        let cancelled = false
        const recorded = getSubmissions(weddingId)
        if (!recorded.length) {
            setReady(true)
            return
        }
        ;(async () => {
            // Pull the live content for each recorded id (reads are public).
            const results = await Promise.all(
                recorded.map(async r => {
                    try {
                        const snap = await getDoc(doc(db, 'weddings', weddingId, 'entries', r.id))
                        if (!snap.exists()) return { id: r.id, _missing: true }
                        const e = snap.data()
                        return { id: r.id, name: e.name || '', text: e.text || '', imageUrl: e.imageUrl || null }
                    } catch {
                        // Offline / transient — fall back to the cached snippet so
                        // the row still appears (it just won't have the photo).
                        return { id: r.id, name: r.name || '', text: r.text || '', imageUrl: null }
                    }
                }),
            )
            if (cancelled) return
            const alive = []
            for (const it of results) {
                if (it._missing) {
                    removeSubmission(weddingId, it.id) // owner deleted it — forget it here too
                    continue
                }
                alive.push(it)
            }
            setItems(alive)
            setReady(true)
        })()
        return () => {
            cancelled = true
        }
    }, [weddingId])

    if (!ready || !items.length) return null

    const t = STR[locale] || STR.he
    const rtl = locale === 'he'

    return (
        <div
            dir={rtl ? 'rtl' : 'ltr'}
            style={{
                width: '100%',
                maxWidth: 460,
                margin: '0 auto',
                background: 'rgba(255,255,255,0.78)',
                border: '1px solid rgba(212,184,103,0.30)',
                borderRadius: 20,
                padding: '16px 16px 18px',
                boxShadow: '0 18px 40px -24px rgba(170,136,64,0.35), 0 2px 8px -2px rgba(120,96,60,0.06)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                textAlign: rtl ? 'right' : 'left',
                ...style,
            }}
        >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#6b5836', marginBottom: 2 }}>{t.title}</div>
            <div style={{ fontSize: 12, color: '#9a8763', marginBottom: 12, lineHeight: 1.5 }}>{t.sub}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(it => (
                    <div
                        key={it.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 11,
                            background: '#fffdf8',
                            border: '1px solid #efe6d4',
                            borderRadius: 14,
                            padding: 10,
                            transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
                        }}
                    >
                        {it.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={it.imageUrl}
                                alt=''
                                style={{
                                    width: 52,
                                    height: 52,
                                    objectFit: 'cover',
                                    borderRadius: 10,
                                    flexShrink: 0,
                                    border: '1px solid rgba(212,184,103,0.35)',
                                    boxShadow: '0 2px 8px -2px rgba(120,96,60,0.25)',
                                }}
                            />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6b5836', marginBottom: 2 }}>
                                {it.name || t.anon}
                            </div>
                            <div
                                style={{
                                    fontSize: 12.5,
                                    color: '#6a5d46',
                                    lineHeight: 1.45,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {it.text || (it.imageUrl ? t.photoOnly : '')}
                            </div>
                        </div>
                        <Link
                            href={`/wedding/${weddingId}/edit/${it.id}`}
                            style={{
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#fff',
                                background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                borderRadius: 999,
                                padding: '8px 15px',
                                textDecoration: 'none',
                                alignSelf: 'center',
                                boxShadow: '0 6px 16px -6px rgba(170,136,64,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                            }}
                        >
                            <svg
                                viewBox='0 0 24 24'
                                style={{ width: 12, height: 12 }}
                                fill='none'
                                stroke='currentColor'
                                strokeWidth={2}
                                aria-hidden='true'
                            >
                                <path
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    d='M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13L2.25 21.75l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Z'
                                />
                            </svg>
                            {t.edit}
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    )
}
