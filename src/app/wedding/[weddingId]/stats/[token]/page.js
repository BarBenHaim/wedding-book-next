'use client'

// /wedding/[weddingId]/stats/[token]
//
// Public, token-gated stats page for the couple. They get a link
// like:
//   https://app.weddingtales.co.il/wedding/abc/stats/<uuid>
// from the super-admin (minted via /api/admin/stats-tokens) and can
// open it on any phone — no login. The token is the auth: it must
// appear in `wedding.statsTokens`.
//
// What they see:
//   • Bride/groom (or celebrant) names + a friendly header
//   • Big number tiles: scans, unique scans, blessings, photos, conversion %
//   • 30-day daily chart (scans + blessings)
//   • Latest 10 blessings (names only — no content, no personal data)
//   • A "view the book" button if a digital edition exists
//
// What they DON'T see:
//   • Raw IPs, user agents, error stack traces, geo info
//   • Other weddings — the token only unlocks this one wedding's stats
//
// All data comes from /api/wedding-stats-public which does the same
// token check server-side (defense in depth).

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
    BarChart3, MousePointerClick, PenLine, ImagePlus,
    CheckCircle2, BookOpen, Lock, RefreshCcw, Sparkles,
} from 'lucide-react'

const EVENT_LABEL = {
    wedding: 'החתונה',
    bar_mitzvah: 'הבר מצווה',
    bat_mitzvah: 'הבת מצווה',
    birthday: 'יום ההולדת',
}

