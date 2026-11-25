'use client'
// The customer board: one row per customer with the next step and the button
// that closes it. Draws what /api/admin/customers returns; all rules are in
// src/lib/customerBoard.js.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ClipboardCheck, RefreshCw, Search, Users, Zap } from 'lucide-react'
import { Hero, Page, Panel, Plaque, Sheet } from '../ui/kit'
import k from '../ui/kit.module.css'
import Button from './BoardButton'
import SignSamples from './SignSamples'
import CustomerRequests from './CustomerRequests'
import c from './customers.module.css'
const SEND_LABEL = { share_14: 'שבועיים לפני', eve: 'לפני האירוע', post_1: 'מזל טוב', post_3: 'אישור הספר' }
const STATUS = {
    accepted: { label: 'יצא', color: '#7a4c00' },
    delivered: { label: 'נמסר', color: '#1f7a3e' },
    read: { label: 'נקרא', color: '#1f7a3e' },
    failed: { label: 'נכשל', color: '#b42318' },
    manual: { label: 'שלחת', color: '#1f7a3e' },
}

const shortDate = iso => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(2, 4)}` : '')
export const countdown = days => {
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

// The buttons that finish the next step of one row.
export function StepActions({ row, act, busy }) {
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

export function MoreActions({ row, act, busy }) {
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
            className={c.select}
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

export function Sends({ row }) {
    const sent = Object.entries(row.sends || {})
    if (!sent.length) return <span className={c.none}>עוד לא</span>
    return (
        <span className={c.sends}>
            {sent.map(([key, send]) => {
                const status = STATUS[send.status] || STATUS.accepted
                return <span key={key}>{SEND_LABEL[key] || key}: <b style={{ color: status.color }}>{status.label}</b></span>
            })}
        </span>
    )
}

function Who({ row, onOpen }) {
    return (
        <>
            {onOpen
                ? <button type='button' className={c.name} onClick={() => onOpen(row)}>{row.title}</button>
                : <b className={c.name}>{row.title}</b>}
            <small className={c.small}>
                {[row.ownerName, `${row.entries} ברכות`, row.amount ? `₪${row.amount}` : 'ללא תשלום רשום'].filter(Boolean).join(' · ')}
            </small>
            {row.note && <small className={c.note}>הערה: {row.note}</small>}
        </>
    )
}

function Step({ row, today }) {
    return (
        <>
            <b className={c.step} data-overdue={row.overdue}>{row.next.label}</b>
            {row.due && <small className={row.overdue ? c.late : c.small}>{dueLabel(row, today)}</small>}
            {row.lastCustomerMessage && row.next.key !== 'wait_event' && (
                <small className={c.last}>כתב לאחרונה: {row.lastCustomerMessage.text}</small>
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
    const state = alert || claude?.lastCheckOk === false ? 'bad' : claude?.lastCheckOk ? 'on' : 'off'
    const words = alert
        || (!checkedAt ? 'עוד לא נבדק.' : claude.lastCheckOk ? `עבד בבדיקה מ-${checkedAt}.` : `לא ענה בבדיקה מ-${checkedAt}.`)
    return (
        <section className={c.card} data-alert={Boolean(alert)} role={alert ? 'alert' : undefined}>
            <div className={c.head}>
                <i className={c.dot} data-state={state} />
                <b>Claude</b>
                <span>{words}</span>
                <Button disabled={busy} onClick={onCheck}>בדוק את Claude</Button>
            </div>
        </section>
    )
}

export default function CustomerBoardView({ data, busy, error, updatedAt, onAct, onRefresh, onOpen }) {
    const [tab, setTab] = useState('today')
    const [query, setQuery] = useState('')
    const [testKey, setTestKey] = useState('post_1')
    // ?id= narrows the board to one customer, for links from the "today" screen.
    const [only, setOnly] = useState('')
    useEffect(() => setOnly(new URLSearchParams(window.location.search).get('id') || ''), [])
    const focused = only && !query ? (data?.rows || []).find(row => row.id === only) : null
    const focusedId = focused?.id
    const list = useRef(null)
    useEffect(() => { if (focusedId) list.current?.scrollIntoView() }, [focusedId])

    const rows = useMemo(() => {
        if (focused) return [focused]
        const q = query.trim().toLowerCase()
        if (!q) return (data?.rows || []).filter(row => row.group === tab)
        return (data?.rows || []).filter(row => `${row.title} ${row.ownerName || ''} ${row.phone || ''}`.toLowerCase().includes(q))
    }, [data, tab, query, focused])

    const act = (body, question) => {
        if (question && !window.confirm(question)) return
        onAct(body)
    }
    const on = data?.settings?.enabled === true
    const chosen = !query && !focused ? tab : ''
    // A list with something waiting comes first; an empty one sits with the switches.
    const requestsWait = Boolean(data?.requests?.items?.length)
    const samplesWait = Boolean(data?.samples?.items?.length)
    const requests = data && <CustomerRequests requests={data.requests} busy={busy} onAct={act} />
    const samples = data && <SignSamples samples={data.samples} busy={busy} onAct={act} />

    return (
        <Page>
            <Sheet>
                <Hero
                    title='טיפול בלקוחות'
                    under={<>
                        {updatedAt && <span>עודכן {updatedAt}</span>}
                        <button type='button' className={k.glass} onClick={onRefresh} disabled={busy}><RefreshCw size={15} />{busy ? 'טוען…' : 'רענן'}</button>
                    </>}
                    figures={data && data.groups.map(group => (
                        <Plaque
                            key={group.key} value={data.counts[group.key] || 0} label={group.label}
                            pressed={chosen === group.key}
                            onClick={() => { setTab(group.key); setQuery(''); setOnly('') }}
                        />
                    ))}
                />

                {error && <p role='alert' className={k.error}>{error}</p>}
                {!data && !error && <p className={k.unread}>טוען את הלקוחות…</p>}

                {data && <>
                    {(requestsWait || samplesWait) && (
                        <Panel title='מחכה לאישור שלך' Icon={ClipboardCheck}>
                            <div className={c.stack}>
                                {requestsWait && requests}
                                {samplesWait && samples}
                            </div>
                        </Panel>
                    )}

                    <Panel
                        title={focused ? 'לקוח אחד' : query ? 'תוצאות החיפוש' : data.groups.find(group => group.key === tab)?.label || 'לקוחות'}
                        Icon={Users}
                        aside={(
                            <div className={k.search}>
                                <Search size={17} aria-hidden='true' />
                                <input type='search' value={query} onChange={e => setQuery(e.target.value)} placeholder='חיפוש לפי שם או טלפון' aria-label='חיפוש לקוח' />
                            </div>
                        )}
                    >
                        {focused && (
                            <div ref={list} className={c.focused}>
                                <span>מוצג לקוח אחד: {focused.title}</span>
                                <Button onClick={() => setOnly('')}>הצג את כולם</Button>
                            </div>
                        )}

                        {rows.length === 0 ? (
                            <p className={k.unread}>{query ? 'לא נמצא לקוח כזה.' : tab === 'today' ? 'אין מה לטפל היום.' : 'אין כאן לקוחות.'}</p>
                        ) : <>
                            <div className={`hidden md:block ${k.tableBox}`}>
                                <div className={k.scroll}>
                                    <table className={`${k.table} ${k.dense}`}>
                                        <thead>
                                            <tr>{['לקוח', 'אירוע', 'הצעד הבא', 'הודעות', 'פעולה'].map(title => <th key={title} scope='col'>{title}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {rows.map(row => (
                                                <tr key={row.id} data-tone={row.overdue ? 'bad' : undefined}>
                                                    <td><Who row={row} onOpen={onOpen} /></td>
                                                    <td className='whitespace-nowrap'>
                                                        <b className='tabular-nums'>{shortDate(row.day)}</b>
                                                        <small className={c.small}>{countdown(row.toEvent)}</small>
                                                        <small className={c.small}>{row.stage}</small>
                                                    </td>
                                                    <td className={c.next}><Step row={row} today={data.today} /></td>
                                                    <td className='whitespace-nowrap'><Sends row={row} /></td>
                                                    <td>
                                                        <div className={c.actions}>
                                                            <StepActions row={row} act={act} busy={busy} />
                                                            <MoreActions row={row} act={act} busy={busy} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <ul className={`md:hidden ${c.cards}`}>
                                {rows.map(row => (
                                    <li key={row.id} data-overdue={row.overdue}>
                                        <div><Who row={row} onOpen={onOpen} /></div>
                                        <small className={c.small}>{[shortDate(row.day), countdown(row.toEvent), row.stage].filter(Boolean).join(' · ')}</small>
                                        <div><Step row={row} today={data.today} /></div>
                                        {Object.keys(row.sends || {}).length > 0 && <Sends row={row} />}
                                        <div className={c.actions}>
                                            <StepActions row={row} act={act} busy={busy} />
                                            <MoreActions row={row} act={act} busy={busy} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>}
                    </Panel>

                    <Panel title='אוטומציות והודעות' Icon={Zap}>
                        <div className={c.stack}>
                            <section className={c.card}>
                                <div className={c.head}>
                                    <i className={c.dot} data-state={on ? 'on' : 'off'} />
                                    <b>שליחה אוטומטית: {on ? 'פעילה' : 'כבויה'}</b>
                                    <span>{on ? 'ההודעות יוצאות בבוקר, לא בשבת ובחג.' : 'כשהיא כבויה, כל הודעה מופיעה כמשימה לשליחה בלחיצה.'}</span>
                                    <Button
                                        primary={!on} disabled={busy}
                                        onClick={() => act({ op: 'settings', enabled: !on }, on
                                            ? 'לכבות את השליחה האוטומטית?'
                                            : 'להפעיל שליחה אוטומטית? הודעות יישלחו ללקוחות בלי אישור נוסף. הפעל רק אחרי שהודעת בדיקה הגיעה אליך.')}
                                    >{on ? 'כבה' : 'הפעל'}</Button>
                                </div>
                                <div className={c.actions}>
                                    <span className={c.small}>בדיקה לטלפון שלך:</span>
                                    <select value={testKey} onChange={e => setTestKey(e.target.value)} className={c.select} aria-label='איזו הודעה לבדוק'>
                                        {Object.entries(SEND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                    <Button disabled={busy} onClick={() => act({ op: 'test', key: testKey })}>שלח בדיקה</Button>
                                </div>
                                <details className={c.upcoming}>
                                    <summary><CalendarDays size={16} aria-hidden='true' />הודעות בשבוע הקרוב ({data.sends.length})</summary>
                                    {data.sends.length === 0
                                        ? <p className={c.small}>אין הודעות מתוכננות.</p>
                                        : <ul>
                                            {data.sends.map(send => <li key={`${send.id}-${send.key}`}><b>{shortDate(send.day)}</b> {send.title}: {SEND_LABEL[send.key]}</li>)}
                                        </ul>}
                                </details>
                            </section>

                            <ClaudeStatus claude={data.claude} busy={busy} onCheck={() => act({ op: 'claudeCheck' })} />
                            {!requestsWait && requests}
                            {!samplesWait && samples}
                        </div>
                    </Panel>
                </>}
            </Sheet>
        </Page>
    )
}
