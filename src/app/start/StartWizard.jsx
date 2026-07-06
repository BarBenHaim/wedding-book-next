'use client'

// StartWizard — the self-serve "open your blessing book" experience.
//
// Four playful steps with a LIVE book preview that builds itself as you
// type: (1) event type → (2) names + date + palette → (3) real studio
// presets filtered to the event type → (4) account → confetti + QR.
//
// Design notes:
//   • The preview is the product demo: names render on the cover the
//     moment they're typed, the cover re-skins when a preset is tapped.
//   • Writes go through /api/onboarding/create-event (Admin SDK) — the
//     client only authenticates and describes the event.
//   • Session cookie via /api/login so the portal works immediately.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    updateProfile,
    getIdToken,
    setPersistence,
    browserLocalPersistence,
    signOut,
} from 'firebase/auth'
import { auth } from '@/lib/firebaseClient'
import { setExpiryWeek } from '@/lib/sessionExpiry'
import { listPresets, resolvePreset } from '@/lib/studioPresets'
import { THEME_COLORS, THEME_COLOR_ORDER } from '@/lib/eventTypes'
import { PUBLIC_EVENT_TYPES, EVENT_TYPE_META, validateNewEvent, eventDisplayTitle } from '@/lib/onboarding'
import { frankRuhl } from '@/app/fonts'

const AUTO_THEME = { wedding: 'gold', birthday: 'pink', bar_mitzvah: 'blue', bat_mitzvah: 'blue' }
const STEP_LABELS = ['סוג האירוע', 'הפרטים', 'העיצוב', 'יוצאים לדרך']
const DEFAULT_COVER = { backgroundColor: '#f7f1e3', texture: '/textures/tex9.png' }

function prettyDate(iso) {
    if (!iso) return ''
    try {
        return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
        return ''
    }
}

// ── Live book preview ────────────────────────────────────────────────
function BookPreview({ data, presetValues, compact }) {
    const v = presetValues || DEFAULT_COVER
    const title = eventDisplayTitle(data)
    const meta = data.eventType ? EVENT_TYPE_META[data.eventType] : null
    const titleFont = v.nameFontClass || v.fontClass || frankRuhl.className
    return (
        <div className={`bp ${compact ? 'bpCompact' : ''}`}>
            <div className='bpBook' key={v.__id || 'default'}>
                <div className='bpCover' style={{ background: v.backgroundColor || '#f7f1e3' }}>
                    {v.texture ? <img src={v.texture} alt='' className='bpTex' /> : null}
                    <div className='bpFrame' />
                    <div className='bpInner'>
                        <span className='bpKicker'>{meta ? meta.label : 'האירוע שלכם'}</span>
                        <h3 className={`bpTitle ${titleFont}`}>{title}</h3>
                        <span className='bpRule' />
                        <span className='bpSub'>ספר הברכות</span>
                        {data.weddingDate ? <span className='bpDate'>{prettyDate(data.weddingDate)}</span> : null}
                    </div>
                    <div className='bpShine' />
                </div>
                <div className='bpSpine' />
                <div className='bpPages' />
            </div>
            <div className='bpShadow' />
            <style jsx>{`
                .bp { display: flex; flex-direction: column; align-items: center; gap: 10px; }
                .bpBook {
                    position: relative; width: 235px; aspect-ratio: 3 / 4.15;
                    transform: perspective(1100px) rotateY(13deg) rotateX(3deg);
                    transform-style: preserve-3d;
                    animation: bpFloat 5.5s ease-in-out infinite, bpIn 0.55s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .bpCompact .bpBook { width: 150px; }
                .bpCover {
                    position: absolute; inset: 0; border-radius: 14px 5px 5px 14px; overflow: hidden;
                    box-shadow: 0 24px 48px -18px rgba(48, 34, 12, 0.45), 0 4px 14px rgba(48, 34, 12, 0.18);
                }
                .bpTex { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
                .bpFrame {
                    position: absolute; inset: 10px; border: 1px solid rgba(170, 136, 64, 0.55);
                    border-radius: 9px; pointer-events: none;
                }
                .bpInner {
                    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                    justify-content: center; text-align: center; padding: 22px 16px; gap: 8px;
                }
                .bpKicker { font-size: 10px; letter-spacing: 0.28em; color: rgba(90, 70, 35, 0.75); font-weight: 600; }
                .bpCompact .bpKicker { font-size: 8px; }
                .bpTitle { margin: 0; font-size: 27px; line-height: 1.25; color: #332612; font-weight: 700; word-break: break-word; }
                .bpCompact .bpTitle { font-size: 17px; }
                .bpRule { width: 44px; height: 1px; background: linear-gradient(90deg, transparent, #aa8840, transparent); }
                .bpSub { font-size: 12px; color: rgba(90, 70, 35, 0.85); letter-spacing: 0.12em; }
                .bpCompact .bpSub { font-size: 9px; }
                .bpDate { font-size: 11px; color: rgba(90, 70, 35, 0.6); margin-top: 2px; }
                .bpCompact .bpDate { font-size: 8.5px; }
                .bpShine {
                    position: absolute; inset: 0; pointer-events: none;
                    background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.35) 46%, transparent 60%);
                    transform: translateX(-120%); animation: bpSweep 0.9s ease 0.15s forwards;
                }
                .bpSpine {
                    position: absolute; top: 1.5%; bottom: 1.5%; right: -7px; width: 8px;
                    background: linear-gradient(180deg, #c8b088, #9c7c46); border-radius: 3px 0 0 3px;
                    transform: translateZ(-6px);
                }
                .bpPages {
                    position: absolute; top: 2.5%; bottom: 2.5%; left: -6px; width: 7px; border-radius: 2px;
                    background: repeating-linear-gradient(180deg, #fffdf6 0 2px, #e8ddc4 2px 3px);
                }
                .bpShadow {
                    width: 200px; height: 16px; border-radius: 50%;
                    background: radial-gradient(closest-side, rgba(48, 34, 12, 0.22), transparent);
                }
                .bpCompact .bpShadow { width: 120px; height: 10px; }
                @keyframes bpFloat { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
                @keyframes bpIn { from { opacity: 0; scale: 0.94; } to { opacity: 1; scale: 1; } }
                @keyframes bpSweep { to { transform: translateX(120%); } }
            `}</style>
        </div>
    )
}

