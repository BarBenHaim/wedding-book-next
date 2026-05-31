'use client'

// /admin/qrcodes — super-admin QR code + stats-link management.
//
// Two tools in one panel:
//
//   1. QR codes (dynamic). Each QR is a short code stored in
//      `qrcodes/{code}`. The printed sticker encodes
//      `https://<site>/q/<code>` and the redirector at /q/[code]
//      resolves the doc's `targetUrl`. Admin can change the target
//      at any time without re-issuing the sticker — that's the whole
//      point. Free alternative to paid "dynamic QR" SaaS.
//
//   2. Stats tokens. A short link the couple can use to view
//      their wedding's stats page (/wedding/[id]/stats/[token])
//      without an admin login. Generate → copy → send.
//
// Both sections gated by isSuperAdmin email check.

import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import {
    QrCode, RefreshCcw, Plus, Trash2, Download, Pencil, Save, X,
    Copy, ExternalLink, Lock, Eye, EyeOff, Power, PowerOff,
    BarChart3, CheckCircle2,
} from 'lucide-react'

function SuperAdminGate({ children }) {
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) { setState('denied'); return }
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
                    דף ניהול הברקודים פתוח רק למנהל הראשי.
                </p>
            </div>
        )
    }
    return children
}

function QrCodesContent() {
    const [weddings, setWeddings] = useState([])
    const [weddingFilter, setWeddingFilter] = useState('') // '' = all
    const [qrList, setQrList] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState({}) // per-row busy state
    const [editing, setEditing] = useState(null) // { code, targetUrl, label, weddingId }

    // Stats tokens — keyed by weddingId so we can show the latest list
    const [statsTokenWeddingId, setStatsTokenWeddingId] = useState('')
    const [statsTokens, setStatsTokens] = useState([]) // [{token, at, by}]
    const [statsBusy, setStatsBusy] = useState(false)
    const [statsCopied, setStatsCopied] = useState('')

    // Load wedding list once
    useEffect(() => {
        ;(async () => {
            try {
                const snap = await getDocs(query(collection(db, 'weddings'), orderBy('createdAt', 'desc')))
                const list = snap.docs.map(d => {
                    const data = d.data() || {}
                    const bride = data.brideNameHe || data.brideName || ''
                    const groom = data.groomNameHe || data.groomName || ''
                    const celeb = data.celebrantNameHe || data.celebrantName || ''
                    const names = (bride && groom) ? `${bride} ו${groom}` : (celeb || `חתונה ${d.id.slice(0, 6)}`)
                    let dateStr = ''
                    const wd = data.weddingDate
                    if (wd) {
                        const dt = typeof wd?.toDate === 'function' ? wd.toDate() : new Date(wd)
                        if (!isNaN(dt.getTime())) dateStr = dt.toLocaleDateString('he-IL')
                    }
                    const label = dateStr ? `${names} · ${dateStr}` : names
                    return { id: d.id, label, raw: data }
                })
                setWeddings(list)
                if (list.length > 0 && !statsTokenWeddingId) setStatsTokenWeddingId(list[0].id)
            } catch (err) {
                console.error('[qrcodes ui] wedding list failed', err)
                setError('שגיאה בטעינת רשימת חתונות')
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const fetchQrList = async () => {
        setLoading(true)
        setError('')
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const url = weddingFilter
                ? `/api/admin/qrcodes?weddingId=${encodeURIComponent(weddingFilter)}`
                : '/api/admin/qrcodes'
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setQrList(json.list || [])
        } catch (err) {
            console.error('[qrcodes ui] list fetch failed', err)
            setError('שגיאה בטעינת הברקודים')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchQrList()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weddingFilter])

    // Refresh stats token list when wedding changes
    useEffect(() => {
        if (!statsTokenWeddingId) { setStatsTokens([]); return }
        const w = weddings.find(x => x.id === statsTokenWeddingId)
        const issued = w?.raw?.statsTokensIssuedAt || []
        const live = w?.raw?.statsTokens || []
        // Show only tokens still in the live array
        const liveSet = new Set(live)
        const merged = issued
            .filter(t => t && liveSet.has(t.token))
            .map(t => ({
                token: t.token,
                at: t.at?.toDate?.() || (t.at?.seconds ? new Date(t.at.seconds * 1000) : null),
                by: t.by || '',
            }))
        // Plus any live token without metadata
        for (const tk of live) {
            if (!merged.find(m => m.token === tk)) merged.push({ token: tk, at: null, by: '' })
        }
        setStatsTokens(merged)
    }, [statsTokenWeddingId, weddings])

    const handleCreate = async () => {
        setBusy(prev => ({ ...prev, _create: true }))
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch('/api/admin/qrcodes', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId: weddingFilter || null }),
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            await fetchQrList()
        } catch (err) {
            console.error('[qrcodes ui] create failed', err)
            alert('יצירה נכשלה')
        } finally {
            setBusy(prev => ({ ...prev, _create: false }))
        }
    }

    const handleDelete = async (code) => {
        if (!confirm(`למחוק את הברקוד ${code}? הסטיקרים המודפסים יפסיקו לעבוד.`)) return
        setBusy(prev => ({ ...prev, [code]: true }))
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch(`/api/admin/qrcodes?code=${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            setQrList(prev => prev.filter(q => q.code !== code))
        } catch (err) {
            console.error('[qrcodes ui] delete failed', err)
            alert('מחיקה נכשלה')
        } finally {
            setBusy(prev => ({ ...prev, [code]: false }))
        }
    }

    const handleToggleActive = async (qr) => {
        setBusy(prev => ({ ...prev, [qr.code]: true }))
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch('/api/admin/qrcodes', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: qr.code, active: !qr.active }),
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            setQrList(prev => prev.map(q => q.code === qr.code ? { ...q, active: !q.active } : q))
        } catch (err) {
            console.error('[qrcodes ui] toggle failed', err)
            alert('עדכון נכשל')
        } finally {
            setBusy(prev => ({ ...prev, [qr.code]: false }))
        }
    }

    const handleSaveEdit = async () => {
        if (!editing) return
        const code = editing.code
        setBusy(prev => ({ ...prev, [code]: true }))
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const patch = {
                code,
                targetUrl: editing.targetUrl,
                label: editing.label || '',
                weddingId: editing.weddingId || '',
            }
            const res = await fetch('/api/admin/qrcodes', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            setQrList(prev => prev.map(q => q.code === code ? {
                ...q,
                targetUrl: patch.targetUrl,
                label: patch.label,
                weddingId: patch.weddingId || null,
            } : q))
            setEditing(null)
        } catch (err) {
            console.error('[qrcodes ui] save failed', err)
            alert('שמירה נכשלה')
        } finally {
            setBusy(prev => ({ ...prev, [code]: false }))
        }
    }

    const handleDownloadPng = async (code) => {
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch(`/api/admin/qrcodes/png?code=${encodeURIComponent(code)}&size=1200`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `qr-${code}.png`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (err) {
            console.error('[qrcodes ui] png failed', err)
            alert('הורדה נכשלה')
        }
    }

    // ── Stats token actions ────────────────────────────────────────
    const handleMintStatsToken = async () => {
        if (!statsTokenWeddingId) return
        setStatsBusy(true)
        try {
            const token = await auth.currentUser?.getIdToken(false)
            const res = await fetch('/api/admin/stats-tokens', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId: statsTokenWeddingId }),
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            const json = await res.json()
            setStatsTokens(prev => [{ token: json.token, at: new Date(), by: 'you' }, ...prev])
            // Auto-copy the link
            await navigator.clipboard.writeText(json.link)
            setStatsCopied(json.token)
            setTimeout(() => setStatsCopied(''), 2000)
        } catch (err) {
            console.error('[stats-tokens] mint failed', err)
            alert('יצירת הקישור נכשלה')
        } finally {
            setStatsBusy(false)
        }
    }

    const handleRevokeStatsToken = async (token) => {
        if (!confirm('לבטל את הקישור? מי שיש לו אותו לא יוכל יותר לצפות בסטטיסטיקה.')) return
        setStatsBusy(true)
        try {
            const idToken = await auth.currentUser?.getIdToken(false)
            const res = await fetch('/api/admin/stats-tokens', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ weddingId: statsTokenWeddingId, token }),
            })
            if (!res.ok) throw new Error(`status ${res.status}`)
            setStatsTokens(prev => prev.filter(t => t.token !== token))
        } catch (err) {
            console.error('[stats-tokens] revoke failed', err)
            alert('ביטול נכשל')
        } finally {
            setStatsBusy(false)
        }
    }

    const copyToClipboard = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text)
            setStatsCopied(key || text)
            setTimeout(() => setStatsCopied(''), 1500)
        } catch (err) {
            console.warn('clipboard failed', err)
        }
    }

    const weddingById = useMemo(() => {
        const m = new Map()
        for (const w of weddings) m.set(w.id, w)
        return m
    }, [weddings])

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : ''

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[1400px] mx-auto'>

                {/* Header */}
                <div className='flex items-center justify-between flex-wrap gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <QrCode size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='font-bold text-[#1a1410] text-[22px] leading-tight'>ניהול ברקודים וקישורים</h1>
                            <p className='text-[12px] text-[#a89378] mt-0.5'>ברקודים דינמיים (אפשר לשנות יעד אחרי הדפסה) + קישורי סטטיסטיקה לזוג</p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <a href='/admin' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                            ← חזרה לאדמין
                        </a>
                        <a href='/admin/analytics' className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                            <BarChart3 size={13} /> סטטיסטיקה
                        </a>
                    </div>
                </div>

                {error && (
                    <div className='mb-4 px-4 py-3 rounded-lg text-[13px]' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                        {error}
                    </div>
                )}

                {/* ── Stats tokens section ───────────────────────────────── */}
                <div className='rounded-2xl overflow-hidden mb-6' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.30)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <div className='px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3' style={{ borderColor: '#f0e8d4', background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}>
                        <div className='flex items-center gap-2'>
                            <BarChart3 size={16} style={{ color: '#aa8840' }} />
                            <p className='text-[13px] font-bold text-[#3d2e1a]'>קישור סטטיסטיקה לזוג</p>
                        </div>
                        <p className='text-[11px] text-[#a89378]'>
                            צור קישור שמיועד רק לדף סטטיסטיקות של חתונה ספציפית — בלי כניסת אדמין
                        </p>
                    </div>
                    <div className='p-5'>
                        <div className='flex items-center gap-2 flex-wrap mb-4'>
                            <select
                                value={statsTokenWeddingId}
                                onChange={e => setStatsTokenWeddingId(e.target.value)}
                                className='px-3 py-2 rounded-lg text-[13px] font-semibold text-[#3d2e1a] outline-none'
                                style={{ background: '#fff', border: '1px solid #ead9b3', minWidth: 240 }}
                            >
                                {weddings.map(w => (<option key={w.id} value={w.id}>{w.label}</option>))}
                            </select>
                            <button
                                onClick={handleMintStatsToken}
                                disabled={!statsTokenWeddingId || statsBusy}
                                className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white'
                                style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', opacity: statsBusy ? 0.6 : 1 }}
                            >
                                <Plus size={13} /> צור קישור חדש
                            </button>
                        </div>

                        {statsTokens.length === 0 ? (
                            <p className='text-[12px] text-[#a89378] py-4'>אין קישורי סטטיסטיקה פעילים לחתונה זו.</p>
                        ) : (
                            <div className='space-y-2'>
                                {statsTokens.map(t => {
                                    const link = `${siteOrigin}/wedding/${statsTokenWeddingId}/stats/${t.token}`
                                    return (
                                        <div key={t.token} className='flex items-center gap-2 flex-wrap p-3 rounded-lg' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                                            <div className='flex-1 min-w-0'>
                                                <code className='block text-[11.5px] text-[#3d2e1a] truncate font-mono'>{link}</code>
                                                {t.at && (
                                                    <p className='text-[10.5px] text-[#a89378] mt-0.5'>נוצר ב-{t.at.toLocaleString('he-IL')}</p>
                                                )}
                                            </div>
                                            <button onClick={() => copyToClipboard(link, t.token)} title='העתק' className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                                                {statsCopied === t.token ? <CheckCircle2 size={12} style={{ color: '#4f7a3e' }} /> : <Copy size={12} />}
                                                {statsCopied === t.token ? 'הועתק!' : 'העתק'}
                                            </button>
                                            <a href={link} target='_blank' rel='noreferrer' title='פתח' className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                                                <ExternalLink size={12} /> פתח
                                            </a>
                                            <button onClick={() => handleRevokeStatsToken(t.token)} disabled={statsBusy} title='בטל' className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold' style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}>
                                                <Trash2 size={12} /> בטל
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── QR codes section ──────────────────────────────────── */}
                <div className='rounded-2xl overflow-hidden' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.22)', boxShadow: '0 8px 20px -16px rgba(170,136,64,0.18)' }}>
                    <div className='px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3' style={{ borderColor: '#f0e8d4', background: 'linear-gradient(180deg, #fdfaf3 0%, #ffffff 100%)' }}>
                        <div className='flex items-center gap-2'>
                            <QrCode size={16} style={{ color: '#aa8840' }} />
                            <p className='text-[13px] font-bold text-[#3d2e1a]'>ברקודים דינמיים</p>
                        </div>
                        <div className='flex items-center gap-2 flex-wrap'>
                            <select
                                value={weddingFilter}
                                onChange={e => setWeddingFilter(e.target.value)}
                                className='px-3 py-2 rounded-lg text-[12px] font-semibold text-[#3d2e1a] outline-none'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            >
                                <option value=''>כל החתונות</option>
                                {weddings.map(w => (<option key={w.id} value={w.id}>{w.label}</option>))}
                            </select>
                            <button
                                onClick={fetchQrList}
                                disabled={loading}
                                className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-[#7a6a52]'
                                style={{ background: '#fff', border: '1px solid #ead9b3' }}
                            >
                                <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} /> רענן
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={busy._create}
                                className='inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white'
                                style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', opacity: busy._create ? 0.6 : 1 }}
                            >
                                <Plus size={12} /> ברקוד חדש
                            </button>
                        </div>
                    </div>

                    <div className='p-3'>
                        {loading ? (
                            <p className='text-center text-[12px] text-[#a89378] py-6'>טוען...</p>
                        ) : qrList.length === 0 ? (
                            <p className='text-center text-[12px] text-[#a89378] py-6'>אין ברקודים. לחץ "ברקוד חדש" כדי להתחיל.</p>
                        ) : (
                            <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
                                {qrList.map(qr => {
                                    const wedding = qr.weddingId ? weddingById.get(qr.weddingId) : null
                                    const shortUrl = `${siteOrigin}/q/${qr.code}`
                                    const isEditing = editing?.code === qr.code
                                    return (
                                        <div key={qr.code} className='rounded-xl p-4' style={{ background: '#fff', border: '1px solid rgba(212,184,103,0.25)', boxShadow: '0 4px 10px -8px rgba(170,136,64,0.18)' }}>
                                            {/* Top row: code + status */}
                                            <div className='flex items-start justify-between gap-2 mb-3'>
                                                <div className='flex-1 min-w-0'>
                                                    <div className='flex items-center gap-2 flex-wrap mb-1'>
                                                        <span className='text-[15px] font-bold text-[#1a1410] font-mono'>{qr.code}</span>
                                                        {qr.active === false ? (
                                                            <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold' style={{ background: '#fff5f5', color: '#b32424', border: '1px solid #ffcdcd' }}>
                                                                <EyeOff size={10} /> מושבת
                                                            </span>
                                                        ) : (
                                                            <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold' style={{ background: '#f0f7eb', color: '#4f7a3e', border: '1px solid #d4e5c5' }}>
                                                                <Eye size={10} /> פעיל
                                                            </span>
                                                        )}
                                                        <span className='text-[10.5px] text-[#a89378]'>{qr.scans || 0} סריקות</span>
                                                    </div>
                                                    {qr.label && (
                                                        <p className='text-[11px] text-[#7a6a52] mb-1'>{qr.label}</p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleDownloadPng(qr.code)}
                                                    title='הורד PNG (1200×1200)'
                                                    className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-white'
                                                    style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}
                                                >
                                                    <Download size={12} /> PNG
                                                </button>
                                            </div>

                                            {/* Short URL (the printed one) */}
                                            <div className='flex items-center gap-2 mb-2 p-2 rounded-lg' style={{ background: '#fdfaf3', border: '1px solid #f0e8d4' }}>
                                                <span className='text-[10px] text-[#a89378] font-semibold'>URL מודפס</span>
                                                <code className='flex-1 min-w-0 truncate text-[11px] text-[#3d2e1a] font-mono'>{shortUrl}</code>
                                                <button onClick={() => copyToClipboard(shortUrl, `s-${qr.code}`)} title='העתק' className='inline-flex items-center px-1.5 py-1 rounded text-[#7a6a52]' style={{ background: '#fff', border: '1px solid #ead9b3' }}>
                                                    {statsCopied === `s-${qr.code}` ? <CheckCircle2 size={11} style={{ color: '#4f7a3e' }} /> : <Copy size={11} />}
                                                </button>
                                            </div>

                                            {/* Edit fields or display */}
                                            {isEditing ? (
                                                <div className='space-y-2'>
                                                    <div>
                                                        <label className='block text-[10.5px] text-[#7a6a52] font-semibold mb-1'>חתונה משויכת</label>
                                                        <select
                                                            value={editing.weddingId || ''}
                                                            onChange={e => setEditing(prev => ({ ...prev, weddingId: e.target.value }))}
                                                            className='w-full px-2.5 py-1.5 rounded-md text-[12px] text-[#3d2e1a] outline-none'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        >
                                                            <option value=''>— ללא שיוך —</option>
                                                            {weddings.map(w => (<option key={w.id} value={w.id}>{w.label}</option>))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className='block text-[10.5px] text-[#7a6a52] font-semibold mb-1'>יעד (URL מלא או נתיב)</label>
                                                        <input
                                                            type='text'
                                                            value={editing.targetUrl}
                                                            onChange={e => setEditing(prev => ({ ...prev, targetUrl: e.target.value }))}
                                                            placeholder='/wedding/abc/photo'
                                                            className='w-full px-2.5 py-1.5 rounded-md text-[12px] text-[#3d2e1a] outline-none font-mono'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className='block text-[10.5px] text-[#7a6a52] font-semibold mb-1'>תווית (אופציונלי)</label>
                                                        <input
                                                            type='text'
                                                            value={editing.label}
                                                            onChange={e => setEditing(prev => ({ ...prev, label: e.target.value }))}
                                                            placeholder='למשל: סטיקרים על השולחנות'
                                                            className='w-full px-2.5 py-1.5 rounded-md text-[12px] text-[#3d2e1a] outline-none'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        />
                                                    </div>
                                                    <div className='flex items-center gap-2 pt-1'>
                                                        <button
                                                            onClick={handleSaveEdit}
                                                            disabled={busy[qr.code]}
                                                            className='inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-bold text-white'
                                                            style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', opacity: busy[qr.code] ? 0.6 : 1 }}
                                                        >
                                                            <Save size={11} /> שמור
                                                        </button>
                                                        <button
                                                            onClick={() => setEditing(null)}
                                                            className='inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        >
                                                            <X size={11} /> בטל
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className='grid grid-cols-2 gap-2 mb-3 text-[11px]'>
                                                        <div>
                                                            <p className='text-[10px] text-[#a89378] font-semibold mb-0.5'>חתונה</p>
                                                            <p className='text-[#3d2e1a] truncate' title={wedding?.label || ''}>
                                                                {wedding?.label || <span className='text-[#a89378]'>— ללא —</span>}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className='text-[10px] text-[#a89378] font-semibold mb-0.5'>יעד נוכחי</p>
                                                            <p className='text-[#3d2e1a] truncate font-mono text-[10.5px]' title={qr.targetUrl}>
                                                                {qr.targetUrl || <span className='text-[#a89378]'>— ריק —</span>}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className='flex items-center gap-1.5 flex-wrap'>
                                                        <button
                                                            onClick={() => setEditing({
                                                                code: qr.code,
                                                                targetUrl: qr.targetUrl || '',
                                                                label: qr.label || '',
                                                                weddingId: qr.weddingId || '',
                                                            })}
                                                            className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        >
                                                            <Pencil size={11} /> ערוך יעד
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleActive(qr)}
                                                            disabled={busy[qr.code]}
                                                            className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        >
                                                            {qr.active === false ? (<><Power size={11} /> הפעל</>) : (<><PowerOff size={11} /> השבת</>)}
                                                        </button>
                                                        <a
                                                            href={qr.targetUrl?.startsWith('http') ? qr.targetUrl : `${siteOrigin}${qr.targetUrl || '/'}`}
                                                            target='_blank'
                                                            rel='noreferrer'
                                                            className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-[#7a6a52]'
                                                            style={{ background: '#fff', border: '1px solid #ead9b3' }}
                                                        >
                                                            <ExternalLink size={11} /> בדוק יעד
                                                        </a>
                                                        <button
                                                            onClick={() => handleDelete(qr.code)}
                                                            disabled={busy[qr.code]}
                                                            className='inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold'
                                                            style={{ background: '#fff5f5', border: '1px solid #ffcdcd', color: '#b32424' }}
                                                        >
                                                            <Trash2 size={11} /> מחק
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Helper note */}
                <p className='mt-6 text-[11px] text-[#a89378] text-center leading-relaxed'>
                    הברקוד המודפס מקודד את <code className='font-mono'>/q/&lt;code&gt;</code>. שינוי היעד בכל רגע יחזור על המדבקות הקיימות —
                    אין צורך להדפיס מחדש. הברקוד נוצר עם רמת תיקון שגיאות גבוהה (H) ועומד באובדן של עד ~30% מהשטח (טביעות אצבע / קרעים).
                </p>
            </div>
        </div>
    )
}

export default function QrCodesPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <QrCodesContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
