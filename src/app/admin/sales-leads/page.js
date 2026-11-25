'use client'

// /admin/sales-leads — the WhatsApp sales agent's CRM.
//
// This screen is built around one question: who do I talk to next?
//
// So it opens on the triage strip, not on the table. Every lead is
// scored server-side into at most one bucket (needs you / ready to pay /
// promised to come back / due a nudge), and the strip is both the answer
// and the filter — tapping a bucket narrows the list to it. A founder
// checking this on a phone between meetings should be able to act
// without scrolling.
//
// The second thing it does is show the transcript. The agent talks to
// customers unsupervised; the only way to trust it, or to improve the
// prompt, is to read what it actually said. Selecting a lead opens the
// whole conversation beside the table, with the bot's own reasoning
// (stage, notes, handoff reason) above it.
//
// `sales_leads` is server-only in firestore.rules, so everything here
// goes through /api/sales-agent/leads with a super-admin ID token.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import {
    Lock, Loader2, AlertTriangle, RefreshCw, Search, MessageCircle, ExternalLink,
    ChevronRight, Pause, Play, BellOff, Check, XCircle, Users, Calendar,
    Clock, TrendingUp, Wallet, Sparkles, FlaskConical, Trash2,
    Radio, BrainCircuit, Send, ListChecks,
} from 'lucide-react'
import {
    ATTENTION_BUCKETS, STAGE_META, stageMeta, eventTypeLabel, PACKAGE_LABELS, relativeHe,
} from '@/lib/salesAgent/leadsView'
import { formatUsd } from '@/lib/salesAgent/pricing'
import SalesMediaPanel from '@/components/SalesMediaPanel/SalesMediaPanel'
import { formatHebrewDate } from '@/lib/salesAgent/prompt'
import { salesHealthStageView } from '@/lib/salesAgent/leadsCore'
import { Hero, Page, Panel, Plaque, Sheet } from '../ui/kit'
import k from '../ui/kit.module.css'
import Window from '../ui/Window'
import l from './leads.module.css'

// ─── the admin's colours, for the parts drawn here ────────────────────
const CARD = { background: 'linear-gradient(180deg, rgba(255,252,244,.75), rgba(255,246,230,.38))', border: '1px solid rgba(164,128,84,.42)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.6), 0 1px 3px rgba(120,82,38,.16)' }
const NAVY = 'linear-gradient(180deg, #2c2473 0%, #171049 100%)'

const HEALTH_TONES = {
    green: { shell: 'border-[#b8ddce] bg-[#f2fbf7]', dot: 'bg-[#147a52]', text: 'text-[#126143]' },
    amber: { shell: 'border-[#ead09b] bg-[#fff9ec]', dot: 'bg-[#9a5b00]', text: 'text-[#7b4800]' },
    red: { shell: 'border-[#efc0bb] bg-[#fff5f3]', dot: 'bg-[#b42318]', text: 'text-[#8e1c13]' },
    unknown: { shell: 'border-slate-200 bg-slate-50', dot: 'bg-slate-500', text: 'text-slate-600' },
}

const HEALTH_ICONS = { inbound: Radio, anthropic: BrainCircuit, whatsapp: Send, followups: ListChecks }

// Tone → the three class strings a badge needs. Kept as a lookup rather
// than interpolated because Tailwind cannot see dynamic class names.
const TONES = {
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    green: 'bg-green-50 border-green-300 text-green-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-500',
    red: 'bg-red-50 border-red-200 text-red-700',
}

