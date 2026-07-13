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
                background: 'rgba(255,255,255,0.74)',
                border: '1px solid #e7dcc5',
                borderRadius: 16,
                padding: '16px 16px 18px',
                boxShadow: '0 4px 18px rgba(120,96,60,0.08)',
                backdropFilter: 'blur(2px)',
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
                            borderRadius: 12,
                            padding: 10,
                        }}
                    >
                        {it.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={it.imageUrl}
                                alt=''
                                style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 9, flexShrink: 0 }}
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
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#fff',
                                background: '#c9a44e',
                                borderRadius: 9,
                                padding: '8px 16px',
                                textDecoration: 'none',
                                alignSelf: 'center',
                            }}
                        >
                            {t.edit}
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    )
}
