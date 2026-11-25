// What the super admin's "today" screen shows, from data the system already
// has. Pure: the route reads, this decides. A part that could not be read is
// passed as null and reported, never shown as zero.

const EVENT = {
    wedding: 'חתונה', bar_mitzvah: 'בר מצווה', twins_bar_mitzvah: 'בר מצווה', bat_mitzvah: 'בת מצווה',
    birthday: 'יום הולדת', poker: 'ערב פוקר', travel: 'מסע',
}
const TASKS_SHOWN = 4
const CUSTOMERS_SHOWN = 5
const WAITING_DRAFT = new Set(['pending', 'needs_owner'])
const round = value => Math.round(value * 100) / 100
const who = (name, phone) => name || `מספר שמסתיים ב-${String(phone || '').slice(-4)}`
const bookHref = id => `/wedding/${encodeURIComponent(id)}/admin`

function draftTask(draft) {
    const sent = draft.status === 'sent'
    return {
        kind: 'draft', id: draft.number,
        title: `בקשה של ${who(draft.customerName, draft.phone)}`,
        detail: sent ? `נשארו משימות: ${(draft.tasks || []).join(' · ')}`
            : draft.status === 'needs_owner' ? draft.summary || 'צריך לענות ידנית'
                : `טיוטה: ${draft.text}`,
        canApprove: draft.status === 'pending' && !!draft.text && draft.windowOpen === true,
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
        href: '/admin/customers',
    }
}

export function buildToday({ today, rows = [], drafts = [], samples = [], claude, usageDays = [], bot, switches }) {
    const unread = [
        ...(rows === null ? ['לקוחות'] : []),
        ...(drafts === null ? ['בקשות לקוחות'] : []),
        ...(samples === null ? ['דוגמאות שלט'] : []),
    ]
    const books = rows || []
    const requests = drafts || []
    const signs = samples || []

    const withDraft = new Set(requests.map(draft => draft.weddingId).filter(Boolean))
    const toDraw = signs.filter(sample => ['receiving', 'pending', 'failed'].includes(sample.status)).length
    const todayBooks = books
        .filter(row => row.group === 'today' && !(row.next.key === 'request' && withDraft.has(row.id)))
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Math.abs(a.toEvent ?? 999) - Math.abs(b.toEvent ?? 999))
    const tasks = [
        ...(claude?.alert ? [{ kind: 'claude', id: 'claude', title: 'Claude לא ענה', detail: claude.alert, href: '/admin/customers' }] : []),
        ...requests.filter(draft => WAITING_DRAFT.has(draft.status)).map(draftTask),
        ...signs.filter(sample => sample.status === 'ready').map(sampleTask),
        ...(toDraw ? [{ kind: 'draw', id: 'draw', title: `${toDraw} דוגמאות שלט מחכות לציור`, detail: 'במחשב: כתוב ל-Claude "יש דוגמאות?"', href: '/admin/customers' }] : []),
        ...requests.filter(draft => draft.status === 'sent').map(draftTask),
        ...todayBooks.map(row => ({
            kind: 'book', id: row.id, title: row.title,
            detail: [row.next.label, row.overdue ? 'באיחור' : null].filter(Boolean).join(' · '),
            href: bookHref(row.id),
        })),
    ]

    const active = books.filter(row => !['done', 'triage'].includes(row.group))
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
            tasks: !tasks.length && unread.length ? null : tasks.length,
            active: rows === null ? null : active.length,
            week: rows === null ? null : active.filter(row => row.toEvent != null && row.toEvent >= 0 && row.toEvent <= 7).length,
        },
        tasks: tasks.slice(0, TASKS_SHOWN),
        moreTasks: Math.max(0, tasks.length - TASKS_SHOWN),
        oldEvents: books.filter(row => row.group === 'triage').length,
        customers: [...active].sort((a, b) => order(a) - order(b)).slice(0, CUSTOMERS_SHOWN).map(row => ({
            id: row.id, title: row.title, event: EVENT[row.eventType] || 'אירוע', day: row.day, toEvent: row.toEvent,
            step: row.next.label, overdue: row.overdue === true, href: bookHref(row.id),
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
