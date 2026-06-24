'use client'

// "Blessings you sent from this device" — a small panel that appears on the
// guest landing / form when this phone has already submitted at least one
// blessing (tracked in localStorage; see lib/mySubmissions). Each row links
// to the edit screen. This is PURELY ADDITIVE: it never hides or replaces the
// "add a new blessing" call-to-action — a guest can keep adding more.
//
// Renders nothing (returns null) until mounted on the client + when the device
// has no recorded submissions, so it's invisible for first-time visitors and
// causes no hydration mismatch.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSubmissions } from '@/lib/mySubmissions'

const STR = {
    he: {
        title: 'הברכות ששלחת מהמכשיר הזה',
        sub: 'אפשר לערוך את הברכה או התמונה — זה לא מבטל את האפשרות להוסיף עוד ברכות',
        edit: 'ערוך',
        photoOnly: '(ברכה עם תמונה)',
    },
    en: {
        title: 'Blessings you sent from this device',
        sub: 'You can edit the text or photo — you can still add more blessings',
        edit: 'Edit',
        photoOnly: '(photo blessing)',
    },
    es: {
        title: 'Mensajes que enviaste desde este dispositivo',
        sub: 'Puedes editar el texto o la foto — aún puedes añadir más',
        edit: 'Editar',
        photoOnly: '(mensaje con foto)',
    },
    it: {
        title: 'Messaggi inviati da questo dispositivo',
        sub: 'Puoi modificare il testo o la foto — puoi comunque aggiungerne altri',
        edit: 'Modifica',
        photoOnly: '(messaggio con foto)',
    },
}

export default function MySubmissions({ weddingId, locale = 'he', style }) {
    const [items, setItems] = useState([])
    const [ready, setReady] = useState(false)

    useEffect(() => {
        setItems(getSubmissions(weddingId))
        setReady(true)
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
                background: 'rgba(255,255,255,0.72)',
                border: '1px solid #e7dcc5',
                borderRadius: 16,
                padding: '16px 18px',
                boxShadow: '0 4px 18px rgba(120,96,60,0.08)',
                backdropFilter: 'blur(2px)',
                ...style,
            }}
        >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#6b5836', marginBottom: 2 }}>
                {t.title}
            </div>
            <div style={{ fontSize: 12, color: '#9a8763', marginBottom: 12, lineHeight: 1.5 }}>
                {t.sub}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(it => (
                    <div
                        key={it.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: '#fffdf8',
                            border: '1px solid #efe6d4',
                            borderRadius: 12,
                            padding: '10px 12px',
                        }}
                    >
                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 13,
                                color: '#5c4f3a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {it.text ? it.text.slice(0, 90) : t.photoOnly}
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
                                padding: '7px 16px',
                                textDecoration: 'none',
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
