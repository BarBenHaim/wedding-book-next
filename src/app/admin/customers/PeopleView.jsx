'use client'
// The list of people. Draws what /api/admin/people returns; the rules are in
// lib/people.js.

import { useMemo, useState } from 'react'
import { Moon, RefreshCw, Search, Users, CheckCircle2 } from 'lucide-react'
import { STAGES } from '@/lib/peopleStages'
import { Hero, Page, Panel, Plaque, Sheet } from '../ui/kit'
import k from '../ui/kit.module.css'
import { MainButton, Where, shortDate, whenWords } from './personParts'
import p from './people.module.css'

const PAGE = 60
const ACTIVE = STAGES.filter(stage => stage.key !== 'done')
const TITLES = { today: 'לטיפול היום', resting: 'רדומים', done: 'הסתיימו', ...Object.fromEntries(ACTIVE.map(stage => [stage.key, stage.label])) }
const EMPTY = { today: 'אין מה לטפל היום.', resting: 'אין רדומים.', done: 'עוד לא הסתיים אף אחד.' }

const inFilter = (row, filter) => {
    if (filter === 'today') return row.inToday
    if (filter === 'resting') return row.resting
    return !row.resting && row.stage === filter
}
// Phones are typed with a leading zero and stored with the country code.
const matches = (row, query) => {
    const digits = query.replace(/\D/g, '')
    if (digits.length >= 4 && digits.length === query.replace(/[\s-]/g, '').length) {
        return String(row.phone || '').includes(digits.replace(/^0/, ''))
    }
    return `${row.name} ${row.ownerName || ''}`.toLowerCase().includes(query.toLowerCase())
}

const details = row => [row.what, row.day ? shortDate(row.day) : ''].filter(Boolean).join(' · ')
const step = row => row.next?.label || '—'

export default function PeopleView({ data, busy, error, updatedAt, onRefresh, onOpen, onMark }) {
    const [filter, setFilter] = useState('today')
    const [query, setQuery] = useState('')
    const [shown, setShown] = useState(PAGE)
    const search = query.trim()
    const rows = useMemo(
        () => (data?.rows || []).filter(row => (search ? matches(row, search) : inFilter(row, filter))),
        [data, filter, search],
    )
    const choose = next => { setFilter(next); setQuery(''); setShown(PAGE) }
    const unread = data?.unread || []
    // A list built without the books or the leads counts nothing.
    const whole = data && !unread.some(name => name === 'ספרים' || name === 'לידים')
    const count = key => (!data ? '…' : whole ? data.counts[key] : '—')
    const empty = search ? 'לא נמצא אף אחד.' : !whole ? 'חלק מהנתונים לא נקראו, ולכן הרשימה חלקית.' : EMPTY[filter] || 'אין כאן אף אחד.'

    return (
        <Page>
            <Sheet>
                <Hero
                    title='לקוחות'
                    under={<>
                        {updatedAt && <span>עודכן {updatedAt}</span>}
                        <button type='button' className={k.glass} onClick={onRefresh} disabled={busy}><RefreshCw size={15} />{busy ? 'טוען…' : 'רענן'}</button>
                        <button type='button' className={k.glass} aria-pressed={filter === 'resting' && !search} onClick={() => choose('resting')}><Moon size={14} />רדומים ({count('resting')})</button>
                        <button type='button' className={k.glass} aria-pressed={filter === 'done' && !search} onClick={() => choose('done')}><CheckCircle2 size={14} />הסתיימו ({count('done')})</button>
                    </>}
                    figures={[{ key: 'today', label: TITLES.today }, ...ACTIVE].map(item => (
                        <Plaque key={item.key} value={count(item.key)} label={item.label} pressed={!search && filter === item.key} onClick={() => choose(item.key)} />
                    ))}
                />

                {error && <p role='alert' className={k.error}>{error}</p>}
                {unread.length > 0 && <p role='alert' className={k.error}>לא נקראו: {unread.join(', ')}. הרשימה חלקית.</p>}

                <Panel
                    title={search ? 'תוצאות החיפוש' : TITLES[filter]} Icon={Users}
                    aside={(
                        <div className={k.search}>
                            <Search size={17} aria-hidden='true' />
                            <input type='search' value={query} onChange={event => { setQuery(event.target.value); setShown(PAGE) }} placeholder='חיפוש לפי שם או טלפון, בכולם' aria-label='חיפוש לקוח' />
                        </div>
                    )}
                >
                    {!data ? <p className={k.unread}>{error ? 'לא נטען.' : 'טוען את הלקוחות…'}</p>
                        : rows.length === 0 ? <p className={k.unread}>{empty}</p> : <>
                            <div className={`hidden md:block ${k.tableBox}`}>
                                <div className={k.scroll}>
                                    <table className={`${k.table} ${k.dense}`}>
                                        <thead><tr>{['לקוח', 'איפה עומדים', 'מה לעשות', 'מתי', 'פעולה'].map(title => <th key={title} scope='col'>{title}</th>)}</tr></thead>
                                        <tbody>
                                            {rows.slice(0, shown).map(row => (
                                                <tr key={row.key} data-opens data-tone={row.overdue ? 'bad' : undefined} onClick={() => onOpen(row)}>
                                                    <td>
                                                        <button type='button' className={p.name} onClick={event => { event.stopPropagation(); onOpen(row) }}>{row.name}</button>
                                                        <small>{details(row)}</small>
                                                    </td>
                                                    <td><Where row={row} /></td>
                                                    <td className={p.step} data-overdue={row.overdue}>{step(row)}</td>
                                                    <td className='whitespace-nowrap'>{whenWords(row, data.today)}</td>
                                                    <td><MainButton row={row} busy={busy} onMark={onMark} onOpen={onOpen} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <ul className={`md:hidden ${p.cards}`}>
                                {rows.slice(0, shown).map(row => (
                                    <li key={row.key} data-overdue={row.overdue} onClick={() => onOpen(row)}>
                                        <div className={p.cardTop}>
                                            <span>
                                                <button type='button' className={p.name} onClick={event => { event.stopPropagation(); onOpen(row) }}>{row.name}</button>
                                                <small>{details(row)}</small>
                                            </span>
                                            <Where row={row} />
                                        </div>
                                        <div className={p.step} data-overdue={row.overdue}>{step(row)}<small>{whenWords(row, data.today)}</small></div>
                                        <MainButton row={row} busy={busy} onMark={onMark} onOpen={onOpen} />
                                    </li>
                                ))}
                            </ul>
                            {rows.length > shown && (
                                <div className={p.moreRow}><button type='button' className={k.quiet} onClick={() => setShown(shown + PAGE)}>הצג עוד ({rows.length - shown})</button></div>
                            )}
                        </>}
                </Panel>
            </Sheet>
        </Page>
    )
}
