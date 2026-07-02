'use client'

// /landing — the marketing landing page (app.weddingtales.co.il/landing).
//
// Premium redesign, spring 2026 v2: dark-ink editorial hero → warm champagne
// body. The heart of the page is the PORTFOLIO — three real customer books,
// each with a scroll-snap filmstrip of real spreads AND a lazy-mounted
// live embed of the actual digital book (?embed=1 — the same embed mode the
// couple portal iframe uses; the route sends no X-Frame-Options, verified).
//
// Portfolio tokens were minted with issuedBy:'landing-page' in each
// wedding's digitalTokensIssuedAt audit array — revoke there without
// touching the couples' own links:
//   wedding rOPkVWbwurT4UjKCR5hg (שקד ודור), birthday 6175 (ג'רי),
//   bar mitzvah 5483 (נועם).
//
// Static screenshots (public/imgs/portfolio/{slug}/) are captured from the
// production books — hand-curated, overflowing/blank pages excluded.
// Client-side only (no Firestore) so the page stays fast and unbreakable.

import { useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import BookPageTemplate from '@/components/BookPageTemplate/BookPageTemplate'
import BookCoverTemplate from '@/components/BookCoverTemplate/BookCoverTemplate'
import defaultStyle from '@/app/wedding/[weddingId]/viewer/defaultStyle'
import { resolvePreset, BUILTIN_PRESETS } from '@/lib/studioPresets'
import { normalizeBlessing } from '@/lib/normalizeText'
import { frankRuhl } from '@/app/fonts'
import {
    QrCode, PenLine, BookHeart, Sparkles, Camera, Check, ChevronLeft,
    ChevronRight, Star, ChevronDown, BookOpen, X, ExternalLink,
} from 'lucide-react'

const WA = 'https://wa.link/0sesxc'

// ─── The three real books ────────────────────────────────────────────
const PORTFOLIO = [
    {
        slug: 'wedding',
        badge: 'חתונה',
        title: 'שקד ודור',
        stats: '24 ברכות · 24 תמונות מהאורחים',
        weddingId: 'rOPkVWbwurT4UjKCR5hg',
        token: '529b8a86-ca5d-4944-8178-c75c0420095d',
        spreads: 5,
    },
    {
        slug: 'bar-mitzvah',
        badge: 'בר מצווה',
        title: 'נועם',
        stats: '45 ברכות · 45 תמונות מהאורחים',
        weddingId: '5483',
        token: '0b02382b-7d8e-40a8-804b-1c5bdd31c1ae',
        spreads: 5,
    },
    {
        slug: 'birthday',
        badge: 'יום הולדת 90',
        title: 'ג׳רי',
        stats: '31 ברכות · 31 תמונות · משפחה מכל העולם',
        weddingId: '6175',
        token: 'a319b00d-7ed2-48cf-b88b-d41a98f35e05',
        spreads: 3,
    },
]

const SAMPLE = [
    { id: 's1', name: 'דנה', text: 'סבא יקר, אין מילים לתאר כמה אנחנו אוהבים אותך. שתמיד תהיה בריא ושמח, ותמשיך להאיר לכולנו את הדרך.', imageUrl: '/imgs/img1.jpg' },
    { id: 's2', name: 'Yossi & Michal', text: 'Your stories and your smile light up every room. Here’s to many more years of laughter together — we love you!', imageUrl: '/imgs/img2.jpg' },
    { id: 's3', name: 'משפחת לוי', text: 'תודה על כל הארוחות, הצחוקים והחוכמה. אתם הלב הפועם של המשפחה שלנו, ואנחנו אסירי תודה על כל רגע.', imageUrl: '/imgs/img3.jpg' },
    { id: 's4', name: 'נועה', text: 'לאדם הכי טוב שאני מכירה — שתמשיך לרקוד, לשיר ולחבק חזק. אוהבת אותך עד הירח ובחזרה.', imageUrl: '/imgs/img4.jpg' },
    { id: 's5', name: 'Daniel', text: 'To the one who taught me everything about kindness and patience — so grateful for you, today and always.', imageUrl: '/imgs/img5.jpg' },
    { id: 's6', name: 'רוני וגיל', text: 'כל רגע איתכם הוא מתנה. שתהיה לכם שנה מלאה בבריאות, אושר ונחת מכל מי שאוהב אתכם.', imageUrl: '/imgs/img6.jpg' },
    { id: 's7', name: 'סבתא תקווה', text: 'ביחד כבר שנים רבות והלב עוד מלא. תודה על כל האהבה — אוהבת אתכם תמיד.', imageUrl: '/imgs/img7.jpg' },
    { id: 's8', name: 'אורי', text: 'פשוט תודה. על הכל. אתם הגיבורים שלי, היום ותמיד.', imageUrl: '/imgs/img8.jpg' },
]

const FAQ = [
    { q: 'מה בדיוק מקבלים?', a: 'ספר מודפס בכריכה קשה על נייר ארכיב, ספר דיגיטלי לדפדוף ולשיתוף, וגישה למערכת לניהול הברכות ובחירת העיצוב.' },
    { q: 'כמה זמן עד שהספר אצלכם?', a: 'כ־4 שבועות מאישור העיצוב הסופי. הספר הדיגיטלי מוכן מיד — עוד באותו ערב מדפדפים בברכות.' },
    { q: 'אפשר להוסיף ברכות אחרי האירוע?', a: 'כן. הקישור נשאר פעיל — מי שפספס מוסיף ברכה גם בימים שאחרי, עד שסוגרים את הספר להדפסה.' },
    { q: 'האורחים המבוגרים יסתדרו?', a: 'כן. סריקת ה־QR פותחת עמוד פשוט בדפדפן — בלי אפליקציה, בלי הרשמה. דווקא מהדור המבוגר מגיעות הברכות הכי מרגשות.' },
    { q: 'ואם לא כולם ישתתפו?', a: 'גם השתתפות חלקית עושה ספר מלא ומרגש. אנחנו עוזרים עם שילוט ותזכורות, ואפשר להשלים ברכות אחרי האירוע.' },
    { q: 'האירוע נדחה — מה עכשיו?', a: 'שום דבר לא הולך לאיבוד. הקישור והמערכת נשארים פעילים ופשוט מתואמים מחדש. לא משלמים פעמיים.' },
]

// Real spreads from the portfolio books, shown inside the pricing card.
// (No staged "printed book" photography exists in /public/imgs yet — when
// Bar shoots the physical books, swap these in and restore the original
// "וזה מה שמגיע אליכם הביתה" caption.)
const PRICING_SPREADS = [
    '/imgs/portfolio/wedding/spread-2.webp',
    '/imgs/portfolio/bar-mitzvah/spread-1.webp',
    '/imgs/portfolio/birthday/spread-2.webp',
]

// ─── Book showcase (filmstrip + live embed) ──────────────────────────
function BookShowcase({ book, index }) {
    const [live, setLive] = useState(false)
    const frames = useMemo(
        () => [`/imgs/portfolio/${book.slug}/cover.webp`, ...Array.from({ length: book.spreads }, (_, i) => `/imgs/portfolio/${book.slug}/spread-${i + 1}.webp`)],
        [book]
    )
    const fullHref = `/b/${book.token}`
    const embedSrc = `/wedding/${book.weddingId}/book/${book.token}?embed=1`

    return (
        <article style={{ marginBottom: index === PORTFOLIO.length - 1 ? 0 : 64 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '0 4px', marginBottom: 14 }}>
                <span style={{ background: '#1a1410', color: '#e9d8ab', fontSize: 12, fontWeight: 800, padding: '5px 13px', borderRadius: 999, letterSpacing: '0.06em' }}>{book.badge}</span>
                <h3 className={frankRuhl.className} style={{ fontSize: 30, fontWeight: 800, color: '#1a1410', margin: 0, lineHeight: 1 }}>{book.title}</h3>
                <span style={{ fontSize: 13.5, color: '#8a744d', fontWeight: 600 }}>{book.stats}</span>
            </div>

            {/* Filmstrip — real spreads, scroll-snap */}
            <div className='filmstrip' style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '6px 4px 16px', scrollSnapType: 'x mandatory' }}>
                {frames.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={src}
                        src={src}
                        alt={i === 0 ? `הכריכה של ${book.title}` : `כפולה מתוך הספר של ${book.title}`}
                        loading='lazy'
                        className='frame'
                        style={{
                            height: 240,
                            width: 'auto',
                            borderRadius: 10,
                            flexShrink: 0,
                            scrollSnapAlign: 'center',
                            boxShadow: '0 18px 40px -18px rgba(80,60,30,0.55), 0 0 0 1px rgba(180,148,90,0.28)',
                            background: '#fff',
                        }}
                    />
                ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 4px' }}>
                <button onClick={() => setLive(v => !v)} style={{ ...inkBtn, flexGrow: 1, maxWidth: 340 }}>
                    {live ? <><X size={16} /> סגירת הספר</> : <><BookOpen size={16} /> דפדפו בספר החי — כאן</>}
                </button>
                <a href={fullHref} target='_blank' rel='noopener noreferrer' style={{ ...ghostGoldBtn, flexGrow: 1, maxWidth: 260 }}>
                    <ExternalLink size={15} /> פתיחה במסך מלא
                </a>
            </div>

            {/* Live embed — the ACTUAL digital book, mounted only on demand */}
            {live && (
                <div style={{ marginTop: 14, borderRadius: 16, overflow: 'hidden', border: '1px solid #d9c48e', boxShadow: '0 26px 60px -26px rgba(80,60,30,0.5)', background: '#14100c' }}>
                    <iframe
                        src={embedSrc}
                        title={`ספר הברכות של ${book.title}`}
                        style={{ display: 'block', width: '100%', height: 'min(78vh, 640px)', border: 'none' }}
                        loading='lazy'
                        allowFullScreen
                    />
                </div>
            )}
        </article>
    )
}

