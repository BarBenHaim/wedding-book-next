'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { Lock, Palette, Save, RefreshCw, Eye, Check, Upload, Smartphone, Tablet, Monitor, Type } from 'lucide-react'

const PRESETS = [
    { id: 'classic', name: 'קלאסי (ברירת מחדל)', swatch: '#c9a44e', design: {} },
    {
        id: 'bar_mitzvah', name: 'בר מצווה — כחול וזהב', swatch: '#16243d',
        design: {
            pageBg: '#0f1d33', pageBgImage: 'none', titleColor: '#f0e6c8', subtitleColor: '#9db4cf', accentColor: '#cba44e',
            cardBg: '#16243d', cardLabelColor: '#e8ddc0', cardCounterColor: '#8fa3bf',
            inputBg: '#0d1626', inputBorder: '#2e425f', inputFocusBorder: '#cba44e', inputTextColor: '#f0e6c8', inputPlaceholderColor: '#5f738c',
            buttonGradient: '#cba44e', trustText: '#8fa3bf',
            cardBorder: '#2e425f', cardFrame: '#1f3050', iconColor: '#8fa3bf',
            pillBg: '#16243d', pillBorder: '#cba44e', pillText: '#e8ddc0',
            wellBg: '#0d1626', wellBorder: '#2e425f', cornerImage: 'none',
        },
    },
    {
        id: 'pink', name: 'ורוד עדין', swatch: '#d98aa0',
        design: {
            pageBg: '#fdf0f3', pageBgImage: 'none', titleColor: '#5a2a3a', subtitleColor: '#b07a8c', accentColor: '#d98aa0',
            cardBg: '#fffafc', cardLabelColor: '#5a2a3a', cardCounterColor: '#c0a0aa',
            inputBg: '#fffafc', inputBorder: '#f0d0d8', inputFocusBorder: '#d98aa0', inputTextColor: '#5a2a3a', inputPlaceholderColor: '#d0aab4',
            buttonGradient: '#d98aa0', trustText: '#b89aa2',
            cardBorder: '#e7b8c4', cardFrame: '#ffffff', iconColor: '#b07a8c',
            pillBg: '#fffafc', pillBorder: '#d98aa0', pillText: '#5a2a3a',
            wellBg: '#fff5f8', wellBorder: '#f0d0d8',
        },
    },
    {
        id: 'green', name: 'ירוק טבעי', swatch: '#5f8f66',
        design: {
            pageBg: '#eef3ec', pageBgImage: 'none', titleColor: '#26352a', subtitleColor: '#6f8a72', accentColor: '#7ba27f',
            cardBg: '#fbfdfa', cardLabelColor: '#26352a', cardCounterColor: '#9ab09c',
            inputBg: '#fbfdfa', inputBorder: '#d2e0d0', inputFocusBorder: '#7ba27f', inputTextColor: '#26352a', inputPlaceholderColor: '#a8bca8',
            buttonGradient: '#5f8f66', trustText: '#8fa890',
            cardBorder: '#bcd0bc', cardFrame: '#ffffff', iconColor: '#6f8a72',
            pillBg: '#fbfdfa', pillBorder: '#7ba27f', pillText: '#26352a',
            wellBg: '#f3f7f1', wellBorder: '#d2e0d0',
        },
    },
]

const DEFAULT_DESIGN = {
    pageBg: '#fbf6ec', pageBgImage: 'none', titleColor: '#1a1410', subtitleColor: '#7a6a52', accentColor: '#c9a44e',
    cardBg: '#ffffff', cardLabelColor: '#1a1410', cardCounterColor: '#b9a684',
    inputBg: '#fbf6ec', inputBorder: '#ead9b3', inputFocusBorder: '#c9a44e', inputTextColor: '#1a1410', inputPlaceholderColor: '#c9b888',
    buttonGradient: '#c9a44e', trustText: '#b9a684',
    cardBorder: '#c9a44e', cardFrame: '#ffffff', iconColor: '#9a8665',
    pillBg: '#fdf8ec', pillBorder: '#c9a44e', pillText: '#8a6d40',
    wellBg: '#fbf3e3', wellBorder: '#c9a44e',
}