// ── Confetti (CSS only, fired on success) ────────────────────────────
function Confetti() {
    const bits = useMemo(() => {
        const palette = ['#c9a44e', '#e2c377', '#f4d9a8', '#e9a3b0', '#ffffff', '#b8893d']
        return Array.from({ length: 64 }, (_, i) => ({
            left: Math.random() * 100,
            delay: Math.random() * 1.1,
            dur: 2.7 + Math.random() * 2,
            size: 6 + Math.random() * 7,
            color: palette[i % palette.length],
            tilt: Math.floor(Math.random() * 360),
            round: i % 3 === 0,
        }))
    }, [])
    return (
        <div className='cf' aria-hidden='true'>
            {bits.map((b, i) => (
                <i
                    key={i}
                    style={{
                        left: `${b.left}%`,
                        width: b.size,
                        height: b.round ? b.size : b.size * 0.45,
                        background: b.color,
                        borderRadius: b.round ? '50%' : 1,
                        transform: `rotate(${b.tilt}deg)`,
                        animationDelay: `${b.delay}s`,
                        animationDuration: `${b.dur}s`,
                    }}
                />
            ))}
            <style jsx>{`
                .cf { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 60; }
                .cf i { position: absolute; top: -18px; display: block; opacity: 0.95; animation-name: cfFall; animation-timing-function: linear; animation-fill-mode: forwards; }
                @keyframes cfFall { to { transform: translateY(108vh) rotate(680deg); opacity: 0.85; } }
            `}</style>
        </div>
    )
}

