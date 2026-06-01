'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Lock, Palette, Save, RefreshCw, Eye, Check } from 'lucide-react'

// Built-in starting points. Each `design` is a partial theme override applied
// over the /photo page's built-in palette (empty = the classic built-in look).
const PRESETS = [
    { id: 'classic', name: 'קלאסי (ברירת מחדל)', swatch: '#c9a44e', design: {} },
    {
        id: 'bar_mitzvah',
        name: 'בר מצווה — כחול וזהב',
        swatch: '#16243d',
        design: {
            pageBg: '#0f1d33', pageBgImage: 'none',
            titleColor: '#f0e6c8', subtitleColor: '#9db4cf', accentColor: '#cba44e',
            cardBg: '#16243d', cardLabelColor: '#e8ddc0', cardCounterColor: '#8fa3bf',
            inputBg: '#0d1626', inputBorder: '#2e425f', inputFocusBorder: '#cba44e',
            inputTextColor: '#f0e6c8', inputPlaceholderColor: '#5f738c',
            buttonGradient: '#cba44e', trustText: '#8fa3bf',
        },
    },
    {
        id: 'pink',
        name: 'ורוד עדין',
        swatch: '#d98aa0',
        design: {
            pageBg: '#fdf0f3', pageBgImage: 'none',
            titleColor: '#5a2a3a', subtitleColor: '#b07a8c', accentColor: '#d98aa0',
            cardBg: '#fffafc', cardLabelColor: '#5a2a3a', cardCounterColor: '#c0a0aa',
            inputBg: '#fffafc', inputBorder: '#f0d0d8', inputFocusBorder: '#d98aa0',
            inputTextColor: '#5a2a3a', inputPlaceholderColor: '#d0aab4',
            buttonGradient: '#d98aa0', trustText: '#b89aa2',
        },
    },
    {
        id: 'green',
        name: 'ירוק טבעי',
        swatch: '#5f8f66',
        design: {
            pageBg: '#eef3ec', pageBgImage: 'none',
            titleColor: '#26352a', subtitleColor: '#6f8a72', accentColor: '#7ba27f',
            cardBg: '#fbfdfa', cardLabelColor: '#26352a', cardCounterColor: '#9ab09c',
            inputBg: '#fbfdfa', inputBorder: '#d2e0d0', inputFocusBorder: '#7ba27f',
            inputTextColor: '#26352a', inputPlaceholderColor: '#a8bca8',
            buttonGradient: '#5f8f66', trustText: '#8fa890',
        },
    },
]

// Editor defaults — the classic built-in palette, so every color picker shows
// a sensible value even before the user touches it.
const DEFAULT_DESIGN = {
    pageBg: '#f8f4ec', pageBgImage: 'none',
    titleColor: '#1a1410', subtitleColor: '#9a8a72', accentColor: '#c9a44e',
    cardBg: '#ffffff', cardLabelColor: '#1a1410', cardCounterColor: '#b9a684',
    inputBg: '#ffffff', inputBorder: '#ead9b3', inputFocusBorder: '#c9a44e',
    inputTextColor: '#1a1410', inputPlaceholderColor: '#c9b888',
    buttonGradient: '#c9a44e', trustText: '#b9a684',
}

const GROUPS = [
    { title: 'רקע העמוד', fields: [['pageBg', 'צבע רקע'], ['titleColor', 'כותרת'], ['subtitleColor', 'תת-כותרת'], ['accentColor', 'הדגשה']] },
    { title: 'כרטיס הטופס', fields: [['cardBg', 'רקע הכרטיס'], ['cardLabelColor', 'תוויות'], ['cardCounterColor', 'מונה תווים']] },
    { title: 'תיבות הטקסט', fields: [['inputBg', 'רקע'], ['inputBorder', 'מסגרת'], ['inputFocusBorder', 'מסגרת בפוקוס'], ['inputTextColor', 'טקסט'], ['inputPlaceholderColor', 'placeholder']] },
    { title: 'כפתור ושוליים', fields: [['buttonGradient', 'צבע כפתור'], ['trustText', 'טקסט אמון']] },
]

