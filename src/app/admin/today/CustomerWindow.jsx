'use client'
// One customer: where they stand and the buttons that finish the next step. The
// row and its buttons are the customer board's own.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { MoreActions, Sends, StepActions, countdown } from '../customers/CustomerBoardView'
import Window, { Notice } from '../ui/Window'
import k from '../ui/kit.module.css'
import w from '../ui/windows.module.css'

const dayWords = iso => (iso
    ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
    : 'בלי תאריך')

export default function CustomerWindow({ id, title, api, onChanged, onClose }) {
    const [board, setBoard] = useState(undefined)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const load = useCallback(async () => setBoard(await api('/api/admin/customers')), [api])
    useEffect(() => { load().catch(() => setBoard(null)) }, [load])

    const act = async (body, question) => {
        if (question && !window.confirm(question)) return
        setBusy(true)
        setError('')
        try {
            await api('/api/admin/customers', body)
            await Promise.all([load(), onChanged()])
        } catch (err) {
            setError(`הפעולה לא נשמרה: ${err.message}`)
        } finally {
            setBusy(false)
        }
    }

    const row = board?.rows?.find(item => item.id === id)
    return (
        <Window title={row?.title || title} subtitle={row ? `${dayWords(row.day)} · ${countdown(row.toEvent)}` : ''} onClose={onClose}>
            {board === undefined ? <Notice>טוען את פרטי הלקוח…</Notice>
                : !row ? <Notice tone='bad'>{board ? 'הלקוח הזה כבר לא ברשימה.' : 'פרטי הלקוח לא נקראו.'}</Notice> : (
                    <div className={w.stack}>
                        <Notice tone='bad'>{error}</Notice>
                        <div className={w.card}>
                            <h3>הצעד הבא</h3>
                            <p className={w.next} data-overdue={row.overdue}>{row.next.label}{row.overdue ? ' (באיחור)' : ''}</p>
                            <div className={w.actions}>
                                <StepActions row={row} act={act} busy={busy} />
                                <MoreActions row={row} act={act} busy={busy} />
                            </div>
                        </div>
                        <div className={w.card}>
                            <ul className={w.list}>
                                {row.ownerName && <li><b>בעל האירוע</b><span>{row.ownerName}</span></li>}
                                <li><b>שלב</b><span>{row.stage || '—'}</span></li>
                                <li><b>ברכות</b><span>{row.entries}</span></li>
                                <li><b>תשלום רשום</b><span>{row.amount ? `₪${row.amount}` : 'אין'}</span></li>
                                {row.note && <li><b>הערה</b><span>{row.note}</span></li>}
                            </ul>
                        </div>
                        <div className={w.card}>
                            <h3>הודעות שיצאו</h3>
                            <p><Sends row={row} /></p>
                            {row.lastCustomerMessage && <blockquote>{row.lastCustomerMessage.text}</blockquote>}
                        </div>
                        <div className={w.actions}>
                            <Link href={`/wedding/${encodeURIComponent(id)}/admin`} className={k.button}>לספר ולברכות</Link>
                            <Link href={`/admin/customers?id=${encodeURIComponent(id)}`} className={w.quiet}>ללוח הטיפול</Link>
                        </div>
                    </div>
                )}
        </Window>
    )
}
