'use client'

// /admin/landing — super-admin control panel for the marketing landing
// page (/landing).
//
// Two jobs:
//   1. "רענן את דף הנחיתה" — one button that revalidates /landing on
//      demand. Changed a preset / cover / guest design on one of the
//      showcased projects? Click → the landing rebuilds with the
//      current data immediately (no waiting for the 5-minute ISR).
//   2. Manage WHICH projects the landing shows: the live-demo wedding
//      and the chapter list (order, titles, stories, quotes, stats,
//      live-book link, images). Saved to `site_config/landing` via
//      /api/admin/landing; saving auto-revalidates.
//
// Images note: the three built-in image sets (wedding / bar-mitzvah /
// birthday) are curated static captures. For a NEW project either pick
// one of those sets or paste image URLs (cover + spreads) — e.g.
// Firebase Storage links.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { isSuperAdmin } from '@/lib/superAdmin'
import AdminPageWrapper from '@/components/AdminPageWrapper/AdminPageWrapper'
import { DEFAULT_CHAPTERS } from '@/app/landing/LandingClient'
import {
    Newspaper, ChevronRight, RefreshCw, Save, Plus, Trash2, ArrowUp, ArrowDown,
    ExternalLink, Link2, Loader2, BookOpen,
} from 'lucide-react'

const THEME_OPTIONS = [
    { value: 'ivory', label: 'שנהב (בהיר)' },
    { value: 'ink', label: 'כהה (דיו)' },
    { value: 'blush', label: 'ורוד רך' },
]
const SLUG_OPTIONS = [
    { value: 'wedding', label: 'סט תמונות: חתונה (דור ושקד)' },
    { value: 'bar-mitzvah', label: 'סט תמונות: בר מצווה (נועם)' },
    { value: 'birthday', label: 'סט תמונות: יום הולדת (ג׳רי)' },
]
const CHAPTER_NAMES = ['פרק ראשון', 'פרק שני', 'פרק שלישי', 'פרק רביעי', 'פרק חמישי', 'פרק שישי']

async function api(op, payload = {}) {
    const token = await getIdToken(auth.currentUser)
    const res = await fetch('/api/admin/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ op, ...payload }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `landing API ${op} failed (${res.status})`)
    }
    return res.json()
}

function emptyChapter(index, weddingId = '', title = '') {
    return {
        weddingId,
        token: '',
        slug: 'wedding',
        chapter: CHAPTER_NAMES[index] || `פרק ${index + 1}`,
        n: String(index + 1).padStart(2, '0'),
        badge: '',
        title,
        date: '',
        story: '',
        quote: '',
        quoteBy: '',
        stats: ['', '', ''],
        spreads: 5,
        theme: index % 2 === 1 ? 'ink' : 'ivory',
        coverUrl: '',
        spreadUrls: [],
    }
}

// Re-stamp chapter numbers/names after reorder/add/remove so the
// "פרק ראשון / 01" chrome always matches the position.
function renumber(chapters) {
    return chapters.map((c, i) => ({
        ...c,
        chapter: CHAPTER_NAMES[i] || `פרק ${i + 1}`,
        n: String(i + 1).padStart(2, '0'),
    }))
}