export default function LandingPage() {
    const styleSettings = useMemo(() => {
        const preset = BUILTIN_PRESETS.find(p => /פרחי גן|פסטורלי|שמפניה/.test(p.name)) || BUILTIN_PRESETS[0]
        const rp = preset ? resolvePreset(preset).values : {}
        return { ...defaultStyle, ...rp, locale: 'he' }
    }, [])
    const coverStyle = useMemo(() => ({
        ...styleSettings,
        coverImage: '/imgs/Cover%20img.jpg',
        coverTitle: 'ספר הברכות',
        coverSubtitle: 'הרגעים היפים שלכם — לתמיד',
        coverTextPosition: 'bc',
        coverTextBg: 'rgba(0,0,0,0.30)',
        coverTextColor: '#ffffff',
    }), [styleSettings])
    const sampleWedding = { eventType: 'birthday', customTitle: 'ספר הברכות', locale: 'he' }

    const [extra, setExtra] = useState([])
    const pages = useMemo(() => [...SAMPLE, ...extra], [extra])

    const wrapRef = useRef(null)
    const [size, setSize] = useState(320)
    useEffect(() => {
        const measure = () => {
            const w = wrapRef.current?.clientWidth || 340
            setSize(Math.max(240, Math.min(400, Math.floor(w))))
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    const flipRef = useRef(null)
    const flip = dir => {
        try {
            const pf = flipRef.current?.pageFlip?.()
            if (!pf) return
            dir === 'next' ? pf.flipNext() : pf.flipPrev()
        } catch { /* ignore */ }
    }

    const [form, setForm] = useState({ name: '', text: '' })
    const [photo, setPhoto] = useState(null)
    const [added, setAdded] = useState(false)
    const fileRef = useRef(null)
    const onPickPhoto = e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        if (photo?.url) URL.revokeObjectURL(photo.url)
        setPhoto({ url: URL.createObjectURL(f) })
    }
    const addBlessing = () => {
        const text = normalizeBlessing(form.text)
        if (!text && !photo) return
        const entry = { id: `u${Date.now()}`, name: form.name.trim() || 'אורח/ת', text, imageUrl: photo?.url || null }
        const nextIndex = pages.length + 1
        setExtra(prev => [...prev, entry])
        setForm({ name: '', text: '' })
        setPhoto(null)
        setAdded(true)
        setTimeout(() => setAdded(false), 3000)
        setTimeout(() => { try { flipRef.current?.pageFlip?.()?.flip(nextIndex) } catch { /* ignore */ } }, 260)
    }

    const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    return (
        <div dir='rtl' style={{ minHeight: '100vh', background: '#f6efe0', fontFamily: 'system-ui,-apple-system,"Segoe UI",sans-serif', color: '#3d2e1a', overflowX: 'hidden' }}>

            {/* ═══════════ HERO — dark ink, gold serif, real covers ═══════════ */}
            <header style={{ position: 'relative', background: 'radial-gradient(120% 90% at 50% -10%, #2c2114 0%, #1a1208 55%, #100b06 100%)', color: '#f5ead2', padding: '54px 20px 74px', textAlign: 'center', overflow: 'hidden' }}>
                {/* faint gold grain ornament */}
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 40% at 50% 0%, rgba(211,180,106,0.14), transparent 70%)', pointerEvents: 'none' }} />

                <div className='reveal' style={{ animationDelay: '0ms' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src='/logo-wt.png' alt='Wedding Tales' style={{ height: 40, margin: '0 auto 26px', filter: 'brightness(1.6)', opacity: 0.95 }} />
                </div>

                <h1 className={`${frankRuhl.className} reveal`} style={{ fontSize: 'clamp(34px, 7.4vw, 58px)', fontWeight: 800, lineHeight: 1.18, margin: '0 auto', maxWidth: 700, animationDelay: '90ms' }}>
                    כל האורחים מברכים.
                    <br />
                    <span style={{ color: '#d3b46a' }}>אתם מקבלים ספר.</span>
                </h1>

                <p className='reveal' style={{ fontSize: 'clamp(15px, 2.6vw, 18px)', color: 'rgba(245,234,210,0.78)', lineHeight: 1.75, margin: '18px auto 0', maxWidth: 520, animationDelay: '180ms' }}>
                    האורחים סורקים QR, מעלים תמונה וכותבים מהלב — בזמן האירוע.
                    <br />
                    אתם מקבלים ספר מודפס בכריכה קשה, וספר דיגיטלי שחי לנצח.
                </p>

                {/* Fan of the three REAL covers */}
                <div className='coverFan reveal' aria-hidden style={{ position: 'relative', height: 'clamp(230px, 40vw, 300px)', margin: '38px auto 0', maxWidth: 560, animationDelay: '280ms' }}>
                    {PORTFOLIO.map((b, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            key={b.slug}
                            src={`/imgs/portfolio/${b.slug}/cover.webp`}
                            alt=''
                            onClick={() => scrollTo('portfolio')}
                            className={`fan fan${i}`}
                            style={{
                                position: 'absolute',
                                insetInlineStart: `${[2, 27, 52][i]}%`,
                                top: [22, 0, 22][i],
                                width: 'clamp(170px, 32vw, 230px)',
                                aspectRatio: '1',
                                objectFit: 'cover',
                                borderRadius: 8,
                                cursor: 'pointer',
                                transform: `rotate(${[-6.5, 0, 6.5][i]}deg)`,
                                zIndex: i === 1 ? 2 : 1,
                                boxShadow: '0 34px 70px -22px rgba(0,0,0,0.75), 0 0 0 1px rgba(211,180,106,0.4)',
                            }}
                        />
                    ))}
                </div>

                <div className='reveal' style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 36, maxWidth: 380, marginInline: 'auto', animationDelay: '380ms' }}>
                    <button onClick={() => scrollTo('portfolio')} style={{ ...goldBtn, fontSize: 16.5 }}>
                        <BookOpen size={18} /> דפדפו בספרים אמיתיים של לקוחות
                    </button>
                    <a href={WA} target='_blank' rel='noopener noreferrer' style={heroGhostBtn}>
                        <WaIcon /> דברו איתנו בוואטסאפ
                    </a>
                </div>
                <p className='reveal' style={{ fontSize: 12.5, color: 'rgba(245,234,210,0.5)', marginTop: 22, fontWeight: 600, letterSpacing: '0.05em', animationDelay: '460ms' }}>
                    חתונות · בר/בת מצווה · ימי הולדת
                </p>
            </header>

            <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 18px 60px' }}>

                {/* ═══════════ HOW IT WORKS — one quiet strip ═══════════ */}
                <section style={{ padding: '46px 4px 40px' }}>
                    <div className='steps' style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 22 }}>
                        {[
                            { icon: QrCode, n: 'א', t: 'סורקים', d: 'קוד QR על השולחן פותח עמוד אישי. בלי אפליקציה, בלי הרשמה.' },
                            { icon: PenLine, n: 'ב', t: 'מברכים', d: 'תמונה מהטלפון וכמה מילים מהלב — לוקח דקה, נשאר לתמיד.' },
                            { icon: BookHeart, n: 'ג', t: 'מקבלים ספר', d: 'דיגיטלי עוד באותו ערב. מודפס בכריכה קשה — אצלכם בבית.' },
                        ].map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                <div className={frankRuhl.className} style={{ flexShrink: 0, width: 52, height: 52, borderRadius: '50%', border: '1.5px solid #c9a44e', color: '#a8843a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, background: '#fdf8ec' }}>{s.n}</div>
                                <div>
                                    <div className={frankRuhl.className} style={{ fontWeight: 800, fontSize: 20, color: '#1a1410' }}>{s.t}</div>
                                    <div style={{ fontSize: 14.5, color: '#6b5836', lineHeight: 1.65, marginTop: 3, maxWidth: 380 }}>{s.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══════════ PORTFOLIO — the heart of the page ═══════════ */}
                <section id='portfolio' style={{ scrollMarginTop: 12, borderTop: '1px solid #e5d6b4', paddingTop: 44 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 800, color: '#a8843a', letterSpacing: '0.16em', margin: '0 0 10px' }}>עבודות אמיתיות</p>
                    <h2 className={frankRuhl.className} style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 800, color: '#1a1410', margin: 0, lineHeight: 1.25 }}>
                        שלושה ספרים של לקוחות.
                        <br />
                        פתוחים. דפדפו.
                    </h2>
                    <p style={{ fontSize: 15, color: '#6b5836', lineHeight: 1.7, margin: '12px 0 36px', maxWidth: 560 }}>
                        לא הדמיות ולא דוגמאות סטודיו — הברכות והתמונות שהאורחים באמת העלו.
                        אפשר לדפדף כאן בעמוד, או לפתוח את הספר המלא.
                    </p>

                    {PORTFOLIO.map((b, i) => <BookShowcase key={b.slug} book={b} index={i} />)}
                </section>

                {/* ═══════════ TRY IT — live demo ═══════════ */}
                <section id='demo' style={{ scrollMarginTop: 12, borderTop: '1px solid #e5d6b4', marginTop: 54, paddingTop: 44 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 800, color: '#a8843a', letterSpacing: '0.16em', margin: '0 0 10px' }}>נסו בעצמכם</p>
                    <h2 className={frankRuhl.className} style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: 800, color: '#1a1410', margin: 0 }}>ככה זה מרגיש לאורחים</h2>
                    <p style={{ fontSize: 14.5, color: '#6b5836', margin: '10px 0 22px', maxWidth: 480, lineHeight: 1.65 }}>כתבו ברכה, צרפו תמונה — ותראו אותה נכנסת לספר. (הדגמה בלבד, שום דבר לא נשמר.)</p>

                    <div className='demoGrid' style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 26, alignItems: 'start' }}>
                        <div>
                            <div ref={wrapRef} style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                                <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', boxShadow: '0 26px 60px -24px rgba(80,60,30,0.6), 0 0 0 1px rgba(180,148,90,0.3)' }}>
                                    <HTMLFlipBook
                                        key={`flip-${pages.length}-${size}`}
                                        ref={flipRef}
                                        width={size}
                                        height={size}
                                        size='fixed'
                                        usePortrait
                                        showCover
                                        mobileScrollSupport
                                        drawShadow
                                        maxShadowOpacity={0.3}
                                        useMouseEvents
                                        flippingTime={700}
                                        className='landing-flip'
                                    >
                                        <div style={{ width: size, height: size, background: '#fff' }}>
                                            <BookCoverTemplate wedding={sampleWedding} styleSettings={coverStyle} scaledWidth={size} scaledHeight={size} />
                                        </div>
                                        {pages.map(entry => (
                                            <div key={entry.id} style={{ width: size, height: size, background: '#fff' }}>
                                                <BookPageTemplate entry={entry} styleSettings={styleSettings} scaledWidth={size} scaledHeight={size} />
                                            </div>
                                        ))}
                                    </HTMLFlipBook>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                                <button onClick={() => flip('prev')} aria-label='הקודם' style={navBtn}><ChevronRight size={20} /></button>
                                <button onClick={() => flip('next')} aria-label='הבא' style={navBtn}><ChevronLeft size={20} /></button>
                            </div>
                        </div>

                        <div>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='השם שלכם' maxLength={40} style={field} />
                            <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value.slice(0, 300) }))} placeholder='כתבו ברכה מכל הלב…' rows={4} style={{ ...field, resize: 'vertical', lineHeight: 1.6, marginTop: 10 }} />
                            <input ref={fileRef} type='file' accept='image/*' onChange={onPickPhoto} style={{ display: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                                <button onClick={() => fileRef.current?.click()} style={ghostBtn}><Camera size={16} /> {photo ? 'החלפת תמונה' : 'הוספת תמונה'}</button>
                                {photo && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={photo.url} alt='' style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'cover', border: '1px solid #d9c48e' }} />
                                )}
                            </div>
                            <button onClick={addBlessing} style={{ ...inkBtn, width: '100%', marginTop: 14 }}>
                                {added ? <><Check size={17} /> נוספה לספר! דפדפו</> : <><Sparkles size={17} /> הוסיפו לספר</>}
                            </button>
                        </div>
                    </div>
                </section>

                {/* ═══════════ PRICING — dark card, printed proof ═══════════ */}
                <section id='pricing' style={{ scrollMarginTop: 12, marginTop: 60 }}>
                    <div style={{ background: 'radial-gradient(130% 120% at 50% 0%, #2c2114 0%, #16100a 70%)', borderRadius: 24, padding: 'clamp(26px, 5vw, 44px)', color: '#f5ead2', boxShadow: '0 34px 80px -30px rgba(40,28,12,0.7)' }}>
                        <div className='priceGrid' style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 30, alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: 12.5, fontWeight: 800, color: '#d3b46a', letterSpacing: '0.16em', margin: '0 0 12px' }}>מחיר אחד. הכול כלול.</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <span className={frankRuhl.className} style={{ fontSize: 'clamp(48px, 9vw, 64px)', fontWeight: 800, lineHeight: 1 }}>1,290</span>
                                    <span style={{ fontSize: 26, fontWeight: 700, color: '#d3b46a' }}>₪</span>
                                </div>
                                <div style={{ marginTop: 20 }}>
                                    {[
                                        'ספר מודפס בכריכה קשה, נייר ארכיב',
                                        'ספר דיגיטלי לשיתוף — מוכן עוד באותו ערב',
                                        'עיצוב אישי עם השם והתמונה של החוגגים',
                                        'מערכת ניהול ברכות ובחירת עיצוב',
                                    ].map((t, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', fontSize: 15, color: 'rgba(245,234,210,0.88)' }}>
                                            <Check size={16} color='#d3b46a' style={{ flexShrink: 0 }} /> {t}
                                        </div>
                                    ))}
                                </div>
                                <a href={WA} target='_blank' rel='noopener noreferrer' style={{ ...goldBtn, maxWidth: 360, marginTop: 22, textDecoration: 'none' }}>
                                    <WaIcon /> אני רוצה ספר כזה — דברו איתי
                                </a>
                            </div>
                            <div>
                                <p style={{ fontSize: 13, color: 'rgba(245,234,210,0.6)', margin: '0 0 10px', fontWeight: 600 }}>עמודים אמיתיים מתוך ספרי לקוחות:</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {PRICING_SPREADS.map((src, i) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={i} src={src} alt='כפולה מתוך ספר ברכות אמיתי' loading='lazy' style={{ width: '100%', borderRadius: 12, boxShadow: '0 16px 34px -14px rgba(0,0,0,0.6)', border: '1px solid rgba(211,180,106,0.35)' }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══════════ TESTIMONIAL ═══════════ */}
                <section style={{ textAlign: 'center', padding: '52px 8px 8px', maxWidth: 620, marginInline: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 12 }}>
                        {[0, 1, 2, 3, 4].map(i => <Star key={i} size={16} fill='#c9a44e' color='#c9a44e' />)}
                    </div>
                    <p className={frankRuhl.className} style={{ fontSize: 'clamp(18px, 3.4vw, 22px)', fontWeight: 600, color: '#3d2e1a', lineHeight: 1.75, fontStyle: 'italic', margin: 0 }}>
                        ”לא תיארנו כמה פספסנו עד שראינו את הספר. בכינו, צחקנו, והרגשנו כאילו חזרנו לחתונה שוב.“
                    </p>
                    <p style={{ fontSize: 13, color: '#8a744d', marginTop: 12, fontWeight: 700 }}>
                        שקד · התחתנה במרץ 2026 · <a href={`/b/${PORTFOLIO[0].token}`} target='_blank' rel='noopener noreferrer' style={{ color: '#a8843a' }}>הספר שלה למעלה</a>
                    </p>
                </section>

                {/* ═══════════ FAQ ═══════════ */}
                <section style={{ borderTop: '1px solid #e5d6b4', marginTop: 44, paddingTop: 38, maxWidth: 640, marginInline: 'auto' }}>
                    <h2 className={frankRuhl.className} style={{ fontSize: 26, fontWeight: 800, color: '#1a1410', margin: '0 0 8px', textAlign: 'center' }}>שאלות ששואלים אותנו</h2>
                    {FAQ.map((f, i) => (
                        <details key={i} style={{ borderBottom: '1px solid #e9dcbc', padding: '2px 4px' }}>
                            <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '15px 2px', fontSize: 15.5, fontWeight: 700, color: '#1a1410' }}>
                                {f.q}
                                <ChevronDown size={18} color='#a8843a' style={{ flexShrink: 0 }} />
                            </summary>
                            <p style={{ fontSize: 14, color: '#6b5836', lineHeight: 1.75, padding: '0 2px 16px', margin: 0 }}>{f.a}</p>
                        </details>
                    ))}
                </section>

                {/* ═══════════ FINAL CTA ═══════════ */}
                <section style={{ textAlign: 'center', paddingTop: 52 }}>
                    <h2 className={frankRuhl.className} style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, color: '#1a1410', margin: 0 }}>רוצים ספר כזה מהאירוע שלכם?</h2>
                    <p style={{ fontSize: 15, color: '#6b5836', lineHeight: 1.7, margin: '10px auto 0', maxWidth: 420 }}>
                        ספרו לנו על האירוע ונחזור אליכם עם כל הפרטים. בלי לחץ, בלי ספאם.
                    </p>
                    <a href={WA} target='_blank' rel='noopener noreferrer' style={{ ...waBtn, maxWidth: 400, marginInline: 'auto', marginTop: 20, fontSize: 16.5 }}>
                        <WaIcon /> דברו איתנו בוואטסאפ
                    </a>
                    <p style={{ fontSize: 12, color: '#9a8763', marginTop: 18 }}>© {new Date().getFullYear()} Wedding Tales · מזכרת לכל החיים</p>
                </section>
            </div>

            <style jsx global>{`
                .landing-flip { margin: 0 auto; }
                details > summary::-webkit-details-marker { display: none; }

                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(18px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .reveal { opacity: 0; animation: fadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards; }

                .fan { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
                .fan:hover { transform: rotate(0deg) scale(1.05) !important; z-index: 3 !important; }

                .frame { transition: transform 0.28s ease, box-shadow 0.28s ease; }
                .frame:hover { transform: translateY(-6px); box-shadow: 0 30px 56px -20px rgba(80,60,30,0.6), 0 0 0 1px rgba(180,148,90,0.4); }

                .filmstrip { scrollbar-width: thin; scrollbar-color: #c9a44e transparent; }
                .filmstrip::-webkit-scrollbar { height: 6px; }
                .filmstrip::-webkit-scrollbar-thumb { background: #d9c48e; border-radius: 3px; }
                .filmstrip::-webkit-scrollbar-track { background: transparent; }

                @media (min-width: 700px) {
                    .steps { grid-template-columns: repeat(3, 1fr) !important; }
                    .demoGrid { grid-template-columns: 1fr 1fr !important; }
                    .priceGrid { grid-template-columns: 1.1fr 1fr !important; }
                    .filmstrip .frame { height: 300px !important; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .reveal { animation: none; opacity: 1; }
                    .fan, .frame { transition: none; }
                }
            `}</style>
        </div>
    )
}

