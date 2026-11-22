'use client'
// Customer portal — a FULL 1:1 web replica of the mobile app (owner
// request: "total synergy — the portal must be exactly the app").
// Four tabs behind the app's floating glass dock with the gold center
// plus: הבית (home), ברכות (management-lite), הספר (immersive book,
// dock hidden, back arrow), שיתוף (QR + WhatsApp + links). Same
// artwork, same icons, same glass, same gold.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../../../lib/firebaseClient'
import QRCode from 'react-qr-code'
import PosterSheet from './PosterSheet'
import { Heebo } from 'next/font/google'

const heebo = Heebo({ subsets: ['latin'], weight: ['400', '600', '700', '900'] })

const SITE = 'https://app.weddingtales.co.il'
const GOLD = '#2545E0' // the accent (named GOLD while the portal was gold)
const INK = '#14183A'
const MUT = '#5A5D75'

// ── tiny inline icon set (stroke style ≈ Ionicons outline) ──────────
function Ic({ d, size = 22, color = GOLD, sw = 1.7, fill = 'none' }) {
    return (
        <svg width={size} height={size} viewBox='0 0 24 24' fill={fill} stroke={color} strokeWidth={sw} strokeLinecap='round' strokeLinejoin='round'>
            {d}
        </svg>
    )
}
const I = {
    home: on => <Ic color={on ? GOLD : '#9A9DB0'} d={<><path d='M3 10.5 12 3l9 7.5' /><path d='M5 9.5V21h14V9.5' /></>} />,
    heart: on => <Ic color={on ? GOLD : '#9A9DB0'} fill={on ? GOLD : 'none'} d={<path d='M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 5 6.8 5c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.2 0 5.1 3 4 6.2-1.7 4.7-9.2 9.3-9.2 9.3Z' />} />,
    book: on => <Ic color={on ? GOLD : '#9A9DB0'} d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} />,
    share: on => <Ic color={on ? GOLD : '#9A9DB0'} d={<><circle cx='6' cy='12' r='2.5' /><circle cx='17' cy='6' r='2.5' /><circle cx='17' cy='18' r='2.5' /><path d='m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6' /></>} />,
    brush: <Ic d={<><path d='M14.5 3.5 20.5 9.5 9 21H3v-6L14.5 3.5Z' /><path d='m12.5 5.5 6 6' /></>} color={GOLD} />,
    link: <Ic d={<><path d='M9.5 14.5 14.5 9.5' /><path d='M11 6.5 12.8 4.7a4 4 0 0 1 5.7 5.7L16.6 12.2' /><path d='M13 17.5 11.2 19.3a4 4 0 0 1-5.7-5.7L7.4 11.8' /></>} color={GOLD} />,
    bookT: <Ic d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} color={GOLD} />,
    back: <Ic d={<path d='m14 6-6 6 6 6' />} color='#f3e9d2' size={22} sw={2} />,
    plus: <Ic d={<path d='M12 5v14M5 12h14' />} color='#fff' size={28} sw={2.2} />,
    pencil: <Ic d={<><path d='M14.5 3.5 20.5 9.5 9 21H3v-6L14.5 3.5Z' /></>} color={GOLD} size={16} />,
    wa: <Ic d={<><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z' /><path d='M8.8 9.2c.3 2.7 3.3 5.7 6 6l1.4-1.4-2-1.2-1 .7c-.8-.4-1.7-1.3-2.1-2.1l.7-1-1.2-2-1.8 1Z' /></>} color='#fff' size={19} />,
}

function titleOf(w) {
    if (!w) return ''
    if (w.customTitle) return w.customTitle
    const a = (w.brideNameHe || w.brideName || '').trim()
    const b = (w.groomNameHe || w.groomName || '').trim()
    if (a || b) return [a, b].filter(Boolean).join(' & ')
    return (w.celebrantNameHe || w.celebrantName || '').trim() || 'הספר שלכם'
}
function coverFace(w) {
    const cd = { ...(w?.book?.designSettings || {}), ...(w?.coverDesign || {}) }
    const token = w?.digitalTokens?.[0] || ''
    const raw = [cd.coverImage, cd.coverTexture, cd.texture].find(v => typeof v === 'string' && v.trim())
    if (!raw) return null
    const abs = raw.startsWith('/') ? `${SITE}${raw}` : raw
    if (!/^https?:\/\//i.test(abs)) return null
    return abs.includes('/api/book-photo') && !abs.includes('?') ? `${abs}?token=${token}` : abs
}
// Our own resizer (src/app/api/img) — 4MB guest uploads become ~30KB thumbs.
const SIZES = [64, 96, 128, 256, 384, 640, 750, 828, 1080]
function opt(url, w = 640) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url || null
    const width = SIZES.find(s => s >= w) ?? 1080
    return `/api/img?url=${encodeURIComponent(url)}&w=${width}&q=72`
}
function fmtWhen(ts) {
    try {
        if (!ts?.seconds) return ''
        const d = new Date(ts.seconds * 1000)
        return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }) + ' · ' +
            d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
}

const card = {
    background: '#FFFFFF', border: '1px solid #E4DFD3',
    borderRadius: 22, boxShadow: '0 1px 2px rgba(20,24,58,0.06), 0 14px 30px -22px rgba(20,24,58,0.35)',
}

