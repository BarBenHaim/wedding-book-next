'use client'
// Customer requests waiting for Lord: what they asked, the reply Claude drafted
// (he can change it), what is left for him to do, and the switch.

import { useState } from 'react'
import Button from './BoardButton'
import c from './customers.module.css'

export function Request({ item, busy, onAct }) {
    const [edited, setEdited] = useState(null)
    const text = edited ?? item.text
    const sent = item.status === 'sent'
    return (
        <li className={c.item}>
            <b className={c.name}>
                בקשה {item.number} · {item.customerName || `מספר שמסתיים ב-${String(item.phone).slice(-4)}`}
                {item.weddingId && <a href={`/wedding/${encodeURIComponent(item.weddingId)}/admin`} className={c.link}>ניהול ברכות</a>}
            </b>
            <p>{item.summary}</p>
            {item.tasks.length > 0 && <ul className={c.todo}>{item.tasks.map(task => <li key={task}>{task}</li>)}</ul>}
            {sent
                ? <b className={c.good}>התשובה נשלחה. נשארו המשימות.</b>
                : <textarea
                    value={text} onChange={e => setEdited(e.target.value)} rows={3} aria-label={`תשובה לבקשה ${item.number}`}
                    placeholder='כתוב כאן תשובה' className={c.reply}
                />}
            {!sent && !item.windowOpen && <small className={c.late}>עברו 24 שעות מההודעה של הלקוח. צריך לענות ידנית.</small>}
            {item.errorCode === 'SEND_FAILED' && <small className={c.late}>השליחה נכשלה. אפשר לנסות שוב.</small>}
            <div className={c.actions}>
                {sent && <Button primary disabled={busy} onClick={() => onAct({ op: 'draft', number: item.number, decision: 'done' }, 'לסמן שהמשימות טופלו?')}>טופל</Button>}
                {!sent && item.windowOpen && (
                    <Button primary disabled={busy || !text.trim()} onClick={() => onAct({ op: 'draft', number: item.number, decision: 'send', text }, 'לשלוח את התשובה ללקוח?')}>אשר ושלח</Button>
                )}
                <Button href={`https://wa.me/${item.phone}`}>וואטסאפ</Button>
                {!sent && <Button disabled={busy} onClick={() => onAct({ op: 'draft', number: item.number, decision: 'reject' }, 'להסיר את הבקשה? כלום לא יישלח.')}>הסר</Button>}
            </div>
        </li>
    )
}

export default function CustomerRequests({ requests, busy, onAct }) {
    if (!requests) return null
    const on = requests.enabled === true
    const items = requests.items || []
    return (
        <section className={c.card}>
            <div className={c.head}>
                <i className={c.dot} data-state={on ? 'on' : 'off'} />
                <b>בקשות לקוחות: {on ? 'Claude מכין טיוטות' : 'כבוי'}</b>
                <span>שום דבר לא נשלח בלי אישור שלך, ושום ספר לא משתנה.</span>
                <Button
                    primary={!on} disabled={busy}
                    onClick={() => onAct({ op: 'draftSwitch', enabled: !on }, on
                        ? 'להפסיק להכין טיוטות ללקוחות?'
                        : 'ש-Claude יכין טיוטה לכל הודעה של לקוח? שום דבר לא יישלח בלי אישור שלך.')}
                >{on ? 'כבה' : 'הפעל'}</Button>
            </div>
            {requests.items === null && <p role='alert' className={c.late}>לא הצלחתי לקרוא את הבקשות. נסה לרענן.</p>}
            {items.length > 0 && (
                <ul className={c.grid}>
                    {items.map(item => <Request key={item.number} item={item} busy={busy} onAct={onAct} />)}
                </ul>
            )}
        </section>
    )
}
