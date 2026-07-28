'use client'
// Customer portal — a 1:1 WEB replica of the APP's home screen (owner
// request: "the portal should look exactly like the app"). Same artwork,
// same 3D floating book with the real cover, same stats strip with the
// studio icons, same three tiles and gold CTA. Mobile-first, RTL.
//
// The classic portal (design picker, event details editing, QR) still
// exists at ./classic — linked from the footer as "הגדרות נוספות".
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'

const SITE = 'https://app.weddingtales.co.il'

function titleOf(w) {
    if (!w) return ''
    if (w.customTitle) return w.customTitle
    const a = (w.brideNameHe || w.brideName || '').trim()
    const b = (w.groomNameHe || w.groomName || '').trim()
    if (a || b) return [a, b].filter(Boolean).join(' & ')
    return (w.celebrantNameHe || w.celebrantName || '').trim() || 'הספר שלכם'
}

function coverFace(w, id) {
    const cd = { ...(w?.book?.designSettings || {}), ...(w?.coverDesign || {}) }
    const token = w?.digitalTokens?.[0] || ''
    const raw = [cd.coverImage, cd.coverTexture, cd.texture].find(v => typeof v === 'string' && v.trim())
    if (!raw) return null
    const abs = raw.startsWith('/') ? `${SITE}${raw}` : raw
    if (!/^https?:\/\//i.test(abs)) return null
    return abs.includes('/api/book-photo') && !abs.includes('?') ? `${abs}?token=${token}` : abs
}

export default function PortalHome() {
    const { weddingId } = useParams()
    const router = useRouter()
    const [w, setW] = useState(null)
    const [counts, setCounts] = useState({ blessings: 0, photos: 0 })
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        if (!weddingId) return
        let live = true
        ;(async () => {
            try {
                const snap = await getDoc(doc(db, 'weddings', weddingId))
                if (!live) return
                if (snap.exists()) setW(snap.data())
                const es = await getDocs(collection(db, 'weddings', weddingId, 'entries'))
                if (!live) return
                let blessings = 0, photos = 0
                es.forEach(d => { blessings++; const x = d.data(); if (x.imageUrl || x.photoUrl) photos++ })
                setCounts({ blessings, photos })
            } catch { /* keep skeleton */ }
            if (live) setLoaded(true)
        })()
        return () => { live = false }
    }, [weddingId])

    const face = useMemo(() => coverFace(w, weddingId), [w, weddingId])
    const token = w?.digitalTokens?.[0] || ''
    const bookLink = token ? `/wedding/${weddingId}/book/${token}` : `/wedding/${weddingId}`
    const guestLink = w?.slug ? `${SITE}/w/${w.slug}` : `${SITE}/wedding/${weddingId}`

    const waShare = () => {
        const msg = `הוזמנתם להשאיר לנו ברכה בספר של ${titleOf(w)} 💛\n${guestLink}`
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div dir='rtl' style={{
            minHeight: '100dvh', fontFamily: "'Heebo', system-ui, sans-serif",
            backgroundImage: 'url(/app-home/HomePageBG.jpg)', backgroundSize: 'cover',
            backgroundPosition: 'center', backgroundAttachment: 'fixed',
            display: 'flex', justifyContent: 'center',
        }}>
            <style>{`
                @keyframes wtFloat { 0%,100% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(0); } 50% { transform: perspective(1000px) rotateY(-7deg) rotateX(2deg) translateY(-6px); } }
                .wt-tile:active, .wt-cta:active { transform: scale(0.97); }
            `}</style>
            <div style={{ width: '100%', maxWidth: 430, padding: '14px 18px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Top: logo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 6 }}>
                    <img src='/logo-wt.png' alt='WT' style={{ width: 58, height: 32, objectFit: 'contain' }} />
                </div>

                {/* Welcome */}
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ margin: 0, fontSize: 21, fontWeight: 900, color: '#3b2a14' }}>ברוכים הבאים לספר שלכם</h1>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#8a6f45' }}>מכאן תוכלו לצפות, לשתף ולעצב</p>
                    <div style={{ fontSize: 10, color: '#c9a44e', marginTop: 2 }}>♥</div>
                </div>

                {/* Hero — the 3D floating book */}
                <a href={bookLink} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none',
                    background: 'rgba(255,252,244,0.72)', border: '1px solid rgba(201,164,78,0.28)',
                    borderRadius: 28, padding: '18px 0 12px', boxShadow: '0 10px 30px -12px rgba(60,44,20,0.3)',
                }}>
                    <div style={{ position: 'relative', width: 180, height: 180, animation: 'wtFloat 5.2s ease-in-out infinite' }}>
                        <div style={{
                            position: 'absolute', inset: '0 7px 0 0', borderRadius: '10px 4px 4px 10px',
                            overflow: 'hidden', border: '1px solid rgba(120,90,40,0.35)',
                            boxShadow: '0 12px 26px -8px rgba(46,32,16,0.4)',
                            background: face ? `url(${face}) center/cover` : 'linear-gradient(160deg,#fbf3e0,#f3e4c4 55%,#e9d3a6)',
                        }}>
                            {!face && <div style={{ position: 'absolute', inset: 9, borderRadius: 6, border: '1.2px solid rgba(168,132,58,0.55)' }} />}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 45%, rgba(60,40,15,0.16))' }} />
                        </div>
                        <div style={{ position: 'absolute', top: 5, bottom: 5, left: -5, width: 7, background: '#fbf5e7', border: '1px solid rgba(120,90,40,0.3)', borderRadius: '2px 0 0 2px' }} />
                        <div style={{ position: 'absolute', top: 1, bottom: 1, right: 0, width: 8, background: '#caa25c', opacity: 0.9, borderRadius: '0 4px 4px 0' }} />
                    </div>
                    <div style={{ width: 190, height: 26, marginTop: 8, background: 'radial-gradient(ellipse at center, rgba(46,32,16,0.32), rgba(46,32,16,0.14) 55%, transparent 75%)' }} />
                </a>

                {/* Stats strip — the studio icons */}
                <div style={{
                    display: 'flex', alignItems: 'center', background: 'rgba(255,252,244,0.8)',
                    border: '1px solid rgba(201,164,78,0.28)', borderRadius: 22, padding: '11px 8px',
                    boxShadow: '0 5px 16px -8px rgba(60,44,20,0.25)',
                }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <img src='/app-home/blessings_icon.png' width='28' height='28' alt='' />
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#3b2a14' }}>{loaded ? counts.blessings : '…'}</div>
                        <div style={{ fontSize: 11.5, color: '#8a6f45' }}>ברכות</div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(120,90,40,0.22)', margin: '4px 0' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <img src='/app-home/img_icon.png' width='28' height='28' alt='' />
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#3b2a14' }}>{loaded ? counts.photos : '…'}</div>
                        <div style={{ fontSize: 11.5, color: '#8a6f45' }}>תמונות</div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(120,90,40,0.22)', margin: '4px 0' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <img src='/app-home/check_icon.png' width='28' height='28' alt='' />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#3b2a14', marginTop: 7 }}>מוכן לעריכה</div>
                    </div>
                </div>

                {/* What now */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#c9a44e' }}>♥</span>
                    <span style={{ fontSize: 15.5, fontWeight: 700, color: '#5c4a2f' }}>מה תרצו לעשות עכשיו?</span>
                    <span style={{ fontSize: 10, color: '#c9a44e' }}>♥</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {[
                        { label: 'צפייה בברכות', emoji: '📖', bg: '#efe9fb', href: `/wedding/${weddingId}/admin` },
                        { label: 'עיצוב הספר', emoji: '🖌️', bg: '#f7edd7', href: bookLink },
                        { label: 'שיתוף הקישור', emoji: '🔗', bg: '#fbe9ec', onClick: waShare },
                    ].map(t => (
                        <a
                            key={t.label}
                            href={t.href || '#'}
                            onClick={t.onClick ? e => { e.preventDefault(); t.onClick() } : undefined}
                            className='wt-tile'
                            style={{
                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                                background: 'rgba(255,252,244,0.8)', border: '1px solid rgba(201,164,78,0.26)',
                                borderRadius: 20, padding: '13px 4px', textDecoration: 'none',
                                boxShadow: '0 4px 12px -6px rgba(60,44,20,0.2)', transition: 'transform 0.12s',
                            }}
                        >
                            <span style={{
                                width: 46, height: 46, borderRadius: 23, background: t.bg,
                                border: '1px solid rgba(201,164,78,0.25)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 20,
                            }}>{t.emoji}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5c4a2f', textAlign: 'center' }}>{t.label}</span>
                        </a>
                    ))}
                </div>

                {/* Gold CTA */}
                <a href={bookLink} className='wt-cta' style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'linear-gradient(180deg,#eed9a4,#c9a44e 55%,#a8843a)',
                    borderRadius: 999, padding: '13px 16px', textDecoration: 'none',
                    boxShadow: '0 7px 18px -6px rgba(138,99,32,0.55)', transition: 'transform 0.12s', marginTop: 2,
                }}>
                    <span style={{
                        width: 22, height: 22, borderRadius: 11, background: 'rgba(255,253,246,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                    }}>💛</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#3b2a14' }}>כניסה לספר</span>
                </a>

                {/* Legal + more tools */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 11, color: 'rgba(110,88,55,0.75)', flexWrap: 'wrap' }}>
                    <a href='/privacy' style={{ color: 'inherit', textDecoration: 'none' }}>מדיניות פרטיות</a>
                    <span>·</span>
                    <a href='/terms' style={{ color: 'inherit', textDecoration: 'none' }}>תנאי שימוש</a>
                    <span>·</span>
                    <a href={`/wedding/${weddingId}/portal/classic`} style={{ color: 'inherit', textDecoration: 'none' }}>הגדרות נוספות</a>
                </div>
            </div>
        </div>
    )
}
