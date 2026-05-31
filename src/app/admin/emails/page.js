'use client'

import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Mail, Send, Clock3, FileText, Zap, Lock, Plus, Trash2, Eye, Save, Users, MessageCircle } from 'lucide-react'

// Variables surfaced as insert buttons. Kept in sync with
// TEMPLATE_VARIABLES in src/lib/emailEngine.js (server-only — can't be
// imported here without pulling firebase-admin into the client bundle).
const VARS = [
    { key: 'coupleName', label: 'שם הזוג' },
    { key: 'weddingDate', label: 'תאריך האירוע' },
    { key: 'daysUntilWedding', label: 'ימים עד האירוע' },
    { key: 'bookButton', label: 'כפתור: ספר' },
    { key: 'whatsappButton', label: 'כפתור: וואטסאפ' },
    { key: 'portalButton', label: 'כפתור: פורטל' },
    { key: 'loginButton', label: 'כפתור: כניסה' },
    { key: 'guestLink', label: 'קישור אורחים' },
    { key: 'bookLink', label: 'קישור ספר' },
]

const SEGMENTS = [
    { type: 'all', label: 'כל הזוגות' },
    { type: 'upcoming', label: 'אירועים שטרם היו' },
    { type: 'nextNdays', label: 'אירוע ב-N הימים הקרובים' },
    { type: 'past', label: 'אירועים שעברו' },
    { type: 'noDate', label: 'בלי תאריך (לא הוקמו)' },
    { type: 'eventType', label: 'לפי סוג אירוע' },
]

const EVENT_TYPES = [
    { id: 'wedding', label: 'חתונה' },
    { id: 'birthday', label: 'יום הולדת' },
    { id: 'bar_mitzvah', label: 'בר מצווה' },
    { id: 'bat_mitzvah', label: 'בת מצווה' },
]

const TRIGGERS = [
    { type: 'beforeWedding', label: 'לפני האירוע' },
    { type: 'afterWedding', label: 'אחרי האירוע' },
    { type: 'afterPurchase', label: 'אחרי הרכישה' },
]

async function callEmailApi(op, payload = {}) {
    const user = auth.currentUser
    if (!user) throw new Error('יש להתחבר')
    const token = await user.getIdToken(false)
    const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ op, ...payload }),
    })
    if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || `שגיאה (${res.status})`)
    }
    return res.json()
}

function segmentLabel(seg) {
    if (!seg) return '—'
    const base = SEGMENTS.find(s => s.type === seg.type)?.label || seg.type
    if (seg.type === 'nextNdays') return `אירוע ב-${seg.n || 14} ימים הקרובים`
    if (seg.type === 'eventType') return `סוג: ${EVENT_TYPES.find(e => e.id === seg.eventType)?.label || seg.eventType}`
    return base
}

function triggerLabel(tr) {
    if (!tr) return '—'
    const base = TRIGGERS.find(t => t.type === tr.type)?.label || tr.type
    return `${tr.offsetDays} ימים ${base}`
}

export default function EmailsPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <EmailManager />
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
                <p className='text-[13px] text-[#a89378] max-w-xs leading-relaxed'>מערכת המיילים זמינה רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

