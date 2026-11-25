'use client'
// What the list and the person window both draw about one person.

import { STAGES, stageIndex, stageLabel } from '@/lib/peopleStages'
import k from '../ui/kit.module.css'
import p from './people.module.css'

const DAY_MS = 86_400_000
export const MARK_LABEL = { printOrderedAt: 'הזמנתי להדפסה', shippedAt: 'נשלח', deliveredAt: 'הגיע' }
export const markQuestion = (row, field) => `לסמן "${MARK_LABEL[field]}" ל${row.name}?`
export const shortDate = iso => (iso ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(2, 4)}` : '')
export const waLink = (phone, text) => `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`

export const whenWords = (row, today) => {
    if (row.overdue) {
        const days = Math.round((Date.parse(today) - Date.parse(row.due)) / DAY_MS)
        return days === 1 ? 'איחור של יום' : `איחור ${days} ימים`
    }
    if (row.inToday) return 'היום'
    if (row.due) return shortDate(row.due)
    if (row.resting && row.lastAt) return `כתב ב-${new Date(row.lastAt).toLocaleDateString('he-IL')}`
    return '—'
}

export function Where({ row }) {
    const at = stageIndex(row.stage)
    return (
        <span className={p.where}>
            <b>{row.resting ? 'רדום' : stageLabel(row.stage)}</b>
            <span aria-hidden='true'>{STAGES.map((stage, i) => <i key={stage.key} data-on={i <= at && !row.resting} />)}</span>
        </span>
    )
}

const stop = event => event.stopPropagation()

// The one button of a row. `onMark` finishes a step; everything that needs more
// than one tap opens the person.
export function MainButton({ row, busy, onMark, onOpen }) {
    const next = row.next
    if (next?.action === 'mark') {
        return <button type='button' className={`${k.button} ${k.small} ${p.main}`} disabled={busy} onClick={event => { stop(event); onMark(row, next.field) }}>{MARK_LABEL[next.field]}</button>
    }
    if (next?.action === 'whatsapp' && row.phone) {
        return <a href={waLink(row.phone, next.text)} target='_blank' rel='noopener noreferrer' className={`${k.button} ${k.small} ${p.main}`} onClick={stop}>וואטסאפ</a>
    }
    return (
        <button type='button' className={`${k.quiet} ${k.small} ${p.main}`} onClick={event => { stop(event); onOpen(row) }}>
            {next?.action === 'phone' ? 'חסר טלפון' : 'פתח'}
        </button>
    )
}
