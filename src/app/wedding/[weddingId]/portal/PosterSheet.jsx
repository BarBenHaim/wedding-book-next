'use client'

// The sign for the event: "ברכו את …" with the book's QR, A4, ready to print
// or to save as PDF. It used to be designed by hand for every order; now the
// owner opens it from the personal area (/wedding/[id]/portal?view=poster).
// Text is live HTML (perfect Hebrew, real fonts); nothing is baked into an image,
// with one exception: the artwork of the "art" look, drawn by the image model from
// the owner's photo (portal?view=look). Even there the lower part of the sign, with the
// QR code, the steps and the address, is live: a drawn QR code does not scan.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firebaseClient'
import QRCode from 'react-qr-code'
import { Heebo } from 'next/font/google'
import { lookNames, eventLabel, ART_LOOK, isArtLook } from '@/lib/ownerLook'

const heebo = Heebo({ subsets: ['latin'], weight: ['400', '600', '700', '900'] })
const SITE = 'https://app.weddingtales.co.il'

export const LOOKS = {
    light: { name: 'בהיר', paper: '#FBF8F1', ink: '#14183A', soft: '#5A5D75', line: 'rgba(20,24,58,0.22)', accent: '#2748E8', qrBg: '#FFFFFF', qrFg: '#14183A' },
    night: { name: 'כחול לילה', paper: '#14183A', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.78)', line: 'rgba(255,255,255,0.3)', accent: '#E9C877', qrBg: '#FFFFFF', qrFg: '#14183A' },
    gold: { name: 'זהב', paper: '#FFFDF7', ink: '#3B2A14', soft: '#7A6441', line: 'rgba(168,132,58,0.55)', accent: '#A8843A', qrBg: '#FFFFFF', qrFg: '#3B2A14' },
}

function fmtDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
    const [y, m, d] = s.split('-')
    return `${Number(d)}.${Number(m)}.${y}`
}

function Qr({ value, size, L, bare }) {
    return (
        <div style={{ background: L.qrBg, padding: '3.4cqw', borderRadius: '3cqw', boxShadow: bare ? 'none' : '0 1.4cqw 4cqw -2cqw rgba(20,24,58,0.35)', border: bare ? 'none' : `0.2cqw solid ${L.line}` }}>
            {value ? <QRCode value={value} level='H' fgColor={L.qrFg} bgColor={L.qrBg} style={{ display: 'block', width: `${size}cqw`, height: `${size}cqw` }} /> : <div style={{ width: `${size}cqw`, height: `${size}cqw` }} />}
        </div>
    )
}