function EmailManager() {
    const [tab, setTab] = useState('compose')
    const [toast, setToast] = useState(null)
    const flash = (message, type = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3500)
    }

    return (
        <div dir='rtl' className='min-h-screen' style={{ background: '#f8f4ec' }}>
            <div className='max-w-4xl mx-auto px-4 py-8'>
                <div className='flex items-center gap-3 mb-6'>
                    <div className='w-11 h-11 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                        <Mail size={20} className='text-white' />
                    </div>
                    <div>
                        <h1 className='text-xl font-bold text-[#1a1410]'>מיילים ומסע לקוח</h1>
                        <p className='text-xs text-[#a89378]'>שליחה, טמפלייטים, ותזמון אוטומטי לזוגות</p>
                    </div>
                </div>

                <div className='flex gap-2 mb-6 flex-wrap'>
                    <TabBtn id='compose' tab={tab} setTab={setTab} icon={Send} label='חיבור ושליחה' />
                    <TabBtn id='templates' tab={tab} setTab={setTab} icon={FileText} label='טמפלייטים' />
                    <TabBtn id='automations' tab={tab} setTab={setTab} icon={Zap} label='אוטומציות' />
                    <TabBtn id='history' tab={tab} setTab={setTab} icon={Clock3} label='היסטוריה' />
                </div>

                {tab === 'compose' && <Compose flash={flash} />}
                {tab === 'templates' && <Templates flash={flash} />}
                {tab === 'automations' && <Automations flash={flash} />}
                {tab === 'history' && <History flash={flash} />}
            </div>

            {toast && (
                <div
                    className='fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-lg z-50'
                    style={{ background: toast.type === 'error' ? '#c0392b' : 'linear-gradient(180deg,#d3b46a,#b8893d)' }}
                >
                    {toast.message}
                </div>
            )}
        </div>
    )
}

function TabBtn({ id, tab, setTab, icon: Icon, label }) {
    const active = tab === id
    return (
        <button
            onClick={() => setTab(id)}
            className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all'
            style={{
                background: active ? 'linear-gradient(180deg,#d3b46a,#b8893d)' : '#fff',
                color: active ? '#fff' : '#7a6a52',
                border: active ? 'none' : '1px solid rgba(212,184,103,0.3)',
            }}
        >
            <Icon size={14} /> {label}
        </button>
    )
}

function Card({ children, className = '' }) {
    return <div className={`bg-white rounded-2xl border border-[#e7dcc6] p-5 ${className}`}>{children}</div>
}

const inputCls =
    'w-full rounded-xl border border-[#e7dcc6] px-3 py-2.5 text-sm text-[#1a1410] outline-none focus:border-[#AA8840] bg-white'

