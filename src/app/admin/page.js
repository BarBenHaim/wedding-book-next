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

// ─── Sub-components ───────────────────────────────────────────────────────────
function CountBadge({ count }) {
    return (
        <span className='inline-flex items-center justify-center w-8 h-8 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold'>
            {count ?? 0}
        </span>
    )
}

function ActionButton({ href, icon: Icon, label, variant = 'primary' }) {
    const base =
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap'
    const styles = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow',
        secondary:
            'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm',
    }
    return (
        <a href={href} target='_blank' rel='noopener noreferrer' className={`${base} ${styles[variant]}`}>
            <Icon size={13} />
            {label}
        </a>
    )
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingState() {
    return (
        <div className='flex flex-col items-center justify-center py-32 gap-4'>
            <Loader2 size={36} className='text-indigo-500 animate-spin' />
            <p className='text-gray-500 text-sm'>טוען חתונות...</p>
        </div>
    )
}

// ─── Error ────────────────────────────────────────────────────────────────────
function ErrorState({ message }) {
    return (
        <div className='flex flex-col items-center justify-center py-32 gap-3'>
            <AlertCircle size={36} className='text-red-400' />
            <p className='text-gray-700 font-medium'>שגיאה בטעינת הנתונים</p>
            <p className='text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg border border-red-100'>
                {message}
            </p>
        </div>
    )
}

// ─── Empty ────────────────────────────────────────────────────────────────────
function EmptyState() {
    return (
        <div className='flex flex-col items-center justify-center py-32 gap-3 text-gray-400'>
            <Users size={40} />
            <p>אין חתונות בטבלה עדיין.</p>
        </div>
    )
}

// ─── Main Table ───────────────────────────────────────────────────────────────
function WeddingsTable({ weddings }) {
    if (weddings.length === 0) return <EmptyState />

    return (
        <div className='overflow-x-auto'>
            <table className='w-full text-sm text-right'>
                <thead>
                    <tr className='border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400'>
                        <th className='px-5 py-3 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <Users size={13} /> זוג
                            </span>
                        </th>
                        <th className='px-5 py-3 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <CalendarDays size={13} /> תאריך
                            </span>
                        </th>
                        <th className='px-5 py-3 font-semibold text-center'>
                            <span className='flex items-center gap-1.5 justify-center'>
                                <MessageCircle size={13} /> ברכות
                            </span>
                        </th>
                        <th className='px-5 py-3 font-semibold'>
                            <span className='flex items-center gap-1.5 justify-end'>
                                <Hash size={13} /> הזמנה
                            </span>
                        </th>
                        <th className='px-5 py-3 font-semibold text-center'>פעולות</th>
                    </tr>
                </thead>
                <tbody className='divide-y divide-gray-50'>
                    {weddings.map(w => (
                        <tr
                            key={w.id}
                            className='hover:bg-indigo-50/40 transition-colors duration-100 group'
                        >
                            {/* Couple */}
                            <td className='px-5 py-4'>
                                <div className='font-medium text-gray-800'>{coupleLabel(w)}</div>
                                {w.ownerEmail && (w.brideName || w.groomName) && (
                                    <div className='text-xs text-gray-400 mt-0.5'>{w.ownerEmail}</div>
                                )}
                            </td>

                            {/* Date */}
                            <td className='px-5 py-4 text-gray-600 whitespace-nowrap'>
                                {formatDate(w.weddingDate)}
                            </td>

                            {/* Greetings */}
                            <td className='px-5 py-4 text-center'>
                                <CountBadge count={w.greetingsCount} />
                            </td>

                            {/* Order ID */}
                            <td className='px-5 py-4 text-gray-600'>
                                {w.orderId ? (
                                    <span className='font-mono text-xs bg-gray-100 px-2 py-1 rounded'>
                                        #{w.orderId}
                                    </span>
                                ) : (
                                    <span className='text-gray-400 italic text-xs'>Manual</span>
                                )}
                            </td>

                            {/* Actions */}
                            <td className='px-5 py-4'>
                                <div className='flex items-center justify-center gap-2 flex-wrap'>
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

// ─── Page ─────────────────────────────────────────────────────────────────────
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

    return (
        <div className='min-h-screen bg-gray-50 py-10 px-4 sm:px-8' dir='rtl'>
            <div className='max-w-7xl mx-auto'>

                {/* ── Header ── */}
                <div className='flex items-center justify-between mb-8'>
                    <div className='flex items-center gap-3'>
                        <div className='p-2.5 bg-indigo-600 rounded-xl shadow-md shadow-indigo-200'>
                            <Crown size={22} className='text-white' />
                        </div>
                        <div>
                            <h1 className='text-2xl font-bold text-gray-900 leading-tight'>
                                Super Admin
                            </h1>
                            <p className='text-sm text-gray-500'>Wedding Tales — ניהול מלא</p>
                        </div>
                    </div>

                    {status === 'ok' && (
                        <div className='flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm'>
                            <span className='text-gray-500 text-sm'>סך הכל חתונות</span>
                            <span className='text-lg font-bold text-indigo-600'>
                                {weddings.length}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Card ── */}
                <div className='bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden'>

                    {/* Card header strip */}
                    <div className='px-5 py-4 border-b border-gray-100 flex items-center justify-between'>
                        <h2 className='font-semibold text-gray-700 text-sm'>כל החתונות</h2>
                        {status === 'ok' && (
                            <span className='text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full px-3 py-0.5 font-medium'>
                                {weddings.length} רשומות
                            </span>
                        )}
                    </div>

                    {/* Body */}
                    {status === 'loading' && <LoadingState />}
                    {status === 'error' && <ErrorState message={error} />}
                    {status === 'ok' && <WeddingsTable weddings={weddings} />}
                </div>

                {/* Footer note */}
                <p className='text-center text-xs text-gray-400 mt-6'>
                    גישה זו מוגבלת לאדמין בלבד • Wedding Tales
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