function Badge({ tone = 'slate', children, className = '' }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-bold whitespace-nowrap ${TONES[tone] || TONES.slate} ${className}`}>
            {children}
        </span>
    )
}

function SignalRail({ health, nowMs }) {
    // The AI stage reads a counter that stopped being written in August, so it
    // would report a fault that is not there. The Claude check is on the bot window.
    const stages = salesHealthStageView(health).filter(stage => stage.key !== 'anthropic')
    return (
        <section aria-labelledby='sales-signal-title' className='rounded-2xl p-3 sm:p-4 overflow-hidden' style={CARD}>
            <div className='flex items-start justify-between gap-3 mb-3'>
                <div className='min-w-0'>
                    <p className='text-[10px] font-bold tracking-[0.18em] text-[#b8893d]'>אות חי מקצה לקצה</p>
                    <h2 id='sales-signal-title' className='text-[15px] font-bold text-[#1a1410] mt-0.5'>חדר אותות המכירה</h2>
                </div>
                <span className='shrink-0 text-[10.5px] text-[#7a6a52]' dir='ltr'>
                    {health?.generatedAtMs ? fmtTime(health.generatedAtMs) : '—'}
                </span>
            </div>
            <ol className='grid grid-cols-1 sm:grid-cols-3 gap-2' aria-label='קליטה, WhatsApp ופולואפים'>
                {stages.map((stage, index) => {
                    const tone = HEALTH_TONES[stage.status] || HEALTH_TONES.unknown
                    const Icon = HEALTH_ICONS[stage.key] || Radio
                    return (
                        <li key={stage.key} className={`relative min-w-0 rounded-xl border px-3 py-3 ${tone.shell}`}>
                            {index < stages.length - 1 && (
                                <span aria-hidden='true' className='hidden sm:block absolute top-1/2 -left-[9px] w-2 h-px bg-[#d7c7a4]' />
                            )}
                            <div className='flex items-center justify-between gap-2 min-w-0'>
                                <div className='flex items-center gap-2 min-w-0'>
                                    <span className='w-8 h-8 shrink-0 rounded-full bg-white/80 border border-current/10 flex items-center justify-center'>
                                        <Icon size={15} aria-hidden='true' />
                                    </span>
                                    <span className='font-bold text-[12px] text-[#2e2419] truncate'>{stage.label}</span>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold ${tone.text}`}>
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden='true' />
                                    {stage.statusLabel}
                                </span>
                            </div>
                            <p className='mt-2 text-[11px] leading-snug text-[#5e513f] break-words'>{stage.metric}</p>
                            <p className='mt-1 text-[10px] text-[#8c7b65] min-h-[15px]'>
                                {stage.evidenceAtMs ? `אות אחרון ${relativeHe(stage.evidenceAtMs, nowMs)}` : 'אין עדיין זמן עדות'}
                            </p>
                            {stage.action && <p className={`mt-2 text-[10.5px] font-semibold leading-snug ${tone.text}`}>{stage.action}</p>}
                        </li>
                    )
                })}
            </ol>
            <p className='mt-2.5 text-[10px] text-[#7a6a52] leading-relaxed'>
                התקבלה אצל הספק אינה מסירה: WhatsApp ירוק רק אחרי עדות נמסר/נקרא, ללא כשל או ניסיון תקוע.
            </p>
        </section>
    )
}

