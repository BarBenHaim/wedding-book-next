'use client'

// /admin/analytics — super-admin funnel dashboard.
//
// What's here:
//   • Wedding selector dropdown
//   • Window selector (7 / 30 / 90 days)
//   • Funnel cards: scans, unique scans (by IP), start blessing,
//     form submit, photo upload, sent success, sent error, success rate
//   • Daily trend chart (SVG bar chart, last N days)
//   • Hourly heatmap (24-hour distribution)
//   • Location list (top 20 by count)
//   • Device split (mobile/desktop/tablet/unknown)
//   • Recent events feed (last 50)
//
// All data comes from /api/admin/analytics which aggregates the
// wedding's `scans` subcollection server-side. Refreshes on
// window/wedding change + manual reload button.

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import {
    BarChart3, RefreshCcw, Users, MousePointerClick, PenLine,
    ImagePlus, Send, CheckCircle2, AlertTriangle, Globe2,
    Smartphone, Monitor, Tablet, HelpCircle, Clock, MapPin, Lock,
} from 'lucide-react'

function SuperAdminGate({ children }) {
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) {
                setState('denied')
                return
            }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [])
    if (state === 'checking') {
        return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    }
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>
                    דף הסטטיסטיקה פתוח רק למנהל הראשי.
                </p>
            </div>
        )
    }
    return children
}

