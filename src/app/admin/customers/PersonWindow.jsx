'use client'
// One person: where they stand, the next step and its buttons, what waits for
// approval, the book and the conversation. Every change goes through a route
// that already existed.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, MessageCircle } from 'lucide-react'
import { STAGES, stageIndex } from '@/lib/peopleStages'
import { STAGE_META } from '@/lib/salesAgent/leadsView'
import Window, { Notice } from '../ui/Window'
import k from '../ui/kit.module.css'
import w from '../ui/windows.module.css'
import { Request } from './CustomerRequests'
import { MARK_LABEL, markQuestion, shortDate, waLink } from './personParts'
import p from './people.module.css'

const countdown = days => {
    if (days == null) return ''
    if (days === 0) return 'היום'
    if (days === 1) return 'מחר'
    if (days === -1) return 'אתמול'
    return days > 0 ? `בעוד ${days} ימים` : `לפני ${-days} ימים`
}
const UNDO = {
    printOrderedAt: 'בטל "הזמנתי להדפסה"', shippedAt: 'בטל "נשלח"', deliveredAt: 'בטל "הגיע"',
    closedAt: 'פתח מחדש', triagedAt: 'החזר לרשימת הישנים',
}
const LAST_TURNS = 6

// The milestones that can come next for a book, whatever its next step says.
// Offered once the event is behind or the book is already at the printer, so a
// book still being written is not marked by a stray tap.
const milestones = row => {
    const has = field => (row.marks || []).includes(field)
    const later = row.next?.field || ['print', 'way'].includes(row.stage) || (row.toEvent != null && row.toEvent < 0)
    if (!later || has('deliveredAt') || has('closedAt')) return []
    if (has('shippedAt')) return ['deliveredAt']
    if (has('printOrderedAt')) return ['shippedAt', 'deliveredAt']
    return ['printOrderedAt', 'deliveredAt']
}

function Progress({ row }) {
    const at = stageIndex(row.stage)
    return (
        <ol className={p.progress} aria-label='שלב'>
            {STAGES.map((stage, i) => (
                <li key={stage.key} data-state={i === at ? 'here' : i < at ? 'passed' : 'ahead'} aria-current={i === at ? 'step' : undefined}>{stage.label}</li>
            ))}
        </ol>
    )
}

function NextStep({ row, busy, act }) {
    const next = row.next
    const id = row.weddingId
    const message = next?.message
    return (
        <div className={w.card}>
            <h3>הצעד הבא</h3>
            <p className={w.next} data-overdue={row.overdue}>
                {next ? `${next.label}${row.overdue ? ' (באיחור)' : ''}` : row.resting ? 'רדום: אין מה לעשות כרגע' : 'אין כרגע מה לעשות'}
            </p>
            {row.deferredUntil && <p>נדחה עד {shortDate(row.deferredUntil)}.</p>}
            {!row.phone && <p>אין טלפון בשורה הזאת. הוספת טלפון מהמסך תגיע בשלב הבא.</p>}
            <div className={w.actions}>
                {id && milestones(row).map(field => (
                    <button
                        key={field} type='button' disabled={busy}
                        className={next?.field === field ? k.button : k.quiet}
                        onClick={() => act({ op: 'mark', weddingId: id, field, on: true }, markQuestion(row, field))}
                    >{next?.field === field && <CalendarCheck size={19} aria-hidden='true' />}{MARK_LABEL[field]}</button>
                ))}
                {row.phone && (
                    <a href={waLink(row.phone, next?.text)} target='_blank' rel='noopener noreferrer' className={next?.action === 'whatsapp' ? k.button : k.quiet}>
                        <MessageCircle size={17} aria-hidden='true' />וואטסאפ
                    </a>
                )}
                {id && message && (
                    <button type='button' className={k.quiet} disabled={busy} onClick={() => act({ op: 'sentByHand', weddingId: id, key: message }, `לסמן ששלחת ל${row.name}? ההודעה לא תישלח שוב.`)}>שלחתי</button>
                )}
                {id && row.stage !== 'done' && <>
                    <button type='button' className={k.quiet} disabled={busy} onClick={() => act({ op: 'defer', weddingId: id, days: 3 })}>דחה ב-3 ימים</button>
                    <button type='button' className={k.quiet} disabled={busy} onClick={() => act({ op: 'defer', weddingId: id, days: 7 })}>דחה בשבוע</button>
                    {row.deferredUntil && <button type='button' className={k.quiet} disabled={busy} onClick={() => act({ op: 'defer', weddingId: id, days: 0 })}>בטל דחייה</button>}
                </>}
            </div>
        </div>
    )
}