const GROUPS = [
    { title: 'רקע העמוד', fields: [['pageBg', 'צבע רקע'], ['titleColor', 'כותרת'], ['subtitleColor', 'תת-כותרת'], ['accentColor', 'הדגשה']] },
    { title: 'כרטיס הטופס', fields: [['cardBg', 'רקע הכרטיס'], ['cardLabelColor', 'תוויות'], ['cardCounterColor', 'מונה תווים'], ['cardBorder', 'מסגרת'], ['cardFrame', 'מסגרת פנימית'], ['iconColor', 'אייקונים']] },
    { title: 'תגית עליונה', fields: [['pillBg', 'רקע התגית'], ['pillBorder', 'מסגרת'], ['pillText', 'טקסט']] },
    { title: 'אזור התמונה', fields: [['wellBg', 'רקע'], ['wellBorder', 'מסגרת']] },
    { title: 'תיבות הטקסט', fields: [['inputBg', 'רקע'], ['inputBorder', 'מסגרת'], ['inputFocusBorder', 'מסגרת בפוקוס'], ['inputTextColor', 'טקסט'], ['inputPlaceholderColor', 'רמז']] },
]

// formCopy-shape keys → the wedding-doc fields the PATCH whitelist accepts.
const COPY_FIELDS = [
    ['momentSubtitle', 'תת-כותרת', 'customMomentSubtitle'],
    ['momentPill', 'תגית עליונה', 'customMomentPill'],
    ['momentPhotoTitle', 'כותרת מקטע התמונה', 'customMomentPhotoTitle'],
    ['momentPhotoCta', 'כפתור הוספת תמונה', 'customMomentPhotoCta'],
    ['momentPhotoCtaSub', 'טקסט משני לכפתור', 'customMomentPhotoCtaSub'],
    ['momentTakeNow', 'צילום עכשיו', 'customMomentTakeNow'],
    ['momentChooseGallery', 'בחירה מהגלריה', 'customMomentChooseGallery'],
    ['momentSubmit', 'כפתור השליחה', 'customMomentSubmit'],
    ['momentSecurityNote', 'הערת אבטחה (למטה)', 'customMomentSecurityNote'],
    ['nameLabel', 'תווית שדה השם', 'customNameLabel'],
    ['namePlaceholder', 'רמז בשדה השם', 'customNamePlaceholder'],
    ['blessingLabel', 'תווית שדה הברכה', 'customBlessingLabel'],
    ['blessingPlaceholder', 'רמז בשדה הברכה', 'customBlessingPlaceholder'],
]

function b64(obj) {
    try {
        return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    } catch {
        return ''
    }
}
function nonEmpty(obj) {
    const out = {}
    for (const k in obj) if (obj[k] && String(obj[k]).trim()) out[k] = obj[k]
    return out
}

