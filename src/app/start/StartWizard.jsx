'use client'

// StartWizard v2 — the self-serve "open your blessing book" experience,
// designed to feel like a gift being unwrapped rather than a form.
//
//   • Real portfolio covers fan out on the opening screen — proof, not
//     promises. (Same images the landing page uses.)
//   • The accent color of the WHOLE wizard follows the chosen event
//     type (wedding gold, bar mitzvah blue, bat mitzvah rose, birthday
//     coral) via CSS variables — buttons, rings, dots, frames.
//   • A live 3D book builds itself as you type; presets re-skin it.
//   • Micro-interactions everywhere: staggered card entrances, shine
//     sweeps on CTAs, popping selection badges, skeleton shimmer while
//     presets load, a gentle shake on errors, confetti on success.
//   • Success screen leads with SHARING (WhatsApp + link) — never with
//     an upsell; the packages get one quiet line at the bottom.
//   • The server seeds a welcome blessing, so the book is born with a
//     first page — "הברכה הראשונה כבר בפנים".
//
// Logic is unchanged from v1: auth (signup/login/already-in), session
// cookie via /api/login, create-event API, postMessage to the mobile
// app's WebView on completion.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { auth, db } from '@/lib/firebaseClient'
import { setExpiryWeek } from '@/lib/sessionExpiry'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { listPresets, resolvePreset } from '@/lib/studioPresets'
import { PUBLIC_EVENT_TYPES, EVENT_TYPE_META, validateNewEvent, eventDisplayTitle } from '@/lib/onboarding'
import { frankRuhl } from '@/app/fonts'
import { EVENT_PNG_ICON } from './EventTypeIcons'
import { bakeCoverPhoto } from '@/lib/coverPhotoBake'

const AUTO_THEME = { wedding: 'gold', birthday: 'pink', bar_mitzvah: 'blue', bat_mitzvah: 'blue' }
const STEP_LABELS = ['סוג האירוע', 'הפרטים', 'העיצוב', 'יוצאים לדרך']
const DEFAULT_COVER = { backgroundColor: '#f7f1e3', texture: '/textures/tex9.png' }
const WA = 'https://wa.link/0sesxc'
// Paste a Grow/Meshulam/PayPlus payment-page URL to turn the upsell
// into self-serve checkout; empty = WhatsApp conversation.
const PAY_LINK_BASIS = ''

// Wizard-wide accent per event type — flows into every control.
const ACCENTS = {
    wedding: { a: '#b8893d', b: '#d9bc72', soft: 'rgba(201, 164, 78, 0.16)' },
    bar_mitzvah: { a: '#3f68a6', b: '#7397cb', soft: 'rgba(63, 104, 166, 0.14)' },
    bat_mitzvah: { a: '#b25e8c', b: '#d996ba', soft: 'rgba(178, 94, 140, 0.14)' },
    birthday: { a: '#c26b38', b: '#e5a069', soft: 'rgba(194, 107, 56, 0.14)' },
}

// Real books from the portfolio (same assets as the landing page).
const PORTFOLIO = [
    { src: '/imgs/portfolio/bar-mitzvah/cover.webp', alt: 'הספר של נועם — בר מצווה' },
    { src: '/imgs/portfolio/wedding/cover.webp', alt: 'הספר של שקד ודור — חתונה' },
    { src: '/imgs/portfolio/birthday/cover.webp', alt: 'הספר של ג׳רי — יום הולדת 90' },
]

function prettyDate(iso) {
    if (!iso) return ''
    try {
        return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
        return ''
    }
}

function weddingTitle(w) {
    if (w.customTitle) return w.customTitle
    if ((w.eventType || 'wedding') === 'wedding') {
        const a = (w.brideNameHe || w.brideName || '').trim()
        const b = (w.groomNameHe || w.groomName || '').trim()
        if (a || b) return [a, b].filter(Boolean).join(' & ')
    }
    return (w.celebrantNameHe || w.celebrantName || '').trim() || 'האירוע שלי'
}