export default function StatsPage() {
    const { weddingId, token } = useParams()
    const [status, setStatus] = useState('loading') // loading | invalid | ready | error
    const [data, setData] = useState(null)
    const [refreshing, setRefreshing] = useState(false)

    const fetchData = async (initial = false) => {
        if (!weddingId || !token) return
        if (!initial) setRefreshing(true)
        try {
            const res = await fetch(`/api/wedding-stats-public?weddingId=${encodeURIComponent(weddingId)}&token=${encodeURIComponent(token)}`)
            if (res.status === 401) {
                setStatus('invalid')
                return
            }
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setData(json)
            setStatus('ready')
        } catch (err) {
            console.error('[stats public] failed', err)
            setStatus('error')
        } finally {
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchData(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weddingId, token])

    // Hide global header / footer for full viewport
    useEffect(() => {
        if (typeof document === 'undefined') return
        const css = document.createElement('style')
        css.textContent = `header.global-header, footer.global-footer { display:none !important }`
        document.head.appendChild(css)
        return () => { try { document.head.removeChild(css) } catch (e) {} }
    }, [])

    // Derived metrics
    const conversion = useMemo(() => {
        if (!data) return 0
        const { totals } = data
        if (!totals.scans) return 0
        return Math.round((totals.blessings / totals.scans) * 100)
    }, [data])

    if (status === 'loading') {
        return (
            <div className='min-h-screen flex items-center justify-center' style={{ background: '#f8f4ec' }}>
                <p className='text-[#7a6a52] text-[14px]'>טוען...</p>
            </div>
        )
    }
    if (status === 'invalid') {
        return (
            <div className='min-h-screen flex flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-14 h-14 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                    <Lock size={22} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1.5'>הקישור אינו תקף</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>
                    ייתכן שהקישור פג תוקף או שבוטל. פנו אלינו כדי לקבל קישור חדש.
                </p>
            </div>
        )
    }
    if (status === 'error' || !data) {
        return (
            <div className='min-h-screen flex flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <p className='text-[#7a6a52] text-[14px] mb-3'>שגיאה בטעינת הסטטיסטיקה</p>
                <button onClick={() => fetchData(false)} className='px-4 py-2 rounded-lg text-white text-[13px] font-bold' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                    נסה שוב
                </button>
            </div>
        )
    }

    const w = data.wedding
    const title = (w.brideName && w.groomName) ? `${w.brideName} ו${w.groomName}` : (w.celebrantName || '')
    const eventNoun = EVENT_LABEL[w.eventType] || EVENT_LABEL.wedding

    return (
        <div className='min-h-screen' dir='rtl' style={{ background: 'linear-gradient(180deg, #f8f4ec 0%, #fdfaf3 100%)' }}>
            <div className='max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-10 py-8'>

                {/* Header */}
                <div className='flex items-center justify-between flex-wrap gap-4 mb-8'>
                    <div className='flex items-center gap-3'>
                        <div className='w-14 h-14 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 14px 28px -12px rgba(170,136,64,0.50)' }}>
                            <Sparkles size={22} className='text-white' />
                        </div>
                        <div>
                            <p className='text-[11px] text-[#a89378] uppercase tracking-widest font-semibold mb-0.5'>הסטטיסטיקה של {eventNoun}</p>
                            <h1 className='font-bold text-[#1a1410] text-[24px] leading-tight'>
                                {title || 'הסטטיסטיקה שלכם'}
                            </h1>
                        </div>
                    </div>
                    <button
                        onClick={() => fetchData(false)}
                        disabled={refreshing}
                        className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]'
                        style={{ background: '#fff', border: '1px solid #ead9b3' }}
                    >
                        <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} /> רענן
                    </button>
                </div>

                {/* Big tiles */}
                <div className='grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6'>
                    <BigTile
                        icon={MousePointerClick}
                        label='סך הסריקות'
                        value={data.totals.scans}
                        sub={`${data.totals.uniqueScans} ייחודיות`}
                        accent='#aa8840'
                    />
                    <BigTile
                        icon={CheckCircle2}
                        label='ברכות שהתקבלו'
                        value={data.totals.blessings}
                        sub={`${data.entriesCount} בספר`}
                        accent='#4f7a3e'
                    />
                    <BigTile
                        icon={ImagePlus}
                        label='תמונות שהועלו'
                        value={data.totals.photoUploads}
                        sub='מאורחים שהשתתפו'
                        accent='#9f7e3a'
                    />
                    <BigTile
                        icon={BarChart3}
                        label='שיעור המרה'
                        value={`${conversion}%`}
                        sub='מסריקה לברכה'
                        accent='#7a5d27'
                    />
                </div>

                {/* Funnel mini */}
                <div className='rounded-2xl p-5 mb-6' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.20)' }}>
                    <p className='text-[11px] font-bold text-[#7a6a52] uppercase tracking-widest mb-4'>מסע האורח</p>
                    <FunnelBars totals={data.totals} />
                </div>

                {/* Daily chart */}
                <div className='rounded-2xl p-5 mb-6' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.20)' }}>
                    <div className='flex items-center justify-between mb-4 flex-wrap gap-2'>
                        <p className='text-[11px] font-bold text-[#7a6a52] uppercase tracking-widest'>פעילות לפי יום (30 יום אחרונים)</p>
                        <span className='inline-flex items-center gap-3 text-[10.5px] text-[#7a6a52]'>
                            <span className='inline-flex items-center gap-1'><span className='w-3 h-2 rounded-sm' style={{ background: 'rgba(170,136,64,0.45)' }} /> סריקות</span>
                            <span className='inline-flex items-center gap-1'><span className='w-3 h-2 rounded-sm' style={{ background: '#4f7a3e' }} /> ברכות</span>
                        </span>
                    </div>
                    <DailyChart daily={data.daily} />
                </div>

                {/* Two-column: recent blessings + view book CTA */}
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div className='rounded-2xl p-5' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.20)' }}>
                        <p className='text-[11px] font-bold text-[#7a6a52] uppercase tracking-widest mb-3'>ברכות אחרונות</p>
                        {data.recentBlessings?.length > 0 ? (
                            <div className='space-y-2'>
                                {data.recentBlessings.map((b, i) => (
                                    <div key={i} className='flex items-center justify-between gap-2 px-3 py-2 rounded-lg' style={{ background: '#fdfaf3' }}>
                                        <div className='flex items-center gap-2 min-w-0'>
                                            <div className='w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0' style={{ background: 'linear-gradient(180deg, #efe2b8 0%, #d3b46a 100%)' }}>
                                                <span className='text-[11px] font-bold text-white'>{(b.from || '?').slice(0, 1)}</span>
                                            </div>
                                            <span className='text-[13px] text-[#3d2e1a] font-semibold truncate'>{b.from || 'אורח/ת'}</span>
                                        </div>
                                        {b.ts && (
                                            <span className='text-[10.5px] text-[#a89378] flex-shrink-0'>{formatRelative(b.ts)}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className='text-[12px] text-[#a89378] py-2'>עדיין אין ברכות. תיכף יתחילו להגיע.</p>
                        )}
                    </div>

                    <div className='rounded-2xl p-5 flex flex-col justify-between' style={{ background: 'linear-gradient(135deg, rgba(170,136,64,0.10) 0%, rgba(170,136,64,0.02) 100%)', border: '1px solid rgba(212,184,103,0.35)' }}>
                        <div>
                            <p className='text-[11px] font-bold text-[#7a6a52] uppercase tracking-widest mb-3'>הספר הדיגיטלי</p>
                            <p className='text-[13px] text-[#3d2e1a] leading-relaxed mb-4'>
                                לראות איך נראה הספר עם כל הברכות והתמונות שכבר נכנסו. הפריסה מתעדכנת אוטומטית.
                            </p>
                        </div>
                        {data.digitalEditionLink ? (
                            <a
                                href={data.digitalEditionLink}
                                className='inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-[14px] font-bold'
                                style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.45)' }}
                            >
                                <BookOpen size={16} /> צפו בספר הדיגיטלי
                            </a>
                        ) : (
                            <p className='text-[12px] text-[#a89378] italic'>הקישור לספר עוד לא נוצר. נדאג לכם בהקדם.</p>
                        )}
                    </div>
                </div>

                {/* Footer note */}
                <p className='mt-8 text-center text-[11px] text-[#a89378]'>
                    הסטטיסטיקה מתעדכנת בזמן אמת. הקישור הזה אישי — שמרו אותו לעצמכם.
                </p>
            </div>
        </div>
    )
}

// ── UI components ─────────────────────────────────────────────────

function BigTile({ icon: Icon, label, value, sub, accent }) {
    return (
        <div className='rounded-2xl p-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.20)' }}>
            <div className='flex items-center gap-2 mb-2'>
                <div className='w-9 h-9 rounded-xl flex items-center justify-center' style={{ background: `${accent}1a` }}>
                    <Icon size={16} style={{ color: accent }} />
                </div>
                <p className='text-[11px] text-[#7a6a52] font-bold leading-tight'>{label}</p>
            </div>
            <div className='text-[32px] font-bold leading-none mb-1' style={{ color: '#1a1410' }}>{value}</div>
            {sub && <p className='text-[10.5px] text-[#a89378]'>{sub}</p>}
        </div>
    )
}