const WIDTHS = [
    { id: '390px', label: 'מובייל', icon: Smartphone },
    { id: '768px', label: 'טאבלט', icon: Tablet },
    { id: '100%', label: 'מלא', icon: Monitor },
]

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
        const unsub = onAuthStateChanged(auth, user => setState(user && isSuperAdmin(user.email) ? 'allowed' : 'denied'))
        return unsub
    }, [])
    if (state === 'checking') return <div className='flex h-screen items-center justify-center text-[#7a6a52]'>טוען...</div>
    if (state === 'denied') {
        return (
            <div className='flex h-screen flex-col items-center justify-center text-center px-6' style={{ background: '#f8f4ec' }}>
                <div className='w-12 h-12 rounded-2xl flex items-center justify-center mb-4' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Lock size={20} className='text-white' /></div>
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
    const [copy, setCopy] = useState({})
    const [bgImage, setBgImage] = useState('')
    const [btnImg, setBtnImg] = useState('')
    const [previewWidth, setPreviewWidth] = useState('390px')
    const [previewSrc, setPreviewSrc] = useState('')
    const [busy, setBusy] = useState(false)
    const [uploading, setUploading] = useState('')
    const [saved, setSaved] = useState(false)
    const [toast, setToast] = useState(null)
    const flash = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }

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

    function pickWedding(id) {
        setSelWedding(id)
        const w = weddings.find(x => x.id === id)
        setDesign(w?.guestDesign || {})
        setCopy({})
        setBgImage('')
        setBtnImg('')
    }

    useEffect(() => {
        if (!selWedding) {
            setPreviewSrc('')
            return
        }
        const t = setTimeout(() => {
            setPreviewSrc(`/wedding/${selWedding}/photo?gd=${b64(design)}&gc=${b64(nonEmpty(copy))}`)
        }, 450)
        return () => clearTimeout(t)
    }, [design, copy, selWedding])

    const setField = (key, value) => setDesign(prev => ({ ...prev, [key]: value }))
    const onPageBg = value => setDesign(prev => ({ ...prev, pageBg: value, pageBgImage: bgImage ? prev.pageBgImage : 'none' }))
    function onBgImageUrl(url) {
        setBgImage(url)
        setDesign(prev => (url
            ? { ...prev, pageBgImage: `url(${url})`, pageBgSize: 'cover', pageBgPosition: 'center', pageBgRepeat: 'no-repeat' }
            : { ...prev, pageBgImage: 'none' }))
    }

    async function uploadImage(file) {
        const safe = (file.name || 'bg').replace(/[^\w.\-]/g, '_')
        const r = storageRef(storage, `studio/backgrounds/guest-${Date.now()}-${safe}`)
        await uploadBytes(r, file, { contentType: file.type || 'image/png' })
        return getDownloadURL(r)
    }
    async function onUploadPageBg(file) {
        if (!file) return
        setUploading('page')
        try {
            const url = await uploadImage(file)
            onBgImageUrl(url)
        } catch (e) {
            flash('העלאה נכשלה: ' + (e?.message || ''), 'error')
        } finally {
            setUploading('')
        }
    }
    async function onUploadBtnBg(file) {
        if (!file) return
        setUploading('button')
        try {
            const url = await uploadImage(file)
            setBtnImg(url)
            setDesign(prev => ({ ...prev, buttonGradient: `url(${url}) center/cover no-repeat` }))
        } catch (e) {
            flash('העלאה נכשלה: ' + (e?.message || ''), 'error')
        } finally {
            setUploading('')
        }
    }

    async function onUploadCorner(file) {
        if (!file) return
        setUploading('corner')
        try {
            const url = await uploadImage(file)
            setField('cornerImage', url)
        } catch (e) {
            flash('העלאה נכשלה: ' + (e?.message || ''), 'error')
        } finally {
            setUploading('')
        }
    }

    function loadPreset(p) {
        setDesign({ ...p.design })
        setBgImage('')
        setBtnImg('')
    }

    async function apply() {
        if (!selWedding) return flash('בחרו אירוע', 'error')
        setBusy(true)
        try {
            const patch = { guestDesign: design }
            for (const [key, , docKey] of COPY_FIELDS) {
                if (copy[key] && String(copy[key]).trim()) patch[docKey] = copy[key]
            }
            const res = await fetch('/api/admin/weddings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
                body: JSON.stringify({ weddingId: selWedding, patch }),
            })
            if (!res.ok) throw new Error('שמירה נכשלה')
            setWeddings(prev => prev.map(w => (w.id === selWedding ? { ...w, guestDesign: design } : w)))
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
            flash('הוחל על האירוע ✓')
        } catch (e) {
            flash(e.message, 'error')
        } finally {
            setBusy(false)
        }
    }

    const val = key => design[key] ?? DEFAULT_DESIGN[key] ?? '#000000'
    const fileBtn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold bg-[#AA8840]/10 text-[#AA8840] cursor-pointer'

    return (
        <div dir='rtl' className='min-h-screen' style={{ background: '#f8f4ec' }}>
            <div className='max-w-[1500px] mx-auto px-4 py-8'>
                <div className='flex items-center justify-between gap-3 mb-6 flex-wrap'>
                    <div className='flex items-center gap-3'>
                        <div className='w-11 h-11 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}><Palette size={20} className='text-white' /></div>
                        <div>
                            <h1 className='text-xl font-bold text-[#1a1410]'>עיצוב דף הברכה לאורחים</h1>
                            <p className='text-xs text-[#a89378]'>פריסטים, צבעים, רקע, וטקסטים — עם תצוגה חיה.</p>
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
                                            <input type='color' value={val(key)} onChange={e => (key === 'pageBg' ? onPageBg(e.target.value) : setField(key, e.target.value))} className='w-9 h-9 rounded-lg border border-[#e7dcc6] cursor-pointer p-0.5 bg-white flex-shrink-0' />
                                            <span className='truncate'>{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Page background image */}
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>תמונת רקע לעמוד</label>
                            <div className='flex items-center gap-2 flex-wrap'>
                                <label className={fileBtn}>
                                    <Upload size={13} /> {uploading === 'page' ? 'מעלה...' : 'העלאת תמונה'}
                                    <input type='file' accept='image/*' className='hidden' onChange={e => onUploadPageBg(e.target.files?.[0])} />
                                </label>
                                {bgImage && <span className='text-[11px] text-emerald-600 font-bold'>✓ הועלתה</span>}
                                {bgImage && <button onClick={() => onBgImageUrl('')} className='text-[11px] text-red-500'>הסר</button>}
                            </div>
                            <input value={bgImage} onChange={e => onBgImageUrl(e.target.value)} placeholder='או הדביקו URL...' className='w-full mt-2 rounded-xl border border-[#e7dcc6] px-3 py-2 text-xs bg-white outline-none focus:border-[#AA8840]' dir='ltr' />
                        </div>

                        {/* Corner decoration (flower) */}
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-2'>פרח / קישוט בפינה</label>
                            <div className='flex items-center gap-2 flex-wrap'>
                                <label className={fileBtn}>
                                    <Upload size={13} /> {uploading === 'corner' ? 'מעלה...' : 'העלאת תמונה'}
                                    <input type='file' accept='image/*' className='hidden' onChange={e => onUploadCorner(e.target.files?.[0])} />
                                </label>
                                <button onClick={() => setField('cornerImage', 'none')} className='text-[11px] text-red-500 font-bold'>הסר קישוט</button>
                                <button onClick={() => setField('cornerImage', '/backgrounds/flowers.svg')} className='text-[11px] text-[#7a6a52] font-bold'>פרח ברירת מחדל</button>
                            </div>
                            <input
                                value={typeof design.cornerImage === 'string' && design.cornerImage !== 'none' ? design.cornerImage : ''}
                                onChange={e => setField('cornerImage', e.target.value || 'none')}
                                placeholder='או הדביקו URL...'
                                className='w-full mt-2 rounded-xl border border-[#e7dcc6] px-3 py-2 text-xs bg-white outline-none focus:border-[#AA8840]'
                                dir='ltr'
                            />
                            {design.cornerImage === 'none' && <p className='text-[10.5px] text-[#a89378] mt-1.5'>אין קישוט (מוסתר)</p>}
                        </div>

                        {/* Button */}
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='block text-xs font-bold text-[#7a6a52] mb-3'>כפתור השליחה</label>
                            <div className='flex items-center gap-3 flex-wrap'>
                                <label className='flex items-center gap-2 text-xs text-[#5a4a32]'>
                                    <input type='color' value={/^#/.test(val('buttonGradient')) ? val('buttonGradient') : '#c9a44e'} onChange={e => { setBtnImg(''); setField('buttonGradient', e.target.value) }} className='w-9 h-9 rounded-lg border border-[#e7dcc6] cursor-pointer p-0.5 bg-white' />
                                    צבע
                                </label>
                                <label className={fileBtn}>
                                    <Upload size={13} /> {uploading === 'button' ? 'מעלה...' : 'תמונת רקע לכפתור'}
                                    <input type='file' accept='image/*' className='hidden' onChange={e => onUploadBtnBg(e.target.files?.[0])} />
                                </label>
                                {btnImg && <span className='text-[11px] text-emerald-600 font-bold'>✓ תמונה</span>}
                                <label className='flex items-center gap-2 text-xs text-[#5a4a32]'>
                                    <input type='color' value={val('trustText')} onChange={e => setField('trustText', e.target.value)} className='w-9 h-9 rounded-lg border border-[#e7dcc6] cursor-pointer p-0.5 bg-white' />
                                    טקסט אמון
                                </label>
                            </div>
                        </div>

                        {/* Texts */}
                        <div className='bg-white rounded-2xl border border-[#e7dcc6] p-4'>
                            <label className='flex items-center gap-2 text-xs font-bold text-[#7a6a52] mb-3'><Type size={13} /> טקסטים (ריק = ברירת מחדל)</label>
                            <div className='space-y-2'>
                                {COPY_FIELDS.map(([key, label]) => (
                                    <div key={key}>
                                        <span className='block text-[10.5px] text-[#a89378] mb-0.5'>{label}</span>
                                        <input value={copy[key] || ''} onChange={e => setCopy(prev => ({ ...prev, [key]: e.target.value }))} className='w-full rounded-lg border border-[#e7dcc6] px-2.5 py-1.5 text-xs bg-white outline-none focus:border-[#AA8840]' />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className='flex gap-2 sticky bottom-3 z-10'>
                            <button onClick={apply} disabled={busy} className='flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50' style={{ background: 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>
                                {saved ? <Check size={15} /> : <Save size={15} />} {saved ? 'הוחל!' : 'החל על האירוע'}
                            </button>
                            <button onClick={() => { setDesign({}); setCopy({}); setBgImage(''); setBtnImg('') }} className='flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold bg-white border border-[#e7dcc6] text-[#7a6a52] shadow'>
                                <RefreshCw size={14} /> אפס
                            </button>
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className='lg:sticky lg:top-6'>
                        <div className='flex items-center justify-between mb-2 flex-wrap gap-2'>
                            <span className='flex items-center gap-2 text-xs font-bold text-[#7a6a52]'><Eye size={13} /> תצוגה חיה</span>
                            <div className='flex items-center gap-1 bg-white border border-[#e7dcc6] rounded-xl p-1'>
                                {WIDTHS.map(w => {
                                    const active = previewWidth === w.id
                                    const Icon = w.icon
                                    return (
                                        <button key={w.id} onClick={() => setPreviewWidth(w.id)} className='flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors' style={{ background: active ? 'linear-gradient(180deg,#d3b46a,#b8893d)' : 'transparent', color: active ? '#fff' : '#7a6a52' }}>
                                            <Icon size={12} /> {w.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <div className='rounded-2xl bg-[#efe7d6] p-3 border border-[#e7dcc6]' style={{ height: 700 }}>
                            <div className='h-full mx-auto transition-all duration-300' style={{ maxWidth: previewWidth }}>
                                {previewSrc ? (
                                    <iframe src={previewSrc} title='תצוגה' className='w-full h-full rounded-xl bg-white shadow' style={{ border: 'none' }} />
                                ) : (
                                    <div className='h-full flex items-center justify-center text-sm text-[#a89378]'>בחרו אירוע לתצוגה</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {toast && (
                <div className='fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-bold text-white shadow-lg z-50' style={{ background: toast.type === 'error' ? '#c0392b' : 'linear-gradient(180deg,#d3b46a,#b8893d)' }}>{toast.m}</div>
            )}
        </div>
    )
}