function Waiting({ row, drafts, busy, act }) {
    if (!drafts.length && !row.requests) return null
    return (
        <div className={w.card}>
            <h3>מה הלקוח כתב</h3>
            {row.messages.map((message, i) => <blockquote key={i}>{message.text || 'שלחו קובץ'}</blockquote>)}
            {drafts.length > 0 && <ul className={p.draft}>{drafts.map(draft => <Request key={draft.number} item={draft} busy={busy} onAct={act} />)}</ul>}
            {row.requests > 0 && row.weddingId && (
                <div className={w.actions}>
                    <button type='button' className={k.quiet} disabled={busy} onClick={() => act({ op: 'handled', weddingId: row.weddingId }, `לסגור את ההודעות של ${row.name} כטופלו?`)}>טופל</button>
                </div>
            )}
        </div>
    )
}

function Sample({ sample, busy, act }) {
    const decide = (decision, question) => act({ op: 'sample', id: sample.id, decision }, question)
    return (
        <div className={w.card}>
            <h3>דוגמת שלט לאישור</h3>
            {sample.previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sample.previewUrl} alt='הדוגמה לאישור' className={w.picture} />
            )}
            {!sample.windowOpen && <p>עברו 24 שעות מההודעה של הליד. צריך לשלוח ידנית.</p>}
            <div className={w.actions}>
                {sample.windowOpen && <button type='button' className={k.button} disabled={busy} onClick={() => decide('send', 'לשלוח את הדוגמה הזאת לליד?')}>אשר ושלח</button>}
                <button type='button' className={k.quiet} disabled={busy} onClick={() => decide('manual', 'שלחת את הדוגמה בעצמך? היא תוסר מהרשימה ולא תישלח שוב.')}>שלחתי ידנית</button>
                <button type='button' className={k.quiet} disabled={busy} onClick={() => decide('reject', 'לבטל את הדוגמה הזאת? היא לא תישלח.')}>בטל</button>
            </div>
        </div>
    )
}

function Book({ row, busy, act }) {
    const id = row.weddingId
    const choose = value => {
        if (UNDO[value]) act({ op: 'mark', weddingId: id, field: value, on: false }, `${UNDO[value]}: ${row.name}?`)
        if (value === 'mute') act({ op: 'mute', weddingId: id, on: !row.muted })
        if (value === 'close') act({ op: 'mark', weddingId: id, field: 'closedAt', on: true }, `לסגור את ${row.name}? הוא יעבור ל"הסתיימו".`)
    }
    return (
        <div className={w.card}>
            <ul className={w.list}>
                {row.ownerName && <li><b>בעל האירוע</b><span>{row.ownerName}</span></li>}
                <li><b>ברכות</b><span>{row.entries}</span></li>
                <li><b>תשלום רשום</b><span>{row.amount ? `₪${row.amount}` : 'אין'}</span></li>
                {row.note && <li><b>הערה</b><span>{row.note}</span></li>}
            </ul>
            <div className={w.actions}>
                <Link href={`/wedding/${encodeURIComponent(id)}/admin`} className={k.quiet}>לספר ולברכות</Link>
                <Link href={`/admin?id=${encodeURIComponent(id)}`} className={k.quiet}>ניהול מתקדם</Link>
                <select value='' disabled={busy} onChange={event => choose(event.target.value)} aria-label={`שינויים נוספים: ${row.name}`} className={p.select}>
                    <option value=''>שינוי…</option>
                    {(row.marks || []).filter(mark => UNDO[mark]).map(mark => <option key={mark} value={mark}>{UNDO[mark]}</option>)}
                    <option value='mute'>{row.muted ? 'הפעל הודעות ללקוח' : 'כבה הודעות ללקוח'}</option>
                    {row.stage !== 'done' && <option value='close'>סגור (בוטל או הוחזר)</option>}
                </select>
            </div>
        </div>
    )
}

