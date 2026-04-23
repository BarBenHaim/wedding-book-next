'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { motion, AnimatePresence } from 'framer-motion'
import {
    CalendarDays, Settings2, ExternalLink, Crown, Users, Hash,
    MessageCircle, AlertCircle, Loader2, Heart, Sparkles, Search,
    ChevronUp, ChevronDown, ChevronsUpDown, Zap, ArrowUpDown,
    CheckCircle2, Trash2, KeyRound, Download, Database, X,
    ChevronRight, Eye, Link2, Mail, Shield, HardDrive, RefreshCw,
    AlertTriangle, Copy, Clock, Printer, Package, Truck, UserPlus,
    Pencil, Save, PartyPopper,
} from 'lucide-react'
import {
    EVENT_TYPE_ORDER,
    getEventConfig,
    normalizeEventType,
    fieldsForType,
    THEME_COLOR_ORDER,
    THEME_COLORS,
    resolveThemeColorId,
} from '@/lib/eventTypes'

// ─── Data Fetching ────────────────────────────────────────────────────────────
async function getToken() {
    return getIdToken(auth.currentUser)
}

async function fetchAllWeddings() {
    const token = await getToken()
    const res = await fetch('/api/admin/weddings', {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
}

async function deleteWedding(weddingId) {
    const token = await getToken()
    const res = await fetch('/api/admin/weddings', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed')
    return res.json()
}

async function updateWedding(weddingId, patch) {
    const token = await getToken()
    const res = await fetch('/api/admin/weddings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId, patch }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Update failed')
    return res.json()
}

async function resetPassword(email) {
    const token = await getToken()
    const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Reset failed')
    return res.json()
}

async function checkLuluStatus(printJobId) {
    const token = await getToken()
    const res = await fetch(`/api/lulu/status?printJobId=${printJobId}`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
}

async function listLuluJobs() {
    const token = await getToken()
    const res = await fetch('/api/lulu/status?all=true', {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
    return res.json()
}

async function downloadBackup() {
    const token = await getToken()
    const res = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Backup failed')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `wedding-tales-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(a.href)
}

async function createUser(data) {
    const token = await getToken()
    const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Create failed')
    return res.json()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoString) {
    if (!isoString) return '—'
    try { return new Date(isoString).toLocaleDateString('he-IL') } catch { return isoString }
}

function coupleLabel(w) {
    if (w.brideName || w.groomName) return [w.brideName, w.groomName].filter(Boolean).join(' & ')
    return w.ownerEmail || '—'
}

function getWeddingStatus(d) {
    if (!d) return 'unknown'
    const today = new Date(); today.setHours(0,0,0,0)
    const date = new Date(d); date.setHours(0,0,0,0)
    const diff = date - today
    return diff === 0 ? 'today' : diff > 0 ? 'upcoming' : 'past'
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
    const colors = type === 'success'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-red-50 border-red-200 text-red-700'
    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl border shadow-lg text-sm font-semibold ${colors}`}
        >
            {message}
        </motion.div>
    )
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onSubmit }) {
    const [form, setForm] = useState({ email: '', displayName: '', brideName: '', groomName: '', weddingDate: '' })
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

    const canSubmit = form.email.trim().length > 0

    return (
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className='fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm' onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className='fixed inset-0 z-[91] flex items-center justify-center pointer-events-none'
            >
                <div className='bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl pointer-events-auto' dir='rtl' onClick={e => e.stopPropagation()}>
                    <div className='flex items-center gap-3 mb-5'>
                        <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-[#AA8840] to-[#c9a44e] flex items-center justify-center'>
                            <UserPlus size={20} className='text-white' />
                        </div>
                        <div>
                            <h3 className='font-bold text-gray-800'>יצירת משתמש חדש</h3>
                            <p className='text-xs text-gray-400'>המשתמש יקבל מייל עם פרטי גישה</p>
                        </div>
                        <button onClick={onClose} className='mr-auto text-gray-300 hover:text-gray-500 transition-colors'>
                            <X size={18} />
                        </button>
                    </div>

                    <div className='space-y-3'>
                        <div>
                            <label className='text-xs font-semibold text-gray-500 mb-1 block'>אימייל *</label>
                            <input type='email' value={form.email} onChange={e => set('email', e.target.value)}
                                placeholder='email@example.com' dir='ltr'
                                className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם מלא (אופציונלי)</label>
                            <input type='text' value={form.displayName} onChange={e => set('displayName', e.target.value)}
                                placeholder='ישראל ישראלי'
                                className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                        <div className='grid grid-cols-2 gap-3'>
                            <div>
                                <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם כלה</label>
                                <input type='text' value={form.brideName} onChange={e => set('brideName', e.target.value)}
                                    placeholder='נועה'
                                    className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                            </div>
                            <div>
                                <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם חתן</label>
                                <input type='text' value={form.groomName} onChange={e => set('groomName', e.target.value)}
                                    placeholder='אלון'
                                    className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                            </div>
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-gray-500 mb-1 block'>תאריך חתונה</label>
                            <input type='date' value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)}
                                className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                    </div>

                    <div className='mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200/60'>
                        <p className='text-xs text-amber-700 leading-relaxed'>
                            <b>שים לב:</b> אם המשתמש כבר קיים במערכת, תיווצר לו חתונה חדשה עם הסיסמה הקיימת שלו. אם זה משתמש חדש — תיווצר סיסמה אוטומטית ותישלח למייל.
                        </p>
                    </div>

                    <div className='flex gap-2 justify-end mt-5'>
                        <button onClick={onClose} className='px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 rounded-xl transition-colors'>ביטול</button>
                        <button
                            onClick={() => canSubmit && onSubmit(form)}
                            disabled={!canSubmit}
                            className='px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#AA8840] to-[#c9a44e] hover:brightness-110 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed'
                        >
                            צור משתמש ושלח מייל
                        </button>
                    </div>
                </div>
            </motion.div>
        </>
    )
}

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
    return (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm' onClick={onCancel}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className='bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl' dir='rtl'
                onClick={e => e.stopPropagation()}
            >
                <div className='flex items-start gap-3 mb-4'>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100' : 'bg-[#AA8840]/10'}`}>
                        {danger ? <AlertTriangle size={20} className='text-red-500' /> : <KeyRound size={20} className='text-[#AA8840]' />}
                    </div>
                    <div>
                        <h3 className='font-bold text-gray-800'>{title}</h3>
                        <p className='text-sm text-gray-500 mt-1'>{message}</p>
                    </div>
                </div>
                <div className='flex gap-2 justify-end'>
                    <button onClick={onCancel} className='px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg'>ביטול</button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-bold text-white rounded-lg ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#AA8840] hover:bg-[#96773a]'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, iconBg, iconColor, pulse = false }) {
    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className='relative overflow-hidden rounded-2xl p-5 bg-white/90 backdrop-blur-md border border-[#AA8840]/15 shadow-md'
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
            <div className='flex items-start justify-between'>
                <div>
                    <p className='text-gray-400 text-xs font-medium tracking-widest uppercase mb-2'>{label}</p>
                    <p className='text-3xl font-black text-gray-800 leading-none'>{value}</p>
                </div>
                <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    {pulse && <div className={`absolute inset-0 rounded-xl animate-ping opacity-30 ${iconBg}`} />}
                    <Icon size={20} className={`${iconColor} relative z-10`} />
                </div>
            </div>
        </motion.div>
    )
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ weddingDate }) {
    const s = getWeddingStatus(weddingDate)
    if (s === 'today') return <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200'><span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />היום</span>
    if (s === 'upcoming') return <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200'><span className='w-1.5 h-1.5 rounded-full bg-indigo-400' />עתידית</span>
    if (s === 'past') return <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200'><CheckCircle2 size={10} />עברה</span>
    return <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200'>—</span>
}

// ─── Greetings Badge ─────────────────────────────────────────────────────────
function GreetingsBadge({ count }) {
    const n = count ?? 0
    if (n === 0) return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-gray-100 text-gray-400 border border-gray-200'>{n}</span>
    if (n < 10) return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-blue-50 text-blue-600 border border-blue-200'>{n}</span>
    return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'>{n}</span>
}

// ─── Print Status Badge ─────────────────────────────────────────────────────
function PrintBadge({ printOrder }) {
    if (!printOrder) return <span className='text-gray-300 text-xs'>—</span>
    return (
        <span className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200'>
            <Printer size={10} /> הוזמן
        </span>
    )
}

// ─── Sortable Header ─────────────────────────────────────────────────────────
function SortableHeader({ children, sortKey, currentSort, onSort, justify = 'end' }) {
    const isActive = currentSort.key === sortKey
    const handleClick = () => {
        if (!isActive) onSort({ key: sortKey, dir: 'asc' })
        else if (currentSort.dir === 'asc') onSort({ key: sortKey, dir: 'desc' })
        else onSort({ key: null, dir: null })
    }
    return (
        <th onClick={handleClick}
            className={`px-6 py-4 font-semibold cursor-pointer select-none transition-colors hover:text-gray-700 ${isActive ? 'text-[#AA8840]' : 'text-gray-400'}`}>
            <span className={`flex items-center gap-1.5 ${justify === 'center' ? 'justify-center' : justify === 'start' ? 'justify-start' : 'justify-end'}`}>
                {children}
                {isActive && currentSort.dir === 'asc' && <ChevronUp size={13} className='text-[#AA8840]' />}
                {isActive && currentSort.dir === 'desc' && <ChevronDown size={13} className='text-[#AA8840]' />}
                {!isActive && <ChevronsUpDown size={12} className='text-gray-300' />}
            </span>
        </th>
    )
}

// ─── Event-Type Editor (inside the detail panel) ─────────────────────────────
function EventTypeEditor({ wedding, onSave }) {
    // Seed the draft from the wedding doc. `themeColor` is the EXPLICIT pick
    // (null when inheriting from the event type); `effectiveTheme` is what the
    // picker should show as selected — either the explicit pick or the event
    // type's default.
    const buildDraft = w => ({
        eventType: normalizeEventType(w.eventType),
        themeColor: w.themeColor || null,
        brideName: w.brideName || '',
        groomName: w.groomName || '',
        celebrantName: w.celebrantName || '',
        age: w.age ?? '',
        customTitle: w.customTitle || '',
        customSubtitle: w.customSubtitle || '',
    })

    const [draft, setDraft] = useState(() => buildDraft(wedding))
    const [showAdvanced, setShowAdvanced] = useState(
        Boolean(wedding.customTitle || wedding.customSubtitle)
    )
    const [saving, setSaving] = useState(false)

    // Reset draft whenever the panel swaps to a different wedding.
    useEffect(() => {
        setDraft(buildDraft(wedding))
        setShowAdvanced(Boolean(wedding.customTitle || wedding.customSubtitle))
    }, [wedding.id]) // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setDraft(prev => ({ ...prev, [k]: v }))

    const typeFields = fieldsForType(draft.eventType)
    const showBrideGroom = typeFields.includes('brideName')
    const showCelebrant = typeFields.includes('celebrantName')
    const showAge = typeFields.includes('age')

    // Build the PATCH body: only keys relevant to the current event type,
    // plus overrides. We always send eventType + themeColor so changes persist.
    function buildPatch() {
        const patch = {
            eventType: draft.eventType,
            themeColor: draft.themeColor, // null → server stores null = inherit
        }
        if (showBrideGroom) {
            patch.brideName = draft.brideName
            patch.groomName = draft.groomName
        }
        if (showCelebrant) patch.celebrantName = draft.celebrantName
        if (showAge) patch.age = draft.age === '' ? null : draft.age
        // Always include overrides so clearing them also persists.
        patch.customTitle = draft.customTitle
        patch.customSubtitle = draft.customSubtitle
        return patch
    }

    async function handleSave() {
        if (saving) return
        setSaving(true)
        try {
            await onSave(wedding.id, buildPatch())
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className='px-6 py-4 border-t border-gray-100'>
            <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3 inline-flex items-center gap-1.5'>
                <Pencil size={10} /> עריכת פרטי אירוע
            </p>

            {/* Event type dropdown */}
            <div className='mb-3'>
                <label className='text-xs font-semibold text-gray-500 mb-1 block'>סוג האירוע</label>
                <select
                    value={draft.eventType}
                    onChange={e => set('eventType', e.target.value)}
                    className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                >
                    {EVENT_TYPE_ORDER.map(t => (
                        <option key={t} value={t}>{getEventConfig(t).hebrewLabel}</option>
                    ))}
                </select>
            </div>

            {/* Theme color picker — 3 swatches; independent of event type */}
            <div className='mb-3'>
                <div className='flex items-center justify-between mb-1'>
                    <label className='text-xs font-semibold text-gray-500'>צבע העיצוב</label>
                    {draft.themeColor && (
                        <button
                            type='button'
                            onClick={() => set('themeColor', null)}
                            className='text-[11px] text-gray-400 hover:text-[#AA8840] transition-colors'
                            title='חזור לברירת מחדל לפי סוג האירוע'
                        >
                            ברירת מחדל
                        </button>
                    )}
                </div>
                <div className='grid grid-cols-3 gap-2'>
                    {THEME_COLOR_ORDER.map(id => {
                        const t = THEME_COLORS[id]
                        const effective = resolveThemeColorId(draft) // honors draft.themeColor + eventType default
                        const isSelected = effective === id
                        const isExplicit = draft.themeColor === id
                        return (
                            <button
                                key={id}
                                type='button'
                                onClick={() => set('themeColor', id)}
                                className={`group relative rounded-xl border-2 p-2.5 flex flex-col items-center gap-1.5 transition-all ${
                                    isSelected
                                        ? 'border-[#AA8840] bg-[#AA8840]/5 shadow-sm'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                                title={isExplicit ? `${t.label} (נבחר)` : t.label}
                            >
                                <div
                                    className='w-8 h-8 rounded-full shadow-inner'
                                    style={{ background: t.swatch, border: '1px solid rgba(0,0,0,0.08)' }}
                                />
                                <span className={`text-[11px] font-semibold ${isSelected ? 'text-[#AA8840]' : 'text-gray-500'}`}>
                                    {t.label}
                                </span>
                                {isSelected && !isExplicit && (
                                    <span className='absolute top-1 left-1 text-[9px] text-gray-300'>ברירת מחדל</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Type-specific name fields */}
            {showBrideGroom && (
                <div className='grid grid-cols-2 gap-3 mb-3'>
                    <div>
                        <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם כלה</label>
                        <input
                            type='text' value={draft.brideName}
                            onChange={e => set('brideName', e.target.value)}
                            placeholder='נועה'
                            className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                        />
                    </div>
                    <div>
                        <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם חתן</label>
                        <input
                            type='text' value={draft.groomName}
                            onChange={e => set('groomName', e.target.value)}
                            placeholder='אלון'
                            className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                        />
                    </div>
                </div>
            )}

            {showCelebrant && (
                <div className={`grid gap-3 mb-3 ${showAge ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1'}`}>
                    <div>
                        <label className='text-xs font-semibold text-gray-500 mb-1 block'>שם החוגג/ת</label>
                        <input
                            type='text' value={draft.celebrantName}
                            onChange={e => set('celebrantName', e.target.value)}
                            placeholder='סבתא תקווה'
                            className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                        />
                    </div>
                    {showAge && (
                        <div>
                            <label className='text-xs font-semibold text-gray-500 mb-1 block'>גיל</label>
                            <input
                                type='number' min={0} max={140} value={draft.age}
                                onChange={e => set('age', e.target.value)}
                                placeholder='78'
                                className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Advanced overrides */}
            <button
                type='button'
                onClick={() => setShowAdvanced(s => !s)}
                className='text-xs text-[#AA8840] hover:underline mb-2'
            >
                {showAdvanced ? '− הסתר עקיפות כותרת' : '+ עקיפות כותרת (מתקדם)'}
            </button>

            {showAdvanced && (
                <div className='space-y-3 mb-3 p-3 rounded-xl bg-[#AA8840]/5 border border-[#AA8840]/15'>
                    <p className='text-[11px] text-gray-500 leading-relaxed'>
                        במקום הכותרת שנבנית אוטומטית — הכנס טקסט חופשי. ריק = שימוש בברירת מחדל לפי סוג האירוע.
                    </p>
                    <div>
                        <label className='text-xs font-semibold text-gray-500 mb-1 block'>כותרת ראשית (customTitle)</label>
                        <input
                            type='text' value={draft.customTitle}
                            onChange={e => set('customTitle', e.target.value)}
                            placeholder='למשל: יום הולדת 78 לסבתא תקווה'
                            className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                        />
                    </div>
                    <div>
                        <label className='text-xs font-semibold text-gray-500 mb-1 block'>תת-כותרת (customSubtitle)</label>
                        <input
                            type='text' value={draft.customSubtitle}
                            onChange={e => set('customSubtitle', e.target.value)}
                            placeholder='למשל: מסיבת הפתעה של המשפחה'
                            className='w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                        />
                    </div>
                </div>
            )}

            <button
                onClick={handleSave}
                disabled={saving}
                className='w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-[#AA8840] to-[#c9a44e] text-white text-sm font-bold hover:brightness-110 transition-all shadow-sm disabled:opacity-50'
            >
                {saving ? <Loader2 size={14} className='animate-spin' /> : <Save size={14} />}
                {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
        </div>
    )
}

// ─── Wedding Detail Panel (Database Explorer) ────────────────────────────────
function WeddingDetailPanel({ wedding, onClose, onDelete, onResetPassword, onCheckLuluStatus, onSaveEdit }) {
    if (!wedding) return null

    const evCfg = getEventConfig(wedding.eventType)

    const fields = [
        { label: 'מזהה חתונה', value: wedding.id, icon: Hash, mono: true },
        { label: 'Slug', value: wedding.slug || '—', icon: Link2, mono: true },
        { label: 'סוג אירוע', value: evCfg.hebrewLabel, icon: PartyPopper },
        ...(normalizeEventType(wedding.eventType) === 'wedding'
            ? [
                  { label: 'שם כלה', value: wedding.brideName || '—', icon: Heart },
                  { label: 'שם חתן', value: wedding.groomName || '—', icon: Heart },
              ]
            : [
                  { label: 'שם החוגג/ת', value: wedding.celebrantName || '—', icon: Heart },
                  ...(normalizeEventType(wedding.eventType) === 'birthday'
                      ? [{ label: 'גיל', value: wedding.age != null ? String(wedding.age) : '—', icon: Hash }]
                      : []),
              ]),
        { label: 'תאריך האירוע', value: formatDate(wedding.weddingDate), icon: CalendarDays },
        { label: 'אימייל בעלים', value: wedding.ownerEmail || '—', icon: Mail },
        { label: 'מזהה בעלים (UID)', value: wedding.ownerId || '—', icon: Shield, mono: true },
        { label: 'מזהה הזמנה', value: wedding.orderId ? `#${wedding.orderId}` : '—', icon: Hash, mono: true },
        { label: 'סה"כ ברכות', value: String(wedding.greetingsCount ?? 0), icon: MessageCircle },
        { label: 'נוצר בתאריך', value: wedding.createdAt ? formatDate(wedding.createdAt) : '—', icon: Clock },
        { label: 'סטטוס הדפסה', value: wedding.printOrder ? 'הוזמן' : 'לא הוזמן', icon: Printer },
    ]

    const po = wedding.printOrder

    return (
        <motion.div
            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}
            className='fixed top-0 left-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[80] overflow-y-auto border-r border-[#AA8840]/15'
            dir='rtl'
        >
            {/* Header */}
            <div className='sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[#AA8840]/15 px-6 py-4 flex items-center justify-between z-10'>
                <div className='flex items-center gap-3'>
                    <div className='w-9 h-9 rounded-xl bg-gradient-to-br from-[#AA8840] to-[#c9a44e] flex items-center justify-center'>
                        <Database size={16} className='text-white' />
                    </div>
                    <div>
                        <h3 className='font-bold text-gray-800 text-sm'>פרטי חתונה</h3>
                        <p className='text-xs text-gray-400'>{coupleLabel(wedding)}</p>
                    </div>
                </div>
                <button onClick={onClose} className='w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors'>
                    <X size={16} className='text-gray-500' />
                </button>
            </div>

            {/* Status */}
            <div className='px-6 py-4 border-b border-gray-100'>
                <StatusBadge weddingDate={wedding.weddingDate} />
            </div>

            {/* Fields (visual DB) */}
            <div className='px-6 py-4 space-y-1'>
                <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>Firestore Document</p>
                {fields.map(f => (
                    <div key={f.label} className='flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 group'>
                        <f.icon size={14} className='text-gray-300 flex-shrink-0' />
                        <div className='flex-1 min-w-0'>
                            <p className='text-[10px] text-gray-400 uppercase tracking-wider'>{f.label}</p>
                            <p className={`text-sm text-gray-800 truncate ${f.mono ? 'font-mono text-xs' : 'font-medium'}`}>
                                {f.value}
                            </p>
                        </div>
                        {f.value !== '—' && (
                            <button
                                onClick={() => navigator.clipboard.writeText(f.value)}
                                className='opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-all'
                                title='העתק'
                            >
                                <Copy size={11} className='text-gray-400' />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Event-type editor */}
            <EventTypeEditor wedding={wedding} onSave={onSaveEdit} />

            {/* Recommendations */}
            <div className='px-6 py-4 border-t border-gray-100'>
                <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>המלצות</p>
                <div className='space-y-2'>
                    {!wedding.brideName && !wedding.groomName && (
                        <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl'>
                            <AlertTriangle size={14} className='text-amber-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-amber-700'>חסרים שמות הזוג — כנראה הזוג עדיין לא נכנס לפורטל</p>
                        </div>
                    )}
                    {!wedding.weddingDate && (
                        <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl'>
                            <AlertTriangle size={14} className='text-amber-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-amber-700'>לא הוגדר תאריך חתונה</p>
                        </div>
                    )}
                    {!wedding.slug && (
                        <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl'>
                            <AlertTriangle size={14} className='text-amber-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-amber-700'>אין slug — הקישור הקצר לא יעבוד. ייווצר אוטומטית כשהזוג ייכנס לפורטל</p>
                        </div>
                    )}
                    {(wedding.greetingsCount ?? 0) === 0 && (
                        <div className='flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl'>
                            <MessageCircle size={14} className='text-blue-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-blue-700'>אין ברכות עדיין — כדאי לוודא שהזוג שיתף את הלינק</p>
                        </div>
                    )}
                    {getWeddingStatus(wedding.weddingDate) === 'past' && (wedding.greetingsCount ?? 0) === 0 && (
                        <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl'>
                            <Trash2 size={14} className='text-red-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-red-700'>חתונה שעברה ללא ברכות — מומלץ למחוק</p>
                        </div>
                    )}
                    {getWeddingStatus(wedding.weddingDate) !== 'past' && (wedding.greetingsCount ?? 0) > 0 && wedding.brideName && (
                        <div className='flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl'>
                            <CheckCircle2 size={14} className='text-emerald-500 mt-0.5 flex-shrink-0' />
                            <p className='text-xs text-emerald-700'>הכל נראה תקין — החתונה פעילה עם ברכות</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Print Order Details */}
            {po && (
                <div className='px-6 py-4 border-t border-gray-100'>
                    <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>
                        <span className='inline-flex items-center gap-1.5'><Package size={10} /> הזמנת הדפסה</span>
                    </p>
                    <div className='bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2'>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-gray-500'>מזהה Lulu</span>
                            <span className='text-xs font-mono bg-white px-2 py-0.5 rounded border border-emerald-200'>{po.printJobId}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-gray-500'>סטטוס</span>
                            <span className='text-xs font-bold text-emerald-700'>{po.luluStatus}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-gray-500'>תאריך הזמנה</span>
                            <span className='text-xs text-gray-700'>{po.orderedAt ? new Date(po.orderedAt).toLocaleString('he-IL') : '—'}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-gray-500'>עמודים</span>
                            <span className='text-xs text-gray-700'>{po.pageCount}</span>
                        </div>
                        {po.estimatedCost && (
                            <div className='flex items-center justify-between'>
                                <span className='text-xs text-gray-500'>עלות משוערת</span>
                                <span className='text-xs font-bold text-[#AA8840]'>{po.estimatedCost} {po.currency}</span>
                            </div>
                        )}
                        <hr className='border-emerald-200' />
                        <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold pt-1'>
                            <span className='inline-flex items-center gap-1'><Truck size={9} /> משלוח אל</span>
                        </p>
                        <div className='text-xs text-gray-700 space-y-0.5'>
                            <p>{po.shippingAddress?.name}</p>
                            <p>{po.shippingAddress?.street1}{po.shippingAddress?.street2 ? `, ${po.shippingAddress.street2}` : ''}</p>
                            <p>{po.shippingAddress?.city} {po.shippingAddress?.postcode}</p>
                            <p>{po.shippingAddress?.countryCode}</p>
                            {po.shippingAddress?.phone && <p>טלפון: {po.shippingAddress.phone}</p>}
                        </div>
                        <hr className='border-emerald-200' />
                        <div className='flex gap-2 pt-1'>
                            {po.contentUrl && (
                                <a href={po.contentUrl} target='_blank' rel='noreferrer'
                                    className='flex-1 text-center text-xs py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors font-medium'>
                                    תוכן PDF
                                </a>
                            )}
                            {po.coverUrl && (
                                <a href={po.coverUrl} target='_blank' rel='noreferrer'
                                    className='flex-1 text-center text-xs py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors font-medium'>
                                    כריכה PDF
                                </a>
                            )}
                        </div>
                        {po.printJobId && (
                            <button
                                onClick={() => onCheckLuluStatus(po.printJobId)}
                                className='w-full text-center text-xs py-2 mt-1 rounded-lg bg-[#AA8840]/10 border border-[#AA8840]/20 text-[#AA8840] hover:bg-[#AA8840]/20 transition-colors font-bold flex items-center justify-center gap-1.5'>
                                <RefreshCw size={11} /> בדוק סטטוס ב-Lulu
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Links */}
            <div className='px-6 py-4 border-t border-gray-100'>
                <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>קישורים מהירים</p>
                <div className='grid grid-cols-2 gap-2'>
                    <a href={`/wedding/${wedding.id}/admin`} target='_blank' rel='noreferrer'
                        className='flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-600'>
                        <Settings2 size={14} className='text-[#AA8840]' /> ניהול ברכות
                    </a>
                    <a href={`/wedding/${wedding.id}/portal`} target='_blank' rel='noreferrer'
                        className='flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-600'>
                        <Link2 size={14} className='text-[#AA8840]' /> פורטל
                    </a>
                    <a href={`/wedding/${wedding.id}/viewer`} target='_blank' rel='noreferrer'
                        className='flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-600'>
                        <Eye size={14} className='text-[#AA8840]' /> עיצוב הספר
                    </a>
                    <a href={`/wedding/${wedding.id}`} target='_blank' rel='noreferrer'
                        className='flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-600'>
                        <ExternalLink size={14} className='text-[#AA8840]' /> דף האורחים
                    </a>
                </div>
            </div>

            {/* Download PDFs (Lulu-compliant) */}
            {/*
                Opens the viewer in a new tab with ?autoExport=<formatId> so
                the viewer generates the content + cover PDFs at the chosen
                format's dimensions and downloads them to the admin's
                computer. Does NOT touch the shipped "Send to Lulu" flow.
            */}
            <div className='px-6 py-4 border-t border-gray-100'>
                <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>הורדת PDF לפי פורמט Lulu</p>
                <div className='space-y-2'>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=classic`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-700'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>קלאסי — כריכה רכה 8.5"</div>
                            <div className='text-[11px] text-gray-400'>Perfect Bound · מה שנשלח כרגע ללולו</div>
                        </div>
                    </a>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=hardcover`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-700'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>כריכה קשה 8.5" (Case Wrap)</div>
                            <div className='text-[11px] text-gray-400'>Hardcover עם הדפסה מלאה + wrap margins</div>
                        </div>
                    </a>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=booklet`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-[#AA8840]/5 border border-gray-100 hover:border-[#AA8840]/20 transition-all text-sm font-medium text-gray-700'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>ספרון (Saddle Stitch)</div>
                            <div className='text-[11px] text-gray-400'>עד 24 עמודים · 17.25" × 8.75" · בלי שדרה</div>
                        </div>
                    </a>
                </div>
            </div>

            {/* Actions */}
            <div className='px-6 py-4 border-t border-gray-100 space-y-2'>
                <p className='text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3'>פעולות</p>
                {wedding.ownerEmail && (
                    <button onClick={() => onResetPassword(wedding.ownerEmail)}
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-[#AA8840]/5 border border-[#AA8840]/15 hover:bg-[#AA8840]/10 transition-all text-sm font-semibold text-[#AA8840]'>
                        <KeyRound size={16} /> שלח איפוס סיסמה ל-{wedding.ownerEmail}
                    </button>
                )}
                <button onClick={() => onDelete(wedding)}
                    className='w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 transition-all text-sm font-semibold text-red-600'>
                    <Trash2 size={16} /> מחק חתונה לצמיתות
                </button>
            </div>

            <div className='h-8' />
        </motion.div>
    )
}

// ─── Main Content ────────────────────────────────────────────────────────────
function AdminDashboardContent() {
    const [weddings, setWeddings] = useState([])
    const [status, setStatus] = useState('loading')
    const [error, setError] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sort, setSort] = useState({ key: 'date', dir: 'asc' })
    const [selectedWedding, setSelectedWedding] = useState(null)
    const [modal, setModal] = useState(null)
    const [toast, setToast] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [showCreateUser, setShowCreateUser] = useState(false)

    const loadWeddings = useCallback(() => {
        setStatus('loading')
        fetchAllWeddings()
            .then(data => { setWeddings(data); setStatus('ok') })
            .catch(err => { setError(err.message); setStatus('error') })
    }, [])

    useEffect(() => { loadWeddings() }, [loadWeddings])

    // Stats
    const totalGreetings = weddings.reduce((sum, w) => sum + (w.greetingsCount ?? 0), 0)
    const todayCount = weddings.filter(w => getWeddingStatus(w.weddingDate) === 'today').length
    const upcomingCount = weddings.filter(w => getWeddingStatus(w.weddingDate) === 'upcoming').length

    // Filter + Sort
    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return weddings
        const q = searchQuery.toLowerCase().trim()
        return weddings.filter(w =>
            coupleLabel(w).toLowerCase().includes(q) || (w.ownerEmail || '').toLowerCase().includes(q) || (w.orderId || '').includes(q) || (w.id || '').includes(q)
        )
    }, [weddings, searchQuery])

    const sorted = useMemo(() => {
        if (!sort.key) return filtered
        return [...filtered].sort((a, b) => {
            let vA, vB
            if (sort.key === 'date') { vA = a.weddingDate ? new Date(a.weddingDate).getTime() : 0; vB = b.weddingDate ? new Date(b.weddingDate).getTime() : 0 }
            else if (sort.key === 'couple') { vA = coupleLabel(a).toLowerCase(); vB = coupleLabel(b).toLowerCase() }
            else if (sort.key === 'greetings') { vA = a.greetingsCount ?? 0; vB = b.greetingsCount ?? 0 }
            return vA < vB ? (sort.dir === 'asc' ? -1 : 1) : vA > vB ? (sort.dir === 'asc' ? 1 : -1) : 0
        })
    }, [filtered, sort])

    // ─── Actions ──
    function handleDeleteWedding(wedding) {
        setModal({
            title: 'מחיקת חתונה',
            message: `האם אתה בטוח שרוצה למחוק את החתונה של ${coupleLabel(wedding)}? הפעולה תמחק את כל הברכות (${wedding.greetingsCount ?? 0}) ולא ניתנת לביטול.`,
            confirmLabel: 'מחק לצמיתות',
            danger: true,
            onConfirm: async () => {
                setModal(null)
                setActionLoading(true)
                try {
                    await deleteWedding(wedding.id)
                    setWeddings(prev => prev.filter(w => w.id !== wedding.id))
                    setSelectedWedding(null)
                    setToast({ message: `החתונה של ${coupleLabel(wedding)} נמחקה בהצלחה`, type: 'success' })
                } catch (err) {
                    setToast({ message: `שגיאה: ${err.message}`, type: 'error' })
                } finally {
                    setActionLoading(false)
                }
            },
        })
    }

    function handleResetPassword(email) {
        setModal({
            title: 'איפוס סיסמה',
            message: `סיסמה חדשה תיווצר ותישלח למייל ${email}. האם להמשיך?`,
            confirmLabel: 'שלח סיסמה חדשה',
            danger: false,
            onConfirm: async () => {
                setModal(null)
                setActionLoading(true)
                try {
                    await resetPassword(email)
                    setToast({ message: `סיסמה חדשה נשלחה ל-${email}`, type: 'success' })
                } catch (err) {
                    setToast({ message: `שגיאה: ${err.message}`, type: 'error' })
                } finally {
                    setActionLoading(false)
                }
            },
        })
    }

    async function handleSaveEdit(weddingId, patch) {
        setActionLoading(true)
        try {
            const { updated } = await updateWedding(weddingId, patch)
            // Merge the update into local state so the UI reflects it immediately
            // without a full refetch.
            setWeddings(prev => prev.map(w => (w.id === weddingId ? { ...w, ...updated } : w)))
            setSelectedWedding(prev => (prev && prev.id === weddingId ? { ...prev, ...updated } : prev))
            setToast({ message: 'הפרטים נשמרו בהצלחה', type: 'success' })
        } catch (err) {
            setToast({ message: `שגיאה בשמירה: ${err.message}`, type: 'error' })
        } finally {
            setActionLoading(false)
        }
    }

    async function handleCheckLuluStatus(printJobId) {
        setActionLoading(true)
        try {
            const result = await checkLuluStatus(printJobId)
            const statusMsg = [
                `סטטוס: ${result.status}`,
                result.trackingUrls?.length ? `מעקב: ${result.trackingUrls.join(', ')}` : null,
                result.costs ? `עלות: ${result.costs.total_cost_incl_tax} ${result.costs.currency}` : null,
                result.statusMessages?.length ? `הודעות: ${result.statusMessages.join('; ')}` : null,
            ].filter(Boolean).join('\n')
            setToast({ message: `Lulu #${printJobId}: ${result.status}`, type: 'success' })
            alert(`פרטי הזמנה #${printJobId}:\n\n${statusMsg}`)
        } catch (err) {
            setToast({ message: `שגיאה בבדיקת סטטוס: ${err.message}`, type: 'error' })
        } finally {
            setActionLoading(false)
        }
    }

    async function handleBackup() {
        setActionLoading(true)
        try {
            await downloadBackup()
            setToast({ message: 'גיבוי הורד בהצלחה', type: 'success' })
        } catch (err) {
            setToast({ message: `שגיאה בגיבוי: ${err.message}`, type: 'error' })
        } finally {
            setActionLoading(false)
        }
    }

    async function handleCreateUser(formData) {
        setShowCreateUser(false)
        setActionLoading(true)
        try {
            const result = await createUser(formData)
            setToast({
                message: result.isNewUser
                    ? `משתמש חדש נוצר ומייל נשלח ל-${result.email}`
                    : `חתונה חדשה נוצרה למשתמש קיים ${result.email}`,
                type: 'success',
            })
            loadWeddings()
        } catch (err) {
            setToast({ message: `שגיאה ביצירת משתמש: ${err.message}`, type: 'error' })
        } finally {
            setActionLoading(false)
        }
    }

    const stats = [
        { icon: Heart, label: 'סך חתונות', value: weddings.length, iconBg: 'bg-[#AA8840]/10', iconColor: 'text-[#AA8840]' },
        { icon: MessageCircle, label: 'סך ברכות', value: totalGreetings, iconBg: 'bg-[#c9a44e]/10', iconColor: 'text-[#c9a44e]' },
        { icon: Zap, label: 'חתונות היום', value: todayCount, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', pulse: todayCount > 0 },
        { icon: CalendarDays, label: 'חתונות קרובות', value: upcomingCount, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' },
    ]

    return (
        <div className='min-h-screen py-10 px-4 sm:px-10 bg-gradient-to-br from-[#F5F5F5] via-[#f0ebe3] to-[#ebe5da]' dir='rtl'>
            {/* Toast */}
            <AnimatePresence>{toast && <Toast {...toast} onClose={() => setToast(null)} />}</AnimatePresence>

            {/* Confirm Modal */}
            {modal && <ConfirmModal {...modal} onCancel={() => setModal(null)} />}

            {/* Create User Modal */}
            <AnimatePresence>
                {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onSubmit={handleCreateUser} />}
            </AnimatePresence>

            {/* Detail Panel Overlay */}
            <AnimatePresence>
                {selectedWedding && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className='fixed inset-0 bg-black/30 z-[70]' onClick={() => setSelectedWedding(null)} />
                        <WeddingDetailPanel
                            wedding={selectedWedding}
                            onClose={() => setSelectedWedding(null)}
                            onDelete={handleDeleteWedding}
                            onResetPassword={handleResetPassword}
                            onCheckLuluStatus={handleCheckLuluStatus}
                            onSaveEdit={handleSaveEdit}
                        />
                    </>
                )}
            </AnimatePresence>

            {/* Loading overlay */}
            {actionLoading && (
                <div className='fixed inset-0 z-[95] flex items-center justify-center bg-black/20 backdrop-blur-sm'>
                    <Loader2 size={32} className='text-[#AA8840] animate-spin' />
                </div>
            )}

            {/* Ambient orbs */}
            <div className='fixed -top-24 left-10 h-72 w-72 rounded-full bg-[#AA8840]/8 blur-3xl pointer-events-none' />
            <div className='fixed bottom-10 right-10 h-80 w-80 rounded-full bg-[#AA8840]/6 blur-3xl pointer-events-none' />

            <div className='max-w-7xl mx-auto relative'>

                {/* Page Header */}
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className='flex items-center justify-between mb-8'>
                    <div className='flex items-center gap-4'>
                        <div className='relative'>
                            <div className='w-13 h-13 rounded-2xl bg-gradient-to-br from-[#AA8840] to-[#c9a44e] flex items-center justify-center shadow-lg shadow-[#AA8840]/20 p-3'>
                                <Crown size={22} className='text-white' />
                            </div>
                            <div className='absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse' />
                        </div>
                        <div>
                            <h1 className='text-2xl font-black text-gray-900 leading-tight tracking-tight'>Command Center</h1>
                            <p className='text-sm text-gray-400 mt-0.5 flex items-center gap-1.5'>
                                <Sparkles size={12} className='text-[#AA8840]' /> Wedding Tales — Super Admin
                            </p>
                        </div>
                    </div>

                    {/* Top Actions */}
                    <div className='flex items-center gap-2'>
                        <button onClick={() => setShowCreateUser(true)} title='יצירת משתמש חדש'
                            className='hidden sm:flex items-center gap-2 bg-gradient-to-r from-[#AA8840] to-[#c9a44e] rounded-xl px-4 py-2.5 shadow-sm hover:shadow-md hover:brightness-110 transition-all text-sm font-medium text-white'>
                            <UserPlus size={14} /> משתמש חדש
                        </button>
                        <button onClick={handleBackup} title='הורד גיבוי JSON'
                            className='hidden sm:flex items-center gap-2 bg-white/80 border border-[#AA8840]/15 rounded-xl px-4 py-2.5 backdrop-blur-sm shadow-sm hover:bg-white hover:border-[#AA8840]/30 transition-all text-sm font-medium text-gray-600'>
                            <HardDrive size={14} className='text-[#AA8840]' /> גיבוי
                        </button>
                        <button onClick={loadWeddings} title='רענן נתונים'
                            className='w-10 h-10 rounded-xl bg-white/80 border border-[#AA8840]/15 flex items-center justify-center backdrop-blur-sm shadow-sm hover:bg-white transition-all'>
                            <RefreshCw size={15} className='text-gray-500' />
                        </button>
                        <div className='hidden sm:flex items-center gap-2 bg-white/80 border border-[#AA8840]/15 rounded-full px-4 py-2 backdrop-blur-sm shadow-sm'>
                            <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
                            <span className='text-gray-500 text-xs font-medium'>Live</span>
                        </div>
                    </div>
                </motion.div>

                {/* Stat Cards */}
                {status === 'ok' && (
                    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
                        {stats.map((s, i) => <motion.div key={s.label} transition={{ delay: 0.05 * i }}><StatCard {...s} /></motion.div>)}
                    </div>
                )}

                {/* Mobile action buttons */}
                <div className='sm:hidden mb-4 flex gap-2'>
                    <button onClick={() => setShowCreateUser(true)}
                        className='flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#AA8840] to-[#c9a44e] rounded-xl px-4 py-3 shadow-sm text-sm font-medium text-white'>
                        <UserPlus size={14} /> משתמש חדש
                    </button>
                    <button onClick={handleBackup}
                        className='flex-1 flex items-center justify-center gap-2 bg-white/80 border border-[#AA8840]/15 rounded-xl px-4 py-3 shadow-sm text-sm font-medium text-gray-600'>
                        <HardDrive size={14} className='text-[#AA8840]' /> גיבוי
                    </button>
                </div>

                {/* Main Table Card */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className='rounded-2xl border border-[#AA8840]/15 overflow-hidden bg-white/90 backdrop-blur-md shadow-lg'>

                    {/* Card header */}
                    <div className='px-6 py-4 border-b border-[#AA8840]/15 bg-white/70 flex flex-col sm:flex-row sm:items-center gap-3'>
                        <div className='flex items-center gap-3 flex-1'>
                            <div className='w-2 h-2 rounded-full bg-gradient-to-r from-[#AA8840] to-[#c9a44e]' />
                            <h2 className='font-bold text-gray-700 text-sm tracking-wide'>כל החתונות</h2>
                            {status === 'ok' && (
                                <span className='text-xs bg-[#AA8840]/10 text-[#AA8840] border border-[#AA8840]/20 rounded-full px-3 py-0.5 font-semibold'>
                                    {sorted.length} רשומות
                                </span>
                            )}
                        </div>
                        {status === 'ok' && (
                            <div className='w-full sm:w-72 relative' dir='rtl'>
                                <Search size={15} className='absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none' />
                                <input type='text' value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder='חיפוש לפי שם, אימייל, מזהה...'
                                    className='w-full pr-10 pl-4 py-2.5 rounded-xl text-sm text-gray-700 placeholder:text-gray-400 outline-none transition-all border border-[#AA8840]/20 bg-[#AA8840]/5 focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10' />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')}
                                        className='absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs'>✕</button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sort ribbon */}
                    {sort.key && status === 'ok' && (
                        <div className='px-6 py-2 border-b border-[#AA8840]/10 bg-[#AA8840]/5 flex items-center gap-2'>
                            <ArrowUpDown size={11} className='text-[#AA8840]/60' />
                            <span className='text-xs text-[#AA8840]'>
                                מיון לפי {sort.key === 'date' ? 'תאריך' : sort.key === 'couple' ? 'שם זוג' : 'ברכות'}
                                {' '}({sort.dir === 'asc' ? 'עולה' : 'יורד'})
                            </span>
                            <button onClick={() => setSort({ key: null, dir: null })} className='mr-auto text-xs text-gray-400 hover:text-gray-600'>נקה ✕</button>
                        </div>
                    )}

                    {/* Body */}
                    {status === 'loading' && (
                        <div className='flex flex-col items-center justify-center py-40 gap-5'>
                            <div className='relative'>
                                <div className='w-16 h-16 rounded-full bg-gradient-to-br from-[#AA8840] to-[#c9a44e] opacity-20 animate-ping absolute inset-0' />
                                <div className='w-16 h-16 rounded-full bg-gradient-to-br from-[#AA8840] to-[#c9a44e] flex items-center justify-center relative'>
                                    <Loader2 size={28} className='text-white animate-spin' />
                                </div>
                            </div>
                            <p className='text-gray-400 text-sm'>טוען חתונות...</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className='flex flex-col items-center justify-center py-40 gap-4'>
                            <div className='w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center'>
                                <AlertCircle size={28} className='text-red-500' />
                            </div>
                            <p className='text-gray-800 font-semibold'>שגיאה בטעינת הנתונים</p>
                            <p className='text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl'>{error}</p>
                        </div>
                    )}
                    {status === 'ok' && sorted.length === 0 && (
                        <div className='flex flex-col items-center justify-center py-40 gap-4'>
                            <div className='w-14 h-14 rounded-2xl bg-[#AA8840]/10 flex items-center justify-center'>
                                <Heart size={28} className='text-[#AA8840]' />
                            </div>
                            <p className='text-gray-400 text-sm'>אין חתונות בטבלה עדיין.</p>
                        </div>
                    )}
                    {status === 'ok' && sorted.length > 0 && (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-sm text-right' style={{ minWidth: '880px' }}>
                                <thead>
                                    <tr className='border-b border-[#AA8840]/15 text-[11px] uppercase tracking-widest bg-[#AA8840]/5'>
                                        <th className='px-6 py-4 text-gray-300 font-semibold w-12'>#</th>
                                        <SortableHeader sortKey='couple' currentSort={sort} onSort={setSort}><Users size={11} /> זוג</SortableHeader>
                                        <SortableHeader sortKey='date' currentSort={sort} onSort={setSort}><CalendarDays size={11} /> תאריך</SortableHeader>
                                        <th className='px-6 py-4 font-semibold text-gray-400 text-center'>סטטוס</th>
                                        <SortableHeader sortKey='greetings' currentSort={sort} onSort={setSort} justify='center'><MessageCircle size={11} /> ברכות</SortableHeader>
                                        <th className='px-6 py-4 font-semibold text-gray-400 text-center'><span className='flex items-center gap-1.5 justify-center'><Printer size={11} /> הדפסה</span></th>
                                        <th className='px-6 py-4 font-semibold text-gray-400'><span className='flex items-center gap-1.5 justify-end'><Hash size={11} /> הזמנה</span></th>
                                        <th className='px-6 py-4 font-semibold text-gray-400 text-center'>פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-100'>
                                    {sorted.map((w, i) => (
                                        <tr key={w.id}
                                            onClick={() => setSelectedWedding(w)}
                                            className='group hover:bg-[#AA8840]/5 transition-colors cursor-pointer'>
                                            <td className='px-6 py-4'>
                                                <div className='w-7 h-7 rounded-full bg-[#AA8840]/10 flex items-center justify-center text-[#AA8840]/60 text-xs font-bold group-hover:bg-[#AA8840]/20 transition-colors'>
                                                    {i + 1}
                                                </div>
                                            </td>
                                            <td className='px-6 py-4'>
                                                <div className='text-right'>
                                                    <div className='font-semibold text-gray-800'>{coupleLabel(w)}</div>
                                                    {w.ownerEmail && (w.brideName || w.groomName) && <div className='text-xs text-gray-400 mt-0.5'>{w.ownerEmail}</div>}
                                                </div>
                                            </td>
                                            <td className='px-6 py-4 text-gray-500 whitespace-nowrap text-sm tabular-nums'>{formatDate(w.weddingDate)}</td>
                                            <td className='px-6 py-4 text-center'><StatusBadge weddingDate={w.weddingDate} /></td>
                                            <td className='px-6 py-4 text-center'><GreetingsBadge count={w.greetingsCount} /></td>
                                            <td className='px-6 py-4 text-center'><PrintBadge printOrder={w.printOrder} /></td>
                                            <td className='px-6 py-4 text-right'>
                                                {w.orderId
                                                    ? <span className='font-mono text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg border border-gray-200'>#{w.orderId}</span>
                                                    : <span className='text-gray-300 italic text-xs'>Manual</span>}
                                            </td>
                                            <td className='px-6 py-4'>
                                                <div className='flex items-center justify-center gap-1' onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => setSelectedWedding(w)} title='פתח פרטים'
                                                        className='w-8 h-8 rounded-lg bg-[#AA8840]/10 border border-[#AA8840]/20 text-[#AA8840] hover:bg-[#AA8840]/20 flex items-center justify-center transition-all'>
                                                        <Database size={13} />
                                                    </button>
                                                    {w.ownerEmail && (
                                                        <button onClick={() => handleResetPassword(w.ownerEmail)} title='איפוס סיסמה'
                                                            className='w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:text-[#AA8840] hover:bg-[#AA8840]/5 flex items-center justify-center transition-all'>
                                                            <KeyRound size={13} />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDeleteWedding(w)} title='מחק חתונה'
                                                        className='w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-all'>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>

                <p className='text-center text-xs text-gray-300 mt-8'>גישה מוגבלת לאדמין בלבד • Wedding Tales Command Center</p>
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