function encodeDesign(d) {
    try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(d))))
    } catch {
        return ''
    }
}

export default function GuestDesignPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <Editor />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}

function SuperAdminGate({ children }) {
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            setState(user && isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [])
    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                    <Lock size={20} className='text-white' />
                </div>
                <h2 className='text-[18px] font-bold text-[#1a1410] mb-1'>הגישה מוגבלת</h2>
                <p className='text-[13px] text-[#a89378]'>עיצוב דף הברכה זמין רק למנהל הראשי.</p>
            </div>
        )
    }
    return children
}

async function token() {
    return auth.currentUser.getIdToken(false)
}

function Editor() {
    const [weddings, setWeddings] = useState([])
    const [selWedding, setSelWedding] = useState('')
    const [design, setDesign] = useState({})
    const [bgImage, setBgImage] = useState('')
    const [previewSrc, setPreviewSrc] = useState('')
    const [busy, setBusy] = useState(false)
    const [saved, setSaved] = useState(false)
    const [toast, setToast] = useState(null)

    const flash = (m, type = 'success') => {
        setToast({ m, type })
        setTimeout(() => setToast(null), 3000)
    }

    useEffect(() => {
        ;(async () => {
            try {
                const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${await token()}` } })
                if (res.ok) {
                    const list = await res.json()
                    setWeddings(Array.isArray(list) ? list : [])
                    if (list[0]) {
                        setSelWedding(list[0].id)
                        if (list[0].guestDesign) setDesign(list[0].guestDesign)
                    }
                }
            } catch {
                /* ignore */
            }
        })()
    }, [])

    // When switching wedding, load its saved guestDesign (if any).
    function pickWedding(id) {
        setSelWedding(id)
        const w = weddings.find(x => x.id === id)
        setDesign(w?.guestDesign || {})
        setBgImage('')
    }

    // Debounced live preview — points the iframe at the real /photo page with
    // ?gd= so the design renders exactly as guests will see it.
    useEffect(() => {
        if (!selWedding) {
            setPreviewSrc('')
            return
        }
        const t = setTimeout(() => {
            setPreviewSrc(`/wedding/${selWedding}/photo?gd=${encodeDesign(design)}`)
        }, 450)
        return () => clearTimeout(t)
    }, [design, selWedding])

    function setField(key, value) {
        setDesign(prev => ({ ...prev, [key]: value }))
    }
    function onPageBg(value) {
        // A solid page colour means we also drop any built-in gradient image,
        // unless the user supplied an explicit background image below.
        setDesign(prev => ({ ...prev, pageBg: value, pageBgImage: bgImage ? prev.pageBgImage : 'none' }))
    }
    function onBgImage(url) {
        setBgImage(url)
        setDesign(prev =>
            url
                ? { ...prev, pageBgImage: `url(${url})`, pageBgSize: 'cover', pageBgPosition: 'center', pageBgRepeat: 'no-repeat' }
                : { ...prev, pageBgImage: 'none' },
        )
    }
    function loadPreset(p) {
        setDesign({ ...p.design })
        setBgImage('')
    }

    async function apply() {
        if (!selWedding) return flash('בחרו אירוע', 'error')
        setBusy(true)
        try {
            const res = await fetch('/api/admin/weddings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
                body: JSON.stringify({ weddingId: selWedding, patch: { guestDesign: design } }),
            })
            if (!res.ok) throw new Error('שמירה נכשלה')
            setWeddings(prev => prev.map(w => (w.id === selWedding ? { ...w, guestDesign: design } : w)))
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
            flash('העיצוב הוחל על האירוע ✓')
        } catch (e) {
            flash(e.message, 'error')
        } finally {
            setBusy(false)
        }
    }

    const val = key => design[key] ?? DEFAULT_DESIGN[key] ?? '#000000'

    return (
        <div dir='rtl' className='min-h-screen' style={{ background: '#f8f4ec' }}>
            <div className='max-w-[1500px] mx-auto px-4 py-8'>
                <div className='flex items-center justify-between gap-3 mb-6 flex-wrap'>
                    <div className='flex items-center gap-3'>
                        <div className='w-11 h-11 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                            <Palette size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='text-xl font-bold text-[#1a1410]'>עיצוב דף הברכה לאורחים</h1>
                            <p className='text-xs text-[#a89378]'>פריסטים, צבעים ורקע — עם תצוגה חיה. החלה על אירוע ספציפי.</p>
                        </div>
                    </div>
                    <a href='/admin/studio' className='text-sm font-bold text-[#7a6a52] bg-white border border-[#e7dcc6] rounded-xl px-3 py-2'>← לסטודיו</a>
                </div>

                <div className='grid lg:grid-cols-2 gap-6 items-start'>
                    {/* Controls */}
                    <div className='space-y-4'>
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>בחרו אירוע (לתצוגה והחלה)</label>
                            <select value={selWedding} onChange={e => pickWedding(e.target.value)} className='w-full rounded-xl border border-[#e7dcc6] px-3 py-2.5 text-sm bg-white outline-none focus:border-[#AA8840]'>
                                {weddings.map(w => {
                                    const name = w.brideName && w.groomName ? `${w.brideName} ו${w.groomName}` : (w.celebrantName || w.ownerEmail || w.id)
                                    return <option key={w.id} value={w.id}>{name}</option>
                                })}
                            </select>
                        </div>

                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-3'>פריסטים מוכנים</label>
                            <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
                                {PRESETS.map(p => (
                                    <button key={p.id} onClick={() => loadPreset(p)} className='rounded-xl border border-[#e7dcc6] p-2 hover:border-[#AA8840] transition-colors text-center'>
                                        <span className='block w-full h-8 rounded-lg mb-1.5' style={{ background: p.swatch }} />
                                        <span className='text-[11px] font-bold text-[#5a4a32]'>{p.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {GROUPS.map(g => (
                            <div key={g.title} className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                                <label className='block text-xs font-bold text-[#7a6a52] mb-3'>{g.title}</label>
                                <div className='grid grid-cols-2 gap-3'>
                                    {g.fields.map(([key, label]) => (
                                        <label key={key} className='flex items-center gap-2 text-xs text-[#5a4a32]'>
                                            <input
                                                type='color'
                                                value={val(key)}
                                                onChange={e => (key === 'pageBg' ? onPageBg(e.target.value) : setField(key, e.target.value))}
                                                className='w-9 h-9 rounded-lg border border-[#e7dcc6] cursor-pointer p-0.5 bg-white flex-shrink-0'
                                            />
                                            <span className='truncate'>{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>תמונת רקע (URL, אופציונלי)</label>
                            <input value={bgImage} onChange={e => onBgImage(e.target.value)} placeholder='https://.../bg.webp' className='w-full rounded-xl border border-[#e7dcc6] px-3 py-2.5 text-sm bg-white outline-none focus:border-[#AA8840]' dir='ltr' />
                            <p className='text-[11px] text-[#a89378] mt-2'>השאירו ריק לרקע צבע אחיד. לטקסטים (כותרות/כפתורים) — נערכים במסך הניהול של האירוע.</p>
                        </div>

                        <div className='flex gap-2'>
                            <button onClick={apply} disabled={busy} className='flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                                {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'הוחל!' : 'החל על האירוע'}
                            </button>
                            <button onClick={() => { setDesign({}); setBgImage('') }} className='flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52]'>
                                <RefreshCw size={14} /> אפס
                            </button>
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className='lg:sticky lg:top-6'>
                        <div className='flex items-center gap-2 mb-2 text-xs font-bold text-[#7a6a52]'><Eye size={13} /> תצוגה חיה</div>
                        <div className='rounded-2xl overflow-hidden border border-[#e7dcc6] bg-white shadow-lg' style={{ height: 680 }}>
                            {previewSrc ? (
                                <iframe src={previewSrc} title='תצוגה' className='w-full h-full' style={{ border: 'none' }} />
                            ) : (
                                <div className='h-full flex items-center justify-center text-sm text-[#a89378]'>בחרו אירוע לתצוגה</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {toast && (
                <div className='fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-lg z-50' style={{ background: toast.type === 'error' ? '#c0392b' : 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                    {toast.m}
                </div>
            )}
        </div>
    )
}