function Conversation({ row, busy, act, api }) {
    const phone = row.leadPhone
    const [turns, setTurns] = useState(undefined)
    const [all, setAll] = useState(false)
    useEffect(() => {
        let alive = true
        api(`/api/sales-agent/leads?phone=${encodeURIComponent(phone)}`)
            .then(result => { if (alive) setTurns(result.lead?.turns || []) })
            .catch(() => { if (alive) setTurns(null) })
        return () => { alive = false }
    }, [api, phone])

    const lead = row.lead || {}
    const open = !['closed_won', 'closed_lost'].includes(lead.stage)
    const control = (action, question) => act({ phone, action, reason: 'ממסך הלקוחות' }, question, '/api/sales-agent/control')
    const patch = (fields, question) => act({ phone, ...fields }, question, '/api/sales-agent/leads', 'PATCH')
    return (
        <div className={w.card}>
            <h3>השיחה בוואטסאפ</h3>
            <p>{[STAGE_META[lead.stage]?.label, lead.handoffReason].filter(Boolean).join(' · ')}</p>
            {turns === undefined ? <p>טוען את השיחה…</p>
                : turns === null ? <p>השיחה לא נקראה.</p>
                    : turns.length === 0 ? <p>אין עדיין הודעות.</p> : <>
                        {turns.length > LAST_TURNS && !all && <button type='button' className={`${k.quiet} ${k.small}`} onClick={() => setAll(true)}>כל השיחה ({turns.length})</button>}
                        <div className={p.talk}>
                            {(all ? turns : turns.slice(-LAST_TURNS)).map((turn, i) => <p key={i} data-from={turn.role}>{turn.text}</p>)}
                        </div>
                    </>}
            <div className={w.actions}>
                {lead.paused
                    ? <button type='button' className={k.quiet} disabled={busy} onClick={() => control('resume', 'להחזיר את הבוט לשיחה הזאת?')}>החזר את הבוט</button>
                    : <button type='button' className={k.quiet} disabled={busy} onClick={() => control('pause', 'לקחת את השיחה אליך? הבוט יפסיק לענות בה.')}>אני מטפל, השתק בוט</button>}
                {open && lead.followUpAt && <button type='button' className={k.quiet} disabled={busy} onClick={() => patch({ followUpAt: null }, 'להפסיק את הודעות המעקב לליד הזה?')}>הפסק מעקב</button>}
                {open && row.kind === 'lead' && <button type='button' className={k.quiet} disabled={busy} onClick={() => patch({ stage: 'closed_lost' }, `לסמן ש${row.name} לא רלוונטי? השיחה תעבור ל"הסתיימו".`)}>לא רלוונטי</button>}
            </div>
        </div>
    )
}

export default function PersonWindow({ row, drafts, samples, busy, error, act, api, onClose }) {
    const mine = (row.drafts || []).map(number => (drafts || []).find(item => item.number === number)).filter(Boolean)
    const signs = (samples || []).filter(item => (row.samples || []).includes(item.id))
    const when = [row.what, row.day ? `${shortDate(row.day)}, ${countdown(row.toEvent)}` : ''].filter(Boolean).join(' · ')
    // The window asks the server only through `api`.
    const read = useCallback(url => api(url), [api])
    return (
        <Window title={row.name} subtitle={when} onClose={onClose}>
            <div className={w.stack}>
                <Notice tone='bad'>{error}</Notice>
                <div className={w.card}><Progress row={row} /></div>
                {signs.map(sample => <Sample key={sample.id} sample={sample} busy={busy} act={act} />)}
                <Waiting row={row} drafts={mine} busy={busy} act={act} />
                <NextStep row={row} busy={busy} act={act} />
                {row.weddingId && <Book row={row} busy={busy} act={act} />}
                {row.leadPhone && <Conversation key={row.leadPhone} row={row} busy={busy} act={act} api={read} />}
            </div>
        </Window>
    )
}