// The sheet itself, drawn at whatever width its parent gives it (all sizes are container units), so the same
// component prints at A4 and shows as a thumbnail in the look studio.
export function PosterArt({ w, look = 'light', artUrl = '', guestLink, shortLink, ready = true, className = 'wt-sheet', style }) {
    const art = isArtLook(look) && artUrl ? artUrl : ''
    const L = LOOKS[art ? 'light' : look] || LOOKS.light
    const names = lookNames(w)
    const sub = [eventLabel(w?.eventType), fmtDate(w?.weddingDate)].filter(Boolean).join(' · ')

    return (
        <div className={className} style={{ position: 'relative', background: L.paper, color: L.ink, borderRadius: 6, overflow: 'hidden', boxShadow: '0 24px 60px -30px rgba(20,24,58,0.45)', containerType: 'inline-size', ...style }}>
            {art ? (
                <>
                    {/* the artwork covers the sheet; its lower part is empty paper by design */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={art} alt='' style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0%' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2cqw', textAlign: 'center', padding: '0 10cqw 3.5cqw' }}>
                        <Qr value={ready ? guestLink : ''} size={18} L={L} />
                        <div>
                            <p style={{ margin: 0, fontSize: '4.2cqw', fontWeight: 900, textWrap: 'balance' }}>סורקים, כותבים ברכה ומוסיפים תמונה</p>
                            <p style={{ margin: '0.8cqw 0 0', fontSize: '3.2cqw', fontWeight: 600, color: L.soft }}>שתי דקות מהטלפון. בלי אפליקציה ובלי הרשמה.</p>
                        </div>
                        <p dir='ltr' style={{ margin: 0, fontSize: '2.6cqw', color: L.soft, opacity: 0.85 }}>{shortLink}</p>
                    </div>
                </>
            ) : (
                <>
                    <div style={{ position: 'absolute', inset: '4.2cqw', border: `0.28cqw solid ${L.line}`, borderRadius: '1.2cqw' }} />
                    <div style={{ position: 'absolute', inset: '5.4cqw', border: `0.12cqw solid ${L.line}`, borderRadius: '0.8cqw' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center', padding: '13cqw 10cqw 11cqw' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '3.4cqw', fontWeight: 600, letterSpacing: '0.04em', color: L.soft }}>{names ? 'ספר הברכות של' : 'ספר הברכות שלנו'}</p>
                            <h2 style={{ margin: '1.6cqw 0 0', fontSize: names && names.length > 14 ? '10.5cqw' : '14cqw', lineHeight: 1.02, fontWeight: 900, letterSpacing: '-0.02em', textWrap: 'balance' }}>
                                {names ? <>ברכו את <span style={{ color: L.accent }}>{names}</span></> : 'כתבו לנו ברכה'}
                            </h2>
                            {sub && <p style={{ margin: '2.4cqw 0 0', fontSize: '3.6cqw', fontWeight: 600, color: L.soft }}>{sub}</p>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3cqw' }}>
                            <Qr value={ready ? guestLink : ''} size={34} L={L} bare={look === 'night'} />
                            <div>
                                <p style={{ margin: 0, fontSize: '4.5cqw', fontWeight: 900, textWrap: 'balance' }}>סורקים, כותבים ברכה ומוסיפים תמונה</p>
                                <p style={{ margin: '1cqw 0 0', fontSize: '3.5cqw', fontWeight: 600, color: L.soft }}>שתי דקות מהטלפון. בלי אפליקציה ובלי הרשמה.</p>
                            </div>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '3.1cqw', fontWeight: 600, color: L.soft }}>כל ברכה נכנסת לספר מודפס שיישאר אצלנו</p>
                            <p dir='ltr' style={{ margin: '1.2cqw 0 0', fontSize: '2.6cqw', color: L.soft, opacity: 0.85 }}>{shortLink}</p>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default function PosterSheet() {
    const { weddingId } = useParams()
    const [w, setW] = useState(undefined)
    const [look, setLook] = useState('light')
    const [pickedByOwner, setPickedByOwner] = useState(false)

    useEffect(() => {
        if (!weddingId) return
        getDoc(doc(db, 'weddings', weddingId)).then(s => setW(s.exists() ? s.data() : null)).catch(() => setW(null))
    }, [weddingId])

    const artUrl = typeof w?.posterArt?.url === 'string' ? w.posterArt.url : ''
    // the sign the owner made in the look studio opens first; without one the three plain looks are all there is
    useEffect(() => {
        if (pickedByOwner) return
        if (artUrl && isArtLook(w?.posterLook)) setLook(ART_LOOK)
    }, [w, artUrl, pickedByOwner])

    const guestLink = w?.slug ? `${SITE}/w/${w.slug}?go=photo` : `${SITE}/wedding/${weddingId}/photo`
    const shortLink = guestLink.replace(/^https?:\/\//, '').replace(/\?go=photo$/, '')
    const choices = [
        ...(artUrl ? [[ART_LOOK, 'העיצוב מהתמונה שלכם']] : []),
        ...Object.entries(LOOKS).map(([k, v]) => [k, v.name]),
    ]

    return (
        <div className={`${heebo.className} wt-root`} dir='rtl' style={{ minHeight: '100vh', background: '#E9E5DC', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 12px 40px', gap: 14 }}>
            <style>{`
                @page { size: A4 portrait; margin: 0; }
                .wt-sheet { width: min(100%, 210mm); aspect-ratio: 210 / 297; }
                @media print {
                    html, body { background: #fff !important; }
                    .wt-noprint { display: none !important; }
                    .wt-root { display: block !important; min-height: 0 !important; padding: 0 !important; background: #fff !important; }
                    .wt-wrap { display: block !important; padding: 0 !important; background: none !important; }
                    .wt-sheet { width: 210mm !important; height: 296mm !important; aspect-ratio: auto !important; box-shadow: none !important; border-radius: 0 !important; break-inside: avoid; break-after: avoid; }
                    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            <div className='wt-noprint' style={{ width: 'min(100%, 210mm)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#14183A' }}>השלט לאירוע</h1>
                    <p style={{ margin: '2px 0 0', fontSize: 13.5, color: '#5A5D75' }}>מדפיסים ב־A4 ומציבים בכניסה או על השולחנות. האורחים סורקים וכותבים.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {choices.map(([k, name]) => (
                        <button key={k} type='button' onClick={() => { setPickedByOwner(true); setLook(k) }} aria-pressed={look === k} style={{
                            minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                            background: look === k ? '#14183A' : '#fff', color: look === k ? '#fff' : '#14183A', border: '1.5px solid #14183A',
                        }}>{name}</button>
                    ))}
                    {!artUrl && (
                        <a href={`/wedding/${weddingId}/portal?view=look`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#2748E8', border: '1.5px dashed #2748E8', textDecoration: 'none' }}>עיצוב מהתמונה שלכם</a>
                    )}
                    <button type='button' onClick={() => window.print()} style={{
                        minHeight: 44, padding: '0 20px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 900,
                        background: '#2748E8', color: '#fff', border: 'none',
                    }}>הדפסה / שמירה כ־PDF</button>
                </div>
            </div>

            {w === null && <p className='wt-noprint' style={{ color: '#8A1F1F', fontSize: 15 }}>לא מצאנו את האירוע. נסו להיכנס שוב מהאזור האישי.</p>}

            <div className='wt-wrap' style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <PosterArt w={w} look={look} artUrl={artUrl} guestLink={guestLink} shortLink={shortLink} ready={Boolean(w)} />
            </div>
        </div>
    )
}