function LandingAdminContent() {
    const [config, setConfig] = useState(null) // { demoWeddingId, chapters }
    const [weddings, setWeddings] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [issuingIdx, setIssuingIdx] = useState(null)
    const [toast, setToast] = useState(null)
    const showToast = (type, message) => {
        setToast({ type, message })
        setTimeout(() => setToast(null), 3500)
    }

    // Load saved config (falls back to the built-in chapters as the
    // editable starting point) + the weddings list for the pickers.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const [{ config: saved }, weddingsRes] = await Promise.all([
                    api('get'),
                    (async () => {
                        const token = await getIdToken(auth.currentUser)
                        const res = await fetch('/api/admin/weddings', { headers: { Authorization: `Bearer ${token}` } })
                        return res.ok ? res.json() : []
                    })(),
                ])
                if (cancelled) return
                setConfig({
                    demoWeddingId: saved?.demoWeddingId || 'rOPkVWbwurT4UjKCR5hg',
                    chapters: Array.isArray(saved?.chapters) && saved.chapters.length > 0
                        ? saved.chapters.map(c => ({ ...emptyChapter(0), ...c }))
                        : DEFAULT_CHAPTERS.map(c => ({ ...c, stats: [...c.stats], spreadUrls: [], coverUrl: '' })),
                })
                setWeddings(Array.isArray(weddingsRes) ? weddingsRes : [])
            } catch (err) {
                if (!cancelled) showToast('error', err?.message || 'הטעינה נכשלה')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [])

    const weddingLabel = w => {
        const names = w.eventType === 'wedding'
            ? [w.brideName, w.groomName].filter(Boolean).join(' & ')
            : w.celebrantName || w.customTitle || ''
        return `${names || 'ללא שם'} · ${w.eventType || 'wedding'} · ${w.id}`
    }
    const weddingOptions = useMemo(
        () => weddings.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        [weddings]
    )

    const setChapter = (i, patch) =>
        setConfig(prev => ({ ...prev, chapters: prev.chapters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
    const move = (i, dir) =>
        setConfig(prev => {
            const list = [...prev.chapters]
            const j = i + dir
            if (j < 0 || j >= list.length) return prev
            ;[list[i], list[j]] = [list[j], list[i]]
            return { ...prev, chapters: renumber(list) }
        })
    const removeChapter = i =>
        setConfig(prev => ({ ...prev, chapters: renumber(prev.chapters.filter((_, j) => j !== i)) }))
    const addChapter = () =>
        setConfig(prev => {
            if (prev.chapters.length >= 6) return prev
            return { ...prev, chapters: renumber([...prev.chapters, emptyChapter(prev.chapters.length)]) }
        })

    // Fill title/badge/date from the selected wedding doc so adding a
    // project is mostly one click + polish.
    const applyWeddingToChapter = (i, weddingId) => {
        const w = weddings.find(x => x.id === weddingId)
        if (!w) return setChapter(i, { weddingId })
        const isWed = (w.eventType || 'wedding') === 'wedding'
        const title = isWed
            ? [w.brideName, w.groomName].filter(Boolean).join(' ו') || 'הזוג'
            : w.celebrantName || w.customTitle || ''
        const badge = { wedding: 'חתונה', birthday: 'יום הולדת', bar_mitzvah: 'בר מצווה', bat_mitzvah: 'בת מצווה', poker: 'ערב פוקר', travel: 'טיול' }[w.eventType] || 'אירוע'
        setChapter(i, { weddingId, title, badge, token: '' })
    }

    const issueToken = async i => {
        const c = config.chapters[i]
        if (!c.weddingId) return showToast('error', 'בחר קודם אירוע לפרק הזה')
        setIssuingIdx(i)
        try {
            const token = await getIdToken(auth.currentUser)
            const res = await fetch('/api/digital-edition/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ weddingId: c.weddingId, sendEmail: false }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'הנפקה נכשלה')
            setChapter(i, { token: data.token })
            showToast('success', 'קישור חי הונפק לפרק')
        } catch (err) {
            showToast('error', err?.message || 'הנפקה נכשלה')
        } finally {
            setIssuingIdx(null)
        }
    }

    const handleSave = async () => {
        if (!config || saving) return
        setSaving(true)
        try {
            await api('save', { config })
            showToast('success', 'נשמר — דף הנחיתה עודכן ורוענן')
        } catch (err) {
            showToast('error', err?.message || 'שמירה נכשלה')
        } finally {
            setSaving(false)
        }
    }

    const handleRefresh = async () => {
        if (refreshing) return
        setRefreshing(true)
        try {
            await api('revalidate')
            showToast('success', 'דף הנחיתה רוענן — הפריסטים והעיצובים העדכניים כבר שם')
        } catch (err) {
            showToast('error', err?.message || 'הרענון נכשל')
        } finally {
            setRefreshing(false)
        }
    }

    if (loading || !config) {
        return (
            <div className='min-h-screen flex items-center justify-center' style={{ background: '#f8f4ec' }}>
                <Loader2 size={22} className='animate-spin text-[#a8843a]' />
            </div>
        )
    }

    return (
        <div className='min-h-screen px-4 sm:px-6 lg:px-10 py-8' dir='rtl' style={{ backgroundColor: '#f8f4ec' }}>
            <div className='max-w-[980px] mx-auto'>
                {/* Breadcrumb */}
                <div className='flex items-center gap-1.5 text-[12px] text-[#a89378] mb-4'>
                    <Link href='/admin' className='hover:text-[#7a6a52] transition-colors'>מרכז הניהול</Link>
                    <ChevronRight size={12} className='rotate-180' />
                    <span className='text-[#5a4d3a] font-semibold'>ניהול דף נחיתה</span>
                </div>

                {/* Header + the two primary actions */}
                <div className='flex items-start sm:items-center justify-between gap-3 mb-6 flex-wrap'>
                    <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 12px 24px -10px rgba(170,136,64,0.45)' }}>
                            <Newspaper size={20} className='text-white' />
                        </div>
                        <div>
                            <h1 className='leading-tight font-bold' style={{ color: '#1a1410', fontSize: 22 }}>ניהול דף נחיתה</h1>
                            <p className='mt-1' style={{ color: '#a89378', fontSize: 12 }}>
                                הפרויקטים המוצגים, הדמו החי, ורענון מיידי אחרי שינויי עיצוב.
                            </p>
                        </div>
                    </div>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <a href='/landing' target='_blank' rel='noopener noreferrer' className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold' style={{ background: '#ffffff', border: '1px solid rgba(212,184,103,0.30)', color: '#7a6a52' }}>
                            <ExternalLink size={14} style={{ color: '#c9a44e' }} /> צפה בדף
                        </a>
                        <button onClick={handleRefresh} disabled={refreshing} className='flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 10px 22px -10px rgba(170,136,64,0.40)' }}>
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> רענן את דף הנחיתה
                        </button>
                    </div>
                </div>

                {/* How-it-works note */}
                <div className='rounded-2xl p-4 mb-6 text-[12.5px] leading-relaxed' style={{ background: '#fdfaf3', border: '1px solid rgba(212,184,103,0.25)', color: '#7a6a52' }}>
                    שינית פריסט, כריכה או עיצוב-אורחים באחד הפרויקטים המוצגים? לחץ <b>רענן את דף הנחיתה</b> — והדף יציג את המצב העדכני מיד.
                    בלי ללחוץ, העדכון מגיע לבד תוך עד 5 דקות. שמירה של שינויים כאן מרעננת אוטומטית.
                </div>

                {/* Live demo wedding */}
                <section className='rounded-2xl p-5 mb-6' style={{ background: '#ffffff', border: '1px solid rgba(212,184,103,0.22)' }}>
                    <h2 className='flex items-center gap-2 text-[14px] font-bold mb-1' style={{ color: '#1a1410' }}>
                        <BookOpen size={15} style={{ color: '#a8843a' }} /> האירוע של הדמו החי
                    </h2>
                    <p className='text-[12px] mb-3' style={{ color: '#a89378' }}>
                        הספר האינטראקטיבי וטופס הברכה בדף הנחיתה מציגים את העיצוב האמיתי של האירוע הזה — הפריסט, הכריכה ועמוד האורחים.
                    </p>
                    <select
                        value={config.demoWeddingId || ''}
                        onChange={e => setConfig(prev => ({ ...prev, demoWeddingId: e.target.value }))}
                        className='w-full rounded-xl px-3 py-2.5 text-[13px] outline-none'
                        style={{ background: '#fbf6ec', border: '1px solid #ead9b3', color: '#3a2f1e' }}
                    >
                        {!weddingOptions.some(w => w.id === config.demoWeddingId) && config.demoWeddingId && (
                            <option value={config.demoWeddingId}>{config.demoWeddingId}</option>
                        )}
                        {weddingOptions.map(w => (
                            <option key={w.id} value={w.id}>{weddingLabel(w)}</option>
                        ))}
                    </select>
                </section>

                {/* Chapters */}
                <section className='space-y-5'>
                    <div className='flex items-center justify-between'>
                        <h2 className='text-[14px] font-bold' style={{ color: '#1a1410' }}>הפרויקטים המוצגים (פרקים)</h2>
                        <button onClick={addChapter} disabled={config.chapters.length >= 6} className='flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50' style={{ background: '#ffffff', border: '1px solid rgba(212,184,103,0.30)', color: '#7a6a52' }}>
                            <Plus size={13} /> הוסף פרויקט
                        </button>
                    </div>

                    {config.chapters.map((c, i) => (
                        <div key={i} className='rounded-2xl p-5' style={{ background: '#ffffff', border: '1px solid rgba(212,184,103,0.22)' }}>
                            <div className='flex items-center justify-between mb-4'>
                                <span className='text-[12px] font-bold tracking-widest' style={{ color: '#a8843a' }}>{c.chapter} · {c.n}</span>
                                <div className='flex items-center gap-1.5'>
                                    <button onClick={() => move(i, -1)} disabled={i === 0} title='הזז למעלה' className='p-1.5 rounded-lg disabled:opacity-30' style={{ border: '1px solid #ead9b3', color: '#7a6a52' }}><ArrowUp size={13} /></button>
                                    <button onClick={() => move(i, 1)} disabled={i === config.chapters.length - 1} title='הזז למטה' className='p-1.5 rounded-lg disabled:opacity-30' style={{ border: '1px solid #ead9b3', color: '#7a6a52' }}><ArrowDown size={13} /></button>
                                    <button onClick={() => removeChapter(i)} title='הסר פרויקט' className='p-1.5 rounded-lg' style={{ border: '1px solid #f3c8c8', color: '#b32424' }}><Trash2 size={13} /></button>
                                </div>
                            </div>

                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                <label className='block'>
                                    <span className='fieldLabel'>האירוע במערכת</span>
                                    <select value={c.weddingId || ''} onChange={e => applyWeddingToChapter(i, e.target.value)} className='fieldInput'>
                                        <option value=''>— בחר אירוע —</option>
                                        {!weddingOptions.some(w => w.id === c.weddingId) && c.weddingId && (
                                            <option value={c.weddingId}>{c.weddingId}</option>
                                        )}
                                        {weddingOptions.map(w => (
                                            <option key={w.id} value={w.id}>{weddingLabel(w)}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>קישור ספר חי (טוקן)</span>
                                    <div className='flex gap-2'>
                                        <input value={c.token} onChange={e => setChapter(i, { token: e.target.value })} placeholder='טוקן לדפדוף חי — או הנפק' className='fieldInput flex-1' dir='ltr' />
                                        <button onClick={() => issueToken(i)} disabled={issuingIdx === i} title='הנפקת קישור חי חדש לאירוע' className='shrink-0 flex items-center gap-1.5 rounded-xl px-3 text-[12px] font-bold disabled:opacity-60' style={{ background: '#fbf6ec', border: '1px solid #ead9b3', color: '#7a6a52' }}>
                                            {issuingIdx === i ? <Loader2 size={12} className='animate-spin' /> : <Link2 size={12} />} הנפק
                                        </button>
                                    </div>
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>תגית (סוג אירוע)</span>
                                    <input value={c.badge} onChange={e => setChapter(i, { badge: e.target.value })} placeholder='חתונה / בר מצווה / יום הולדת 90' className='fieldInput' />
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>כותרת (שם)</span>
                                    <input value={c.title} onChange={e => setChapter(i, { title: e.target.value })} placeholder='דור ושקד' className='fieldInput' />
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>תאריך מוצג</span>
                                    <input value={c.date} onChange={e => setChapter(i, { date: e.target.value })} placeholder='אפריל 2026' className='fieldInput' />
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>אווירת הסקשן</span>
                                    <select value={c.theme} onChange={e => setChapter(i, { theme: e.target.value })} className='fieldInput'>
                                        {THEME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </label>
                            </div>

                            <label className='block mt-3'>
                                <span className='fieldLabel'>הסיפור (2–3 שורות)</span>
                                <textarea value={c.story} onChange={e => setChapter(i, { story: e.target.value })} rows={3} className='fieldInput' style={{ resize: 'vertical', lineHeight: 1.7 }} />
                            </label>

                            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3'>
                                {[0, 1, 2].map(k => (
                                    <label key={k} className='block'>
                                        <span className='fieldLabel'>נתון {k + 1}</span>
                                        <input value={c.stats[k] || ''} onChange={e => {
                                            const stats = [...c.stats]
                                            stats[k] = e.target.value
                                            setChapter(i, { stats })
                                        }} placeholder='24 ברכות' className='fieldInput' />
                                    </label>
                                ))}
                            </div>

                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3'>
                                <label className='block'>
                                    <span className='fieldLabel'>ציטוט אמיתי מתוך הספר</span>
                                    <textarea value={c.quote} onChange={e => setChapter(i, { quote: e.target.value })} rows={2} className='fieldInput' style={{ resize: 'vertical', lineHeight: 1.6 }} />
                                </label>
                                <label className='block'>
                                    <span className='fieldLabel'>מי כתב (קרדיט)</span>
                                    <input value={c.quoteBy} onChange={e => setChapter(i, { quoteBy: e.target.value })} placeholder='משפחת ביבי, מתוך הספר' className='fieldInput' />
                                </label>
                            </div>

                            {/* Images */}
                            <div className='rounded-xl p-3.5 mt-4' style={{ background: '#fbf6ec', border: '1px solid #ead9b3' }}>
                                <p className='text-[11.5px] font-bold mb-2.5' style={{ color: '#7a6a52' }}>תמונות הפרק</p>
                                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                                    <label className='block'>
                                        <span className='fieldLabel'>סט מובנה (ברירת מחדל)</span>
                                        <select value={c.slug} onChange={e => setChapter(i, { slug: e.target.value })} className='fieldInput'>
                                            {SLUG_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </label>
                                    <label className='block'>
                                        <span className='fieldLabel'>מס׳ כפולות בסט</span>
                                        <input type='number' min={0} max={12} value={c.spreads} onChange={e => setChapter(i, { spreads: Number(e.target.value) || 0 })} className='fieldInput' />
                                    </label>
                                </div>
                                <label className='block mt-3'>
                                    <span className='fieldLabel'>כריכה — URL מותאם (אופציונלי, גובר על הסט)</span>
                                    <input value={c.coverUrl} onChange={e => setChapter(i, { coverUrl: e.target.value })} placeholder='https://…' className='fieldInput' dir='ltr' />
                                </label>
                                <label className='block mt-3'>
                                    <span className='fieldLabel'>כפולות — URL בכל שורה (אופציונלי, גובר על הסט)</span>
                                    <textarea
                                        value={(c.spreadUrls || []).join('\n')}
                                        onChange={e => setChapter(i, { spreadUrls: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
                                        rows={3}
                                        placeholder={'https://…/spread-1.webp\nhttps://…/spread-2.webp'}
                                        className='fieldInput'
                                        dir='ltr'
                                        style={{ resize: 'vertical', lineHeight: 1.5 }}
                                    />
                                </label>
                                <p className='text-[10.5px] mt-2 leading-relaxed' style={{ color: '#b8a37e' }}>
                                    לפרויקט חדש: העלה צילומי כפולות לאחסון (למשל דרך רקעי הסטודיו) והדבק כאן את הקישורים — או השאר סט מובנה.
                                </p>
                            </div>
                        </div>
                    ))}
                </section>

                {/* Save bar */}
                <div className='sticky bottom-4 mt-6 flex justify-end'>
                    <button onClick={handleSave} disabled={saving} className='flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold text-white active:scale-[0.98] disabled:opacity-60' style={{ background: 'linear-gradient(180deg, #d3b46a 0%, #b8893d 100%)', boxShadow: '0 14px 30px -10px rgba(170,136,64,0.55)' }}>
                        {saving ? <Loader2 size={15} className='animate-spin' /> : <Save size={15} />} שמור ורענן את הדף
                    </button>
                </div>

                {toast && (
                    <div className='fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl' style={{
                        background: toast.type === 'success' ? 'rgba(167,212,148,0.95)' : 'rgba(239,168,168,0.95)',
                        color: toast.type === 'success' ? '#1f4d1d' : '#5d1a1a',
                        border: '1px solid rgba(212,184,103,0.30)',
                    }}>
                        {toast.message}
                    </div>
                )}

                <style jsx global>{`
                    .fieldLabel { display: block; font-size: 11px; font-weight: 700; color: #a89378; margin-bottom: 5px; letter-spacing: 0.04em; }
                    .fieldInput { width: 100%; box-sizing: border-box; border-radius: 12px; padding: 9px 12px; font-size: 13px; color: #3a2f1e; background: #ffffff; border: 1px solid #ead9b3; outline: none; font-family: inherit; }
                    .fieldInput:focus { border-color: #c9a44e; }
                `}</style>
            </div>
        </div>
    )
}

// Super-admin gate — same pattern as /admin/studio.
function SuperAdminGate({ children }) {
    const router = useRouter()
    const [state, setState] = useState('checking')
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, user => {
            if (!user) {
                router.replace('/login')
                return
            }
            setState(isSuperAdmin(user.email) ? 'allowed' : 'denied')
        })
        return unsub
    }, [router])
    if (state === 'checking') {
        return (
            <div className='min-h-screen flex items-center justify-center' style={{ background: '#f8f4ec' }}>
                <Loader2 size={22} className='animate-spin text-[#a8843a]' />
            </div>
        )
    }
    if (state === 'denied') {
        return (
            <div className='min-h-screen flex items-center justify-center' style={{ background: '#f8f4ec' }}>
                <p className='text-sm font-bold' style={{ color: '#7a6a52' }}>אין הרשאה לעמוד הזה</p>
            </div>
        )
    }
    return children
}

export default function LandingAdminPage() {
    return (
        <AdminPageWrapper>
            <SuperAdminGate>
                <LandingAdminContent />
            </SuperAdminGate>
        </AdminPageWrapper>
    )
}