const fmtTime = ms => (ms ? new Date(ms).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

// ─── data ─────────────────────────────────────────────────────────────
async function authedFetch(path, init = {}) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch(path, {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`)
    return data
}

// ─── the screen ───────────────────────────────────────────────────────
function SalesLeadsContent() {
    const [state, setState] = useState('loading')
    const [error, setError] = useState('')
    const [data, setData] = useState(null)
    const [bucket, setBucket] = useState(null)
    const [stage, setStage] = useState(null)
    const [q, setQ] = useState('')
    const [selected, setSelected] = useState(null) // phone
    const [detail, setDetail] = useState(null)
    const [detailState, setDetailState] = useState('idle')
    const [busy, setBusy] = useState('')
    const [refreshing, setRefreshing] = useState(false)
    const pollRef = useRef(null)

    const load = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setRefreshing(true)
        try {
            const d = await authedFetch('/api/sales-agent/leads')
            setData(d)
            setState('ready')
            setError('')
        } catch (err) {
            setError(err.message || 'שגיאה בטעינת הלידים')
            setState('error')
        } finally {
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        load()
        // A quiet refresh every 60s. The whole point of the top strip is
        // that it is true right now — a handoff that landed while the tab
        // sat open is exactly the one worth catching.
        pollRef.current = setInterval(() => load({ quiet: true }), 60000)
        return () => clearInterval(pollRef.current)
    }, [load])

    // Fetch the transcript only when a lead is opened; the list response
    // deliberately does not carry it.
    useEffect(() => {
        if (!selected) { setDetail(null); return }
        let alive = true
        setDetailState('loading')
        authedFetch(`/api/sales-agent/leads?phone=${encodeURIComponent(selected)}`)
            .then(d => { if (alive) { setDetail(d.lead); setDetailState('ready') } })
            .catch(() => { if (alive) setDetailState('error') })
        return () => { alive = false }
    }, [selected])

    const items = data?.items || []

    const visible = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return items.filter(l => {
            if (bucket && l.attention !== bucket) return false
            if (stage && l.stage !== stage) return false
            if (!needle) return true
            return [l.phone, l.name, l.profileName, l.celebrantName, l.notes]
                .filter(Boolean).join(' ').toLowerCase().includes(needle)
        })
    }, [items, bucket, stage, q])

    const act = useCallback(async (phone, kind, payload) => {
        setBusy(`${phone}:${kind}`)
        try {
            if (kind === 'pause' || kind === 'resume') {
                await authedFetch('/api/sales-agent/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, action: kind, reason: 'מהטבלה' }),
                })
            } else {
                await authedFetch('/api/sales-agent/leads', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, ...payload }),
                })
            }
            await load({ quiet: true })
            if (selected === phone) {
                const d = await authedFetch(`/api/sales-agent/leads?phone=${encodeURIComponent(phone)}`)
                setDetail(d.lead)
            }
        } catch (err) {
            alert(`הפעולה נכשלה: ${err.message}`)
        } finally {
            setBusy('')
        }
    }, [load, selected])

    // The synthetic 9725000009xx rows created while building the agent.
    // They inflate the funnel and pollute the A/B arms, so the button
    // only appears while any still exist.
    const testLeadCount = useMemo(() => items.filter(l => /^9725000009\d{2}$/.test(l.phone || '')).length, [items])

    const clearTestLeads = useCallback(async () => {
        if (!confirm(`למחוק ${testLeadCount} לידי בדיקה? אין ביטול.`)) return
        setBusy('sweep')
        try {
            const r = await authedFetch('/api/sales-agent/leads', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testOnly: true }),
            })
            await load({ quiet: true })
            alert(`נמחקו ${r.deleted} לידי בדיקה.`)
        } catch (err) {
            alert(`המחיקה נכשלה: ${err.message}`)
        } finally {
            setBusy('')
        }
    }, [load, testLeadCount])

    if (state === 'loading') {
        return <Page><Sheet><Hero title='לידים' under={<span><Loader2 size={15} className='inline animate-spin motion-reduce:animate-none ml-2' />טוען לידים…</span>} /></Sheet></Page>
    }
    if (state === 'error') {
        return (
            <Page><Sheet>
                <Hero title='לידים' under={<button type='button' onClick={() => load()} className={k.glass}><RefreshCw size={15} />נסה שוב</button>} />
                <p role='alert' className={k.error}><AlertTriangle size={16} className='inline ml-2' />{error}</p>
            </Sheet></Page>
        )
    }

    const s = data?.summary
    const w7 = data?.window7

    return (
        <Page>
            <Sheet>
                <Hero
                    title='לידים'
                    under={<>
                        <span>{s?.total || 0} לידים, {s?.openLeads || 0} פתוחים, מתעדכן כל דקה</span>
                        <button type='button' onClick={() => load()} disabled={refreshing} className={k.glass}>
                            <RefreshCw size={15} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />רענן
                        </button>
                        {testLeadCount > 0 && (
                            <button type='button' onClick={clearTestLeads} disabled={busy === 'sweep'} className={k.glass}>
                                <Trash2 size={15} />מחק {testLeadCount} לידי בדיקה
                            </button>
                        )}
                    </>}
                    figures={ATTENTION_BUCKETS.map(b => (
                        <Plaque
                            key={b.key} value={s?.buckets?.[b.key] || 0} label={b.label}
                            pressed={bucket === b.key}
                            onClick={() => setBucket(bucket === b.key ? null : b.key)}
                        />
                    ))}
                />

                <Panel
                    title={bucket ? ATTENTION_BUCKETS.find(b => b.key === bucket)?.label : 'כל הלידים'}
                    Icon={MessageCircle}
                    aside={(
                        <div className={k.search}>
                            <Search size={17} aria-hidden='true' />
                            <input type='search' value={q} onChange={e => setQ(e.target.value)} placeholder='חיפוש שם, טלפון או הערה' aria-label='חיפוש ליד' />
                        </div>
                    )}
                >
                    {bucket && <p className={l.hint}>{ATTENTION_BUCKETS.find(b => b.key === bucket)?.hint}</p>}
                    <div className={`${k.chips} ${l.filters}`} role='group' aria-label='סינון לפי שלב'>
                        <FilterChip active={!stage} onClick={() => setStage(null)}>הכל</FilterChip>
                        {Object.entries(STAGE_META)
                            .sort((a, b) => a[1].order - b[1].order)
                            .filter(([key]) => (s?.byStage?.[key] || 0) > 0 || stage === key)
                            .map(([key, m]) => (
                                <FilterChip key={key} active={stage === key} onClick={() => setStage(stage === key ? null : key)}>
                                    {m.label}<i>{s?.byStage?.[key] || 0}</i>
                                </FilterChip>
                            ))}
                        {(bucket || stage || q) && (
                            <button type='button' onClick={() => { setBucket(null); setStage(null); setQ('') }}>נקה סינון ✕</button>
                        )}
                    </div>

                    {visible.length === 0 ? (
                        <p className={k.unread}>אין לידים שמתאימים לסינון. אפשר לנקות אותו או לחכות להודעה הבאה.</p>
                    ) : (
                        <div className={k.tableBox}>
                            <div className={`hidden md:grid grid-cols-[1.6fr_1fr_0.9fr_1fr_0.8fr] gap-3 ${l.head}`}>
                                <span>ליד</span><span>אירוע</span><span>שלב</span><span>מעקב</span><span>פעולות</span>
                            </div>
                            <ul className={l.rows}>
                                {visible.map(lead => (
                                    <LeadRow key={lead.phone} lead={lead} active={selected === lead.phone}
                                        onOpen={() => setSelected(selected === lead.phone ? null : lead.phone)}
                                        onAct={act} busy={busy} />
                                ))}
                            </ul>
                        </div>
                    )}
                </Panel>

                <Panel title='ביצועים' Icon={TrendingUp}>
                    <div className={l.stack}>
                        <div className='grid grid-cols-2 sm:grid-cols-4 gap-2.5'>
                            <Stat icon={Users} label='לידים ב-7 ימים' value={w7?.inWindow ?? 0} />
                            <Stat icon={Sparkles} label='הצעות נשלחו' value={(w7?.byStage?.offer_sent || 0) + (w7?.byStage?.ready_to_pay || 0)} />
                            <Stat icon={Check} label='תשלומים מאומתים (7 ימים)' value={w7?.won ?? 0} />
                            <Stat icon={TrendingUp} label='המרה מאומתת' value={w7?.closeRate == null ? '—' : `${w7.closeRate}%`} hint='תשלומים מאומתים מתוך תשלומים והפסדים שהוכרעו' />
                        </div>
                        <SignalRail health={data?.health} nowMs={data?.now || 0} />
                        <Spend data={data?.spend} />
                        <Experiments data={data?.experiments} gaps={data?.gaps} />
                    </div>
                </Panel>

                <Panel title='קבצים שהבוט שולח' Icon={Send}>
                    <SalesMediaPanel />
                </Panel>
            </Sheet>

            {selected && (
                <LeadDetail phone={selected} lead={detail} state={detailState}
                    onClose={() => setSelected(null)} onAct={act} busy={busy} />
            )}
        </Page>
    )
}

// ─── what the bot is learning ─────────────────────────────────────────
//
// Two panels with very different half-lives. The A/B table is the slow
// one — at a handful of leads a day it takes months to say anything, so
// it refuses to name a winner until the gap beats the noise, and says so
// plainly rather than showing a leaderboard that is really a coin toss.
// The gaps list is the fast one: "this question defeated the bot four
// times" is worth acting on the same week.
// ─── what it costs ────────────────────────────────────────────────────
//
// Counted by us, not read from a provider dashboard. Two things about
// that are stated on screen rather than left for someone to discover:
// it covers only what this app spends, from the day the counting was
// added, and the rates it multiplies by are hardcoded. A cost panel that
// hides either of those is worse than no cost panel, because a number
// with a currency symbol on it gets believed.
function Spend({ data }) {
    const card = useRef(null)
    const loaded = !!data
    useEffect(() => {
        if (loaded && window.location.hash === '#spend') card.current?.scrollIntoView()
    }, [loaded])
    if (!data) return null

    const cells = [
        { label: 'היום', value: data.today, hint: 'מחצות שעון ישראל' },
        { label: '7 ימים', value: data.week, hint: 'כולל היום' },
        { label: '30 ימים', value: data.month, hint: 'כולל היום' },
        { label: 'סה״כ', value: data.total, hint: 'מאז שהמעקב נוסף' },
    ]
    const peak = Math.max(...(data.byDay || []).map(d => d.usd), 0)

    return (
        <div ref={card} id='spend' className='rounded-2xl px-4 py-3.5 scroll-mt-24' style={CARD}>
            <div className='flex items-center justify-between gap-3 mb-3'>
                <div className='flex items-center gap-1.5'>
                    <Wallet size={13} style={{ color: '#c9a44e' }} />
                    <span className='text-[12.5px] font-bold text-[#3d2e1a]'>עלות ה-API</span>
                </div>
                <span className='text-[10.5px] text-[#a89378]'>
                    {data.totalCalls ? `${data.totalCalls.toLocaleString('he-IL')} קריאות` : 'עוד לא נמדדו קריאות'}
                    {data.totalImages ? ` · ${data.totalImages} תמונות` : ''}
                </span>
            </div>

            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3'>
                {cells.map(c => (
                    <div key={c.label} className='rounded-xl px-3 py-2.5 bg-[#fbf7ef] border border-[#f0e3c8]' title={c.hint}>
                        <div className='text-[10.5px] text-[#a89378] font-semibold mb-0.5'>{c.label}</div>
                        <div className='text-[17px] font-black text-[#1a1410] leading-none' dir='ltr'>{formatUsd(c.value)}</div>
                    </div>
                ))}
            </div>

            {peak > 0 && (
                <div className='flex items-end gap-[3px] h-9 mb-3' dir='ltr' title='14 הימים האחרונים'>
                    {data.byDay.map(d => (
                        <div key={d.date} className='flex-1 rounded-sm' title={`${d.date} · ${formatUsd(d.usd)}`}
                            style={{
                                height: `${Math.max(3, (d.usd / peak) * 100)}%`,
                                background: d.usd > 0 ? NAVY : '#e4d8c4',
                            }} />
                    ))}
                </div>
            )}

            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#7a6a52]'>
                {/* By provider. Cost per lead is not shown: the total also holds
                    calls that have nothing to do with leads. */}
                <span>Claude: <b dir='ltr'>{formatUsd(data.anthropicTotal)}</b></span>
                <span>OpenAI: <b dir='ltr'>{formatUsd(data.openaiTotal)}</b></span>
            </div>

            <p className='text-[10px] text-[#b3a68d] mt-2 leading-relaxed'>
                נמדד אצלנו לפי הטוקנים בכל קריאה, לא נשלף מהחשבון. זה מה שהאפליקציה הזאת הוציאה מאז שהמעקב נוסף, לא החשבונית —
                כל שימוש אחר באותו מפתח לא נספר כאן. המחירונים מקובעים בקוד ונבדקו ב-{data.ratesCheckedOn}.
            </p>
        </div>
    )
}

function Experiments({ data, gaps }) {
    const [open, setOpen] = useState(false)
    if (!data) return null
    const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`)
    const shekels = value => `₪${(Number(value) || 0).toLocaleString('he-IL')}`
    const unverifiedTotal = data.rows.reduce((sum, row) => sum + (Number(row.unverifiedClosedWon) || 0), 0)

    return (
        <div className='rounded-2xl overflow-hidden' style={CARD}>
            <button onClick={() => setOpen(!open)} className='w-full min-h-11 flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-[#fdfaf3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b8893d]'>
                <div className='flex items-center gap-2'>
                    <FlaskConical size={14} style={{ color: '#c9a44e' }} />
                    <span className='text-[13px] font-bold text-[#1a1410]'>מה הבוט לומד</span>
                    {data.verdict === 'winner' && <Badge tone='emerald'>יש מנצח</Badge>}
                    {data.verdict === 'too-close' && <Badge tone='amber'>עדיין צמוד</Badge>}
                    {data.verdict === 'collecting' && <Badge tone='slate'>אוסף נתונים</Badge>}
                </div>
                <ChevronRight size={14} className={`text-[#a89378] transition-transform motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-180'}`} />
            </button>

            {open && (
                <div className='px-4 pb-4 border-t border-[#f0e8d4] pt-3'>
                    <p className='text-[11.5px] text-[#7a6a52] leading-relaxed mb-3'>
                        כל ליד חדש מקבל אחת משתי פתיחות פעילות, ונשאר איתה לכל השיחה. ההשוואה נקבעת רק לפי
                        תשלום שאומת ב-WooCommerce; תגובה, הצעה וכוונת תשלום הן תחנות אבחון בדרך.{' '}
                        {data.verdict === 'collecting' && data.needed > 0 && (
                            <span className='text-[#b8893d] font-semibold'>
                                צריך עוד כ-{data.needed} לידים לפני שיש פה משהו לקרוא.
                            </span>
                        )}
                        {data.verdict === 'too-close' && (
                            <span className='text-[#b8893d] font-semibold'>
                                ההפרש בתשלומים המאומתים עדיין קטן מהרעש. אל תחליף פתיחה על סמך זה.
                            </span>
                        )}
                    </p>

                    {unverifiedTotal > 0 && (
                        <div className='mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800'>
                            <AlertTriangle size={13} aria-hidden='true' />
                            <span className='font-semibold'>סגירות ידניות שממתינות לאימות תשלום</span>
                            <Badge tone='amber'>{unverifiedTotal}</Badge>
                        </div>
                    )}

                    <div className='space-y-2'>
                        {data.rows.map(r => (
                            <article key={r.id} className='rounded-xl border border-[#eee3cc] bg-[#fffdfa] p-3'>
                                <div className='mb-2.5 flex flex-wrap items-start justify-between gap-2'>
                                    <div className='min-w-0'>
                                        <div className='flex flex-wrap items-center gap-1.5'>
                                            <span className='font-bold text-[12px] text-[#3d2e1a]'>{r.label}</span>
                                            {data.winner === r.id && <Badge tone='emerald'>מוביל בתשלום</Badge>}
                                            {!r.enough && <Badge tone='gray'>מדגם קטן</Badge>}
                                        </div>
                                        <p className='mt-0.5 text-[10px] leading-snug text-[#a89378]'>{r.hypothesis}</p>
                                    </div>
                                    <span className='text-[10.5px] font-bold text-[#147a52]'>המרה {pct(r.winRate)}</span>
                                </div>
                                <div className='grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6'>
                                    {[
                                        ['לידים ששויכו', r.leads],
                                        ['תגובה שנייה', `${r.replied} · ${pct(r.replyRate)}`],
                                        ['הגיעו להצעה', `${r.reachedOffer} · ${pct(r.offerRate)}`],
                                        ['כוונת תשלום', r.paymentIntent],
                                        ['תשלומים מאומתים', r.verifiedWins],
                                        ['הכנסה מאומתת', shekels(r.verifiedRevenue)],
                                    ].map(([label, value]) => (
                                        <div key={label} className='min-w-0 rounded-lg border border-[#f1e8d8] bg-white px-2.5 py-2'>
                                            <p className='text-[9.5px] leading-tight text-[#9d8b72]'>{label}</p>
                                            <p className='mt-1 truncate text-[12px] font-black tabular-nums text-[#2e2419]'>{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>

                    {gaps?.length > 0 && (
                        <div className='mt-4 pt-3 border-t border-[#f0e8d4]'>
                            <p className='text-[11.5px] font-bold text-[#3d2e1a] mb-1.5'>איפה הבוט נתקע</p>
                            <p className='text-[10.5px] text-[#a89378] mb-2'>
                                כל פעם שהוא ביקש בן אדם. זה מה שכדאי לתקן בקטלוג או בהנחיות, וזה עובד כבר עכשיו
                                בלי לחכות למדגם.
                            </p>
                            <ul className='space-y-1'>
                                {gaps.map((g, i) => (
                                    <li key={i} className='flex items-start gap-2 text-[11.5px]'>
                                        <Badge tone={g.count > 2 ? 'orange' : 'slate'}>{g.count}</Badge>
                                        <span className='text-[#5a4d3a] leading-snug'>{g.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Stat({ icon: Icon, label, value, hint }) {
    return (
        <div className='rounded-2xl px-3.5 py-3' style={CARD} title={hint || ''}>
            <div className='flex items-center gap-1.5 mb-1'>
                <Icon size={12} style={{ color: '#c9a44e' }} />
                <span className='text-[10.5px] text-[#a89378] font-semibold'>{label}</span>
            </div>
            <p className='text-[20px] font-black text-[#1a1410] leading-none'>{value}</p>
        </div>
    )
}

function FilterChip({ active, onClick, children }) {
    return <button type='button' aria-pressed={active} onClick={onClick}>{children}</button>
}

// ─── one row ──────────────────────────────────────────────────────────
function LeadRow({ lead, active, onOpen, onAct, busy }) {
    const m = stageMeta(lead.stage)
    const bucketMeta = ATTENTION_BUCKETS.find(b => b.key === lead.attention)
    const isBusy = busy.startsWith(`${lead.phone}:`)

    return (
        <li className={`px-4 py-3 ${l.row}`} data-active={active}>
            <div className='md:grid md:grid-cols-[1.6fr_1fr_0.9fr_1fr_0.8fr] md:gap-3 md:items-center'>

                {/* who */}
                <button onClick={onOpen} className='text-right w-full min-w-0 min-h-11 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8893d]'>
                    <div className='flex items-center gap-1.5 flex-wrap'>
                        <span className='text-[13.5px] font-bold text-[#1a1410] truncate'>{lead.displayName}</span>
                        {bucketMeta && <Badge tone={bucketMeta.tone}>{bucketMeta.label}</Badge>}
                        {lead.paused && <Badge tone='gray'><Pause size={9} /> הבוט מושתק</Badge>}
                    </div>
                    <div className='flex items-center gap-2 mt-0.5 text-[11px] text-[#a89378]'>
                        <span dir='ltr' className='font-mono'>{lead.phone}</span>
                        {lead.turnCount > 0 && <span>· {lead.turnCount} הודעות</span>}
                        {lead.silentDays != null && <span>· {relativeHe(lead.lastInboundMs)}</span>}
                    </div>
                    {lead.handoffReason && lead.attention === 'handoff' && (
                        <p className='text-[11px] text-red-600 mt-1 line-clamp-1'>{lead.handoffReason}</p>
                    )}
                </button>

                {/* event */}
                <div className='mt-1.5 md:mt-0 text-[11.5px] text-[#5a4d3a] min-w-0'>
                    {lead.eventType ? <span className='font-semibold'>{eventTypeLabel(lead.eventType)}</span> : <span className='text-[#c4b9a4]'>—</span>}
                    {lead.eventDate && <div className='text-[10.5px] text-[#a89378] truncate'>{formatHebrewDate(lead.eventDate)}</div>}
                    {lead.celebrantName && <div className='text-[10.5px] text-[#a89378] truncate'>{lead.celebrantName}</div>}
                </div>

                {/* stage */}
                <div className='mt-1.5 md:mt-0'>
                    <Badge tone={m.tone}>{m.label}</Badge>
                    {lead.packageInterest && <div className='text-[10px] text-[#a89378] mt-0.5'>{PACKAGE_LABELS[lead.packageInterest] || lead.packageInterest}</div>}
                </div>

                {/* follow-up */}
                <div className='mt-1.5 md:mt-0 text-[11px] text-[#7a6a52] min-w-0'>
                    {lead.followUpAt ? (
                        <span className='inline-flex items-center gap-1'><Clock size={10} /> {formatHebrewDate(lead.followUpAt)}</span>
                    ) : <span className='text-[#c4b9a4]'>אין מעקב</span>}
                    {lead.callbackPromised && <div className='text-[10.5px] text-violet-600'>הבטיח: {formatHebrewDate(lead.callbackPromised)}</div>}
                    {lead.followUpCount > 0 && <div className='text-[10px] text-[#c4b9a4]'>{lead.followUpCount}/3 נשלחו</div>}
                </div>

                {/* actions */}
                <div className='flex items-center gap-1 mt-2 md:mt-0 flex-wrap'>
                    <a href={lead.waLink} target='_blank' rel='noreferrer'
                        onClick={e => e.stopPropagation()}
                        className='inline-flex min-h-11 items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600'>
                        <ExternalLink size={11} /> ווטסאפ
                    </a>
                    <button type='button' onClick={onOpen} className={`${k.button} ${k.small}`}>
                        {active ? 'סגור' : 'שיחה'}
                    </button>
                    {isBusy && <Loader2 size={12} className='animate-spin motion-reduce:animate-none text-[#a89378]' />}
                </div>
            </div>
        </li>
    )
}

// ─── the conversation ─────────────────────────────────────────────────
function LeadDetail({ phone, lead, state, onClose, onAct, busy }) {
    const scroller = useRef(null)
    useEffect(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
    }, [lead])

    const isBusy = busy.startsWith(`${phone}:`)

    return (
        <Window title={lead?.displayName || phone} subtitle={<span dir='ltr'>{phone}</span>} onClose={onClose}>
            {state === 'loading' && <p className={k.unread}><Loader2 size={16} className='animate-spin motion-reduce:animate-none inline ml-2' />טוען שיחה…</p>}
            {state === 'error' && <p role='alert' className={k.error}>לא הצלחתי לטעון את השיחה</p>}

            {state === 'ready' && lead && (
                <div className={l.talk}>
                    {/* what the bot understood — the part worth arguing with */}
                    <div className={`${l.understood} text-[13px] text-[#5a4d3a] space-y-1`}>
                        {lead.notes && <p className='text-[#3d2e1a]'><span className='text-[#a89378]'>הבוט רשם: </span>{lead.notes}</p>}
                        {lead.handoffReason && <p className='text-red-600'><span className='text-[#a89378]'>סיבת העברה: </span>{lead.handoffReason}</p>}
                        <div className='flex items-center gap-1.5 flex-wrap pt-1'>
                            <Badge tone={stageMeta(lead.stage).tone}>{stageMeta(lead.stage).label}</Badge>
                            {lead.eventType && <Badge tone='sky'>{eventTypeLabel(lead.eventType)}</Badge>}
                            {lead.eventDate && <Badge tone='slate'><Calendar size={9} /> {formatHebrewDate(lead.eventDate)}</Badge>}
                            {lead.objectionCount > 0 && <Badge tone='orange'>{lead.objectionCount} התנגדויות</Badge>}
                            {lead.source && <Badge tone='gray'>{lead.source}</Badge>}
                        </div>
                    </div>

                    {/* transcript */}
                    <div ref={scroller} className={l.transcript}>
                        {(lead.turns || []).length === 0 && <p className='text-center text-[12px] text-[#c4b9a4] py-8'>אין עדיין הודעות</p>}
                        {(lead.turns || []).map((t, i) => (
                            <div key={i} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
                                    t.role === 'assistant'
                                        ? 'bg-white text-[#3d2e1a] border border-[#f0e8d4]'
                                        : 'bg-[#dcf8c6] text-[#1a1410]'
                                }`}>
                                    {t.text}
                                    {t.at && <div className='text-[9.5px] text-[#a89378] mt-1'>{fmtTime(t.at)}</div>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* actions */}
                    <div className='flex flex-wrap gap-1.5'>
                        <a href={lead.waLink} target='_blank' rel='noreferrer'
                            className='inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2'
                            style={{ background: 'linear-gradient(180deg,#3ecf6a 0%,#25a24b 100%)' }}>
                            <ExternalLink size={12} /> פתח בווטסאפ
                        </a>
                        {lead.paused ? (
                            <ActionBtn onClick={() => onAct(phone, 'resume')} disabled={isBusy} icon={Play}>החזר את הבוט</ActionBtn>
                        ) : (
                            <ActionBtn onClick={() => onAct(phone, 'pause')} disabled={isBusy} icon={Pause}>אני מטפל, השתק בוט</ActionBtn>
                        )}
                        {lead.followUpAt && (
                            <ActionBtn onClick={() => onAct(phone, 'patch', { followUpAt: null })} disabled={isBusy} icon={BellOff}>הפסק מעקב</ActionBtn>
                        )}
                        {lead.stage !== 'closed_won' && (
                            <ActionBtn onClick={() => onAct(phone, 'patch', { stage: 'closed_won' })} disabled={isBusy} icon={Wallet} tone='emerald'>שילם</ActionBtn>
                        )}
                        {lead.stage !== 'closed_lost' && (
                            <ActionBtn onClick={() => onAct(phone, 'patch', { stage: 'closed_lost' })} disabled={isBusy} icon={XCircle} tone='gray'>לא רלוונטי</ActionBtn>
                        )}
                    </div>
                </div>
            )}
        </Window>
    )
}

function ActionBtn({ onClick, disabled, icon: Icon, children, tone }) {
    const cls = tone === 'emerald'
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
        : tone === 'gray'
            ? 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100'
            : 'text-[#7a6a52] bg-white border-[#ead9b3] hover:bg-[#fbf6ec]'
    return (
        <button onClick={onClick} disabled={disabled}
            className={`inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold border transition-all motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8893d] ${cls}`}>
            <Icon size={12} /> {children}
        </button>
    )
}

// ─── gate ─────────────────────────────────────────────────────────────
function SuperAdminGate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) { router.replace('/login'); return }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [router])

    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6'>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: NAVY }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>טבלת הלידים מכילה מספרי טלפון ושיחות של לקוחות, והיא זמינה רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

export default function SalesLeadsPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <SalesLeadsContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