export default function StartWizard() {
    const router = useRouter()
    const [step, setStep] = useState(0)
    const [data, setData] = useState({
        eventType: null, brideName: '', groomName: '', celebrantName: '', age: '', weddingDate: '', themeColor: null,
    })
    const [presets, setPresets] = useState(null) // null = loading, [] = none
    const [presetId, setPresetId] = useState(null)
    const [account, setAccount] = useState({ mode: 'signup', name: '', email: '', password: '', show: false })
    const [user, setUser] = useState(null)
    const [authReady, setAuthReady] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [fieldErrs, setFieldErrs] = useState({})
    const [created, setCreated] = useState(null)
    const [copied, setCopied] = useState('')
    const stepRef = useRef(null)

    useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setAuthReady(true) }), [])

    // Presets for the chosen event type (generic ones included by the lib).
    useEffect(() => {
        if (step !== 2 || !data.eventType) return
        let live = true
        setPresets(null)
        listPresets({ eventType: data.eventType })
            .then(list => { if (live) setPresets(Array.isArray(list) ? list : []) })
            .catch(() => { if (live) setPresets([]) })
        return () => { live = false }
    }, [step, data.eventType])

    useEffect(() => {
        stepRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, [step])

    const selectedPreset = useMemo(
        () => (presetId && Array.isArray(presets) ? presets.find(p => p.id === presetId) || null : null),
        [presetId, presets],
    )
    const previewValues = useMemo(() => {
        if (!selectedPreset) return null
        try {
            const rv = resolvePreset(selectedPreset)
            return { ...(rv?.values || {}), __id: selectedPreset.id }
        } catch {
            return { ...(selectedPreset.values || {}), __id: selectedPreset.id }
        }
    }, [selectedPreset])

    const themeId = data.themeColor || AUTO_THEME[data.eventType] || 'gold'
    const meta = data.eventType ? EVENT_TYPE_META[data.eventType] : null

    function pickType(t) {
        setData(d => ({ ...d, eventType: t }))
        setFieldErrs({})
        setTimeout(() => setStep(1), 240)
    }

    function next1(e) {
        e?.preventDefault?.()
        const r = validateNewEvent({ ...data, age: data.age === '' ? undefined : data.age })
        const relevant = {}
        for (const k of ['brideName', 'groomName', 'celebrantName', 'age', 'weddingDate']) {
            if (r.errors[k]) relevant[k] = r.errors[k]
        }
        setFieldErrs(relevant)
        if (Object.keys(relevant).length === 0) setStep(2)
    }

    async function submit(e) {
        e?.preventDefault?.()
        if (busy) return
        setErr('')
        setBusy(true)
        try {
            const payload = {
                eventType: data.eventType,
                brideName: data.brideName,
                groomName: data.groomName,
                celebrantName: data.celebrantName,
                age: data.age === '' ? undefined : data.age,
                weddingDate: data.weddingDate || undefined,
                themeColor: themeId,
                ownerName: account.name,
            }
            const check = validateNewEvent(payload)
            if (!check.ok) {
                setFieldErrs(check.errors)
                setStep(check.errors.eventType ? 0 : 1)
                return
            }

            // 1. Make sure we have a signed-in user.
            let u = user
            if (!u) {
                const email = account.email.trim()
                const password = account.password
                if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('כתובת אימייל לא תקינה'); return }
                if ((password || '').length < 6) { setErr('סיסמה של 6 תווים לפחות'); return }
                await setPersistence(auth, browserLocalPersistence)
                if (account.mode === 'signup') {
                    try {
                        const cred = await createUserWithEmailAndPassword(auth, email, password)
                        u = cred.user
                        if (account.name.trim()) {
                            try { await updateProfile(u, { displayName: account.name.trim() }) } catch {}
                        }
                    } catch (ex) {
                        if (ex?.code === 'auth/email-already-in-use') {
                            try {
                                const cred = await signInWithEmailAndPassword(auth, email, password)
                                u = cred.user
                            } catch {
                                setAccount(a => ({ ...a, mode: 'login' }))
                                setErr('האימייל כבר רשום אצלנו — הזינו את הסיסמה הקיימת והתחברו')
                                return
                            }
                        } else if (ex?.code === 'auth/weak-password') { setErr('הסיסמה קצרה מדי — לפחות 6 תווים'); return }
                        else if (ex?.code === 'auth/invalid-email') { setErr('כתובת אימייל לא תקינה'); return }
                        else if (ex?.code === 'auth/too-many-requests') { setErr('יותר מדי ניסיונות — חכו רגע ונסו שוב'); return }
                        else { setErr('לא הצלחנו לפתוח חשבון — נסו שוב'); return }
                    }
                } else {
                    try {
                        const cred = await signInWithEmailAndPassword(auth, email, password)
                        u = cred.user
                    } catch (ex) {
                        if (ex?.code === 'auth/user-not-found') {
                            setAccount(a => ({ ...a, mode: 'signup' }))
                            setErr('לא מצאנו חשבון עם האימייל הזה — אפשר לפתוח אחד חדש 🙂')
                        } else if (ex?.code === 'auth/too-many-requests') {
                            setErr('יותר מדי ניסיונות — חכו רגע ונסו שוב')
                        } else {
                            setErr('אימייל או סיסמה שגויים')
                        }
                        return
                    }
                }
                setUser(u)
            }

            // 2. Session cookie (portal/admin middleware) — best effort.
            const token = await getIdToken(u, true)
            try {
                await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                })
                setExpiryWeek()
            } catch {}

            // 3. Create the event.
            const design = previewValues ? (() => { const { __id, ...rest } = previewValues; return rest })() : undefined
            const res = await fetch('/api/onboarding/create-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...payload, design }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (json?.errors && typeof json.errors === 'object') {
                    setFieldErrs(json.errors)
                    setStep(json.errors.eventType ? 0 : 1)
                }
                setErr(json?.message || 'משהו השתבש — נסו שוב עוד רגע')
                return
            }
            try { localStorage.setItem('weddingId', json.weddingId) } catch {}
            setCreated(json)
            setStep(4)
        } finally {
            setBusy(false)
        }
    }

    function copy(key, text) {
        try {
            navigator.clipboard.writeText(text)
            setCopied(key)
            setTimeout(() => setCopied(''), 1600)
        } catch {}
    }

    const showPreview = step >= 1 && step <= 3

    return (
        <div className='wiz' dir='rtl'>
            <div className='orb orbA' /><div className='orb orbB' />

            <header className='top'>
                <Link href='/landing' className='logoLink' aria-label='Wedding Tales'>
                    <img src='/logo-wt.png' alt='Wedding Tales' className='logo' />
                </Link>
                {step < 4 && (
                    <div className='steps' aria-label='התקדמות'>
                        {STEP_LABELS.map((l, i) => (
                            <div key={l} className={`stepDot ${i === step ? 'cur' : ''} ${i < step ? 'done' : ''}`}>
                                <span className='dot'>{i < step ? '✓' : i + 1}</span>
                                <span className='dotLabel'>{l}</span>
                            </div>
                        ))}
                        <i className='bar' style={{ width: `${(step / 3) * 100}%` }} />
                    </div>
                )}
                {step > 0 && step < 4 && (
                    <button className='back' onClick={() => { setErr(''); setStep(s => s - 1) }}>→ חזרה</button>
                )}
            </header>

            <main className={`body ${showPreview ? 'withSide' : 'noSide'}`} ref={stepRef}>
                {showPreview && (
                    <aside className='previewCol'>
                        <BookPreview data={data} presetValues={previewValues} compact={false} />
                        <p className='previewHint'>{step === 1 ? 'הספר נבנה תוך כדי שאתם כותבים ✍️' : step === 2 ? 'טעימה חיה מהעיצוב שבחרתם' : 'זה הספר שלכם — עוד צעד אחד'}</p>
                    </aside>
                )}

                <section className='formCol' key={step}>
                    {step === 0 && (
                        <div className='card'>
                            <h1 className='h1'>איזה אירוע חוגגים? 🎉</h1>
                            <p className='sub'>פותחים ספר ברכות דיגיטלי בחינם — האורחים כותבים ומעלים תמונות, אתם מתרגשים.</p>
                            <div className='typeGrid'>
                                {PUBLIC_EVENT_TYPES.map(t => (
                                    <button
                                        key={t}
                                        className={`typeCard ${data.eventType === t ? 'sel' : ''}`}
                                        onClick={() => pickType(t)}
                                    >
                                        <span className='typeEmoji'>{EVENT_TYPE_META[t].emoji}</span>
                                        <span className='typeLabel'>{EVENT_TYPE_META[t].label}</span>
                                        <span className='typeBlurb'>{EVENT_TYPE_META[t].blurb}</span>
                                    </button>
                                ))}
                            </div>
                            <p className='loginLine'>
                                כבר יש לכם ספר? <Link href='/login'>כניסה לחשבון</Link>
                            </p>
                        </div>
                    )}

                    {step === 1 && meta && (
                        <form className='card' onSubmit={next1}>
                            <h1 className='h1'>{meta.emoji} מי החוגגים?</h1>
                            <p className='sub'>השמות יופיעו על כריכת הספר — אפשר לשנות בכל רגע.</p>

                            {data.eventType === 'wedding' ? (
                                <div className='row2'>
                                    <label className='field'>
                                        <span>שם הכלה</span>
                                        <input
                                            value={data.brideName}
                                            onChange={e => setData(d => ({ ...d, brideName: e.target.value }))}
                                            placeholder='שקד'
                                            autoFocus
                                            maxLength={40}
                                        />
                                        {fieldErrs.brideName && <em>{fieldErrs.brideName}</em>}
                                    </label>
                                    <span className='amp'>&</span>
                                    <label className='field'>
                                        <span>שם החתן</span>
                                        <input
                                            value={data.groomName}
                                            onChange={e => setData(d => ({ ...d, groomName: e.target.value }))}
                                            placeholder='דור'
                                            maxLength={40}
                                        />
                                        {fieldErrs.groomName && <em>{fieldErrs.groomName}</em>}
                                    </label>
                                </div>
                            ) : (
                                <div className='row2'>
                                    <label className='field grow'>
                                        <span>{data.eventType === 'birthday' ? 'שם בעל/ת השמחה' : 'שם החוגג/ת'}</span>
                                        <input
                                            value={data.celebrantName}
                                            onChange={e => setData(d => ({ ...d, celebrantName: e.target.value }))}
                                            placeholder={data.eventType === 'birthday' ? 'ג׳רי' : 'נועם'}
                                            autoFocus
                                            maxLength={40}
                                        />
                                        {fieldErrs.celebrantName && <em>{fieldErrs.celebrantName}</em>}
                                    </label>
                                    {data.eventType === 'birthday' && (
                                        <label className='field ageField'>
                                            <span>גיל (לא חובה)</span>
                                            <input
                                                value={data.age}
                                                onChange={e => setData(d => ({ ...d, age: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                                                placeholder='90'
                                                inputMode='numeric'
                                            />
                                            {fieldErrs.age && <em>{fieldErrs.age}</em>}
                                        </label>
                                    )}
                                </div>
                            )}

                            <label className='field'>
                                <span>תאריך האירוע <b className='opt'>(אפשר גם אחר כך)</b></span>
                                <input
                                    type='date'
                                    value={data.weddingDate}
                                    onChange={e => setData(d => ({ ...d, weddingDate: e.target.value }))}
                                />
                                {fieldErrs.weddingDate && <em>{fieldErrs.weddingDate}</em>}
                            </label>

                            <div className='field'>
                                <span>צבע דף האורחים</span>
                                <div className='swatches'>
                                    {THEME_COLOR_ORDER.map(id => (
                                        <button
                                            type='button'
                                            key={id}
                                            className={`swatch ${themeId === id ? 'sel' : ''}`}
                                            style={{ background: THEME_COLORS[id].swatch }}
                                            onClick={() => setData(d => ({ ...d, themeColor: id }))}
                                            aria-label={THEME_COLORS[id].label}
                                        >
                                            {themeId === id ? '✓' : ''}
                                        </button>
                                    ))}
                                    <span className='swatchName'>{THEME_COLORS[themeId]?.label}</span>
                                </div>
                            </div>

                            <button className='cta' type='submit'>ממשיכים לעיצוב ←</button>
                        </form>
                    )}

                    {step === 2 && (
                        <div className='card'>
                            <h1 className='h1'>🎨 איזה עיצוב מדבר אליכם?</h1>
                            <p className='sub'>אלה העיצובים האמיתיים מהסטודיו שלנו, מותאמים ל{meta?.label}. אפשר להחליף מתי שרוצים.</p>

                            {presets === null && <div className='loading'>טוענים עיצובים…</div>}

                            {Array.isArray(presets) && (
                                <div className='presetGrid'>
                                    <button
                                        className={`presetCard ${presetId === null ? 'sel' : ''}`}
                                        onClick={() => setPresetId(null)}
                                    >
                                        <span className='pSwatch' style={{ background: DEFAULT_COVER.backgroundColor }}>
                                            <img src={DEFAULT_COVER.texture} alt='' />
                                            <b className={frankRuhl.className}>א</b>
                                        </span>
                                        <span className='pName'>קלאסי</span>
                                        <span className='pTag'>ברירת המחדל שלנו</span>
                                    </button>
                                    {presets.map(p => {
                                        const v = p.values || {}
                                        return (
                                            <button
                                                key={p.id}
                                                className={`presetCard ${presetId === p.id ? 'sel' : ''}`}
                                                onClick={() => setPresetId(p.id)}
                                            >
                                                <span className='pSwatch' style={{ background: v.backgroundColor || '#fff' }}>
                                                    {v.texture ? <img src={v.texture} alt='' /> : null}
                                                    <b className={frankRuhl.className}>א</b>
                                                </span>
                                                <span className='pName'>{p.name || 'עיצוב'}</span>
                                                {presetId === p.id ? <span className='pTag sel'>נבחר ✓</span> : <span className='pTag'>הקישו לתצוגה</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            <button className='cta' onClick={() => setStep(3)}>כמעט שם ←</button>
                        </div>
                    )}

                    {step === 3 && (
                        <form className='card' onSubmit={submit}>
                            <h1 className='h1'>עוד רגע וזה שלכם 💛</h1>
                            <p className='sub'>חשבון חינמי כדי לשמור את הספר, לצפות בברכות ולנהל הכול ממקום אחד.</p>

                            {authReady && user ? (
                                <div className='meBox'>
                                    <p>מחוברים בתור <b dir='ltr'>{user.email}</b></p>
                                    <button type='button' className='linkBtn' onClick={() => signOut(auth).then(() => setUser(null)).catch(() => {})}>
                                        להשתמש בחשבון אחר
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {account.mode === 'signup' && (
                                        <label className='field'>
                                            <span>איך קוראים לכם? <b className='opt'>(לא חובה)</b></span>
                                            <input
                                                value={account.name}
                                                onChange={e => setAccount(a => ({ ...a, name: e.target.value }))}
                                                placeholder='דור לוי'
                                                maxLength={60}
                                            />
                                        </label>
                                    )}
                                    <label className='field'>
                                        <span>אימייל</span>
                                        <input
                                            type='email'
                                            dir='ltr'
                                            value={account.email}
                                            onChange={e => setAccount(a => ({ ...a, email: e.target.value }))}
                                            placeholder='name@example.com'
                                            autoComplete='email'
                                        />
                                    </label>
                                    <label className='field'>
                                        <span>סיסמה</span>
                                        <div className='pwWrap'>
                                            <input
                                                type={account.show ? 'text' : 'password'}
                                                dir='ltr'
                                                value={account.password}
                                                onChange={e => setAccount(a => ({ ...a, password: e.target.value }))}
                                                placeholder={account.mode === 'signup' ? 'לפחות 6 תווים' : '••••••••'}
                                                autoComplete={account.mode === 'signup' ? 'new-password' : 'current-password'}
                                            />
                                            <button type='button' className='pwEye' onClick={() => setAccount(a => ({ ...a, show: !a.show }))}>
                                                {account.show ? '🙈' : '👁️'}
                                            </button>
                                        </div>
                                    </label>
                                    <button
                                        type='button'
                                        className='linkBtn'
                                        onClick={() => { setErr(''); setAccount(a => ({ ...a, mode: a.mode === 'signup' ? 'login' : 'signup' })) }}
                                    >
                                        {account.mode === 'signup' ? 'כבר יש לכם חשבון? התחברו' : 'אין חשבון? נרשמים בשנייה'}
                                    </button>
                                </>
                            )}

                            {err && <div className='errBox'>{err}</div>}

                            <button className='cta big' type='submit' disabled={busy}>
                                {busy ? 'פותחים את הספר…' : 'פתחו את הספר שלי 🎉'}
                            </button>
                            <p className='trust'>✓ חינם לגמרי&nbsp;&nbsp;·&nbsp;&nbsp;✓ בלי כרטיס אשראי&nbsp;&nbsp;·&nbsp;&nbsp;✓ מוכן תוך דקה</p>
                        </form>
                    )}

                    {step === 4 && created && (
                        <div className='card doneCard'>
                            <Confetti />
                            <h1 className='h1'>🎉 מזל טוב! הספר באוויר</h1>
                            <p className='sub'>שלחו לאורחים את הקישור או הציבו את ה-QR באירוע — כל ברכה נכנסת לספר ברגע שהיא נכתבת.</p>

                            <div className='doneGrid'>
                                <div className='qrBox'>
                                    <div className='qrInner'>
                                        <QRCode value={created.links?.guest || ''} size={148} fgColor='#241c10' bgColor='transparent' />
                                    </div>
                                    <span>סרקו לכתיבת ברכה</span>
                                </div>

                                <div className='linksBox'>
                                    <div className='linkRow'>
                                        <div>
                                            <b>🔗 קישור לאורחים</b>
                                            <span dir='ltr'>{created.links?.guest}</span>
                                        </div>
                                        <button onClick={() => copy('guest', created.links?.guest)}>{copied === 'guest' ? 'הועתק ✓' : 'העתקה'}</button>
                                    </div>
                                    <div className='linkRow'>
                                        <div>
                                            <b>📖 הספר הדיגיטלי</b>
                                            <span dir='ltr'>{created.links?.book}</span>
                                        </div>
                                        <button onClick={() => copy('book', created.links?.book)}>{copied === 'book' ? 'הועתק ✓' : 'העתקה'}</button>
                                    </div>
                                    <a
                                        className='waBtn'
                                        href={`https://wa.me/?text=${encodeURIComponent('כותבים לנו ברכה לספר? 💛 ' + (created.links?.guest || ''))}`}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                    >
                                        שיתוף בוואטסאפ 💬
                                    </a>
                                </div>
                            </div>

                            <div className='doneCtas'>
                                <button className='cta big' onClick={() => router.push(`/wedding/${created.weddingId}/portal`)}>
                                    לניהול האירוע ←
                                </button>
                                <Link className='ghost' href='/my'>לכל האירועים שלי</Link>
                            </div>
                            <p className='trust'>שלחנו לכם את כל הקישורים גם למייל 📫</p>
                        </div>
                    )}
                </section>
            </main>

            <style jsx>{`
                .wiz {
                    min-height: 100dvh; position: relative; overflow: hidden;
                    background:
                        radial-gradient(900px 500px at 85% -80px, rgba(201, 164, 78, 0.14), transparent 60%),
                        radial-gradient(700px 420px at -60px 105%, rgba(201, 164, 78, 0.1), transparent 60%),
                        linear-gradient(180deg, #fdfaf2 0%, #faf5e9 55%, #f6efdf 100%);
                    color: #241c10;
                    font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif;
                }
                .orb { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
                .orbA { width: 340px; height: 340px; background: rgba(211, 182, 101, 0.22); top: -120px; inset-inline-start: -80px; }
                .orbB { width: 420px; height: 420px; background: rgba(233, 163, 176, 0.12); bottom: -180px; inset-inline-end: -120px; }

                .top {
                    position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;
                    gap: 14px; padding: 22px 18px 6px;
                }
                .logo { height: 44px; width: auto; }
                .back {
                    position: absolute; inset-inline-start: 18px; top: 26px; background: none; border: 0;
                    color: #8a6f45; font-size: 14px; cursor: pointer; padding: 8px;
                }
                .steps { position: relative; display: flex; gap: 26px; padding-bottom: 6px; }
                .stepDot { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 54px; }
                .dot {
                    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
                    font-size: 12px; font-weight: 700; color: #8a6f45;
                    background: #fff; border: 1.5px solid rgba(170, 136, 64, 0.35);
                    transition: all 0.25s ease;
                }
                .stepDot.cur .dot { background: linear-gradient(180deg, #d3b46a, #b8893d); color: #fff; border-color: transparent; box-shadow: 0 6px 14px -6px rgba(170, 136, 64, 0.7); transform: scale(1.12); }
                .stepDot.done .dot { background: rgba(170, 136, 64, 0.14); color: #8a6f45; }
                .dotLabel { font-size: 11px; color: #8a6f45; }
                .stepDot.cur .dotLabel { color: #5c451f; font-weight: 700; }
                .bar { position: absolute; bottom: 0; inset-inline-start: 0; height: 2px; background: linear-gradient(90deg, #d3b46a, #b8893d); border-radius: 2px; transition: width 0.4s ease; }

                .body {
                    position: relative; z-index: 2; display: grid; grid-template-columns: 1fr;
                    gap: 10px; max-width: 1040px; margin: 0 auto; padding: 10px 18px 60px;
                }
                .previewCol { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 8px; }
                .previewHint { font-size: 12.5px; color: #8a6f45; margin: 0; }
                .formCol { animation: stepIn 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
                @keyframes stepIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

                @media (min-width: 920px) {
                    .body.withSide { grid-template-columns: 1fr 380px; gap: 40px; padding-top: 26px; align-items: start; }
                    .body.noSide { max-width: 700px; padding-top: 26px; }
                    .previewCol { order: 2; position: sticky; top: 96px; }
                    .formCol { order: 1; }
                }

                .card {
                    background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(10px);
                    border: 1px solid rgba(201, 164, 78, 0.25); border-radius: 22px;
                    padding: 26px 22px 24px; box-shadow: 0 20px 50px -30px rgba(60, 44, 20, 0.35);
                    display: flex; flex-direction: column; gap: 16px;
                }
                .h1 { margin: 0; font-size: clamp(22px, 4.6vw, 30px); font-weight: 800; letter-spacing: -0.01em; }
                .sub { margin: -6px 0 2px; font-size: 14.5px; line-height: 1.7; color: #6d5a3d; }

                .typeGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                .typeCard {
                    display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
                    padding: 20px 12px 16px; border-radius: 18px; cursor: pointer;
                    background: #fff; border: 1.5px solid rgba(201, 164, 78, 0.22);
                    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
                }
                .typeCard:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -18px rgba(60, 44, 20, 0.4); border-color: rgba(201, 164, 78, 0.5); }
                .typeCard.sel { border-color: #b8893d; background: linear-gradient(180deg, #fffdf6, #fbf3e2); transform: translateY(-3px) scale(1.02); box-shadow: 0 16px 32px -18px rgba(170, 136, 64, 0.55); }
                .typeEmoji { font-size: 34px; line-height: 1; }
                .typeLabel { font-size: 16.5px; font-weight: 800; }
                .typeBlurb { font-size: 12px; color: #8a6f45; line-height: 1.5; }
                .loginLine { margin: 4px 0 0; text-align: center; font-size: 13px; color: #8a6f45; }
                .loginLine :global(a) { color: #a8843a; font-weight: 700; }

                .row2 { display: flex; gap: 10px; align-items: flex-start; }
                .amp { font-size: 22px; color: #b8893d; font-weight: 700; padding-top: 34px; }
                .field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
                .field.grow { flex: 2; }
                .ageField { max-width: 130px; }
                .field > span { font-size: 13.5px; font-weight: 700; color: #4c3b21; }
                .opt { font-weight: 400; color: #9a8665; }
                .field input {
                    border: 1.5px solid rgba(170, 136, 64, 0.28); background: #fff; border-radius: 13px;
                    padding: 12px 14px; font-size: 16px; color: #241c10; outline: none; width: 100%;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                    font-family: inherit;
                }
                .field input:focus { border-color: #b8893d; box-shadow: 0 0 0 3px rgba(184, 137, 61, 0.15); }
                .field em { font-style: normal; font-size: 12px; color: #a02c2c; }

                .swatches { display: flex; align-items: center; gap: 10px; }
                .swatch {
                    width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.9);
                    outline: 1.5px solid rgba(60, 44, 20, 0.15); cursor: pointer; color: #fff; font-weight: 800;
                    display: grid; place-items: center; transition: transform 0.15s ease, outline-color 0.15s ease;
                }
                .swatch:hover { transform: scale(1.1); }
                .swatch.sel { outline: 2px solid #b8893d; transform: scale(1.12); }
                .swatchName { font-size: 13px; color: #8a6f45; }

                .presetGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
                .presetCard {
                    display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 8px 10px;
                    background: #fff; border: 1.5px solid rgba(201, 164, 78, 0.2); border-radius: 15px; cursor: pointer;
                    transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
                }
                .presetCard:hover { transform: translateY(-3px); box-shadow: 0 12px 26px -16px rgba(60, 44, 20, 0.4); }
                .presetCard.sel { border-color: #b8893d; box-shadow: 0 12px 28px -14px rgba(170, 136, 64, 0.55); transform: translateY(-3px); }
                .pSwatch {
                    position: relative; width: 100%; aspect-ratio: 3/3.6; border-radius: 10px; overflow: hidden;
                    display: grid; place-items: center; border: 1px solid rgba(60, 44, 20, 0.1);
                }
                .pSwatch img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
                .pSwatch b { position: relative; font-size: 30px; color: #332612; font-weight: 700; }
                .pName { font-size: 12.5px; font-weight: 700; color: #4c3b21; }
                .pTag { font-size: 10.5px; color: #9a8665; }
                .pTag.sel { color: #7c6027; font-weight: 700; }
                .loading { text-align: center; color: #8a6f45; font-size: 14px; padding: 22px 0; }

                .meBox { background: #fffdf6; border: 1px solid rgba(201, 164, 78, 0.3); border-radius: 14px; padding: 14px 16px; font-size: 14.5px; }
                .meBox p { margin: 0 0 6px; }
                .linkBtn { background: none; border: 0; color: #a8843a; font-weight: 700; font-size: 13.5px; cursor: pointer; padding: 2px 0; text-align: right; font-family: inherit; }
                .pwWrap { position: relative; }
                .pwWrap input { padding-inline-end: 44px; }
                .pwEye { position: absolute; inset-inline-end: 8px; top: 50%; transform: translateY(-50%); background: none; border: 0; font-size: 17px; cursor: pointer; }

                .errBox {
                    background: rgba(196, 59, 59, 0.08); border: 1px solid rgba(196, 59, 59, 0.25);
                    color: #8f2626; border-radius: 12px; padding: 11px 14px; font-size: 13.5px; line-height: 1.6;
                }

                .cta {
                    margin-top: 4px; border: 0; cursor: pointer; border-radius: 15px; padding: 14px 20px;
                    font-size: 16px; font-weight: 800; color: #fff; font-family: inherit;
                    background: linear-gradient(180deg, #d3b46a, #b8893d);
                    box-shadow: 0 14px 28px -12px rgba(170, 136, 64, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35);
                    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
                }
                .cta:hover { transform: translateY(-2px); filter: brightness(1.04); }
                .cta:active { transform: scale(0.985); }
                .cta:disabled { opacity: 0.65; cursor: default; transform: none; }
                .cta.big { padding: 16px 22px; font-size: 17px; }
                .trust { margin: 2px 0 0; text-align: center; font-size: 12px; color: #8a6f45; }

                .doneCard { text-align: center; }
                .doneGrid { display: grid; grid-template-columns: 1fr; gap: 14px; }
                @media (min-width: 640px) { .doneGrid { grid-template-columns: auto 1fr; align-items: start; } }
                .qrBox {
                    display: flex; flex-direction: column; align-items: center; gap: 8px;
                    background: #fff; border: 1px solid rgba(201, 164, 78, 0.3); border-radius: 18px; padding: 16px;
                }
                .qrInner { background: #fff; padding: 6px; border-radius: 10px; }
                .qrBox span { font-size: 12.5px; color: #8a6f45; font-weight: 700; }
                .linksBox { display: flex; flex-direction: column; gap: 10px; }
                .linkRow {
                    display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: right;
                    background: #fff; border: 1px solid rgba(201, 164, 78, 0.25); border-radius: 14px; padding: 11px 14px;
                }
                .linkRow > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                .linkRow b { font-size: 13px; }
                .linkRow span { font-size: 11px; color: #9a8665; direction: ltr; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46vw; }
                .linkRow button {
                    flex-shrink: 0; border: 1.5px solid rgba(170, 136, 64, 0.4); background: #fffdf6; color: #7c6027;
                    border-radius: 10px; padding: 8px 13px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit;
                }
                .waBtn {
                    display: block; text-align: center; background: #eafff1; border: 1.5px solid rgba(37, 160, 90, 0.35);
                    color: #1c7a44; border-radius: 14px; padding: 11px; font-weight: 800; font-size: 14px; text-decoration: none;
                }
                .doneCtas { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
                .ghost {
                    text-align: center; padding: 12px; border-radius: 14px; border: 1.5px solid rgba(170, 136, 64, 0.35);
                    color: #7c6027; font-weight: 700; font-size: 14.5px; text-decoration: none; background: rgba(255, 255, 255, 0.6);
                }
            `}</style>
        </div>
    )
}
