'use client'
// /admin/board — the super-admin WORK BOARD. One screen that answers
// "what needs my hands right now": five auto-derived NOW buckets
// (needs cover / needs design / this week / event passed / unpaid),
// combinable filters, one-line rows with everything at a glance and
// quick actions. ZERO new manual bookkeeping — every status is derived
// from data that already exists (design objects, cover art, dates,
// amountPaid, productionStatus).
import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Heebo } from 'next/font/google'

const heebo = Heebo({ subsets: ['latin'], weight: ['400', '600', '700', '900'] })

const TYPES = [
    { key: 'all', label: 'הכל' },
    { key: 'wedding', label: 'חתונה 💍' },
    { key: 'bar_mitzvah', label: 'בר מצווה 🎉' },
    { key: 'bat_mitzvah', label: 'בת מצווה 🌸' },
    { key: 'birthday', label: 'יום הולדת 🎂' },
]
const PROD_LABEL = { new: 'חדש', design: 'בעיצוב', approved: 'מאושר', printing: 'בהדפסה', shipped: 'נשלח', done: 'הושלם' }

function titleOf(w) {
    if (w.customTitle) return w.customTitle
    const a = (w.brideNameHe || w.brideName || '').trim()
    const b = (w.groomNameHe || w.groomName || '').trim()
    if (a || b) return [a, b].filter(Boolean).join(' & ')
    return (w.celebrantNameHe || w.celebrantName || '').trim() || w.id
}
function daysUntil(w) {
    if (!w.weddingDate) return null
    try {
        const d = new Date(String(w.weddingDate).slice(0, 10) + 'T12:00:00')
        if (Number.isNaN(d.getTime())) return null
        const t = new Date(); t.setHours(12, 0, 0, 0)
        return Math.round((d.getTime() - t.getTime()) / 86400000)
    } catch { return null }
}
function whenLabel(w) {
    const d = daysUntil(w)
    if (d === null) return 'ללא תאריך'
    if (d === 0) return 'היום 🎉'
    if (d === 1) return 'מחר'
    if (d < 0) return `לפני ${Math.abs(d)} ימים`
    return `בעוד ${d} ימים`
}
const isPaid = w => Number(w.amountPaid) > 0

