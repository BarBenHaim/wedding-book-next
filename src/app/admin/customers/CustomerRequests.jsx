'use client'
// Customer requests waiting for Lord: what they asked, the reply Claude drafted
// (he can change it), what is left for him to do, and the switch.

import { useState } from 'react'

const INK = '#3d2e1a'
const SOFT = '#7a6a52'
const LINE = '#ead9b3'

function Action({ children, onClick, disabled, primary = false }) {
    return (
        <button
            type='button' onClick={onClick} disabled={disabled}
            className='text-[12px] font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap active:scale-95 disabled:opacity-40'
            style={primary ? { background: INK, color: '#fff', borderColor: INK } : { background: '#fff', color: INK, borderColor: '#d9c58f' }}
        >{children}</button>
    )
}

function Request({ item, busy, onAct }) {
    const [edited, setEdited] = useState(null)
    const text = edited ?? item.text
    return (
        <li className='rounded-xl border p-3 space-y-2' style={{ borderColor: LINE }}>
            <div className='text-[13px] font-bold'>
                בקשה {item.number} · {item.customerName || `מספר שמסתיים ב-${String(item.phone).slice(-4)}`}
                {item.weddingId && <a href={`/wedding/${encodeURIComponent(item.weddingId)}/admin`} className='mr-2 text-[12px] underline font-normal'>ניהול ברכות</a>}
            </div>
            <p className='text-[12.5px]'>{item.summary}</p>
            {item.tasks.length > 0 && <ul className='text-[12px] list-disc pr-4' style={{ color: '#8a5a00' }}>{item.tasks.map(task => <li key={task}>{task}</li>)}</ul>}
            <textarea
                value={text} onChange={e => setEdited(e.target.value)} rows={3} aria-label={`תשובה לבקשה ${item.number}`}
                placeholder='כתוב כאן תשובה' className='w-full rounded-lg border px-2.5 py-2 text-[13px] bg-white' style={{ borderColor: LINE }}
            />
            {!item.windowOpen && <div className='text-[12px]' style={{ color: '#b42318' }}>עברו 24 שעות מההודעה של הלקוח. צריך לענות ידנית.</div>}
            {item.errorCode === 'SEND_FAILED' && <div className='text-[12px]' style={{ color: '#b42318' }}>השליחה נכשלה. אפשר לנסות שוב.</div>}
            <div className='flex flex-wrap gap-1.5'>
                {item.windowOpen && (
                    <Action primary disabled={busy || !text.trim()} onClick={() => onAct({ op: 'draft', number: item.number, decision: 'send', text }, 'לשלוח את התשובה ללקוח?')}>אשר ושלח</Action>
                )}
                <a href={`https://wa.me/${item.phone}`} target='_blank' rel='noopener noreferrer' className='text-[12px] font-bold px-3 py-1.5 rounded-lg border' style={{ borderColor: '#d9c58f' }}>וואטסאפ</a>
                <Action disabled={busy} onClick={() => onAct({ op: 'draft', number: item.number, decision: 'reject' }, 'להסיר את הבקשה? כלום לא יישלח.')}>הסר</Action>
            </div>
        </li>
    )
}

export default function CustomerRequests({ requests, busy, onAct }) {
    if (!requests) return null
    const on = requests.enabled === true
    const items = requests.items || []
    return (
        <section className='rounded-2xl bg-white border p-4 space-y-3' style={{ borderColor: items.length ? '#d9b45a' : LINE }}>
            <div className='flex flex-wrap items-center gap-3'>
                <span className='w-2.5 h-2.5 rounded-full' style={{ background: on ? '#1f7a3e' : '#b9ad98' }} />
                <b className='text-sm'>בקשות לקוחות: {on ? 'Claude מכין טיוטות' : 'כבוי'}</b>
                <span className='text-[12px] flex-1 min-w-[200px]' style={{ color: SOFT }}>שום דבר לא נשלח בלי אישור שלך, ושום ספר לא משתנה.</span>
                <Action
                    primary={!on} disabled={busy}
                    onClick={() => onAct({ op: 'draftSwitch', enabled: !on }, on
                        ? 'להפסיק להכין טיוטות ללקוחות?'
                        : 'ש-Claude יכין טיוטה לכל הודעה של לקוח? שום דבר לא יישלח בלי אישור שלך.')}
                >{on ? 'כבה' : 'הפעל'}</Action>
            </div>
            {requests.items === null && <p role='alert' className='text-[12px]' style={{ color: '#b42318' }}>לא הצלחתי לקרוא את הבקשות. נסה לרענן.</p>}
            {items.length > 0 && (
                <ul className='grid gap-3 md:grid-cols-2'>
                    {items.map(item => <Request key={item.number} item={item} busy={busy} onAct={onAct} />)}
                </ul>
            )}
        </section>
    )
}
