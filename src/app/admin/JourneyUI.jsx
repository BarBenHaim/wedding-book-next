'use client'
// The customer journey in the admin: a badge per event, the strip of work above the table,
// and the controls for the two things only Bar can know (printed, delivered).
// All the rules live in src/lib/journeyStage.js; this file only draws them.

import { journeyOf, summarize, STAGE_LABEL, FUNNEL_START_MS } from '@/lib/journeyStage'
import v from './events.module.css'

const TONE = {
    red: { bg: '#fdecea', fg: '#b42318', bd: '#f5b5b0' },
    amber: { bg: '#fff4dc', fg: '#8a5a00', bd: '#f1d08a' },
    green: { bg: '#e8f5ec', fg: '#1f7a3e', bd: '#b7dcc3' },
    grey: { bg: '#f2f0eb', fg: '#8d8579', bd: '#e3ddd0' },
}

const ACTION_LABEL = { print: 'הוזמן להדפסה', ship: 'ספר נשלח ללקוח', deliver: 'ספר הגיע בהצלחה' }
const ACTION_FIELD = { print: 'printOrderedAt', ship: 'shippedAt', deliver: 'deliveredAt' }

/** The badge, the reasons Bar is needed, and the one action of the stage. */
export function JourneyCell({ j, waHref, onMark, w, compact = false }) {
    const t = TONE[j.tone] || TONE.grey
    const markable = j.action === 'print' || j.action === 'ship' || j.action === 'deliver'
    return (
        <div className='inline-flex flex-col items-center gap-1.5 max-w-[190px]' onClick={e => e.stopPropagation()}>
            <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap' style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
                <span className='w-1.5 h-1.5 rounded-full' style={{ background: t.fg }} />
                {j.label}
            </span>
            {j.attention.slice(0, compact ? 1 : 2).map(a => (
                <span key={a.key} className='text-[10.5px] font-semibold leading-tight text-center' style={{ color: '#b42318' }}>{a.label}</span>
            ))}
            {markable && onMark && (
                <button
                    onClick={() => onMark(w, ACTION_FIELD[j.action], true, ACTION_LABEL[j.action])}
                    className='text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors active:scale-95'
                    style={{ background: '#fff9ec', color: '#1d1648', borderColor: '#c9a460' }}
                >
                    סמן: {ACTION_LABEL[j.action]}
                </button>
            )}
            {(j.action === 'link' || j.action === 'balance') && waHref && j.attention.length > 0 && (
                <a href={waHref} target='_blank' rel='noopener noreferrer' className='text-[11px] font-bold px-2.5 py-1 rounded-lg border'
                    style={{ background: 'rgba(37,211,102,0.12)', color: '#1b8f4d', borderColor: 'rgba(37,211,102,0.45)' }}>
                    {j.action === 'balance' ? 'וואטסאפ: תזכורת יתרה' : 'וואטסאפ: לשלוח את הקישור'}
                </a>
            )}
        </div>
    )
}