export default function AdminBoard() {
    const [rows, setRows] = useState(null)
    const [err, setErr] = useState('')
    const [bucket, setBucket] = useState('all') // all|cover|design|week|passed|unpaid
    const [typeF, setTypeF] = useState('all')
    const [paidF, setPaidF] = useState('all') // all|paid|unpaid
    const [timeF, setTimeF] = useState('all') // all|future|past
    const [q, setQ] = useState('')
    const [savingPaid, setSavingPaid] = useState('')

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async u => {
            if (!u?.email || !isSuperAdmin(u.email)) return
            try {
                const token = await u.getIdToken()
                const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${token}` } })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                setRows(await res.json())
            } catch (e) {
                setErr('טעינת האירועים נכשלה — רעננו את העמוד')
            }
        })
        return unsub
    }, [])

    const buckets = useMemo(() => {
        const b = { cover: [], design: [], week: [], passed: [], unpaid: [] }
        for (const w of rows || []) {
            const d = daysUntil(w)
            if (!w.hasCover) b.cover.push(w)
            if (!w.hasDesign) b.design.push(w)
            if (d !== null && d >= 0 && d <= 7) b.week.push(w)
            if (d !== null && d < 0 && !['printing', 'shipped', 'done'].includes(w.productionStatus)) b.passed.push(w)
            if (!isPaid(w)) b.unpaid.push(w)
        }
        return b
    }, [rows])

    const filtered = useMemo(() => {
        let list = [...(rows || [])]
        if (bucket === 'cover') list = list.filter(w => !w.hasCover)
        if (bucket === 'design') list = list.filter(w => !w.hasDesign)
        if (bucket === 'week') list = list.filter(w => { const d = daysUntil(w); return d !== null && d >= 0 && d <= 7 })
        if (bucket === 'passed') list = list.filter(w => { const d = daysUntil(w); return d !== null && d < 0 && !['printing', 'shipped', 'done'].includes(w.productionStatus) })
        if (bucket === 'unpaid') list = list.filter(w => !isPaid(w))
        if (typeF !== 'all') list = list.filter(w => (w.eventType || 'wedding') === typeF)
        if (paidF === 'paid') list = list.filter(isPaid)
        if (paidF === 'unpaid') list = list.filter(w => !isPaid(w))
        if (timeF === 'future') list = list.filter(w => { const d = daysUntil(w); return d !== null && d >= 0 })
        if (timeF === 'past') list = list.filter(w => { const d = daysUntil(w); return d !== null && d < 0 })
        const s = q.trim().toLowerCase()
        if (s) list = list.filter(w =>
            titleOf(w).toLowerCase().includes(s) ||
            String(w.ownerEmail || '').toLowerCase().includes(s) ||
            String(w.ownerPhone || '').includes(s) ||
            w.id.toLowerCase().includes(s))
        // Soonest upcoming first, then recent past, then undated.
        return list.sort((a, b) => {
            const da = daysUntil(a), db = daysUntil(b)
            const fa = da !== null && da >= 0, fb = db !== null && db >= 0
            if (fa && fb) return da - db
            if (fa) return -1
            if (fb) return 1
            if (da !== null && db !== null) return db - da
            return da !== null ? -1 : 1
        })
    }, [rows, bucket, typeF, paidF, timeF, q])

    const markPaid = async w => {
        const raw = prompt(`כמה שולם עבור ${titleOf(w)}? (₪)`, '290')
        if (raw === null) return
        const amount = Number(raw)
        if (!Number.isFinite(amount) || amount < 0) { alert('סכום לא תקין'); return }
        setSavingPaid(w.id)
        try {
            const token = await auth.currentUser?.getIdToken()
            const res = await fetch('/api/admin/weddings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId: w.id, patch: { amountPaid: amount } }),
            })
            if (!res.ok) throw new Error()
            setRows(prev => prev.map(x => (x.id === w.id ? { ...x, amountPaid: amount } : x)))
        } catch { alert('לא נשמר — נסו שוב') } finally { setSavingPaid('') }
    }

    const BUCKETS = [
        { key: 'cover', label: 'צריך כריכה', n: buckets.cover.length, tone: '#b0553f' },
        { key: 'design', label: 'צריך עיצוב', n: buckets.design.length, tone: '#aa8840' },
        { key: 'week', label: 'השבוע', n: buckets.week.length, tone: '#0e9f8e' },
        { key: 'passed', label: 'עבר האירוע — לסגור', n: buckets.passed.length, tone: '#7c3aed' },
        { key: 'unpaid', label: 'לא שולם', n: buckets.unpaid.length, tone: '#64748b' },
    ]

    const chip = (on, tone = '#aa8840') => ({
        padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        border: `1.5px solid ${on ? tone : '#ead9b3'}`, background: on ? tone : '#fff', color: on ? '#fff' : '#7a6a52',
    })

    return (
        <AdminPageWrapper>
            <div dir='rtl' className={heebo.className} style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #fdf9f0, #f4ecdb)', padding: '24px 16px 60px' }}>
                <div style={{ maxWidth: 1080, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#3b2a14' }}>לוח עבודה</h1>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#8a6f45' }}>מה צריך את הידיים שלך עכשיו — הכל נגזר אוטומטית, אפס תחזוקה</p>
                        </div>
                        <a href='/admin' style={{ fontSize: 13, fontWeight: 700, color: '#aa8840', textDecoration: 'none' }}>← לניהול המלא</a>
                    </div>

                    {/* NOW buckets */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 18 }}>
                        {BUCKETS.map(b => (
                            <button key={b.key} onClick={() => setBucket(bucket === b.key ? 'all' : b.key)} style={{
                                textAlign: 'right', padding: '14px 16px', borderRadius: 18, cursor: 'pointer',
                                border: `2px solid ${bucket === b.key ? b.tone : 'rgba(201,164,78,0.3)'}`,
                                background: bucket === b.key ? `${b.tone}14` : 'rgba(255,253,246,0.9)',
                                boxShadow: '0 4px 14px -8px rgba(60,44,20,0.25)',
                            }}>
                                <div style={{ fontSize: 26, fontWeight: 900, color: b.tone, lineHeight: 1 }}>{b.n}</div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5c4a2f', marginTop: 4 }}>{b.label}</div>
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 16 }}>
                        {TYPES.map(t => (
                            <button key={t.key} onClick={() => setTypeF(t.key)} style={chip(typeF === t.key)}>{t.label}</button>
                        ))}
                        <span style={{ width: 1, height: 20, background: '#ead9b3' }} />
                        <button onClick={() => setPaidF(paidF === 'paid' ? 'all' : 'paid')} style={chip(paidF === 'paid', '#0e9f8e')}>שילמו ✓</button>
                        <button onClick={() => setPaidF(paidF === 'unpaid' ? 'all' : 'unpaid')} style={chip(paidF === 'unpaid', '#64748b')}>לא שילמו</button>
                        <span style={{ width: 1, height: 20, background: '#ead9b3' }} />
                        <button onClick={() => setTimeF(timeF === 'future' ? 'all' : 'future')} style={chip(timeF === 'future', '#0e9f8e')}>עתידיים</button>
                        <button onClick={() => setTimeF(timeF === 'past' ? 'all' : 'past')} style={chip(timeF === 'past', '#7c3aed')}>עברו</button>
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder='חיפוש: שם / מייל / טלפון / מזהה'
                            style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 999, border: '1.5px solid #ead9b3', fontSize: 13.5, outline: 'none', background: '#fff' }}
                        />
                    </div>

                    {/* Rows */}
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {err && <div style={{ color: '#b0553f', fontWeight: 700, padding: 20, textAlign: 'center' }}>{err}</div>}
                        {!rows && !err && <div style={{ color: '#8a6f45', padding: 30, textAlign: 'center' }}>טוען את כל האירועים…</div>}
                        {rows && filtered.length === 0 && <div style={{ color: '#8a6f45', padding: 30, textAlign: 'center' }}>אין אירועים בסינון הזה 🎉</div>}
                        {filtered.map(w => {
                            const d = daysUntil(w)
                            const past = d !== null && d < 0
                            return (
                                <div key={w.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                    background: 'rgba(255,253,246,0.95)', border: '1px solid rgba(201,164,78,0.3)',
                                    borderRadius: 16, padding: '10px 14px', boxShadow: '0 3px 10px -6px rgba(60,44,20,0.2)',
                                }}>
                                    <img
                                        src={`/api/og/${w.id}`}
                                        alt=''
                                        width={44}
                                        height={44}
                                        style={{ borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(201,164,78,0.35)', flexShrink: 0 }}
                                        loading='lazy'
                                    />
                                    <div style={{ minWidth: 160, flex: 1 }}>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: '#3b2a14' }}>{titleOf(w)}</div>
                                        <div style={{ fontSize: 11.5, color: '#8a6f45' }}>
                                            {(TYPES.find(t => t.key === (w.eventType || 'wedding'))?.label || '')} · {whenLabel(w)}
                                            {w.greetingsCount ? ` · ${w.greetingsCount} ברכות` : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Flag ok={w.hasDesign} okText='עוצב' badText='צריך עיצוב' />
                                        <Flag ok={w.hasCover} okText='כריכה ✓' badText='צריך כריכה' />
                                        {isPaid(w)
                                            ? <span style={tag('#0e9f8e')}>₪{Number(w.amountPaid).toLocaleString()} ✓</span>
                                            : <button onClick={() => markPaid(w)} disabled={savingPaid === w.id} style={{ ...tag('#64748b'), cursor: 'pointer', border: '1px dashed #64748b', background: '#fff', color: '#64748b' }}>
                                                {savingPaid === w.id ? 'שומר…' : 'סמן שולם'}
                                            </button>}
                                        {past && <span style={tag('#7c3aed')}>{PROD_LABEL[w.productionStatus] || w.productionStatus}</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <A href={`/wedding/${w.id}/viewer`}>עיצוב</A>
                                        <A href={`/wedding/${w.id}/admin`}>ברכות</A>
                                        <A href={`/wedding/${w.id}/portal`}>פורטל</A>
                                        <A href={`/admin/wedding/${w.id}/picabook-export`}>ייצוא</A>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    {rows && <p style={{ textAlign: 'center', fontSize: 12, color: '#a89378', marginTop: 14 }}>{filtered.length} מתוך {rows.length} אירועים</p>}
                </div>
            </div>
        </AdminPageWrapper>
    )
}

const tag = tone => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
    background: `${tone}18`, color: tone, border: `1px solid ${tone}55`,
})

function Flag({ ok, okText, badText }) {
    return ok
        ? <span style={tag('#0e9f8e')}>{okText}</span>
        : <span style={tag('#b0553f')}>{badText}</span>
}

function A({ href, children }) {
    return (
        <a href={href} style={{
            padding: '6px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
            color: '#7a6a52', background: '#fff', border: '1px solid #ead9b3',
        }}>{children}</a>
    )
}
