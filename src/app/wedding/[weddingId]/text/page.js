'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { saveEntry } from '../../../../lib/classifyMedia'

export default function TextPage() {
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const router = useRouter()
    const { weddingId } = useParams() // נקבל את ה־ID מה־URL

    async function onSubmit(e) {
        e.preventDefault()
        if (!text.trim()) return
        if (!weddingId) {
            alert('לא נמצא מזהה חתונה')
            return
        }

        setSubmitting(true)

        const fullText = name ? `${name}:\n${text}` : text
        try {
            await saveEntry(weddingId, 'text', fullText) // נעביר את ה־weddingId
            router.push(`/wedding/${weddingId}/thanks`)
        } catch (err) {
            console.error('Error saving entry:', err)
            alert('שגיאה בשמירת הברכה')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className='container'>
            <div className='card'>
                <h2 className='title'>✍️ כתיבת ברכה</h2>
                <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
                    <label>
                        שם (אופציונלי)
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='שם פרטי'
                            style={{
                                width: '100%',
                                padding: 12,
                                borderRadius: 12,
                                border: '1px solid #ddd',
                                marginTop: 6,
                            }}
                        />
                    </label>
                    <label>
                        הברכה שלכם (עד 500 תווים)
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value.slice(0, 500))}
                            placeholder='כתבו כאן...'
                            rows={8}
                            style={{
                                width: '100%',
                                padding: 12,
                                borderRadius: 12,
                                border: '1px solid #ddd',
                                marginTop: 6,
                            }}
                        />
                    </label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button type='submit' disabled={submitting || !text.trim()} className='btn btn-gold'>
                            💾 שלח ברכה
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