function FunnelBars({ totals }) {
    const steps = [
        { key: 'scans', label: 'סרקו את הברקוד', icon: MousePointerClick, value: totals.scans },
        { key: 'startedBlessing', label: 'התחילו למלא טופס', icon: PenLine, value: totals.startedBlessing },
        { key: 'photoUploads', label: 'העלו תמונה', icon: ImagePlus, value: totals.photoUploads },
        { key: 'blessings', label: 'שלחו ברכה', icon: CheckCircle2, value: totals.blessings },
    ]
    const max = Math.max(1, ...steps.map(s => s.value))
    return (
        <div className='space-y-2.5'>
            {steps.map(s => (
                <div key={s.key}>
                    <div className='flex items-center justify-between mb-1'>
                        <div className='flex items-center gap-1.5'>
                            <s.icon size={13} style={{ color: '#7a6a52' }} />
                            <span className='text-[12px] text-[#3d2e1a] font-semibold'>{s.label}</span>
                        </div>
                        <span className='text-[13px] font-bold' style={{ color: '#1a1410' }}>{s.value}</span>
                    </div>
                    <div className='w-full h-2 rounded-full overflow-hidden' style={{ background: '#f0e8d4' }}>
                        <div className='h-full rounded-full transition-all' style={{ width: `${(s.value / max) * 100}%`, background: 'linear-gradient(90deg, #d3b46a 0%, #aa8840 100%)' }} />
                    </div>
                </div>
            ))}
        </div>
    )
}

function DailyChart({ daily }) {
    // Pad to 30 days for consistent axis
    const days = 30
    const all = useMemo(() => {
        const map = new Map(daily.map(d => [d.date, d]))
        const out = []
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
            out.push(map.get(key) || { date: key, scan: 0, blessings: 0 })
        }
        return out
    }, [daily])
    const max = Math.max(1, ...all.map(d => Math.max(d.scan, d.blessings)))

    return (
        <div>
            <div className='flex items-end gap-1 h-32 mb-2'>
                {all.map((d, i) => (
                    <div key={i} className='flex-1 flex flex-col items-center justify-end gap-px' title={`${d.date} · סריקות: ${d.scan} · ברכות: ${d.blessings}`}>
                        <div className='w-full rounded-t' style={{ height: `${(d.scan / max) * 100}%`, minHeight: d.scan > 0 ? 2 : 0, background: 'rgba(170,136,64,0.45)' }} />
                        <div className='w-full' style={{ height: `${(d.blessings / max) * 30}%`, minHeight: d.blessings > 0 ? 2 : 0, background: '#4f7a3e' }} />
                    </div>
                ))}
            </div>
            <div className='flex items-center justify-between text-[10.5px] text-[#a89378]'>
                <span>{formatDay(all[0]?.date)}</span>
                <span>{formatDay(all[all.length - 1]?.date)}</span>
            </div>
        </div>
    )
}

function formatDay(dateStr) {
    if (!dateStr) return ''
    const [y, m, d] = dateStr.split('-')
    return `${parseInt(d)}.${parseInt(m)}`
}

function formatRelative(iso) {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'הרגע'
    if (min < 60) return `לפני ${min} דק׳`
    const h = Math.floor(min / 60)
    if (h < 24) return `לפני ${h} שע׳`
    const d = Math.floor(h / 24)
    if (d < 30) return `לפני ${d} ימים`
    return new Date(iso).toLocaleDateString('he-IL')
}
