'use client'
// The "today" screen, Golden Jerusalem. Draws what /api/admin/today returns;
// the art is images under /public/admin-theme, every word and number is text.

import { useState } from 'react'
import Link from 'next/link'
import {
    AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ClipboardCheck, Coins, ExternalLink, FileText,
    Image as ImageIcon, MessageCircle, MessageSquareText, Phone, Send, Users,
} from 'lucide-react'
import { Hero, Page, Panel, Plaque } from '../ui/kit'
import k from '../ui/kit.module.css'
import { useAdmin } from '../ui/Shell'
import PersonWindow from '../customers/PersonWindow'
import { MainButton, markQuestion } from '../customers/personParts'
import { dollars } from './SpendWindow'
import TaskWindow from './TaskWindow'
import s from './today.module.css'

const TASK_ICON = { claude: AlertTriangle, draft: FileText, sample: ImageIcon, draw: ImageIcon, person: Users }
const MODE = { full_sales: 'מכירה מלאה', opening_only: 'פתיחה בלבד' }

const dateWords = iso => (iso
    ? new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
    : '')
const monthDay = iso => (iso
    ? new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
    : '')
const when = (day, toEvent) => {
    if (toEvent === 0) return 'היום'
    if (toEvent === 1) return 'מחר'
    return monthDay(day) || 'בלי תאריך'
}

// A speech bubble with a handset, the mark of the WhatsApp card.
const WhatsMark = ({ size = 28 }) => (
    <span className={s.whats} aria-hidden='true'>
        <MessageCircle size={size} strokeWidth={2.1} />
        <Phone size={Math.round(size * .42)} strokeWidth={0} fill='currentColor' />
    </span>
)

// A click on an inner button must not also open what its panel opens.
const only = action => event => {
    event.stopPropagation()
    action()
}

function Task({ task, busy, onApprove, onOpen, onMark }) {
    const Icon = TASK_ICON[task.kind] || FileText
    return (
        <li className={s.task}>
            <button type='button' className={s.taskOpen} onClick={() => onOpen(task)}>
                <span className={s.taskIcon}><Icon size={30} strokeWidth={1.9} aria-hidden='true' /></span>
                <span className={s.taskText}>
                    <b>{task.title}</b>
                    {task.detail && <small>{task.detail}</small>}
                </span>
                {task.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={task.image} alt='הדוגמה' className={s.thumb} />
                )}
            </button>
            {task.kind === 'person'
                ? <MainButton row={task.row} busy={busy} onMark={onMark} onOpen={() => onOpen(task)} />
                : task.canApprove
                    ? <button type='button' className={k.button} disabled={busy} onClick={() => onApprove(task)}><Send size={21} aria-hidden='true' />אשר ושלח</button>
                    : <button type='button' className={k.button} onClick={() => onOpen(task)}><ExternalLink size={21} aria-hidden='true' />פתח</button>}
        </li>
    )
}

const SWITCH_NAMES = { requests: 'טיוטות ללקוחות', samples: 'דוגמאות שלט', followups: 'הודעות מעקב' }

// In words, so "off" is not read as a greyed-out button.
function Switches({ switches, mode, onOpen }) {
    const names = on => Object.keys(SWITCH_NAMES).filter(key => switches[key] === on).map(key => SWITCH_NAMES[key]).join(', ')
    return (
        <button type='button' className={s.switches} onClick={only(() => onOpen('auto'))}>
            <span data-on='true'>מצב: {MODE[mode] || mode}</span>
            {names(true) && <span data-on='true'>פעיל: {names(true)}</span>}
            {names(false) && <span>כבוי: {names(false)}</span>}
        </button>
    )
}

function Bot({ bot, waiting, onOpen }) {
    return (
        <Panel title='בוט וואטסאפ' Icon={WhatsMark} className={`${s.botPanel} ${s.opens}`} onOpen={() => onOpen('state')} centered>
            {!bot ? <p className={k.unread}>{waiting || 'לא הצלחתי לקרוא את מצב הבוט.'}</p> : <>
                <div className={`${s.chip} ${bot.enabled ? s.on : s.off}`}><i />{bot.enabled ? 'הבוט פעיל' : 'הבוט כבוי'}</div>
                <button type='button' className={s.field} onClick={only(() => onOpen('state'))} aria-label={`ניהול הבוט, מודל ${bot.modelLabel}`}>
                    <span dir='ltr'>{bot.modelLabel}</span><ChevronDown size={20} strokeWidth={2.4} aria-hidden='true' />
                </button>
                <div className={s.count}>
                    <MessageSquareText size={32} strokeWidth={1.9} aria-hidden='true' />
                    <div>
                        <b>{bot.callsToday ?? '—'}</b>
                        <span>קריאות למודלים היום</span>
                    </div>
                </div>
                {bot.switches && <Switches switches={bot.switches} mode={bot.mode} onOpen={onOpen} />}
            </>}
            <div className={s.dove} aria-hidden='true' />
            <i className={`${s.leaf} ${s.leafLeft}`} aria-hidden='true' />
            <i className={`${s.leaf} ${s.leafRight}`} aria-hidden='true' />
        </Panel>
    )
}

