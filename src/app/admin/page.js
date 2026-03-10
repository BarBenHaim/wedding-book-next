'use client'

import { useEffect, useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
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
            <p className='text-white/60 text-sm tracking-wide'>טוען חתונות...</p>
        </div>
    )
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorState({ message }) {
    return (
        <div className='flex flex-col items-center justify-center py-40 gap-4'>
            <div className='w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center'>
                <AlertCircle size={28} className='text-red-300' />
            </div>
            <p className='text-white/80 font-semibold'>שגיאה בטעינת הנתונים</p>
            <p className='text-sm text-red-300/80 bg-red-500/10 border border-red-400/20 px-4 py-2 rounded-xl'>
                {message}
            </p>
        </div>
    )
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyState() {
    return (
        <div className='flex flex-col items-center justify-center py-40 gap-4'>
            <div className='w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center'>
                <Heart size={28} className='text-pink-300' />
            </div>
            <p className='text-white/50 text-sm'>אין חתונות בטבלה עדיין.</p>
        </div>
    )
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionButton({ href, icon: Icon, label, variant = 'primary' }) {
    const base =
        'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap backdrop-blur-sm'
    const styles = {
        primary:
            'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.04]',
        secondary:
            'bg-white/10 text-white/80 border border-white/20 hover:bg-white/20 hover:text-white hover:scale-[1.04]',
    }
    return (
        <a href={href} target='_blank' rel='noopener noreferrer' className={`${base} ${styles[variant]}`}>
            <Icon size={12} />
            {label}
        </a>
    )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, gradient }) {
    return (
        <div className={`relative overflow-hidden rounded-2xl p-5 ${gradient} border border-white/10`}>
            <div className='absolute inset-0 bg-white/5' />
            <div className='relative flex items-center justify-between'>
                <div>
                    <p className='text-white/60 text-xs font-medium tracking-wide uppercase'>{label}</p>
                    <p className='text-3xl font-bold text-white mt-1'>{value}</p>
                </div>
                <div className='w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center'>
                    <Icon size={22} className='text-white' />
                </div>
            </div>
        </div>
    )
}

// ─── Greetings Badge ──────────────────────────────────────────────────────────
function GreetingsBadge({ count }) {
    const n = count ?? 0
    const color = n === 0
        ? 'bg-white/10 text-white/40'
        : n < 10
        ? 'bg-blue-500/20 text-blue-200'
        : 'bg-emerald-500/20 text-emerald-200'
    return (
        <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${color}`}>
            {n}
        </span>
    )
}

// ─── Main Table ───────────────────────────────────────────────────────────────
function WeddingsTable({ weddings }) {
    if (weddings.length === 0) return <EmptyState />

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
                {/* ── thead ── */}
                <thead>
                    <tr className='border-b border-white/10 text-[11px] uppercase tracking-widest text-white/40'>
                        <th className='px-6 py-4 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <Users size={12} /> זוג
                            </span>
                        </th>
                        <th className='px-6 py-4 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <CalendarDays size={12} /> תאריך
                            </span>
                        </th>
                        <th className='px-6 py-4 font-semibold text-center'>
                            <span className='flex items-center gap-1.5 justify-center'>
                                <MessageCircle size={12} /> ברכות
                            </span>
                        </th>
                        <th className='px-6 py-4 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <Hash size={12} /> הזמנה
                            </span>
                        </th>
                        <th className='px-6 py-4 font-semibold text-center'>פעולות</th>
                    </tr>
                </thead>

                {/* ── tbody ── */}
                <tbody>
                    {weddings.map((w, i) => (
                        <tr
                            key={w.id}
                            className='border-b border-white/5 hover:bg-white/5 transition-colors duration-150 group'
                        >
                            {/* Couple */}
                            <td className='px-6 py-5'>
                                <div className='flex items-center gap-3 justify-end'>
                                    <div className='text-right'>
                                        <div className='font-semibold text-white/90'>{coupleLabel(w)}</div>
                                        {w.ownerEmail && (w.brideName || w.groomName) && (
                                            <div className='text-xs text-white/35 mt-0.5'>{w.ownerEmail}</div>
                                        )}
                                    </div>
                                    <div className='w-9 h-9 rounded-full bg-gradient-to-br from-pink-400/30 to-violet-400/30 flex items-center justify-center shrink-0 text-white/50 text-xs font-bold border border-white/10'>
                                        {i + 1}
                                    </div>
                                </div>
                            </td>

                            {/* Date */}
                            <td className='px-6 py-5 text-white/60 whitespace-nowrap text-sm'>
                                {formatDate(w.weddingDate)}
                            </td>

                            {/* Greetings */}
                            <td className='px-6 py-5 text-center'>
                                <GreetingsBadge count={w.greetingsCount} />
                            </td>

                            {/* Order ID */}
                            <td className='px-6 py-5'>
                                {w.orderId ? (
                                    <span className='font-mono text-xs bg-white/10 text-white/60 px-2.5 py-1 rounded-lg border border-white/10'>
                                        #{w.orderId}
                                    </span>
                                ) : (
                                    <span className='text-white/25 italic text-xs'>Manual</span>
                                )}
                            </td>

                            {/* Actions */}
                            <td className='px-6 py-5'>
                                <div className='flex items-center justify-center gap-2'>
                                    <ActionButton
                                        href={`/wedding/${w.id}/admin`}
                                        icon={Settings2}
                                        label='נהל כזוג'
                                        variant='primary'
                                    />
                                    <ActionButton
                                        href={`/wedding/${w.id}`}
                                        icon={ExternalLink}
                                        label='אלבום'
                                        variant='secondary'
                                    />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ─── Page Content ─────────────────────────────────────────────────────────────
function AdminDashboardContent() {
    const [weddings, setWeddings] = useState([])
    const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'ok'
    const [error, setError] = useState(null)

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

    const totalGreetings = weddings.reduce((sum, w) => sum + (w.greetingsCount ?? 0), 0)

    return (
        <div
            className='min-h-screen py-10 px-4 sm:px-10'
            dir='rtl'
            style={{
                background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
            }}
        >
            {/* Ambient orbs */}
            <div className='fixed top-0 left-1/4 w-96 h-96 rounded-full bg-purple-600/20 blur-3xl pointer-events-none' />
            <div className='fixed bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-pink-600/15 blur-3xl pointer-events-none' />

            <div className='max-w-7xl mx-auto relative'>

                {/* ── Page Header ── */}
                <div className='flex items-center justify-between mb-10'>
                    <div className='flex items-center gap-4'>
                        <div className='relative'>
                            <div className='w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-xl shadow-violet-500/30'>
                                <Crown size={24} className='text-white' />
                            </div>
                            <div className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#302b63]' />
                        </div>
                        <div>
                            <h1 className='text-3xl font-bold text-white leading-tight tracking-tight'>
                                Command Center
                            </h1>
                            <p className='text-sm text-white/40 mt-0.5 flex items-center gap-1.5'>
                                <Sparkles size={12} className='text-purple-400' />
                                Wedding Tales — Super Admin
                            </p>
                        </div>
                    </div>

                    {/* Live indicator */}
                    <div className='hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 backdrop-blur-sm'>
                        <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
                        <span className='text-white/50 text-xs font-medium'>Live</span>
                    </div>
                </div>

                {/* ── Stat Cards ── */}
                {status === 'ok' && (
                    <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8'>
                        <StatCard
                            icon={Heart}
                            label='חתונות פעילות'
                            value={weddings.length}
                            gradient='bg-gradient-to-br from-violet-600/40 to-purple-800/40'
                        />
                        <StatCard
                            icon={MessageCircle}
                            label='סך ברכות'
                            value={totalGreetings}
                            gradient='bg-gradient-to-br from-pink-600/40 to-rose-800/40'
                        />
                        <StatCard
                            icon={CalendarDays}
                            label='עדכון אחרון'
                            value={new Date().toLocaleDateString('he-IL')}
                            gradient='bg-gradient-to-br from-indigo-600/40 to-blue-800/40'
                        />
                    </div>
                )}

                {/* ── Table Card ── */}
                <div
                    className='rounded-3xl border border-white/10 overflow-hidden'
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}
                >
                    {/* Card header */}
                    <div className='px-6 py-5 border-b border-white/10 flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                            <div className='w-2 h-2 rounded-full bg-gradient-to-r from-pink-400 to-violet-400' />
                            <h2 className='font-semibold text-white/80 text-sm tracking-wide'>כל החתונות</h2>
                        </div>
                        {status === 'ok' && (
                            <span className='text-xs bg-violet-500/20 text-violet-300 border border-violet-400/20 rounded-full px-3 py-1 font-semibold'>
                                {weddings.length} רשומות
                            </span>
                        )}
                    </div>

                    {/* Body */}
                    {status === 'loading' && <LoadingState />}
                    {status === 'error' && <ErrorState message={error} />}
                    {status === 'ok' && <WeddingsTable weddings={weddings} />}
                </div>

                {/* Footer */}
                <p className='text-center text-xs text-white/20 mt-8'>
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
