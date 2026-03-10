'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CalendarDays,
    Settings2,
    ExternalLink,
    Crown,
    Users,
    Hash,
    MessageCircle,
    AlertCircle,
    Loader2,
    Heart,
    Sparkles,
    Search,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Zap,
    ArrowUpDown,
    CheckCircle2,
} from 'lucide-react'

// ─── Data Fetching ────────────────────────────────────────────────────────────
async function fetchAllWeddings() {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch('/api/admin/weddings', {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
    }
    return res.json()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoString) {
    if (!isoString) return '—'
    try {
        return new Date(isoString).toLocaleDateString('he-IL')
    } catch {
        return isoString
    }
}

function coupleLabel(wedding) {
    const { brideName, groomName, ownerEmail } = wedding
    if (brideName || groomName) {
        return [brideName, groomName].filter(Boolean).join(' & ')
    }
    return ownerEmail || '—'
}

function getWeddingStatus(weddingDate) {
    if (!weddingDate) return 'unknown'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const date = new Date(weddingDate)
    date.setHours(0, 0, 0, 0)
    const diff = date - today
    if (diff === 0) return 'today'
    if (diff > 0) return 'upcoming'
    return 'past'
}

function isToday(isoString) {
    return getWeddingStatus(isoString) === 'today'
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingState() {
    return (
        <div className='flex flex-col items-center justify-center py-40 gap-5'>
            <div className='relative'>
                <div className='w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 opacity-20 animate-ping absolute inset-0' />
                <div className='w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center relative'>
                    <Loader2 size={28} className='text-white animate-spin' />
                </div>
            </div>
            <p className='text-gray-400 text-sm tracking-wide'>טוען חתונות...</p>
        </div>
    )
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorState({ message }) {
    return (
        <div className='flex flex-col items-center justify-center py-40 gap-4'>
            <div className='w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center'>
                <AlertCircle size={28} className='text-red-500' />
            </div>
            <p className='text-gray-800 font-semibold'>שגיאה בטעינת הנתונים</p>
            <p className='text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl'>
                {message}
            </p>
        </div>
    )
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyState() {
    return (
        <div className='flex flex-col items-center justify-center py-40 gap-4'>
            <div className='w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center'>
                <Heart size={28} className='text-pink-400' />
            </div>
            <p className='text-gray-400 text-sm'>אין חתונות בטבלה עדיין.</p>
        </div>
    )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, iconBg, iconColor, pulse = false }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className='relative overflow-hidden rounded-2xl p-5 bg-white/90 backdrop-blur-md border border-purple-100 shadow-md'
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
            <div className='flex items-start justify-between'>
                <div>
                    <p className='text-gray-400 text-xs font-medium tracking-widest uppercase mb-2'>{label}</p>
                    <p className='text-3xl font-black text-gray-800 leading-none'>{value}</p>
                </div>
                <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    {pulse && (
                        <div className={`absolute inset-0 rounded-xl animate-ping opacity-30 ${iconBg}`} />
                    )}
                    <Icon size={20} className={`${iconColor} relative z-10`} />
                </div>
            </div>
        </motion.div>
    )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ weddingDate }) {
    const status = getWeddingStatus(weddingDate)

    if (status === 'today') return (
        <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200'>
            <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />
            היום
        </span>
    )

    if (status === 'upcoming') return (
        <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200'>
            <span className='w-1.5 h-1.5 rounded-full bg-indigo-400' />
            עתידית
        </span>
    )

    if (status === 'past') return (
        <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200'>
            <CheckCircle2 size={10} className='text-slate-400' />
            עברה
        </span>
    )

    return (
        <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200'>
            —
        </span>
    )
}

// ─── Greetings Badge ──────────────────────────────────────────────────────────
function GreetingsBadge({ count }) {
    const n = count ?? 0
    if (n === 0) return (
        <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-gray-100 text-gray-400 border border-gray-200'>
            {n}
        </span>
    )
    if (n < 10) return (
        <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-blue-50 text-blue-600 border border-blue-200'>
            {n}
        </span>
    )
    return (
        <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'>
            {n}
        </span>
    )
}

// ─── Sortable Header ──────────────────────────────────────────────────────────
function SortableHeader({ children, sortKey, currentSort, onSort, justify = 'end' }) {
    const isActive = currentSort.key === sortKey
    const dir = currentSort.dir

    const handleClick = () => {
        if (!isActive) {
            onSort({ key: sortKey, dir: 'asc' })
        } else if (dir === 'asc') {
            onSort({ key: sortKey, dir: 'desc' })
        } else {
            onSort({ key: null, dir: null })
        }
    }

    return (
        <th
            onClick={handleClick}
            className={`px-6 py-4 font-semibold cursor-pointer select-none transition-colors duration-150 hover:text-gray-700 ${isActive ? 'text-purple-600' : 'text-gray-400'}`}
        >
            <span className={`flex items-center gap-1.5 ${justify === 'center' ? 'justify-center' : justify === 'start' ? 'justify-start' : 'justify-end'}`}>
                {children}
                <AnimatePresence mode='wait' initial={false}>
                    {isActive && dir === 'asc' && (
                        <motion.span key='up' initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                            <ChevronUp size={13} className='text-purple-500' />
                        </motion.span>
                    )}
                    {isActive && dir === 'desc' && (
                        <motion.span key='down' initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}>
                            <ChevronDown size={13} className='text-purple-500' />
                        </motion.span>
                    )}
                    {!isActive && (
                        <motion.span key='neutral' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            <ChevronsUpDown size={12} className='text-gray-300' />
                        </motion.span>
                    )}
                </AnimatePresence>
            </span>
        </th>
    )
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
function SearchBar({ value, onChange }) {
    return (
        <div className='relative' dir='rtl'>
            <Search size={15} className='absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none' />
            <input
                type='text'
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder='חיפוש לפי שם זוג או אימייל...'
                className='w-full pr-10 pl-4 py-2.5 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 outline-none transition-all duration-200 border border-purple-200 bg-purple-50 focus:border-purple-400 focus:ring-2 focus:ring-purple-100'
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors text-xs'
                >
                    ✕
                </button>
            )}
        </div>
    )
}

