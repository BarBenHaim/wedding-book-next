'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveEntry } from '../../utils/classifyMedia'

export default function TextPage() {
    const [name, setName] = useState('')
    const [text, setText] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const router = useRouter()

    function onSubmit(e) {
        e.preventDefault()
        if (!text.trim()) return

        setSubmitting(true)

        const fullText = name ? `${name}:\n${text}` : text
        saveEntry('text', fullText)

        setSubmitting(false)
        router.push('/thanks')
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

