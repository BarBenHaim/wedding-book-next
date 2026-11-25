'use client'
// The "today" screen, Golden Jerusalem. Draws what /api/admin/today returns;
// the art is images under /public/admin-theme, every word and number is text.

import Link from 'next/link'
import {
    AlertTriangle, Calendar, CalendarDays, ChevronLeft, ClipboardCheck, Coins, ExternalLink, FileText,
    Image as ImageIcon, MessageCircle, MessageSquareText, Palette, Phone, Send, Users,
} from 'lucide-react'
import { jerusalemSerif } from './font'
import s from './today.module.css'

const NAV = [
    { href: '/admin/today', label: 'היום', Icon: Calendar },
    { href: '/admin/customers', label: 'לקוחות', Icon: Users },
    { href: '/admin', label: 'אירועים', Icon: CalendarDays },
    { href: '/admin/sales-leads', label: 'בוט וואטסאפ', Icon: MessageCircle },
    { href: '/admin/sales-leads#spend', label: 'הוצאות', Icon: Coins },
    { href: '/admin/studio', label: 'עיצוב', Icon: Palette },
]
const TASK_ICON = { claude: AlertTriangle, draft: FileText, sample: ImageIcon, draw: ImageIcon, book: CalendarDays }
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
const dollars = value => `$${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A speech bubble with a handset, the mark of the WhatsApp card.
const WhatsMark = ({ size = 28 }) => (
    <span className={s.whats} aria-hidden='true'>
        <MessageCircle size={size} strokeWidth={2.1} />
        <Phone size={Math.round(size * .42)} strokeWidth={0} fill='currentColor' />
    </span>
)

function Panel({ title, Icon, children, className = '' }) {
    return (
        <section className={`${s.panel} ${className}`}>
            <header className={s.panelHead}>
                <h2><Icon size={28} strokeWidth={2.1} aria-hidden='true' />{title}</h2>
            </header>
            {children}
        </section>
    )
}

function Task({ task, busy, onApprove }) {
    const Icon = TASK_ICON[task.kind] || FileText
    return (
        <li className={s.task}>
            <span className={s.taskIcon}><Icon size={30} strokeWidth={1.9} aria-hidden='true' /></span>
            <span className={s.taskText}>
                <b>{task.title}</b>
                {task.detail && <small>{task.detail}</small>}
            </span>
            {task.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={task.image} alt='הדוגמה' className={s.thumb} />
            )}
            {task.canApprove
                ? <button type='button' className={s.button} disabled={busy} onClick={() => onApprove(task)}><Send size={21} aria-hidden='true' />אשר ושלח</button>
                : <Link href={task.href} className={s.button}><ExternalLink size={21} aria-hidden='true' />פתח</Link>}
        </li>
    )
}

function Figure({ value, label, Icon }) {
    return (
        <div className={s.plaque}>
            <b><Icon size={34} strokeWidth={2} aria-hidden='true' />{value}</b>
            <span>{label}</span>
        </div>
    )
}

const SWITCH_NAMES = { requests: 'טיוטות ללקוחות', samples: 'דוגמאות שלט', followups: 'הודעות מעקב' }

// In words, so "off" is not read as a greyed-out button.
function Switches({ switches, mode }) {
    const names = on => Object.keys(SWITCH_NAMES).filter(key => (switches[key] === true) === on).map(key => SWITCH_NAMES[key]).join(', ')
    return (
        <Link href='/admin/customers' className={s.switches}>
            <span data-on='true'>מצב: {MODE[mode] || mode}</span>
            {names(true) && <span data-on='true'>פעיל: {names(true)}</span>}
            {names(false) && <span>כבוי: {names(false)}</span>}
        </Link>
    )
}

function Bot({ bot, waiting }) {
    return (
        <Panel title='בוט וואטסאפ' Icon={WhatsMark} className={s.botPanel}>
            {!bot ? <p className={s.unread}>{waiting || 'לא הצלחתי לקרוא את מצב הבוט.'}</p> : <>
                <div className={`${s.chip} ${bot.enabled ? s.on : s.off}`}><i />{bot.enabled ? 'הבוט פעיל' : 'הבוט כבוי'}</div>
                <div className={s.field}><span dir='ltr'>{bot.modelLabel}</span></div>
                <div className={s.count}>
                    <MessageSquareText size={32} strokeWidth={1.9} aria-hidden='true' />
                    <div>
                        <b>{bot.callsToday ?? '—'}</b>
                        <span>פניות למודל היום</span>
                    </div>
                </div>
                {bot.switches && <Switches switches={bot.switches} mode={bot.mode} />}
            </>}
            <div className={s.dove} aria-hidden='true' />
            <i className={`${s.leaf} ${s.leafLeft}`} aria-hidden='true' />
            <i className={`${s.leaf} ${s.leafRight}`} aria-hidden='true' />
        </Panel>
    )
}

function Spend({ spend, waiting }) {
    const parts = spend ? [['Claude', spend.anthropic], ['OpenAI', spend.openai], ...(spend.other > 0 ? [['אחר', spend.other]] : [])] : []
    return (
        <Panel title='הוצאות החודש' Icon={Coins} className={s.spendPanel}>
            {!spend ? <p className={s.unread}>{waiting || 'לא הצלחתי לקרוא את ההוצאות.'}</p> : <>
                <div className={s.money}>{dollars(spend.month)}</div>
                <ul className={s.bars}>
                    {parts.map(([name, value]) => (
                        <li key={name}>
                            <span dir='ltr'>{name}</span>
                            <i><em style={{ width: `${spend.month ? Math.max(4, Math.round(value / spend.month * 100)) : 0}%` }} /></i>
                            <b>{dollars(value)}</b>
                        </li>
                    ))}
                </ul>
                <p className={s.fine}>מה שהמערכת סופרת: תשובות הבוט. לא כל ההוצאות.</p>
            </>}
            <div className={s.casket} aria-hidden='true' />
        </Panel>
    )
}

export default function TodayView({ data, busy, error, onApprove, onRefresh }) {
    // What to say where there is no data yet.
    const waiting = data ? '' : busy || !error ? 'טוען…' : 'לא נטען.'
    const partial = data?.unread?.length > 0
    const figure = key => (data ? data.counts[key] ?? '—' : '…')
    const noCustomers = waiting || (data.customers.length ? '' : data.unread.includes('לקוחות') ? 'רשימת הלקוחות לא נקראה.' : 'אין לקוחות פעילים.')
    return (
        <div dir='rtl' className={s.root} style={{ '--serif': jerusalemSerif.style.fontFamily }}>
            <aside className={s.rail}>
                <Link href='/admin/today' className={s.brand}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src='/brand/logo-on-dark.png' alt='Wedding Tales' />
                </Link>
                <div className={s.rule} aria-hidden='true' />
                <nav aria-label='ניווט ראשי'>
                    {NAV.map(({ href, label, Icon }) => (
                        <Link key={label} href={href} className={s.item} aria-current={href === '/admin/today' ? 'page' : undefined}>
                            <span>{label}</span><Icon size={26} strokeWidth={2} aria-hidden='true' />
                        </Link>
                    ))}
                </nav>
                <div className={s.rule} aria-hidden='true' />
                <div className={s.alley} aria-hidden='true' />
            </aside>

            <main className={s.main}>
                <div className={s.sky} aria-hidden='true' />
                <div className={`${s.olive} ${s.oliveSide}`} aria-hidden='true' />
                <div className={`${s.olive} ${s.oliveFoot}`} aria-hidden='true' />
                <div className={s.columns}>
                    <div className={s.center}>
                        <div className={s.hero}>
                            <h1>מה מחכה לך היום</h1>
                            <div className={s.flourish} aria-hidden='true' />
                            <p className={s.date}>
                                {dateWords(data?.date)}
                                <button type='button' onClick={onRefresh} disabled={busy}>{busy ? 'טוען…' : 'רענן'}</button>
                            </p>
                            <div className={s.figures}>
                                <Figure value={figure('tasks')} label='משימות לטיפול' Icon={ClipboardCheck} />
                                <Figure value={figure('active')} label='לקוחות פעילים' Icon={Users} />
                                <Figure value={figure('week')} label='אירועים השבוע' Icon={CalendarDays} />
                            </div>
                        </div>

                        {error && <p role='alert' className={s.error}>{error}</p>}
                        {data?.unread?.length > 0 && <p role='alert' className={s.error}>לא נקראו: {data.unread.join(', ')}. המספרים חלקיים.</p>}

                        <Panel title='משימות לטיפול היום' Icon={ClipboardCheck}>
                            {waiting ? <p className={s.unread}>{waiting}</p>
                                : data.tasks.length === 0 ? <p className={s.unread}>{partial ? 'לא כל המקורות נקראו, אז ייתכן שיש מה לטפל.' : 'אין מה לטפל כרגע.'}</p>
                                    : <ul className={s.tasks}>{data.tasks.map(task => <Task key={`${task.kind}-${task.id}`} task={task} busy={busy} onApprove={onApprove} />)}</ul>}
                            {(data?.moreTasks > 0 || data?.oldEvents > 0) && (
                                <Link href='/admin/customers' className={s.more}>
                                    {[data.moreTasks > 0 ? `ועוד ${data.moreTasks} משימות` : null, data.oldEvents > 0 ? `${data.oldEvents} אירועים ישנים למיון` : null].filter(Boolean).join(' · ')}
                                </Link>
                            )}
                        </Panel>

                        <Panel title='לקוחות פעילים' Icon={Users}>
                            {noCustomers ? <p className={s.unread}>{noCustomers}</p> : (
                                <div className={s.tableBox}><table className={s.table}>
                                    <thead><tr><th>לקוח</th><th>אירוע</th><th>הצעד הבא</th></tr></thead>
                                    <tbody>
                                        {data.customers.map(c => (
                                            <tr key={c.id}>
                                                <td><Link href={c.href}><Users size={22} strokeWidth={2.2} fill='currentColor' aria-hidden='true' />{c.title}</Link></td>
                                                <td>{c.event} – {when(c.day, c.toEvent)}</td>
                                                <td data-overdue={c.overdue}>
                                                    <Link href={c.href} className={s.step} tabIndex={-1}>{c.step}<ChevronLeft size={20} strokeWidth={2.6} aria-hidden='true' /></Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table></div>
                            )}
                            {data?.moreCustomers > 0 && <Link href='/admin/customers' className={s.more}>ועוד {data.moreCustomers} לקוחות</Link>}
                        </Panel>
                    </div>

                    <div className={s.side}>
                        <Bot bot={data ? data.bot : null} waiting={waiting} />
                        <Spend spend={data ? data.spend : null} waiting={waiting} />
                    </div>
                </div>
            </main>
        </div>
    )
}
