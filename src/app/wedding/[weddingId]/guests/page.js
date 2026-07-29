'use client'

// /wedding/[weddingId]/guests — owner-facing "guest invite" console.
//
// This is the operational surface that turns a wedding into a WhatsApp
// blast the couple actually runs themselves:
//   1. Upload their guest list (CSV / paste / manual add).
//   2. Edit / group / dedupe the list inline.
//   3. Compose the invite message once (with {placeholders}).
//   4. Enter "shoot mode" — a full-screen focused view that opens
//      wa.me one guest at a time with the message pre-filled, and
//      marks them as invited after they hit send.
//
// The write-page (guest-facing) prefills the guest's name from the
// personalised `?g=<guestId>` param and PATCHes back { wroteAt,
// entryId } on submit, which flips the status pill here to "כתב ✓".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth as clientAuth, db as clientDb } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import { EVENT_TYPE_META, eventDisplayTitle } from '@/lib/onboarding'
import { normalizeIL, isPlausibleIL } from '@/lib/normalizePhoneIL'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import BookLoader from '@/components/BookLoader/BookLoader'
import { Heebo } from 'next/font/google'
import {
    Users, Upload, Trash2, Pencil, Check, X, Copy, Send, ArrowRight, ArrowLeft,
    MessageCircle, ChevronDown, ChevronUp, PlusCircle, Download, Filter,
} from 'lucide-react'

const heebo = Heebo({ subsets: ['hebrew'], weight: ['400', '500', '700', '900'] })

const SITE_ORIGIN =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) ||
    'https://app.weddingtales.co.il'

const DEFAULT_TEMPLATE = `היי {name} 💛
לקראת {eventType} של {names} ב-{date} — נשמח לברכה ותמונה ממך לספר הזיכרונות:
{link}`

// ────────────────────────────────────────────────────────────────────────────
// Header lookup — accept English + Hebrew column names, case-insensitive.
const NAME_KEYS = ['name', 'שם', 'guest', 'guest name', 'שם אורח']
const PHONE_KEYS = ['phone', 'טלפון', 'phone number', 'מספר טלפון', 'mobile', 'נייד']
const GROUP_KEYS = ['group', 'קבוצה', 'category', 'קטגוריה']

function pickKey(headerRow, wanted) {
    const norm = s => String(s || '').trim().toLowerCase()
    const wantedNorm = wanted.map(norm)
    for (let i = 0; i < headerRow.length; i++) {
        if (wantedNorm.includes(norm(headerRow[i]))) return i
    }
    return -1
}

// Minimal CSV parser — handles quoted fields, embedded commas, and CRLF.
// The paste UI accepts either commas or tabs; if the first non-empty
// row has a tab we treat the whole file as TSV.
function parseCSV(text) {
    if (!text || !text.trim()) return []
    const src = text.replace(/^﻿/, '') // strip BOM if any
    const firstLine = src.split(/\r?\n/).find(l => l.trim()) || ''
    const delim = firstLine.includes('\t') ? '\t' : ','

    const rows = []
    let row = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++ } else { inQuotes = false }
            } else {
                cell += ch
            }
        } else {
            if (ch === '"') inQuotes = true
            else if (ch === delim) { row.push(cell); cell = '' }
            else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = [] }
            else if (ch === '\r') { /* skip */ }
            else cell += ch
        }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row) }
    // Trim trailing empty rows.
    while (rows.length && rows[rows.length - 1].every(c => !String(c || '').trim())) rows.pop()
    return rows
}

// Turn parsed row-arrays into { name, phone, group } objects.
// If the first row looks like headers ("name"/"שם" etc.) we honor them;
// otherwise we assume [name, phone, group?] positional order.
function rowsToGuests(rows) {
    if (!rows.length) return []
    const headerRow = rows[0]
    const nameIdx = pickKey(headerRow, NAME_KEYS)
    const phoneIdx = pickKey(headerRow, PHONE_KEYS)
    const groupIdx = pickKey(headerRow, GROUP_KEYS)
    const hasHeader = nameIdx !== -1 || phoneIdx !== -1

    const dataRows = hasHeader ? rows.slice(1) : rows
    return dataRows
        .map(r => {
            const name = String(r[hasHeader && nameIdx !== -1 ? nameIdx : 0] || '').trim()
            const phone = String(r[hasHeader && phoneIdx !== -1 ? phoneIdx : 1] || '').trim()
            const group = String(r[hasHeader && groupIdx !== -1 ? groupIdx : 2] || '').trim()
            return { name, phone, group }
        })
        .filter(g => g.name || g.phone)
}