export default function PortalApp() {
    const { weddingId } = useParams()
    const [tab, setTab] = useState('home')
    const [w, setW] = useState(null)
    const [entries, setEntries] = useState(null)
    const [q, setQ] = useState('')
    const [selected, setSelected] = useState(null)
    const [editing, setEditing] = useState(null)
    const [eName, setEName] = useState('')
    const [eText, setEText] = useState('')
    const [eImg, setEImg] = useState(null) // null | 'REMOVE' | dataURL
    const [saving, setSaving] = useState(false)
    const [copied, setCopied] = useState('')
    const fileRef = useRef(null)
    // ?view=poster shows the printable event sign instead of the app-like home
    const [view, setView] = useState('')
    useEffect(() => { try { setView(new URLSearchParams(window.location.search).get('view') || '') } catch { /* ignore */ } }, [])

    useEffect(() => {
        if (!weddingId) return
        let cancelled = false
        let stopRefresh = () => {}
        const unsub = onAuthStateChanged(auth, user => {
            stopRefresh()
            setW(null)
            setEntries(null)
            if (!user) {
                window.location.assign('/login')
                return
            }

            let active = true
            let inFlight = false
            let controller = null
            let deadline = null
            const isCurrent = () => !cancelled && active && auth.currentUser?.uid === user.uid
            async function refresh() {
                if (!isCurrent() || inFlight || document.visibilityState === 'hidden') return
                inFlight = true
                controller = new AbortController()
                deadline = setTimeout(() => controller?.abort(), 10000)
                try {
                    const idToken = await user.getIdToken()
                    if (!isCurrent()) return
                    const options = { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store', signal: controller.signal }
                    const query = `?weddingId=${encodeURIComponent(weddingId)}`
                    const [wRes, eRes] = await Promise.all([
                        fetch(`/api/owner/wedding${query}`, options),
                        fetch(`/api/entries${query}`, options),
                    ])
                    if ([wRes.status, eRes.status].some(status => status === 401 || status === 403)) {
                        if (isCurrent()) {
                            setW(null)
                            setEntries(null)
                            window.location.assign('/login')
                        }
                        return
                    }
                    if (!wRes.ok || !eRes.ok) throw new Error('portal-refresh-failed')
                    const [wData, eData] = await Promise.all([wRes.json(), eRes.json()])
                    if (!isCurrent()) return
                    setW(wData.wedding)
                    const list = eData.map(x => ({ ...x, imageUrl: x.imageUrl || x.photoUrl || null }))
                    list.sort((a, b) => ((a.orderIndex ?? Infinity) - (b.orderIndex ?? Infinity)) || ((a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)))
                    setEntries(list)
                } catch {
                    // Keep the last successful view during a network failure;
                    // the next tick/foreground event retries with a fresh token.
                } finally {
                    clearTimeout(deadline)
                    controller = null
                    inFlight = false
                }
            }

            // Poll the authenticated APIs so new blessings, photo counts and
            // external edits appear without restoring public Firestore reads.
            const timer = setInterval(refresh, 15000)
            window.addEventListener('focus', refresh)
            window.addEventListener('online', refresh)
            document.addEventListener('visibilitychange', refresh)
            stopRefresh = () => {
                active = false
                clearInterval(timer)
                clearTimeout(deadline)
                controller?.abort()
                window.removeEventListener('focus', refresh)
                window.removeEventListener('online', refresh)
                document.removeEventListener('visibilitychange', refresh)
            }
            void refresh()
        })
        return () => { cancelled = true; stopRefresh(); unsub() }
    }, [weddingId])

    const face = useMemo(() => coverFace(w), [w])
    const token = w?.digitalTokens?.[0] || ''
    const bookLink = token ? `/wedding/${weddingId}/book/${token}` : `/wedding/${weddingId}`
    const guestLink = w?.slug ? `${SITE}/w/${w.slug}` : `${SITE}/wedding/${weddingId}`
    const photos = (entries || []).filter(e => e.imageUrl).length
    const blessings = (entries || []).length
    const filtered = useMemo(() => {
        if (!entries) return []
        const s = q.trim()
        if (!s) return entries
        return entries.filter(e => (e.name || '').includes(s) || (e.text || '').includes(s))
    }, [entries, q])

    // The road from payment to a printed book, in order. What is done is read
    // from the event itself, so the list is right on every device.
    const stage = w?.paymentStage || ''
    const balanceDue = Number(w?.balanceDue) || 0
    const steps = [
        { key: 'share', cta: 'לשליחת הקישור', title: 'שולחים את הקישור לאורחים', note: blessings ? `כבר נכנסו ${blessings} ברכות. אפשר לשלוח שוב גם אחרי האירוע.` : 'בוואטסאפ, בהודעה מוכנה. אפשר כבר עכשיו.', done: blessings > 0, go: () => setTab('share') },
        { key: 'poster', cta: 'להדפסת השלט', title: 'מדפיסים את השלט לאירוע', note: 'שלט "ברכו את" עם ה־QR שלכם, מוכן להדפסה.', done: false, href: `/wedding/${weddingId}/portal?view=poster` },
        { key: 'design', cta: 'לעיצוב הספר', title: 'בוחרים עיצוב וכריכה', note: face ? 'יש כריכה. אפשר לשנות בכל רגע.' : 'בוחרים סגנון ומעלים תמונה לכריכה.', done: !!face, go: () => setTab('book') },
        { key: 'review', cta: 'לעבור על הברכות', title: 'עוברים על הברכות', note: 'אחרי האירוע: מתקנים, מחליפים תמונה, מסדרים.', done: stage === 'paid', go: () => setTab('blessings') },
        stage === 'deposit'
            ? { key: 'pay', cta: 'לתשלום היתרה', title: `משלמים את היתרה${balanceDue ? ` (${balanceDue} ₪)` : ''} ומדפיסים`, note: 'רק כשהספר מוכן ואתם מרוצים ממנו. אחרי התשלום הוא יוצא לדפוס.', done: false, href: `https://weddingtales.co.il/checkout/?add-to-cart=6271&wt_bal=${encodeURIComponent(weddingId)}` }
            : stage === 'paid'
                ? { key: 'pay', title: 'היתרה שולמה', note: 'הספר יוצא לדפוס ומגיע עד הבית.', done: true, go: () => setTab('book') }
                : { key: 'pay', cta: 'לאישור ההדפסה', title: 'מאשרים הדפסה', note: 'כשהספר מוכן, כותבים לנו והוא יוצא לדפוס.', done: false, href: 'https://wa.me/972515350253' },
    ]
    // the sign has no "done" of its own, so it never holds the list up
    const nextStep = steps.findIndex(s => !s.done && s.key !== 'poster')
    const doneCount = steps.filter(s => s.done).length
    // The hero is the event's own stage: paper for a wedding, an evening of lights for the rest
    const dark = !!w && w.eventType !== 'wedding'
    const heroInk = dark ? '#FFFFFF' : INK
    const heroSoft = dark ? '#C9CDEB' : MUT
    const eventLabel = { wedding: 'חתונה', bar_mitzvah: 'בר מצווה', bat_mitzvah: 'בת מצווה', twins_bar_mitzvah: 'בר מצווה', birthday: 'יום הולדת' }[w?.eventType] || ''
    const recent = useMemo(() => (entries || []).slice().sort((x, y) => (y.timestamp?.seconds || 0) - (x.timestamp?.seconds || 0)).slice(0, 8), [entries])

    const waShare = () => {
        const msg = `הוזמנתם להשאיר לנו ברכה בספר של ${titleOf(w)} 💛\n${guestLink}`
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    }
    const copy = (link, key) => {
        navigator.clipboard?.writeText(link).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000) }).catch(() => {})
    }
    const openEdit = e => { setEName(e.name || ''); setEText(e.text || ''); setEImg(null); setEditing(e); setSelected(null) }
    const pickFile = ev => {
        const f = ev.target.files?.[0]
        ev.target.value = ''
        if (!f) return
        const r = new FileReader()
        r.onload = () => setEImg(String(r.result))
        r.readAsDataURL(f)
    }
    const saveEdit = async () => {
        if (!editing || saving) return
        setSaving(true)
        try {
            const body = { weddingId, entryId: editing.id, name: eName, text: eText }
            if (eImg === 'REMOVE') body.removeImage = true
            else if (eImg) body.image = eImg
            const idToken = await auth.currentUser?.getIdToken()
            if (!idToken) throw new Error('sign-in-required')
            const res = await fetch('/api/guest/update-entry', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify(body),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || json?.ok === false) throw new Error('save')
            setEntries(prev => prev && prev.map(x => x.id === editing.id
                ? { ...x, name: eName, text: eText, imageUrl: eImg === 'REMOVE' ? null : (json.imageUrl ?? x.imageUrl) } : x))
            setEditing(null)
        } catch { alert('לא הצלחנו לשמור — נסו שוב') } finally { setSaving(false) }
    }

    // ── הספר — immersive: fixed iframe, dock hidden, back arrow ──
    if (view === 'poster') return <PosterSheet />

    if (tab === 'book') {
        return (
            <div className={heebo.className} dir='rtl' style={{ position: 'fixed', inset: 0, background: '#FBF8F2' }}>
                <iframe src={bookLink} title='הספר' style={{ width: '100%', height: '100%', border: 'none' }} />
                <button onClick={() => setTab('home')} aria-label='חזרה' style={{
                    position: 'fixed', top: 14, left: 16, width: 40, height: 40, borderRadius: 20,
                    background: 'rgba(20,24,58,0.88)', border: '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>{I.back}</button>
            </div>
        )
    }

    return (
        <div className={heebo.className} dir='rtl' style={{
            minHeight: '100dvh', backgroundColor: '#F3F0EA', backgroundImage: 'url(/backgrounds/signature-paper.webp)',
            backgroundSize: 'cover', backgroundPosition: 'center top', backgroundAttachment: 'fixed',
            display: 'flex', justifyContent: 'center',
        }}>
            <style>{`
                @keyframes wtFloat { 0%,100% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(0); } 50% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(-6px); } }
                .wt-press { transition: transform 0.12s; cursor: pointer; }
                .wt-press:active { transform: scale(0.96); }
                input::placeholder { color: #9A9DB0; }
                .wt-rail { scrollbar-width: none; }
                .wt-rail::-webkit-scrollbar { display: none; }
            `}</style>
            <div style={{ width: '100%', maxWidth: 480, padding: '14px 18px 118px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {tab === 'home' && (<>
                    {/* ── Hero: the event's own stage, the book standing on it ── */}
                    <div style={{
                        margin: '-14px -18px 0', padding: '16px 18px 0', position: 'relative', overflow: 'hidden',
                        borderRadius: '0 0 36px 36px', minHeight: 452,
                        backgroundColor: dark ? '#0C1030' : '#F3F0EA',
                        // until the event is read, a neutral wash: no night-to-paper flash for a wedding
                        backgroundImage: w ? `url(/backgrounds/portal-hero-${dark ? 'night' : 'paper'}.webp)` : 'linear-gradient(180deg,#E6EBFF,#F3F0EA)',
                        backgroundSize: 'cover', backgroundPosition: 'center bottom',
                        boxShadow: dark ? '0 24px 40px -28px rgba(12,16,48,0.8)' : '0 24px 40px -30px rgba(90,70,140,0.45)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                        <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <a href={`/wedding/${weddingId}/portal/classic`} aria-label='הגדרות' className='wt-press' style={{
                                width: 40, height: 40, borderRadius: 20, textDecoration: 'none',
                                background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.72)',
                                border: `1px solid ${dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)'}`,
                                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}><Ic d={<><circle cx='12' cy='8' r='3.4' /><path d='M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5' /></>} color={heroInk} size={20} /></a>
                            {eventLabel ? (
                                <span style={{
                                    fontSize: 12.5, fontWeight: 700, color: heroInk, padding: '6px 14px', borderRadius: 999,
                                    background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.72)',
                                    border: `1px solid ${dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)'}`,
                                    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                                }}>{eventLabel}</span>
                            ) : <span />}
                            <span style={{ width: 40 }} />
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 14 }}>
                            <h1 style={{
                                margin: 0, fontSize: 32, fontWeight: 900, lineHeight: 1.1,
                                color: heroInk, letterSpacing: '-0.01em',
                                textShadow: dark ? '0 2px 18px rgba(37,69,224,0.55)' : 'none',
                            }}>ברוכים הבאים</h1>
                            <div style={{ fontSize: 14, fontWeight: 600, color: heroSoft, marginTop: 4 }}>
                                {entries && blessings > 0 ? `${blessings} ברכות כבר מחכות בספר` : 'הספר מוכן לברכות הראשונות'}
                            </div>
                        </div>

                        <div className='wt-press' onClick={() => setTab('book')} style={{ position: 'relative', marginTop: 20, width: 196, height: 196, animation: 'wtFloat 5.2s ease-in-out infinite' }}>
                            <div style={{
                                position: 'absolute', inset: '0 8px 0 0', borderRadius: '10px 4px 4px 10px', overflow: 'hidden',
                                border: '1px solid rgba(20,24,58,0.35)', boxShadow: '0 22px 34px -12px rgba(5,8,30,0.7)',
                                background: face ? `url(${opt(face, 640) || face}) center/cover` : 'linear-gradient(160deg,#252C68,#14183A 62%,#0C1030)',
                            }}>
                                {!face && (
                                    // No cover chosen yet: the book still carries its own name, so the first
                                    // screen is "the book of Noam", not an empty box.
                                    <div style={{ position: 'absolute', inset: 10, borderRadius: 6, border: '1.2px solid rgba(255,255,255,0.28)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 10px', textAlign: 'center' }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#C9CDEB' }}>ספר הברכות של</span>
                                        <span style={{ width: 28, height: 1.5, background: '#7C93FF', borderRadius: 1 }} />
                                        <span style={{ fontSize: titleOf(w).length > 14 ? 18 : 26, fontWeight: 900, lineHeight: 1.15, color: '#fff', wordBreak: 'break-word' }}>{w ? titleOf(w) : ''}</span>
                                    </div>
                                )}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%, rgba(10,14,40,0.28))' }} />
                            </div>
                            <div style={{ position: 'absolute', top: 5, bottom: 5, left: -5, width: 7, background: '#F3F0EA', border: '1px solid rgba(20,24,58,0.25)', borderRadius: '2px 0 0 2px' }} />
                            <div style={{ position: 'absolute', top: 1, bottom: 1, right: 0, width: 9, background: '#2545E0', opacity: 0.95, borderRadius: '0 4px 4px 0' }} />
                        </div>
                        <div style={{ width: 230, height: 22, marginTop: 6, background: 'radial-gradient(ellipse at center, rgba(5,8,30,0.50), rgba(5,8,30,0.16) 55%, transparent 75%)' }} />
                    </div>

                    {/* ── The numbers: overlap the hero's edge ── */}
                    <div style={{ ...card, borderRadius: 24, display: 'flex', alignItems: 'stretch', padding: '14px 6px', margin: '-52px 6px 0', position: 'relative', zIndex: 2, boxShadow: '0 1px 2px rgba(20,24,58,0.06), 0 22px 40px -24px rgba(20,24,58,0.5)' }}>
                        {[
                            { n: entries ? blessings : '…', label: 'ברכות', icon: <Ic d={<path d='M4 6h16v10H9l-4 4V6Z' />} color={GOLD} size={18} /> },
                            { n: entries ? photos : '…', label: 'תמונות', icon: <Ic d={<><rect x='3.5' y='5' width='17' height='14' rx='2.5' /><circle cx='9' cy='10' r='1.6' /><path d='m4 17 5-4.5 4 3 3-2.5 4 3.5' /></>} color={GOLD} size={18} /> },
                            { n: stage === 'paid' ? 'שולם' : stage === 'deposit' ? 'מקדמה' : 'פתוח', label: 'הזמנה', small: true, icon: <Ic d={<path d='M5 12.5l4.5 4.5L19 7.5' />} color={GOLD} size={18} sw={2.2} /> },
                        ].map((s, i) => (
                            <div key={s.label} style={{ flex: 1, textAlign: 'center', borderInlineStart: i ? '1px solid #EFEBE2' : 'none' }}>
                                <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 17, background: '#E6EBFF', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
                                <div style={{ fontSize: s.small ? 17 : 22, lineHeight: '26px', fontWeight: 900, color: INK }}>{s.n}</div>
                                <div style={{ fontSize: 11.5, color: MUT }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── The next step, as the one thing to do now ── */}
                    {nextStep >= 0 ? (() => {
                        const s = steps[nextStep]
                        const Act = s.href ? 'a' : 'button'
                        return (
                            <div style={{
                                position: 'relative', overflow: 'hidden', borderRadius: 26, padding: '18px 18px 16px', color: '#fff',
                                background: 'linear-gradient(165deg,#252C68 0%,#171C47 55%,#0F1236 100%)',
                                boxShadow: '0 20px 36px -22px rgba(15,18,54,0.9)', marginTop: 4,
                            }}>
                                <div aria-hidden='true' style={{ position: 'absolute', top: -46, insetInlineStart: -30, width: 160, height: 160, borderRadius: 80, background: 'radial-gradient(circle, rgba(76,111,255,0.55), transparent 70%)' }} />
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#AEB9FF' }}>הצעד הבא</span>
                                    <span style={{ fontSize: 12, color: '#C9CDEB' }}>{doneCount} מתוך {steps.length}</span>
                                </div>
                                <div style={{ position: 'relative', display: 'flex', gap: 5, margin: '10px 0 14px' }}>
                                    {steps.map((x, i) => (
                                        <span key={x.key} style={{ flex: 1, height: 4, borderRadius: 2, background: x.done ? '#7C93FF' : i === nextStep ? 'rgba(124,147,255,0.55)' : 'rgba(255,255,255,0.16)' }} />
                                    ))}
                                </div>
                                <div style={{ position: 'relative', fontSize: 20, fontWeight: 900, lineHeight: 1.25 }}>{s.title}</div>
                                <div style={{ position: 'relative', fontSize: 13.5, color: '#C9CDEB', lineHeight: 1.45, marginTop: 4 }}>{s.note}</div>
                                <Act
                                    {...(s.href ? { href: s.href, target: '_blank', rel: 'noopener' } : { type: 'button', onClick: s.go })}
                                    className='wt-press'
                                    style={{
                                        position: 'relative', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48,
                                        borderRadius: 16, border: 'none', textDecoration: 'none', fontFamily: 'inherit', fontSize: 16, fontWeight: 900, color: '#fff',
                                        background: 'linear-gradient(180deg,#3358F0 0%,#2545E0 55%,#1B34B8 100%)',
                                        boxShadow: '0 14px 24px -12px rgba(28,52,184,0.9), inset 0 1px 0 rgba(255,255,255,0.28)',
                                    }}
                                >{s.cta || 'לצעד הזה'}<span aria-hidden='true' style={{ fontSize: 18 }}>‹</span></Act>
                            </div>
                        )
                    })() : (
                        <div style={{ ...card, borderRadius: 26, padding: '18px', textAlign: 'center', marginTop: 4 }}>
                            <span style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 22, background: '#1f8f5f', alignItems: 'center', justifyContent: 'center' }}><Ic d={<path d='M5 12.5l4.5 4.5L19 7.5' />} color='#fff' size={24} sw={2.4} /></span>
                            <div style={{ fontSize: 18, fontWeight: 900, color: INK, marginTop: 8 }}>הכול מוכן</div>
                            <div style={{ fontSize: 13.5, color: MUT, marginTop: 2 }}>כל הצעדים הושלמו. הספר בדרך אליכם.</div>
                        </div>
                    )}

                    {/* ── Latest blessings: the real thing, right on the home screen ── */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '10px 4px 0' }}>
                        <span style={{ fontSize: 17, fontWeight: 900, color: INK }}>הברכות האחרונות</span>
                        {blessings > 0 && <button type='button' onClick={() => setTab('blessings')} className='wt-press' style={{ background: 'none', border: 'none', padding: '6px 0', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: GOLD }}>לכל הברכות ‹</button>}
                    </div>
                    {!entries ? (
                        <div style={{ ...card, height: 132, opacity: 0.6 }} />
                    ) : blessings === 0 ? (
                        <div style={{ ...card, borderRadius: 24, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ flex: 'none', padding: 7, background: '#fff', borderRadius: 14, border: '1px solid #CDD3F5' }}>
                                <QRCode value={guestLink} size={78} fgColor={INK} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 15.5, fontWeight: 900, color: INK }}>ממתינים לברכה הראשונה</div>
                                <div style={{ fontSize: 12.5, color: MUT, lineHeight: 1.4, margin: '2px 0 9px' }}>שולחים את הקישור והברכות מגיעות לכאן לבד.</div>
                                <button type='button' onClick={waShare} className='wt-press' style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38, padding: '0 14px', borderRadius: 12, border: 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 900, color: '#fff', background: 'linear-gradient(180deg,#252C68 0%,#171C47 48%,#101433 100%)' }}>{I.wa}שליחה בוואטסאפ</button>
                            </div>
                        </div>
                    ) : (
                        <div className='wt-rail' style={{ display: 'flex', gap: 12, margin: '0 -18px', padding: '2px 18px 14px', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingInline: 18 }}>
                            {recent.map(e => (
                                <div key={e.id} className='wt-press' onClick={() => { setTab('blessings'); setSelected(e) }} style={{
                                    ...card, flex: 'none', width: 262, scrollSnapAlign: 'start', borderRadius: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                }}>
                                    {e.imageUrl && <div style={{ height: 118, background: `url(${opt(e.imageUrl, 384)}) center/cover #E6EBFF` }} />}
                                    <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                                        <span aria-hidden='true' style={{ fontSize: 34, lineHeight: '16px', height: 14, fontWeight: 900, color: '#B9C5FF' }}>״</span>
                                        <div style={{
                                            fontSize: 14, lineHeight: 1.5, color: INK, flex: 1,
                                            display: '-webkit-box', WebkitLineClamp: e.imageUrl ? 2 : 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                        }}>{e.text || 'ברכה בתמונה'}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 26, height: 26, borderRadius: 13, background: '#E6EBFF', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{(e.name || '♥').trim().charAt(0)}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: MUT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || 'אורח'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Everything else, one tap away ── */}
                    <div style={{ fontSize: 17, fontWeight: 900, color: INK, margin: '4px 4px 0' }}>מה עוד אפשר לעשות</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                            { label: 'עיצוב הספר', sub: 'כריכה וסגנון', icon: I.brush, go: () => setTab('book') },
                            { label: 'שיתוף הקישור', sub: 'וואטסאפ ו־QR', icon: I.link, go: () => setTab('share') },
                            { label: 'ניהול הברכות', sub: 'עריכה ותמונות', icon: I.bookT, go: () => setTab('blessings') },
                            { label: 'שלט להדפסה', sub: 'QR לשולחן ולכניסה', icon: <Ic d={<><rect x='3.5' y='3.5' width='7' height='7' rx='1.2' /><rect x='13.5' y='3.5' width='7' height='7' rx='1.2' /><rect x='3.5' y='13.5' width='7' height='7' rx='1.2' /><path d='M14 14h2.5v2.5H14zM18 18h2.5M18 14v1.5' /></>} color={GOLD} />, href: `/wedding/${weddingId}/portal?view=poster` },
                        ].map(t => {
                            const Tile = t.href ? 'a' : 'div'
                            return (
                                <Tile key={t.label} {...(t.href ? { href: t.href, target: '_blank', rel: 'noopener' } : { onClick: t.go, role: 'button', tabIndex: 0 })} className='wt-press' style={{
                                    ...card, borderRadius: 20, padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', minHeight: 72,
                                }}>
                                    <span style={{ flex: 'none', width: 42, height: 42, borderRadius: 14, background: '#E6EBFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 14, fontWeight: 900, color: INK, lineHeight: 1.25 }}>{t.label}</span>
                                        <span style={{ display: 'block', fontSize: 12, color: MUT, lineHeight: 1.3 }}>{t.sub}</span>
                                    </span>
                                </Tile>
                            )
                        })}
                    </div>

                    {/* ── The whole road, compact ── */}
                    <div style={{ ...card, borderRadius: 22, padding: '12px 14px 6px', marginTop: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: INK, marginBottom: 2 }}>הדרך עד הספר המודפס</div>
                        {steps.map((s, i) => {
                            const isNext = i === nextStep
                            const Row = s.href ? 'a' : 'div'
                            return (
                                <Row key={s.key} {...(s.href ? { href: s.href, target: '_blank', rel: 'noopener' } : { onClick: s.go, role: 'button', tabIndex: 0 })} className='wt-press' style={{
                                    display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', minHeight: 44, textDecoration: 'none', cursor: 'pointer',
                                    borderTop: i ? '1px solid #EFEBE2' : 'none',
                                }}>
                                    <span style={{
                                        flex: 'none', width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12.5, fontWeight: 900,
                                        background: s.done ? '#1f8f5f' : isNext ? INK : '#fff',
                                        color: s.done || isNext ? '#fff' : MUT,
                                        border: s.done || isNext ? 'none' : '1px solid #CDD3F5',
                                    }}>{s.done ? '✓' : i + 1}</span>
                                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: isNext ? 900 : 600, color: s.done ? MUT : INK }}>{s.title}</span>
                                    <span aria-hidden='true' style={{ flex: 'none', fontSize: 18, color: '#9A9DB0' }}>‹</span>
                                </Row>
                            )
                        })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11, color: 'rgba(90,93,117,0.85)', flexWrap: 'wrap', marginTop: 4 }}>
                        <a href='/privacy' style={{ color: 'inherit', textDecoration: 'none' }}>מדיניות פרטיות</a>
                        <span>·</span>
                        <a href='/terms' style={{ color: 'inherit', textDecoration: 'none' }}>תנאי שימוש</a>
                        <span>·</span>
                        <a href={`/wedding/${weddingId}/portal/classic`} style={{ color: 'inherit', textDecoration: 'none' }}>הגדרות נוספות</a>
                    </div>
                </>)}

                {tab === 'blessings' && (<>
                    <div style={{
                        margin: '-14px -18px 0', padding: '18px 18px 14px',
                        background: 'rgba(243,240,234,0.88)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                        borderBottom: '1px solid #E4DFD3',
                    }}>
                        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, fontWeight: 700, textAlign: 'right' }}>WEDDING TALES ✦</div>
                        <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 900, color: INK, textAlign: 'right' }}>הברכות שלכם</h1>
                        <div style={{ fontSize: 12, color: MUT, textAlign: 'right' }}>{entries ? `${blessings} רגעים שנאספו` : 'טוען…'}</div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: '#fff',
                            border: '1.5px solid #CDD3F5', borderRadius: 999, padding: '4px 14px',
                        }}>
                            <Ic d={<><circle cx='11' cy='11' r='6.5' /><path d='m16 16 4.5 4.5' /></>} color='#9A9DB0' size={16} />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder='חיפוש לפי שם או טקסט…' style={{
                                flex: 1, border: 'none', outline: 'none', fontSize: 14.5, padding: '8px 0', background: 'transparent',
                                color: INK, fontFamily: 'inherit', textAlign: 'right',
                            }} />
                        </div>
                    </div>
                    {!entries ? (
                        <div style={{ textAlign: 'center', color: MUT, padding: '60px 0' }}>טוענים את הברכות…</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: MUT, padding: '50px 0', fontSize: 14 }}>
                            {q ? 'אין תוצאות לחיפוש' : 'עדיין אין ברכות — ברגע שהאורחים יתחילו לסרוק, הכל יופיע כאן'}
                        </div>
                    ) : filtered.map(e => (
                        <div key={e.id} onClick={() => setSelected(e)} className='wt-press' style={{
                            display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.92)',
                            border: '1px solid #E4DFD3', borderRadius: 18, padding: 12,
                        }}>
                            {e.imageUrl ? (
                                <img src={opt(e.imageUrl, 128)} alt='' style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                                <span style={{ width: 64, height: 64, borderRadius: 12, background: '#E6EBFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Ic d={<path d='M4 6h16v10H9l-4 4V6Z' />} color={GOLD} size={20} />
                                </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {e.name ? <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{e.name}</div> : null}
                                {e.text ? <div style={{
                                    fontSize: 13, color: MUT, lineHeight: 1.45, display: '-webkit-box',
                                    WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                }}>{e.text}</div> : null}
                                {e.timestamp?.seconds ? <div style={{ fontSize: 11, color: '#9A9DB0', marginTop: 2 }}>הועלתה {fmtWhen(e.timestamp)}</div> : null}
                            </div>
                            <button onClick={ev => { ev.stopPropagation(); openEdit(e) }} aria-label='עריכה' style={{
                                width: 34, height: 34, borderRadius: 17, background: '#E6EBFF', border: 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                            }}>{I.pencil}</button>
                        </div>
                    ))}
                </>)}

                {tab === 'share' && (<>
                    <div style={{ textAlign: 'center', paddingTop: 8 }}>
                        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: INK }}>מזמינים את כולם לברך</h1>
                        <p style={{ margin: '6px auto 0', fontSize: 13.5, lineHeight: 1.55, color: MUT, maxWidth: 320 }}>
                            שתפו את הקישור או הציגו את הקוד — וכל ברכה נכנסת ישר לספר של {titleOf(w)}
                        </p>
                        <div style={{ fontSize: 11, color: '#2545E0', marginTop: 4 }}>♥</div>
                    </div>
                    <div style={{ ...card, borderRadius: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 18px' }}>
                        <div style={{
                            borderRadius: 24, padding: 3, background: 'linear-gradient(135deg,#7C93FF,#2545E0 55%,#7C93FF)',
                            boxShadow: '0 7px 18px -6px rgba(28,40,120,0.5)',
                        }}>
                            <div style={{ borderRadius: 21, background: '#fff', padding: 14, position: 'relative' }}>
                                <QRCode value={guestLink} size={198} fgColor='#14183A' />
                                <img src='/brand/mark.png' alt='' style={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                                    width: 44, background: '#fff', borderRadius: 10, padding: '4px 5px',
                                }} />
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: MUT }}>האורחים סורקים ישר מהמסך — או מקבלים קישור</div>
                    </div>
                    <div onClick={waShare} className='wt-press' style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                        background: 'linear-gradient(180deg,#252C68 0%,#171C47 48%,#101433 100%)', borderRadius: 999,
                        padding: '14px 16px', boxShadow: '0 7px 18px -6px rgba(28,40,120,0.55)',
                    }}>
                        {I.wa}
                        <span style={{ fontSize: 16.5, fontWeight: 900, color: '#fff' }}>שיתוף בוואטסאפ</span>
                    </div>
                    <div style={{ ...card, padding: '4px 14px' }}>
                        {[
                            { key: 'guest', label: 'עמוד הברכות לאורחים', link: guestLink },
                            ...(token ? [{ key: 'book', label: 'הספר הדיגיטלי (צפייה ועיצוב)', link: `${SITE}/b/${token}` }] : []),
                        ].map((r, i) => (
                            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: i ? '1px solid #E4DFD3' : 'none' }}>
                                <span style={{ width: 32, height: 32, borderRadius: 16, background: '#E6EBFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {r.key === 'guest'
                                        ? <Ic d={<path d='M12 20s-6.5-4-8.2-7.8C2.4 9.2 4.2 6 7.3 6c2 0 3.4 1 4.7 2.6C13.3 7 14.7 6 16.7 6c3.1 0 4.9 3.2 3.5 6.2C18.5 16 12 20 12 20Z' />} color={GOLD} size={15} />
                                        : <Ic d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} color={GOLD} size={15} />}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{r.label}</div>
                                    <div style={{ fontSize: 11.5, color: copied === r.key ? '#1f8f5f' : MUT, direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {copied === r.key ? '✓ הקישור הועתק' : r.link}
                                    </div>
                                </div>
                                <button onClick={() => copy(r.link, r.key)} aria-label='העתקה' className='wt-press' style={{
                                    width: 36, height: 36, borderRadius: 12, background: '#E6EBFF',
                                    border: '1px solid #E4DFD3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                }}>
                                    <Ic d={<><rect x='9' y='9' width='11' height='11' rx='2' /><path d='M5 15V5a1 1 0 0 1 1-1h9' /></>} color={GOLD} size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </>)}
            </div>

            {/* ── The floating glass dock + gold center plus (the app's) ── */}
            <nav style={{ position: 'fixed', left: 16, right: 16, bottom: 14, maxWidth: 398, margin: '0 auto', zIndex: 40 }}>
                <button onClick={() => window.open(`/wedding/${weddingId}/photo`, '_blank')} aria-label='הוספת ברכה' className='wt-press' style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    width: 58, height: 58, borderRadius: 29, border: '3px solid #fff',
                    background: 'linear-gradient(180deg,#3358F0,#2545E0 55%,#1B34B8)',
                    boxShadow: '0 7px 16px -4px rgba(28,40,120,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', zIndex: 2,
                }}>{I.plus}</button>
                <div style={{
                    display: 'flex', alignItems: 'stretch', borderRadius: 32, padding: '8px 0',
                    background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid #E4DFD3', boxShadow: '0 12px 28px -10px rgba(20,24,58,0.35)',
                }}>
                    {[
                        { key: 'home', label: 'הבית', icon: I.home },
                        { key: 'blessings', label: 'ברכות', icon: I.heart },
                        { key: 'spacer' },
                        { key: 'book', label: 'הספר', icon: I.book },
                        { key: 'share', label: 'שיתוף', icon: I.share },
                    ].map(t => t.key === 'spacer' ? <span key='sp' style={{ width: 64 }} /> : (
                        <button key={t.key} onClick={() => setTab(t.key)} className='wt-press' style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                        }}>
                            <span style={{ transform: tab === t.key ? 'translateY(-2px) scale(1.12)' : 'none', transition: 'transform 0.18s' }}>{t.icon(tab === t.key)}</span>
                            <span style={{ fontSize: 11.5, fontWeight: tab === t.key ? 800 : 600, color: tab === t.key ? GOLD : '#9A9DB0' }}>{t.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            {/* ── Reading modal ── */}
            {selected && (
                <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} className={heebo.className} dir='rtl' style={{
                        width: '100%', maxWidth: 430, maxHeight: '86dvh', overflowY: 'auto', background: '#FBF8F2',
                        borderRadius: '28px 28px 0 0', border: '1px solid #E4DFD3', padding: '10px 22px 28px', position: 'relative',
                    }}>
                        <div style={{ width: 42, height: 5, borderRadius: 3, background: 'rgba(20,24,58,0.12)', margin: '0 auto 12px' }} />
                        <button onClick={() => { openEdit(selected) }} style={{
                            position: 'absolute', top: 14, right: 16, height: 36, borderRadius: 18, padding: '0 12px',
                            display: 'flex', alignItems: 'center', gap: 5, background: '#E6EBFF', border: 'none', cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 700, color: GOLD, fontFamily: 'inherit',
                        }}>{I.pencil} עריכה</button>
                        {selected.imageUrl && <img src={opt(selected.imageUrl, 828)} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 18, marginTop: 6, border: '1px solid #E4DFD3' }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                            <span style={{ flex: 1, height: 1, background: 'rgba(20,24,58,0.12)' }} />
                            <span style={{ color: '#2545E0', fontSize: 12 }}>♥</span>
                            <span style={{ flex: 1, height: 1, background: 'rgba(20,24,58,0.12)' }} />
                        </div>
                        {selected.name ? <div style={{ fontSize: 26, fontWeight: 900, color: INK, textAlign: 'center' }}>{selected.name}</div> : null}
                        {selected.text ? <div style={{ fontSize: 17, lineHeight: 1.75, color: INK, textAlign: 'center', marginTop: 10, whiteSpace: 'pre-wrap' }}>{selected.text}</div> : null}
                        {selected.timestamp?.seconds ? <div style={{ fontSize: 11.5, color: '#9A9DB0', textAlign: 'center', marginTop: 14 }}>הועלתה {fmtWhen(selected.timestamp)}</div> : null}
                    </div>
                </div>
            )}

            {/* ── Edit modal ── */}
            {editing && (
                <div onClick={() => !saving && setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,58,0.55)', zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} className={heebo.className} dir='rtl' style={{
                        width: '100%', maxWidth: 430, maxHeight: '88dvh', overflowY: 'auto', background: '#FBF8F2',
                        borderRadius: '28px 28px 0 0', border: '1px solid #E4DFD3', padding: '10px 22px 24px',
                    }}>
                        <div style={{ width: 42, height: 5, borderRadius: 3, background: 'rgba(20,24,58,0.12)', margin: '0 auto 12px' }} />
                        <div style={{ fontSize: 19, fontWeight: 900, color: INK, textAlign: 'center', marginBottom: 12 }}>עריכת הברכה</div>
                        {eImg && eImg !== 'REMOVE' ? (
                            <img src={eImg} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 16, border: '1px solid #E4DFD3' }} />
                        ) : eImg !== 'REMOVE' && editing.imageUrl ? (
                            <img src={opt(editing.imageUrl, 640)} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 16, border: '1px solid #E4DFD3' }} />
                        ) : (
                            <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 16, background: '#E6EBFF', border: '1px solid #E4DFD3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUT, fontSize: 13 }}>אין תמונה</div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
                            <button onClick={() => fileRef.current?.click()} className='wt-press' style={{ padding: '9px 14px', borderRadius: 999, background: '#E6EBFF', border: '1px solid #E4DFD3', color: GOLD, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {((editing.imageUrl && eImg !== 'REMOVE') || (eImg && eImg !== 'REMOVE')) ? 'החלפת תמונה' : 'הוספת תמונה'}
                            </button>
                            {((editing.imageUrl && eImg !== 'REMOVE') || (eImg && eImg !== 'REMOVE')) && (
                                <button onClick={() => setEImg('REMOVE')} className='wt-press' style={{ padding: '9px 14px', borderRadius: 999, background: '#E6EBFF', border: '1px solid #E4DFD3', color: '#b0553f', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>הסרה</button>
                            )}
                        </div>
                        <input ref={fileRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={pickFile} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, textAlign: 'right', margin: '14px 0 5px' }}>שם</div>
                        <input value={eName} onChange={e => setEName(e.target.value)} maxLength={120} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1.5px solid #CDD3F5', borderRadius: 14, padding: '11px 14px', fontSize: 15, color: INK, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, textAlign: 'right', margin: '14px 0 5px' }}>הברכה</div>
                        <textarea value={eText} onChange={e => setEText(e.target.value)} maxLength={2600} rows={5} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1.5px solid #CDD3F5', borderRadius: 14, padding: '11px 14px', fontSize: 15, color: INK, fontFamily: 'inherit', outline: 'none', textAlign: 'right', resize: 'vertical' }} />
                        <div onClick={saveEdit} className='wt-press' style={{
                            marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            background: 'linear-gradient(180deg,#252C68 0%,#171C47 48%,#101433 100%)', borderRadius: 999, padding: '13px 16px',
                            opacity: saving ? 0.7 : 1,
                        }}>
                            <span style={{ fontSize: 15.5, fontWeight: 900, color: '#fff' }}>{saving ? 'שומר…' : 'שמירת השינויים'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