function AnalyticsContent() {
    const [weddings, setWeddings] = useState([])
    const [weddingId, setWeddingId] = useState('')
    const [days, setDays] = useState(30)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Load wedding list once on mount — feeds the selector
    useEffect(() => {
        ;(async () => {
            try {
                const snap = await getDocs(query(collection(db, 'weddings'), orderBy('createdAt', 'desc')))
                const list = snap.docs.map(d => {
                    const data = d.data() || {}
                    const bride = data.brideNameHe || data.brideName || ''
                    const groom = data.groomNameHe || data.groomName || ''
                    const celeb = data.celebrantNameHe || data.celebrantName || ''
                    const label = (bride && groom) ? `${bride} ו${groom}` : (celeb || d.id)
                    return { id: d.id, label, eventType: data.eventType }
                })
                setWeddings(list)
                if (list.length > 0 && !weddingId) setWeddingId(list[0].id)
            } catch (err) {
                console.error('[analytics] wedding list failed', err)
                setError('שגיאה בטעינת רשימת חתונות')
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const fetchData = async () => {
        if (!weddingId) return
        setLoading(true)
        setError('')
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch(
                `/api/admin/analytics?weddingId=${encodeURIComponent(weddingId)}&days=${days}`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!res.ok) throw new Error(`status ${res.status}`)
            setData(await res.json())
        } catch (err) {
            console.error('[analytics] fetch failed', err)
            setError('שגיאה בטעינת הנתונים. נסה שוב.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (weddingId) fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weddingId, days])

    // Compute derived metrics for the cards
    const metrics = useMemo(() => {
        if (!data?.funnel) return null
        const f = data.funnel
        const successRate = f.form_submit > 0 ? Math.round((f.blessing_sent_success / f.form_submit) * 100) : 0
        const conversionRate = f.scan > 0 ? Math.round((f.blessing_sent_success / f.scan) * 100) : 0
        return { ...f, successRate, conversionRate }
    }, [data])

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[1400px] mx-auto'>
                {/* Header */}
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <BarChart3 size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>סטטיסטיקה חיה</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>פאנל ניתוח התנהגות אורחים — 30 ימים אחורה כברירת מחדל</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <select value={weddingId} onChange={e => setWeddingId(e.target.value)} className='px-3 py-2 rounded-lg text-[13px] font-semibold text-[#3d2e1a] outline-none' style={{ background: '#fff', border: '1px solid #ead9b3', minWidth: 220 }}>
                            {weddings.map(w => (<option key={w.id} value={w.id}>{w.label}</option>))}
                        </select>
                        <div className='flex rounded-lg overflow-hidden' style={{ border: '1px solid #ead9b3' }}>
                            {[7, 30, 90].map(d => (
                                <button key={d} onClick={() => setDays(d)} className={`px-3 py-2 text-[12px] font-bold transition-all ${days === d ? 'text-white' : 'text-[#7a6a52] bg-white hover:bg-[#fbf6ec]'}`} style={days === d ? { background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' } : {}}>
                                    {d}י
                                </button>
                            ))}
                        </div>
                        <button onClick={fetchData} disabled={loading} className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', opacity: loading ? 0.6 : 1 }}>
                            <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} /> רענן
                        </button>
                    </div>
                </div>

                {error && (
                    <div className='mb-4 px-4 py-3 rounded-lg text-[13px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                        {error}
                    </div>
                )}

                {!metrics && !loading && !error && (
                    <div className='p-8 text-center text-[#a89378]'>בחר חתונה כדי להציג נתונים</div>
                )}

                {metrics && (
                    <>
                        {/* Funnel cards */}
                        <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6'>
                            <MetricCard icon={MousePointerClick} label='סריקות סך הכל' value={metrics.scan} color='#7a6a52' />
                            <MetricCard icon={Users} label='סריקות ייחודיות (IP)' value={metrics.uniqueScan} color='#7a6a52' />
                            <MetricCard icon={PenLine} label='נכנסו לטופס' value={metrics.start_blessing} color='#9f7e3a' />
                            <MetricCard icon={ImagePlus} label='העלו תמונה' value={metrics.photo_upload} color='#9f7e3a' />
                            <MetricCard icon={Send} label='לחצו שלח' value={metrics.form_submit} color='#aa8840' />
                            <MetricCard icon={CheckCircle2} label='ברכות הצליחו' value={metrics.blessing_sent_success} color='#4f7a3e' />
                            <MetricCard icon={AlertTriangle} label='שגיאות' value={metrics.blessing_sent_error} color='#b32424' />
                        </div>

                        {/* Conversion rates */}
                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6'>
                            <RateCard label='שיעור הצלחה (מתוך טפסים שנשלחו)' value={`${metrics.successRate}%`} description={`${metrics.blessing_sent_success} / ${metrics.form_submit}`} />
                            <RateCard label='שיעור המרה (סריקה ← ברכה)' value={`${metrics.conversionRate}%`} description={`${metrics.blessing_sent_success} / ${metrics.scan}`} />
                            <RateCard label='סך אירועים בחלון' value={data.totalEvents} description={`${days} ימים אחרונים`} />
                        </div>

                        {/* Daily trend */}
                        <Card title='מגמה יומית'>
                            <DailyChart daily={data.daily} days={days} />
                        </Card>

                        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4'>
                            {/* Hourly heatmap */}
                            <Card title='פילוח לפי שעה (UTC)'>
                                <HourlyChart hourly={data.hourly} />
                            </Card>

                            {/* Device + location side by side on lg+ */}
                            <Card title='מכשירים'>
                                <DeviceBreakdown devices={data.devices} total={data.totalEvents} />
                            </Card>
                        </div>

                        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4'>
                            <Card title='מיקומים מובילים'>
                                <LocationsList locations={data.locations} />
                            </Card>
                            <Card title='אירועים אחרונים'>
                                <RecentEvents recent={data.recent} />
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ── UI components ──────────────────────────────────────────────────

function Card({ title, children }) {
    return (
        <div className='rounded-2xl overflow-hidden' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.22)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
            <div className='px-4 py-3 border-b' style={{ borderColor: '#f0e8d4', background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}>
                <p className='text-[11px] font-bold text-[#7a6a52] uppercase tracking-widest'>{title}</p>
            </div>
            <div className='p-4'>{children}</div>
        </div>
    )
}

function MetricCard({ icon: Icon, label, value, color }) {
    return (
        <div className='rounded-xl p-3 flex flex-col gap-1' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.22)', boxShadow: '0 4px 10px -8px rgba(170,136,64,0.20)' }}>
            <div className='flex items-center gap-1.5'>
                <Icon size={12} style={{ color }} />
                <span className='text-[10.5px] text-[#7a6a52] font-semibold leading-tight'>{label}</span>
            </div>
            <div className='text-[24px] font-bold' style={{ color: '#1a1410' }}>{value}</div>
        </div>
    )
}

function RateCard({ label, value, description }) {
    return (
        <div className='rounded-xl px-4 py-3' style={{ background: 'linear-gradient(135deg, rgba(170,136,64,0.08) 0%, rgba(170,136,64,0.02) 100%)', border: '1px solid rgba(212,184,103,0.30)' }}>
            <p className='text-[11px] text-[#7a6a52] font-semibold mb-1'>{label}</p>
            <div className='text-[26px] font-bold text-[#7a5d27]'>{value}</div>
            <p className='text-[10.5px] text-[#a89378] mt-0.5'>{description}</p>
        </div>
    )
}

function DailyChart({ daily, days }) {
    // Build a complete list of days (including zero-event days) over the
    // window so the X axis stays consistent.
    const allDays = useMemo(() => {
        const map = new Map(daily.map(d => [d.date, d]))
        const out = []
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            out.push(map.get(key) || { date: key, scan: 0, blessing_sent_success: 0, uniqueIPs: 0 })
        }
        return out
    }, [daily, days])

    const maxVal = Math.max(1, ...allDays.map(d => Math.max(d.scan, d.blessing_sent_success)))

    return (
        <div>
            <div className='flex items-end gap-1 h-32 mb-2'>
                {allDays.map((d, i) => (
                    <div key={i} className='flex-1 flex flex-col items-center justify-end gap-px' title={`${d.date} · סריקות: ${d.scan} · ברכות: ${d.blessing_sent_success}`}>
                        <div className='w-full rounded-t' style={{ height: `${(d.scan / maxVal) * 100}%`, minHeight: d.scan > 0 ? 2 : 0, background: 'rgba(170,136,64,0.45)' }} />
                        <div className='w-full' style={{ height: `${(d.blessing_sent_success / maxVal) * 30}%`, minHeight: d.blessing_sent_success > 0 ? 2 : 0, background: '#4f7a3e' }} />
                    </div>
                ))}
            </div>
            <div className='flex items-center gap-4 text-[11px] text-[#7a6a52]'>
                <span className='inline-flex items-center gap-1'><span className='inline-block w-3 h-2 rounded-sm' style={{ background: 'rgba(170,136,64,0.45)' }} />סריקות</span>
                <span className='inline-flex items-center gap-1'><span className='inline-block w-3 h-2 rounded-sm' style={{ background: '#4f7a3e' }} />ברכות שהתקבלו</span>
                <span className='ms-auto'>{allDays[0]?.date} → {allDays[allDays.length - 1]?.date}</span>
            </div>
        </div>
    )
}

function HourlyChart({ hourly }) {
    const max = Math.max(1, ...hourly.map(h => h.total))
    return (
        <div>
            <div className='flex items-end gap-0.5 h-24 mb-2'>
                {hourly.map(h => (
                    <div key={h.hour} className='flex-1 flex flex-col items-center justify-end' title={`${h.hour}:00 — סה"כ ${h.total} · ברכות ${h.blessings}`}>
                        <div className='w-full rounded-t' style={{ height: `${(h.total / max) * 100}%`, minHeight: h.total > 0 ? 2 : 0, background: h.blessings > 0 ? '#aa8840' : 'rgba(170,136,64,0.30)' }} />
                    </div>
                ))}
            </div>
            <div className='flex justify-between text-[9px] text-[#a89378]'>
                {[0, 6, 12, 18, 23].map(h => (<span key={h}>{h}:00</span>))}
            </div>
        </div>
    )
}

function DeviceBreakdown({ devices, total }) {
    const items = [
        { key: 'mobile', label: 'נייד', icon: Smartphone, color: '#aa8840' },
        { key: 'desktop', label: 'מחשב', icon: Monitor, color: '#7a6a52' },
        { key: 'tablet', label: 'טאבלט', icon: Tablet, color: '#9f7e3a' },
        { key: 'unknown', label: 'לא מזוהה', icon: HelpCircle, color: '#c4b9a4' },
    ]
    return (
        <div className='space-y-2'>
            {items.map(item => {
                const count = devices[item.key] || 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                const Icon = item.icon
                return (
                    <div key={item.key} className='flex items-center gap-3'>
                        <Icon size={14} style={{ color: item.color }} />
                        <span className='text-[12px] text-[#3d2e1a] flex-1'>{item.label}</span>
                        <div className='flex-1 h-2 rounded-full overflow-hidden' style={{ background: '#fbf6ec' }}>
                            <div className='h-full rounded-full' style={{ width: `${pct}%`, background: item.color }} />
                        </div>
                        <span className='text-[11px] font-mono text-[#7a6a52] w-12 text-end'>{count} ({pct}%)</span>
                    </div>
                )
            })}
        </div>
    )
}

function LocationsList({ locations }) {
    if (!locations.length) {
        return <p className='text-[12px] text-[#a89378] py-4 text-center'>אין נתוני מיקום עדיין</p>
    }
    const max = Math.max(...locations.map(l => l.count))
    return (
        <div className='space-y-1.5 max-h-72 overflow-y-auto'>
            {locations.map((loc, i) => (
                <div key={i} className='flex items-center gap-2'>
                    <Globe2 size={11} className='text-[#aa8840]' />
                    <span className='text-[11.5px] text-[#3d2e1a] flex-1 truncate'>
                        {loc.country || '—'}{loc.city ? ` · ${loc.city}` : ''}
                    </span>
                    <div className='w-24 h-1.5 rounded-full overflow-hidden' style={{ background: '#fbf6ec' }}>
                        <div className='h-full rounded-full' style={{ width: `${(loc.count / max) * 100}%`, background: '#aa8840' }} />
                    </div>
                    <span className='text-[10.5px] font-mono text-[#7a6a52] w-8 text-end'>{loc.count}</span>
                </div>
            ))}
        </div>
    )
}

const EVENT_LABELS = {
    scan: 'סריקה',
    start_blessing: 'פתח טופס',
    form_submit: 'לחץ שלח',
    photo_upload: 'העלה תמונה',
    blessing_sent_success: 'ברכה נשלחה',
    blessing_sent_error: 'שגיאה',
}
const EVENT_COLORS = {
    scan: '#7a6a52',
    start_blessing: '#9f7e3a',
    form_submit: '#aa8840',
    photo_upload: '#9f7e3a',
    blessing_sent_success: '#4f7a3e',
    blessing_sent_error: '#b32424',
}

function RecentEvents({ recent }) {
    if (!recent.length) {
        return <p className='text-[12px] text-[#a89378] py-4 text-center'>אין אירועים בחלון הזמן</p>
    }
    return (
        <div className='space-y-1.5 max-h-72 overflow-y-auto -mx-2'>
            {recent.map(e => {
                const when = e.ts ? new Date(e.ts) : null
                const whenStr = when ? when.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
                return (
                    <div key={e.id} className='flex items-start gap-2 px-2 py-1.5 rounded' style={{ borderRight: `2px solid ${EVENT_COLORS[e.event] || '#c4b9a4'}` }}>
                        <Clock size={10} className='mt-0.5 text-[#a89378] shrink-0' />
                        <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-1.5 flex-wrap'>
                                <span className='text-[11.5px] font-bold' style={{ color: EVENT_COLORS[e.event] || '#7a6a52' }}>
                                    {EVENT_LABELS[e.event] || e.event}
                                </span>
                                <span className='text-[10.5px] text-[#7a6a52]'>{whenStr}</span>
                            </div>
                            {(e.country || e.city || e.ip) && (
                                <div className='text-[10px] text-[#a89378] truncate'>
                                    {(e.country || e.city) && <><MapPin size={9} className='inline -mt-0.5' /> {e.country}{e.city ? ` · ${e.city}` : ''} · </>}
                                    {e.ip}
                                </div>
                            )}
                            {e.meta && (
                                <div className='text-[10px] text-[#b32424] truncate' title={e.meta}>{e.meta}</div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export default function AnalyticsPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <AnalyticsContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