// ── Live book preview ────────────────────────────────────────────────
function BookPreview({ data, presetValues, mode = 'cover' }) {
    const v = presetValues || DEFAULT_COVER
    const title = eventDisplayTitle(data)
    const meta = data.eventType ? EVENT_TYPE_META[data.eventType] : null
    const titleFont = v.nameFontClass || v.fontClass || frankRuhl.className

    // Interior page — a 1:1 replica of the studio's CLASSIC page
    // template: guest name on top, the 4:3-locked photo (preset width,
    // radius, margins), then the blessing text — square page with the
    // preset's background, texture, frame and fonts. Sizes follow the
    // template's percent system with small legibility floors.
    if (mode === 'page') {
        const PAGE = 290
        const pct = x => (PAGE * (Number(x) || 0)) / 100
        const imgW = PAGE * ((Number(v.imageStyle?.width) || 80) / 100)
        const imgH = imgW * 0.75 // the book's 4:3 photo lock
        const textSize = pct(v.fontSizePercent ?? 3)
        const nameSize = pct(v.nameFontSizePercent ?? (v.fontSizePercent ? v.fontSizePercent * 0.7 : 2.1))
        const bodyFont = v.fontClass || frankRuhl.className
        return (
            <div className='pp'>
                <div
                    className='ppPage'
                    key={(v.__id || 'default') + '-page'}
                    style={{
                        backgroundColor: v.backgroundColor || '#fffdf6',
                        backgroundImage: v.texture ? `url(${v.texture})` : 'none',
                        backgroundRepeat: 'repeat',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: pct(v.borderRadius || 0),
                        padding: pct(v.pagePadding ?? 4),
                    }}
                >
                    {v.frame ? <img src={v.frame} alt='' className='ppFrameImg' /> : null}
                    <div
                        className={`ppName ${v.nameFontClass || bodyFont}`}
                        style={{
                            fontSize: nameSize,
                            fontWeight: v.nameFontWeight ?? v.fontWeight,
                            color: v.nameColor ?? v.fontColor ?? '#3a2d1a',
                            marginTop: pct(v.nameMarginTop ?? 1),
                            marginBottom: pct(v.nameMarginBottom ?? 1),
                            maxWidth: '60%',
                        }}
                    >
                        משפחת לוי
                    </div>
                    <img
                        src='/imgs/img3.jpg'
                        alt=''
                        className='ppPhoto'
                        style={{
                            width: imgW,
                            height: imgH,
                            borderRadius: v.imageStyle?.borderRadius ?? '12px',
                            marginTop: pct(v.imageMarginTop ?? 2),
                            marginBottom: pct(v.imageMarginBottom ?? 2),
                        }}
                    />
                    <div className='ppTextWrap' style={{ maxWidth: `${v.textMaxWidth ?? 85}%`, marginTop: pct(v.textMarginTop ?? 0) }}>
                        <p
                            className={bodyFont}
                            style={{
                                fontSize: textSize,
                                fontWeight: v.fontWeight,
                                color: v.fontColor ?? '#3a2d1a',
                                lineHeight: v.textLineHeight ?? 1.5,
                            }}
                        >
                            מזל טוב! מאחלים לכם חיים של אושר, צחוק ואהבה. היה ערב בלתי נשכח 💛
                        </p>
                    </div>
                    <div className='ppShine' />
                </div>
                <div className='ppShadow' />
                <style jsx>{`
                    .pp { display: flex; flex-direction: column; align-items: center; gap: 10px; }
                    .ppPage {
                        position: relative; width: 290px; aspect-ratio: 1 / 1; overflow: hidden;
                        box-sizing: border-box; text-align: center;
                        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
                        box-shadow: 0 24px 48px -18px rgba(48, 34, 12, 0.45), 0 4px 14px rgba(48, 34, 12, 0.16);
                        animation: ppFloat 5.5s ease-in-out infinite, ppIn 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                    }
                    .ppFrameImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; z-index: 10; }
                    .ppName { position: relative; z-index: 5; opacity: 0.85; max-width: 60%; word-wrap: break-word; }
                    .ppPhoto { position: relative; z-index: 5; object-fit: cover; display: block; }
                    .ppTextWrap { position: relative; z-index: 5; }
                    .ppTextWrap p { margin: 0; white-space: pre-line; word-wrap: break-word; }
                    .ppShine {
                        position: absolute; inset: 0; pointer-events: none; z-index: 12;
                        background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.35) 46%, transparent 60%);
                        transform: translateX(-120%); animation: ppSweep 0.9s ease 0.15s forwards;
                    }
                    .ppShadow { width: 220px; height: 16px; border-radius: 50%; background: radial-gradient(closest-side, rgba(48, 34, 12, 0.22), transparent); }
                    @keyframes ppFloat { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
                    @keyframes ppIn { from { opacity: 0; scale: 0.94; } to { opacity: 1; scale: 1; } }
                    @keyframes ppSweep { to { transform: translateX(120%); } }
                `}</style>
            </div>
        )
    }

    return (
        <div className='bp'>
            <div className='bpBook' key={v.__id || 'default'}>
                <div className='bpCover' style={{ background: v.backgroundColor || '#f7f1e3' }}>
                    {v.texture ? <img src={v.texture} alt='' className='bpTex' /> : null}
                    {/* Wizard-uploaded celebrant photo — the PNG already
                        carries its alpha fade, so it just melts into the
                        cover exactly like the real BookCoverTemplate will. */}
                    {data.coverPhoto ? <img src={data.coverPhoto} alt='' className='bpPhoto' /> : null}
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
                    position: relative; width: 244px; aspect-ratio: 1 / 1;
                    transform: perspective(1100px) rotateY(13deg) rotateX(3deg);
                    transform-style: preserve-3d;
                    animation: bpFloat 5.5s ease-in-out infinite, bpIn 0.55s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .bpCover {
                    position: absolute; inset: 0; border-radius: 14px 5px 5px 14px; overflow: hidden;
                    box-shadow: 0 24px 48px -18px rgba(48, 34, 12, 0.45), 0 4px 14px rgba(48, 34, 12, 0.18);
                }
                .bpTex { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
                .bpPhoto {
                    position: absolute; top: 56%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 88%; height: 88%; object-fit: contain;
                    z-index: 1; pointer-events: none;
                }
                .bpFrame {
                    position: absolute; inset: 10px; border: 1px solid var(--acc, rgba(170, 136, 64, 0.55));
                    opacity: 0.65; border-radius: 9px; pointer-events: none;
                }
                .bpInner {
                    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
                    justify-content: center; text-align: center; padding: 22px 16px; gap: 8px;
                }
                .bpKicker { font-size: 10px; letter-spacing: 0.28em; color: rgba(90, 70, 35, 0.75); font-weight: 600; }
                .bpTitle { margin: 0; font-size: 24px; line-height: 1.25; color: #332612; font-weight: 700; word-break: break-word; }
                .bpRule { width: 44px; height: 1px; background: linear-gradient(90deg, transparent, var(--acc, #aa8840), transparent); }
                .bpSub { font-size: 12px; color: rgba(90, 70, 35, 0.85); letter-spacing: 0.12em; }
                .bpDate { font-size: 11px; color: rgba(90, 70, 35, 0.6); margin-top: 2px; }
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
                @keyframes bpFloat { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } }
                @keyframes bpIn { from { opacity: 0; scale: 0.94; } to { opacity: 1; scale: 1; } }
                @keyframes bpSweep { to { transform: translateX(120%); } }
            `}</style>
        </div>
    )
}

// ── Real covers, fanned like a hand of treasures ─────────────────────
function CoversFan() {
    return (
        <div className='fan' aria-hidden='true'>
            {PORTFOLIO.map((p, i) => (
                <img key={p.src} src={p.src} alt={p.alt} loading='lazy' className={`fanImg f${i}`} />
            ))}
            <span className='fanCaption'>ספרים אמיתיים שנפתחו אצלנו 💛</span>
            <style jsx>{`
                .fan { position: relative; width: 288px; height: 140px; margin: 2px auto 0; }
                .fanImg {
                    position: absolute; top: 12px; width: 96px; aspect-ratio: 1 / 1; object-fit: cover;
                    border-radius: 9px; border: 3px solid #fff;
                    box-shadow: 0 16px 30px -14px rgba(60, 44, 20, 0.5);
                    animation: fanIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both, fanFloat 5s ease-in-out infinite;
                }
                .f0 { left: 4px; transform: rotate(-9deg); animation-delay: 0.05s, 0.8s; }
                .f1 { left: 96px; top: 2px; z-index: 2; transform: rotate(0deg) scale(1.08); animation-delay: 0.15s, 0s; }
                .f2 { left: 188px; transform: rotate(9deg); animation-delay: 0.25s, 1.6s; }
                .fanCaption {
                    position: absolute; bottom: -6px; left: 0; right: 0; text-align: center;
                    font-size: 11.5px; color: #8a6f45; font-weight: 600;
                }
                @keyframes fanIn { from { opacity: 0; transform: translateY(18px) rotate(0deg) scale(0.9); } }
                @keyframes fanFloat { 0%, 100% { translate: 0 0; } 50% { translate: 0 -5px; } }
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
        coverPhoto: '', // baked (alpha-faded) data-URL PNG — see lib/coverPhotoBake.js
    })
    const [presets, setPresets] = useState(null) // null = loading, [] = none
    const [presetId, setPresetId] = useState(null)
    const [account, setAccount] = useState({ mode: 'signup', name: '', email: '', password: '', show: false })
    const [user, setUser] = useState(null)
    const [authReady, setAuthReady] = useState(false)
    const [busy, setBusy] = useState(false)
    const [coverBusy, setCoverBusy] = useState(false)
    const [err, setErr] = useState('')
    const [fieldErrs, setFieldErrs] = useState({})
    const [created, setCreated] = useState(null)
    const [copied, setCopied] = useState('')
    const [maxStep, setMaxStep] = useState(0)
    const [myEvents, setMyEvents] = useState(null)
    // Inside the mobile app's WebView (/onboard) the web portal is the
    // wrong destination — everything closes back into the native app.
    const [inApp, setInApp] = useState(false)
    useEffect(() => { setInApp(typeof window !== 'undefined' && !!window.ReactNativeWebView) }, [])

    // Hide the app-shell Header + Footer while /start is mounted — the
    // mobile create screen has no site nav; the whole viewport is the
    // wizard. Same pattern as LandingClient uses on /landing.
    // Also lock html + body to the dynamic viewport height and clip
    // scroll so the wizard sits inside one screen the way the mobile
    // create flow does. Restored on unmount.
    useEffect(() => {
        const header = document.querySelector('body > header')
        const footer = document.querySelector('body > footer')
        const ph = header?.style.display
        const pf = footer?.style.display
        if (header) header.style.display = 'none'
        if (footer) footer.style.display = 'none'
        const html = document.documentElement
        const body = document.body
        const prev = {
            htmlOverflow: html.style.overflow,
            bodyOverflow: body.style.overflow,
            htmlHeight: html.style.height,
            bodyHeight: body.style.height,
        }
        html.style.overflow = 'hidden'
        body.style.overflow = 'hidden'
        html.style.height = '100dvh'
        body.style.height = '100dvh'
        return () => {
            if (header) header.style.display = ph || ''
            if (footer) footer.style.display = pf || ''
            html.style.overflow = prev.htmlOverflow
            body.style.overflow = prev.bodyOverflow
            html.style.height = prev.htmlHeight
            body.style.height = prev.bodyHeight
        }
    }, [])

    function notifyApp() {
        try {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'wt_onboarding_done',
                email: (user?.email || account.email || '').toLowerCase(),
            }))
        } catch {}
    }
    const stepRef = useRef(null)

    useEffect(() => { setMaxStep(m => Math.max(m, step)) }, [step])

    async function loadMyEvents(u) {
        try {
            const snap = await getDocs(query(collection(db, 'weddings'), where('ownerId', '==', u.uid)))
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
            setMyEvents(rows)
        } catch {
            setMyEvents([])
        }
    }

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

    const mountedRef = useRef(false)
    useEffect(() => {
        if (!mountedRef.current) { mountedRef.current = true; return }
        try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch {}
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
    const accent = ACCENTS[data.eventType] || ACCENTS.wedding
    const bothNames = data.eventType === 'wedding' && data.brideName.trim() && data.groomName.trim()

    function pickType(t) {
        setData(d => ({ ...d, eventType: t }))
        setFieldErrs({})
        setTimeout(() => setStep(1), 260)
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
                body: JSON.stringify({
                    ...payload,
                    design,
                    coverPhoto: data.coverPhoto || undefined,
                    // Live preset link — the newborn book follows this studio
                    // preset's current values until the owner customizes.
                    presetId: presetId || undefined,
                }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                if (json?.errors && typeof json.errors === 'object') {
                    setFieldErrs(json.errors)
                    setStep(json.errors.eventType ? 0 : 1)
                }
                setErr(json?.message || 'משהו השתבש — נסו שוב עוד רגע')
                if (res.status === 403 && json?.error === 'limit' && u) loadMyEvents(u)
                return
            }
            try { localStorage.setItem('weddingId', json.weddingId) } catch {}
            setCreated(json)
            setStep(4)
            // Inside the mobile app's WebView (/onboard) — tell the app the
            // account+event exist so it can bounce back to native sign-in
            // with the email prefilled. No-op in a regular browser.
            try {
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'wt_onboarding_done',
                    email: (u?.email || account.email || '').toLowerCase(),
                }))
            } catch {}
        } finally {
            setBusy(false)
        }
    }

    // ── Optional cover photo (step 1) ─────────────────────────────
    // The file is baked client-side into an alpha-faded PNG (see
    // lib/coverPhotoBake.js) so the live preview AND the real cover
    // render the exact same blended asset.
    async function onCoverFile(e) {
        const f = e.target.files?.[0]
        e.target.value = '' // let the user re-pick the same file
        if (!f) return
        if (!/^image\//.test(f.type || '')) { setErr('אפשר להעלות רק קובץ תמונה'); return }
        setCoverBusy(true)
        setErr('')
        try {
            const baked = await bakeCoverPhoto(f)
            setData(d => ({ ...d, coverPhoto: baked }))
        } catch {
            setErr('לא הצלחנו לעבד את התמונה — נסו תמונה אחרת')
        } finally {
            setCoverBusy(false)
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
    const doneTitle = created ? eventDisplayTitle({ ...data, eventType: data.eventType }) : ''

    return (
        <div className='wiz' dir='rtl' style={{ '--acc': accent.a, '--accB': accent.b, '--accSoft': accent.soft }}>
            {/* The mobile bg_app.png / Container_BG.png stationery photo,
                copied to public/start-assets/. Fixed-attachment so it stays
                put while the wizard scrolls, low-opacity veil above to keep
                text legible. Matches the mobile create screen 1:1. */}
            <div className='pageBg' aria-hidden='true' />
            <div className='pageVeil' aria-hidden='true' />
            <div className='orb orbA' /><div className='orb orbB' />
            <i className='spark s1' /><i className='spark s2' /><i className='spark s3' /><i className='spark s4' /><i className='spark s5' />

            <header className='top'>
                {/* Mobile parity: no logo on step 0, only shown for the inner
                    steps. Matches the mobile create/index.tsx top bar rule. */}
                {step > 0 && (
                    <Link href='/landing' className='logoLink' aria-label='Wedding Tales'>
                        <img src='/logo-wt.png' alt='Wedding Tales' className='logo' />
                    </Link>
                )}
                {step < 4 && (
                    <div className='steps' aria-label='התקדמות'>
                        {STEP_LABELS.map((l, i) => (
                            <button
                                type='button'
                                key={l}
                                className={`stepDot ${i === step ? 'cur' : ''} ${i < step ? 'done' : ''}`}
                                disabled={i > maxStep}
                                onClick={() => { if (i <= maxStep) { setErr(''); setStep(i) } }}
                                aria-label={`שלב ${i + 1}: ${l}`}
                            >
                                <span className='dot'>{i < step ? '✓' : i + 1}</span>
                                <span className='dotLabel'>{l}</span>
                            </button>
                        ))}
                    </div>
                )}
                {step > 0 && step < 4 && (
                    <button className='back' onClick={() => { setErr(''); setStep(s => s - 1) }}>→ חזרה</button>
                )}
            </header>

            <main className={`body ${showPreview ? 'withSide' : 'noSide'}`} ref={stepRef}>
                {showPreview && (
                    <aside className='previewCol'>
                        <BookPreview data={data} presetValues={previewValues} mode={step === 2 ? 'page' : 'cover'} />
                        <p className='previewHint'>{step === 1 ? 'הספר נבנה תוך כדי שאתם כותבים ✍️' : step === 2 ? 'ככה נראה עמוד ברכה בעיצוב שבחרתם' : 'זה הספר שלכם — עוד צעד אחד'}</p>
                    </aside>
                )}

                <section className='formCol' key={step}>
                    {step === 0 && (
                        <div className='hero'>
                            {/* Eyebrow row — gold hairlines flanking the tagline, ported
                                verbatim from the mobile create/index.tsx design. */}
                            <div className='eyebrowRow'>
                                <span className='eyebrowLine' />
                                <span className='eyebrowText'>Wedding Tales — ספרי ברכות מאירועים אמיתיים</span>
                                <span className='eyebrowLine' />
                            </div>
                            <p className='ornament'>— ✦ —</p>

                            <h1 className='h1 heroH1'>
                                <span className='h1LineA'>האורחים כותבים.</span>
                                <span className='h1LineB'>אתם מקבלים ספר.</span>
                            </h1>
                            <p className='sub sub0'>עמוד ברכות לאורחים, ספר דיגיטלי חי — והכול מוכן בדקה אחת, בחינם.</p>
                            <p className='sub0Ask'>איזה אירוע חוגגים?</p>

                            <div className='typeGrid'>
                                {PUBLIC_EVENT_TYPES.map((t, i) => {
                                    const iconUrl = EVENT_PNG_ICON[t]
                                    return (
                                        <button
                                            key={t}
                                            className={`typeCard ${data.eventType === t ? 'sel' : ''}`}
                                            style={{ animationDelay: `${0.08 + i * 0.07}s`, '--tA': ACCENTS[t].a, '--tB': ACCENTS[t].b }}
                                            onClick={() => pickType(t)}
                                        >
                                            {/* Container_BG.png — the mobile stationery card art */}
                                            <span className='typeCardBg' aria-hidden='true' />
                                            <span className='typeMedal'>
                                                {iconUrl
                                                    ? <img src={iconUrl} alt='' className='typeIconPng' />
                                                    : EVENT_TYPE_META[t].emoji}
                                            </span>
                                            <span className='typeLabel'>{EVENT_TYPE_META[t].label}</span>
                                            <span className='typeBlurb'>{EVENT_TYPE_META[t].blurb}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            <CoversFan />

                            {/* Trust row — 3 checkmark items with gold verticals between,
                                same layout as the mobile hero. */}
                            <div className='trustRow' aria-label='מה מקבלים'>
                                {['אירוע ראשון במתנה', 'בלי כרטיסי אשראי', 'מוכן תוך דקה'].map((label, i) => (
                                    <span key={label} className='trustGroup'>
                                        {i > 0 && <span className='trustDivider' aria-hidden='true' />}
                                        <span className='trustItem'>
                                            <svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'>
                                                <circle cx='12' cy='12' r='9' opacity='0.35' />
                                                <path d='M8 12.5l3 3 5-6' strokeLinecap='round' strokeLinejoin='round' />
                                            </svg>
                                            <span>{label}</span>
                                        </span>
                                    </span>
                                ))}
                            </div>

                            <Link href='/login' className='loginPill' aria-label='כניסה לחשבון'>
                                כניסה לחשבון  ‹
                            </Link>
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
                                    <span className={`amp ${bothNames ? 'ampOn' : ''}`}>&</span>
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

                            <label className='field'>
                                <span>תמונה לכריכה <b className='opt'>(לא חובה — תשתלב במרכז הכריכה)</b></span>
                                <div className='coverUp'>
                                    {data.coverPhoto ? (
                                        <>
                                            <span className='coverThumb' style={{ backgroundImage: `url(${data.coverPhoto})` }} aria-hidden='true' />
                                            <span className='coverTxt'>מהמם! התמונה תשתלב בפייד עדין — רואים בתצוגה 🙂</span>
                                            <button type='button' className='coverBtn' onClick={() => setData(d => ({ ...d, coverPhoto: '' }))}>
                                                הסרה
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className='coverTxt'>
                                                {coverBusy ? 'משלבים את התמונה…' : 'תמונה של החוגגים — נשלב אותה במרכז הכריכה'}
                                            </span>
                                            <label className='coverBtn'>
                                                {coverBusy ? 'רגע…' : 'בחירת תמונה'}
                                                <input type='file' accept='image/*' onChange={onCoverFile} hidden disabled={coverBusy} />
                                            </label>
                                        </>
                                    )}
                                </div>
                            </label>

                            <button className='cta' type='submit'>ממשיכים לעיצוב ←</button>

                            <style jsx>{`
                                .coverUp {
                                    display: flex; align-items: center; gap: 10px;
                                    padding: 10px 12px; border: 1.5px dashed rgba(170, 136, 64, 0.45);
                                    border-radius: 12px; background: rgba(255, 253, 246, 0.65);
                                }
                                .coverThumb {
                                    width: 46px; height: 46px; border-radius: 50%; flex: 0 0 auto;
                                    background-size: cover; background-position: center;
                                    background-color: #efe6d2;
                                    box-shadow: 0 2px 8px rgba(60, 44, 20, 0.25);
                                }
                                .coverTxt { flex: 1; font-size: 12.5px; color: #7a6647; text-align: right; }
                                .coverBtn {
                                    flex: 0 0 auto; font-size: 12.5px; font-weight: 700; color: #6d5220;
                                    background: linear-gradient(180deg, #f4e7c8, #e8d5a8);
                                    border: 1px solid rgba(170, 136, 64, 0.5); border-radius: 999px;
                                    padding: 7px 14px; cursor: pointer;
                                }
                                .coverBtn:hover { filter: brightness(1.04); }
                            `}</style>
                        </form>
                    )}

                    {step === 2 && (
                        <div className='card'>
                            <h1 className='h1'>🎨 איזה עיצוב מדבר אליכם?</h1>
                            <p className='sub'>העיצובים האמיתיים מהסטודיו שלנו, מותאמים ל{meta?.label}. מקישים — והספר משמאל מתחלף.</p>

                            {presets === null && (
                                <div className='presetGrid'>
                                    {[0, 1, 2, 3].map(i => (
                                        <div key={i} className='skel' style={{ animationDelay: `${i * 0.12}s` }} />
                                    ))}
                                </div>
                            )}

                            {Array.isArray(presets) && (
                                <div className='presetGrid'>
                                    <button
                                        className={`presetCard ${presetId === null ? 'sel' : ''}`}
                                        onClick={() => setPresetId(null)}
                                    >
                                        {presetId === null && <span className='pBadge'>✓</span>}
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
                                                {presetId === p.id && <span className='pBadge'>✓</span>}
                                                <span className='pSwatch' style={{ background: v.backgroundColor || '#fff' }}>
                                                    {v.texture ? <img src={v.texture} alt='' /> : null}
                                                    <b className={frankRuhl.className}>א</b>
                                                </span>
                                                <span className='pName'>{p.name || 'עיצוב'}</span>
                                                <span className='pTag'>{presetId === p.id ? 'נבחר' : 'הקישו לתצוגה'}</span>
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

                            {Array.isArray(myEvents) && myEvents.length > 0 && (
                                <div className='mineBox'>
                                    <b className='mineTitle'>האירועים שכבר בחשבון שלכם</b>
                                    {myEvents.map(w => (
                                        <div className='mineRow' key={w.id}>
                                            <div className='mineInfo'>
                                                <b>{weddingTitle(w)}</b>
                                                <span>{EVENT_TYPE_META[w.eventType]?.label || 'אירוע'}{w.weddingDate ? ` · ${prettyDate(typeof w.weddingDate === 'string' ? w.weddingDate : '')}` : ''}</span>
                                            </div>
                                            {!inApp && <a className='mineGo' href={`/wedding/${w.id}/portal`}>כניסה ←</a>}
                                        </div>
                                    ))}
                                    {inApp ? (
                                        <button type='button' className='cta' onClick={notifyApp}>
                                            ממשיכים באפליקציה — האירועים שם ←
                                        </button>
                                    ) : (
                                        <Link className='mineAll' href='/my'>לניהול כל האירועים שלי</Link>
                                    )}
                                </div>
                            )}

                            <button className='cta big' type='submit' disabled={busy}>
                                {busy ? 'פותחים את הספר…' : 'פתחו את הספר שלי 🎉'}
                            </button>
                            <p className='trust'>✓ אירוע ראשון במתנה&nbsp;&nbsp;·&nbsp;&nbsp;✓ בלי כרטיס אשראי&nbsp;&nbsp;·&nbsp;&nbsp;✓ מוכן תוך דקה</p>
                        </form>
                    )}

                    {step === 4 && created && (
                        <div className='card doneCard'>
                            <Confetti />
                            <h1 className='h1'>🎉 מזל טוב! הספר של {doneTitle} באוויר</h1>
                            <p className='sub'>הברכה הראשונה כבר מחכה בפנים — מעכשיו הבמה של האורחים. שלחו להם את הקישור וצפו בספר מתמלא.</p>

                            <a
                                className='waBig'
                                href={`https://wa.me/?text=${encodeURIComponent('כותבים לנו ברכה לספר? 💛 ' + (created.links?.guest || ''))}`}
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                שתפו עם האורחים בוואטסאפ 💬
                            </a>

                            <div className='linkRow'>
                                <div>
                                    <b>🔗 הקישור לאורחים</b>
                                    <span dir='ltr'>{created.links?.guest}</span>
                                </div>
                                <button onClick={() => copy('guest', created.links?.guest)}>{copied === 'guest' ? 'הועתק ✓' : 'העתקה'}</button>
                            </div>

                            {inApp ? (
                                <button className='cta big' onClick={notifyApp}>
                                    ממשיכים באפליקציה ←
                                </button>
                            ) : (
                                <>
                                    <div className='rowBtns'>
                                        <a className='ghost half' href={created.links?.book} target='_blank' rel='noopener noreferrer'>
                                            📖 הציצו בספר
                                        </a>
                                        <button className='cta half' onClick={() => router.push(`/wedding/${created.weddingId}/portal`)}>
                                            לניהול האירוע ←
                                        </button>
                                    </div>
                                    <Link className='myLink' href='/my'>לכל האירועים שלי</Link>
                                </>
                            )}

                            <p className='quietUp'>
                                רוצים גם עמדת QR מעוצבת לאולם וכריכה אישית?{' '}
                                <a href={PAY_LINK_BASIS || WA} target='_blank' rel='noopener noreferrer'>
                                    {PAY_LINK_BASIS ? 'חבילת הבסיס — לרכישה מאובטחת 💳' : 'חבילת הבסיס — דברו איתנו'}
                                </a>
                            </p>
                        </div>
                    )}
                </section>
            </main>

            <style jsx>{`
                .wiz {
                    height: 100dvh; position: relative; overflow: hidden;
                    display: flex; flex-direction: column;
                    background:
                        radial-gradient(900px 500px at 85% -80px, var(--accSoft), transparent 60%),
                        radial-gradient(700px 420px at -60px 105%, rgba(201, 164, 78, 0.1), transparent 60%),
                        linear-gradient(180deg, #fdfaf2 0%, #faf5e9 55%, #f6efdf 100%);
                    color: #241c10;
                    font-family: var(--font-assistant), 'Assistant', 'Heebo', system-ui, sans-serif;
                    transition: background 0.6s ease;
                }
                /* bg_app.png — the mobile Page1 stationery photo, fixed
                   underneath everything. The veil above softens it to
                   the same warmth the mobile app renders on top of the
                   ImageBackground. */
                .pageBg {
                    position: fixed; inset: 0; z-index: 0; pointer-events: none;
                    background: #fdfaf2 url('/start-assets/bg_app.jpg') center/cover no-repeat;
                    opacity: 0.9;
                }
                .pageVeil {
                    position: fixed; inset: 0; z-index: 0; pointer-events: none;
                    background: linear-gradient(180deg, rgba(253,250,242,0.35) 0%, rgba(253,250,242,0.5) 60%, rgba(246,239,223,0.65) 100%);
                }
                .monoWrap { display: inline-flex; align-items: center; justify-content: center; margin-inline-end: 6px; }
                .logoLink { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
                .orb { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; transition: background 0.6s ease; }
                .orbA { width: 340px; height: 340px; background: var(--accSoft); top: -120px; inset-inline-start: -80px; }
                .orbB { width: 420px; height: 420px; background: rgba(233, 163, 176, 0.1); bottom: -180px; inset-inline-end: -120px; }
                .spark { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--accB); opacity: 0.4; pointer-events: none; animation: sparkFloat 7s ease-in-out infinite; }
                .s1 { top: 18%; inset-inline-start: 8%; animation-delay: 0s; }
                .s2 { top: 32%; inset-inline-end: 12%; animation-delay: 1.4s; width: 4px; height: 4px; }
                .s3 { top: 64%; inset-inline-start: 16%; animation-delay: 2.8s; width: 3px; height: 3px; }
                .s4 { top: 76%; inset-inline-end: 22%; animation-delay: 2s; }
                .s5 { top: 48%; inset-inline-start: 46%; animation-delay: 3.6s; width: 3px; height: 3px; }
                @keyframes sparkFloat { 0%, 100% { translate: 0 0; opacity: 0.25; } 50% { translate: 0 -16px; opacity: 0.55; } }

                .top {
                    position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;
                    gap: 14px; padding: 22px 18px 6px;
                }
                .logo { height: 44px; width: auto; }
                .back {
                    position: absolute; inset-inline-start: 18px; top: 26px; background: none; border: 0;
                    color: #8a6f45; font-size: 14px; cursor: pointer; padding: 8px; border-radius: 10px;
                    transition: background 0.15s ease;
                }
                .back:hover { background: rgba(201, 164, 78, 0.12); }
                .steps { position: relative; display: flex; gap: 22px; padding: 8px 4px 4px; }
                .stepDot {
                    position: relative;
                    display: flex; flex-direction: column; align-items: center; gap: 6px; width: 74px;
                    background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit;
                }
                .stepDot:disabled { cursor: default; }
                /* connector between each pair of dots — sits UNDER the circles */
                .stepDot + .stepDot::before,
                .stepDot + .stepDot::after {
                    content: ''; position: absolute; top: 17px; inset-inline-end: calc(50% + 17px);
                    width: 62px; height: 3px; border-radius: 3px;
                }
                .stepDot + .stepDot::before { background: rgba(170, 136, 64, 0.18); }
                .stepDot + .stepDot::after {
                    background: linear-gradient(90deg, var(--accB), var(--acc));
                    transform: scaleX(0); transform-origin: 100% 50%;
                    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .stepDot.cur + .stepDot::after { transform: scaleX(0); }
                .stepDot.cur::after, .stepDot.done::after { transform: scaleX(1); }
                .dot {
                    position: relative; z-index: 2;
                    width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
                    font-size: 15px; font-weight: 800; line-height: 1; color: #8a6f45;
                    background: #fff; border: 2px solid rgba(170, 136, 64, 0.35);
                    box-shadow: 0 3px 8px -4px rgba(60, 44, 20, 0.3);
                    transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
                }
                .stepDot:not(:disabled):hover .dot { transform: scale(1.06); border-color: var(--acc); }
                .stepDot.cur .dot { background: linear-gradient(180deg, var(--accB), var(--acc)); color: #fff; border-color: transparent; box-shadow: 0 8px 18px -7px var(--acc); transform: scale(1.1); }
                .stepDot.done .dot { background: var(--accSoft); color: var(--acc); border-color: transparent; }
                .stepDot:disabled .dot { opacity: 0.55; box-shadow: none; }
                .dotLabel { position: relative; z-index: 2; font-size: 11.5px; color: #8a6f45; font-weight: 600; white-space: nowrap; }
                .stepDot.cur .dotLabel { color: #5c451f; font-weight: 800; }
                .stepDot:disabled .dotLabel { opacity: 0.55; }

                .body {
                    position: relative; z-index: 2; display: grid; grid-template-columns: 1fr;
                    gap: 10px; max-width: 1040px; margin: 0 auto; padding: 6px 18px 12px;
                    flex: 1 1 auto; min-height: 0; width: 100%; box-sizing: border-box;
                    overflow-y: auto;
                }
                /* Keep the wizard column laid out even when it flexes short. */
                .formCol { min-height: 0; }
                .previewCol { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 8px; }
                .previewHint { font-size: 12.5px; color: #8a6f45; margin: 0; }
                .formCol { animation: stepIn 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
                @keyframes stepIn { from { opacity: 0; transform: translateY(18px) scale(0.99); } to { opacity: 1; transform: none; } }

                @media (min-width: 920px) {
                    .body.withSide { grid-template-columns: 1fr 380px; gap: 40px; padding-top: 26px; align-items: start; }
                    .body.noSide { max-width: 760px; padding-top: 18px; }
                    .previewCol { order: 2; position: sticky; top: 96px; }
                    .formCol { order: 1; }
                }

                .card {
                    background: rgba(255, 255, 255, 0.84); backdrop-filter: blur(12px);
                    border: 1px solid rgba(201, 164, 78, 0.25); border-radius: 24px;
                    padding: 26px 22px 24px; box-shadow: 0 24px 60px -34px rgba(60, 44, 20, 0.4);
                    display: flex; flex-direction: column; gap: 16px;
                    position: relative;
                }
                .card > * { animation: riseIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .card > *:nth-child(1) { animation-delay: 0.03s; }
                .card > *:nth-child(2) { animation-delay: 0.08s; }
                .card > *:nth-child(3) { animation-delay: 0.13s; }
                .card > *:nth-child(4) { animation-delay: 0.18s; }
                .card > *:nth-child(5) { animation-delay: 0.23s; }
                .card > *:nth-child(6) { animation-delay: 0.28s; }
                .card > *:nth-child(7) { animation-delay: 0.33s; }
                .card > *:nth-child(8) { animation-delay: 0.38s; }
                @keyframes riseIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

                /* Step 0 hero — no card wrapper, sits directly on the
                   bg_app photo, matching the mobile create screen where
                   hero0 is a flex column on the ImageBackground. Tight
                   spacing so the whole flow fits on one mobile screen
                   like the mobile app does. */
                .hero {
                    text-align: center;
                    display: flex; flex-direction: column; align-items: stretch;
                    gap: 10px; padding: 0 4px;
                    background: transparent; border: 0; box-shadow: none;
                    animation: none;
                }
                .hero > * { animation: none; }
                .hero :global(.fan) { margin-top: -6px; height: 118px; }
                .hero :global(.fan .fanImg) { width: 78px; }

                /* Short-viewport progressive shrink so the wizard always
                   fits within one screen — matches the "no vertical scroll"
                   look of the mobile create flow. Rules stack from tallest
                   to shortest so the tighter rule wins. */
                @media (max-height: 820px) {
                    .hero { gap: 8px; }
                    .heroH1 { gap: 2px; }
                    .heroH1 .h1LineA, .heroH1 .h1LineB { font-size: clamp(22px, 4.2vw, 28px); line-height: 1.2; }
                    .sub0 { font-size: 13.5px; margin-top: 4px; }
                    .typeMedal { width: 66px; height: 66px; }
                    .typeCard { padding: 12px 8px 10px; gap: 4px; }
                    .typeLabel { font-size: 14.5px; }
                    .typeBlurb { font-size: 11px; }
                    .hero :global(.fan) { height: 100px; }
                    .hero :global(.fan .fanImg) { width: 68px; }
                    .loginPill { padding: 12px 22px; font-size: 14.5px; }
                }
                @media (max-height: 720px) {
                    .eyebrowRow, .ornament { display: none; }
                    .heroH1 .h1LineA, .heroH1 .h1LineB { font-size: clamp(20px, 3.6vw, 24px); }
                    .typeMedal { width: 54px; height: 54px; }
                    .typeCard { padding: 10px 6px 8px; }
                    .typeBlurb { display: none; }
                    .hero :global(.fan) { height: 82px; margin-top: -10px; }
                    .hero :global(.fan .fanImg) { width: 58px; }
                    .fanCaption, .hero :global(.fanCaption) { font-size: 10px; }
                    .top { padding: 12px 18px 4px; }
                }
                @media (max-height: 640px) {
                    .hero :global(.fan) { display: none; }
                    .sub0Ask { display: none; }
                }
                .overline { margin: 0; font-size: 11.5px; letter-spacing: 0.16em; color: var(--acc); font-weight: 700; }
                .h1 { margin: 0; font-size: clamp(23px, 4.8vw, 32px); font-weight: 800; letter-spacing: -0.01em; line-height: 1.3; }
                .hero .h1 em {
                    font-style: normal;
                    background: linear-gradient(92deg, var(--acc), var(--accB) 55%, var(--acc));
                    -webkit-background-clip: text; background-clip: text; color: transparent;
                }
                .sub { margin: -6px 0 2px; font-size: 14.5px; line-height: 1.7; color: #6d5a3d; }

                /* Hero (Step 0) — mobile create/index.tsx design port. */
                .eyebrowRow { display: flex; align-items: center; justify-content: center; gap: 10px; margin: -4px 0 0; }
                .eyebrowLine { width: 26px; height: 1px; background: rgba(170, 136, 64, 0.55); }
                .eyebrowText { font-size: 11.5px; font-weight: 600; color: #8a6f45; letter-spacing: 0.01em; }
                .ornament { margin: 4px 0 6px; font-size: 10px; color: #b8893d; letter-spacing: 0.16em; text-align: center; }
                .heroH1 { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
                .heroH1 .h1LineA { color: #3b2a14; }
                .heroH1 .h1LineB {
                    background: linear-gradient(92deg, var(--acc), var(--accB) 55%, var(--acc));
                    -webkit-background-clip: text; background-clip: text; color: transparent;
                }
                .sub0 { margin: 6px auto 0; max-width: 440px; padding-inline: 6px; }
                .sub0Ask { margin: 2px 0 0; font-size: 13.5px; font-weight: 700; color: #5f4f33; }

                /* Trust row — 3 checkmark items separated by gold verticals. */
                .trustRow { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; color: #5f4f33; }
                .trustGroup { display: inline-flex; align-items: center; gap: 10px; }
                .trustItem { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
                .trustItem svg { color: var(--acc); flex-shrink: 0; }
                .trustDivider { width: 1px; height: 14px; background: rgba(170, 136, 64, 0.35); }

                /* Gradient pill "כניסה לחשבון" — the mobile loginCta. */
                .loginPill {
                    align-self: center; margin-top: 4px; padding: 14px 26px; border-radius: 999px;
                    background: linear-gradient(180deg, var(--accB), var(--acc));
                    color: #fff; font-weight: 700; font-size: 15.5px; letter-spacing: 0.2px;
                    text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.55);
                    box-shadow: 0 12px 28px -12px var(--acc), inset 0 1px 0 rgba(255, 255, 255, 0.35);
                    transition: transform 0.15s ease, box-shadow 0.2s ease;
                }
                .loginPill:hover { transform: translateY(-2px); box-shadow: 0 16px 32px -12px var(--acc), inset 0 1px 0 rgba(255, 255, 255, 0.4); }
                .loginPill:active { transform: scale(0.97); }

                .typeGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                @media (min-width: 640px) { .typeGrid { grid-template-columns: repeat(4, 1fr); } }
                .typeCard {
                    display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center;
                    padding: 18px 10px 14px; border-radius: 18px; cursor: pointer;
                    background: #fff; border: 1.5px solid rgba(201, 164, 78, 0.22);
                    transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease, border-color 0.18s ease;
                    animation: riseIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                .typeCard:hover { transform: translateY(-4px) rotate(-0.5deg); box-shadow: 0 16px 32px -18px rgba(60, 44, 20, 0.45); border-color: var(--tA); }
                .typeCard:active { transform: scale(0.97); }
                .typeCard.sel { border-color: var(--tA); background: linear-gradient(180deg, #fffdf6, #fbf3e2); transform: translateY(-4px) scale(1.03); box-shadow: 0 18px 34px -18px var(--tA); }
                .typeMedal {
                    width: 82px; height: 82px; display: grid; place-items: center;
                    transition: transform 0.2s ease;
                    position: relative; z-index: 1;
                }
                .typeIconPng {
                    width: 100%; height: 100%; object-fit: contain;
                    filter: drop-shadow(0 6px 12px rgba(184, 137, 61, 0.35));
                }
                /* Container_BG.png — the mobile stationery card art, sits
                   behind each tile's content as a texture layer. */
                .typeCardBg {
                    position: absolute; inset: 0; z-index: 0; border-radius: 18px;
                    background: url('/start-assets/Container_BG.png') center/100% 100% no-repeat;
                    opacity: 0.85; pointer-events: none;
                }
                .typeLabel, .typeBlurb { position: relative; z-index: 1; }
                .typeCard { position: relative; overflow: hidden; }

                /* Fan stage — the OpenBook illustration sits behind the covers
                   fan, exactly like the mobile Page1 layout. */
                .fanStage {
                    position: relative;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    padding: 12px 0 4px;
                }
                .openBook {
                    position: absolute; top: 6px; left: 50%; transform: translateX(-50%);
                    opacity: 0.85; pointer-events: none; z-index: 0;
                }
                .fanStage :global(.fan) { position: relative; z-index: 1; }
                .typeCard:hover .typeMedal { transform: scale(1.08) rotate(6deg); }
                .typeCard.sel .typeMedal { animation: medalPop 0.4s cubic-bezier(0.22, 1.6, 0.36, 1); }
                @keyframes medalPop { 50% { transform: scale(1.22); } }
                .typeLabel { font-size: 15.5px; font-weight: 800; }
                .typeBlurb { font-size: 11.5px; color: #8a6f45; line-height: 1.5; }
                .loginLine { margin: 0; text-align: center; font-size: 13px; color: #8a6f45; }
                .loginLine :global(a) { color: var(--acc); font-weight: 700; }

                .row2 { display: flex; gap: 10px; align-items: flex-start; }
                .amp { font-size: 22px; color: var(--acc); font-weight: 700; padding-top: 34px; transition: transform 0.2s ease; }
                .amp.ampOn { animation: ampPop 0.5s cubic-bezier(0.22, 1.6, 0.36, 1); }
                @keyframes ampPop { 40% { transform: scale(1.5) rotate(8deg); } }
                .field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
                .field.grow { flex: 2; }
                .ageField { max-width: 130px; }
                .field > span { font-size: 13.5px; font-weight: 700; color: #4c3b21; }
                .opt { font-weight: 400; color: #9a8665; }
                .field input {
                    box-sizing: border-box; max-width: 100%; min-width: 0;
                    border: 1.5px solid rgba(170, 136, 64, 0.28); background: #fff; border-radius: 13px;
                    padding: 12px 14px; font-size: 16px; color: #241c10; outline: none; width: 100%;
                    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
                    font-family: inherit;
                }
                .field input:focus { border-color: var(--acc); box-shadow: 0 0 0 4px var(--accSoft); transform: translateY(-1px); }
                .field em { font-style: normal; font-size: 12px; color: #a02c2c; animation: errShake 0.4s ease; }
                .field input[type='date'] {
                    appearance: none; -webkit-appearance: none; display: block;
                    width: 100%; max-width: 100%; min-width: 0; min-height: 49px;
                    direction: ltr; text-align: right; font-size: 15px;
                }
                .field input[type='date']::-webkit-date-and-time-value { text-align: right; }

                .presetGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
                .skel {
                    aspect-ratio: 3 / 4.4; border-radius: 15px;
                    background: linear-gradient(100deg, #f3ead6 40%, #faf5e9 50%, #f3ead6 60%);
                    background-size: 220% 100%;
                    animation: shimmer 1.3s ease-in-out infinite;
                }
                @keyframes shimmer { from { background-position: 130% 0; } to { background-position: -30% 0; } }
                .presetCard {
                    position: relative;
                    display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 8px 10px;
                    background: #fff; border: 1.5px solid rgba(201, 164, 78, 0.2); border-radius: 15px; cursor: pointer;
                    transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.16s ease, box-shadow 0.16s ease;
                }
                .presetCard:hover { transform: translateY(-4px); box-shadow: 0 14px 28px -16px rgba(60, 44, 20, 0.45); }
                .presetCard:active { transform: scale(0.97); }
                .presetCard.sel { border-color: var(--acc); box-shadow: 0 14px 30px -14px var(--acc); transform: translateY(-4px); }
                .pBadge {
                    position: absolute; top: -8px; inset-inline-start: -8px; z-index: 2;
                    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
                    background: linear-gradient(180deg, var(--accB), var(--acc)); color: #fff; font-weight: 800; font-size: 13px;
                    box-shadow: 0 6px 12px -5px var(--acc);
                    animation: badgePop 0.35s cubic-bezier(0.22, 1.6, 0.36, 1);
                }
                @keyframes badgePop { from { transform: scale(0); } }
                .pSwatch {
                    position: relative; width: 100%; aspect-ratio: 3/3.6; border-radius: 10px; overflow: hidden;
                    display: grid; place-items: center; border: 1px solid rgba(60, 44, 20, 0.1);
                }
                .pSwatch img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
                .pSwatch b { position: relative; font-size: 30px; color: #332612; font-weight: 700; }
                .pName { font-size: 12.5px; font-weight: 700; color: #4c3b21; }
                .pTag { font-size: 10.5px; color: #9a8665; }

                .meBox { background: #fffdf6; border: 1px solid rgba(201, 164, 78, 0.3); border-radius: 14px; padding: 14px 16px; font-size: 14.5px; }
                .meBox p { margin: 0 0 6px; }
                .linkBtn { background: none; border: 0; color: var(--acc); font-weight: 700; font-size: 13.5px; cursor: pointer; padding: 2px 0; text-align: right; font-family: inherit; }
                .pwWrap { position: relative; }
                .pwWrap input { padding-inline-end: 44px; }
                .pwEye { position: absolute; inset-inline-end: 8px; top: 50%; transform: translateY(-50%); background: none; border: 0; font-size: 17px; cursor: pointer; }

                .errBox {
                    background: rgba(196, 59, 59, 0.08); border: 1px solid rgba(196, 59, 59, 0.25);
                    color: #8f2626; border-radius: 12px; padding: 11px 14px; font-size: 13.5px; line-height: 1.6;
                    animation: errShake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97);
                }
                @keyframes errShake {
                    10%, 90% { transform: translateX(-1px); }
                    20%, 80% { transform: translateX(2px); }
                    30%, 50%, 70% { transform: translateX(-3px); }
                    40%, 60% { transform: translateX(3px); }
                }

                .mineBox {
                    background: #fffdf6; border: 1px solid rgba(201, 164, 78, 0.35); border-radius: 16px;
                    padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; text-align: right;
                    animation: riseIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                .mineTitle { font-size: 13.5px; color: #4c3b21; }
                .mineRow {
                    display: flex; align-items: center; justify-content: space-between; gap: 10px;
                    background: #fff; border: 1px solid rgba(201, 164, 78, 0.22); border-radius: 12px; padding: 10px 13px;
                }
                .mineInfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
                .mineInfo b { font-size: 14.5px; color: #241c10; }
                .mineInfo span { font-size: 11.5px; color: #9a8665; }
                .mineGo {
                    flex-shrink: 0; text-decoration: none; font-size: 13px; font-weight: 800; color: #fff;
                    background: linear-gradient(180deg, var(--accB), var(--acc)); padding: 8px 14px; border-radius: 10px;
                    box-shadow: 0 8px 16px -8px var(--acc); transition: transform 0.14s ease;
                }
                .mineGo:hover { transform: translateY(-1px); }
                .mineAll { text-align: center; font-size: 12.5px; color: var(--acc); font-weight: 700; }

                .cta {
                    position: relative; overflow: hidden;
                    margin-top: 4px; border: 0; cursor: pointer; border-radius: 15px; padding: 14px 20px;
                    font-size: 16px; font-weight: 800; color: #fff; font-family: inherit;
                    background: linear-gradient(180deg, var(--accB), var(--acc));
                    box-shadow: 0 14px 28px -12px var(--acc), inset 0 1px 0 rgba(255, 255, 255, 0.35);
                    transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.16s ease, filter 0.16s ease;
                }
                .cta::after {
                    content: ''; position: absolute; inset: 0;
                    background: linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.4) 50%, transparent 68%);
                    transform: translateX(160%);
                }
                .cta:hover { transform: translateY(-2px); filter: brightness(1.04); }
                .cta:hover::after { animation: ctaShine 0.75s ease; }
                @keyframes ctaShine { from { transform: translateX(160%); } to { transform: translateX(-160%); } }
                .cta:active { transform: scale(0.975); }
                .cta:disabled { opacity: 0.65; cursor: default; transform: none; }
                .cta.big { padding: 16px 22px; font-size: 17px; }
                .trust { margin: 2px 0 0; text-align: center; font-size: 12px; color: #8a6f45; }

                .doneCard { text-align: center; }
                .waBig {
                    display: block; text-align: center; text-decoration: none;
                    background: linear-gradient(180deg, #35c471, #1f9b53); color: #fff;
                    border-radius: 15px; padding: 16px 20px; font-weight: 800; font-size: 16.5px;
                    box-shadow: 0 14px 30px -12px rgba(31, 155, 83, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.3);
                    transition: transform 0.16s ease, filter 0.16s ease;
                }
                .waBig:hover { transform: translateY(-2px); filter: brightness(1.05); }
                .waBig:active { transform: scale(0.98); }
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
                    transition: transform 0.14s ease;
                }
                .linkRow button:active { transform: scale(0.95); }
                .rowBtns { display: flex; gap: 10px; }
                .rowBtns .half { flex: 1; margin-top: 0; }
                .ghost {
                    display: grid; place-items: center;
                    text-align: center; padding: 13px 12px; border-radius: 15px; border: 1.5px solid rgba(170, 136, 64, 0.35);
                    color: #7c6027; font-weight: 700; font-size: 14.5px; text-decoration: none; background: rgba(255, 255, 255, 0.6);
                    transition: transform 0.16s ease, box-shadow 0.16s ease;
                }
                .ghost:hover { transform: translateY(-2px); box-shadow: 0 10px 22px -14px rgba(60, 44, 20, 0.4); }
                .myLink { font-size: 13px; color: #8a6f45; font-weight: 700; text-decoration: none; }
                .myLink:hover { color: var(--acc); }
                .quietUp { margin: 2px 0 0; font-size: 12.5px; color: #9a8665; }
                .quietUp a { color: var(--acc); font-weight: 700; }
            `}</style>
        </div>
    )
}