/** The block at the top of the detail panel: stage, what it is waiting for, and the undo. */
export function JourneyPanelBlock({ j, w, waHref, onMark, children }) {
    const t = TONE[j.tone] || TONE.grey
    const when = v => (v ? new Date(v).toLocaleDateString('he-IL') : null)
    const rows = [
        ['מקדמה / הזמנה', when(w.createdAt)],
        ['הקישור נשלח לאורחים', when(w.linkSharedAt)],
        ['התחיל לשלם יתרה', when(w.balanceClickAt)],
        ['יתרה שולמה', when(w.balancePaidAt)],
        ['הוזמן להדפסה', when(w.printOrderedAt)],
        ['נשלח ללקוח', when(w.shippedAt)],
        ['הגיע בהצלחה', when(w.deliveredAt)],
        ['נסגר', w.closedAt ? `${when(w.closedAt)}${w.closedReason ? ` (${{ refunded: 'הוחזר', cancelled: 'בוטל', other: 'אחר' }[w.closedReason]})` : ''}` : null],
    ].filter(r => r[1])
    return (
        <div className='px-6 py-4 border-b border-[#f0e8d4] space-y-3'>
            <JourneyCell j={j} waHref={waHref} onMark={onMark} w={w} />
            {rows.length > 0 && (
                <dl className='text-xs text-[#7a6a52] space-y-1'>
                    {rows.map(([k, v]) => (
                        <div key={k} className='flex justify-between gap-3'><dt>{k}</dt><dd className='tabular-nums font-semibold text-[#3d2e1a]'>{v}</dd></div>
                    ))}
                </dl>
            )}
            <div className='flex flex-wrap gap-2'>
                {w.printOrderedAt && !w.shippedAt && !w.deliveredAt && (
                    <button onClick={() => onMark(w, 'printOrderedAt', false, 'ביטול סימון ההדפסה')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>בטל "הוזמן להדפסה"</button>
                )}
                {/* the book can also be marked as arrived straight from "in print", e.g. when it was handed over by hand */}
                {j.stage === 'in_print' && (
                    <button onClick={() => onMark(w, 'deliveredAt', true, 'ספר הגיע בהצלחה')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>סמן: ספר הגיע בהצלחה</button>
                )}
                {w.shippedAt && !w.deliveredAt && (
                    <button onClick={() => onMark(w, 'shippedAt', false, 'ביטול סימון המשלוח')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>בטל "נשלח ללקוח"</button>
                )}
                {w.deliveredAt && (
                    <button onClick={() => onMark(w, 'deliveredAt', false, 'ביטול סימון ההגעה')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>בטל "הגיע בהצלחה"</button>
                )}
                {!w.closedAt ? (
                    <button onClick={() => onMark(w, 'closedAt', true, 'סגירת האירוע (בוטל / הוחזר)')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>סגור: בוטל / הוחזר</button>
                ) : (
                    <button onClick={() => onMark(w, 'closedAt', false, 'פתיחה מחדש')} className='text-[11px] px-2.5 py-1 rounded-lg border border-[#ead9b3] text-[#7a6a52]'>פתח מחדש</button>
                )}
            </div>
            <p className='text-[10.5px] leading-relaxed' style={{ color: t.fg }}>{j.stage === 'legacy' ? 'אירוע מלפני המשפך: לא נכנס לתור העבודה. אפשר לסמן ידנית הוזמן / נשלח / הגיע.' : ''}</p>
            {children}
        </div>
    )
}

const CARDS = [
    { key: 'queue', title: 'צריך אותי היום', tone: 'red' },
    { key: 'before', title: 'לפני האירוע', tone: 'green' },
    { key: 'after', title: 'אחרי האירוע, יתרה פתוחה', tone: 'amber' },
    { key: 'print_now', title: 'להדפיס עכשיו', tone: 'red' },
    { key: 'in_print', title: 'בהדפסה / בדרך', tone: 'green' },
]

/** Which events a card stands for. Shared with the table's filter. */
export function stagePredicate(key, j) {
    if (key === 'queue') return j.attention.length > 0
    if (key === 'before') return j.stage === 'deposit_quiet' || j.stage === 'collecting'
    if (key === 'after') return j.stage === 'awaiting_review' || j.stage === 'balance_started'
    if (key === 'print_now') return j.stage === 'print_now'
    if (key === 'in_print') return j.stage === 'in_print' || j.stage === 'shipped'
    if (key === 'free') return j.stage === 'free' || j.stage === 'legacy'
    return true
}

/** Counts per step since the funnel went live, plain numbers. */
export function funnelOf(list, now) {
    const f = { paid: 0, writing: 0, passed: 0, balance: 0, printed: 0, shipped: 0, delivered: 0 }
    for (const w of list) {
        const created = Date.parse(w.createdAt || '') || 0
        if (!(created >= FUNNEL_START_MS) || w.createdVia !== 'order') continue
        const j = journeyOf(w, now)
        if (j.stage === 'closed') continue
        f.paid++
        if ((w.greetingsCount || 0) > 0) f.writing++
        if (j.days != null && j.days < 0) f.passed++
        if (['print_now', 'in_print', 'shipped', 'delivered'].includes(j.stage)) f.balance++
        if (['in_print', 'shipped', 'delivered'].includes(j.stage)) f.printed++
        if (['shipped', 'delivered'].includes(j.stage)) f.shipped++
        if (j.stage === 'delivered') f.delivered++
    }
    return f
}

export function JourneyStrip({ weddings, now, active, onPick }) {
    const js = weddings.map(w => journeyOf(w, now))
    const s = summarize(weddings, now)
    const count = key => js.filter(j => stagePredicate(key, j)).length
    const sub = {
        queue: 'ממתינים לפעולה שלי',
        before: `${s.counts.deposit_quiet} בלי ברכות`,
        after: s.owed ? `₪${s.owed.toLocaleString('he-IL')} פתוחים` : 'אין יתרות פתוחות',
        print_now: 'שולם, מחכה להזמנת הדפסה',
        in_print: 'עד שהספר הגיע ללקוח',
    }
    const f = funnelOf(weddings, now)
    const steps = [['שילמו', f.paid], ['כותבים ברכות', f.writing], ['האירוע עבר', f.passed], ['יתרה שולמה', f.balance], ['נשלח להדפסה', f.printed], ['נשלח ללקוח', f.shipped], ['הגיע', f.delivered]]
    const other = js.filter(j => j.stage === 'free' || j.stage === 'legacy').length
    return (
        <div dir='rtl'>
            <div className={v.road}>
                {CARDS.map(c => {
                    const n = count(c.key)
                    const on = active === c.key
                    return (
                        <button
                            key={c.key} type='button' className={v.stop} aria-pressed={on}
                            data-tone={c.tone} data-empty={!n && c.key !== 'in_print'}
                            onClick={() => onPick(on ? 'all' : c.key)}
                        >
                            <span>{c.title}</span>
                            <b>{n}</b>
                            <small>{sub[c.key]}</small>
                        </button>
                    )
                })}
            </div>
            <div className={v.funnel}>
                <span><b>המשפך מאז {new Date(FUNNEL_START_MS).toLocaleDateString('he-IL')}:</b></span>
                {steps.map(([label, n], i) => (
                    <span key={label}>{i > 0 && '‹ '}<b>{n}</b> {label}</span>
                ))}
                <button type='button' aria-pressed={active === 'free'} onClick={() => onPick(active === 'free' ? 'all' : 'free')}>
                    חינמיים וישנים {other}
                </button>
            </div>
        </div>
    )
}

export { journeyOf, STAGE_LABEL }
