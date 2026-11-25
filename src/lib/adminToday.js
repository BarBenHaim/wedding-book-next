// What the super admin's "today" screen shows, from data the system already
// has. Pure: the route reads, this decides. A part that could not be read is
// passed as null and reported, never shown as zero.

import { stageLabel } from './peopleStages'

const TASKS_SHOWN = 4
const CUSTOMERS_SHOWN = 5
const WAITING_DRAFT = new Set(['pending', 'needs_owner'])
const round = value => Math.round(value * 100) / 100
const who = (name, phone) => name || `מספר שמסתיים ב-${String(phone || '').slice(-4)}`
// The list of people, opened on that person.
const personHref = key => `/admin/customers?key=${encodeURIComponent(key)}`
// The switches, the test message and the approvals of samples.
const BOARD = '/admin/customers/board'

function draftTask(draft) {
    const sent = draft.status === 'sent'
    return {
        kind: 'draft', id: draft.number,
        title: `בקשה של ${who(draft.customerName, draft.phone)}`,
        detail: sent ? `נשארו משימות: ${(draft.tasks || []).join(' · ')}`
            : draft.status === 'needs_owner' ? draft.summary || 'צריך לענות ידנית'
                : `טיוטה: ${draft.text}`,
        canApprove: draft.status === 'pending' && !!draft.text && draft.windowOpen === true,
        // Still unanswered: it can be dropped. Sent: only its tasks are open.
        waiting: !sent,
        href: '/admin/customers',
    }
}

function sampleTask(sample) {
    return {
        kind: 'sample', id: sample.id,
        title: 'דוגמת שלט לאישור',
        detail: sample.windowOpen ? `לליד ${who(sample.name, sample.phone)}` : 'עברו 24 שעות, צריך לשלוח ידנית',
        image: sample.previewUrl || null,
        canApprove: sample.windowOpen === true,
        href: BOARD,
    }
}

// `people` is the list of lib/people.js, so both screens say the same.
export function buildToday({ today, people, drafts = [], samples = [], claude, usageDays = [], bot, switches }) {
    const unread = [...new Set([
        ...(people === null ? ['לקוחות'] : people.unread || []),
        ...(drafts === null ? ['בקשות לקוחות'] : []),
        ...(samples === null ? ['דוגמאות שלט'] : []),
    ])]
    // A list built without the books or the leads counts nothing.
    const whole = Boolean(people) && !unread.some(name => name === 'ספרים' || name === 'לידים')
    const rows = people?.rows || []
    const requests = drafts || []
    const signs = samples || []

    const toDraw = signs.filter(sample => ['receiving', 'pending', 'failed'].includes(sample.status)).length
    // Requests and samples have lines of their own above.
    const waitingPeople = rows.filter(row => row.inToday && row.draft == null && row.sample == null)
    const tasks = [
        ...(claude?.alert ? [{ kind: 'claude', id: 'claude', title: 'Claude לא ענה', detail: claude.alert, href: BOARD }] : []),
        ...requests.filter(draft => WAITING_DRAFT.has(draft.status)).map(draftTask),
        ...signs.filter(sample => sample.status === 'ready').map(sampleTask),
        ...(toDraw ? [{ kind: 'draw', id: 'draw', title: `${toDraw} דוגמאות שלט מחכות לציור`, detail: 'במחשב: כתוב ל-Claude "יש דוגמאות?"', href: BOARD }] : []),
        ...requests.filter(draft => draft.status === 'sent').map(draftTask),
        ...waitingPeople.map(row => ({
            kind: 'person', id: row.key, title: row.name,
            detail: [row.next.label, row.overdue ? 'באיחור' : null].filter(Boolean).join(' · '),
            row, href: personHref(row.key),
        })),
    ]

    const active = rows.filter(row => !row.resting && row.stage !== 'done')
    // Events still ahead come first, nearest first; then the most recent past.
    const order = row => (row.toEvent == null ? 20_000 : row.toEvent >= 0 ? row.toEvent : 10_000 - row.toEvent)

    const month = String(today).slice(0, 7)
    const days = usageDays === null ? null : (usageDays || []).filter(day => String(day.date).startsWith(month))
    const total = field => round(days.reduce((sum, day) => sum + (Number(day[field]) || 0), 0))
    const spend = days === null ? null : (() => {
        const all = total('usd')
        const anthropic = total('anthropicUsd')
        const openai = total('openaiUsd')
        return { month: all, anthropic, openai, other: round(Math.max(0, all - anthropic - openai)) }
    })()

    return {
        date: today,
        counts: {
            today: whole ? people.counts.today : null,
            active: whole ? active.length : null,
            week: whole ? active.filter(row => row.toEvent != null && row.toEvent >= 0 && row.toEvent <= 7).length : null,
        },
        tasks: tasks.slice(0, TASKS_SHOWN),
        moreTasks: Math.max(0, tasks.length - TASKS_SHOWN),
        customers: [...active].sort((a, b) => order(a) - order(b)).slice(0, CUSTOMERS_SHOWN).map(row => ({
            id: row.key, title: row.name, event: row.what || 'אירוע', day: row.day, toEvent: row.toEvent,
            step: row.next?.label || stageLabel(row.stage), overdue: row.overdue === true, row, href: personHref(row.key),
        })),
        moreCustomers: Math.max(0, active.length - CUSTOMERS_SHOWN),
        bot: bot ? {
            ...bot,
            callsToday: days === null ? null : Number(days.find(day => day.date === today)?.calls) || 0,
            switches: switches || null,
        } : null,
        spend,
        unread,
    }
}
