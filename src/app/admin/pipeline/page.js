'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Lock, KanbanSquare, MessageCircle, Printer, RefreshCw } from 'lucide-react'

// Production pipeline — one board to see where every event stands and
// move it along: new → set up → pre-event → collecting → to print →
// shipped → delivered. Status lives on wedding.productionStatus and is
// read/written through the existing /api/admin/weddings GET + PATCH.

const STATUSES = [
    { id: 'new', label: 'חדש', color: '#9ca3af' },
    { id: 'setup', label: 'הוקם', color: '#6366f1' },
    { id: 'pre_event', label: 'לפני האירוע', color: '#0ea5e9' },
    { id: 'collecting', label: 'אוסף ברכות', color: '#f59e0b' },
    { id: 'to_print', label: 'להדפסה', color: '#a855f7' },
    { id: 'shipped', label: 'נשלח', color: '#14b8a6' },
    { id: 'delivered', label: 'נמסר', color: '#22c55e' },
]

async function token() {
    const u = auth.currentUser
    if (!u) throw new Error('יש להתחבר')
    return u.getIdToken(false)
}

function coupleLabel(w) {
    const b = (w.brideName || '').trim()
    const g = (w.groomName || '').trim()
    if (b && g) return `${b} ו${g}`
    return b || g || w.celebrantName || w.ownerEmail || '—'
}

function dateInfo(iso) {
    if (!iso) return { text: 'אין תאריך', days: null }
    const d = new Date(iso)
    if (isNaN(d.getTime())) return { text: 'אין תאריך', days: null }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = new Date(d)
    day.setHours(0, 0, 0, 0)
    const days = Math.round((day.getTime() - today.getTime()) / 86400000)
    const text = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    return { text, days }
}

export default function PipelinePage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <Board />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}

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
    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)' }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>לוח ההפקה זמין רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

function Board() {
    const [weddings, setWeddings] = useState([])
    const [status, setStatus] = useState('loading')

    async function load() {
        setStatus('loading')
        try {
            const t = await token()
            const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${t}` } })
            if (!res.ok) throw new Error('fetch failed')
            const data = await res.json()
            setWeddings(Array.isArray(data) ? data : [])
            setStatus('ok')
        } catch {
            setStatus('error')
        }
    }
    useEffect(() => {
        load()
    }, [])

    async function move(id, newStatus) {
        setWeddings(ws => ws.map(w => (w.id === id ? { ...w, productionStatus: newStatus } : w)))
        try {
            const t = await token()
            await fetch('/api/admin/weddings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                body: JSON.stringify({ weddingId: id, patch: { productionStatus: newStatus } }),
            })
        } catch {
            load()
        }
    }

    const byStatus = id =>
        weddings
            .filter(w => (w.productionStatus || 'new') === id)
            .sort((a, b) => {
                const da = a.weddingDate ? new Date(a.weddingDate).getTime() : Infinity
                const db = b.weddingDate ? new Date(b.weddingDate).getTime() : Infinity
                return da - db
            })

    return (
        <div dir='rtl' className='min-h-screen' style={{ background: '#f8f4ec' }}>
            <div className='max-w-[1400px] mx-auto px-4 py-8'>
                <div className='flex items-center justify-between mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-11 h-11 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                            <KanbanSquare size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='text-xl font-bold text-[#1a1410]'>לוח הפקה</h1>
                            <p className='text-xs text-[#a89378]'>איפה כל אירוע עומד — מבט אחד על כל ה-{weddings.length} אירועים</p>
                        </div>
                    </div>
                    <button onClick={load} className='flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52]'>
                        <RefreshCw size={14} /> רענון
                    </button>
                </div>

                {status === 'loading' && <p className='text-center text-[#a89378] py-12'>טוען...</p>}
                {status === 'error' && <p className='text-center text-red-500 py-12'>שגיאה בטעינה. נסה רענון.</p>}

                {status === 'ok' && (
                    <div className='flex gap-3 overflow-x-auto pb-4' style={{ scrollbarWidth: 'thin' }}>
                        {STATUSES.map(col => {
                            const items = byStatus(col.id)
                            return (
                                <div key={col.id} className='flex-shrink-0 w-[260px]'>
                                    <div className='flex items-center gap-2 mb-3 px-1'>
                                        <span className='w-2.5 h-2.5 rounded-full' style={{ background: col.color }} />
                                        <span className='text-sm font-bold text-[#1a1410]'>{col.label}</span>
                                        <span className='text-xs text-[#a89378]'>{items.length}</span>
                                    </div>
                                    <div className='space-y-2.5'>
                                        {items.map(w => (
                                            <WeddingCard key={w.id} w={w} onMove={move} />
                                        ))}
                                        {items.length === 0 && <div className='text-[11px] text-[#c3b698] text-center py-6 border border-dashed border-[#e7dcc6] rounded-xl'>—</div>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function WeddingCard({ w, onMove }) {
    const di = dateInfo(w.weddingDate)
    const cur = w.productionStatus || 'new'
    // Flag attention: event already happened but still in an early stage.
    const passedButEarly = di.days != null && di.days < 0 && ['new', 'setup', 'pre_event'].includes(cur)
    return (
        <div className='bg-white rounded-xl border border-[#e7dcc6] p-3' style={passedButEarly ? { borderColor: '#f0b8b8', boxShadow: '0 0 0 1px #f0b8b8' } : undefined}>
            <p className='text-sm font-bold text-[#1a1410] truncate'>{coupleLabel(w)}</p>
            <div className='flex items-center gap-2 mt-1 flex-wrap'>
                <span className='text-[11px] text-[#7a6a52]'>{di.text}</span>
                {di.days != null && (
                    <span className='text-[10px] font-bold px-1.5 py-0.5 rounded-full' style={{ background: di.days < 0 ? '#f3e8e8' : '#eef5ee', color: di.days < 0 ? '#b04a4a' : '#3a7a3a' }}>
                        {di.days < 0 ? `עבר לפני ${-di.days} ימים` : di.days === 0 ? 'היום!' : `בעוד ${di.days} ימים`}
                    </span>
                )}
                <span className='text-[10px] text-[#a89378]'>· {w.greetingsCount ?? 0} ברכות</span>
            </div>

            <select
                value={cur}
                onChange={e => onMove(w.id, e.target.value)}
                className='w-full mt-2.5 text-xs rounded-lg border border-[#e7dcc6] px-2 py-1.5 bg-[#fbf8f1] text-[#1a1410] outline-none focus:border-[#AA8840]'
            >
                {STATUSES.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                ))}
            </select>

            <div className='flex gap-2 mt-2 flex-wrap'>
                <a href={`/admin/wedding/${w.id}/albume-export`} className='flex items-center gap-1 text-[10.5px] font-bold text-white bg-[#0e9f8e] px-2 py-1 rounded-lg'>
                    <Printer size={11} /> albume
                </a>
                <a href={`/admin/wedding/${w.id}/print-export`} className='flex items-center gap-1 text-[10.5px] font-bold text-[#AA8840] bg-[#AA8840]/10 px-2 py-1 rounded-lg'>
                    <Printer size={11} /> WOW Pro
                </a>
                {w.slug && (
                    <a href={`/w/${w.slug}`} target='_blank' rel='noopener noreferrer' className='flex items-center gap-1 text-[10.5px] font-bold text-[#7a6a52] bg-[#f0ebe0] px-2 py-1 rounded-lg'>
                        <MessageCircle size={11} /> דף אורחים
                    </a>
                )}
            </div>
        </div>
    )
}