function WaIcon() {
    return (
        <svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor' aria-hidden='true'>
            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24.044 12.045.044 5.463.044.105 5.402.103 11.985c0 2.096.547 4.142 1.588 5.945L0 24l6.304-1.654a11.9 11.9 0 0 0 5.71 1.453h.005c6.582 0 11.94-5.358 11.942-11.94 0-3.193-1.24-6.19-3.44-8.418' />
        </svg>
    )
}

// ─── Buttons & fields ────────────────────────────────────────────────
const goldBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%',
    background: 'linear-gradient(180deg,#e2c377,#b8893d)', color: '#1a1208', fontWeight: 800, fontSize: 16,
    borderRadius: 14, padding: '15px 18px', border: 'none', cursor: 'pointer',
    boxShadow: '0 18px 40px -14px rgba(211,180,106,0.45)',
}
const heroGhostBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%',
    padding: '13px 18px', borderRadius: 14, textDecoration: 'none', color: '#f5ead2', fontSize: 15.5, fontWeight: 700,
    background: 'rgba(245,234,210,0.07)', border: '1px solid rgba(245,234,210,0.28)',
}
const inkBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: '#1a1410', color: '#f0e2bd', fontWeight: 800, fontSize: 15,
    borderRadius: 12, padding: '13px 20px', border: 'none', cursor: 'pointer',
    boxShadow: '0 14px 30px -14px rgba(26,20,16,0.55)',
}
const ghostGoldBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none',
    background: 'transparent', color: '#8a6d33', fontWeight: 700, fontSize: 14.5,
    borderRadius: 12, padding: '13px 18px', border: '1.5px solid #c9a44e', cursor: 'pointer',
}
const waBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
    padding: '14px 18px', borderRadius: 14, textDecoration: 'none', color: '#fff', fontSize: 16, fontWeight: 800,
    background: 'linear-gradient(180deg,#25D366,#128C7E)', boxShadow: '0 14px 30px -12px rgba(18,140,126,0.5)',
}
const navBtn = {
    width: 44, height: 44, borderRadius: 12, border: '1px solid #d9c48e', background: '#fdf8ec',
    color: '#a8843a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
const field = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d9c48e', borderRadius: 12,
    padding: '12px 14px', fontSize: 15, color: '#4a3f2c', background: '#fffdf7', outline: 'none',
}
const ghostBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 7, background: '#f1e7cf', color: '#6b5836',
    border: '1px solid #d9c48e', fontWeight: 600, fontSize: 13.5, borderRadius: 11, padding: '10px 16px', cursor: 'pointer', flexShrink: 0,
}
