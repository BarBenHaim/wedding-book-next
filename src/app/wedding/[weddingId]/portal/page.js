'use client'
// Customer portal — a FULL 1:1 web replica of the mobile app (owner
// request: "total synergy — the portal must be exactly the app").
// Four tabs behind the app's floating glass dock with the gold center
// plus: הבית (home), ברכות (management-lite), הספר (immersive book,
// dock hidden, back arrow), שיתוף (QR + WhatsApp + links). Same
// artwork, same icons, same glass, same gold.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import QRCode from 'react-qr-code'
import { Heebo } from 'next/font/google'

const heebo = Heebo({ subsets: ['latin'], weight: ['400', '600', '700', '900'] })

const SITE = 'https://app.weddingtales.co.il'
const GOLD = '#b8893d'
const INK = '#3b2a14'
const MUT = '#8a6f45'

// ── tiny inline icon set (stroke style ≈ Ionicons outline) ──────────
function Ic({ d, size = 22, color = GOLD, sw = 1.7, fill = 'none' }) {
    return (
        <svg width={size} height={size} viewBox='0 0 24 24' fill={fill} stroke={color} strokeWidth={sw} strokeLinecap='round' strokeLinejoin='round'>
            {d}
        </svg>
    )
}
const I = {
    home: on => <Ic color={on ? GOLD : 'rgba(122,106,82,0.62)'} d={<><path d='M3 10.5 12 3l9 7.5' /><path d='M5 9.5V21h14V9.5' /></>} />,
    heart: on => <Ic color={on ? GOLD : 'rgba(122,106,82,0.62)'} fill={on ? GOLD : 'none'} d={<path d='M12 21s-7.5-4.7-9.5-9C1 8.5 3 5 6.5 5c2.2 0 3.8 1.2 4.5 2.6(0,0) M12 21s7.5-4.7 9.5-9C23 8.5 21 5 17.5 5 15.3 5 13.7 6.2 13 7.6' />} />,
    book: on => <Ic color={on ? GOLD : 'rgba(122,106,82,0.62)'} d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} />,
    share: on => <Ic color={on ? GOLD : 'rgba(122,106,82,0.62)'} d={<><circle cx='6' cy='12' r='2.5' /><circle cx='17' cy='6' r='2.5' /><circle cx='17' cy='18' r='2.5' /><path d='m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6' /></>} />,
    brush: <Ic d={<><path d='M14.5 3.5 20.5 9.5 9 21H3v-6L14.5 3.5Z' /><path d='m12.5 5.5 6 6' /></>} color='#b8893d' />,
    link: <Ic d={<><path d='M9.5 14.5 14.5 9.5' /><path d='M11 6.5 12.8 4.7a4 4 0 0 1 5.7 5.7L16.6 12.2' /><path d='M13 17.5 11.2 19.3a4 4 0 0 1-5.7-5.7L7.4 11.8' /></>} color='#c98a94' />,
    bookT: <Ic d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} color='#7a6aa8' />,
    back: <Ic d={<path d='m14 6-6 6 6 6' />} color='#f3e9d2' size={22} sw={2} />,
    plus: <Ic d={<path d='M12 5v14M5 12h14' />} color='#241a0d' size={28} sw={2.2} />,
    pencil: <Ic d={<><path d='M14.5 3.5 20.5 9.5 9 21H3v-6L14.5 3.5Z' /></>} color={GOLD} size={16} />,
    wa: <Ic d={<><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z' /><path d='M8.8 9.2c.3 2.7 3.3 5.7 6 6l1.4-1.4-2-1.2-1 .7c-.8-.4-1.7-1.3-2.1-2.1l.7-1-1.2-2-1.8 1Z' /></>} color='#241a0d' size={19} />,
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
// Same-origin Next image optimizer — 4MB guest uploads become ~30KB thumbs.
const SIZES = [64, 96, 128, 256, 384, 640, 750, 828, 1080]
function opt(url, w = 640) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url || null
    const width = SIZES.find(s => s >= w) ?? 1080
    return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=72`
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
    background: 'rgba(255,252,244,0.8)', border: '1px solid rgba(201,164,78,0.28)',
    borderRadius: 22, boxShadow: '0 5px 16px -8px rgba(60,44,20,0.25)',
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

    useEffect(() => {
        if (!weddingId) return
        getDoc(doc(db, 'weddings', weddingId)).then(s => s.exists() && setW(s.data())).catch(() => {})
        const unsub = onSnapshot(collection(db, 'weddings', weddingId, 'entries'), snap => {
            const list = []
            snap.forEach(d => { const x = d.data(); list.push({ id: d.id, ...x, imageUrl: x.imageUrl || x.photoUrl || null }) })
            list.sort((a, b) => ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)) || ((a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)))
            setEntries(list)
        }, () => {})
        return unsub
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
            const res = await fetch('/api/guest/update-entry', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok || json?.ok === false) throw new Error('save')
            setEntries(prev => prev && prev.map(x => x.id === editing.id
                ? { ...x, name: eName, text: eText, imageUrl: eImg === 'REMOVE' ? null : (json.imageUrl ?? x.imageUrl) } : x))
            setEditing(null)
        } catch { alert('לא הצלחנו לשמור — נסו שוב') } finally { setSaving(false) }
    }

    // ── הספר — immersive: fixed iframe, dock hidden, back arrow ──
    if (tab === 'book') {
        return (
            <div className={heebo.className} dir='rtl' style={{ position: 'fixed', inset: 0, background: '#fdf8ee' }}>
                <iframe src={bookLink} title='הספר' style={{ width: '100%', height: '100%', border: 'none' }} />
                <button onClick={() => setTab('home')} aria-label='חזרה' style={{
                    position: 'fixed', top: 14, left: 16, width: 40, height: 40, borderRadius: 20,
                    background: 'rgba(42,31,23,0.85)', border: '1px solid rgba(201,164,78,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>{I.back}</button>
            </div>
        )
    }

    return (
        <div className={heebo.className} dir='rtl' style={{
            minHeight: '100dvh', backgroundImage: 'url(/app-home/HomePageBG.jpg)',
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed',
            display: 'flex', justifyContent: 'center',
        }}>
            <style>{`
                @keyframes wtFloat { 0%,100% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(0); } 50% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(-6px); } }
                .wt-press { transition: transform 0.12s; cursor: pointer; }
                .wt-press:active { transform: scale(0.96); }
                input::placeholder { color: #b3a28a; }
            `}</style>
            <div style={{ width: '100%', maxWidth: 430, padding: '14px 18px 118px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {tab === 'home' && (<>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
                        <a href={`/wedding/${weddingId}/portal/classic`} aria-label='הגדרות' className='wt-press' style={{
                            width: 40, height: 40, borderRadius: 20, background: 'rgba(255,253,246,0.85)',
                            border: '1px solid rgba(201,164,78,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                        }}><Ic d={<><circle cx='12' cy='8' r='3.4' /><path d='M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5' /></>} color='#8a6f45' size={20} /></a>
                        <img src='/logo-wt.png' alt='WT' style={{ width: 58, height: 32, objectFit: 'contain' }} />
                        <span style={{ width: 40 }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: INK }}>ברוכים הבאים לספר שלכם</h1>
                        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: MUT }}>מכאן תוכלו לצפות, לשתף ולעצב</p>
                        <div style={{ fontSize: 10, color: '#c9a44e', marginTop: 2 }}>♥</div>
                    </div>
                    <div className='wt-press' onClick={() => setTab('book')} style={{ ...card, borderRadius: 28, background: 'rgba(255,252,244,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 12px' }}>
                        <div style={{ position: 'relative', width: 176, height: 176, animation: 'wtFloat 5.2s ease-in-out infinite' }}>
                            <div style={{
                                position: 'absolute', inset: '0 7px 0 0', borderRadius: '10px 4px 4px 10px', overflow: 'hidden',
                                border: '1px solid rgba(120,90,40,0.35)', boxShadow: '0 12px 26px -8px rgba(46,32,16,0.4)',
                                background: face ? `url(${opt(face, 640) || face}) center/cover` : 'linear-gradient(160deg,#fbf3e0,#f3e4c4 55%,#e9d3a6)',
                            }}>
                                {!face && <div style={{ position: 'absolute', inset: 9, borderRadius: 6, border: '1.2px solid rgba(168,132,58,0.55)' }} />}
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%, rgba(60,40,15,0.16))' }} />
                            </div>
                            <div style={{ position: 'absolute', top: 5, bottom: 5, left: -5, width: 7, background: '#fbf5e7', border: '1px solid rgba(120,90,40,0.3)', borderRadius: '2px 0 0 2px' }} />
                            <div style={{ position: 'absolute', top: 1, bottom: 1, right: 0, width: 8, background: '#caa25c', opacity: 0.9, borderRadius: '0 4px 4px 0' }} />
                        </div>
                        <div style={{ width: 186, height: 26, marginTop: 8, background: 'radial-gradient(ellipse at center, rgba(46,32,16,0.32), rgba(46,32,16,0.14) 55%, transparent 75%)' }} />
                    </div>
                    <div style={{ ...card, display: 'flex', alignItems: 'center', padding: '11px 8px' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src='/app-home/blessings_icon.png' width='28' height='28' alt='' />
                            <div style={{ fontSize: 18, fontWeight: 900, color: INK }}>{entries ? blessings : '…'}</div>
                            <div style={{ fontSize: 11.5, color: MUT }}>ברכות</div>
                        </div>
                        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(120,90,40,0.22)', margin: '4px 0' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src='/app-home/img_icon.png' width='28' height='28' alt='' />
                            <div style={{ fontSize: 18, fontWeight: 900, color: INK }}>{entries ? photos : '…'}</div>
                            <div style={{ fontSize: 11.5, color: MUT }}>תמונות</div>
                        </div>
                        <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(120,90,40,0.22)', margin: '4px 0' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src='/app-home/check_icon.png' width='28' height='28' alt='' />
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginTop: 7 }}>מוכן לעריכה</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#c9a44e' }}>♥</span>
                        <span style={{ fontSize: 15.5, fontWeight: 700, color: '#5c4a2f' }}>מה תרצו לעשות עכשיו?</span>
                        <span style={{ fontSize: 10, color: '#c9a44e' }}>♥</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {[
                            { label: 'צפייה בברכות', icon: I.bookT, bg: '#efe9fb', go: () => setTab('blessings') },
                            { label: 'עיצוב הספר', icon: I.brush, bg: '#f7edd7', go: () => setTab('book') },
                            { label: 'שיתוף הקישור', icon: I.link, bg: '#fbe9ec', go: () => setTab('share') },
                        ].map(t => (
                            <div key={t.label} onClick={t.go} className='wt-press' style={{
                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                ...card, borderRadius: 20, padding: '13px 4px',
                            }}>
                                <span style={{
                                    width: 46, height: 46, borderRadius: 23, background: t.bg,
                                    border: '1px solid rgba(201,164,78,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>{t.icon}</span>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5c4a2f' }}>{t.label}</span>
                            </div>
                        ))}
                    </div>
                    <div onClick={() => setTab('book')} className='wt-press' style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)',
                        borderRadius: 999, padding: '13px 16px', boxShadow: '0 7px 18px -6px rgba(138,99,32,0.55)', marginTop: 2,
                    }}>
                        <span style={{ width: 22, height: 22, borderRadius: 11, background: 'rgba(255,253,246,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Ic d={<path d='M12 20s-6.5-4-8.2-7.8C2.4 9.2 4.2 6 7.3 6c2 0 3.4 1 4.7 2.6C13.3 7 14.7 6 16.7 6c3.1 0 4.9 3.2 3.5 6.2C18.5 16 12 20 12 20Z' />} color='#6d5220' size={13} fill='#6d5220' />
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 900, color: INK }}>כניסה לספר</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11, color: 'rgba(110,88,55,0.75)', flexWrap: 'wrap' }}>
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
                        background: 'rgba(255,253,246,0.78)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                        borderBottom: '1px solid rgba(201,164,78,0.3)',
                    }}>
                        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, fontWeight: 700, textAlign: 'right' }}>WEDDING TALES ✦</div>
                        <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 900, color: INK, textAlign: 'right' }}>הברכות שלכם</h1>
                        <div style={{ fontSize: 12, color: MUT, textAlign: 'right' }}>{entries ? `${blessings} רגעים שנאספו` : 'טוען…'}</div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, background: '#fff',
                            border: '1.5px solid #ead9b3', borderRadius: 999, padding: '4px 14px',
                        }}>
                            <Ic d={<><circle cx='11' cy='11' r='6.5' /><path d='m16 16 4.5 4.5' /></>} color='#b3a28a' size={16} />
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
                            border: '1px solid rgba(201,164,78,0.25)', borderRadius: 18, padding: 12,
                        }}>
                            {e.imageUrl ? (
                                <img src={opt(e.imageUrl, 128)} alt='' style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                                <span style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(201,164,78,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Ic d={<path d='M4 6h16v10H9l-4 4V6Z' />} color={GOLD} size={20} />
                                </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {e.name ? <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{e.name}</div> : null}
                                {e.text ? <div style={{
                                    fontSize: 13, color: '#6b5a3e', lineHeight: 1.45, display: '-webkit-box',
                                    WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                }}>{e.text}</div> : null}
                                {e.timestamp?.seconds ? <div style={{ fontSize: 11, color: '#b3a28a', marginTop: 2 }}>הועלתה {fmtWhen(e.timestamp)}</div> : null}
                            </div>
                            <button onClick={ev => { ev.stopPropagation(); openEdit(e) }} aria-label='עריכה' style={{
                                width: 34, height: 34, borderRadius: 17, background: 'rgba(201,164,78,0.12)', border: 'none',
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
                        <div style={{ fontSize: 11, color: '#c9a44e', marginTop: 4 }}>♥</div>
                    </div>
                    <div style={{ ...card, borderRadius: 26, background: 'rgba(255,252,244,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 18px' }}>
                        <div style={{
                            borderRadius: 24, padding: 3, background: 'linear-gradient(135deg,#ecd08a,#b8893d 55%,#e2c377)',
                            boxShadow: '0 7px 18px -6px rgba(138,99,32,0.5)',
                        }}>
                            <div style={{ borderRadius: 21, background: '#fff', padding: 14, position: 'relative' }}>
                                <QRCode value={guestLink} size={198} fgColor='#241a0d' />
                                <img src='/logo-wt.png' alt='' style={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                                    width: 44, background: '#fff', borderRadius: 10, padding: '4px 5px',
                                }} />
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: MUT }}>האורחים סורקים ישר מהמסך — או מקבלים קישור</div>
                    </div>
                    <div onClick={waShare} className='wt-press' style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                        background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)', borderRadius: 999,
                        padding: '14px 16px', boxShadow: '0 7px 18px -6px rgba(138,99,32,0.55)',
                    }}>
                        {I.wa}
                        <span style={{ fontSize: 16.5, fontWeight: 900, color: '#241a0d' }}>שיתוף בוואטסאפ</span>
                    </div>
                    <div style={{ ...card, padding: '4px 14px' }}>
                        {[
                            { key: 'guest', label: 'עמוד הברכות לאורחים', link: guestLink },
                            ...(token ? [{ key: 'book', label: 'הספר הדיגיטלי (צפייה ועיצוב)', link: `${SITE}/b/${token}` }] : []),
                        ].map((r, i) => (
                            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: i ? '1px solid rgba(201,164,78,0.18)' : 'none' }}>
                                <span style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(201,164,78,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {r.key === 'guest'
                                        ? <Ic d={<path d='M12 20s-6.5-4-8.2-7.8C2.4 9.2 4.2 6 7.3 6c2 0 3.4 1 4.7 2.6C13.3 7 14.7 6 16.7 6c3.1 0 4.9 3.2 3.5 6.2C18.5 16 12 20 12 20Z' />} color={GOLD} size={15} />
                                        : <Ic d={<><path d='M4 4h7v16H5.5A1.5 1.5 0 0 1 4 18.5V4Z' /><path d='M20 4h-7v16h5.5a1.5 1.5 0 0 0 1.5-1.5V4Z' /></>} color={GOLD} size={15} />}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{r.label}</div>
                                    <div style={{ fontSize: 11.5, color: copied === r.key ? '#5f8f52' : MUT, direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {copied === r.key ? '✓ הקישור הועתק' : r.link}
                                    </div>
                                </div>
                                <button onClick={() => copy(r.link, r.key)} aria-label='העתקה' className='wt-press' style={{
                                    width: 36, height: 36, borderRadius: 12, background: 'rgba(201,164,78,0.1)',
                                    border: '1px solid rgba(201,164,78,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
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
                    width: 58, height: 58, borderRadius: 29, border: '3px solid #fffdf6',
                    background: 'linear-gradient(180deg,#f2dda6,#c9a44e 55%,#a8843a)',
                    boxShadow: '0 7px 16px -4px rgba(138,99,32,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', zIndex: 2,
                }}>{I.plus}</button>
                <div style={{
                    display: 'flex', alignItems: 'stretch', borderRadius: 32, padding: '8px 0',
                    background: 'rgba(253,249,239,0.62)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid rgba(201,164,78,0.45)', boxShadow: '0 10px 26px -8px rgba(60,44,20,0.4)',
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
                            <span style={{ fontSize: 11.5, fontWeight: tab === t.key ? 800 : 600, color: tab === t.key ? GOLD : 'rgba(122,106,82,0.62)' }}>{t.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            {/* ── Reading modal ── */}
            {selected && (
                <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} className={heebo.className} dir='rtl' style={{
                        width: '100%', maxWidth: 430, maxHeight: '86dvh', overflowY: 'auto', background: '#fdf8ee',
                        borderRadius: '28px 28px 0 0', border: '1px solid rgba(201,164,78,0.35)', padding: '10px 22px 28px', position: 'relative',
                    }}>
                        <div style={{ width: 42, height: 5, borderRadius: 3, background: 'rgba(201,164,78,0.4)', margin: '0 auto 12px' }} />
                        <button onClick={() => { openEdit(selected) }} style={{
                            position: 'absolute', top: 14, right: 16, height: 36, borderRadius: 18, padding: '0 12px',
                            display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(201,164,78,0.12)', border: 'none', cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 700, color: GOLD, fontFamily: 'inherit',
                        }}>{I.pencil} עריכה</button>
                        {selected.imageUrl && <img src={opt(selected.imageUrl, 828)} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 18, marginTop: 6, border: '1px solid rgba(201,164,78,0.35)' }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                            <span style={{ flex: 1, height: 1, background: 'rgba(201,164,78,0.35)' }} />
                            <span style={{ color: '#c9a44e', fontSize: 12 }}>♥</span>
                            <span style={{ flex: 1, height: 1, background: 'rgba(201,164,78,0.35)' }} />
                        </div>
                        {selected.name ? <div style={{ fontSize: 26, fontWeight: 900, color: INK, textAlign: 'center' }}>{selected.name}</div> : null}
                        {selected.text ? <div style={{ fontSize: 17, lineHeight: 1.75, color: '#5c4a2f', textAlign: 'center', marginTop: 10, whiteSpace: 'pre-wrap' }}>{selected.text}</div> : null}
                        {selected.timestamp?.seconds ? <div style={{ fontSize: 11.5, color: '#b3a28a', textAlign: 'center', marginTop: 14 }}>הועלתה {fmtWhen(selected.timestamp)}</div> : null}
                    </div>
                </div>
            )}

            {/* ── Edit modal ── */}
            {editing && (
                <div onClick={() => !saving && setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.55)', zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div onClick={e => e.stopPropagation()} className={heebo.className} dir='rtl' style={{
                        width: '100%', maxWidth: 430, maxHeight: '88dvh', overflowY: 'auto', background: '#fdf8ee',
                        borderRadius: '28px 28px 0 0', border: '1px solid rgba(201,164,78,0.35)', padding: '10px 22px 24px',
                    }}>
                        <div style={{ width: 42, height: 5, borderRadius: 3, background: 'rgba(201,164,78,0.4)', margin: '0 auto 12px' }} />
                        <div style={{ fontSize: 19, fontWeight: 900, color: INK, textAlign: 'center', marginBottom: 12 }}>עריכת הברכה</div>
                        {eImg && eImg !== 'REMOVE' ? (
                            <img src={eImg} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 16, border: '1px solid rgba(201,164,78,0.35)' }} />
                        ) : eImg !== 'REMOVE' && editing.imageUrl ? (
                            <img src={opt(editing.imageUrl, 640)} alt='' style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 16, border: '1px solid rgba(201,164,78,0.35)' }} />
                        ) : (
                            <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 16, background: 'rgba(201,164,78,0.08)', border: '1px solid rgba(201,164,78,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUT, fontSize: 13 }}>אין תמונה</div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 10 }}>
                            <button onClick={() => fileRef.current?.click()} className='wt-press' style={{ padding: '9px 14px', borderRadius: 999, background: 'rgba(201,164,78,0.1)', border: '1px solid rgba(201,164,78,0.35)', color: GOLD, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {((editing.imageUrl && eImg !== 'REMOVE') || (eImg && eImg !== 'REMOVE')) ? 'החלפת תמונה' : 'הוספת תמונה'}
                            </button>
                            {((editing.imageUrl && eImg !== 'REMOVE') || (eImg && eImg !== 'REMOVE')) && (
                                <button onClick={() => setEImg('REMOVE')} className='wt-press' style={{ padding: '9px 14px', borderRadius: 999, background: 'rgba(201,164,78,0.1)', border: '1px solid rgba(201,164,78,0.35)', color: '#b0553f', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>הסרה</button>
                            )}
                        </div>
                        <input ref={fileRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={pickFile} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5c4a2f', textAlign: 'right', margin: '14px 0 5px' }}>שם</div>
                        <input value={eName} onChange={e => setEName(e.target.value)} maxLength={120} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1.5px solid #ead9b3', borderRadius: 14, padding: '11px 14px', fontSize: 15, color: INK, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5c4a2f', textAlign: 'right', margin: '14px 0 5px' }}>הברכה</div>
                        <textarea value={eText} onChange={e => setEText(e.target.value)} maxLength={2600} rows={5} style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: '1.5px solid #ead9b3', borderRadius: 14, padding: '11px 14px', fontSize: 15, color: INK, fontFamily: 'inherit', outline: 'none', textAlign: 'right', resize: 'vertical' }} />
                        <div onClick={saveEdit} className='wt-press' style={{
                            marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)', borderRadius: 999, padding: '13px 16px',
                            opacity: saving ? 0.7 : 1,
                        }}>
                            <span style={{ fontSize: 15.5, fontWeight: 900, color: '#241a0d' }}>{saving ? 'שומר…' : 'שמירת השינויים'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