function fmtDateHe(v) {
    if (!v) return ''
    let d
    if (typeof v === 'string') {
        d = new Date(v.length === 10 ? v + 'T12:00:00' : v)
    } else if (typeof v?.toDate === 'function') {
        d = v.toDate()
    } else {
        d = new Date(v)
    }
    if (!d || Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function applyTemplate(template, ctx) {
    if (!template) return ''
    return template
        .replace(/\{name\}/g, ctx.name || '')
        .replace(/\{eventType\}/g, ctx.eventType || '')
        .replace(/\{names\}/g, ctx.names || '')
        .replace(/\{date\}/g, ctx.date || '')
        .replace(/\{link\}/g, ctx.link || '')
}

function buildGuestLink({ wedding, weddingId, guestId }) {
    const slugOrId = wedding?.slug || weddingId
    return `${SITE_ORIGIN}/g/${slugOrId}?g=${guestId}`
}

// ────────────────────────────────────────────────────────────────────────────

export default function GuestsPage() {
    return (
        <AdminPageWrapper>
            <GuestsPageInner />
        </AdminPageWrapper>
    )
}

function GuestsPageInner() {
    const { weddingId } = useParams()
    const [user, setUser] = useState(null)
    const [wedding, setWedding] = useState(null)
    const [guests, setGuests] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [flash, setFlash] = useState('')

    // Import panel state
    const [importOpen, setImportOpen] = useState(true)
    const [pasteText, setPasteText] = useState('')
    const [previewRows, setPreviewRows] = useState([]) // [{name, phone, phoneNorm, group}]
    const [manualName, setManualName] = useState('')
    const [manualPhone, setManualPhone] = useState('')
    const [manualGroup, setManualGroup] = useState('')

    // Table state
    const [selected, setSelected] = useState(() => new Set())
    const [editingId, setEditingId] = useState(null)
    const [editDraft, setEditDraft] = useState({ name: '', phone: '', group: '' })

    // Template state
    const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
    const [templateDirty, setTemplateDirty] = useState(false)
    const [templateSaving, setTemplateSaving] = useState(false)

    // Shoot mode state
    const [shootOpen, setShootOpen] = useState(false)
    const [shootFilter, setShootFilter] = useState('not_invited') // 'all' | 'not_invited' | 'not_wrote'
    const [shootIdx, setShootIdx] = useState(0)

    const fileInputRef = useRef(null)

    // ── Auth + wedding fetch ─────────────────────────────────────────────
    useEffect(() => {
        const unsub = onAuthStateChanged(clientAuth, u => setUser(u))
        return unsub
    }, [])

    const authedFetch = useCallback(
        async (url, opts = {}) => {
            if (!clientAuth.currentUser) throw new Error('not-signed-in')
            const token = await clientAuth.currentUser.getIdToken()
            const headers = new Headers(opts.headers || {})
            headers.set('Authorization', `Bearer ${token}`)
            if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
            const res = await fetch(url, { ...opts, headers })
            const contentType = res.headers.get('content-type') || ''
            const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null
            if (!res.ok) {
                const msg = payload?.error || `HTTP ${res.status}`
                throw new Error(msg)
            }
            return payload
        },
        [],
    )

    useEffect(() => {
        if (!weddingId || !user) return
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                // Fetch wedding doc (client-side is fine — Firestore rules
                // already gate owner reads).
                const snap = await getDoc(doc(clientDb, 'weddings', weddingId))
                if (cancelled) return
                if (!snap.exists()) {
                    setError('החתונה לא נמצאה')
                    setLoading(false)
                    return
                }
                const wdata = { id: snap.id, ...snap.data() }
                setWedding(wdata)
                setTemplate(wdata.guestInviteTemplate || DEFAULT_TEMPLATE)

                // Check auth: owner OR super-admin.
                const emailLower = (user.email || '').toLowerCase()
                const isOwner = wdata.ownerId === user.uid
                if (!isOwner && !isSuperAdmin(emailLower)) {
                    setError('אין לך הרשאה לגשת לרשימת האורחים של אירוע זה')
                    setLoading(false)
                    return
                }

                // Fetch guests via API (super-admin needs Admin SDK anyway).
                const list = await authedFetch(`/api/guests?weddingId=${encodeURIComponent(weddingId)}`)
                if (cancelled) return
                setGuests(Array.isArray(list) ? list : [])
                setLoading(false)
            } catch (err) {
                if (cancelled) return
                console.error('[guests] load failed', err)
                setError(err.message || 'טעינה נכשלה')
                setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [weddingId, user, authedFetch])

    // ── Stats ────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total = guests.length
        const invited = guests.filter(g => g.invitedAt).length
        const wrote = guests.filter(g => g.wroteAt).length
        return { total, invited, wrote }
    }, [guests])

    // Existing groups (unique, sorted) — used for the inline dropdown.
    const groups = useMemo(() => {
        const s = new Set()
        for (const g of guests) if (g.group) s.add(g.group)
        return [...s].sort((a, b) => a.localeCompare(b, 'he'))
    }, [guests])

    // ── Template context (for preview + shoot mode) ──────────────────────
    const templateBase = useMemo(() => {
        if (!wedding) return {}
        const meta = EVENT_TYPE_META[wedding.eventType] || {}
        return {
            eventType: meta.label || 'האירוע',
            names: eventDisplayTitle(wedding),
            date: fmtDateHe(wedding.weddingDate),
        }
    }, [wedding])

    const resolveForGuest = useCallback(
        guest => ({
            name: guest?.name || '',
            eventType: templateBase.eventType || '',
            names: templateBase.names || '',
            date: templateBase.date || '',
            link: buildGuestLink({ wedding, weddingId, guestId: guest?.id || 'GUEST' }),
        }),
        [wedding, weddingId, templateBase],
    )

    const previewText = useMemo(() => {
        if (!guests.length) return applyTemplate(template, { ...resolveForGuest({ name: 'אורח/ת' }) })
        return applyTemplate(template, resolveForGuest(guests[0]))
    }, [template, guests, resolveForGuest])

    // ── Import: files ────────────────────────────────────────────────────
    async function handleFile(file) {
        setError('')
        if (!file) return
        const name = (file.name || '').toLowerCase()
        try {
            const text = await file.text()
            if (name.endsWith('.xlsx')) {
                setError('בשלב זה רשימות אקסל נתמכות רק אחרי המרה ל-CSV — פתחו את הקובץ באקסל / Google Sheets ובחרו File → Save As → CSV.')
                return
            }
            const rows = parseCSV(text)
            const parsed = rowsToGuests(rows)
            if (!parsed.length) {
                setError('לא זוהו שורות בקובץ. ודאו שיש עמודות "שם" ו-"טלפון" (או name / phone).')
                return
            }
            setPreviewRows(withNormalized(parsed))
        } catch (err) {
            console.error('[guests] file parse failed', err)
            setError('הקובץ לא נקרא — נסו CSV מלא (UTF-8) או השתמשו בהדבקה מטה.')
        }
    }

    function handlePasteToPreview() {
        setError('')
        if (!pasteText.trim()) return
        const rows = parseCSV(pasteText)
        const parsed = rowsToGuests(rows)
        if (!parsed.length) {
            setError('לא זוהו שורות. פורמט צפוי: "שם, טלפון" בכל שורה.')
            return
        }
        setPreviewRows(withNormalized(parsed))
    }

    function withNormalized(rows) {
        return rows.map(r => ({
            ...r,
            phoneNorm: normalizeIL(r.phone) || '',
            phoneOk: !!isPlausibleIL(normalizeIL(r.phone)),
        }))
    }

    function addManualToPreview() {
        setError('')
        const name = manualName.trim()
        const phoneNorm = normalizeIL(manualPhone)
        if (!name || !phoneNorm) {
            setError('צריך גם שם וגם טלפון.')
            return
        }
        setPreviewRows(prev => [
            ...prev,
            {
                name,
                phone: manualPhone.trim(),
                phoneNorm,
                phoneOk: isPlausibleIL(phoneNorm),
                group: manualGroup.trim(),
            },
        ])
        setManualName('')
        setManualPhone('')
    }

    async function commitPreview() {
        setError('')
        if (!previewRows.length) return
        const payload = previewRows
            .filter(r => r.name && r.phoneNorm)
            .map(r => ({ name: r.name, phone: r.phoneNorm, group: r.group || '' }))
        if (!payload.length) {
            setError('אין שורות תקינות להוספה.')
            return
        }
        try {
            const res = await authedFetch('/api/guests/bulk-add', {
                method: 'POST',
                body: JSON.stringify({ weddingId, guests: payload }),
            })
            setFlash(`נוספו ${res.added} אורחים · דולג ${res.skipped}`)
            setPreviewRows([])
            setPasteText('')
            // refetch
            const list = await authedFetch(`/api/guests?weddingId=${encodeURIComponent(weddingId)}`)
            setGuests(Array.isArray(list) ? list : [])
        } catch (err) {
            setError('הוספה נכשלה: ' + (err.message || ''))
        }
    }

    // ── Row edit / delete ────────────────────────────────────────────────
    function startEdit(g) {
        setEditingId(g.id)
        setEditDraft({ name: g.name || '', phone: g.phone || '', group: g.group || '' })
    }
    function cancelEdit() {
        setEditingId(null)
        setEditDraft({ name: '', phone: '', group: '' })
    }
    async function saveEdit(id) {
        try {
            await authedFetch(`/api/guests/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    weddingId,
                    patch: {
                        name: editDraft.name,
                        phone: editDraft.phone,
                        group: editDraft.group,
                    },
                }),
            })
            const normalized = normalizeIL(editDraft.phone) || editDraft.phone
            setGuests(prev => prev.map(g => g.id === id
                ? { ...g, name: editDraft.name.trim(), phone: normalized, group: editDraft.group.trim() }
                : g))
            cancelEdit()
        } catch (err) {
            setError('שמירה נכשלה: ' + (err.message || ''))
        }
    }
    async function deleteGuest(id) {
        if (!confirm('למחוק את האורח?')) return
        try {
            await authedFetch(`/api/guests/${encodeURIComponent(id)}?weddingId=${encodeURIComponent(weddingId)}`, {
                method: 'DELETE',
            })
            setGuests(prev => prev.filter(g => g.id !== id))
            setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
        } catch (err) {
            setError('מחיקה נכשלה: ' + (err.message || ''))
        }
    }
    async function bulkDelete() {
        if (!selected.size) return
        if (!confirm(`למחוק ${selected.size} אורחים?`)) return
        for (const id of selected) {
            try {
                await authedFetch(`/api/guests/${encodeURIComponent(id)}?weddingId=${encodeURIComponent(weddingId)}`, {
                    method: 'DELETE',
                })
            } catch (err) {
                console.warn('bulkDelete failed for', id, err)
            }
        }
        setGuests(prev => prev.filter(g => !selected.has(g.id)))
        setSelected(new Set())
    }
    async function bulkMarkInvited() {
        if (!selected.size) return
        for (const id of selected) {
            try {
                await authedFetch(`/api/guests/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ weddingId, patch: { invitedAt: 'server' } }),
                })
            } catch (err) { console.warn('bulkMarkInvited failed for', id, err) }
        }
        const now = new Date().toISOString()
        setGuests(prev => prev.map(g => selected.has(g.id) ? { ...g, invitedAt: g.invitedAt || now } : g))
        setSelected(new Set())
    }
    function toggleSelected(id) {
        setSelected(prev => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id); else n.add(id)
            return n
        })
    }
    function toggleAllSelected() {
        setSelected(prev => prev.size === guests.length ? new Set() : new Set(guests.map(g => g.id)))
    }

    // ── Template save ────────────────────────────────────────────────────
    async function saveTemplate() {
        if (!weddingId) return
        setTemplateSaving(true)
        try {
            await setDoc(doc(clientDb, 'weddings', weddingId), { guestInviteTemplate: template }, { merge: true })
            setTemplateDirty(false)
            setFlash('התבנית נשמרה')
        } catch (err) {
            setError('שמירת התבנית נכשלה: ' + (err.message || ''))
        } finally {
            setTemplateSaving(false)
        }
    }

    // ── Export CSV ───────────────────────────────────────────────────────
    function exportCsv() {
        const rows = [['שם', 'טלפון', 'קבוצה', 'הוזמן', 'כתב']]
        for (const g of guests) {
            rows.push([
                g.name || '',
                g.phone || '',
                g.group || '',
                g.invitedAt ? 'כן' : '',
                g.wroteAt ? 'כן' : '',
            ])
        }
        const csv = rows.map(r => r.map(c => {
            const s = String(c ?? '')
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
            return s
        }).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `guests-${weddingId}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    // ── Copy-phone helper ────────────────────────────────────────────────
    async function copyPhone(phone) {
        try {
            await navigator.clipboard.writeText(phone)
            setFlash('הטלפון הועתק')
        } catch { /* ignore */ }
    }

    // ── Shoot mode: filtered queue ───────────────────────────────────────
    const shootQueue = useMemo(() => {
        let list = guests
        if (shootFilter === 'not_invited') list = list.filter(g => !g.invitedAt)
        else if (shootFilter === 'not_wrote') list = list.filter(g => !g.wroteAt)
        return list
    }, [guests, shootFilter])

    useEffect(() => {
        // Clamp index whenever the queue shrinks under us (e.g. after
        // marking someone invited and the "not-invited" filter drops them).
        if (shootIdx >= shootQueue.length) setShootIdx(Math.max(0, shootQueue.length - 1))
    }, [shootIdx, shootQueue.length])

    const currentGuest = shootQueue[shootIdx] || null
    const currentText = useMemo(() => (currentGuest ? applyTemplate(template, resolveForGuest(currentGuest)) : ''), [currentGuest, template, resolveForGuest])

    function whatsappUrl(guest, text) {
        // Strip the leading '+' — wa.me expects digits only.
        const to = (guest?.phone || '').replace(/[^\d]/g, '')
        return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
    }

    async function markInvitedAndAdvance() {
        if (!currentGuest) return
        try {
            await authedFetch(`/api/guests/${encodeURIComponent(currentGuest.id)}`, {
                method: 'PATCH',
                body: JSON.stringify({ weddingId, patch: { invitedAt: 'server' } }),
            })
        } catch (err) { console.warn('markInvited failed', err) }
        const now = new Date().toISOString()
        setGuests(prev => prev.map(g => g.id === currentGuest.id ? { ...g, invitedAt: g.invitedAt || now } : g))
        setTimeout(() => setShootIdx(i => Math.min(i + 1, Math.max(0, shootQueue.length - 1))), 500)
    }

    function sendCurrent() {
        if (!currentGuest) return
        const url = whatsappUrl(currentGuest, currentText)
        window.open(url, '_blank', 'noopener,noreferrer')
        markInvitedAndAdvance()
    }
    function skipCurrent() {
        setShootIdx(i => Math.min(i + 1, Math.max(0, shootQueue.length - 1)))
    }
    function backCurrent() {
        setShootIdx(i => Math.max(0, i - 1))
    }
    function closeShoot() {
        setShootOpen(false)
    }

    // Keyboard shortcuts inside shoot mode.
    useEffect(() => {
        if (!shootOpen) return
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); closeShoot(); return }
            if (e.key === ' ') { e.preventDefault(); sendCurrent(); return }
            // RTL: → visually is "next" on LTR keyboards; we treat → as "next"
            if (e.key === 'ArrowRight') { e.preventDefault(); skipCurrent(); return }
            if (e.key === 'ArrowLeft') { e.preventDefault(); backCurrent(); return }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shootOpen, currentGuest, currentText])

    // Auto-hide the flash toast after a few seconds.
    useEffect(() => {
        if (!flash) return
        const t = setTimeout(() => setFlash(''), 2500)
        return () => clearTimeout(t)
    }, [flash])

    if (loading) return <BookLoader />
    if (error && !wedding) {
        return (
            <div className={`min-h-screen flex items-center justify-center bg-[#F5F5F5] ${heebo.className}`}>
                <div className='text-center max-w-md px-6'>
                    <h1 className='text-xl font-bold mb-2'>לא הצלחנו לטעון את הרשימה</h1>
                    <p className='text-gray-600'>{error}</p>
                    <Link href={`/wedding/${weddingId}/admin`} className='inline-block mt-6 text-[#AA8840] underline'>
                        חזרה לניהול
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div
            className={`min-h-screen bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#AA8840]/5 via-[#F5F5F5] to-[#c9a44e]/5 px-4 sm:px-6 py-6 md:p-12 font-sans text-gray-800 ${heebo.className}`}
            dir='rtl'
        >
            {/* Flash toast (bottom-right, non-blocking) */}
            {flash && (
                <div className='fixed bottom-6 left-6 z-50 bg-[#241a0d] text-[#fde9b3] px-4 py-2 rounded-xl shadow-lg text-sm font-semibold'>
                    {flash}
                </div>
            )}

            <div className='max-w-6xl mx-auto'>
                {/* Header */}
                <div className='mb-6 md:mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#AA8840]/15'>
                    <div>
                        <div className='flex items-center gap-3 mb-2'>
                            <Link
                                href={`/wedding/${weddingId}/admin`}
                                className='text-sm text-gray-500 hover:text-[#AA8840] flex items-center gap-1'
                            >
                                <ArrowRight className='w-4 h-4' />
                                חזרה לניהול הברכות
                            </Link>
                        </div>
                        <h1 className='text-3xl md:text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#AA8840] to-[#c9a44e] mb-1.5 flex items-center gap-2'>
                            <Users className='w-8 h-8 text-[#AA8840]' />
                            אורחים
                        </h1>
                        <p className='text-base text-gray-500'>
                            <span className='font-bold text-[#7da76a]'>{stats.wrote}</span> מתוך{' '}
                            <span className='font-bold text-[#AA8840]'>{stats.total}</span> כתבו ·{' '}
                            <span className='font-bold text-[#4a76b8]'>{stats.invited}</span> נשלחו
                        </p>
                    </div>

                    <button
                        onClick={() => { setShootOpen(true); setShootIdx(0) }}
                        disabled={!stats.total}
                        className='flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100'
                        style={{ background: 'linear-gradient(180deg,#c9a44e 0%,#a8843a 100%)' }}
                    >
                        <Send className='w-5 h-5' />
                        מצב שליחה
                    </button>
                </div>

                {error && wedding && (
                    <div className='mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg text-sm flex items-center justify-between'>
                        <span>{error}</span>
                        <button onClick={() => setError('')}><X className='w-4 h-4' /></button>
                    </div>
                )}

                {/* Import panel */}
                <section className='mb-6 bg-white rounded-2xl border border-[#AA8840]/15 shadow-sm overflow-hidden'>
                    <button
                        onClick={() => setImportOpen(v => !v)}
                        className='w-full flex items-center justify-between px-5 py-4 text-lg font-bold text-gray-800 hover:bg-[#AA8840]/5'
                    >
                        <span className='flex items-center gap-2'>
                            <Upload className='w-5 h-5 text-[#AA8840]' />
                            העלאת רשימת אורחים
                        </span>
                        {importOpen ? <ChevronUp className='w-5 h-5' /> : <ChevronDown className='w-5 h-5' />}
                    </button>
                    {importOpen && (
                        <div className='px-5 pb-5 border-t border-[#AA8840]/10'>
                            <div className='grid md:grid-cols-2 gap-5 mt-4'>
                                {/* File dropzone */}
                                <div>
                                    <div className='text-sm font-semibold text-gray-700 mb-2'>קובץ CSV</div>
                                    <div
                                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                                        onDrop={e => {
                                            e.preventDefault()
                                            const f = e.dataTransfer.files?.[0]
                                            if (f) handleFile(f)
                                        }}
                                        onClick={() => fileInputRef.current?.click()}
                                        className='border-2 border-dashed border-[#AA8840]/30 hover:border-[#AA8840]/60 rounded-xl p-6 text-center cursor-pointer transition-colors'
                                    >
                                        <Upload className='w-8 h-8 text-[#AA8840] mx-auto mb-2' />
                                        <div className='text-sm font-semibold text-gray-800'>גררו קובץ לכאן או לחצו לבחירה</div>
                                        <div className='text-xs text-gray-500 mt-1'>עמודות: שם, טלפון, קבוצה (אופציונלי)</div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type='file'
                                        accept='.csv,.xlsx,.tsv,text/csv'
                                        className='hidden'
                                        onChange={e => {
                                            const f = e.target.files?.[0]
                                            e.target.value = ''
                                            if (f) handleFile(f)
                                        }}
                                    />
                                </div>

                                {/* Paste textarea */}
                                <div>
                                    <div className='text-sm font-semibold text-gray-700 mb-2'>הדבקה מהירה</div>
                                    <textarea
                                        value={pasteText}
                                        onChange={e => setPasteText(e.target.value)}
                                        rows={5}
                                        placeholder='דנה כהן, 050-1234567&#10;רון לוי, 0521111222'
                                        className='w-full border border-[#AA8840]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#AA8840]'
                                    />
                                    <button
                                        onClick={handlePasteToPreview}
                                        className='mt-2 text-sm font-semibold text-[#AA8840] hover:underline'
                                    >
                                        צפייה מקדימה →
                                    </button>
                                </div>
                            </div>

                            {/* Manual add */}
                            <div className='mt-5 pt-5 border-t border-[#AA8840]/10'>
                                <div className='text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2'>
                                    <PlusCircle className='w-4 h-4' />
                                    הוספת אורח בודד
                                </div>
                                <div className='grid grid-cols-1 sm:grid-cols-4 gap-2'>
                                    <input
                                        type='text'
                                        value={manualName}
                                        onChange={e => setManualName(e.target.value)}
                                        placeholder='שם'
                                        className='border border-[#AA8840]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#AA8840]'
                                    />
                                    <input
                                        type='tel'
                                        value={manualPhone}
                                        onChange={e => setManualPhone(e.target.value)}
                                        placeholder='טלפון'
                                        className='border border-[#AA8840]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#AA8840]'
                                    />
                                    <input
                                        type='text'
                                        list='groups-list'
                                        value={manualGroup}
                                        onChange={e => setManualGroup(e.target.value)}
                                        placeholder='קבוצה (אופציונלי)'
                                        className='border border-[#AA8840]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#AA8840]'
                                    />
                                    <button
                                        onClick={addManualToPreview}
                                        className='px-4 py-2 rounded-lg bg-[#AA8840]/10 text-[#AA8840] font-semibold text-sm hover:bg-[#AA8840]/20 flex items-center justify-center gap-1'
                                    >
                                        <PlusCircle className='w-4 h-4' />
                                        הוסף לצפייה
                                    </button>
                                </div>
                            </div>
                            <datalist id='groups-list'>
                                {groups.map(g => <option key={g} value={g} />)}
                            </datalist>

                            {/* Preview */}
                            {previewRows.length > 0 && (
                                <div className='mt-5 pt-5 border-t border-[#AA8840]/10'>
                                    <div className='text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between'>
                                        <span>צפייה מקדימה — {previewRows.length} שורות</span>
                                        <button onClick={() => setPreviewRows([])} className='text-xs text-gray-400 hover:text-gray-600'>נקה</button>
                                    </div>
                                    <div className='max-h-64 overflow-y-auto border border-[#AA8840]/10 rounded-lg'>
                                        <table className='w-full text-sm'>
                                            <thead className='sticky top-0 bg-[#AA8840]/5 text-xs text-gray-600'>
                                                <tr>
                                                    <th className='px-3 py-2 text-right'>שם</th>
                                                    <th className='px-3 py-2 text-right'>טלפון (מנורמל)</th>
                                                    <th className='px-3 py-2 text-right'>קבוצה</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((r, i) => (
                                                    <tr key={i} className={r.phoneOk ? '' : 'bg-red-50'}>
                                                        <td className='px-3 py-1.5'>{r.name || <span className='text-red-500 text-xs'>—</span>}</td>
                                                        <td className='px-3 py-1.5 font-mono ltr:text-left rtl:text-right' dir='ltr'>
                                                            {r.phoneNorm || <span className='text-red-500 text-xs'>לא תקין</span>}
                                                        </td>
                                                        <td className='px-3 py-1.5 text-gray-500'>{r.group || ''}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <button
                                        onClick={commitPreview}
                                        className='mt-3 px-6 py-2.5 rounded-xl font-bold text-white shadow transition-transform hover:scale-[1.02] active:scale-95'
                                        style={{ background: 'linear-gradient(180deg,#c9a44e 0%,#a8843a 100%)' }}
                                    >
                                        הוסף {previewRows.filter(r => r.name && r.phoneNorm).length} אורחים
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Guests table */}
                <section className='mb-6 bg-white rounded-2xl border border-[#AA8840]/15 shadow-sm overflow-hidden'>
                    <div className='px-5 py-4 border-b border-[#AA8840]/10 flex items-center justify-between flex-wrap gap-2'>
                        <div className='text-lg font-bold text-gray-800'>רשימת אורחים ({stats.total})</div>
                        <div className='flex items-center gap-2 flex-wrap'>
                            {selected.size > 0 && (
                                <>
                                    <span className='text-xs text-gray-500'>נבחרו {selected.size}</span>
                                    <button
                                        onClick={bulkMarkInvited}
                                        className='px-3 py-1.5 rounded-lg text-xs font-semibold text-[#4a76b8] bg-[#4a76b8]/10 hover:bg-[#4a76b8]/20'
                                    >
                                        סמן כנשלח
                                    </button>
                                    <button
                                        onClick={bulkDelete}
                                        className='px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100'
                                    >
                                        מחק
                                    </button>
                                </>
                            )}
                            <button
                                onClick={exportCsv}
                                disabled={!stats.total}
                                className='px-3 py-1.5 rounded-lg text-xs font-semibold text-[#AA8840] bg-[#AA8840]/10 hover:bg-[#AA8840]/20 disabled:opacity-40 flex items-center gap-1'
                            >
                                <Download className='w-3.5 h-3.5' />
                                CSV
                            </button>
                        </div>
                    </div>

                    {!stats.total ? (
                        <div className='px-6 py-12 text-center text-gray-500'>
                            <Users className='w-12 h-12 mx-auto mb-3 text-[#AA8840]/40' />
                            <p className='font-semibold'>הרשימה ריקה</p>
                            <p className='text-sm mt-1'>העלו קובץ CSV או הדביקו רשימה למעלה כדי להתחיל</p>
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full text-sm'>
                                <thead className='bg-[#AA8840]/5 text-xs text-gray-600'>
                                    <tr>
                                        <th className='px-3 py-2 text-right w-10'>
                                            <input
                                                type='checkbox'
                                                checked={selected.size > 0 && selected.size === stats.total}
                                                onChange={toggleAllSelected}
                                            />
                                        </th>
                                        <th className='px-3 py-2 text-right'>שם</th>
                                        <th className='px-3 py-2 text-right'>טלפון</th>
                                        <th className='px-3 py-2 text-right'>קבוצה</th>
                                        <th className='px-3 py-2 text-right'>סטטוס</th>
                                        <th className='px-3 py-2 text-right w-24'></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guests.map(g => {
                                        const editing = editingId === g.id
                                        return (
                                            <tr key={g.id} className='border-t border-[#AA8840]/10 hover:bg-[#AA8840]/5'>
                                                <td className='px-3 py-2'>
                                                    <input
                                                        type='checkbox'
                                                        checked={selected.has(g.id)}
                                                        onChange={() => toggleSelected(g.id)}
                                                    />
                                                </td>
                                                <td className='px-3 py-2'>
                                                    {editing ? (
                                                        <input
                                                            value={editDraft.name}
                                                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                                                            className='w-full border border-[#AA8840]/30 rounded px-2 py-1 text-sm'
                                                        />
                                                    ) : (
                                                        <span className='font-semibold text-gray-800'>{g.name}</span>
                                                    )}
                                                </td>
                                                <td className='px-3 py-2'>
                                                    {editing ? (
                                                        <input
                                                            value={editDraft.phone}
                                                            onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))}
                                                            className='w-full border border-[#AA8840]/30 rounded px-2 py-1 text-sm font-mono'
                                                            dir='ltr'
                                                        />
                                                    ) : (
                                                        <button
                                                            onClick={() => copyPhone(g.phone)}
                                                            className='font-mono text-gray-600 hover:text-[#AA8840] inline-flex items-center gap-1'
                                                            dir='ltr'
                                                            title='לחצו להעתקה'
                                                        >
                                                            <span>{g.phone}</span>
                                                            <Copy className='w-3 h-3 opacity-40' />
                                                        </button>
                                                    )}
                                                </td>
                                                <td className='px-3 py-2'>
                                                    {editing ? (
                                                        <input
                                                            list='groups-list-edit'
                                                            value={editDraft.group}
                                                            onChange={e => setEditDraft(d => ({ ...d, group: e.target.value }))}
                                                            className='w-full border border-[#AA8840]/30 rounded px-2 py-1 text-sm'
                                                        />
                                                    ) : (
                                                        g.group ? (
                                                            <span className='inline-block bg-[#AA8840]/10 text-[#AA8840] text-xs px-2 py-0.5 rounded-full'>{g.group}</span>
                                                        ) : (
                                                            <span className='text-gray-300'>—</span>
                                                        )
                                                    )}
                                                </td>
                                                <td className='px-3 py-2'>
                                                    <StatusPill guest={g} />
                                                </td>
                                                <td className='px-3 py-2 text-left'>
                                                    {editing ? (
                                                        <div className='flex gap-1'>
                                                            <button onClick={() => saveEdit(g.id)} className='p-1.5 text-green-600 hover:bg-green-50 rounded'>
                                                                <Check className='w-4 h-4' />
                                                            </button>
                                                            <button onClick={cancelEdit} className='p-1.5 text-gray-500 hover:bg-gray-100 rounded'>
                                                                <X className='w-4 h-4' />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className='flex gap-1'>
                                                            <button onClick={() => startEdit(g)} className='p-1.5 text-gray-500 hover:text-[#AA8840] hover:bg-[#AA8840]/10 rounded'>
                                                                <Pencil className='w-4 h-4' />
                                                            </button>
                                                            <button onClick={() => deleteGuest(g.id)} className='p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded'>
                                                                <Trash2 className='w-4 h-4' />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            <datalist id='groups-list-edit'>
                                {groups.map(g => <option key={g} value={g} />)}
                            </datalist>
                        </div>
                    )}
                </section>

                {/* Template editor */}
                <section className='mb-6 bg-white rounded-2xl border border-[#AA8840]/15 shadow-sm p-5'>
                    <div className='flex items-center justify-between mb-3'>
                        <div className='text-lg font-bold text-gray-800 flex items-center gap-2'>
                            <MessageCircle className='w-5 h-5 text-[#AA8840]' />
                            תבנית ההזמנה
                        </div>
                        <button
                            onClick={saveTemplate}
                            disabled={!templateDirty || templateSaving}
                            className='px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#AA8840] hover:bg-[#8f6f30] disabled:opacity-40'
                        >
                            {templateSaving ? 'שומר…' : 'שמור תבנית'}
                        </button>
                    </div>
                    <p className='text-xs text-gray-500 mb-2'>
                        השתמשו במשתנים: <code className='px-1 bg-[#AA8840]/10 rounded'>{'{name}'}</code>{' '}
                        <code className='px-1 bg-[#AA8840]/10 rounded'>{'{eventType}'}</code>{' '}
                        <code className='px-1 bg-[#AA8840]/10 rounded'>{'{names}'}</code>{' '}
                        <code className='px-1 bg-[#AA8840]/10 rounded'>{'{date}'}</code>{' '}
                        <code className='px-1 bg-[#AA8840]/10 rounded'>{'{link}'}</code>
                    </p>
                    <textarea
                        value={template}
                        onChange={e => { setTemplate(e.target.value); setTemplateDirty(true) }}
                        rows={5}
                        className='w-full border border-[#AA8840]/20 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#AA8840]'
                    />
                    <div className='mt-3'>
                        <div className='text-xs font-semibold text-gray-600 mb-1'>תצוגה מקדימה (לאורח הראשון):</div>
                        <div className='bg-[#25D366]/5 border border-[#25D366]/20 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap text-gray-800'>
                            {previewText || <span className='text-gray-400'>אין אורח לתצוגה</span>}
                        </div>
                    </div>
                </section>
            </div>

            {/* Shoot mode overlay */}
            {shootOpen && (
                <div className={`fixed inset-0 z-50 bg-white flex flex-col ${heebo.className}`} dir='rtl'>
                    {/* Top bar */}
                    <div className='flex items-center justify-between px-6 py-4 border-b border-[#AA8840]/10 bg-[#AA8840]/5'>
                        <button
                            onClick={closeShoot}
                            className='p-2 hover:bg-white rounded-lg text-gray-600'
                            aria-label='סגור'
                        >
                            <X className='w-6 h-6' />
                        </button>

                        <div className='flex-1 mx-6'>
                            <div className='flex items-center justify-center gap-2 text-sm font-semibold text-gray-700'>
                                <span>{Math.min(shootIdx + 1, shootQueue.length)} / {shootQueue.length}</span>
                                <span className='text-gray-400'>·</span>
                                <span className='text-xs text-gray-500'>נשלחו {stats.invited} מתוך {stats.total}</span>
                            </div>
                            <div className='mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-md mx-auto'>
                                <div
                                    className='h-full bg-gradient-to-r from-[#AA8840] to-[#c9a44e] transition-all'
                                    style={{ width: `${shootQueue.length ? Math.round(((shootIdx + 1) / shootQueue.length) * 100) : 0}%` }}
                                />
                            </div>
                        </div>

                        <div className='flex items-center gap-2'>
                            <Filter className='w-4 h-4 text-gray-500' />
                            <select
                                value={shootFilter}
                                onChange={e => { setShootFilter(e.target.value); setShootIdx(0) }}
                                className='text-sm border border-[#AA8840]/20 rounded px-2 py-1'
                            >
                                <option value='all'>כל האורחים</option>
                                <option value='not_invited'>רק שטרם נשלח להם</option>
                                <option value='not_wrote'>רק שטרם כתבו</option>
                            </select>
                        </div>
                    </div>

                    {/* Middle card */}
                    <div className='flex-1 overflow-y-auto flex items-center justify-center p-6'>
                        {!currentGuest ? (
                            <div className='text-center'>
                                <div className='text-3xl mb-2'>✨</div>
                                <div className='text-xl font-bold text-gray-800'>סיימנו!</div>
                                <div className='text-sm text-gray-500 mt-1'>אין יותר אורחים בסינון הנוכחי</div>
                                <button
                                    onClick={closeShoot}
                                    className='mt-6 px-6 py-2 rounded-lg bg-[#AA8840] text-white font-semibold'
                                >
                                    סגור
                                </button>
                            </div>
                        ) : (
                            <div className='max-w-lg w-full text-center'>
                                <div className='mb-6'>
                                    <div className='text-4xl md:text-5xl font-black text-gray-900 mb-1'>{currentGuest.name}</div>
                                    <div className='text-lg text-gray-500 font-mono' dir='ltr'>{currentGuest.phone}</div>
                                    {currentGuest.group && (
                                        <div className='mt-2 inline-block bg-[#AA8840]/10 text-[#AA8840] text-xs px-3 py-1 rounded-full'>
                                            {currentGuest.group}
                                        </div>
                                    )}
                                </div>

                                <div className='bg-[#25D366]/5 border border-[#25D366]/20 rounded-xl p-4 text-right text-sm text-gray-800 whitespace-pre-wrap mb-6'>
                                    {currentText}
                                </div>

                                <button
                                    onClick={sendCurrent}
                                    className='w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20b95a] rounded-full text-white font-black text-lg shadow-lg transition-transform hover:scale-[1.02] active:scale-95'
                                    style={{ height: 60 }}
                                >
                                    <Send className='w-6 h-6' />
                                    שלח בוואטסאפ
                                </button>

                                <button
                                    onClick={skipCurrent}
                                    className='mt-3 text-sm text-gray-500 hover:text-gray-800 underline'
                                >
                                    עברתי הלאה
                                </button>

                                <div className='mt-6 flex items-center justify-center gap-6 text-xs text-gray-400'>
                                    <span><kbd className='px-1.5 py-0.5 bg-gray-100 rounded'>רווח</kbd> שלח</span>
                                    <span><kbd className='px-1.5 py-0.5 bg-gray-100 rounded'>→</kbd> הבא</span>
                                    <span><kbd className='px-1.5 py-0.5 bg-gray-100 rounded'>←</kbd> חזור</span>
                                    <span><kbd className='px-1.5 py-0.5 bg-gray-100 rounded'>Esc</kbd> סגור</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom nav */}
                    <div className='px-6 py-4 border-t border-[#AA8840]/10 flex items-center justify-between'>
                        <button
                            onClick={backCurrent}
                            disabled={shootIdx <= 0}
                            className='flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-[#AA8840] disabled:opacity-30'
                        >
                            <ArrowRight className='w-4 h-4' />
                            קודם
                        </button>
                        <button
                            onClick={skipCurrent}
                            disabled={shootIdx >= shootQueue.length - 1}
                            className='flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-[#AA8840] disabled:opacity-30'
                        >
                            הבא
                            <ArrowLeft className='w-4 h-4' />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────

function StatusPill({ guest }) {
    if (guest.wroteAt) {
        return (
            <span className='inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-[#7da76a]/15 text-[#4e7a3f] border border-[#7da76a]/40'>
                <Check className='w-3 h-3' /> כתב ✓
            </span>
        )
    }
    if (guest.invitedAt) {
        return (
            <span className='inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-[#4a76b8]/15 text-[#2f5691] border border-[#4a76b8]/40'>
                נשלח
            </span>
        )
    }
    return (
        <span className='inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200'>
            טרם נשלח
        </span>
    )
}