// ─── Action Icon Button ───────────────────────────────────────────────────────
function ActionIconBtn({ href, icon: Icon, tooltip, variant = 'primary' }) {
    const base = 'w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border'
    const styles = {
        primary: 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 hover:border-purple-300',
        secondary: 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700',
    }
    return (
        <a href={href} target='_blank' rel='noopener noreferrer' title={tooltip} className={`${base} ${styles[variant]}`}>
            <Icon size={15} />
        </a>
    )
}

// ─── Main Table ───────────────────────────────────────────────────────────────
function WeddingsTable({ weddings, sort, onSort }) {
    if (weddings.length === 0) return <EmptyState />

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right' style={{ minWidth: '720px' }}>
                {/* ── thead ── */}
                <thead>
                    <tr className='border-b border-purple-100 text-[11px] uppercase tracking-widest bg-purple-50/60'>
                        <th className='px-6 py-4 text-gray-300 font-semibold w-12'>#</th>

                        <SortableHeader sortKey='couple' currentSort={sort} onSort={onSort}>
                            <Users size={11} /> זוג
                        </SortableHeader>

                        <SortableHeader sortKey='date' currentSort={sort} onSort={onSort}>
                            <CalendarDays size={11} /> תאריך
                        </SortableHeader>

                        <th className='px-6 py-4 font-semibold text-gray-400 text-center'>סטטוס</th>

                        <SortableHeader sortKey='greetings' currentSort={sort} onSort={onSort} justify='center'>
                            <MessageCircle size={11} /> ברכות
                        </SortableHeader>

                        <th className='px-6 py-4 font-semibold text-gray-400'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <Hash size={11} /> הזמנה
                            </span>
                        </th>

                        <th className='px-6 py-4 font-semibold text-gray-400 text-center'>פעולות</th>
                    </tr>
                </thead>

                {/* ── tbody ── */}
                <tbody className='divide-y divide-gray-100'>
                    <AnimatePresence initial={false}>
                        {weddings.map((w, i) => (
                            <motion.tr
                                key={w.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className='group hover:bg-purple-50/60 transition-colors duration-150'
                            >
                                {/* Index */}
                                <td className='px-6 py-4'>
                                    <div className='w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-400 text-xs font-bold group-hover:bg-purple-200 transition-colors'>
                                        {i + 1}
                                    </div>
                                </td>

                                {/* Couple */}
                                <td className='px-6 py-4'>
                                    <div className='text-right'>
                                        <div className='font-semibold text-gray-800'>{coupleLabel(w)}</div>
                                        {w.ownerEmail && (w.brideName || w.groomName) && (
                                            <div className='text-xs text-gray-400 mt-0.5'>{w.ownerEmail}</div>
                                        )}
                                    </div>
                                </td>

                                {/* Date */}
                                <td className='px-6 py-4 text-gray-500 whitespace-nowrap text-sm tabular-nums'>
                                    {formatDate(w.weddingDate)}
                                </td>

                                {/* Status Badge */}
                                <td className='px-6 py-4 text-center'>
                                    <StatusBadge weddingDate={w.weddingDate} />
                                </td>

                                {/* Greetings */}
                                <td className='px-6 py-4 text-center'>
                                    <GreetingsBadge count={w.greetingsCount} />
                                </td>

                                {/* Order ID */}
                                <td className='px-6 py-4 text-right'>
                                    {w.orderId ? (
                                        <span className='font-mono text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200'>
                                            #{w.orderId}
                                        </span>
                                    ) : (
                                        <span className='text-gray-300 italic text-xs'>Manual</span>
                                    )}
                                </td>

                                {/* Actions */}
                                <td className='px-6 py-4'>
                                    <div className='flex items-center justify-center gap-2'>
                                        <ActionIconBtn
                                            href={`/wedding/${w.id}/admin`}
                                            icon={Settings2}
                                            tooltip='נהל כזוג'
                                            variant='primary'
                                        />
                                        <ActionIconBtn
                                            href={`/wedding/${w.id}`}
                                            icon={ExternalLink}
                                            tooltip='צפה באלבום'
                                            variant='secondary'
                                        />
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </AnimatePresence>
                </tbody>
            </table>
        </div>
    )
}

// ─── Page Content ─────────────────────────────────────────────────────────────
function AdminDashboardContent() {
    const [weddings, setWeddings] = useState([])
    const [status, setStatus] = useState('loading')
    const [error, setError] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sort, setSort] = useState({ key: 'date', dir: 'asc' })

    useEffect(() => {
        fetchAllWeddings()
            .then(data => {
                setWeddings(data)
                setStatus('ok')
            })
            .catch(err => {
                setError(err.message)
                setStatus('error')
            })
    }, [])

    // ── Derived stats ──
    const totalGreetings = weddings.reduce((sum, w) => sum + (w.greetingsCount ?? 0), 0)
    const todayCount = weddings.filter(w => isToday(w.weddingDate)).length
    const upcomingCount = weddings.filter(w => getWeddingStatus(w.weddingDate) === 'upcoming').length

    // ── Filter ──
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return weddings
        const q = searchQuery.toLowerCase().trim()
        return weddings.filter(w => {
            const label = coupleLabel(w).toLowerCase()
            const email = (w.ownerEmail || '').toLowerCase()
            return label.includes(q) || email.includes(q)
        })
    }, [weddings, searchQuery])

    // ── Sort ──
    const sorted = useMemo(() => {
        if (!sort.key) return filtered
        return [...filtered].sort((a, b) => {
            let valA, valB
            if (sort.key === 'date') {
                valA = a.weddingDate ? new Date(a.weddingDate).getTime() : 0
                valB = b.weddingDate ? new Date(b.weddingDate).getTime() : 0
            } else if (sort.key === 'couple') {
                valA = coupleLabel(a).toLowerCase()
                valB = coupleLabel(b).toLowerCase()
            } else if (sort.key === 'greetings') {
                valA = a.greetingsCount ?? 0
                valB = b.greetingsCount ?? 0
            }
            if (valA < valB) return sort.dir === 'asc' ? -1 : 1
            if (valA > valB) return sort.dir === 'asc' ? 1 : -1
            return 0
        })
    }, [filtered, sort])

    const handleSort = useCallback((newSort) => {
        setSort(newSort.key ? newSort : { key: null, dir: null })
    }, [])

    // ── Stats config ──
    const stats = [
        {
            icon: Heart,
            label: 'סך חתונות',
            value: weddings.length,
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-600',
        },
        {
            icon: MessageCircle,
            label: 'סך ברכות',
            value: totalGreetings,
            iconBg: 'bg-pink-100',
            iconColor: 'text-pink-600',
        },
        {
            icon: Zap,
            label: 'חתונות היום',
            value: todayCount,
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            pulse: todayCount > 0,
        },
        {
            icon: CalendarDays,
            label: 'חתונות קרובות',
            value: upcomingCount,
            iconBg: 'bg-indigo-100',
            iconColor: 'text-indigo-600',
        },
    ]

    return (
        <div
            className='min-h-screen py-10 px-4 sm:px-10 bg-gradient-to-br from-purple-50 via-white to-purple-100'
            dir='rtl'
        >
            {/* Ambient orbs */}
            <div className='fixed -top-24 left-10 h-72 w-72 rounded-full bg-purple-300/30 blur-3xl pointer-events-none' />
            <div className='fixed bottom-10 right-10 h-80 w-80 rounded-full bg-pink-300/30 blur-3xl pointer-events-none' />

            <div className='max-w-7xl mx-auto relative'>

                {/* ── Page Header ── */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className='flex items-center justify-between mb-8'
                >
                    <div className='flex items-center gap-4'>
                        <div className='relative'>
                            <div className='w-13 h-13 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200 p-3'>
                                <Crown size={22} className='text-white' />
                            </div>
                            <div className='absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse' />
                        </div>
                        <div>
                            <h1 className='text-2xl font-black text-gray-900 leading-tight tracking-tight'>
                                Command Center
                            </h1>
                            <p className='text-sm text-gray-400 mt-0.5 flex items-center gap-1.5'>
                                <Sparkles size={12} className='text-purple-400' />
                                Wedding Tales — Super Admin
                            </p>
                        </div>
                    </div>

                    {/* Live indicator */}
                    <div className='hidden sm:flex items-center gap-2 bg-white/80 border border-purple-100 rounded-full px-4 py-2 backdrop-blur-sm shadow-sm'>
                        <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
                        <span className='text-gray-500 text-xs font-medium'>Live</span>
                    </div>
                </motion.div>

                {/* ── Stat Cards ── */}
                {status === 'ok' && (
                    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
                        {stats.map((s, i) => (
                            <motion.div key={s.label} transition={{ delay: 0.05 * i }}>
                                <StatCard {...s} />
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* ── Main Card ── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className='rounded-2xl border border-purple-100 overflow-hidden bg-white/90 backdrop-blur-md shadow-lg'
                >
                    {/* Card header */}
                    <div className='px-6 py-4 border-b border-purple-100 bg-white/70 flex flex-col sm:flex-row sm:items-center gap-3'>
                        <div className='flex items-center gap-3 flex-1'>
                            <div className='w-2 h-2 rounded-full bg-gradient-to-r from-pink-400 to-purple-500' />
                            <h2 className='font-bold text-gray-700 text-sm tracking-wide'>כל החתונות</h2>
                            {status === 'ok' && (
                                <span className='text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-3 py-0.5 font-semibold'>
                                    {sorted.length} רשומות
                                </span>
                            )}
                        </div>

                        {status === 'ok' && (
                            <div className='w-full sm:w-72'>
                                <SearchBar value={searchQuery} onChange={setSearchQuery} />
                            </div>
                        )}
                    </div>

                    {/* Sort ribbon */}
                    {sort.key && status === 'ok' && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className='px-6 py-2 border-b border-purple-50 bg-purple-50/50 flex items-center gap-2'
                        >
                            <ArrowUpDown size={11} className='text-purple-400' />
                            <span className='text-xs text-purple-500'>
                                מיון לפי {sort.key === 'date' ? 'תאריך' : sort.key === 'couple' ? 'שם זוג' : 'ברכות'}
                                {' '}({sort.dir === 'asc' ? 'עולה' : 'יורד'})
                            </span>
                            <button
                                onClick={() => setSort({ key: null, dir: null })}
                                className='mr-auto text-xs text-gray-400 hover:text-gray-600 transition-colors'
                            >
                                נקה ✕
                            </button>
                        </motion.div>
                    )}

                    {/* Body */}
                    {status === 'loading' && <LoadingState />}
                    {status === 'error' && <ErrorState message={error} />}
                    {status === 'ok' && <WeddingsTable weddings={sorted} sort={sort} onSort={handleSort} />}
                </motion.div>

                {/* Footer */}
                <p className='text-center text-xs text-gray-300 mt-8'>
                    גישה מוגבלת לאדמין בלבד • Wedding Tales Command Center
                </p>
            </div>
        </div>
    )
}

export default function AdminPage() {
    return (
        <AdminPageWrapper>
            <AdminDashboardContent />
        </AdminPageWrapper>
    )
}