function Spend({ spend, waiting, onOpen }) {
    const parts = spend ? [['Claude', spend.anthropic], ['OpenAI', spend.openai], ...(spend.other > 0 ? [['אחר', spend.other]] : [])] : []
    return (
        <Panel title='הוצאות החודש' Icon={Coins} className={`${s.spendPanel} ${s.opens}`} onOpen={onOpen} centered>
            {!spend ? <p className={k.unread}>{waiting || 'לא הצלחתי לקרוא את ההוצאות.'}</p> : <>
                <button type='button' className={s.money} onClick={only(onOpen)} aria-label={`פירוט ההוצאות, ${dollars(spend.month)} החודש`}>{dollars(spend.month)}</button>
                <ul className={s.bars}>
                    {parts.map(([name, value]) => (
                        <li key={name}>
                            <span dir='ltr'>{name}</span>
                            <i><em style={{ width: `${spend.month ? Math.max(4, Math.round(value / spend.month * 100)) : 0}%` }} /></i>
                            <b>{dollars(value)}</b>
                        </li>
                    ))}
                </ul>
                <p className={s.fine}>נספרות קריאות המודלים של האתר. לא החשבונית המלאה.</p>
            </>}
            <div className={s.casket} aria-hidden='true' />
        </Panel>
    )
}

export default function TodayView({ data, busy, error, onApprove, onRefresh, onAct, api }) {
    const { openBot, openSpend } = useAdmin()
    // The task or person window that is open over the screen, if any.
    const [view, setView] = useState(null)
    const close = () => setView(null)
    const openPerson = key => setView({ type: 'person', key })
    const openTask = task => {
        if (task.kind === 'person') openPerson(task.id)
        else if (task.kind === 'claude') openBot('state')
        else setView({ type: 'task', task })
    }
    // A step finished from the task itself, asked first like everywhere else.
    const mark = (row, field) => onAct({ op: 'mark', weddingId: row.weddingId, field, on: true }, markQuestion(row, field))
    // Read from the latest data, so the window follows each change. A person who
    // leaves both lists after one closes the window.
    const person = view?.type === 'person'
        ? [...(data?.tasks || []), ...(data?.customers || [])].map(item => item.row).find(row => row?.key === view.key)
        : null
    // What to say where there is no data yet.
    const waiting = data ? '' : busy || !error ? 'טוען…' : 'לא נטען.'
    const partial = data?.unread?.length > 0
    const figure = key => (data ? data.counts[key] ?? '—' : '…')
    const noCustomers = waiting || (data.customers.length ? '' : data.unread.includes('לקוחות') ? 'רשימת הלקוחות לא נקראה.' : 'אין לקוחות פעילים.')
    return (
        <Page>
            <div className={s.columns}>
                <div className={s.center}>
                    <Hero
                        title='מה מחכה לך היום'
                        under={<>
                            {dateWords(data?.date)}
                            <button type='button' className={k.glass} onClick={onRefresh} disabled={busy}>{busy ? 'טוען…' : 'רענן'}</button>
                        </>}
                        figures={<>
                            <Plaque value={figure('today')} label='לטיפול היום' Icon={ClipboardCheck} />
                            <Plaque value={figure('active')} label='לקוחות פעילים' Icon={Users} solid />
                            <Plaque value={figure('week')} label='אירועים השבוע' Icon={CalendarDays} />
                        </>}
                    />

                    {error && <p role='alert' className={k.error}>{error}</p>}
                    {data?.unread?.length > 0 && <p role='alert' className={k.error}>לא נקראו: {data.unread.join(', ')}. המספרים חלקיים.</p>}

                    <Panel title='משימות לטיפול היום' Icon={ClipboardCheck}>
                        {waiting ? <p className={k.unread}>{waiting}</p>
                            : data.tasks.length === 0 ? <p className={k.unread}>{partial ? 'לא כל המקורות נקראו, אז ייתכן שיש מה לטפל.' : 'אין מה לטפל כרגע.'}</p>
                                : <ul className={s.tasks}>{data.tasks.map(task => <Task key={`${task.kind}-${task.id}`} task={task} busy={busy} onApprove={onApprove} onOpen={openTask} onMark={mark} />)}</ul>}
                        {data?.moreTasks > 0 && <Link href='/admin/customers' className={k.more}>ועוד {data.moreTasks} משימות</Link>}
                    </Panel>

                    <Panel title='לקוחות פעילים' Icon={Users}>
                        {noCustomers ? <p className={k.unread}>{noCustomers}</p> : (
                            <div className={k.tableBox}><table className={`${k.table} ${s.customers}`}>
                                <thead><tr><th>לקוח</th><th>אירוע</th><th>הצעד הבא</th></tr></thead>
                                <tbody>
                                    {data.customers.map(c => (
                                        <tr key={c.id} data-opens onClick={() => openPerson(c.id)}>
                                            <td><button type='button' onClick={only(() => openPerson(c.id))}><Users size={22} strokeWidth={2.2} fill='currentColor' aria-hidden='true' />{c.title}</button></td>
                                            <td>{c.event} – {when(c.day, c.toEvent)}</td>
                                            <td data-overdue={c.overdue}>
                                                <span className={s.step}>{c.step}<ChevronLeft size={20} strokeWidth={2.6} aria-hidden='true' /></span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table></div>
                        )}
                        {data?.moreCustomers > 0 && <Link href='/admin/customers' className={k.more}>ועוד {data.moreCustomers} לקוחות</Link>}
                    </Panel>
                </div>

                <div className={s.side}>
                    <Bot bot={data ? data.bot : null} waiting={waiting} onOpen={openBot} />
                    <Spend spend={data ? data.spend : null} waiting={waiting} onOpen={openSpend} />
                </div>
            </div>

            {view?.type === 'task' && <TaskWindow task={view.task} api={api} onChanged={onRefresh} onClose={close} />}
            {person && (
                <PersonWindow
                    key={person.key} row={person} drafts={data.drafts} samples={data.samples} busy={busy} error={error}
                    act={onAct} api={api} onClose={close}
                />
            )}
        </Page>
    )
}
