'use client'
// One waiting item in full: the whole draft, or the sample at a size it can be
// judged at, with the same approvals as the customer board.

import { useState } from 'react'
import Link from 'next/link'
import { Check, Send, X } from 'lucide-react'
import Window, { Notice } from './Window'
import s from './today.module.css'
import w from './windows.module.css'

export const REFUSALS = {
    WINDOW_CLOSED: 'עברו 24 שעות מההודעה. צריך לענות ידנית.',
    NEWER_MESSAGE: 'נכתבה הודעה חדשה אחרי הטיוטה. חכה לטיוטה החדשה.',
    DRAFT_NOT_PENDING: 'הבקשה כבר טופלה.',
    SAMPLE_NOT_READY: 'הדוגמה כבר נשלחה או עוד לא מוכנה.',
    LEAD_CLOSED: 'השיחה סגורה, ולכן לא נשלח.',
    SEND_FAILED: 'וואטסאפ לא קיבלה את השליחה. אפשר לנסות שוב.',
}

export default function TaskWindow({ task, api, onChanged, onClose }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const sample = task.kind === 'sample'
    const draft = task.kind === 'draft'

    const decide = async (decision, question) => {
        if (!window.confirm(question)) return
        setBusy(true)
        setError('')
        try {
            await api('/api/admin/customers', sample
                ? { op: 'sample', id: task.id, decision }
                : { op: 'draft', number: task.id, decision })
            await onChanged()
            onClose()
        } catch (err) {
            await onChanged()
            setError(REFUSALS[err.message] || `לא בוצע: ${err.message}`)
            setBusy(false)
        }
    }

    return (
        <Window title={task.title} onClose={onClose}>
            <div className={w.stack}>
                <Notice tone='bad'>{error}</Notice>
                {task.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={task.image} alt='הדוגמה' className={w.picture} />
                )}
                {task.detail && <div className={w.card}><p className={w.long}>{task.detail}</p></div>}
                <div className={w.actions}>
                    {task.canApprove && (
                        <button type='button' className={s.button} disabled={busy} onClick={() => decide('send', sample ? 'לשלוח את הדוגמה הזאת לליד?' : `לשלוח את התשובה?\n\n${task.detail}`)}>
                            <Send size={20} aria-hidden='true' />אשר ושלח
                        </button>
                    )}
                    {sample && (
                        <button type='button' className={w.quiet} disabled={busy} onClick={() => decide('reject', 'לדחות את הדוגמה? היא לא תישלח.')}>
                            <X size={18} aria-hidden='true' />דחה
                        </button>
                    )}
                    {draft && task.waiting && (
                        <button type='button' className={w.quiet} disabled={busy} onClick={() => decide('reject', 'לבטל את הטיוטה? שום דבר לא יישלח.')}>
                            <X size={18} aria-hidden='true' />בטל טיוטה
                        </button>
                    )}
                    {draft && !task.waiting && (
                        <button type='button' className={s.button} disabled={busy} onClick={() => decide('done', 'לסמן שהמשימות בוצעו?')}>
                            <Check size={20} aria-hidden='true' />בוצע
                        </button>
                    )}
                    <Link href='/admin/customers' className={w.quiet}>ללוח הטיפול</Link>
                </div>
            </div>
        </Window>
    )
}
