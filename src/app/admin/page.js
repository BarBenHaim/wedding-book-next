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
    Pencil, Save, PartyPopper, Wand2,
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
import { LOCALE_ORDER, LOCALES } from '@/i18n/locales'

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
                            <h3 className='font-bold text-[#1a1410]'>יצירת משתמש חדש</h3>
                            <p className='text-xs text-[#a89378]'>המשתמש יקבל מייל עם פרטי גישה</p>
                        </div>
                        <button onClick={onClose} className='mr-auto text-[#c4b9a4] hover:text-[#7a6a52] transition-colors'>
                            <X size={18} />
                        </button>
                    </div>

                    <div className='space-y-3'>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>אימייל *</label>
                            <input type='email' value={form.email} onChange={e => set('email', e.target.value)}
                                placeholder='email@example.com' dir='ltr'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם מלא (אופציונלי)</label>
                            <input type='text' value={form.displayName} onChange={e => set('displayName', e.target.value)}
                                placeholder='ישראל ישראלי'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                        <div className='grid grid-cols-2 gap-3'>
                            <div>
                                <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם כלה</label>
                                <input type='text' value={form.brideName} onChange={e => set('brideName', e.target.value)}
                                    placeholder='נועה'
                                    className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                            </div>
                            <div>
                                <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם חתן</label>
                                <input type='text' value={form.groomName} onChange={e => set('groomName', e.target.value)}
                                    placeholder='אלון'
                                    className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                            </div>
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>תאריך חתונה</label>
                            <input type='date' value={form.weddingDate} onChange={e => set('weddingDate', e.target.value)}
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all' />
                        </div>
                    </div>

                    <div className='mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200/60'>
                        <p className='text-xs text-amber-700 leading-relaxed'>
                            <b>שים לב:</b> אם המשתמש כבר קיים במערכת, תיווצר לו חתונה חדשה עם הסיסמה הקיימת שלו. אם זה משתמש חדש — תיווצר סיסמה אוטומטית ותישלח למייל.
                        </p>
                    </div>

                    <div className='flex gap-2 justify-end mt-5'>
                        <button onClick={onClose} className='px-4 py-2.5 text-sm text-[#7a6a52] hover:bg-[#fbf6ec] rounded-xl transition-colors'>ביטול</button>
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
                        <h3 className='font-bold text-[#1a1410]'>{title}</h3>
                        <p className='text-sm text-[#7a6a52] mt-1'>{message}</p>
                    </div>
                </div>
                <div className='flex gap-2 justify-end'>
                    <button onClick={onCancel} className='px-4 py-2 text-sm text-[#7a6a52] hover:bg-[#fbf6ec] rounded-lg'>ביטול</button>
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
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className='relative overflow-hidden rounded-2xl p-5'
            style={{
                background: '#ffffff',
                border: '1px solid rgba(212,184,103,0.22)',
                boxShadow:
                    '0 16px 32px -20px rgba(170,136,64,0.22), 0 2px 6px -2px rgba(170,136,64,0.08)',
            }}
        >
            {/* Soft gold accent line at the top edge — gives the card a
                subtle "premium card" stripe without dominating it. */}
            <div
                className='absolute top-0 left-0 right-0 h-[2px]'
                style={{ background: 'linear-gradient(90deg, transparent, rgba(201,164,78,0.45), transparent)' }}
            />
            <div className='flex items-start justify-between'>
                <div>
                    <p
                        className='mb-2'
                        style={{ color: '#a89378', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}
                    >
                        {label}
                    </p>
                    <p className='leading-none' style={{ color: '#1a1410', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                        {value}
                    </p>
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
    return <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-[#a89378] bg-[#f4ecd9] border border-[#ead9b3]'>—</span>
}

// ─── Greetings Badge ─────────────────────────────────────────────────────────
function GreetingsBadge({ count }) {
    const n = count ?? 0
    if (n === 0) return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-[#f4ecd9] text-[#a89378] border border-[#ead9b3]'>{n}</span>
    if (n < 10) return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-blue-50 text-blue-600 border border-blue-200'>{n}</span>
    return <span className='inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'>{n}</span>
}

// ─── Print Status Badge ─────────────────────────────────────────────────────
function PrintBadge({ printOrder }) {
    if (!printOrder) return <span className='text-[#c4b9a4] text-xs'>—</span>
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
            className={`px-6 py-4 font-semibold cursor-pointer select-none transition-colors hover:text-[#3d3225] ${isActive ? 'text-[#AA8840]' : 'text-[#a89378]'}`}>
            <span className={`flex items-center gap-1.5 ${justify === 'center' ? 'justify-center' : justify === 'start' ? 'justify-start' : 'justify-end'}`}>
                {children}
                {isActive && currentSort.dir === 'asc' && <ChevronUp size={13} className='text-[#AA8840]' />}
                {isActive && currentSort.dir === 'desc' && <ChevronDown size={13} className='text-[#AA8840]' />}
                {!isActive && <ChevronsUpDown size={12} className='text-[#c4b9a4]' />}
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
        // Visual design variant within an event type — wedding has
        // 'classic' (ivory premium, default) and 'romantic' (botanical
        // floral arch). Poker has 'kingdom' (felt + chips). Empty/null
        // falls back to the event type's default variant.
        designVariant: w.designVariant || '',
        // Interface language for the couple's portal + their guest page.
        // null/undefined falls back to Hebrew on the read side, matching
        // the legacy behavior for every wedding doc that predates i18n.
        locale: w.locale || 'he',
        themeColor: w.themeColor || null,
        brideName: w.brideName || '',
        brideNameHe: w.brideNameHe || '',
        groomName: w.groomName || '',
        groomNameHe: w.groomNameHe || '',
        celebrantName: w.celebrantName || '',
        celebrantNameHe: w.celebrantNameHe || '',
        age: w.age ?? '',
        customTitle: w.customTitle || '',
        customSubtitle: w.customSubtitle || '',
        customDescription: w.customDescription || '',
        // Form-field overrides — let the super-admin retitle the
        // blessing form fields per event ("Your blessing" → "Your story"
        // for travel; "Name" → "Player" for poker, etc). Empty → i18n
        // default for the event's locale.
        customNameLabel: w.customNameLabel || '',
        customNamePlaceholder: w.customNamePlaceholder || '',
        customBlessingLabel: w.customBlessingLabel || '',
        customBlessingPlaceholder: w.customBlessingPlaceholder || '',
    })

    const [draft, setDraft] = useState(() => buildDraft(wedding))
    const [saving, setSaving] = useState(false)

    // Reset draft whenever the panel swaps to a different wedding.
    useEffect(() => {
        setDraft(buildDraft(wedding))
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
            // Variant within an event type (e.g. wedding/classic vs
            // wedding/romantic). Empty string = use the type default.
            designVariant: draft.designVariant,
            locale: draft.locale,
            themeColor: draft.themeColor, // null → server stores null = inherit
        }
        if (showBrideGroom) {
            patch.brideName = draft.brideName
            patch.brideNameHe = draft.brideNameHe
            patch.groomName = draft.groomName
            patch.groomNameHe = draft.groomNameHe
        }
        if (showCelebrant) {
            patch.celebrantName = draft.celebrantName
            patch.celebrantNameHe = draft.celebrantNameHe
        }
        if (showAge) patch.age = draft.age === '' ? null : draft.age
        // Always include overrides so clearing them also persists.
        patch.customTitle = draft.customTitle
        patch.customSubtitle = draft.customSubtitle
        patch.customDescription = draft.customDescription
        patch.customNameLabel = draft.customNameLabel
        patch.customNamePlaceholder = draft.customNamePlaceholder
        patch.customBlessingLabel = draft.customBlessingLabel
        patch.customBlessingPlaceholder = draft.customBlessingPlaceholder
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
        <div className='px-6 py-4 border-t border-[#f0e8d4]'>
            <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3 inline-flex items-center gap-1.5'>
                <Pencil size={10} /> עריכת פרטי אירוע
            </p>

            {/* Event type dropdown */}
            <div className='mb-3'>
                <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>סוג האירוע</label>
                <select
                    value={draft.eventType}
                    onChange={e => set('eventType', e.target.value)}
                    className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                >
                    {EVENT_TYPE_ORDER.map(t => (
                        <option key={t} value={t}>{getEventConfig(t).hebrewLabel}</option>
                    ))}
                </select>
            </div>

            {/* Design variant — visual style within an event type. Wedding
                has two looks (classic ivory premium + romantic botanical
                arch); other types only have one for now so the dropdown
                is hidden until we add more. Empty value = use the type's
                default variant on the guest side. */}
            {draft.eventType === 'wedding' && (
                <div className='mb-3'>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>סגנון העיצוב</label>
                    <select
                        value={draft.designVariant || 'classic'}
                        onChange={e => set('designVariant', e.target.value === 'classic' ? '' : e.target.value)}
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    >
                        <option value='classic'>קלאסי — שמנת ושמפניה (ברירת מחדל)</option>
                        <option value='romantic'>רומנטי — עיצוב פרחוני</option>
                    </select>
                    <p className='text-[10px] text-[#a89378] mt-1 leading-relaxed'>
                        הסגנון משפיע רק על עמוד יצירת הברכה לאורחים — לא על הספר עצמו.
                    </p>
                </div>
            )}

            {/* Interface language — drives the language shown to the
                couple/celebrant in their portal AND to guests on the
                shared link. Defaults to Hebrew for legacy events. */}
            <div className='mb-3'>
                <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שפת ממשק</label>
                <select
                    value={draft.locale}
                    onChange={e => set('locale', e.target.value)}
                    className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                >
                    {LOCALE_ORDER.map(id => (
                        <option key={id} value={id}>{LOCALES[id].label}</option>
                    ))}
                </select>
                <p className='text-[10px] text-[#a89378] mt-1 leading-relaxed'>
                    השפה שתוצג למשתמש בעמוד הפורטל ולאורחים בעמוד השיתוף.
                </p>
            </div>

            {/* Theme color picker — 3 swatches; independent of event type */}
            <div className='mb-3'>
                <div className='flex items-center justify-between mb-1'>
                    <label className='text-xs font-semibold text-[#7a6a52]'>צבע העיצוב</label>
                    {draft.themeColor && (
                        <button
                            type='button'
                            onClick={() => set('themeColor', null)}
                            className='text-[11px] text-[#a89378] hover:text-[#AA8840] transition-colors'
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
                                        : 'border-[#ead9b3] hover:border-[#c9a44e]/60 bg-white'
                                }`}
                                title={isExplicit ? `${t.label} (נבחר)` : t.label}
                            >
                                <div
                                    className='w-8 h-8 rounded-full shadow-inner'
                                    style={{ background: t.swatch, border: '1px solid rgba(0,0,0,0.08)' }}
                                />
                                <span className={`text-[11px] font-semibold ${isSelected ? 'text-[#AA8840]' : 'text-[#7a6a52]'}`}>
                                    {t.label}
                                </span>
                                {isSelected && !isExplicit && (
                                    <span className='absolute top-1 left-1 text-[9px] text-[#c4b9a4]'>ברירת מחדל</span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Type-specific name fields. Each name has TWO inputs:
                the original (script-as-typed, used on the guest landing
                page where "Daniel & Amit" reads beautifully in Latin) and
                a Hebrew version (used inside the photo page's "השאירו
                ברכה ל..." headline so it reads as "השאירו ברכה לדניאל
                ועמית" without code-switching). The Hebrew field is
                optional — if blank, the photo page falls back to the
                original name. */}
            {showBrideGroom && (
                <>
                    <div className='grid grid-cols-2 gap-3 mb-3'>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם כלה</label>
                            <input
                                type='text' value={draft.brideName}
                                onChange={e => set('brideName', e.target.value)}
                                placeholder='Noa'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם חתן</label>
                            <input
                                type='text' value={draft.groomName}
                                onChange={e => set('groomName', e.target.value)}
                                placeholder='Alon'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                    </div>
                    <div className='grid grid-cols-2 gap-3 mb-3'>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם כלה בעברית</label>
                            <input
                                type='text' value={draft.brideNameHe}
                                onChange={e => set('brideNameHe', e.target.value)}
                                placeholder='נועה'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם חתן בעברית</label>
                            <input
                                type='text' value={draft.groomNameHe}
                                onChange={e => set('groomNameHe', e.target.value)}
                                placeholder='אלון'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                    </div>
                    <p className='text-[11px] text-[#a89378] mb-3 leading-relaxed'>
                        השם הראשון מופיע בעמוד הראשי של האורחים ("ספר הברכות של Noa & Alon"). הגרסה בעברית מופיעה בעמוד יצירת הברכה ("השאירו ברכה לנועה ולאלון"). אם תשאיר ריק — נשתמש בשם הראשון.
                    </p>
                </>
            )}

            {showCelebrant && (() => {
                // Same celebrantName field, different label/placeholder
                // per event type. Keeps the Firestore column count flat
                // and lets us add more event types later as data only.
                const celebrantLabel =
                    draft.eventType === 'poker' ? 'מיקום האירוע'
                    : draft.eventType === 'travel' ? 'שם המטייל'
                    : 'שם החוגג/ת'
                const celebrantPlaceholder =
                    draft.eventType === 'poker' ? 'הממלכה'
                    : draft.eventType === 'travel' ? 'דניאל'
                    : 'Tikva'
                return (
                <div className={`grid gap-3 mb-3 ${showAge ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1'}`}>
                    <div>
                        <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>{celebrantLabel}</label>
                        <input
                            type='text' value={draft.celebrantName}
                            onChange={e => set('celebrantName', e.target.value)}
                            placeholder={celebrantPlaceholder}
                            className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                        />
                    </div>
                    {showAge && (
                        <div>
                            <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>גיל</label>
                            <input
                                type='number' min={0} max={140} value={draft.age}
                                onChange={e => set('age', e.target.value)}
                                placeholder='78'
                                className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                            />
                        </div>
                    )}
                </div>
                )
            })()}

            {showCelebrant && draft.eventType !== 'poker' && draft.eventType !== 'travel' && (
                <div className='mb-3'>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>שם החוגג/ת בעברית</label>
                    <input
                        type='text' value={draft.celebrantNameHe}
                        onChange={e => set('celebrantNameHe', e.target.value)}
                        placeholder='תקווה'
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all'
                    />
                    <p className='text-[11px] text-[#a89378] mt-1.5 leading-relaxed'>
                        השם הראשון מופיע בעמוד הראשי של האורחים. הגרסה בעברית מופיעה בעמוד יצירת הברכה. ריק = נשתמש בשם הראשון.
                    </p>
                </div>
            )}

            {/* טקסטים בעמוד האורחים — מנוהל אך ורק על-ידי הסופר-אדמין.
                המשתמש בעמוד הפורטל לא רואה את השדות האלה כדי לא להציף
                אותו בבחירות. ריק בכל שדה => עמוד האורחים יחזור לברירת
                המחדל לפי סוג האירוע ב-eventTypes.js. */}
            <div className='space-y-3 mb-3 p-3 rounded-xl bg-[#AA8840]/5 border border-[#AA8840]/15'>
                <p className='text-[11px] font-bold text-[#AA8840] uppercase tracking-widest'>טקסטים בעמוד האורחים</p>
                <p className='text-[11px] text-[#7a6a52] leading-relaxed'>
                    מה שיופיע מעל השמות, ככותרת ראשית, וכפסקת תיאור בעמוד האורחים. השאר ריק = ברירת מחדל לפי סוג האירוע.
                </p>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>תת-כותרת (השורה הקטנה מעל השמות)</label>
                    <input
                        type='text' value={draft.customSubtitle}
                        onChange={e => set('customSubtitle', e.target.value)}
                        placeholder={getEventConfig(draft.eventType).subtitle}
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    />
                </div>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>כותרת ראשית (במקום השמות)</label>
                    <input
                        type='text' value={draft.customTitle}
                        onChange={e => set('customTitle', e.target.value)}
                        placeholder='למשל: יום הולדת 78 לסבתא תקווה'
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    />
                </div>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>תיאור (פסקה מתחת לכותרת)</label>
                    <textarea
                        value={draft.customDescription}
                        onChange={e => set('customDescription', e.target.value)}
                        placeholder={getEventConfig(draft.eventType).description}
                        rows={3}
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white resize-y'
                    />
                </div>
            </div>

            {/* Form-field overrides — separate block so it's clear these
                control the BLESSING FORM (where guests type), not the
                landing/cover. Useful for poker ("פירוט היד") or travel
                ("סיפור הרגע") where the default "הברכה שלכם" doesn't
                fit. Empty = i18n default in the event's locale. */}
            <div className='space-y-3 mb-3 p-3 rounded-xl bg-[#c9a44e]/5 border border-[#c9a44e]/15'>
                <p className='text-[11px] font-bold text-[#aa8840] uppercase tracking-widest'>טקסטים בטופס הברכה</p>
                <p className='text-[11px] text-[#7a6a52] leading-relaxed'>
                    שולט בטקסטים שהאורח רואה בטופס יצירת הברכה (השדות והרמזים). השאר ריק = ברירת מחדל לפי שפת האירוע.
                </p>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>תווית שדה השם</label>
                    <input
                        type='text' value={draft.customNameLabel}
                        onChange={e => set('customNameLabel', e.target.value)}
                        placeholder='שם (אופציונלי)'
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    />
                </div>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>Placeholder לשדה השם</label>
                    <input
                        type='text' value={draft.customNamePlaceholder}
                        onChange={e => set('customNamePlaceholder', e.target.value)}
                        placeholder='מי כותב/ת?'
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    />
                </div>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>תווית שדה הברכה</label>
                    <input
                        type='text' value={draft.customBlessingLabel}
                        onChange={e => set('customBlessingLabel', e.target.value)}
                        placeholder='הברכה שלכם'
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white'
                    />
                </div>
                <div>
                    <label className='text-xs font-semibold text-[#7a6a52] mb-1 block'>Placeholder לשדה הברכה</label>
                    <textarea
                        value={draft.customBlessingPlaceholder}
                        onChange={e => set('customBlessingPlaceholder', e.target.value)}
                        placeholder='כתבו משהו מרגש, מצחיק או מכל הלב...'
                        rows={2}
                        className='w-full px-3 py-2.5 rounded-xl border border-[#ead9b3] text-sm text-[#3d3225] outline-none focus:border-[#AA8840] focus:ring-2 focus:ring-[#AA8840]/10 transition-all bg-white resize-y'
                    />
                </div>
            </div>

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
// ─── Quick link row ──────────────────────────────────────────────────────────
// Single-line shortcut to a guest/couple-facing page for the currently
// selected wedding. target=_blank so the admin can flip back to the
// panel after previewing.
function QuickLink({ href, label, icon: Icon }) {
    return (
        <a
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className='flex items-center gap-2.5 px-3 py-2 rounded-lg group transition-all'
            style={{
                background: 'rgba(212,184,103,0.08)',
                border: '1px solid rgba(212,184,103,0.18)',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(212,184,103,0.16)'
                e.currentTarget.style.borderColor = 'rgba(212,184,103,0.40)'
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(212,184,103,0.08)'
                e.currentTarget.style.borderColor = 'rgba(212,184,103,0.18)'
            }}
        >
            <Icon size={13} style={{ color: '#a8843a' }} className='shrink-0' />
            <span className='flex-1 text-[12.5px] font-semibold' style={{ color: '#3d2e1a' }}>
                {label}
            </span>
            <ExternalLink size={11} style={{ color: '#a8843a', opacity: 0.6 }} className='shrink-0' />
        </a>
    )
}

// ─── Funnel view ─────────────────────────────────────────────────────────────
// Renders the scan → start → submit funnel for a single wedding using the
// stats payload returned by /api/admin/wedding-stats. Receives the stats
// + loading flag from its parent so the caller controls when to refetch.
function FunnelView({ stats, loading }) {
    if (loading && !stats) {
        return (
            <div className='flex items-center gap-2 text-xs text-[#a89378]'>
                <Loader2 size={12} className='animate-spin' />
                טוען נתונים…
            </div>
        )
    }
    if (!stats) {
        return <p className='text-xs text-[#a89378]'>אין נתונים זמינים.</p>
    }

    const { scans = 0, uniqueScans = 0, startedBlessing = 0, submitted = 0, recentScans = [] } = stats

    // Percentages relative to scans (the top of the funnel). When scans
    // is 0 we show "—" instead of NaN%.
    const pct = n => (scans > 0 ? Math.round((n / scans) * 100) + '%' : '—')

    const rows = [
        { label: 'סריקות סך הכל', value: scans, percent: '100%', barPercent: 100, color: '#AA8840' },
        { label: 'סריקות ייחודיות (IP)', value: uniqueScans, percent: pct(uniqueScans), barPercent: scans ? (uniqueScans / scans) * 100 : 0, color: '#c9a44e' },
        { label: 'התחילו לכתוב ברכה', value: startedBlessing, percent: pct(startedBlessing), barPercent: scans ? (startedBlessing / scans) * 100 : 0, color: '#d4b867' },
        { label: 'שלחו ברכה בפועל', value: submitted, percent: pct(submitted), barPercent: scans ? (submitted / scans) * 100 : 0, color: '#7da76a' },
    ]

    return (
        <div className='space-y-3'>
            {rows.map(r => (
                <div key={r.label}>
                    <div className='flex items-center justify-between mb-1'>
                        <span className='text-[11px] font-semibold text-[#5a4d3a]'>{r.label}</span>
                        <span className='text-xs font-bold text-[#1a1410]'>
                            {r.value} <span className='text-[10px] text-[#a89378] font-medium'>({r.percent})</span>
                        </span>
                    </div>
                    <div className='h-1.5 rounded-full bg-[#f4ecd9] overflow-hidden'>
                        <div
                            className='h-full rounded-full transition-all duration-500'
                            style={{ width: Math.min(100, r.barPercent) + '%', background: r.color }}
                        />
                    </div>
                </div>
            ))}

            {/* Recent activity */}
            {recentScans.length > 0 && (
                <div className='mt-5 pt-4 border-t border-[#f0e8d4]'>
                    <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-2'>פעילות אחרונה</p>
                    <div className='max-h-48 overflow-y-auto space-y-1.5 -mr-2 pr-2'>
                        {recentScans.slice(0, 20).map((s, i) => {
                            const ua = s.userAgent || ''
                            const device = /iPhone|iPad/i.test(ua)
                                ? 'iPhone'
                                : /Android/i.test(ua)
                                  ? 'Android'
                                  : /Windows|Mac/i.test(ua)
                                    ? 'Desktop'
                                    : '—'
                            const when = s.createdAt ? new Date(s.createdAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''
                            return (
                                <div key={i} className='flex items-center gap-2 text-[11px] text-[#7a6a52] py-1'>
                                    <span
                                        className='w-1.5 h-1.5 rounded-full flex-shrink-0'
                                        style={{ background: s.event === 'scan' ? '#AA8840' : '#7da76a' }}
                                    />
                                    <span className='font-mono text-[10px] text-[#a89378] flex-shrink-0'>{when}</span>
                                    <span className='truncate'>{s.event === 'scan' ? 'סריקה' : 'התחיל ברכה'} · {device}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

function WeddingDetailPanel({ wedding, onClose, onDelete, onResetPassword, onCheckLuluStatus, onSaveEdit }) {
    // ── Analytics state — funnel + recent scans pulled from
    //    /api/admin/wedding-stats. Loads fresh whenever the panel
    //    swaps to a different wedding. Hooks must be declared BEFORE
    //    the early-return below to keep React's hook order stable.
    const [stats, setStats] = useState(null)
    const [statsLoading, setStatsLoading] = useState(false)

    useEffect(() => {
        if (!wedding?.id) return
        let cancelled = false
        async function load() {
            setStatsLoading(true)
            try {
                const token = await getToken()
                const res = await fetch(`/api/admin/wedding-stats?weddingId=${wedding.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!res.ok) throw new Error('stats fetch failed')
                const data = await res.json()
                if (!cancelled) setStats(data)
            } catch (err) {
                console.warn('[admin] stats load failed:', err)
                if (!cancelled) setStats(null)
            } finally {
                if (!cancelled) setStatsLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [wedding?.id])

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
                        <h3 className='font-bold text-[#1a1410] text-sm'>פרטי חתונה</h3>
                        <p className='text-xs text-[#a89378]'>{coupleLabel(wedding)}</p>
                    </div>
                </div>
                <button onClick={onClose} className='w-9 h-9 rounded-xl bg-[#fbf6ec] hover:bg-[#f4ecd9] flex items-center justify-center transition-colors'>
                    <X size={16} className='text-[#7a6a52]' />
                </button>
            </div>

            {/* Status */}
            <div className='px-6 py-4 border-b border-[#f0e8d4]'>
                <StatusBadge weddingDate={wedding.weddingDate} />
            </div>

            {/* ── Quick Links ──
                Direct shortcuts to every guest- and couple-facing page
                for this wedding. Each opens in a new tab so the admin
                can preview without losing the panel. Especially useful
                for previewing event-specific themes (poker dark felt,
                wedding ivory premium, etc) — just open the photo page
                and the design will reflect the doc's current eventType. */}
            <div className='px-6 py-6'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>קישורים מהירים</p>
                <div className='space-y-1.5'>
                    <QuickLink href={`/wedding/${wedding.id}`} label='עמוד נחיתה (אורחים)' icon={Heart} />
                    <QuickLink href={`/wedding/${wedding.id}/photo`} label='עמוד יצירת ברכה' icon={Pencil} />
                    <QuickLink href={`/wedding/${wedding.id}/thanks`} label='עמוד תודה' icon={CheckCircle2} />
                    <QuickLink href={`/wedding/${wedding.id}/portal`} label='פורטל זוג / קוד QR' icon={Link2} />
                    <QuickLink href={`/wedding/${wedding.id}/viewer`} label='צפייה בספר' icon={Eye} />
                    <QuickLink href={`/wedding/${wedding.id}/admin`} label='ניהול ברכות (לזוג)' icon={Settings2} />
                    {wedding.slug && (
                        <QuickLink href={`/w/${wedding.slug}`} label={`קישור קצר (/${wedding.slug})`} icon={ExternalLink} />
                    )}
                </div>
            </div>

            {/* ── Funnel analytics ── */}
            <div className='px-6 py-5 border-b border-[#f0e8d4]'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>פאנל המרה</p>
                <FunnelView stats={stats} loading={statsLoading} />
            </div>

            {/* Fields (visual DB) */}
            <div className='px-6 py-4 space-y-1'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>מסמך Firestore</p>
                {fields.map(f => (
                    <div key={f.label} className='flex items-center gap-3 py-2.5 border-b border-[#f4ecd9] last:border-0 group'>
                        <f.icon size={14} className='text-[#c9a44e] flex-shrink-0' />
                        <div className='flex-1 min-w-0'>
                            <p className='text-[11px] text-[#a89378] uppercase tracking-wider font-medium'>{f.label}</p>
                            <p className={`text-sm text-[#1a1410] truncate ${f.mono ? 'font-mono text-xs' : 'font-medium'}`}>
                                {f.value}
                            </p>
                        </div>
                        {f.value !== '—' && (
                            <button
                                onClick={() => navigator.clipboard.writeText(f.value)}
                                className='opacity-50 group-hover:opacity-100 w-7 h-7 rounded-lg bg-[#fbf6ec] hover:bg-[#f4ecd9] border border-[#ead9b3] flex items-center justify-center transition-all'
                                title='העתק'
                            >
                                <Copy size={11} className='text-[#a8843a]' />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Event-type editor */}
            <EventTypeEditor wedding={wedding} onSave={onSaveEdit} />

            {/* Recommendations */}
            <div className='px-6 py-4 border-t border-[#f0e8d4]'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>המלצות</p>
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
                <div className='px-6 py-4 border-t border-[#f0e8d4]'>
                    <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>
                        <span className='inline-flex items-center gap-1.5'><Package size={10} /> הזמנת הדפסה</span>
                    </p>
                    <div className='bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2'>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-[#7a6a52]'>מזהה Lulu</span>
                            <span className='text-xs font-mono bg-white px-2 py-0.5 rounded border border-emerald-200'>{po.printJobId}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-[#7a6a52]'>סטטוס</span>
                            <span className='text-xs font-bold text-emerald-700'>{po.luluStatus}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-[#7a6a52]'>תאריך הזמנה</span>
                            <span className='text-xs text-[#3d3225]'>{po.orderedAt ? new Date(po.orderedAt).toLocaleString('he-IL') : '—'}</span>
                        </div>
                        <div className='flex items-center justify-between'>
                            <span className='text-xs text-[#7a6a52]'>עמודים</span>
                            <span className='text-xs text-[#3d3225]'>{po.pageCount}</span>
                        </div>
                        {po.estimatedCost && (
                            <div className='flex items-center justify-between'>
                                <span className='text-xs text-[#7a6a52]'>עלות משוערת</span>
                                <span className='text-xs font-bold text-[#AA8840]'>{po.estimatedCost} {po.currency}</span>
                            </div>
                        )}
                        <hr className='border-emerald-200' />
                        <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold pt-1'>
                            <span className='inline-flex items-center gap-1'><Truck size={9} /> משלוח אל</span>
                        </p>
                        <div className='text-xs text-[#3d3225] space-y-0.5'>
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

            {/* Download PDFs (Lulu-compliant) */}
            {/*
                Opens the viewer in a new tab with ?autoExport=<formatId> so
                the viewer generates the content + cover PDFs at the chosen
                format's dimensions and downloads them to the admin's
                computer. Does NOT touch the shipped "Send to Lulu" flow.
            */}
            <div className='px-6 py-4 border-t border-[#f0e8d4]'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>הורדת PDF לפי פורמט Lulu</p>
                <div className='space-y-2'>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=classic`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-[#fbf6ec] hover:bg-[#AA8840]/5 border border-[#f0e8d4] hover:border-[#AA8840]/20 transition-all text-sm font-medium text-[#3d3225]'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>קלאסי — כריכה רכה 8.5"</div>
                            <div className='text-[11px] text-[#a89378]'>Perfect Bound · מה שנשלח כרגע ללולו</div>
                        </div>
                    </a>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=hardcover`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-[#fbf6ec] hover:bg-[#AA8840]/5 border border-[#f0e8d4] hover:border-[#AA8840]/20 transition-all text-sm font-medium text-[#3d3225]'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>כריכה קשה 8.5" (Case Wrap)</div>
                            <div className='text-[11px] text-[#a89378]'>Hardcover עם הדפסה מלאה + wrap margins</div>
                        </div>
                    </a>
                    <a
                        href={`/wedding/${wedding.id}/viewer?autoExport=booklet`}
                        target='_blank'
                        rel='noreferrer'
                        className='w-full flex items-center gap-3 p-3 rounded-xl bg-[#fbf6ec] hover:bg-[#AA8840]/5 border border-[#f0e8d4] hover:border-[#AA8840]/20 transition-all text-sm font-medium text-[#3d3225]'
                    >
                        <Download size={14} className='text-[#AA8840]' />
                        <div className='text-right flex-1'>
                            <div className='font-semibold'>ספרון (Saddle Stitch)</div>
                            <div className='text-[11px] text-[#a89378]'>עד 24 עמודים · 17.25" × 8.75" · בלי שדרה</div>
                        </div>
                    </a>
                </div>
            </div>

            {/* Actions */}
            <div className='px-6 py-4 border-t border-[#f0e8d4] space-y-2'>
                <p className='text-[11px] text-[#7a6a52] uppercase tracking-widest font-semibold mb-3'>פעולות</p>
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
        { icon: MessageCircle, label: 'סך ברכות', value: totalGreetings, iconBg: 'bg-[#AA8840]/10', iconColor: 'text-[#AA8840]' },
        // Today's events break the warm-gold rhythm with a small emerald
        // burst — kept different on purpose so the eye flicks straight to
        // "anything happening right now?". The pulse ring makes it
        // unambiguous when the count is non-zero.
        { icon: Zap, label: 'חתונות היום', value: todayCount, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', pulse: todayCount > 0 },
        { icon: CalendarDays, label: 'חתונות קרובות', value: upcomingCount, iconBg: 'bg-[#AA8840]/10', iconColor: 'text-[#AA8840]' },
    ]

    return (
        <div
            className='min-h-screen py-10 px-4 sm:px-10 relative'
            dir='rtl'
            style={{
                // Ivory premium wash — same palette as the public-facing
                // pages so the admin doesn't feel like a different app.
                backgroundColor: '#f8f4ec',
                backgroundImage: [
                    'radial-gradient(ellipse 1100px 560px at 50% -10%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%)',
                    'radial-gradient(ellipse 600px 600px at 92% 105%, rgba(201,164,78,0.07) 0%, rgba(201,164,78,0) 60%)',
                    'radial-gradient(ellipse 520px 520px at 8% 105%, rgba(186,156,108,0.05) 0%, rgba(186,156,108,0) 60%)',
                ].join(', '),
            }}
        >
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

            {/* Ambient orbs — quieter than before, just enough to give
                depth without competing with the content. */}
            <div className='fixed -top-32 -left-20 h-[28rem] w-[28rem] rounded-full pointer-events-none' style={{ background: 'rgba(211,182,103,0.08)', filter: 'blur(80px)' }} />
            <div className='fixed -bottom-24 -right-20 h-[26rem] w-[26rem] rounded-full pointer-events-none' style={{ background: 'rgba(170,136,64,0.06)', filter: 'blur(80px)' }} />

            <div className='max-w-7xl mx-auto relative'>

                {/* Page Header */}
                <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className='flex items-center justify-between mb-9'>
                    <div className='flex items-center gap-4'>
                        <div className='relative'>
                            <div
                                className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0'
                                style={{
                                    background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                    boxShadow:
                                        '0 12px 24px -10px rgba(170,136,64,0.45), inset 0 1px 0 rgba(255,255,255,0.30)',
                                }}
                            >
                                <Crown size={20} className='text-white' />
                            </div>
                            <div className='absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse' />
                        </div>
                        <div>
                            <h1 className='leading-tight tracking-tight font-bold' style={{ color: '#1a1410', fontSize: '22px', letterSpacing: '-0.015em' }}>
                                מרכז הניהול
                            </h1>
                            <p className='mt-1 flex items-center gap-1.5' style={{ color: '#a89378', fontSize: '12px' }}>
                                <Sparkles size={11} style={{ color: '#c9a44e' }} /> Wedding Tales · אדמין־על
                            </p>
                        </div>
                    </div>

                    {/* Top Actions */}
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={() => setShowCreateUser(true)}
                            title='יצירת משתמש חדש'
                            className='hidden sm:flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all text-sm font-bold text-white active:scale-[0.98]'
                            style={{
                                background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                            }}
                        >
                            <UserPlus size={14} /> משתמש חדש
                        </button>
                        <a
                            href='/admin/studio'
                            title='סטודיו עיצוב לתבניות ספר'
                            className='hidden sm:flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all text-sm font-bold text-white active:scale-[0.98]'
                            style={{
                                background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                            }}
                        >
                            <Wand2 size={14} /> סטודיו עיצוב
                        </a>
                        <button
                            onClick={handleBackup}
                            title='הורד גיבוי JSON'
                            className='hidden sm:flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all text-sm font-bold'
                            style={{
                                background: '#ffffff',
                                border: '1px solid rgba(212,184,103,0.30)',
                                color: '#7a6a52',
                                boxShadow: '0 2px 6px -2px rgba(170,136,64,0.10)',
                            }}
                        >
                            <HardDrive size={14} style={{ color: '#c9a44e' }} /> גיבוי
                        </button>
                        <button
                            onClick={loadWeddings}
                            title='רענן נתונים'
                            className='w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:rotate-180'
                            style={{
                                background: '#ffffff',
                                border: '1px solid rgba(212,184,103,0.30)',
                                boxShadow: '0 2px 6px -2px rgba(170,136,64,0.10)',
                                transitionDuration: '500ms',
                            }}
                        >
                            <RefreshCw size={15} style={{ color: '#7a6a52' }} />
                        </button>
                        <div
                            className='hidden sm:flex items-center gap-2 rounded-full px-4 py-2'
                            style={{
                                background: '#ffffff',
                                border: '1px solid rgba(212,184,103,0.25)',
                                boxShadow: '0 2px 6px -2px rgba(170,136,64,0.08)',
                            }}
                        >
                            <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
                            <span style={{ color: '#7a6a52', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>מחובר</span>
                        </div>
                    </div>
                </motion.div>

                {/* Stat Cards */}
                {status === 'ok' && (
                    <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
                        {stats.map((s, i) => <motion.div key={s.label} transition={{ delay: 0.05 * i }}><StatCard {...s} /></motion.div>)}
                    </div>
                )}

                {/* Mobile action buttons — same gold-gradient + outlined
                    pair as the desktop header so the brand language stays
                    consistent across breakpoints. */}
                <div className='sm:hidden mb-4 flex gap-2'>
                    <button
                        onClick={() => setShowCreateUser(true)}
                        className='flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white active:scale-[0.98] transition-all'
                        style={{
                            background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                            boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                        }}
                    >
                        <UserPlus size={14} /> משתמש חדש
                    </button>
                    <button
                        onClick={handleBackup}
                        className='flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all'
                        style={{
                            background: '#ffffff',
                            border: '1px solid rgba(212,184,103,0.30)',
                            color: '#7a6a52',
                            boxShadow: '0 2px 6px -2px rgba(170,136,64,0.10)',
                        }}
                    >
                        <HardDrive size={14} style={{ color: '#c9a44e' }} /> גיבוי
                    </button>
                </div>

                {/* Main Table Card */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className='rounded-3xl overflow-hidden'
                    style={{
                        background: '#ffffff',
                        border: '1px solid rgba(212,184,103,0.22)',
                        boxShadow:
                            '0 24px 50px -28px rgba(170,136,64,0.28), 0 4px 12px -4px rgba(170,136,64,0.10)',
                    }}
                >

                    {/* Card header */}
                    <div
                        className='px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-3'
                        style={{
                            borderBottom: '1px solid rgba(212,184,103,0.15)',
                            background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)',
                        }}
                    >
                        <div className='flex items-center gap-3 flex-1'>
                            <div
                                className='w-1.5 h-6 rounded-full'
                                style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}
                            />
                            <h2 style={{ color: '#1a1410', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.005em' }}>כל החתונות</h2>
                            {status === 'ok' && (
                                <span
                                    className='rounded-full px-3 py-0.5'
                                    style={{
                                        background: 'rgba(201,164,78,0.10)',
                                        color: '#a8843a',
                                        border: '1px solid rgba(212,184,103,0.30)',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                    }}
                                >
                                    {sorted.length} רשומות
                                </span>
                            )}
                        </div>
                        {status === 'ok' && (
                            <div className='w-full sm:w-80 relative' dir='rtl'>
                                <Search size={15} className='absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none' style={{ color: '#b9a684' }} />
                                <input
                                    type='text'
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder='חיפוש לפי שם, אימייל, מזהה...'
                                    className='w-full pr-10 pl-4 py-2.5 rounded-xl outline-none transition-all'
                                    style={{
                                        background: '#fdfaf3',
                                        border: '1px solid #ead9b3',
                                        color: '#1a1410',
                                        fontSize: '13.5px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = '#c9a44e')}
                                    onBlur={e => (e.currentTarget.style.borderColor = '#ead9b3')}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className='absolute left-3 top-1/2 -translate-y-1/2 text-xs'
                                        style={{ color: '#b9a684' }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sort ribbon — bumped opacity + 3px gold edge marker
                        on the right (RTL = inline-start) so the active
                        sort reads as a real chip-state, not a faint wash. */}
                    {sort.key && status === 'ok' && (
                        <div
                            className='px-6 py-2.5 border-b border-[#AA8840]/15 bg-[#AA8840]/[0.10] flex items-center gap-2 relative'
                            style={{ boxShadow: 'inset 3px 0 0 0 #c9a44e' }}
                        >
                            <ArrowUpDown size={12} className='text-[#a8843a]' />
                            <span className='text-xs font-semibold text-[#a8843a]'>
                                מיון לפי {sort.key === 'date' ? 'תאריך' : sort.key === 'couple' ? 'שם זוג' : 'ברכות'}
                                {' '}({sort.dir === 'asc' ? 'עולה' : 'יורד'})
                            </span>
                            <button
                                onClick={() => setSort({ key: null, dir: null })}
                                className='mr-auto text-xs font-semibold text-[#a89378] hover:text-[#a8843a] transition-colors'
                            >
                                נקה ✕
                            </button>
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
                            <div className='text-center'>
                                <p className='text-[#5a4d3a] text-sm font-semibold'>טוען חתונות...</p>
                                <p className='text-[#a89378] text-xs mt-1'>שולף את כל הרשומות מ-Firestore</p>
                            </div>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className='flex flex-col items-center justify-center py-40 gap-4'>
                            <div className='w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center'>
                                <AlertCircle size={28} className='text-red-500' />
                            </div>
                            <p className='text-[#1a1410] font-semibold'>שגיאה בטעינת הנתונים</p>
                            <p className='text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl max-w-md text-center'>{error}</p>
                            <button
                                onClick={loadWeddings}
                                className='mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]'
                                style={{
                                    background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                    boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                                }}
                            >
                                <RefreshCw size={14} /> נסה שוב
                            </button>
                        </div>
                    )}
                    {status === 'ok' && sorted.length === 0 && (
                        <div className='flex flex-col items-center justify-center py-40 gap-4 px-6 text-center'>
                            <div className='w-14 h-14 rounded-2xl bg-[#AA8840]/10 flex items-center justify-center'>
                                <Heart size={28} className='text-[#AA8840]' />
                            </div>
                            <div>
                                <p className='text-[#1a1410] font-semibold text-sm'>
                                    {searchQuery ? 'אין תוצאות לחיפוש שלך' : 'עוד אין חתונות במערכת'}
                                </p>
                                <p className='text-[#a89378] text-xs mt-1.5'>
                                    {searchQuery ? 'נסה מילות חיפוש אחרות, או נקה את החיפוש' : 'צור משתמש ראשון ובו תיווצר אוטומטית גם החתונה שלו'}
                                </p>
                            </div>
                            {searchQuery ? (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className='mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-[#7a6a52] bg-white border border-[#ead9b3] hover:bg-[#fbf6ec] transition-all'
                                >
                                    <X size={14} /> נקה חיפוש
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowCreateUser(true)}
                                    className='mt-1 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]'
                                    style={{
                                        background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)',
                                        boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                                    }}
                                >
                                    <UserPlus size={14} /> צור משתמש ראשון
                                </button>
                            )}
                        </div>
                    )}
                    {status === 'ok' && sorted.length > 0 && (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-sm text-right' style={{ minWidth: '880px' }}>
                                <thead>
                                    <tr className='border-b border-[#AA8840]/15 text-[11px] uppercase tracking-widest bg-[#AA8840]/5'>
                                        <th className='px-6 py-4 text-[#a89378] font-semibold w-12'>#</th>
                                        <SortableHeader sortKey='couple' currentSort={sort} onSort={setSort}><Users size={11} /> זוג</SortableHeader>
                                        <SortableHeader sortKey='date' currentSort={sort} onSort={setSort}><CalendarDays size={11} /> תאריך</SortableHeader>
                                        <th className='px-6 py-4 font-semibold text-[#a89378] text-center'>סטטוס</th>
                                        <SortableHeader sortKey='greetings' currentSort={sort} onSort={setSort} justify='center'><MessageCircle size={11} /> ברכות</SortableHeader>
                                        <th className='px-6 py-4 font-semibold text-[#a89378] text-center'><span className='flex items-center gap-1.5 justify-center'><Printer size={11} /> הדפסה</span></th>
                                        <th className='px-6 py-4 font-semibold text-[#a89378]'><span className='flex items-center gap-1.5 justify-end'><Hash size={11} /> הזמנה</span></th>
                                        <th className='px-6 py-4 font-semibold text-[#a89378] text-center'>פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-[#f0e8d4]'>
                                    {sorted.map((w, i) => (
                                        <tr key={w.id}
                                            onClick={() => setSelectedWedding(w)}
                                            className='group hover:bg-[#AA8840]/[0.07] transition-colors cursor-pointer'>
                                            <td className='px-6 py-4'>
                                                <div className='w-7 h-7 rounded-full bg-[#AA8840]/10 flex items-center justify-center text-[#AA8840]/60 text-xs font-bold group-hover:bg-[#AA8840]/20 transition-colors'>
                                                    {i + 1}
                                                </div>
                                            </td>
                                            <td className='px-6 py-4'>
                                                <div className='text-right'>
                                                    <div className='font-semibold text-[#1a1410]'>{coupleLabel(w)}</div>
                                                    {w.ownerEmail && (w.brideName || w.groomName) && <div className='text-xs text-[#a89378] mt-0.5'>{w.ownerEmail}</div>}
                                                </div>
                                            </td>
                                            <td className='px-6 py-4 text-[#7a6a52] whitespace-nowrap text-sm tabular-nums'>{formatDate(w.weddingDate)}</td>
                                            <td className='px-6 py-4 text-center'><StatusBadge weddingDate={w.weddingDate} /></td>
                                            <td className='px-6 py-4 text-center'><GreetingsBadge count={w.greetingsCount} /></td>
                                            <td className='px-6 py-4 text-center'><PrintBadge printOrder={w.printOrder} /></td>
                                            <td className='px-6 py-4 text-right'>
                                                {w.orderId
                                                    ? <span className='font-mono text-xs bg-[#fbf6ec] text-[#7a6a52] px-2.5 py-1 rounded-lg border border-[#ead9b3]'>#{w.orderId}</span>
                                                    : <span className='text-[#c4b9a4] text-xs'>ידני</span>}
                                            </td>
                                            <td className='px-6 py-4'>
                                                <div className='flex items-center justify-center gap-1.5' onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => setSelectedWedding(w)} title='פתח פרטים'
                                                        className='w-9 h-9 rounded-lg bg-[#AA8840]/10 border border-[#AA8840]/30 text-[#AA8840] hover:bg-[#AA8840]/20 hover:border-[#AA8840]/50 flex items-center justify-center transition-all active:scale-95'>
                                                        <Database size={14} />
                                                    </button>
                                                    {w.ownerEmail && (
                                                        <button onClick={() => handleResetPassword(w.ownerEmail)} title='איפוס סיסמה'
                                                            className='w-9 h-9 rounded-lg bg-white border border-[#ead9b3] text-[#7a6a52] hover:text-[#AA8840] hover:bg-[#AA8840]/5 hover:border-[#AA8840]/30 flex items-center justify-center transition-all active:scale-95'>
                                                            <KeyRound size={14} />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDeleteWedding(w)} title='מחק חתונה'
                                                        className='w-9 h-9 rounded-lg bg-white border border-[#ead9b3] text-[#a89378] hover:text-red-500 hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-all active:scale-95'>
                                                        <Trash2 size={14} />
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

                <p className='text-center text-[11px] text-[#a89378] mt-8 font-medium'>
                    גישה מוגבלת לאדמין־על בלבד · Wedding Tales
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