// ─── Compose ─────────────────────────────────────────────────────────
function Compose({ flash }) {
    const [templates, setTemplates] = useState([])
    const [subject, setSubject] = useState('')
    const [bodyText, setBodyText] = useState('')
    const [seg, setSeg] = useState({ type: 'all', n: 14, eventType: 'wedding' })
    const [scheduleFor, setScheduleFor] = useState('')
    const [preview, setPreview] = useState(null)
    const [waList, setWaList] = useState(null)
    const [busy, setBusy] = useState(false)
    const bodyRef = useRef(null)

    useEffect(() => {
        callEmailApi('listTemplates').then(r => setTemplates(r.items || [])).catch(() => {})
    }, [])

    function loadTemplate(id) {
        const t = templates.find(x => x.id === id)
        if (t) {
            setSubject(t.subject || '')
            setBodyText(t.body || '')
        }
    }

    function insertVar(key) {
        const token = `{{${key}}}`
        const el = bodyRef.current
        if (!el) {
            setBodyText(b => b + token)
            return
        }
        const start = el.selectionStart ?? bodyText.length
        const end = el.selectionEnd ?? bodyText.length
        setBodyText(bodyText.slice(0, start) + token + bodyText.slice(end))
        requestAnimationFrame(() => {
            el.focus()
            el.selectionStart = el.selectionEnd = start + token.length
        })
    }

    async function doPreview() {
        setBusy(true)
        try {
            const r = await callEmailApi('preview', { subject, body: bodyText, segment: seg })
            setPreview(r)
        } catch (e) {
            flash(e.message, 'error')
        } finally {
            setBusy(false)
        }
    }

    async function doSend() {
        if (!subject.trim() || !bodyText.trim()) {
            flash('צריך נושא וגוף הודעה', 'error')
            return
        }
        const scheduled = scheduleFor && new Date(scheduleFor).getTime() > Date.now()
        const human = segmentLabel(seg)
        if (!confirm(scheduled ? `לתזמן שליחה אל "${human}"?` : `לשלוח עכשיו אל "${human}"?`)) return
        setBusy(true)
        try {
            const r = await callEmailApi('send', {
                subject,
                body: bodyText,
                segment: seg,
                scheduleFor: scheduled ? new Date(scheduleFor).toISOString() : null,
            })
            if (r.scheduled) flash('המייל תוזמן בהצלחה')
            else flash(`נשלח ל-${r.result?.sent || 0} זוגות (דילוג: ${r.result?.skipped || 0})`)
        } catch (e) {
            flash(e.message, 'error')
        } finally {
            setBusy(false)
        }
    }

    async function doWhatsapp() {
        if (!subject.trim() && !bodyText.trim()) {
            flash('כתבו הודעה קודם', 'error')
            return
        }
        setBusy(true)
        try {
            const r = await callEmailApi('waRecipients', { subject, body: bodyText, segment: seg })
            setWaList(r.items || [])
        } catch (e) {
            flash(e.message, 'error')
        } finally {
            setBusy(false)
        }
    }

    async function addPhone(id) {
        const phone = prompt('מספר טלפון של הזוג (למשל 0541234567):')
        if (!phone) return
        try {
            await callEmailApi('setPhone', { weddingId: id, phone })
            flash('הטלפון נשמר')
            doWhatsapp()
        } catch (e) {
            flash(e.message, 'error')
        }
    }

    return (
        <div className='space-y-4'>
            <Card>
                <label className='block text-xs font-bold text-[#7a6a52] mb-2'>טען מטמפלייט (לא חובה)</label>
                <select className={inputCls} defaultValue='' onChange={e => loadTemplate(e.target.value)}>
                    <option value=''>— בחר טמפלייט —</option>
                    {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </Card>

            <Card>
                <label className='block text-xs font-bold text-[#7a6a52] mb-2'>נושא</label>
                <input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} placeholder='למשל: עוד {{daysUntilWedding}} ימים לאירוע שלכם' />

                <label className='block text-xs font-bold text-[#7a6a52] mb-2 mt-4'>גוף ההודעה</label>
                <div className='flex flex-wrap gap-1.5 mb-2'>
                    {VARS.map(v => (
                        <button key={v.key} onClick={() => insertVar(v.key)} className='text-[11px] px-2 py-1 rounded-lg bg-[#AA8840]/10 text-[#7a6548] hover:bg-[#AA8840]/20 transition-colors' title={`{{${v.key}}}`}>
                            + {v.label}
                        </button>
                    ))}
                </div>
                <textarea ref={bodyRef} className={`${inputCls} min-h-[180px] leading-relaxed`} value={bodyText} onChange={e => setBodyText(e.target.value)} placeholder='שלום {{coupleName}}, ...' />
                <p className='text-[11px] text-[#a89378] mt-2'>{'שורות חדשות הופכות אוטומטית לירידות שורה. כפתורים כמו "כפתור: ספר" מוסיפים כפתור מעוצב.'}</p>
            </Card>

            <Card>
                <label className='flex items-center gap-2 text-xs font-bold text-[#7a6a52] mb-2'><Users size={13} /> תפוצה</label>
                <select className={inputCls} value={seg.type} onChange={e => setSeg(s => ({ ...s, type: e.target.value }))}>
                    {SEGMENTS.map(s => (
                        <option key={s.type} value={s.type}>{s.label}</option>
                    ))}
                </select>
                {seg.type === 'nextNdays' && (
                    <div className='mt-2 flex items-center gap-2'>
                        <span className='text-xs text-[#7a6a52]'>מספר ימים:</span>
                        <input type='number' min={1} max={120} className={`${inputCls} w-24`} value={seg.n} onChange={e => setSeg(s => ({ ...s, n: Number(e.target.value) }))} />
                    </div>
                )}
                {seg.type === 'eventType' && (
                    <select className={`${inputCls} mt-2`} value={seg.eventType} onChange={e => setSeg(s => ({ ...s, eventType: e.target.value }))}>
                        {EVENT_TYPES.map(e => (
                            <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                    </select>
                )}
            </Card>

            <Card>
                <label className='flex items-center gap-2 text-xs font-bold text-[#7a6a52] mb-2'><Clock3 size={13} /> תזמון (לא חובה — ריק = שליחה מיידית)</label>
                <input type='datetime-local' className={inputCls} value={scheduleFor} onChange={e => setScheduleFor(e.target.value)} />
            </Card>

            <div className='flex gap-2'>
                <button onClick={doPreview} disabled={busy} className='flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52] disabled:opacity-50'>
                    <Eye size={15} /> תצוגה מקדימה
                </button>
                <button onClick={doSend} disabled={busy} className='flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                    <Send size={15} /> {scheduleFor ? 'תזמן שליחה' : 'שלח עכשיו'}
                </button>
                <button onClick={doWhatsapp} disabled={busy} className='flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50' style={{ background: '#25D366' }}>
                    <MessageCircle size={15} /> וואטסאפ
                </button>
            </div>

            {preview && (
                <Card>
                    <div className='flex items-center justify-between mb-3'>
                        <span className='text-sm font-bold text-[#1a1410]'>תצוגה מקדימה</span>
                        <span className='text-xs font-bold text-[#AA8840] bg-[#AA8840]/10 px-3 py-1 rounded-full'>{preview.count} נמענים</span>
                    </div>
                    <p className='text-xs text-[#7a6a52] mb-1'><b>נושא:</b> {preview.preview?.subject}</p>
                    <iframe title='preview' className='w-full rounded-xl border border-[#e7dcc6] bg-white' style={{ height: 420 }} srcDoc={preview.preview?.html} />
                    {preview.sample?.length > 0 && (
                        <div className='mt-3'>
                            <p className='text-xs font-bold text-[#7a6a52] mb-1'>דוגמת נמענים:</p>
                            <div className='flex flex-wrap gap-1.5'>
                                {preview.sample.map(s => (
                                    <span key={s.id} className='text-[11px] bg-[#f0ebe0] text-[#7a6548] px-2 py-1 rounded-full'>{s.name} · {s.email}</span>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {waList && (
                <Card>
                    <div className='flex items-center justify-between mb-3'>
                        <span className='text-sm font-bold text-[#1a1410]'>שליחה בוואטסאפ — {waList.length} זוגות</span>
                    </div>
                    <p className='text-[11px] text-[#a89378] mb-3'>{'לחיצה פותחת וואטסאפ עם ההודעה מוכנה — שולחים מהטלפון שלך, זוג-זוג. (וואטסאפ לא מאפשר שליחה אוטומטית בכמות.)'}</p>
                    <div className='space-y-2 max-h-[360px] overflow-y-auto'>
                        {waList.map(r => (
                            <div key={r.id} className='flex items-center justify-between gap-2 border border-[#e7dcc6] rounded-xl px-3 py-2'>
                                <span className='text-sm text-[#1a1410] truncate'>{r.name}{r.hasPhone ? '' : ' · אין טלפון'}</span>
                                {r.hasPhone ? (
                                    <a href={r.waLink} target='_blank' rel='noopener noreferrer' className='flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg flex-shrink-0' style={{ background: '#25D366' }}>
                                        <MessageCircle size={13} /> שלח
                                    </a>
                                ) : (
                                    <button onClick={() => addPhone(r.id)} className='text-xs font-bold text-[#AA8840] bg-[#AA8840]/10 px-3 py-1.5 rounded-lg flex-shrink-0'>הוסף טלפון</button>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    )
}

// ─── Templates ───────────────────────────────────────────────────────
function Templates({ flash }) {
    const [items, setItems] = useState([])
    const [editing, setEditing] = useState(null) // {id?, name, subject, body}
    const load = () => callEmailApi('listTemplates').then(r => setItems(r.items || [])).catch(e => flash(e.message, 'error'))
    useEffect(() => { load() }, [])

    async function save() {
        if (!editing?.name?.trim()) return flash('צריך שם לטמפלייט', 'error')
        try {
            await callEmailApi('saveTemplate', { template: editing })
            setEditing(null)
            flash('נשמר')
            load()
        } catch (e) { flash(e.message, 'error') }
    }
    async function del(id) {
        if (!confirm('למחוק את הטמפלייט?')) return
        try { await callEmailApi('deleteTemplate', { id }); flash('נמחק'); load() } catch (e) { flash(e.message, 'error') }
    }
    async function seed() {
        try {
            const r = await callEmailApi('seedDefaults')
            flash(`נוצרו ${r.templatesCreated} טמפלייטים ו-${r.automationsCreated} אוטומציות`)
            load()
        } catch (e) {
            flash(e.message, 'error')
        }
    }

    return (
        <div className='space-y-4'>
            <div className='flex gap-2'>
                <button onClick={() => setEditing({ name: '', subject: '', body: '' })} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Plus size={14} /> טמפלייט חדש</button>
                <button onClick={seed} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52]'>טען מסע מלא (טמפלייטים + אוטומציות)</button>
            </div>

            {editing && (
                <Card>
                    <input className={`${inputCls} mb-2`} placeholder='שם הטמפלייט' value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                    <input className={`${inputCls} mb-2`} placeholder='נושא' value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} />
                    <textarea className={`${inputCls} min-h-[140px]`} placeholder='גוף ההודעה — אפשר {{coupleName}}, {{bookButton}} וכו׳' value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} />
                    <div className='flex gap-2 mt-3'>
                        <button onClick={save} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Save size={14} /> שמור</button>
                        <button onClick={() => setEditing(null)} className='rounded-xl px-4 py-2.5 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52]'>ביטול</button>
                    </div>
                </Card>
            )}

            {items.map(t => (
                <Card key={t.id}>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='font-bold text-[#1a1410] text-sm truncate'>{t.name}</p>
                            <p className='text-xs text-[#a89378] truncate'>{t.subject}</p>
                        </div>
                        <div className='flex gap-2 flex-shrink-0'>
                            <button onClick={() => setEditing(t)} className='text-xs font-bold text-[#AA8840] bg-[#AA8840]/10 px-3 py-1.5 rounded-lg'>עריכה</button>
                            <button onClick={() => del(t.id)} className='text-[#c0392b] p-1.5'><Trash2 size={15} /></button>
                        </div>
                    </div>
                </Card>
            ))}
            {items.length === 0 && !editing && <p className='text-center text-sm text-[#a89378] py-8'>אין טמפלייטים עדיין.</p>}
        </div>
    )
}

// ─── Automations ─────────────────────────────────────────────────────
function Automations({ flash }) {
    const [items, setItems] = useState([])
    const [templates, setTemplates] = useState([])
    const [editing, setEditing] = useState(null)
    const load = () => {
        callEmailApi('listAutomations').then(r => setItems(r.items || [])).catch(e => flash(e.message, 'error'))
        callEmailApi('listTemplates').then(r => setTemplates(r.items || [])).catch(() => {})
    }
    useEffect(() => { load() }, [])

    async function save() {
        if (!editing?.name?.trim() || !editing?.templateId) return flash('צריך שם וטמפלייט', 'error')
        try { await callEmailApi('saveAutomation', { automation: editing }); setEditing(null); flash('נשמר'); load() } catch (e) { flash(e.message, 'error') }
    }
    async function del(id) {
        if (!confirm('למחוק את הכלל?')) return
        try { await callEmailApi('deleteAutomation', { id }); flash('נמחק'); load() } catch (e) { flash(e.message, 'error') }
    }
    async function toggle(a) {
        try { await callEmailApi('saveAutomation', { automation: { ...a, active: !a.active } }); load() } catch (e) { flash(e.message, 'error') }
    }

    return (
        <div className='space-y-4'>
            <button onClick={() => setEditing({ name: '', templateId: '', trigger: { type: 'beforeWedding', offsetDays: 14 }, active: true })} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Plus size={14} /> כלל אוטומטי חדש</button>

            <p className='text-xs text-[#a89378]'>כלל אוטומטי רץ פעם ביום ושולח את הטמפלייט לכל זוג שמתאים לתנאי (למשל 14 ימים לפני האירוע). כל זוג מקבל כל כלל פעם אחת בלבד.</p>

            {editing && (
                <Card>
                    <input className={`${inputCls} mb-2`} placeholder='שם הכלל' value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                    <label className='block text-xs font-bold text-[#7a6a52] mb-1'>טמפלייט</label>
                    <select className={`${inputCls} mb-2`} value={editing.templateId} onChange={e => setEditing({ ...editing, templateId: e.target.value })}>
                        <option value=''>— בחר —</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <div className='flex items-center gap-2'>
                        <input type='number' min={0} max={365} className={`${inputCls} w-24`} value={editing.trigger.offsetDays} onChange={e => setEditing({ ...editing, trigger: { ...editing.trigger, offsetDays: Number(e.target.value) } })} />
                        <span className='text-xs text-[#7a6a52]'>ימים</span>
                        <select className={inputCls} value={editing.trigger.type} onChange={e => setEditing({ ...editing, trigger: { ...editing.trigger, type: e.target.value } })}>
                            {TRIGGERS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                    </div>
                    <div className='flex gap-2 mt-3'>
                        <button onClick={save} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Save size={14} /> שמור</button>
                        <button onClick={() => setEditing(null)} className='rounded-xl px-4 py-2.5 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52]'>ביטול</button>
                    </div>
                </Card>
            )}

            {items.map(a => (
                <Card key={a.id}>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='font-bold text-[#1a1410] text-sm truncate'>{a.name}</p>
                            <p className='text-xs text-[#a89378]'>{triggerLabel(a.trigger)} · {templates.find(t => t.id === a.templateId)?.name || 'טמפלייט נמחק'}</p>
                        </div>
                        <div className='flex items-center gap-2 flex-shrink-0'>
                            <button onClick={() => toggle(a)} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${a.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{a.active ? 'פעיל' : 'כבוי'}</button>
                            <button onClick={() => setEditing(a)} className='text-xs font-bold text-[#AA8840] bg-[#AA8840]/10 px-3 py-1.5 rounded-lg'>עריכה</button>
                            <button onClick={() => del(a.id)} className='text-[#c0392b] p-1.5'><Trash2 size={15} /></button>
                        </div>
                    </div>
                </Card>
            ))}
            {items.length === 0 && !editing && <p className='text-center text-sm text-[#a89378] py-8'>אין כללים אוטומטיים עדיין.</p>}
        </div>
    )
}

// ─── History ─────────────────────────────────────────────────────────
function History({ flash }) {
    const [items, setItems] = useState([])
    const load = () => callEmailApi('listCampaigns').then(r => setItems(r.items || [])).catch(e => flash(e.message, 'error'))
    useEffect(() => { load() }, [])
    async function del(id) {
        if (!confirm('למחוק מההיסטוריה?')) return
        try { await callEmailApi('deleteCampaign', { id }); load() } catch (e) { flash(e.message, 'error') }
    }
    return (
        <div className='space-y-3'>
            {items.map(c => (
                <Card key={c.id}>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='font-bold text-[#1a1410] text-sm truncate'>{c.subject || '(ללא נושא)'}</p>
                            <p className='text-xs text-[#a89378]'>{segmentLabel(c.segment)} · {c.status === 'scheduled' ? 'מתוזמן' : 'נשלח'}{c.result ? ` · ${c.result.sent} נשלחו` : ''}</p>
                        </div>
                        <button onClick={() => del(c.id)} className='text-[#c0392b] p-1.5 flex-shrink-0'><Trash2 size={15} /></button>
                    </div>
                </Card>
            ))}
            {items.length === 0 && <p className='text-center text-sm text-[#a89378] py-8'>אין שליחות עדיין.</p>}
        </div>
    )
}
