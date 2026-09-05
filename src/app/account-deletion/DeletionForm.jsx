'use client'

// The form half of /account-deletion. Split out of the page so the page
// itself stays a server component: the legal text is what Google's reviewer
// reads, and it should be in the HTML without waiting for JS.

import { useState } from 'react'
import { REASONS, isEmail } from '@/lib/deletionRequest'

const REASON_LABEL = {
    no_longer_needed: 'כבר לא צריך את השירות',
    privacy: 'שיקולי פרטיות',
    duplicate: 'נפתח לי חשבון כפול',
    other: 'אחר',
}

export default function DeletionForm() {
    const [email, setEmail] = useState('')
    const [reason, setReason] = useState('no_longer_needed')
    const [note, setNote] = useState('')
    const [state, setState] = useState('idle') // idle | sending | done | error
    const [err, setErr] = useState('')

    const valid = isEmail(email)

    async function submit(e) {
        e.preventDefault()
        if (!valid || state === 'sending') return
        setState('sending')
        setErr('')
        try {
            const res = await fetch('/api/account-deletion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, reason, note }),
            })
            const j = await res.json().catch(() => ({}))
            if (!res.ok || !j.ok) throw new Error(j.error || 'failed')
            setState('done')
        } catch (e2) {
            setState('error')
            setErr(
                e2.message === 'email_invalid'
                    ? 'כתובת האימייל לא נראית תקינה.'
                    : 'לא הצלחנו לשמור את הבקשה. אפשר לשלוח אותה במייל ל־barbenbh@gmail.com ונטפל בה.',
            )
        }
    }

    if (state === 'done') {
        return (
            <div className='ok' role='status'>
                <strong>הבקשה נקלטה.</strong>
                <p>
                    נטפל בה תוך 30 יום ונעדכן אותך במייל <b>{email}</b>. אם לא קיבלת עדכון, אפשר לכתוב
                    ישירות ל־<a href='mailto:barbenbh@gmail.com'>barbenbh@gmail.com</a>.
                </p>
            </div>
        )
    }

    return (
        <form onSubmit={submit} className='form' noValidate>
            <label htmlFor='del-email'>כתובת האימייל של החשבון</label>
            <input
                id='del-email'
                type='email'
                inputMode='email'
                autoComplete='email'
                dir='ltr'
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder='name@example.com'
                required
            />

            <label htmlFor='del-reason'>סיבה (לא חובה)</label>
            <select id='del-reason' value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => (
                    <option key={r} value={r}>
                        {REASON_LABEL[r]}
                    </option>
                ))}
            </select>

            <label htmlFor='del-note'>משהו שנשמח לדעת (לא חובה)</label>
            <textarea
                id='del-note'
                rows={3}
                maxLength={600}
                value={note}
                onChange={e => setNote(e.target.value)}
            />

            <button type='submit' disabled={!valid || state === 'sending'}>
                {state === 'sending' ? 'שולח…' : 'שליחת בקשת מחיקה'}
            </button>

            {err && (
                <p className='err' role='alert'>
                    {err}
                </p>
            )}

            <style>{`
                .form { display: grid; gap: 6px; margin: 8px 0 4px; }
                .form label { font-size: 14px; font-weight: 700; color: #4c3b21; margin-top: 12px; }
                .form input, .form select, .form textarea {
                    font: inherit; font-size: 15px; padding: 11px 13px; border-radius: 10px;
                    border: 1px solid #d9c9a6; background: #fffdf8; color: #241c10; width: 100%;
                }
                .form input:focus, .form select:focus, .form textarea:focus {
                    outline: 2px solid #a8843a; outline-offset: 1px; border-color: #a8843a;
                }
                .form textarea { resize: vertical; }
                .form button {
                    margin-top: 20px; font: inherit; font-size: 16px; font-weight: 800;
                    padding: 13px 18px; border-radius: 11px; border: 0; cursor: pointer;
                    background: #a8843a; color: #fff;
                }
                .form button:disabled { opacity: .45; cursor: default; }
                .err { color: #a3312a; font-size: 14px; margin-top: 12px; }
                .ok { background: #f6f0e2; border: 1px solid #e0d2b2; border-radius: 12px; padding: 18px 20px; margin: 8px 0; }
                .ok p { margin: 8px 0 0; font-size: 15px; }
                .ok a { color: #a8843a; font-weight: 700; }
            `}</style>
        </form>
    )
}
