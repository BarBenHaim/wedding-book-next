'use client'
// The customer board: one row per customer with the next step and the button
// that closes it. Draws what /api/admin/customers returns; all rules are in
// src/lib/customerBoard.js.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import SignSamples from './SignSamples'

const INK = '#3d2e1a'
const SOFT = '#7a6a52'
const LINE = '#ead9b3'
const SEND_LABEL = { share_14: 'שבועיים לפני', eve: 'לפני האירוע', post_1: 'מזל טוב', post_3: 'אישור הספר' }
const STATUS = {
    accepted: { label: 'יצא', color: '#8a5a00' },
    delivered: { label: 'נמסר', color: '#1f7a3e' },
    read: { label: 'נקרא', color: '#1f7a3e' },
    failed: { label: 'נכשל', color: '#b42318' },
    manual: { label: 'שלחת', color: '#1f7a3e' },
}

const shortDate = iso => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(2, 4)}` : '')
const countdown = days => {
    if (days == null) return 'בלי תאריך'
    if (days === 0) return 'היום'
    if (days === 1) return 'מחר'
    if (days === -1) return 'אתמול'
    return days > 0 ? `בעוד ${days} ימים` : `לפני ${-days} ימים`
}
const dueLabel = (row, today) => {
    if (!row.due) return ''
    if (row.overdue) return `באיחור מ-${shortDate(row.due)}`
    return row.due === today ? 'היום' : shortDate(row.due)
}
const waLink = (phone, text) => `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`

function Button({ children, onClick, href, primary = false, disabled = false }) {
    const style = primary
        ? { background: INK, color: '#fff', borderColor: INK }
        : { background: '#fff', color: INK, borderColor: '#d9c58f' }
    const className = 'inline-block text-[12px] font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap active:scale-95 disabled:opacity-40'
    return href
        ? <a href={href} target='_blank' rel='noopener noreferrer' className={className} style={style}>{children}</a>
        : <button type='button' onClick={onClick} disabled={disabled} className={className} style={style}>{children}</button>
}

// The buttons that finish the next step of one row.
function StepActions({ row, act, busy }) {
    const id = row.id
    const mark = (field, label) => () => act({ op: 'mark', weddingId: id, field, on: true }, `לסמן "${label}" ל${row.title}?`)
    const whatsapp = (text, label = 'וואטסאפ') => row.phone && <Button href={waLink(row.phone, text)} primary>{label}</Button>
    const manage = <Button href={`/wedding/${encodeURIComponent(id)}/admin`}>ניהול ברכות</Button>

    switch (row.next.key) {
        case 'message':
        case 'send_failed':
            if (row.auto) return null
            return <>
                {whatsapp(row.text, 'שלח בוואטסאפ')}
                <Button disabled={busy} onClick={() => act({ op: 'sentByHand', weddingId: id, key: row.next.message }, `לסמן ששלחת ל${row.title}? ההודעה לא תישלח שוב.`)}>שלחתי</Button>
            </>
        case 'request':
            return <>
                {whatsapp()}
                {manage}
                <Button disabled={busy} onClick={() => act({ op: 'handled', weddingId: id }, `לסגור את ההודעות של ${row.title} כטופלו?`)}>טופל</Button>
            </>
        case 'triage':
            return [['delivered', 'נמסר'], ['in_print', 'בהדפסה'], ['handle', 'צריך טיפול'], ['closed', 'סגור']].map(([result, label]) => (
                <Button key={result} disabled={busy} onClick={() => act({ op: 'triage', weddingId: id, result })}>{label}</Button>
            ))
        case 'approve_print':
        case 'balance':
            return <>
                {manage}
                {whatsapp()}
                <Button disabled={busy} onClick={mark('printOrderedAt', 'הוזמן להדפסה')}>הוזמן להדפסה</Button>
            </>
        case 'mark_shipped':
            return <Button primary disabled={busy} onClick={mark('shippedAt', 'נשלח ללקוח')}>נשלח ללקוח</Button>
        case 'confirm_arrived':
            return <>
                {whatsapp()}
                <Button disabled={busy} onClick={mark('deliveredAt', 'הספר הגיע')}>הגיע</Button>
            </>
        case 'wait_event':
        case 'none':
            return null
        default:
            return <>
                {whatsapp()}
                {manage}
            </>
    }
}

const UNDO = {
    printOrderedAt: 'בטל "הוזמן להדפסה"',
    shippedAt: 'בטל "נשלח ללקוח"',
    deliveredAt: 'בטל "הספר הגיע"',
    closedAt: 'פתח מחדש',
    triagedAt: 'החזר לרשימת הישנים',
}

function MoreActions({ row, act, busy }) {
    const id = row.id
    const open = row.group !== 'done'
    const choose = value => {
        if (UNDO[value]) act({ op: 'mark', weddingId: id, field: value, on: false }, `${UNDO[value]}: ${row.title}?`)
        if (value === 'defer3') act({ op: 'defer', weddingId: id, days: 3 })
        if (value === 'defer7') act({ op: 'defer', weddingId: id, days: 7 })
        if (value === 'undefer') act({ op: 'defer', weddingId: id, days: 0 })
        if (value === 'note') {
            const text = window.prompt(`הערה על ${row.title}`, row.note || '')
            if (text !== null) act({ op: 'note', weddingId: id, text })
        }
        if (value === 'mute') act({ op: 'mute', weddingId: id, on: !row.muted })
        if (value === 'close') act({ op: 'mark', weddingId: id, field: 'closedAt', on: true }, `לסגור את ${row.title}? הוא יצא מרשימת הטיפול.`)
    }
    const marks = row.marks || []
    if (!open && !marks.length) return null
    return (
        <select
            value='' disabled={busy} onChange={e => choose(e.target.value)} aria-label={`פעולות נוספות: ${row.title}`}
            className='text-[12px] rounded-lg border px-2 py-1.5 bg-white' style={{ borderColor: LINE, color: SOFT }}
        >
            <option value=''>{open ? 'עוד…' : 'שינוי…'}</option>
            {marks.map(mark => <option key={mark} value={mark}>{UNDO[mark]}</option>)}
            {open && <>
                <option value='defer3'>דחה ב-3 ימים</option>
                <option value='defer7'>דחה בשבוע</option>
                <option value='undefer'>בטל דחייה</option>
                <option value='note'>כתוב הערה</option>
                <option value='mute'>{row.muted ? 'הפעל הודעות ללקוח' : 'כבה הודעות ללקוח'}</option>
                <option value='close'>סגור</option>
            </>}
        </select>
    )
}

function Sends({ row }) {
    const sent = Object.entries(row.sends || {})
    if (!sent.length) return <span style={{ color: '#b9ad98' }}>עוד לא</span>
    return (
        <span className='flex flex-col gap-0.5'>
            {sent.map(([key, send]) => {
                const status = STATUS[send.status] || STATUS.accepted
                return <span key={key}>{SEND_LABEL[key] || key}: <b style={{ color: status.color }}>{status.label}</b></span>
            })}
        </span>
    )
}

function Who({ row }) {
    return (
        <>
            <div className='font-bold text-[15px]' style={{ color: '#1a1410' }}>{row.title}</div>
            <div className='text-[12px]' style={{ color: SOFT }}>
                {[row.ownerName, `${row.entries} ברכות`, row.amount ? `₪${row.amount}` : 'ללא תשלום רשום'].filter(Boolean).join(' · ')}
            </div>
            {row.note && <div className='text-[12px] mt-0.5' style={{ color: '#8a5a00' }}>הערה: {row.note}</div>}
        </>
    )
}

function Step({ row, today }) {
    return (
        <>
            <div className='font-bold text-[13px]' style={{ color: '#1a1410' }}>{row.next.label}</div>
            {row.due && <div className='text-[12px] font-semibold' style={{ color: row.overdue ? '#b42318' : SOFT }}>{dueLabel(row, today)}</div>}
            {row.lastCustomerMessage && row.next.key !== 'wait_event' && (
                <div className='text-[11.5px] mt-0.5 line-clamp-2' style={{ color: SOFT }}>כתב לאחרונה: {row.lastCustomerMessage.text}</div>
            )}
        </>
    )
}

// Whether Claude answers: the failure of the last day, or the last check.
function ClaudeStatus({ claude, busy, onCheck }) {
    const alert = claude?.alert
    const checkedAt = claude?.lastCheckAt
        ? new Date(claude.lastCheckAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''
    const color = alert || claude?.lastCheckOk === false ? '#b42318' : claude?.lastCheckOk ? '#1f7a3e' : '#b9ad98'
    const words = alert
        || (!checkedAt ? 'עוד לא נבדק.' : claude.lastCheckOk ? `עבד בבדיקה מ-${checkedAt}.` : `לא ענה בבדיקה מ-${checkedAt}.`)
    return (
        <section
            className='rounded-2xl bg-white border p-4 flex flex-wrap items-center gap-3' role={alert ? 'alert' : undefined}
            style={{ borderColor: alert ? '#f5b5b0' : LINE }}
        >
            <span className='w-2.5 h-2.5 rounded-full' style={{ background: color }} />
            <b className='text-sm'>Claude</b>
            <span className='text-[12px] flex-1 min-w-[200px]' style={{ color: alert ? '#b42318' : SOFT }}>{words}</span>
            <Button disabled={busy} onClick={onCheck}>בדוק את Claude</Button>
        </section>
    )
}

export default function CustomerBoardView({ data, busy, error, updatedAt, onAct, onRefresh }) {
    const [tab, setTab] = useState('today')
    const [query, setQuery] = useState('')
    const [testKey, setTestKey] = useState('post_1')

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return (data?.rows || []).filter(row => row.group === tab)
        return (data?.rows || []).filter(row => `${row.title} ${row.ownerName || ''} ${row.phone || ''}`.toLowerCase().includes(q))
    }, [data, tab, query])

    const act = (body, question) => {
        if (question && !window.confirm(question)) return
        onAct(body)
    }
    const on = data?.settings?.enabled === true

    return (
        <main dir='rtl' className='min-h-screen px-3 sm:px-6 py-5' style={{ background: '#f8f4ec', color: INK }}>
            <div className='max-w-6xl mx-auto space-y-4'>
                <header className='flex flex-wrap items-center gap-3'>
                    <h1 className='text-2xl font-black flex-1' style={{ color: '#1a1410' }}>טיפול בלקוחות</h1>
                    {updatedAt && <span className='text-[12px]' style={{ color: SOFT }}>עודכן {updatedAt}</span>}
                    <Button onClick={onRefresh} disabled={busy}>{busy ? 'טוען…' : 'רענן'}</Button>
                    <Link href='/admin' className='text-[12px] font-bold underline'>לסופר אדמין</Link>
                </header>

                {error && <p role='alert' className='rounded-xl px-4 py-3 text-sm font-semibold' style={{ background: '#fdecea', color: '#b42318' }}>{error}</p>}
                {!data && !error && <p className='text-sm' style={{ color: SOFT }}>טוען את הלקוחות…</p>}

                {data && <>
                    <section className='rounded-2xl bg-white border p-4 space-y-3' style={{ borderColor: LINE }}>
                        <div className='flex flex-wrap items-center gap-3'>
                            <span className='w-2.5 h-2.5 rounded-full' style={{ background: on ? '#1f7a3e' : '#b9ad98' }} />
                            <b className='text-sm'>שליחה אוטומטית: {on ? 'פעילה' : 'כבויה'}</b>
                            <span className='text-[12px] flex-1' style={{ color: SOFT }}>
                                {on ? 'ההודעות יוצאות בבוקר, לא בשבת ובחג.' : 'כשהיא כבויה, כל הודעה מופיעה כמשימה לשליחה בלחיצה.'}
                            </span>
                            <Button
                                primary={!on} disabled={busy}
                                onClick={() => act({ op: 'settings', enabled: !on }, on
                                    ? 'לכבות את השליחה האוטומטית?'
                                    : 'להפעיל שליחה אוטומטית? הודעות יישלחו ללקוחות בלי אישור נוסף. הפעל רק אחרי שהודעת בדיקה הגיעה אליך.')}
                            >{on ? 'כבה' : 'הפעל'}</Button>
                        </div>
                        <div className='flex flex-wrap items-center gap-2 text-[12px]'>
                            <span style={{ color: SOFT }}>בדיקה לטלפון שלך:</span>
                            <select value={testKey} onChange={e => setTestKey(e.target.value)} className='rounded-lg border px-2 py-1.5 bg-white' style={{ borderColor: LINE }}>
                                {Object.entries(SEND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                            <Button disabled={busy} onClick={() => act({ op: 'test', key: testKey })}>שלח בדיקה</Button>
                        </div>
                        <details>
                            <summary className='cursor-pointer text-[13px] font-bold'>הודעות בשבוע הקרוב ({data.sends.length})</summary>
                            {data.sends.length === 0
                                ? <p className='text-[12px] mt-2' style={{ color: SOFT }}>אין הודעות מתוכננות.</p>
                                : <ul className='mt-2 text-[12.5px] space-y-1'>
                                    {data.sends.map(send => <li key={`${send.id}-${send.key}`}><b>{shortDate(send.day)}</b> {send.title}: {SEND_LABEL[send.key]}</li>)}
                                </ul>}
                        </details>
                    </section>

                    <ClaudeStatus claude={data.claude} busy={busy} onCheck={() => act({ op: 'claudeCheck' })} />

                    <SignSamples samples={data.samples} busy={busy} onAct={act} />

                    <nav className='flex flex-wrap gap-2'>
                        {data.groups.map(group => (
                            <button
                                key={group.key} type='button' onClick={() => { setTab(group.key); setQuery('') }}
                                aria-pressed={tab === group.key && !query}
                                className='rounded-xl border px-3.5 py-2 text-[13px] font-bold bg-white'
                                style={tab === group.key && !query ? { background: INK, color: '#fff', borderColor: INK } : { borderColor: LINE }}
                            >
                                <span className='text-lg tabular-nums ml-1.5'>{data.counts[group.key] || 0}</span>{group.label}
                            </button>
                        ))}
                        <input
                            type='search' value={query} onChange={e => setQuery(e.target.value)} placeholder='חיפוש לפי שם או טלפון'
                            className='flex-1 min-w-[180px] rounded-xl border px-3.5 py-2 text-sm bg-white outline-none' style={{ borderColor: LINE }}
                        />
                    </nav>

                    {rows.length === 0 ? (
                        <p className='rounded-2xl bg-white border p-6 text-center text-sm' style={{ borderColor: LINE, color: SOFT }}>
                            {query ? 'לא נמצא לקוח כזה.' : tab === 'today' ? 'אין מה לטפל היום.' : 'אין כאן לקוחות.'}
                        </p>
                    ) : <>
                        <div className='hidden md:block rounded-2xl bg-white border overflow-x-auto' style={{ borderColor: LINE }}>
                            <table className='w-full text-right text-sm'>
                                <thead>
                                    <tr className='text-[12px]' style={{ color: SOFT, background: '#fdfaf3' }}>
                                        {['לקוח', 'אירוע', 'הצעד הבא', 'הודעות', 'פעולה'].map(title => <th key={title} scope='col' className='px-4 py-3 font-bold'>{title}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr key={row.id} className='border-t align-top' style={{ borderColor: '#f0e8d4', background: row.overdue ? '#fffaf9' : undefined }}>
                                            <td className='px-4 py-3'><Who row={row} /></td>
                                            <td className='px-4 py-3 whitespace-nowrap'>
                                                <div className='font-semibold tabular-nums'>{shortDate(row.day)}</div>
                                                <div className='text-[12px]' style={{ color: SOFT }}>{countdown(row.toEvent)}</div>
                                                <div className='text-[11.5px]' style={{ color: SOFT }}>{row.stage}</div>
                                            </td>
                                            <td className='px-4 py-3 max-w-[280px]'><Step row={row} today={data.today} /></td>
                                            <td className='px-4 py-3 text-[11.5px] whitespace-nowrap'><Sends row={row} /></td>
                                            <td className='px-4 py-3'>
                                                <div className='flex flex-wrap gap-1.5 items-center max-w-[300px]'>
                                                    <StepActions row={row} act={act} busy={busy} />
                                                    <MoreActions row={row} act={act} busy={busy} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className='md:hidden space-y-2.5'>
                            {rows.map(row => (
                                <li key={row.id} className='rounded-2xl bg-white border p-3.5 space-y-2' style={{ borderColor: row.overdue ? '#f5b5b0' : LINE }}>
                                    <Who row={row} />
                                    <div className='text-[12px]' style={{ color: SOFT }}>{[shortDate(row.day), countdown(row.toEvent), row.stage].filter(Boolean).join(' · ')}</div>
                                    <div><Step row={row} today={data.today} /></div>
                                    {Object.keys(row.sends || {}).length > 0 && <div className='text-[11.5px]'><Sends row={row} /></div>}
                                    <div className='flex flex-wrap gap-1.5 items-center'>
                                        <StepActions row={row} act={act} busy={busy} />
                                        <MoreActions row={row} act={act} busy={busy} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>}
                </>}
            </div>
        </main>
    )
}
